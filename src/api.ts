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

/**
 * Accepts a Polymarket URL, a market slug, a numeric market id or a 0x condition id
 * and returns the identifier the Predge API takes.
 */
export function parseMarketInput(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^0x[0-9a-fA-F]{64}$/.test(s)) return s.toLowerCase();
  if (/^\d+$/.test(s)) return s;
  if (/^https?:\/\//i.test(s)) {
    // React Native's URL polyfill has no pathname, so parse by hand.
    const path = s.replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0];
    const parts = path.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    return last && /^[a-z0-9-]+$/i.test(last) ? last.toLowerCase() : null;
  }
  return /^[a-z0-9-]+$/i.test(s) ? s.toLowerCase() : null;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Free signed endpoint: GET /v1/settlement-risk/:market */
export async function fetchSettlementRisk(market: string): Promise<SettlementRisk> {
  const res = await fetch(`${PREDGE_API}/v1/settlement-risk/${encodeURIComponent(market)}`, {
    headers: { accept: "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (body as { message?: string }).message ?? `HTTP ${res.status}`);
  return body as SettlementRisk;
}
