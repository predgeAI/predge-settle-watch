// Glossary cards: plain-English collectibles unlocked by doing things in the app.
// Unlock state is derived from the game log, so it needs no storage of its own.
import type { GameState } from "../game";
import { en, t, type Key } from "../i18n";

export interface Card {
  id: string;
  title: string;
  text: string; // 2-3 short lines
  hint: string; // how to unlock it
  icon: string; // pixel icon name
  color: string;
}

// English text comes from the i18n dictionary; cardTitle/cardText/cardHint give the current language.
export const CARDS: Card[] = (
  [
    ["dispute", "caution", "#e2703a"],
    ["proposal", "bell", "#28bee6"],
    ["clarification", "receipt", "#b98bff"],
    ["uma", "eye", "#b98bff"],
    ["final", "settled", "#86e28a"],
    ["signature", "check", "#86e28a"],
    ["tamper", "tamper", "#e2703a"],
    ["receipt", "receipt", "#b98bff"],
    ["rules", "question", "#c2ffc4"],
    ["differently", "cross", "#e2703a"],
    ["daily", "flame", "#e2703a"],
    ["bond", "tamper", "#86e28a"],
  ] as const
).map(([id, icon, color]) => ({
  id,
  icon,
  color,
  title: en[`card.${id}.title` as Key],
  text: en[`card.${id}.text` as Key],
  hint: en[`card.${id}.hint` as Key],
}));

export const cardTitle = (c: Card) => t(`card.${c.id}.title` as Key);
export const cardText = (c: Card) => t(`card.${c.id}.text` as Key);
export const cardHint = (c: Card) => t(`card.${c.id}.hint` as Key);

export function unlockedCards(g: GameState): string[] {
  const n = (k: string) => g.events.filter((e) => e.kind === k).length;
  const puzzles = n("puzzle_win") + n("puzzle_play");
  const has: Record<string, boolean> = {
    dispute: true,
    proposal: puzzles >= 1,
    clarification: n("add_market") >= 1,
    uma: n("clock_in") >= 1,
    final: puzzles >= 1,
    signature: n("verify") >= 1,
    tamper: n("tamper") >= 1,
    receipt: n("anchor") >= 1,
    rules: n("add_market") >= 3,
    differently: puzzles >= 2,
    daily: g.best >= 3,
    bond: g.best >= 7,
  };
  return CARDS.filter((c) => has[c.id]).map((c) => c.id);
}
