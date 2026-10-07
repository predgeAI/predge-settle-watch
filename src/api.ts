import { PREDGE_API } from "./config";

export interface Attestation {
  version: string;
  issuer: string;
  algorithm: string;
  kind: string;
  public_key: string;
  canonical: string;
  signature: string;
  payload: Record<string, unknown>;
}

export interface Dispute {
  disputed_at?: string;
  tx?: string;
  [k: string]: unknown;
}

export interface SettlementRisk {
  market: {
    market_id: string;
    condition_id: string;
    slug: string;
    question: string;
    uma_question_id: string;
    closed?: boolean;
    end_date?: string;
  };
  adapter_label?: string;
  uma_state: string;
  resolved_on_chain: boolean;
  paused: boolean;
  dispute_count: number;
  open_dispute: boolean;
  sent_to_uma_vote: boolean;
  current_proposal: unknown;
  disputes: Dispute[];
  bulletin_board: { count: number; latest: { posted_at: string; poster: string; kind?: string } | null };
  onchain_resolution: unknown;
  checked_at: string;
  risk_level: "ok" | "watch" | "caution" | "resolved";
  recommendation: string;
  context?: Record<string, string | number>;
  attestation?: Attestation | null;
}

export const MAX_INPUT_LENGTH = 300;
const ALLOWED_HOSTS = ["polymarket.com", "www.polymarket.com"];
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,199}$/i;

/**
 * Accepts a Polymarket URL, a market slug, a numeric market id or a 0x condition id
 * and returns the identifier the Predge API takes. Anything else, including links to
 * other hosts and over-long input, is rejected.
 */
export function parseMarketInput(input: string): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!s || s.length > MAX_INPUT_LENGTH) return null;
  if (/^0x[0-9a-fA-F]{64}$/.test(s)) return s.toLowerCase();
  if (/^\d+$/.test(s)) return s.length <= 12 ? s : null;
  if (/^https?:\/\//i.test(s)) {
    // React Native's URL polyfill has no pathname, so parse by hand.
    const host = (s.match(/^https?:\/\/([^/?#:]+)/i)?.[1] ?? "").toLowerCase();
    if (!ALLOWED_HOSTS.includes(host)) return null;
    const path = s.replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0];
    const parts = path.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    return last && SLUG_RE.test(last) ? last.toLowerCase() : null;
  }
  return SLUG_RE.test(s) ? s.toLowerCase() : null;
}

const RISK_LEVELS = ["ok", "watch", "caution", "resolved"] as const;

/** Rejects API responses that do not have the shape the app renders. */
export function assertSettlementRisk(x: unknown): SettlementRisk {
  const r = x as SettlementRisk;
  const bad = (why: string) => {
    throw new ApiError(0, `Unexpected response from the Predge API (${why})`);
  };
  if (!r || typeof r !== "object") bad("not an object");
  if (!r.market || typeof r.market !== "object") bad("market");
  if (typeof r.market.market_id !== "string" || !/^\d{1,12}$/.test(r.market.market_id)) bad("market_id");
  if (typeof r.market.question !== "string" || r.market.question.length > 500) bad("question");
  if (!RISK_LEVELS.includes(r.risk_level)) bad("risk_level");
  if (typeof r.uma_state !== "string" || r.uma_state.length > 40) bad("uma_state");
  if (typeof r.recommendation !== "string" || r.recommendation.length > 1000) bad("recommendation");
  if (!Number.isFinite(Number(r.dispute_count))) bad("dispute_count");
  if (r.disputes !== undefined && !Array.isArray(r.disputes)) bad("disputes");
  return r;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Free signed endpoint: GET /v1/settlement-risk/:market */
export async function fetchSettlementRisk(market: string): Promise<SettlementRisk> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(`${PREDGE_API}/v1/settlement-risk/${encodeURIComponent(market)}`, {
      headers: { accept: "application/json" },
      signal: ctrl.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (body as { message?: unknown }).message;
      throw new ApiError(res.status, typeof msg === "string" ? msg.slice(0, 200) : `HTTP ${res.status}`);
    }
    return assertSettlementRisk(body);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new ApiError(0, "Predge API timed out");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
