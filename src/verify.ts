import nacl from "tweetnacl";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { canonicalize } from "./canonical";
import { KEYS_URL, PINNED_KID, PINNED_PUBLIC_KEY_HEX } from "./config";
import type { Attestation, SettlementRisk } from "./api";

/** pass and fail are final. unknown means the check could not run (the key list was not reachable). */
export type CheckStatus = "pass" | "fail" | "unknown";

export interface Check {
  label: string;
  ok: boolean; // true only for "pass"
  status?: CheckStatus; // missing on verifications saved before 0.3.9: read it as ok ? "pass" : "fail"
  detail?: string;
}

export interface Verification {
  verified: boolean;
  checks: Check[];
  packHash: string | null; // sha256 hex of the signed canonical bytes
  kid: string | null;
  verifiedAt: string;
  /** Signed issued_at (or checked_at) of the record, ISO. Missing on verifications saved before 0.3.9. */
  signedAt?: string | null;
}

export { VERIFY_CHECKS } from "./config";
/** A record signed longer ago than this fails the freshness check. */
export const MAX_RECORD_AGE_MS = 24 * 3_600_000;
/** How far the signed time may be ahead of the phone clock. */
export const CLOCK_SKEW_MS = 10 * 60_000;
/** An unreachable key list is tolerated only if the key was seen listed this recently. */
export const KEY_LIST_GRACE_MS = 7 * 24 * 3_600_000;
const KEY_LIST_MEMORY_MS = 3_600_000;
export const KEY_LIST_STORE_KEY = "settle-watch/keylist/last-good/v1";

/** Last successful key list fetch, kept on the phone. */
export interface KeyListCache {
  at: number; // ms since epoch, phone clock
  activeKeys: string[];
}

export interface KeyListStore {
  get(): Promise<KeyListCache | null>;
  set(v: KeyListCache): Promise<void>;
}

/** AsyncStorage backed store. Storage errors read as "no cache" and never break verification. */
export const asyncKeyListStore: KeyListStore = {
  async get() {
    try {
      const raw = await AsyncStorage.getItem(KEY_LIST_STORE_KEY);
      if (!raw) return null;
      const v = JSON.parse(raw) as KeyListCache;
      if (!Number.isFinite(v?.at) || !Array.isArray(v.activeKeys) || !v.activeKeys.every((k) => typeof k === "string")) return null;
      return { at: v.at, activeKeys: v.activeKeys.map((k) => k.toLowerCase()) };
    } catch {
      return null;
    }
  },
  async set(v) {
    try {
      await AsyncStorage.setItem(KEY_LIST_STORE_KEY, JSON.stringify(v));
    } catch {
      // best effort
    }
  },
};

export interface VerifyOptions {
  tamper?: boolean;
  /** Phone clock in ms. Tests pass a fixed value. */
  now?: number;
  /** Fetches the active attestation keys; null when the list is not reachable. Defaults to KEYS_URL. */
  fetchKeys?: () => Promise<string[] | null>;
  /** Where the last good key list is kept. Defaults to AsyncStorage. */
  keyStore?: KeyListStore;
}

let keyListMemory: KeyListCache | null = null;
/** Test hook: forget the in-memory copy of the key list. */
export function resetKeyListMemory(): void {
  keyListMemory = null;
}

/** Active attestation keys published by Predge, or null if unreachable or malformed. */
export async function fetchPublishedKeys(): Promise<string[] | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(KEYS_URL, { signal: ctrl.signal });
    if (!res.ok) return null;
    const doc = (await res.json()) as { keys?: { public_key?: unknown; active?: unknown; role?: unknown }[] };
    if (!doc || !Array.isArray(doc.keys)) return null;
    return doc.keys
      .filter((k) => k && k.active === true && (k.role ?? "attestation") === "attestation" && typeof k.public_key === "string")
      .map((k) => (k.public_key as string).toLowerCase());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Check 2. Fetched list: pass if the key is listed, fail if not. List not reachable: status unknown, never
 * pass. `tolerated` says whether verified may still be true, which needs a list fetched in the last 7 days
 * that listed this key.
 */
export async function keyListCheck(
  pub: string,
  now: number,
  fetchKeys: () => Promise<string[] | null>,
  store: KeyListStore
): Promise<{ check: Check; tolerated: boolean }> {
  const label = "Key is active in /.well-known/predge-keys.json";
  let listed: string[] | null = null;
  if (keyListMemory && now - keyListMemory.at >= 0 && now - keyListMemory.at < KEY_LIST_MEMORY_MS) {
    listed = keyListMemory.activeKeys;
  } else {
    listed = await fetchKeys().catch(() => null);
    if (listed) {
      keyListMemory = { at: now, activeKeys: listed };
      // Only a list that names this key counts as a successful key-list check for the grace period.
      if (listed.includes(pub)) await store.set({ at: now, activeKeys: listed }).catch(() => undefined);
    }
  }
  if (listed) {
    const ok = listed.includes(pub);
    return { check: { label, ok, status: ok ? "pass" : "fail", detail: ok ? "listed, active" : "not listed" }, tolerated: false };
  }
  const base = "key list not reachable, pinned key used";
  const cached = await store.get().catch(() => null);
  const age = cached ? now - cached.at : NaN;
  const recent = cached !== null && age >= 0 && age <= KEY_LIST_GRACE_MS && cached.activeKeys.includes(pub);
  return {
    check: {
      label,
      ok: false,
      status: "unknown",
      detail: recent ? `${base}; last good list ${Math.floor(age / 3_600_000)} h ago` : `${base}; no good list in the last 7 days`,
    },
    tolerated: recent,
  };
}

/** The signed time of a record: issued_at, else checked_at, from the signed payload. NaN if neither parses. */
export function signedTimeOf(p: Record<string, unknown>): { at: number; iso: string | null } {
  for (const k of ["issued_at", "checked_at"]) {
    const v = p[k];
    if (typeof v === "string") {
      const at = Date.parse(v);
      if (Number.isFinite(at)) return { at, iso: new Date(at).toISOString() };
    }
  }
  return { at: NaN, iso: null };
}

/** Check 8: the signed time is at most 24 h before the phone clock and at most 10 min after it. */
export function freshnessCheck(p: Record<string, unknown>, now: number): Check {
  const label = "Record was signed in the last 24 hours";
  const { at } = signedTimeOf(p);
  if (!Number.isFinite(at)) return { label, ok: false, status: "fail", detail: "no signed timestamp" };
  const age = now - at;
  if (age < -CLOCK_SKEW_MS) {
    return { label, ok: false, status: "fail", detail: `signed ${Math.ceil(-age / 60_000)} min in the future, check the phone clock` };
  }
  if (age > MAX_RECORD_AGE_MS) return { label, ok: false, status: "fail", detail: `stale: signed ${Math.floor(age / 3_600_000)} h ago` };
  return { label, ok: true, status: "pass", detail: `signed ${Math.max(0, Math.floor(age / 60_000))} min ago` };
}

/**
 * True when a verification can back a receipt or an SKR payment right now: verified, has a pack hash and
 * its signed time is still inside the freshness window. A verification saved earlier can go stale.
 */
export function usableForReceipt(v: Verification | null | undefined, now: number = Date.now()): boolean {
  if (!v?.verified || !v.packHash || !v.signedAt) return false;
  const at = Date.parse(v.signedAt);
  return Number.isFinite(at) && now - at <= MAX_RECORD_AGE_MS && at - now <= CLOCK_SKEW_MS;
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

const withStatus = (c: Check): Check => ({ ...c, status: c.status ?? (c.ok ? "pass" : "fail") });

/**
 * Verifies a Predge settlement-risk record entirely on the device:
 * pinned key, key listed in .well-known, canonical bytes, ed25519 signature,
 * that every number on screen is the signed one, and that the record is fresh.
 * Verified means every check passed, except that an unreachable key list is accepted
 * when the key was seen listed in the last 7 days.
 */
export async function verifyRecord(r: SettlementRisk, opts: VerifyOptions = {}): Promise<Verification> {
  const now = opts.now ?? Date.now();
  const checks: Check[] = [];
  const a: Attestation | null | undefined = r.attestation;
  const verifiedAt = new Date(now).toISOString();
  if (!a) {
    return {
      verified: false,
      checks: [{ label: "Record carries an attestation", ok: false, status: "fail", detail: "unsigned record" }],
      packHash: null,
      kid: null,
      verifiedAt,
      signedAt: null,
    };
  }
  const pub = (a.public_key ?? "").toLowerCase();
  const kid = pub.slice(0, 16);
  checks.push({
    label: "Signed by the pinned Predge key",
    ok: pub === PINNED_PUBLIC_KEY_HEX && kid === PINNED_KID,
    detail: `kid ${kid}`,
  });

  const keys = await keyListCheck(pub, now, opts.fetchKeys ?? fetchPublishedKeys, opts.keyStore ?? asyncKeyListStore);
  checks.push(keys.check);

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

  checks.push(freshnessCheck(a.payload, now));

  const out = checks.map(withStatus);
  const keyCheck = out[1];
  const verified = out.every((c) => c.status === "pass" || (c === keyCheck && c.status === "unknown" && keys.tolerated));
  return { verified, checks: out, packHash, kid, verifiedAt, signedAt: signedTimeOf(a.payload).iso };
}
