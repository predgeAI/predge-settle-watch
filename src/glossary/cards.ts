// Glossary cards: plain-English collectibles unlocked by doing things in the app.
// Unlock state is derived from the game log, so it needs no storage of its own.
import type { GameState } from "../game";

export interface Card {
  id: string;
  title: string;
  text: string; // 2-3 short lines
  hint: string; // how to unlock it
  icon: string; // pixel icon name
  color: string;
}

export const CARDS: Card[] = [
  { id: "dispute", title: "What is a dispute?", icon: "caution", color: "#e2703a", hint: "Free card",
    text: "After a market closes, someone proposes the answer. If another trader thinks it is wrong, they dispute it. More checks follow." },
  { id: "proposal", title: "The proposal", icon: "bell", color: "#28bee6", hint: "Play your first Daily Dispute",
    text: "The first answer posted for a market. If nobody disputes it, it usually becomes the final answer." },
  { id: "clarification", title: "Clarifications", icon: "receipt", color: "#b98bff", hint: "Watch your first market",
    text: "Sometimes the market owner adds a note to explain the rules. A note can change how the answer is read." },
  { id: "uma", title: "What is a UMA vote?", icon: "eye", color: "#b98bff", hint: "Clock in for the first time",
    text: "UMA is the group that settles disputes. Its token holders vote on the right answer. Voting takes time." },
  { id: "final", title: "Resolved vs final", icon: "settled", color: "#86e28a", hint: "Play a Daily Dispute",
    text: "Resolved means an answer was posted. Final means it is locked on chain. They are not always the same moment." },
  { id: "signature", title: "What a signature proves", icon: "check", color: "#86e28a", hint: "Verify a record on your phone",
    text: "Predge signs every record. Your phone checks the signature, so you know nothing changed on the way." },
  { id: "tamper", title: "The tamper test", icon: "tamper", color: "#e2703a", hint: "Run the tamper test",
    text: "Change one character and the signature fails. That is the point: edits get caught." },
  { id: "receipt", title: "What a Solana receipt is", icon: "receipt", color: "#b98bff", hint: "Anchor your first receipt",
    text: "A small public note on Solana with a fingerprint of what you saw. It shows what you saw, and when." },
  { id: "rules", title: "Why rules matter", icon: "question", color: "#c2ffc4", hint: "Watch 3 markets",
    text: "A market settles by its written rules, not by what felt fair. One unclear word can move the result." },
  { id: "differently", title: "Settled differently", icon: "cross", color: "#e2703a", hint: "Call 2 Daily Disputes",
    text: "In 2026, about 1 in 3 disputed markets ended with a different answer than the first proposal." },
  { id: "daily", title: "Why look every day", icon: "flame", color: "#e2703a", hint: "Reach a 3-day streak",
    text: "Disputes move fast. A short daily look keeps you ahead of the news." },
  { id: "bond", title: "What a bond is", icon: "tamper", color: "#86e28a", hint: "Reach a 7-day streak",
    text: "Proposers lock a deposit, called a bond. A wrong answer can lose it. That keeps answers honest." },
];

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
