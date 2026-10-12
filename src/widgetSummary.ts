// What the Android home-screen widget shows, built from the watchlist and game state.
// Pure (no React Native imports) so the offline selftest can check it. Every label is
// translated here, in the app's current language, because the native widget has no i18n.
import { liveStreak, type GameState } from "./game";
import { t, tk } from "./i18n";
import type { WatchItem } from "./store";

export const WIDGET_LEVELS = ["caution", "watch", "ok", "resolved"] as const;
const URGENT = ["caution", "watch"];
const TITLE_MAX = 80;

export interface WidgetSummary {
  v: 1;
  brand: string;
  tiles: { level: string; label: string; count: number }[]; // always caution, watch, ok, resolved
  topWord: string; // status word of the market that needs attention, "" when none
  topLevel: string;
  topTitle: string;
  topLine: string; // shown instead when nothing needs attention
  streak: number;
  streakLabel: string;
  checkedAt: number; // ms since epoch of the latest poll, 0 if never
  checked: string; // template with {ago}
  time: { never: string; s: string; m: string; h: string; d: string }; // templates with {n}
}

/** The caution market first, then watch; within a level the most recently changed one. */
export function topMarket(items: WatchItem[]): WatchItem | undefined {
  const rank = (i: WatchItem) => URGENT.indexOf(i.last?.risk_level ?? "");
  return items
    .filter((i) => rank(i) >= 0)
    .sort((a, b) => rank(a) - rank(b) || (b.lastChangeAt ?? "").localeCompare(a.lastChangeAt ?? ""))[0];
}

export function buildWidgetSummary(items: WatchItem[], game: GameState, now: Date = new Date()): WidgetSummary {
  const counts: Record<string, number> = { caution: 0, watch: 0, ok: 0, resolved: 0 };
  for (const i of items) if (i.last?.risk_level && counts[i.last.risk_level] !== undefined) counts[i.last.risk_level]++;
  const top = topMarket(items);
  const title = top ? (top.question ?? top.key) : "";
  const last = items.map((i) => i.lastPolledAt ?? "").sort().pop();
  const checkedAt = last ? Date.parse(last) : 0;
  return {
    v: 1,
    brand: "SETTLE WATCH",
    tiles: WIDGET_LEVELS.map((level) => ({ level, label: tk(`status.${level}.word`, level.toUpperCase()), count: counts[level] })),
    topWord: top ? tk(`status.${top.last!.risk_level}.word`, top.last!.risk_level.toUpperCase()) : "",
    topLevel: top?.last?.risk_level ?? "",
    topTitle: title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 3)}...` : title,
    topLine: items.length ? t("home.noAttention") : t("widget.empty"),
    streak: liveStreak(game, now),
    streakLabel: t("home.dayStreak"),
    checkedAt: Number.isFinite(checkedAt) ? checkedAt : 0,
    checked: t("card.checked"),
    time: { never: t("time.never"), s: t("time.s"), m: t("time.m"), h: t("time.h"), d: t("time.d") },
  };
}
