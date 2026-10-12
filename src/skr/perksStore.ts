// SKR perks state for the whole app: one read per refresh, shared by every screen.
// Refreshed when a wallet connects, when the app comes to the foreground and after an SKR payment.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { onSkrChanged, skrHoldings } from "./chain";
import { fromCache, fromRead, NO_PERKS, sanitizePerkCache, type PerkCache, type PerkState } from "./perks";

const CACHE_KEY = "settle-watch/skr-perks/v1";

let state: PerkState = NO_PERKS;
let address: string | null = null;
let seq = 0;
const listeners = new Set<() => void>();

function set(next: PerkState) {
  state = next;
  for (const fn of listeners) fn();
}

async function loadCache(): Promise<PerkCache | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? sanitizePerkCache(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Current perks. No wallet means no perks. */
export const getPerks = (): PerkState => state;

/** Re-reads the balance on mainnet. On failure keeps the saved tier for up to 24 h, then no tier. */
export async function refreshPerks(): Promise<void> {
  const addr = address;
  const mine = ++seq;
  if (!addr) return set(NO_PERKS);
  try {
    const h = await skrHoldings(addr);
    if (mine !== seq || addr !== address) return;
    const r = fromRead(addr, h.total);
    set(r.state);
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(r.cache)).catch(() => undefined);
  } catch {
    const cache = await loadCache();
    if (mine !== seq || addr !== address) return;
    set(fromCache(addr, cache));
  }
}

/** Tells the perks which wallet is connected (null when disconnected) and reads it. */
export function setPerksWallet(next: string | null): void {
  if (next === address) return;
  address = next;
  if (!next) {
    seq++;
    set(NO_PERKS);
    return;
  }
  // Another wallet's tier never carries over. Show the saved tier (if still valid) at once, then read live.
  if (state.address !== next) set(NO_PERKS);
  loadCache().then((c) => {
    if (address === next && state.address !== next) {
      const cached = fromCache(next, c);
      if (cached.source === "cache") set({ ...cached, checked: false });
    }
  });
  void refreshPerks();
}

onSkrChanged(() => void refreshPerks());

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Re-renders when the perks change. */
export function usePerks(): PerkState {
  return useSyncExternalStore(subscribe, getPerks, getPerks);
}
