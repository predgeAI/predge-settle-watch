import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SettlementRisk } from "./api";
import type { Verification } from "./verify";
import { DEFAULT_DIGEST_HOUR, MAX_WATCHLIST, type Cluster } from "./config";

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
      .slice(0, MAX_WATCHLIST);
  } catch {
    return [];
  }
}

export async function saveWatchlist(items: WatchItem[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX_WATCHLIST)));
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
    const n = next.dispute_count - prev.dispute_count;
    out.push(n === 1 ? "New UMA dispute on the proposed answer" : `${n} new UMA disputes`);
  }
  if (next.sent_to_uma_vote && !prev.sent_to_uma_vote) out.push("Disputed twice: outcome goes to a UMA token-holder vote");
  if (next.bulletin_board_count > prev.bulletin_board_count) out.push("New bulletin-board update (clarification) on chain");
  if (next.uma_state !== prev.uma_state) out.push(`UMA state: ${prev.uma_state} -> ${next.uma_state}`);
  if (next.paused !== prev.paused) out.push(next.paused ? "Resolution paused on chain" : "Resolution unpaused");
  if (next.resolved_on_chain && !prev.resolved_on_chain) out.push("Settled: on-chain resolution recorded");
  if (next.risk_level !== prev.risk_level && out.length === 0) out.push(`Risk level: ${prev.risk_level} -> ${next.risk_level}`);
  return out;
}

export interface Settings {
  onboarded: boolean;
  digest: boolean; // daily digest notification
  digestHour: number; // local hour, 0-23
  lastDigestDay?: string; // YYYY-MM-DD, local
  cluster: Cluster; // where receipts are anchored
}

const SETTINGS_KEY = "settle-watch/settings/v1";
export const DEFAULT_SETTINGS: Settings = { onboarded: false, digest: true, digestHour: DEFAULT_DIGEST_HOUR, cluster: "devnet" };

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    const s = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    return {
      onboarded: s.onboarded === true,
      digest: s.digest !== false,
      digestHour: Number.isInteger(s.digestHour) && s.digestHour! >= 0 && s.digestHour! <= 23 ? s.digestHour! : DEFAULT_SETTINGS.digestHour,
      lastDigestDay: typeof s.lastDigestDay === "string" ? s.lastDigestDay : undefined,
      cluster: s.cluster === "mainnet-beta" ? "mainnet-beta" : "devnet",
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
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
  if (!s) return "Not checked yet";
  if (s.resolved_on_chain) return s.dispute_count ? `Settled on chain after ${s.dispute_count} dispute${s.dispute_count > 1 ? "s" : ""}` : "Settled on chain";
  if (s.paused) return "Resolution paused on chain";
  if (s.sent_to_uma_vote) return "Disputed twice: UMA token-holder vote";
  if (s.open_dispute) return "Open UMA dispute";
  if (s.bulletin_board_count) return `${s.bulletin_board_count} clarification${s.bulletin_board_count > 1 ? "s" : ""} posted, no open dispute`;
  if (s.dispute_count) return "Past dispute, nothing open now";
  return "Quiet: no dispute, no clarification";
}

export function localDay(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
