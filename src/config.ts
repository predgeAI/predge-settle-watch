export const PREDGE_API = "https://api.predge.io";
export const KEYS_URL = `${PREDGE_API}/.well-known/predge-keys.json`;

// Pinned Predge attestation key (production). The app also checks that the key is
// listed as active in KEYS_URL, but a pack signed by any other key never verifies.
export const PINNED_KID = "13fa3d18a369e6c7";
export const PINNED_PUBLIC_KEY_HEX = "13fa3d18a369e6c71bf941563ba47822b30182273d5106a0e8fb61c5016352d9";

// Solana: devnet only. No mainnet funds are ever used by this build.
export const SOLANA_CHAIN = "solana:devnet" as const;
export const SOLANA_RPC = "https://api.devnet.solana.com";
export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
export const EXPLORER_TX = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

export const APP_IDENTITY = {
  name: "Settle Watch",
  uri: "https://predge.io",
  icon: "favicon.ico",
};

export const FOREGROUND_POLL_MS = 60_000;
export const BACKGROUND_TASK = "predge-settle-watch-poll";
