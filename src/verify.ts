import nacl from "tweetnacl";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import { canonicalize } from "./canonical";
import { KEYS_URL, PINNED_KID, PINNED_PUBLIC_KEY_HEX } from "./config";
import type { Attestation, SettlementRisk } from "./api";

export interface Check {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface Verification {
  verified: boolean;
  checks: Check[];
  packHash: string | null; // sha256 hex of the signed canonical bytes
  kid: string | null;
  verifiedAt: string;
}

let keyListCache: { at: number; activeKeys: string[] } | null = null;

/** Active attestation keys published by Predge. Cached for an hour; null if unreachable. */
async function publishedKeys(): Promise<string[] | null> {
  if (keyListCache && Date.now() - keyListCache.at < 3_600_000) return keyListCache.activeKeys;
  try {
    const res = await fetch(KEYS_URL);
    if (!res.ok) return null;
    const doc = (await res.json()) as { keys?: { public_key: string; active: boolean; role?: string }[] };
    const activeKeys = (doc.keys ?? [])
      .filter((k) => k.active && (k.role ?? "attestation") === "attestation")
      .map((k) => k.public_key.toLowerCase());
    keyListCache = { at: Date.now(), activeKeys };
    return activeKeys;
  } catch {
    return null;
  }
}

/** Fields shown in the UI that must match the signed payload exactly. */
function displayedMatchesSigned(r: SettlementRisk, p: Record<string, unknown>): Check {
  const pairs: [string, unknown, unknown][] = [
    ["risk_level", r.risk_level, p.risk_level],
    ["recommendation", r.recommendation, p.recommendation],
    ["uma_state", r.uma_state, p.uma_state],
    ["dispute_count", String(r.dispute_count), p.dispute_count],
    ["open_dispute", r.open_dispute, p.open_dispute],
    ["sent_to_uma_vote", r.sent_to_uma_vote, p.sent_to_uma_vote],
    ["resolved_on_chain", r.resolved_on_chain, p.resolved_on_chain],
    ["paused", r.paused, p.paused],
    ["bulletin_board_count", String(r.bulletin_board?.count ?? 0), p.bulletin_board_count],
    ["market_id", r.market.market_id, p.market_id],
    ["condition_id", r.market.condition_id, p.condition_id],
  ];
  const bad = pairs.filter(([, a, b]) => a !== b).map(([k]) => k);
  return {
    label: "Displayed fields match the signed payload",
    ok: bad.length === 0,
    detail: bad.length ? `mismatch: ${bad.join(", ")}` : `${pairs.length} fields`,
  };
}

/**
 * Verifies a Predge settlement-risk record entirely on the device:
 * pinned key, key listed in .well-known, canonical bytes, ed25519 signature,
 * and that every number on screen is the signed one.
 */
export async function verifyRecord(r: SettlementRisk, opts: { tamper?: boolean } = {}): Promise<Verification> {
  const checks: Check[] = [];
  const a: Attestation | null | undefined = r.attestation;
  const verifiedAt = new Date().toISOString();
  if (!a) {
    return {
      verified: false,
      checks: [{ label: "Record carries an attestation", ok: false, detail: "unsigned record" }],
      packHash: null,
      kid: null,
      verifiedAt,
    };
  }
  const pub = (a.public_key ?? "").toLowerCase();
  const kid = pub.slice(0, 16);
  checks.push({
    label: "Signed by the pinned Predge key",
    ok: pub === PINNED_PUBLIC_KEY_HEX && kid === PINNED_KID,
    detail: `kid ${kid}`,
  });

  const listed = await publishedKeys();
  checks.push({
    label: "Key is active in /.well-known/predge-keys.json",
    ok: listed === null ? true : listed.includes(pub),
    detail: listed === null ? "key list unreachable, using pinned key" : listed.includes(pub) ? "listed, active" : "not listed",
  });

  checks.push({
    label: "Algorithm is ed25519",
    ok: a.algorithm === "ed25519",
    detail: a.algorithm,
  });

  let canonical = a.canonical;
  if (opts.tamper) {
    // Demo only: change one character of the signed bytes and show the check fails.
    canonical = canonical.replace(/"risk_level":"(\w)/, (_m, c) => `"risk_level":"${c === "x" ? "y" : "x"}`);
  }
  const recanon = canonicalize(a.payload);
  checks.push({
    label: "Payload re-canonicalises to the signed bytes",
    ok: recanon === canonical,
    detail: `${canonical.length} bytes`,
  });

  let sigOk = false;
  try {
    sigOk = nacl.sign.detached.verify(utf8ToBytes(canonical), hexToBytes(a.signature), hexToBytes(pub));
  } catch {
    sigOk = false;
  }
  checks.push({ label: "ed25519 signature is valid", ok: sigOk, detail: `${a.signature.slice(0, 16)}...` });

  checks.push(displayedMatchesSigned(r, a.payload));

  const packHash = bytesToHex(sha256(utf8ToBytes(canonical)));
  checks.push({ label: "Pack hash (sha256 of signed bytes)", ok: true, detail: packHash });

  return { verified: checks.every((c) => c.ok), checks, packHash, kid, verifiedAt };
}
