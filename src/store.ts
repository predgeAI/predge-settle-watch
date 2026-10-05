import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SettlementRisk } from "./api";
import type { Verification } from "./verify";

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
}

export interface TimelineEvent {
  at: string;
  text: string;
  verified: boolean;
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
  timeline: TimelineEvent[];
  anchors: Anchor[];
}

const KEY = "settle-watch/watchlist/v1";
const WALLET_KEY = "settle-watch/wallet/v1";

export async function loadWatchlist(): Promise<WatchItem[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as WatchItem[]) : [];
  } catch {
    return [];
  }
}

export async function saveWatchlist(items: WatchItem[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

export interface StoredWallet {
  address: string; // base58
  authToken: string;
  label?: string;
}

export async function loadWallet(): Promise<StoredWallet | null> {
  try {
    const raw = await AsyncStorage.getItem(WALLET_KEY);
    return raw ? (JSON.parse(raw) as StoredWallet) : null;
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
