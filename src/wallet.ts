import { transact, type Web3MobileWallet } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import { APP_IDENTITY, CLUSTERS, MEMO_PROGRAM_ID, PINNED_KID, TX_SIGNATURE_RE, type Cluster } from "./config";
import type { StoredWallet } from "./store";

/** fetch with a hard timeout, so a stalled request fails fast and can be retried. */
function timedFetch(ms: number) {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return fetch(input as RequestInfo, { ...(init ?? {}), signal: ctrl.signal }).finally(() => clearTimeout(timer));
  };
}

const connections = new Map<Cluster, Connection>();
export function connectionFor(cluster: Cluster): Connection {
  let c = connections.get(cluster);
  if (!c) {
    // HTTP only: no websocket subscriptions, so nothing hangs while the app is behind the wallet.
    c = new Connection(CLUSTERS[cluster].rpc, { commitment: "confirmed", fetch: timedFetch(12_000), disableRetryOnRateLimit: false });
    connections.set(cluster, c);
  }
  return c;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retries a network call with backoff. Gives up with the last error. */
export async function withRetry<T>(fn: () => Promise<T>, tries = 4, base = 400): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < tries - 1) await sleep(base * 2 ** i);
    }
  }
  throw last;
}

export interface Fresh {
  blockhash: string;
  lastValidBlockHeight: number;
  slot: number; // context slot of the blockhash, passed to the wallet as minContextSlot
  at: number;
}

/** Latest blockhash with retries. Called while the app is in front, before the wallet opens. */
export async function freshBlockhash(cluster: Cluster): Promise<Fresh> {
  const c = connectionFor(cluster);
  const r = await withRetry(() => c.getLatestBlockhashAndContext("confirmed"));
  return { blockhash: r.value.blockhash, lastValidBlockHeight: r.value.lastValidBlockHeight, slot: r.context.slot, at: Date.now() };
}

/** Plain-language reason for a wallet or network failure. */
export function friendlyWalletError(e: unknown): string {
  const m = (e as Error)?.message ?? String(e);
  if (/network request failed|failed to fetch|timed out|aborted|timeout/i.test(m)) {
    return "The phone could not reach the Solana network. Check the connection and try again.";
  }
  if (/declined|rejected|cancel/i.test(m)) return "The wallet request was declined, so no receipt was made.";
  if (/blockhash not found|block height exceeded|expired|simulation failed/i.test(m)) {
    return "The approval took too long, so the network dropped the receipt. Nothing was charged. Tap Anchor again and approve within a minute.";
  }
  if (/insufficient|0x1|debit an account/i.test(m)) return "The wallet needs a little SOL for the network fee.";
  return m.slice(0, 200);
}

function toBase58(base64Address: string): string {
  return new PublicKey(Buffer.from(base64Address, "base64")).toBase58();
}

async function authorizeSession(wallet: Web3MobileWallet, existing: StoredWallet | null, cluster: Cluster) {
  // An auth token is bound to a chain: only reuse it for the same cluster.
  if (existing?.authToken && (existing.cluster ?? "devnet") === cluster) {
    try {
      const auth = await wallet.reauthorize({ auth_token: existing.authToken, identity: APP_IDENTITY });
      return auth;
    } catch {
      // token expired or revoked: fall through to a fresh authorize
    }
  }
  return wallet.authorize({ chain: CLUSTERS[cluster].chain, identity: APP_IDENTITY });
}

/** Mobile Wallet Adapter: connect to the wallet on the device (Seed Vault on Seeker). */
export async function connectWallet(existing: StoredWallet | null, cluster: Cluster): Promise<StoredWallet> {
  return transact(async (wallet) => {
    const auth = await authorizeSession(wallet, existing, cluster);
    const acct = auth.accounts[0];
    if (!acct) throw new Error("The wallet returned no account");
    return { address: toBase58(acct.address), authToken: auth.auth_token, label: acct.label?.slice(0, 64), cluster };
  });
}

export async function disconnectWallet(existing: StoredWallet | null): Promise<void> {
  if (!existing) return;
  try {
    await transact(async (wallet) => {
      await wallet.deauthorize({ auth_token: existing.authToken });
    });
  } catch {
    // best effort
  }
}

export async function balanceSol(address: string, cluster: Cluster): Promise<number> {
  const lamports = await connectionFor(cluster).getBalance(new PublicKey(address));
  return lamports / LAMPORTS_PER_SOL;
}

/** Devnet faucet. Often rate limited; the UI then points to faucet.solana.com. */
export async function requestDevnetAirdrop(address: string): Promise<string> {
  const connection = connectionFor("devnet");
  const sig = await connection.requestAirdrop(new PublicKey(address), 0.5 * LAMPORTS_PER_SOL);
  const bh = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
  return sig;
}

const MEMO_FIELD_RE = { marketId: /^\d{1,12}$/, riskLevel: /^(ok|watch|caution|resolved)$/, packHash: /^[0-9a-f]{64}$/ };

export function memoText(p: { action: "watch" | "acknowledge"; marketId: string; riskLevel: string; packHash: string }): string {
  if (!MEMO_FIELD_RE.marketId.test(p.marketId) || !MEMO_FIELD_RE.riskLevel.test(p.riskLevel) || !MEMO_FIELD_RE.packHash.test(p.packHash)) {
    throw new Error("Refusing to anchor: unexpected memo fields");
  }
  return `predge-settle-watch v1 ${p.action} market=${p.marketId} risk=${p.riskLevel} pack=sha256:${p.packHash} kid=${PINNED_KID}`;
}

export interface PendingReceipt {
  key: string; // watchlist key
  marketId: string;
  riskLevel: string;
  packHash: string;
  action: "watch" | "acknowledge";
  cluster: Cluster;
  startedAt: string;
  signature?: string; // set the moment the wallet returns it
}

/**
 * Anchors the hash of a verified evidence pack in a Solana memo transaction,
 * signed and sent by the wallet through Mobile Wallet Adapter. The user ends up
 * holding a public, timestamped receipt of exactly which signed record they acted on.
 *
 * Android can block the app's network while a wallet is in front, so no network call is made inside
 * a wallet session: connect first, then fetch the blockhash with retries, then open the wallet to sign.
 * `onSigned` runs the moment the wallet returns a signature, so the caller can persist it.
 */
export async function anchorPack(
  stored: StoredWallet,
  p: { action: "watch" | "acknowledge"; marketId: string; riskLevel: string; packHash: string },
  cluster: Cluster,
  onSigned?: (signature: string) => Promise<void> | void
): Promise<{ signature: string; wallet: StoredWallet; confirmed: boolean }> {
  const memo = memoText(p);
  const connection = connectionFor(cluster);
  // The blockhash is fetched BEFORE the wallet opens, while the app is in front, with retries.
  // Nothing in the wallet session touches the network: Android can stall the app while a wallet is in front.
  const fresh = await freshBlockhash(cluster);
  const signed = await transact(async (wallet) => {
    const auth = await authorizeSession(wallet, stored, cluster);
    const payer = new PublicKey(Buffer.from(auth.accounts[0].address, "base64"));
    const tx = new Transaction({ feePayer: payer, blockhash: fresh.blockhash, lastValidBlockHeight: fresh.lastValidBlockHeight }).add(
      new TransactionInstruction({
        programId: new PublicKey(MEMO_PROGRAM_ID),
        keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
        data: Buffer.from(memo, "utf8"),
      })
    );
    const next: StoredWallet = { address: payer.toBase58(), authToken: auth.auth_token, label: auth.accounts[0].label?.slice(0, 64), cluster };
    // Preferred: the wallet only signs and the app sends the transaction itself. Android can freeze a
    // wallet that is no longer in front before it has broadcast, so sending ourselves is more reliable.
    try {
      const [st] = await wallet.signTransactions({ transactions: [tx] });
      return { kind: "signed" as const, raw: st.serialize(), wallet: next };
    } catch (e) {
      if (/declined|rejected|cancel/i.test((e as Error).message ?? "")) throw e;
      const [signature] = await wallet.signAndSendTransactions({ transactions: [tx], minContextSlot: fresh.slot });
      return { kind: "sent" as const, signature, wallet: next };
    }
  });
  let signature: string;
  if (signed.kind === "signed") {
    // skipPreflight: the public devnet RPC is load balanced and a lagging node can wrongly say "Blockhash not found".
    signature = await withRetry(() => connection.sendRawTransaction(signed.raw, { skipPreflight: true, maxRetries: 5 }), 4, 500);
  } else {
    signature = signed.signature;
  }
  if (typeof signature !== "string" || !TX_SIGNATURE_RE.test(signature)) throw new Error("The wallet returned no valid signature");
  try {
    await onSigned?.(signature);
  } catch {
    // persistence is best effort
  }
  const confirmed = await confirmByPolling(connection, signature, 30_000);
  if (!confirmed) {
    // Not seen on chain. If the blockhash has expired the transaction can never land, so say so instead of showing a receipt.
    try {
      const h = await connection.getBlockHeight("confirmed");
      if (h > fresh.lastValidBlockHeight) throw new Error("block height exceeded");
    } catch (e) {
      if ((e as Error).message.includes("block height exceeded")) throw e;
    }
  }
  return { signature, wallet: signed.wallet, confirmed };
}

/** Polls getSignatureStatuses over HTTP. The wallet already sent the transaction, so this is best effort. */
export async function confirmByPolling(connection: Connection, signature: string, ms = 45_000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const st = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
      if (st?.err) throw new Error("The network rejected the receipt transaction");
      if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return true;
    } catch (e) {
      if ((e as Error).message.includes("rejected")) throw e;
    }
    await sleep(1500);
  }
  return false;
}
