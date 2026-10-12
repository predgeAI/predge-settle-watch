// Daily Dispute: one real, historical disputed market per local day. Pure functions, no React.
import { addDays, daysBetween } from "../game";
import { t } from "../i18n";

export interface Puzzle {
  id: string;
  q: string; // market question
  proposal: string; // the disputed proposed answer
  final: string; // final on-chain result
  date: string; // first dispute date, YYYY-MM-DD
  diff: 0 | 1; // 1 = settled differently from the disputed proposal
  cat: string;
}

export type Pick = "hold" | "change";

export interface PuzzleState {
  v: 1;
  plays: Record<string, { pick: Pick; correct: boolean }>; // by local day
  streak: number;
  best: number;
  lastDay?: string;
  solved: number; // calls that were right
}

export const NEW_PUZZLE_STATE: PuzzleState = { v: 1, plays: {}, streak: 0, best: 0, solved: 0 };
export const PUZZLE_EPOCH = "2026-10-01";

/** Puzzle number shown to the player: 1 on the epoch day. */
export function puzzleNumber(day: string): number {
  return Math.max(1, daysBetween(PUZZLE_EPOCH, day) + 1);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fixed shuffle of 0..n-1, so every install shows the same puzzle on the same day. */
export function shuffledOrder(n: number, seed = 20261001): number[] {
  const rnd = mulberry32(seed);
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Same puzzle all day, no repeats until the whole set has been used. */
export function puzzleFor(day: string, puzzles: Puzzle[]): { number: number; puzzle: Puzzle } {
  const number = puzzleNumber(day);
  const order = shuffledOrder(puzzles.length);
  return { number, puzzle: puzzles[order[(number - 1) % puzzles.length]] };
}

export function playedToday(s: PuzzleState, day: string) {
  return s.plays[day] ?? null;
}

export function isCorrect(pick: Pick, p: Puzzle): boolean {
  return (pick === "change") === (p.diff === 1);
}

export interface PlayResult {
  state: PuzzleState;
  already: boolean;
  correct: boolean;
}

/** Locks the day after the first call. The streak counts consecutive days played. */
export function play(s: PuzzleState, day: string, pick: Pick, p: Puzzle): PlayResult {
  const prev = playedToday(s, day);
  if (prev) return { state: s, already: true, correct: prev.correct };
  const correct = isCorrect(pick, p);
  const streak = s.lastDay && daysBetween(s.lastDay, day) === 1 ? s.streak + 1 : 1;
  const plays = { ...s.plays, [day]: { pick, correct } };
  const keep = Object.keys(plays).sort().slice(-60);
  const trimmed: PuzzleState["plays"] = {};
  for (const k of keep) trimmed[k] = plays[k];
  return {
    state: { v: 1, plays: trimmed, streak, best: Math.max(s.best, streak), lastDay: day, solved: s.solved + (correct ? 1 : 0) },
    already: false,
    correct,
  };
}

/** Streak to show: it reads 0 once a whole day has been skipped. */
export function liveStreak(s: PuzzleState, day: string): number {
  if (!s.lastDay) return 0;
  return daysBetween(s.lastDay, day) <= 1 ? s.streak : 0;
}

export function shareText(number: number, correct: boolean, streak: number): string {
  return t("dd.share", { n: number, mark: correct ? "✅" : "❌", streak });
}

/** One plain line for the reveal. */
export function revealLine(p: Puzzle): string {
  return p.diff === 1 ? t("dd.revealDiff", { final: p.final }) : t("dd.revealStood", { final: p.final });
}

export function sanitizePuzzleState(raw: unknown): PuzzleState {
  if (!raw || typeof raw !== "object") return { ...NEW_PUZZLE_STATE, plays: {} };
  const r = raw as Partial<PuzzleState>;
  const plays: PuzzleState["plays"] = {};
  if (r.plays && typeof r.plays === "object") {
    for (const [k, v] of Object.entries(r.plays)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && v && (v.pick === "hold" || v.pick === "change") && typeof v.correct === "boolean") plays[k] = v;
    }
  }
  return {
    v: 1,
    plays,
    streak: typeof r.streak === "number" && r.streak >= 0 ? r.streak : 0,
    best: typeof r.best === "number" && r.best >= 0 ? r.best : 0,
    lastDay: typeof r.lastDay === "string" ? r.lastDay : undefined,
    solved: typeof r.solved === "number" && r.solved >= 0 ? r.solved : 0,
  };
}

export { addDays };
