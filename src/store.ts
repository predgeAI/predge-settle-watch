import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SettlementRisk } from "./api";
import type { Verification } from "./verify";
import { DEFAULT_DIGEST_HOUR, type Cluster } from "./config";
import { WATCHLIST_STORE_CAP } from "./skr/perks";
import { detectLanguage, isLang, t, tn, type Lang } from "./i18n";
import { deviceCountry, INTERESTS, sanitizeCountry, sanitizeInterests, type Interest } from "./discover/interests";

export interface Snapshot {
  risk_level: string;
  uma_state: string;
  dispute_count: number;
  open_dispute: boolean;
  sent_to_uma_vote: boolean;
  bulletin_board_count: number;
  resolved_on_chain: boolean;
  paused: boolean;
}

export interface Anchor {
  signature: string;
  packHash: string;
  action: "watch" | "acknowledge";
  riskLevel: string;
  at: string;
  cluster?: Cluster; // missing on 0.1.0 receipts, which were all devnet
}

export interface TimelineEvent {
  at: string;
  text: string;
  verified: boolean;
  kind?: "change" | "info" | "receipt"; // missing on 0.1.0 events
}

/** A position the user's Polymarket wallet holds in this market (from "Watch my positions"). */
export interface HeldInfo {
  outcome: string;
  size: number; // shares
  closed?: boolean; // the position went away; the market stays until the user removes it
  at: string; // last sync that touched this mark
}

export interface WatchItem {
  key: string; // identifier passed to the API
  marketId?: string;
  question?: string;
  slug?: string;
  addedAt: string;
  snapshot?: Snapshot;
  last?: SettlementRisk;
  verification?: Verification;
  lastError?: string;
  lastPolledAt?: string;
  lastChangeAt?: string; // when a watched field last changed
  timeline: TimelineEvent[];
  anchors: Anchor[];
  source?: "positions"; // added by the positions sync; missing on markets the user added
  held?: HeldInfo; // missing unless a positions sync found this market in the wallet
}

const KEY = "settle-watch/watchlist/v1";
const WALLET_KEY = "settle-watch/wallet/v1";

export async function loadWatchlist(): Promise<WatchItem[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // Drop anything malformed rather than crash on it.
    return parsed
      .filter((i): i is WatchItem => !!i && typeof i === "object" && typeof (i as WatchItem).key === "string")
      .map((i) => ({ ...i, timeline: Array.isArray(i.timeline) ? i.timeline : [], anchors: Array.isArray(i.anchors) ? i.anchors : [] }))
      .slice(0, WATCHLIST_STORE_CAP);
  } catch {
    return [];
  }
}

export async function saveWatchlist(items: WatchItem[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items.slice(0, WATCHLIST_STORE_CAP)));
}

export interface StoredWallet {
  address: string; // base58
  authToken: string;
  label?: string;
  cluster?: Cluster; // missing on 0.1.0 sessions, which were devnet
}

export async function loadWallet(): Promise<StoredWallet | null> {
  try {
    const raw = await AsyncStorage.getItem(WALLET_KEY);
    const w = raw ? (JSON.parse(raw) as StoredWallet) : null;
    return w && typeof w.address === "string" && typeof w.authToken === "string" ? w : null;
  } catch {
    return null;
  }
}

export async function saveWallet(w: StoredWallet | null): Promise<void> {
  if (w) await AsyncStorage.setItem(WALLET_KEY, JSON.stringify(w));
  else await AsyncStorage.removeItem(WALLET_KEY);
}

export function snapshotOf(r: SettlementRisk): Snapshot {
  return {
    risk_level: r.risk_level,
    uma_state: r.uma_state,
    dispute_count: Number(r.dispute_count),
    open_dispute: !!r.open_dispute,
    sent_to_uma_vote: !!r.sent_to_uma_vote,
    bulletin_board_count: Number(r.bulletin_board?.count ?? 0),
    resolved_on_chain: !!r.resolved_on_chain,
    paused: !!r.paused,
  };
}

/** Human-readable list of what changed between two snapshots. Empty if nothing did. */
export function describeChanges(prev: Snapshot | undefined, next: Snapshot): string[] {
  if (!prev) return [];
  const out: string[] = [];
  if (next.dispute_count > prev.dispute_count) {
    out.push(tn("change.dispute", next.dispute_count - prev.dispute_count));
  }
  if (next.sent_to_uma_vote && !prev.sent_to_uma_vote) out.push(t("change.vote"));
  if (next.bulletin_board_count > prev.bulletin_board_count) out.push(t("change.bulletin"));
  if (next.uma_state !== prev.uma_state) out.push(t("change.umaState", { from: prev.uma_state, to: next.uma_state }));
  if (next.paused !== prev.paused) out.push(next.paused ? t("change.paused") : t("change.unpaused"));
  if (next.resolved_on_chain && !prev.resolved_on_chain) out.push(t("change.settled"));
  if (next.risk_level !== prev.risk_level && out.length === 0) out.push(t("change.risk", { from: prev.risk_level, to: next.risk_level }));
  return out;
}

export interface Settings {
  onboarded: boolean;
  digest: boolean; // daily digest notification
  digestHour: number; // local hour, 0-23
  lastDigestDay?: string; // YYYY-MM-DD, local
  cluster: Cluster; // where receipts are anchored
  language: Lang; // interface language; follows the phone until the user picks one
  interests: Interest[]; // what the Discover feed shows first; missing before 0.4 means everything
  country?: string; // ISO 3166 alpha-2; from the phone's region until the user picks one or "none"
  plainWords: boolean; // everyday labels instead of dispute / UMA / proposal; on unless turned off
}

const SETTINGS_KEY = "settle-watch/settings/v1";
export const DEFAULT_SETTINGS: Settings = { onboarded: false, digest: true, digestHour: DEFAULT_DIGEST_HOUR, cluster: "devnet", language: "en", interests: [...INTERESTS], plainWords: true };

/**
 * Stored JSON -> Settings. Older versions stored fewer fields, so every field has a default.
 * `country` absent means "never chosen" (use the phone's region); stored null means the user picked none.
 */
export function normalizeSettings(raw: unknown, device: { language: () => Lang; country: () => string | undefined } = { language: detectLanguage, country: deviceCountry }): Settings {
  const s = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  const hour = s.digestHour;
  return {
    onboarded: s.onboarded === true,
    digest: s.digest !== false,
    digestHour: typeof hour === "number" && Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_SETTINGS.digestHour,
    lastDigestDay: typeof s.lastDigestDay === "string" ? s.lastDigestDay : undefined,
    cluster: s.cluster === "mainnet-beta" ? "mainnet-beta" : "devnet",
    language: isLang(s.language) ? s.language : device.language(),
    interests: sanitizeInterests(s.interests),
    country: "country" in s ? sanitizeCountry(s.country) : device.country(),
    plainWords: s.plainWords !== false,
  };
}

/** Settings -> JSON. A cleared country is kept as null so it does not fall back to the phone's region. */
export function serializeSettings(s: Settings): string {
  return JSON.stringify({ ...s, country: s.country ?? null });
}

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return normalizeSettings(raw ? JSON.parse(raw) : {});
  } catch {
    return normalizeSettings({});
  }
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await AsyncStorage.setItem(SETTINGS_KEY, serializeSettings(next));
  return next;
}

const DAY_MS = 86_400_000;

/** Status changes (not "watching" or receipt entries) in the last 24 hours. */
export function changesLast24h(item: WatchItem, now = Date.now()): TimelineEvent[] {
  return item.timeline.filter((t) => {
    const kind = t.kind ?? (t.text.startsWith("Watching.") || t.text.startsWith("Receipt anchored") ? "info" : "change");
    return kind === "change" && now - Date.parse(t.at) < DAY_MS;
  });
}

/** One plain-language line for the market's current state. */
export function statusLine(s: Snapshot | undefined): string {
  // Order matters: settled first, then the most urgent unsettled states.
  if (!s) return t("line.notChecked");
  if (s.resolved_on_chain) return s.dispute_count ? tn("line.settledAfter", s.dispute_count) : t("line.settled");
  if (s.paused) return t("line.paused");
  if (s.sent_to_uma_vote) return t("line.vote");
  if (s.open_dispute) return t("line.open");
  if (s.bulletin_board_count) return tn("line.clar", s.bulletin_board_count);
  if (s.dispute_count && s.uma_state.toLowerCase() === "requested") return t("line.reset");
  if (s.dispute_count) return t("line.disputed");
  if (s.risk_level === "watch" && s.uma_state.toLowerCase() === "proposed") return t("line.proposed");
  return t("line.quiet");
}

export function localDay(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const PENDING_KEY = "settle-watch/pending-receipt/v1";

export async function savePending(p: unknown | null): Promise<void> {
  if (p === null) await AsyncStorage.removeItem(PENDING_KEY);
  else await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(p));
}

export async function loadPending<T>(): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
