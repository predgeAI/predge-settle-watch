import AsyncStorage from "@react-native-async-storage/async-storage";
import { TX_SIGNATURE_RE } from "../config";

export interface PackUnlock {
  key: string; // watchlist key
  marketId: string;
  packHash: string; // hash of the signed record named in the payment memo
  signature: string; // mainnet payment transaction
  at: string;
}

/** A payment the wallet signed but the app has not yet seen confirmed. */
export interface PendingUnlock {
  key: string;
  marketId: string;
  packHash: string;
  signature: string;
  rawTx?: string; // base64 signed transaction, so it can be sent again
  lastValidBlockHeight: number;
  startedAt: string;
}

const UNLOCKS_KEY = "settle-watch/skr-unlocks/v1";
const PENDING_KEY = "settle-watch/skr-pending/v1";

const isUnlock = (x: unknown): x is PackUnlock => {
  const u = x as PackUnlock;
  return !!u && typeof u === "object" && typeof u.key === "string" && typeof u.signature === "string" && TX_SIGNATURE_RE.test(u.signature) && typeof u.packHash === "string";
};

export async function loadUnlocks(): Promise<PackUnlock[]> {
  try {
    const raw = await AsyncStorage.getItem(UNLOCKS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isUnlock).slice(0, 500) : [];
  } catch {
    return [];
  }
}

export async function unlockFor(key: string): Promise<PackUnlock | null> {
  return (await loadUnlocks()).find((u) => u.key === key) ?? null;
}

export async function saveUnlock(u: PackUnlock): Promise<void> {
  const all = (await loadUnlocks()).filter((x) => x.key !== u.key);
  await AsyncStorage.setItem(UNLOCKS_KEY, JSON.stringify([u, ...all].slice(0, 500)));
}

export async function savePendingUnlock(p: PendingUnlock | null): Promise<void> {
  if (p === null) await AsyncStorage.removeItem(PENDING_KEY);
  else await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(p));
}

export async function loadPendingUnlock(): Promise<PendingUnlock | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    const p = raw ? (JSON.parse(raw) as PendingUnlock) : null;
    return p && typeof p.key === "string" && typeof p.signature === "string" && TX_SIGNATURE_RE.test(p.signature) ? p : null;
  } catch {
    return null;
  }
}
