// Watchlist sync for "Watch my positions". Pure functions only, so the offline selftest runs them.
// New positions are added; markets whose position went away are marked closed, never removed.
import type { HeldInfo, WatchItem } from "../store";
import { t, tk } from "../i18n";
import type { Position, PositionsErrorKind } from "./api";

const CONDITION_RE = /^0x[0-9a-f]{64}$/;

/** The condition id of a watched market, if known. */
export function conditionOf(i: WatchItem): string | undefined {
  const c = i.last?.market?.condition_id;
  if (typeof c === "string" && CONDITION_RE.test(c.toLowerCase())) return c.toLowerCase();
  return CONDITION_RE.test(i.key) ? i.key : undefined;
}

/** One entry per market. A wallet can hold several outcomes of one market; the largest is shown. */
export function byMarket(positions: Position[]): Map<string, Position> {
  const m = new Map<string, Position>();
  for (const p of positions) {
    const prev = m.get(p.conditionId);
    if (!prev || p.size > prev.size) m.set(p.conditionId, p);
  }
  return m;
}

export interface SyncPlan {
  /** Markets to add, in the order the API returned them. */
  toAdd: Position[];
  /** Open markets found (unique). */
  found: number;
  /** Already on the watchlist. */
  watched: number;
  /** Left out because the watchlist is full. */
  overflow: number;
}

/** Which markets to add: unique, not yet watched, and only as many as fit (at most `batch`). */
export function planSync(open: Position[], items: WatchItem[], max: number, batch = 50): SyncPlan {
  const markets = byMarket(open);
  const watchedIds = new Set<string>();
  for (const i of items) {
    const c = conditionOf(i);
    if (c) watchedIds.add(c);
  }
  const fresh = [...markets.values()].filter((p) => !watchedIds.has(p.conditionId));
  const room = Math.max(0, Math.min(batch, max - items.length));
  return {
    toAdd: fresh.slice(0, room),
    found: markets.size,
    watched: markets.size - fresh.length,
    overflow: Math.max(0, fresh.length - room),
  };
}

/**
 * Marks watched markets the wallet holds (outcome and size) and marks markets whose position
 * is gone as closed. Returns the same array when nothing changed.
 */
export function applyHeld(items: WatchItem[], open: Position[], now: string): { items: WatchItem[]; closed: number; changed: boolean } {
  const markets = byMarket(open);
  let changed = false;
  let closed = 0;
  const next = items.map((i) => {
    const c = conditionOf(i);
    const p = c ? markets.get(c) : undefined;
    if (p) {
      const h = i.held;
      if (h && !h.closed && h.outcome === p.outcome && h.size === p.size) return i;
      changed = true;
      const held: HeldInfo = { outcome: p.outcome, size: p.size, at: now };
      return { ...i, held };
    }
    if (i.held && !i.held.closed) {
      changed = true;
      closed++;
      return { ...i, held: { ...i.held, closed: true, at: now } };
    }
    return i;
  });
  return { items: changed ? next : items, closed, changed };
}

/** Drops the held marks (after the user forgets the address). Markets stay on the watchlist. */
export function clearHeld(items: WatchItem[]): WatchItem[] {
  if (!items.some((i) => i.held)) return items;
  return items.map((i) => {
    if (!i.held) return i;
    const { held: _drop, ...rest } = i;
    return rest;
  });
}

/** A held mark with the shape the card can draw, or null. Stored data is never trusted blindly. */
export function heldOf(i: WatchItem): HeldInfo | null {
  const h = i.held as unknown;
  if (!h || typeof h !== "object") return null;
  const r = h as Partial<HeldInfo>;
  if (typeof r.outcome !== "string" || typeof r.size !== "number" || !Number.isFinite(r.size)) return null;
  return { outcome: r.outcome.slice(0, 80), size: r.size, closed: r.closed === true, at: typeof r.at === "string" ? r.at : "" };
}

/** 19227.02 -> "19,227", 3.888 -> "3.9". Separator follows the caller's number formatter. */
export function fmtShares(size: number, fmtInt: (s: string) => string = (s) => s): string {
  if (!Number.isFinite(size) || size < 0) return "0";
  if (size >= 100) return fmtInt(String(Math.round(size)));
  return String(Math.round(size * 10) / 10);
}

/** What to tell the user about a failed sync. */
export function positionsErrorText(kind: PositionsErrorKind | "other" | undefined): string {
  if (kind === "address") return t("pos.badBody");
  return tk(`pos.err.${kind ?? "other"}`, t("pos.err.other"));
}
