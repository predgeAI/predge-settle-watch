// Which evidence pack fields are covered by the signature. Pure module, so the offline selftest can run it.
import { canonicalize } from "../canonical";
import type { SettlementRisk } from "../api";

/**
 * signed: the value shown equals the signed payload (or is bound by verification check 6).
 * unsigned: the value comes from the API response outside the signature.
 * mismatch: the signed payload has this field with a different value.
 */
export type FieldOrigin = "signed" | "unsigned" | "mismatch";

/** Fields of the evidence pack that verification check 6 already compares with the signed payload. */
export const CHECKED_FIELDS = ["uma_state", "dispute_count", "open_dispute", "sent_to_uma_vote", "bulletin_board_count", "recommendation"] as const;

const same = (a: unknown, b: unknown) => {
  try {
    return canonicalize(a ?? null) === canonicalize(b ?? null);
  } catch {
    return false;
  }
};

/** The parts of the latest clarification the pack shows, in a fixed shape for comparison. */
function latestShown(x: unknown): Record<string, string> | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const k of ["posted_at", "kind", "poster"]) if (typeof o[k] === "string" && o[k]) out[k] = o[k] as string;
  return out;
}

const compare = (payload: Record<string, unknown>, key: string, shown: unknown, norm: (x: unknown) => unknown = (x) => x): FieldOrigin =>
  !(key in payload) ? "unsigned" : same(norm(shown), norm(payload[key])) ? "signed" : "mismatch";

/**
 * Origin of every field the unlocked pack shows that check 6 does not cover. A record without an
 * attestation has no signed fields at all.
 */
export function packFieldOrigins(r: SettlementRisk): {
  clarLatest: FieldOrigin;
  proposal: FieldOrigin;
  resolution: FieldOrigin;
  source: FieldOrigin;
  basis: FieldOrigin;
  checked: FieldOrigin;
  history: FieldOrigin;
} {
  const p = r.attestation?.payload ?? {};
  const extra = r as unknown as Record<string, unknown>;
  return {
    clarLatest: compare(p, "latest_bulletin_board_update", r.bulletin_board?.latest ?? null, latestShown),
    proposal: compare(p, "current_proposal", r.current_proposal),
    resolution: compare(p, "onchain_resolution", r.onchain_resolution),
    // context and data_basis are not in the signed payload today; they are compared if they ever are.
    source: "context" in p ? (same(r.context?.source, (p.context as Record<string, unknown> | null)?.source) ? "signed" : "mismatch") : "unsigned",
    basis: compare(p, "data_basis", extra.data_basis),
    checked: compare(p, "checked_at", r.checked_at),
    history: compare(p, "disputes", r.disputes ?? []),
  };
}
