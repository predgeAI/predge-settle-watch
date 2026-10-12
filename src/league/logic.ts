// Pure helpers for the League. No React Native imports, so they run in the offline selftest.
import { joinList, t, type Key } from "../i18n";

export const AVATAR_COUNT = 16;
export const EMBLEM_COUNT = 12;

export const AVATAR_IDS = Array.from({ length: AVATAR_COUNT }, (_, i) => `a${String(i).padStart(2, "0")}`);
export const EMBLEM_IDS = Array.from({ length: EMBLEM_COUNT }, (_, i) => `e${String(i).padStart(2, "0")}`);

/** Palette per avatar: [main, dark]. */
const AVATAR_COLORS: [string, string][] = [
  ["#86e28a", "#2f6b38"], ["#b98bff", "#5a2fa8"], ["#e2703a", "#8a3e1a"], ["#28bee6", "#146a85"],
  ["#ffd29a", "#a06a2c"], ["#ff5d4d", "#8a2a22"], ["#c2ffc4", "#55965a"], ["#9945ff", "#3e1a80"],
];

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** A fixed 8x8 pixel face per avatar id: mirrored body, two eyes. Same id always gives the same picture. */
export function avatarMap(id: string): { map: string[]; palette: Record<string, string> } {
  const n = Math.max(0, Math.min(AVATAR_COUNT - 1, Number(id.slice(1)) || 0));
  const [main, dark] = AVATAR_COLORS[n % AVATAR_COLORS.length];
  const r = rng(0x9e3779b1 * (n + 1));
  const rows: string[] = [];
  for (let y = 0; y < 8; y++) {
    const half: string[] = [];
    for (let x = 0; x < 4; x++) {
      const edge = x === 0 ? 0.35 : 0.8;
      const vertical = y === 0 || y === 7 ? 0.45 : 1;
      half.push(r() < edge * vertical + (y >= 2 && y <= 5 && x >= 2 ? 0.2 : 0) ? "A" : ".");
    }
    rows.push(half.join("") + [...half].reverse().join(""));
  }
  // Face: always filled middle, two dark eyes, so every avatar reads as a little creature.
  const set = (y: number, x: number, c: string) => (rows[y] = rows[y].slice(0, x) + c + rows[y].slice(x + 1));
  for (let y = 2; y <= 5; y++) for (let x = 2; x <= 5; x++) set(y, x, "A");
  set(3, 2, "B"); set(3, 5, "B");
  const mouth = n % 3;
  if (mouth === 0) { set(5, 3, "B"); set(5, 4, "B"); } else if (mouth === 1) set(5, 3, "B"), set(5, 4, "B"), set(4, 2, ".") , set(4, 5, ".");
  return { map: rows, palette: { A: main, B: dark } };
}

const EMBLEMS: string[][] = [
  ["...AA...", "...AA...", "AAAAAAAA", ".AAAAAA.", "..AAAA..", ".AAAAAA.", ".AA..AA.", "AA....AA"], // star
  ["AAAAAAAA", "AAAAAAAA", "AAAAAAAA", "AAAAAAAA", ".AAAAAA.", "..AAAA..", "...AA...", "........"], // shield
  ["....AA..", "...AA...", "..AA....", ".AAAAAA.", "...AA...", "..AA....", ".AA.....", "AA......"], // bolt
  ["...A....", "..AA....", "..AAA...", ".AAAA.A.", ".AAAAAA.", ".AAAAAA.", ".AAAAA..", "..AAA..."], // flame
  ["A.A..A.A", "AAAAAAAA", "AAAAAAAA", ".AAAAAA.", ".AAAAAA.", "........", "........", "........"], // crown
  [".AA..AA.", "AAAAAAAA", "AAAAAAAA", "AAAAAAAA", ".AAAAAA.", "..AAAA..", "...AA...", "........"], // heart
  ["..AAAA..", ".AA.....", "AA......", "AA......", "AA......", ".AA.....", "..AAAA..", "........"], // moon
  ["..AAAA..", ".AAAAAA.", "AAAAAAAA", ".AAAAAA.", "..AAAA..", "...AA...", "........", "........"], // gem
  ["......AA", ".....AA.", "....AA..", "A..AA...", ".AAA....", "..AA....", ".A.AA...", "A...A..."], // sword
  ["....AAAA", "..AAAAAA", ".AAAAAAA", ".AAAAAA.", ".AAAAA..", "AA.AA...", "A.......", "........"], // leaf
  ["..AAAA..", ".AAAAAA.", "AA.AA.AA", "AAAAAAAA", "AAAAAAAA", "AAAAAAAA", "AAAAAAAA", "AA.AA.AA"], // ghost
  ["...AA...", "..AAAA..", ".AAAAAA.", "AAAAAAAA", "AAAAAAAA", "AAAAAAAA", "........", "........"], // peak
];
const EMBLEM_COLORS = ["#ffd29a", "#28bee6", "#ffd29a", "#e2703a", "#ffd29a", "#ff5d4d", "#b98bff", "#c2ffc4", "#93a898", "#86e28a", "#e9f3ea", "#28bee6"];

export function emblemMap(id: string): { map: string[]; color: string } {
  const n = Math.max(0, Math.min(EMBLEM_COUNT - 1, Number(id.slice(1)) || 0));
  return { map: EMBLEMS[n], color: EMBLEM_COLORS[n] };
}

export const MEDALS = [
  { rank: 1, name: "Gold", main: "#ffd24d", dark: "#a67c00" },
  { rank: 2, name: "Silver", main: "#d7dde2", dark: "#7b858c" },
  { rank: 3, name: "Bronze", main: "#d9894a", dark: "#7a4217" },
] as const;
export const medalFor = (rank: number | null | undefined) => (rank && rank >= 1 && rank <= 3 ? MEDALS[rank - 1] : null);
export const MEDAL_MAP = [".RR..RR.", ".RR..RR.", "..AAAA..", ".AABBAA.", "AABBBBAA", "AABBBBAA", ".AABBAA.", "..AAAA.."];

/** Idempotency key for an XP event. The same event always gives the same key, so retries never double count. */
export function xpKey(e: { kind: string; at: string; total: number }): string {
  const t = Date.parse(e.at);
  return `${e.kind}-${Number.isFinite(t) ? t : 0}-${e.total}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64).padEnd(8, "0");
}

/** Pulls an invite code out of settlewatch://invite/CODE or https://.../i/CODE. */
export function inviteCodeFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /(?:^settlewatch:\/\/invite\/|\/i\/)([A-Za-z0-9]{8})(?:[/?#]|$)/.exec(url);
  return m ? m[1].toUpperCase() : null;
}

export function inviteShareText(link: string, code: string): string {
  return t("lg.inviteShare", { code, link });
}

export function clanShareText(name: string, code: string): string {
  return t("lg.clanShare", { name, code });
}

export function shortCountdown(ms: number): string {
  if (ms <= 0) return t("lg.resetting");
  const h = Math.floor(ms / 3600_000);
  const d = Math.floor(h / 24);
  return d > 0 ? t("lg.cdDays", { d, h: h % 24 }) : t("lg.cdHours", { h, m: Math.floor((ms % 3600_000) / 60_000) });
}

export function passedLine(names: string[]): string | null {
  if (!names.length) return null;
  if (names.length === 1) return t("lg.passedOne", { name: names[0] });
  return t("lg.passedMany", { names: joinList(names.slice(0, -1)), last: names[names.length - 1] });
}

const FRIENDLY = new Set(["rate_limited", "unauthorized", "nickname_taken", "nickname_not_allowed", "clan_full"]);
export function friendlyError(code: string | undefined, message: string | undefined): string {
  return (code && FRIENDLY.has(code) ? t(`lg.err.${code}` as Key) : "") || message || t("common.wrongRetry");
}

/**
 * Ranks leaderboard rows by weekly XP, highest first. Equal XP shares a rank (1, 1, 3).
 * The board list and the "This week" line both use this, so they always show the same rank.
 */
export function rankRows<R extends { weeklyXp: number; rank: number }>(rows: R[]): R[] {
  const sorted = [...rows].sort((a, b) => b.weeklyXp - a.weeklyXp);
  const out: R[] = [];
  sorted.forEach((r, i) => {
    const rank = i > 0 && sorted[i - 1].weeklyXp === r.weeklyXp ? out[i - 1].rank : i + 1;
    out.push({ ...r, rank });
  });
  return out;
}

/** Your rank on a board: from your own row when the board lists you, else the rank the server sent. */
export function boardRank(rows: { weeklyXp: number; rank: number; you: boolean }[], fallback: number | null | undefined): number | null {
  const mine = rankRows(rows).find((r) => r.you);
  return mine ? mine.rank : (fallback ?? null);
}

// ---------------------------------------------------------------- sign-in message check

/** How far the message's Issued At may be from the phone clock, either way. */
export const SIGN_IN_MAX_SKEW_MS = 10 * 60_000;

/** Host of a League URL such as https://settle-watch-league.vercel.app, lowercased. */
export function leagueHost(url: string): string {
  return (/^https:\/\/([^/?#:]+)/i.exec(url)?.[1] ?? "").toLowerCase();
}

/**
 * Checks the sign-in message the League server asks the wallet to sign, before the wallet opens. The
 * message is SIWS style: the first line names the domain, the second the wallet address, then fields
 * such as URI, Chain ID, Nonce, Issued At and Expiration Time. Returns null when it is acceptable, else a
 * short reason. The app never edits the message; it only refuses to sign one that is not for this League,
 * this wallet and now.
 */
export function checkSignInMessage(message: string, p: { domain: string; address: string; now: number }): string | null {
  if (typeof message !== "string" || !message || message.length > 1000) return "length";
  if (/\r/.test(message)) return "line endings";
  const lines = message.split("\n");
  const head = /^(\S+) wants you to sign in with your Solana account:$/.exec(lines[0] ?? "");
  if (!head) return "header";
  if (head[1].toLowerCase() !== p.domain.toLowerCase()) return "domain";
  if (lines[1] !== p.address) return "address";
  const fields = new Map<string, string>();
  for (const l of lines.slice(2)) {
    const m = /^(URI|Version|Chain ID|Nonce|Issued At|Expiration Time|Not Before|Request ID|Resources): (.*)$/.exec(l);
    if (!m) continue;
    if (fields.has(m[1])) return "duplicate field";
    fields.set(m[1], m[2]);
  }
  const uri = fields.get("URI");
  if (uri !== undefined && leagueHost(uri) !== p.domain.toLowerCase()) return "uri";
  if (!fields.get("Chain ID")) return "chain";
  if (!/^[A-Za-z0-9]{8,128}$/.test(fields.get("Nonce") ?? "")) return "nonce";
  const issued = Date.parse(fields.get("Issued At") ?? "");
  if (!Number.isFinite(issued)) return "issued at";
  if (Math.abs(p.now - issued) > SIGN_IN_MAX_SKEW_MS) return "issued at";
  const exp = fields.get("Expiration Time");
  if (exp !== undefined) {
    const e = Date.parse(exp);
    if (!Number.isFinite(e) || e <= p.now || e <= issued) return "expiration";
  }
  return null;
}

// ---------------------------------------------------------------- XP reporting

/**
 * Game actions the League server does not know. Its action table has no pack_open, so a report would be
 * rejected with unknown_action. These stay local XP and are never sent.
 */
export const LOCAL_ONLY_XP: readonly string[] = ["pack_open"];
export const reportsToLeague = (kind: string) => !LOCAL_ONLY_XP.includes(kind);
