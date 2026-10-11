// Daily clock-in loop: streak, XP, levels, badges, weekly recap.
// Pure functions only (no React Native imports) so they run in the offline selftest.
// Everything is local to the phone. No server, no tokens, no money.

export type ActionKind = "verify" | "tamper" | "anchor" | "add_market" | "early_catch" | "puzzle_win" | "puzzle_play" | "rule_play";

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
};

export const ACTION_LABEL: Record<ActionKind | "clock_in", string> = {
  clock_in: "Clocked in",
  verify: "Verified a record on this phone",
  tamper: "Ran the tamper test",
  anchor: "Anchored a receipt on Solana",
  add_market: "Added a market",
  early_catch: "Caught a change within 1 h",
  puzzle_win: "Called the Daily Dispute right",
  puzzle_play: "Played the Daily Dispute",
  rule_play: "Spotted a risky phrase (once per case)",
};

export const LEVELS = [
  { name: "Watcher", min: 0 },
  { name: "Verifier", min: 100 },
  { name: "Settler", min: 300 },
  { name: "Oracle", min: 700 },
] as const;

export const BADGES = [
  { id: "first_verify", name: "First verify", hint: "Verify a record on this phone" },
  { id: "tamper_caught", name: "Tamper caught", hint: "Run the tamper test and see it rejected" },
  { id: "first_receipt", name: "First receipt on Solana", hint: "Anchor a watch receipt" },
  { id: "streak_7", name: "7-day streak", hint: "Clock in 7 days in a row" },
  { id: "early_dispute", name: "Dispute spotted early", hint: "Open a disputed market within 1 h of the alert" },
  { id: "watch_5", name: "5 markets watched", hint: "Watch 5 markets at once" },
  { id: "puzzles", name: "Puzzles solved", hint: "Call 3 Daily Disputes right" },
] as const;
export type BadgeId = (typeof BADGES)[number]["id"];

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

export function clockIn(s: GameState, now: Date = new Date()): ClockInResult {
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
  const gained = XP.clock_in + bonus;
  const base: GameState = {
    ...s,
    streak,
    best: Math.max(s.best, streak),
    lastClockIn: day,
    clockIns: [...s.clockIns.filter((d) => d !== day), day].slice(-60),
    savedDays: savedDays.slice(-30),
    freeMissWeek,
  };
  const r = credit(base, "clock_in", gained, now);
  const b = unlockBadges(r.state, { watching: 0 }, now);
  return { state: b.state, already: false, gained, usedFreeMiss, lostStreak, levelUp: r.levelUp, badges: b.unlocked };
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
  const L = ["M", "T", "W", "T", "F", "S", "S"];
  const out: WeekCell[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = addDays(today, -i);
    out.push({
      day,
      label: L[(new Date(toUtc(day)).getUTCDay() + 6) % 7],
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
  const pl = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  return {
    clockIns,
    early,
    receipts,
    xp,
    text: `This week: ${pl(clockIns, "clock-in")}, ${pl(early, "change")} caught early, ${pl(receipts, "receipt")} on Solana`,
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
