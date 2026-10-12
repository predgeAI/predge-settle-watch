// SKR holder perks. Holding, not staking: the tier comes only from the SKR balance the connected wallet
// holds on Solana mainnet, read-only. No transaction is built, signed or sent for a perk.
// Pure module (config and i18n only) so the offline selftest can run it.
import { MAX_WATCHLIST, SKR_DECIMALS } from "../config";
import { t, type Key } from "../i18n";

export type PerkTier = "holder" | "supporter" | "guardian";

/** Minimum SKR held for each tier, lowest first. */
export const SKR_TIERS: readonly { id: PerkTier; min: number; slots: number; xpPct: number }[] = [
  { id: "holder", min: 10, slots: 10, xpPct: 110 },
  { id: "supporter", min: 100, slots: 25, xpPct: 125 },
  { id: "guardian", min: 1000, slots: 50, xpPct: 150 },
];
export const HOLDER_MIN_SKR = 10;
export const SUPPORTER_MIN_SKR = 100;
export const GUARDIAN_MIN_SKR = 1000;

/** Most extra slots any tier gives. The watchlist store keeps up to base + this, so markets survive losing a tier. */
export const MAX_PERK_SLOTS = 50;
export const WATCHLIST_STORE_CAP = MAX_WATCHLIST + MAX_PERK_SLOTS;

/** How long a saved tier stands in when the balance cannot be read. */
export const PERK_CACHE_MAX_AGE_MS = 24 * 3600_000;

const tierInfo = (tier: PerkTier | null) => SKR_TIERS.find((x) => x.id === tier) ?? null;

/** True when a base-unit amount string is at least `skr` whole tokens. */
export function holdsAtLeast(base: string, skr: number): boolean {
  if (!/^\d+$/.test(base) || !Number.isSafeInteger(skr) || skr < 0) return false;
  const have = base.replace(/^0+(?=\d)/, "");
  const want = skr === 0 ? "0" : String(skr) + "0".repeat(SKR_DECIMALS);
  return have.length !== want.length ? have.length > want.length : have >= want;
}

/** Tier for an SKR balance in base units (6 decimals), or null below Holder. */
export function tierFor(base: string | null | undefined): PerkTier | null {
  if (typeof base !== "string") return null;
  let out: PerkTier | null = null;
  for (const x of SKR_TIERS) if (holdsAtLeast(base, x.min)) out = x.id;
  return out;
}

export const tierRank = (tier: PerkTier | null) => (tier ? SKR_TIERS.findIndex((x) => x.id === tier) + 1 : 0);

/** Extra watchlist slots for a tier. */
export const extraSlots = (tier: PerkTier | null) => tierInfo(tier)?.slots ?? 0;

/** Most markets that may be watched with this tier. */
export const watchlistLimit = (tier: PerkTier | null) => MAX_WATCHLIST + extraSlots(tier);

/** Clock-in multiplier in percent (100 = none). */
export const clockInPct = (tier: PerkTier | null) => tierInfo(tier)?.xpPct ?? 100;

/** "1.1", "1.25", "1.5" for display. */
export const multiplierText = (tier: PerkTier | null) => String(clockInPct(tier) / 100);

/** Local clock-in XP with the tier's multiplier, rounded to a whole number. Integer math, no float drift. */
export function boostClockIn(baseXp: number, tier: PerkTier | null): number {
  if (!Number.isFinite(baseXp) || baseXp <= 0) return 0;
  return Math.round((Math.round(baseXp) * clockInPct(tier)) / 100);
}

/** The next tier above the current one and its threshold, or null at the top. */
export function nextTier(tier: PerkTier | null): { id: PerkTier; min: number } | null {
  const n = SKR_TIERS[tierRank(tier)];
  return n ? { id: n.id, min: n.min } : null;
}

export const tierName = (tier: PerkTier | null) => t(`perks.tier.${tier ?? "none"}` as Key);

/** Whether a new market can be added, and the message to show when it cannot. */
export function canAddMarket(count: number, tier: PerkTier | null): { ok: true } | { ok: false; title: string; body: string } {
  const limit = watchlistLimit(tier);
  if (count < limit) return { ok: true };
  if (count > limit) return { ok: false, title: t("perks.overTitle"), body: t("perks.overBody", { count, n: limit }) };
  const body = t("add.fullBody", { n: limit });
  return { ok: false, title: t("add.fullTitle"), body: tier === "guardian" ? body : `${body}\n\n${t("perks.fullHint", { n: nextTier(tier)?.min ?? HOLDER_MIN_SKR, slots: extraSlots(nextTier(tier)?.id ?? "holder") })}` };
}

// ---- cache -----------------------------------------------------------------

export interface PerkCache {
  address: string;
  total: string; // base units read from mainnet
  tier: PerkTier | null;
  at: string; // ISO time of the successful read
}

export interface PerkState {
  address: string | null;
  tier: PerkTier | null;
  total: string | null; // base units, null when unknown
  at: string | null; // time of the read the tier comes from
  source: "live" | "cache" | "none";
  checked: boolean; // a read was attempted for this address (false while the first read runs)
}

export const NO_PERKS: PerkState = { address: null, tier: null, total: null, at: null, source: "none", checked: false };

export function sanitizePerkCache(raw: unknown): PerkCache | null {
  const c = raw as PerkCache;
  if (!c || typeof c !== "object" || typeof c.address !== "string" || typeof c.total !== "string" || !/^\d+$/.test(c.total)) return null;
  if (typeof c.at !== "string" || !Number.isFinite(Date.parse(c.at))) return null;
  // The tier is always re-derived from the balance, never trusted from storage.
  return { address: c.address, total: c.total, tier: tierFor(c.total), at: c.at };
}

/** State after a successful mainnet read. */
export function fromRead(address: string, total: string, now: Date = new Date()): { state: PerkState; cache: PerkCache } {
  const tier = tierFor(total);
  const at = now.toISOString();
  return { state: { address, tier, total, at, source: "live", checked: true }, cache: { address, total, tier, at } };
}

/**
 * State when the balance cannot be read: the saved tier for the same address, if read in the last 24 h.
 * After that, or for another address, no tier. A saved time in the future does not count.
 */
export function fromCache(address: string | null, cache: PerkCache | null, now: Date = new Date()): PerkState {
  if (!address) return NO_PERKS;
  if (!cache || cache.address !== address) return { ...NO_PERKS, address, checked: true };
  const age = now.getTime() - Date.parse(cache.at);
  if (!(age >= 0 && age <= PERK_CACHE_MAX_AGE_MS)) return { ...NO_PERKS, address, checked: true };
  return { address, tier: tierFor(cache.total), total: cache.total, at: cache.at, source: "cache", checked: true };
}
