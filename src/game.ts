// Daily clock-in loop: streak, XP, levels, badges, weekly recap.
// Pure functions only (no React Native imports) so they run in the offline selftest.
// Everything is local to the phone. No server, no tokens, no money.
import { en, t, tn, type Key } from "./i18n";
import { IS_MONAD } from "./edition";

export type ActionKind = "verify" | "tamper" | "anchor" | "add_market" | "early_catch" | "puzzle_win" | "puzzle_play" | "rule_play" | "pack_open" | "positions_sync" | "learn";

export const XP: Record<ActionKind | "clock_in", number> = {
  clock_in: 10,
  verify: 20,
  tamper: 15,
  anchor: 50,
  add_market: 10,
  early_catch: 40,
  puzzle_win: 15,
  puzzle_play: 5,
  rule_play: 5,
  pack_open: 30,
  positions_sync: 20,
  learn: 10,
};

/** English labels, kept for reference; screens use actionLabel() for the current language. */
export const ACTION_LABEL: Record<ActionKind | "clock_in", string> = {
  clock_in: en["xp.clock_in"],
  verify: en["xp.verify"],
  tamper: en["xp.tamper"],
  anchor: en["xp.anchor"],
  add_market: en["xp.add_market"],
  early_catch: en["xp.early_catch"],
  puzzle_win: en["xp.puzzle_win"],
  puzzle_play: en["xp.puzzle_play"],
  rule_play: en["xp.rule_play"],
  pack_open: en["xp.pack_open"],
  positions_sync: en["xp.positions_sync"],
  learn: en["xp.learn"],
};
export const actionLabel = (k: ActionKind | "clock_in") => t(`xp.${k}` as Key);

// Level names double as ids (stored level-up results compare them), so they stay English here.
export const LEVELS = [
  { name: en["level.0"], min: 0 },
  { name: en["level.1"], min: 100 },
  { name: en["level.2"], min: 300 },
  { name: en["level.3"], min: 700 },
] as const;
/** Level name in the current language. */
export const levelName = (index: number) => t(`level.${Math.max(0, Math.min(LEVELS.length - 1, index))}` as Key);

export const BADGES = [
  { id: "first_verify", name: en["badge.first_verify.name"], hint: en["badge.first_verify.hint"] },
  { id: "tamper_caught", name: en["badge.tamper_caught.name"], hint: en["badge.tamper_caught.hint"] },
  { id: "first_receipt", name: en["badge.first_receipt.name"], hint: en["badge.first_receipt.hint"] },
  { id: "streak_7", name: en["badge.streak_7.name"], hint: en["badge.streak_7.hint"] },
  { id: "early_dispute", name: en["badge.early_dispute.name"], hint: en["badge.early_dispute.hint"] },
  { id: "watch_5", name: en["badge.watch_5.name"], hint: en["badge.watch_5.hint"] },
  { id: "puzzles", name: en["badge.puzzles.name"], hint: en["badge.puzzles.hint"] },
  { id: "pack_opener", name: en["badge.pack_opener.name"], hint: en["badge.pack_opener.hint"] },
  { id: "skr_holder", name: en["badge.skr_holder.name"], hint: en["badge.skr_holder.hint"] },
] as const;
export type BadgeId = (typeof BADGES)[number]["id"];
/** Badges a player can earn in this build. The Monad edition has no evidence-pack payment and no token perks. */
export const SHOWN_BADGES: readonly (typeof BADGES)[number][] = IS_MONAD ? BADGES.filter((b) => b.id !== "pack_opener" && b.id !== "skr_holder") : BADGES;
export const badgeName = (id: BadgeId) => t(`badge.${id}.name` as Key);
export const badgeHint = (id: BadgeId) => t(`badge.${id}.hint` as Key);

export interface GameEvent {
  at: string; // ISO time
  day: string; // local day YYYY-MM-DD
  kind: ActionKind | "clock_in";
  xp: number;
}

export interface GameState {
  v: 1;
  xp: number;
  streak: number;
  best: number;
  lastClockIn?: string; // local day
  clockIns: string[]; // last 60 local days with a clock-in
  savedDays: string[]; // days bridged by the weekly free miss
  freeMissWeek?: string; // week id (Monday) in which the free miss was used
  badges: Partial<Record<BadgeId, string>>; // id -> ISO unlock time
  done: string[]; // dedupe keys so XP cannot be farmed
  events: GameEvent[]; // last 300
}

export const NEW_GAME: GameState = { v: 1, xp: 0, streak: 0, best: 0, clockIns: [], savedDays: [], badges: {}, done: [], events: [] };

// ---- dates (local days as strings) -----------------------------------------

export function dayOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function toUtc(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}
export function addDays(day: string, n: number): string {
  const d = new Date(toUtc(day) + n * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
/** Monday of the week containing the day. */
export function weekStart(day: string): string {
  const dow = (new Date(toUtc(day)).getUTCDay() + 6) % 7; // Mon=0
  return addDays(day, -dow);
}

// ---- levels ----------------------------------------------------------------

export function levelOf(xp: number) {
  let i = 0;
  for (let k = 0; k < LEVELS.length; k++) if (xp >= LEVELS[k].min) i = k;
  const cur = LEVELS[i];
  const next = LEVELS[i + 1];
  const progress = next ? (xp - cur.min) / (next.min - cur.min) : 1;
  return { index: i, name: cur.name, next: next?.name, toNext: next ? next.min - xp : 0, progress: Math.min(1, Math.max(0, progress)) };
}

// ---- streak ----------------------------------------------------------------

export interface ClockInResult {
  state: GameState;
  already: boolean;
  gained: number;
  usedFreeMiss: boolean;
  lostStreak: boolean;
  levelUp?: string;
  badges: BadgeId[];
}

/**
 * Daily clock-in. `boost` (SKR holder perk) turns the base XP into the local XP the phone credits.
 * The XP listeners, and so the League, see exactly the base clock-in, as if there were no boost.
 */
export function clockIn(s: GameState, now: Date = new Date(), opts: { boost?: (baseXp: number) => number; skrHolder?: boolean } = {}): ClockInResult {
  const day = dayOf(now);
  if (s.lastClockIn === day) return { state: s, already: true, gained: 0, usedFreeMiss: false, lostStreak: false, badges: [] };
  let streak = 1;
  let usedFreeMiss = false;
  let lostStreak = false;
  let freeMissWeek = s.freeMissWeek;
  const savedDays = [...s.savedDays];
  if (s.lastClockIn) {
    const gap = daysBetween(s.lastClockIn, day);
    if (gap === 1) streak = s.streak + 1;
    else if (gap === 2) {
      const missed = addDays(s.lastClockIn, 1);
      const wk = weekStart(missed);
      if (freeMissWeek !== wk && s.streak > 0) {
        streak = s.streak + 1;
        usedFreeMiss = true;
        freeMissWeek = wk;
        savedDays.push(missed);
      } else {
        lostStreak = s.streak > 1;
      }
    } else if (gap > 2) lostStreak = s.streak > 1;
  }
  const bonus = Math.min(streak, 7) * 2;
  const baseGained = XP.clock_in + bonus;
  const boosted = opts.boost ? opts.boost(baseGained) : baseGained;
  const gained = Number.isFinite(boosted) && boosted > baseGained ? Math.round(boosted) : baseGained;
  const base: GameState = {
    ...s,
    streak,
    best: Math.max(s.best, streak),
    lastClockIn: day,
    clockIns: [...s.clockIns.filter((d) => d !== day), day].slice(-60),
    savedDays: savedDays.slice(-30),
    freeMissWeek,
  };
  const r = credit(base, "clock_in", baseGained, now);
  let st = r.state;
  let levelUp = r.levelUp;
  if (gained > baseGained) {
    // The extra is local only: added after the listeners ran, on the same clock-in event.
    const before = levelOf(st.xp).index;
    const events = st.events.slice();
    const last = events[events.length - 1];
    events[events.length - 1] = { ...last, xp: last.xp + gained - baseGained };
    st = { ...st, xp: st.xp + gained - baseGained, events };
    const after = levelOf(st.xp).index;
    if (after > before) levelUp = LEVELS[after].name;
  }
  const b = unlockBadges(st, { watching: 0, skrHolder: opts.skrHolder }, now);
  return { state: b.state, already: false, gained, usedFreeMiss, lostStreak, levelUp, badges: b.unlocked };
}

/** True when today's clock-in is still open. */
export function canClockIn(s: GameState, now: Date = new Date()): boolean {
  return s.lastClockIn !== dayOf(now);
}

/** Streak shown on screen: a streak that can no longer be saved reads 0. */
export function liveStreak(s: GameState, now: Date = new Date()): number {
  if (!s.lastClockIn) return 0;
  const gap = daysBetween(s.lastClockIn, dayOf(now));
  if (gap <= 1) return s.streak;
  if (gap === 2 && s.freeMissWeek !== weekStart(addDays(s.lastClockIn, 1))) return s.streak;
  return 0;
}

export interface WeekCell {
  day: string;
  label: string;
  done: boolean;
  saved: boolean;
  today: boolean;
}
/** The last 7 days ending today, for the Home row. */
export function lastSeven(s: GameState, now: Date = new Date()): WeekCell[] {
  const today = dayOf(now);
  const out: WeekCell[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = addDays(today, -i);
    out.push({
      day,
      label: t(`week.${(new Date(toUtc(day)).getUTCDay() + 6) % 7}` as Key),
      done: s.clockIns.includes(day),
      saved: s.savedDays.includes(day),
      today: i === 0,
    });
  }
  return out;
}

// ---- xp --------------------------------------------------------------------

// One place that sees every XP award, so other modules (for example a league) can report it.
type XpListener = (e: { kind: ActionKind | "clock_in"; xp: number; at: string; total: number }) => void;
const xpListeners: XpListener[] = [];
export function onXpAwarded(fn: XpListener): () => void {
  xpListeners.push(fn);
  return () => {
    const i = xpListeners.indexOf(fn);
    if (i >= 0) xpListeners.splice(i, 1);
  };
}

function credit(s: GameState, kind: ActionKind | "clock_in", xp: number, now: Date): { state: GameState; levelUp?: string } {
  const before = levelOf(s.xp).index;
  const next: GameState = {
    ...s,
    xp: s.xp + xp,
    events: [...s.events, { at: now.toISOString(), day: dayOf(now), kind, xp }].slice(-300),
  };
  const after = levelOf(next.xp).index;
  for (const fn of xpListeners) {
    try {
      fn({ kind, xp, at: now.toISOString(), total: next.xp });
    } catch {
      // a listener must never break the game loop
    }
  }
  return { state: next, levelUp: after > before ? LEVELS[after].name : undefined };
}

export interface ActionResult {
  state: GameState;
  gained: number;
  levelUp?: string;
  badges: BadgeId[];
}

/**
 * Credit a useful action. `ref` makes it count once (for example the market id),
 * so repeating the same thing does not farm XP. Anchors always count: each is a real receipt.
 */
export function applyAction(
  s: GameState,
  kind: ActionKind,
  opts: { ref?: string; watching?: number; disputed?: boolean } = {},
  now: Date = new Date()
): ActionResult {
  const dedupe = kind === "anchor" ? null : `${kind}:${kind === "tamper" ? `${opts.ref ?? ""}:${dayOf(now)}` : (opts.ref ?? "")}`;
  let st = s;
  let gained = 0;
  let levelUp: string | undefined;
  if (!dedupe || !s.done.includes(dedupe)) {
    gained = XP[kind];
    const c = credit(dedupe ? { ...s, done: [...s.done, dedupe].slice(-400) } : s, kind, gained, now);
    st = c.state;
    levelUp = c.levelUp;
  }
  const b = unlockBadges(st, { watching: opts.watching ?? 0, earlyDisputed: kind === "early_catch" && !!opts.disputed, justDid: kind, gained: gained > 0 }, now);
  return { state: b.state, gained, levelUp, badges: b.unlocked };
}

// ---- badges ----------------------------------------------------------------

interface BadgeCtx {
  watching: number;
  earlyDisputed?: boolean;
  justDid?: ActionKind;
  gained?: boolean;
  skrHolder?: boolean; // the connected wallet holds at least the Holder tier of SKR
}

export function unlockBadges(s: GameState, ctx: BadgeCtx, now: Date = new Date()): { state: GameState; unlocked: BadgeId[] } {
  const has = (id: BadgeId) => !!s.badges[id];
  const want: BadgeId[] = [];
  const count = (k: ActionKind) => s.events.filter((e) => e.kind === k).length;
  if (!has("first_verify") && count("verify") > 0) want.push("first_verify");
  if (!has("tamper_caught") && count("tamper") > 0) want.push("tamper_caught");
  if (!has("first_receipt") && count("anchor") > 0) want.push("first_receipt");
  if (!has("streak_7") && s.streak >= 7) want.push("streak_7");
  if (!has("early_dispute") && ctx.earlyDisputed) want.push("early_dispute");
  if (!has("watch_5") && ctx.watching >= 5) want.push("watch_5");
  if (!has("puzzles") && count("puzzle_win") >= 3) want.push("puzzles");
  if (!has("pack_opener") && count("pack_open") > 0) want.push("pack_opener");
  if (!has("skr_holder") && ctx.skrHolder) want.push("skr_holder");
  if (!want.length) return { state: s, unlocked: [] };
  const badges = { ...s.badges };
  for (const id of want) badges[id] = now.toISOString();
  return { state: { ...s, badges }, unlocked: want };
}

// ---- weekly recap ----------------------------------------------------------

export interface Recap {
  clockIns: number;
  early: number;
  receipts: number;
  xp: number;
  text: string;
}

export function weeklyRecap(s: GameState, now: Date = new Date()): Recap {
  const start = weekStart(dayOf(now));
  const inWeek = s.events.filter((e) => e.day >= start);
  const clockIns = s.clockIns.filter((d) => d >= start).length;
  const early = inWeek.filter((e) => e.kind === "early_catch").length;
  const receipts = inWeek.filter((e) => e.kind === "anchor").length;
  const xp = inWeek.reduce((a, e) => a + e.xp, 0);
  return {
    clockIns,
    early,
    receipts,
    xp,
    text: t("recap.text", { clockIns: tn("recap.clockIns", clockIns), changes: tn("recap.changes", early), receipts: tn("recap.receipts", receipts) }),
  };
}

// ---- storage shape check ---------------------------------------------------

export function sanitizeGame(raw: unknown): GameState {
  if (!raw || typeof raw !== "object") return { ...NEW_GAME };
  const r = raw as Partial<GameState>;
  const arr = <T,>(v: unknown, f: (x: unknown) => x is T): T[] => (Array.isArray(v) ? v.filter(f) : []);
  const isStr = (x: unknown): x is string => typeof x === "string";
  const isEv = (x: unknown): x is GameEvent => !!x && typeof x === "object" && isStr((x as GameEvent).day) && typeof (x as GameEvent).xp === "number";
  return {
    v: 1,
    xp: typeof r.xp === "number" && r.xp >= 0 ? r.xp : 0,
    streak: typeof r.streak === "number" && r.streak >= 0 ? r.streak : 0,
    best: typeof r.best === "number" ? r.best : 0,
    lastClockIn: isStr(r.lastClockIn) ? r.lastClockIn : undefined,
    clockIns: arr(r.clockIns, isStr),
    savedDays: arr(r.savedDays, isStr),
    freeMissWeek: isStr(r.freeMissWeek) ? r.freeMissWeek : undefined,
    badges: r.badges && typeof r.badges === "object" ? r.badges : {},
    done: arr(r.done, isStr),
    events: arr(r.events, isEv),
  };
}
