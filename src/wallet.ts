import { transact, type Web3MobileWallet } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import { APP_IDENTITY, MEMO_PROGRAM_ID, PINNED_KID, SOLANA_CHAIN, SOLANA_RPC } from "./config";
import type { StoredWallet } from "./store";

export const connection = new Connection(SOLANA_RPC, "confirmed");

function toBase58(base64Address: string): string {
  return new PublicKey(Buffer.from(base64Address, "base64")).toBase58();
}

async function authorizeSession(wallet: Web3MobileWallet, existing: StoredWallet | null) {
  if (existing?.authToken) {
    try {
      const auth = await wallet.reauthorize({ auth_token: existing.authToken, identity: APP_IDENTITY });
      return auth;
    } catch {
      // token expired or revoked: fall through to a fresh authorize
    }
  }
  return wallet.authorize({ chain: SOLANA_CHAIN, identity: APP_IDENTITY });
}

/** Mobile Wallet Adapter: connect to the wallet on the device (Seed Vault on Seeker). */
export async function connectWallet(existing: StoredWallet | null): Promise<StoredWallet> {
  return transact(async (wallet) => {
    const auth = await authorizeSession(wallet, existing);
    const acct = auth.accounts[0];
    return { address: toBase58(acct.address), authToken: auth.auth_token, label: acct.label };
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

export async function balanceSol(address: string): Promise<number> {
  const lamports = await connection.getBalance(new PublicKey(address));
  return lamports / LAMPORTS_PER_SOL;
}

/** Devnet faucet. Often rate limited; the UI then points to faucet.solana.com. */
export async function requestDevnetAirdrop(address: string): Promise<string> {
  const sig = await connection.requestAirdrop(new PublicKey(address), 0.5 * LAMPORTS_PER_SOL);
  const bh = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
  return sig;
}

export function memoText(p: { action: "watch" | "acknowledge"; marketId: string; riskLevel: string; packHash: string }): string {
  return `predge-settle-watch v1 ${p.action} market=${p.marketId} risk=${p.riskLevel} pack=sha256:${p.packHash} kid=${PINNED_KID}`;
}

/**
 * Anchors the hash of a verified evidence pack in a Solana devnet memo transaction,
 * signed and sent by the wallet through Mobile Wallet Adapter. The user ends up
 * holding a public, timestamped receipt of exactly which signed record they acted on.
 */
export async function anchorPack(
  stored: StoredWallet,
  p: { action: "watch" | "acknowledge"; marketId: string; riskLevel: string; packHash: string }
): Promise<{ signature: string; wallet: StoredWallet }> {
  const memo = memoText(p);
  const result = await transact(async (wallet) => {
    const auth = await authorizeSession(wallet, stored);
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
    return {
      signature,
      lastValidBlockHeight,
      blockhash,
      wallet: { address: payer.toBase58(), authToken: auth.auth_token, label: auth.accounts[0].label },
    };
  });
  await connection.confirmTransaction(
    { signature: result.signature, blockhash: result.blockhash, lastValidBlockHeight: result.lastValidBlockHeight },
    "confirmed"
  );
  return { signature: result.signature, wallet: result.wallet };
}
