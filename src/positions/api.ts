// Polymarket positions for one wallet, read from Polymarket's public Data API.
//
// Endpoint: GET https://data-api.polymarket.com/positions?user=<proxy wallet>
// This is Polymarket's v1 Data API. It is public and read-only, needs no key, and is not
// a Predge service. Polymarket can change or retire it without notice, so everything that
// touches it lives in this file: strict input and response checks, a timeout, and errors
// the screen can show. Nothing here throws anything but PositionsError.
//
// Pure TypeScript (no React Native imports) so the offline selftest can run it.

export const POSITIONS_API = "https://data-api.polymarket.com/positions";
export const POSITIONS_TIMEOUT_MS = 15_000;
/** The endpoint's own page size limit. One page is enough: the watchlist holds 50 markets. */
export const POSITIONS_LIMIT = 100;

/** A Polygon address: 0x and 40 hex characters. Polymarket shows the proxy wallet on the profile page. */
export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const CONDITION_RE = /^0x[0-9a-fA-F]{64}$/;
const MAX_BODY_ITEMS = 500;

/** Trimmed, lowercased address, or null when the input is not a Polygon address. */
export function normalizeAddress(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  return ADDRESS_RE.test(s) ? s.toLowerCase() : null;
}

/** One position, only the fields the app uses. */
export interface Position {
  conditionId: string; // lowercased 0x + 64 hex, the market the app watches
  outcome: string; // "Yes", "No", a team name...
  size: number; // shares held
  title: string;
  slug?: string;
  endDate?: string;
  /** The market has settled and the position can be redeemed. Nothing left to watch. */
  redeemable: boolean;
}

export type PositionsErrorKind = "address" | "network" | "timeout" | "http" | "shape";

export class PositionsError extends Error {
  constructor(public kind: PositionsErrorKind, message: string, public status = 0) {
    super(message);
  }
}

const str = (v: unknown, max: number): string | undefined => (typeof v === "string" && v.length <= max ? v : undefined);

/**
 * Checks the response and keeps the positions the app can use.
 * The body must be an array; single entries with a bad shape are dropped rather than trusted.
 */
export function parsePositions(body: unknown): Position[] {
  if (!Array.isArray(body)) throw new PositionsError("shape", "Positions response is not a list");
  if (body.length > MAX_BODY_ITEMS) throw new PositionsError("shape", "Positions response is too long");
  const out: Position[] = [];
  for (const raw of body) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const cid = str(r.conditionId, 66);
    if (!cid || !CONDITION_RE.test(cid)) continue;
    const size = typeof r.size === "number" ? r.size : typeof r.size === "string" ? Number(r.size) : NaN;
    if (!Number.isFinite(size) || size <= 0) continue;
    const slug = str(r.slug, 200);
    const endDate = str(r.endDate, 40);
    out.push({
      conditionId: cid.toLowerCase(),
      outcome: (str(r.outcome, 80) ?? "").trim(),
      size,
      title: (str(r.title, 300) ?? "").trim(),
      slug: slug && /^[a-z0-9][a-z0-9-]*$/i.test(slug) ? slug : undefined,
      endDate,
      redeemable: r.redeemable === true,
    });
  }
  return out;
}

/** Open positions only: settled markets (redeemable) are left out. */
export const openPositions = (ps: Position[]) => ps.filter((p) => !p.redeemable);

export function positionsUrl(address: string): string {
  // redeemable=false asks the API for open positions; parsePositions filters again in case it is ignored.
  return `${POSITIONS_API}?user=${encodeURIComponent(address)}&sizeThreshold=1&limit=${POSITIONS_LIMIT}&redeemable=false`;
}

type FetchLike = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** Fetches and checks the open positions of a wallet. Throws only PositionsError. */
export async function fetchPositions(address: string, opts: { timeoutMs?: number; fetchImpl?: FetchLike } = {}): Promise<Position[]> {
  const addr = normalizeAddress(address);
  if (!addr) throw new PositionsError("address", "Not a Polygon address");
  const doFetch: FetchLike = opts.fetchImpl ?? (fetch as unknown as FetchLike);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? POSITIONS_TIMEOUT_MS);
  try {
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await doFetch(positionsUrl(addr), { headers: { accept: "application/json" }, signal: ctrl.signal });
    } catch (e) {
      if ((e as Error)?.name === "AbortError" || ctrl.signal.aborted) throw new PositionsError("timeout", "Polymarket Data API timed out");
      throw new PositionsError("network", String((e as Error)?.message ?? e).slice(0, 200));
    }
    if (!res.ok) throw new PositionsError("http", `HTTP ${res.status}`, res.status);
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      if (ctrl.signal.aborted) throw new PositionsError("timeout", "Polymarket Data API timed out");
      throw new PositionsError("shape", "Positions response is not JSON");
    }
    return openPositions(parsePositions(body));
  } catch (e) {
    if (e instanceof PositionsError) throw e;
    throw new PositionsError("network", String((e as Error)?.message ?? e).slice(0, 200));
  } finally {
    clearTimeout(timer);
  }
}
