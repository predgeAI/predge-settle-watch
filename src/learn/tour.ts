// Open state of the 60-second tour, shared by every entry point (onboarding, PLAY, TODAY).
// Pure module: no React Native imports, so the selftest can load it.
import { useSyncExternalStore } from "react";
import type { GameState } from "../game";

/** Dedupe ref for the one-time tour XP (applyAction stores it as "learn:tour"). */
export const TOUR_REF = "tour";

/** True once the tour XP was credited. */
export const tourDone = (g: GameState) => g.done.includes(`learn:${TOUR_REF}`);

let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const get = () => open;

export function openTour(): void {
  if (open) return;
  open = true;
  emit();
}

export function closeTour(): void {
  if (!open) return;
  open = false;
  emit();
}

export function useTourOpen(): boolean {
  return useSyncExternalStore(subscribe, get, get);
}

// The DISCOVER button in the empty watchlist switches tabs through the handler LearnHost registers.
let discover: (() => void) | null = null;
export function setDiscoverHandler(fn: (() => void) | null): void {
  discover = fn;
}
export function goDiscover(): void {
  discover?.();
}
