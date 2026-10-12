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
  if (/not landed|blockhash not found|block height exceeded|expired|simulation failed/i.test(m)) {
    return "The network did not take the receipt in time, so it was dropped. Nothing was charged. Tap Anchor to try again.";
  }
  if (/not confirmed/i.test(m)) {
    return "The receipt was sent but the network has not confirmed it yet. Nothing is shown until it is on chain. Check again in a minute.";
  }
  if (/in CLOSED|session.*clos|websocket/i.test(m)) return "The wallet closed the connection before it answered. Try again.";
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
  rawTx?: string; // base64 of the signed transaction, so an interrupted receipt can be sent again
  lastValidBlockHeight?: number; // after this block height the transaction can never land
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(bytes: Uint8Array): string {
  const digits = [0];
  for (const b of bytes) {
    let carry = b;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "";
  for (const b of bytes) {
    if (b !== 0) break;
    out += "1";
  }
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
  return out;
}

export type LandResult = "confirmed" | "expired" | "unknown";

/**
 * Sends a signed transaction and keeps re-sending it every 2 s until the network confirms it or its
 * blockhash expires. A single send can be dropped by a load-balanced public RPC, which used to leave
 * receipts that never reached the chain.
 */
export async function landTransaction(
  connection: Connection,
  raw: Uint8Array,
  signature: string,
  lastValidBlockHeight: number,
  maxMs = 90_000
): Promise<LandResult> {
  const end = Date.now() + maxMs;
  let lastSend = 0;
  let lastHeightCheck = 0;
  while (Date.now() < end) {
    if (Date.now() - lastSend > 2000) {
      lastSend = Date.now();
      // skipPreflight: a lagging node of the public devnet RPC can wrongly say "Blockhash not found".
      connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }).catch(() => undefined);
    }
    try {
      const st = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
      if (st?.err) throw new Error("The network rejected the receipt transaction");
      if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return "confirmed";
    } catch (e) {
      if ((e as Error).message.includes("rejected")) throw e;
    }
    if (Date.now() - lastHeightCheck > 5000) {
      lastHeightCheck = Date.now();
      try {
        const h = await connection.getBlockHeight("confirmed");
        if (h > lastValidBlockHeight) {
          // One last look: it may have landed in the final blocks.
          const st = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
          return st && !st.err && st.confirmationStatus ? "confirmed" : "expired";
        }
      } catch {
        // keep trying
      }
    }
    await sleep(1200);
  }
  return "unknown";
}

/**
 * Anchors the hash of a verified evidence pack in a Solana memo transaction, signed by the wallet
 * through Mobile Wallet Adapter. The user ends up holding a public, timestamped receipt of exactly
 * which signed record they acted on.
 *
 * Android can block the app's network while a wallet is in front, so no network call is made inside
 * a wallet session: fetch the blockhash first, then open the wallet to sign, then send from the app.
 * `onSigned` runs the moment the wallet returns a signed transaction, so the caller can persist it.
 * Resolves only once the receipt is confirmed on chain; throws if it can no longer land.
 */
export async function anchorPack(
  stored: StoredWallet,
  p: { action: "watch" | "acknowledge"; marketId: string; riskLevel: string; packHash: string },
  cluster: Cluster,
  onSigned?: (s: { signature: string; rawTx?: string; lastValidBlockHeight: number }) => Promise<void> | void
): Promise<{ signature: string; wallet: StoredWallet }> {
  const memo = memoText(p);
  const connection = connectionFor(cluster);
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
      return { kind: "signed" as const, raw: st.serialize(), sig: st.signature, wallet: next };
    } catch (e) {
      if (/declined|rejected|cancel/i.test((e as Error).message ?? "")) throw e;
      const [signature] = await wallet.signAndSendTransactions({ transactions: [tx], minContextSlot: fresh.slot });
      return { kind: "sent" as const, signature, wallet: next };
    }
  });
  let signature: string;
  let raw: Uint8Array | null = null;
  if (signed.kind === "signed") {
    if (!signed.sig) throw new Error("The wallet returned no valid signature");
    signature = base58(signed.sig);
    raw = signed.raw;
  } else {
    signature = signed.signature;
  }
  if (typeof signature !== "string" || !TX_SIGNATURE_RE.test(signature)) throw new Error("The wallet returned no valid signature");
  try {
    await onSigned?.({ signature, rawTx: raw ? Buffer.from(raw).toString("base64") : undefined, lastValidBlockHeight: fresh.lastValidBlockHeight });
  } catch {
    // persistence is best effort
  }
  const result = raw
    ? await landTransaction(connection, raw, signature, fresh.lastValidBlockHeight)
    : (await confirmByPolling(connection, signature, 90_000)) ? "confirmed" : "unknown";
  if (result === "expired") throw new Error("receipt not landed: block height exceeded");
  if (result !== "confirmed") throw new Error("receipt not confirmed: timed out");
  return { signature, wallet: signed.wallet };
}

/**
 * Finishes a receipt that was interrupted after signing: sends it again if it can still land and
 * reports what the chain says. Never reports a receipt the chain does not have.
 */
export async function resumePending(p: PendingReceipt): Promise<LandResult> {
  if (!p.signature) return "expired";
  const connection = connectionFor(p.cluster);
  if (p.rawTx && p.lastValidBlockHeight) {
    return landTransaction(connection, Buffer.from(p.rawTx, "base64"), p.signature, p.lastValidBlockHeight, 60_000);
  }
  return (await confirmByPolling(connection, p.signature, 20_000)) ? "confirmed" : "unknown";
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
