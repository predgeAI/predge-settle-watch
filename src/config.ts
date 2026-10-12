export const PREDGE_API = "https://api.predge.io";
export const KEYS_URL = `${PREDGE_API}/.well-known/predge-keys.json`;

// Pinned Predge attestation key (production). The app also checks that the key is
// listed as active in KEYS_URL, but a pack signed by any other key never verifies.
export const PINNED_KID = "13fa3d18a369e6c7";
export const PINNED_PUBLIC_KEY_HEX = "13fa3d18a369e6c71bf941563ba47822b30182273d5106a0e8fb61c5016352d9";

/** Number of checks verifyRecord (src/verify.ts) runs on a signed record. All pass on a fully verified record. */
export const VERIFY_CHECKS = 8;

// Solana. Receipts go to devnet by default; the user can switch to mainnet in
// Settings, where a memo costs only the network fee (about 0.000005 SOL).
export type Cluster = "devnet" | "mainnet-beta";
export const CLUSTERS: Record<Cluster, { chain: "solana:devnet" | "solana:mainnet"; rpc: string; label: string }> = {
  devnet: { chain: "solana:devnet", rpc: "https://api.devnet.solana.com", label: "Devnet" },
  "mainnet-beta": { chain: "solana:mainnet", rpc: "https://api.mainnet-beta.solana.com", label: "Mainnet" },
};
export const DEFAULT_CLUSTER: Cluster = "devnet";
export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

// SKR, the Solana Mobile token (classic SPL Token program, 6 decimals). Always read and paid on mainnet.
export const SKR_MINT = "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3";
export const SKR_DECIMALS = 6;
export const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const ATA_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
// Predge wallet that receives SKR for evidence packs. Empty turns the unlock into "Coming soon".
export const SKR_TREASURY = "8gTLrkxZkL3yewzGBEQhv3Y3C7DzsfMUEZqybvP5Nh8S";

/** Base58 transaction signature (64 bytes encodes to 86-88 chars). */
export const TX_SIGNATURE_RE = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/;

export const EXPLORER_TX = (sig: string, cluster: Cluster = DEFAULT_CLUSTER) => {
  if (!TX_SIGNATURE_RE.test(sig)) throw new Error("Not a Solana transaction signature");
  return cluster === "devnet"
    ? `https://explorer.solana.com/tx/${sig}?cluster=devnet`
    : `https://explorer.solana.com/tx/${sig}`;
};

export const APP_IDENTITY = {
  name: "Settle Watch",
  uri: "https://predge.io",
  icon: "favicon.ico",
};

export const FOREGROUND_POLL_MS = 60_000;
export const BACKGROUND_TASK = "predge-settle-watch-poll";
export const MAX_WATCHLIST = 50;
export const DEFAULT_DIGEST_HOUR = 9; // local time
