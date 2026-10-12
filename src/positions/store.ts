// The wallet address for "Watch my positions" and the last sync result.
// Stored only on this phone (AsyncStorage). It is a public address: no keys, no signing.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { normalizeAddress, type PositionsErrorKind } from "./api";

export interface PositionsState {
  address?: string;
  lastSyncAt?: string;
  found?: number;
  added?: number;
  failed?: number;
  overflow?: number;
  lastError?: PositionsErrorKind | "other";
  lastErrorAt?: string;
}

const KEY = "settle-watch/positions/v1";

export async function loadPositionsState(): Promise<PositionsState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    if (!s || typeof s !== "object") return {};
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);
    const str = (v: unknown) => (typeof v === "string" && v.length <= 40 ? v : undefined);
    return {
      address: normalizeAddress(s.address) ?? undefined,
      lastSyncAt: str(s.lastSyncAt),
      found: num(s.found),
      added: num(s.added),
      failed: num(s.failed),
      overflow: num(s.overflow),
      lastError: str(s.lastError) as PositionsState["lastError"],
      lastErrorAt: str(s.lastErrorAt),
    };
  } catch {
    return {};
  }
}

export async function savePositionsState(s: PositionsState): Promise<void> {
  if (!s.address) await AsyncStorage.removeItem(KEY);
  else await AsyncStorage.setItem(KEY, JSON.stringify(s));
}
