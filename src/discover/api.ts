// Discover: read-only list of popular open markets from Polymarket's public gamma API,
// plus Predge's free segment statistic for a market, fetched only when a card is opened.
import { fetchSettlementRisk } from "../api";

const GAMMA = "https://gamma-api.polymarket.com/markets?active=true&closed=false&order=volume24hr&ascending=false&limit=40";
const UA = "SettleWatch/0.3 (Android; read-only)";

export interface DiscoverMarket {
  id: string;
  question: string;
  slug: string;
  endDate?: string;
  volume24hr: number;
}

export interface Segment {
  segment: string;
  rate: number; // share of markets in the segment that were disputed
  markets: number;
  disputed: number;
  low?: number;
  high?: number;
  window?: string;
}

// Keep the feed calm: no markets about violence, death or health.
const SKIP = /\b(kill\w*|dead|death|die\w*|shot|shoot\w*|war|attack\w*|bomb\w*|missile\w*|strike\w*|nuclear|covid|virus|cancer|assassin\w*|terror\w*|murder\w*|massacre|genocide|suicide|injur\w*|hospital\w*|bet|odds|wager|elect\w*|president\w*|nominat\w*|senate|congress|trump|biden|harris|putin|zelensky|netanyahu|tariff\w*|impeach\w*|ceasefire|sanction\w*|missile\w*|invade\w*|invasion)\b/i;

export function parseMarkets(body: unknown): DiscoverMarket[] {
  if (!Array.isArray(body)) return [];
  const out: DiscoverMarket[] = [];
  for (const m of body) {
    if (!m || typeof m !== "object") continue;
    const r = m as Record<string, unknown>;
    const id = String(r.id ?? "");
    const question = typeof r.question === "string" ? r.question.trim() : "";
    const slug = typeof r.slug === "string" ? r.slug : "";
    if (!/^\d{1,12}$/.test(id) || !question || question.length > 160 || SKIP.test(question)) continue;
    const v = Number(r.volume24hr ?? 0);
    out.push({ id, question, slug, endDate: typeof r.endDate === "string" ? r.endDate.slice(0, 10) : undefined, volume24hr: Number.isFinite(v) ? v : 0 });
    if (out.length >= 25) break;
  }
  return out;
}

export async function fetchPopular(): Promise<DiscoverMarket[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(GAMMA, { headers: { accept: "application/json", "User-Agent": UA }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseMarkets(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

// Predge free tier: 60 calls a minute. Stay under it and cache what we already know.
const calls: number[] = [];
const cache = new Map<string, { at: number; seg: Segment | null }>();

export function canCall(now = Date.now()): boolean {
  while (calls.length && now - calls[0] > 60_000) calls.shift();
  return calls.length < 50;
}

export function parseSegment(x: unknown): Segment | null {
  if (!x || typeof x !== "object") return null;
  const s = x as Record<string, unknown>;
  const rate = Number(s.rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1 || typeof s.segment !== "string") return null;
  const ci = Array.isArray(s.ci95) ? s.ci95.map(Number) : [];
  return {
    segment: s.segment.slice(0, 40),
    rate,
    markets: Number(s.markets) || 0,
    disputed: Number(s.disputed) || 0,
    low: Number.isFinite(ci[0]) ? ci[0] : undefined,
    high: Number.isFinite(ci[1]) ? ci[1] : undefined,
    window: typeof s.window === "string" ? s.window.slice(0, 120) : undefined,
  };
}

export type Tier = "low" | "mid" | "high";
/** Plain tiers on the category rate. This describes the category, not the market. */
export function tierOf(rate: number): Tier {
  return rate < 0.01 ? "low" : rate < 0.03 ? "mid" : "high";
}

export async function fetchSegment(marketId: string): Promise<Segment | null> {
  const hit = cache.get(marketId);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.seg;
  if (!canCall()) throw new Error("Slow down a moment, then try again.");
  calls.push(Date.now());
  const r = await fetchSettlementRisk(marketId);
  const seg = parseSegment((r as unknown as { segment_dispute_rate?: unknown }).segment_dispute_rate);
  cache.set(marketId, { at: Date.now(), seg });
  return seg;
}

export function fmtVolume(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}k`;
  return String(Math.round(v));
}

/** 28502 -> "28,502" without relying on Intl in the JS engine. */
export function fmtInt(v: number): string {
  return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
