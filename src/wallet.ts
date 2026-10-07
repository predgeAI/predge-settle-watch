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

const connections = new Map<Cluster, Connection>();
export function connectionFor(cluster: Cluster): Connection {
  let c = connections.get(cluster);
  if (!c) {
    c = new Connection(CLUSTERS[cluster].rpc, "confirmed");
    connections.set(cluster, c);
  }
  return c;
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

/**
 * Anchors the hash of a verified evidence pack in a Solana memo transaction,
 * signed and sent by the wallet through Mobile Wallet Adapter. The user ends up
 * holding a public, timestamped receipt of exactly which signed record they acted on.
 */
export async function anchorPack(
  stored: StoredWallet,
  p: { action: "watch" | "acknowledge"; marketId: string; riskLevel: string; packHash: string },
  cluster: Cluster
): Promise<{ signature: string; wallet: StoredWallet }> {
  const memo = memoText(p);
  const connection = connectionFor(cluster);
  const result = await transact(async (wallet) => {
    const auth = await authorizeSession(wallet, stored, cluster);
    const payer = new PublicKey(Buffer.from(auth.accounts[0].address, "base64"));
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const tx = new Transaction({ feePayer: payer, blockhash, lastValidBlockHeight }).add(
      new TransactionInstruction({
        programId: new PublicKey(MEMO_PROGRAM_ID),
        keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
        data: Buffer.from(memo, "utf8"),
      })
    );
    const [signature] = await wallet.signAndSendTransactions({ transactions: [tx] });
    if (typeof signature !== "string" || !TX_SIGNATURE_RE.test(signature)) throw new Error("The wallet returned no valid signature");
    return {
      signature,
      lastValidBlockHeight,
      blockhash,
      wallet: { address: payer.toBase58(), authToken: auth.auth_token, label: auth.accounts[0].label?.slice(0, 64), cluster },
    };
  });
  await connection.confirmTransaction(
    { signature: result.signature, blockhash: result.blockhash, lastValidBlockHeight: result.lastValidBlockHeight },
    "confirmed"
  );
  return { signature: result.signature, wallet: result.wallet };
}
