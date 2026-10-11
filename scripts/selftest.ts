// Offline checks for input validation and canonical JSON. Run: npm test
import assert from "node:assert/strict";
import { assertSettlementRisk, MAX_INPUT_LENGTH, parseMarketInput } from "../src/api";
import { canonicalize } from "../src/canonical";

let n = 0;
const t = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`ok ${n} ${name}`);
};

t("polymarket link -> slug", () =>
  assert.equal(parseMarketInput("https://polymarket.com/event/Will-X-Happen?tid=1"), "will-x-happen"));
t("www.polymarket.com link", () => assert.equal(parseMarketInput("https://www.polymarket.com/market/foo-bar"), "foo-bar"));
t("numeric market id", () => assert.equal(parseMarketInput(" 5186278 "), "5186278"));
t("condition id is lowercased", () => assert.equal(parseMarketInput("0x" + "A".repeat(64)), "0x" + "a".repeat(64)));
t("other hosts are rejected", () => assert.equal(parseMarketInput("https://evil.example/event/abc"), null));
t("lookalike host is rejected", () => assert.equal(parseMarketInput("https://polymarket.com.evil.io/x"), null));
t("spaces are rejected", () => assert.equal(parseMarketInput("abc def"), null));
t("path tricks are rejected", () => assert.equal(parseMarketInput("../../v1/admin"), null));
t("over-long input is rejected", () => assert.equal(parseMarketInput("a".repeat(MAX_INPUT_LENGTH + 1)), null));
t("over-long id is rejected", () => assert.equal(parseMarketInput("1".repeat(20)), null));

const good = {
  market: { market_id: "5186278", condition_id: "0x" + "1".repeat(64), slug: "s", question: "Q?", uma_question_id: "0x" },
  risk_level: "caution",
  uma_state: "Disputed",
  recommendation: "r",
  dispute_count: "1",
  disputes: [],
};
t("well-formed response is accepted", () => assert.equal(assertSettlementRisk(good).market.market_id, "5186278"));
t("unknown risk level is rejected", () => assert.throws(() => assertSettlementRisk({ ...good, risk_level: "pwned" })));
t("non-numeric market id is rejected", () =>
  assert.throws(() => assertSettlementRisk({ ...good, market: { ...good.market, market_id: "1;drop" } })));
t("missing market is rejected", () => assert.throws(() => assertSettlementRisk({ ...good, market: null })));

t("canonical JSON sorts keys at every level", () =>
  assert.equal(canonicalize({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } }), '{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}'));


// ---- clock-in loop: streak, XP, levels, badges, recap ----
import {
  applyAction,
  canClockIn,
  clockIn,
  levelOf,
  lastSeven,
  liveStreak,
  NEW_GAME,
  sanitizeGame,
  weekStart,
  weeklyRecap,
  XP,
} from "../src/game";

const at = (day: string) => new Date(`${day}T12:00:00`);

t("level thresholds and names", () => {
  assert.equal(levelOf(0).name, "Watcher");
  assert.equal(levelOf(99).name, "Watcher");
  assert.equal(levelOf(100).name, "Verifier");
  assert.equal(levelOf(300).name, "Settler");
  assert.equal(levelOf(5000).name, "Oracle");
  assert.equal(levelOf(5000).progress, 1);
  assert.equal(levelOf(50).progress, 0.5);
});
t("clock-in once per day", () => {
  const a = clockIn(NEW_GAME, at("2026-10-05"));
  assert.equal(a.state.streak, 1);
  assert.equal(a.gained, XP.clock_in + 2);
  const b = clockIn(a.state, at("2026-10-05"));
  assert.equal(b.already, true);
  assert.equal(b.state.xp, a.state.xp);
  assert.equal(canClockIn(a.state, at("2026-10-05")), false);
  assert.equal(canClockIn(a.state, at("2026-10-06")), true);
});
t("consecutive days build the streak", () => {
  let s = NEW_GAME;
  for (const d of ["2026-10-05", "2026-10-06", "2026-10-07"]) s = clockIn(s, at(d)).state;
  assert.equal(s.streak, 3);
  assert.equal(s.best, 3);
});
t("one free miss per week keeps the streak", () => {
  let s = NEW_GAME;
  for (const d of ["2026-10-05", "2026-10-06"]) s = clockIn(s, at(d)).state; // Mon, Tue
  const r = clockIn(s, at("2026-10-08")); // missed Wed
  assert.equal(r.usedFreeMiss, true);
  assert.equal(r.state.streak, 3);
  assert.deepEqual(r.state.savedDays, ["2026-10-07"]);
});
t("a second miss in the same week resets the streak", () => {
  let s = NEW_GAME;
  for (const d of ["2026-10-05", "2026-10-06"]) s = clockIn(s, at(d)).state;
  s = clockIn(s, at("2026-10-08")).state; // free miss on Wed
  const r = clockIn(s, at("2026-10-10")); // missed Fri, same week
  assert.equal(r.usedFreeMiss, false);
  assert.equal(r.state.streak, 1);
  assert.equal(r.lostStreak, true);
});
t("the free miss comes back next week", () => {
  let s = NEW_GAME;
  for (const d of ["2026-10-05", "2026-10-06"]) s = clockIn(s, at(d)).state;
  s = clockIn(s, at("2026-10-08")).state; // uses week of 10-05
  s = clockIn(s, at("2026-10-09")).state;
  s = clockIn(s, at("2026-10-10")).state;
  s = clockIn(s, at("2026-10-11")).state;
  const r = clockIn(s, at("2026-10-13")); // missed Mon 10-12, new week
  assert.equal(r.usedFreeMiss, true);
  assert.equal(r.state.streak, 7);
});
t("two missed days reset the streak", () => {
  let s = clockIn(NEW_GAME, at("2026-10-05")).state;
  s = clockIn(s, at("2026-10-06")).state;
  const r = clockIn(s, at("2026-10-09"));
  assert.equal(r.state.streak, 1);
  assert.equal(r.lostStreak, true);
});
t("liveStreak reads 0 once the streak cannot be saved", () => {
  let s = clockIn(NEW_GAME, at("2026-10-05")).state;
  s = clockIn(s, at("2026-10-06")).state;
  assert.equal(liveStreak(s, at("2026-10-07")), 2);
  assert.equal(liveStreak(s, at("2026-10-08")), 2); // free miss still available
  assert.equal(liveStreak(s, at("2026-10-09")), 0);
});
t("7-day streak unlocks its badge", () => {
  let s = NEW_GAME;
  let last: string[] = [];
  for (let i = 5; i <= 11; i++) {
    const r = clockIn(s, at(`2026-10-${String(i).padStart(2, "0")}`));
    s = r.state;
    last = r.badges;
  }
  assert.equal(s.streak, 7);
  assert.deepEqual(last, ["streak_7"]);
});
t("XP is credited once per market for verify, always for anchors", () => {
  const a = applyAction(NEW_GAME, "verify", { ref: "m1" }, at("2026-10-05"));
  assert.equal(a.gained, XP.verify);
  assert.deepEqual(a.badges, ["first_verify"]);
  const b = applyAction(a.state, "verify", { ref: "m1" }, at("2026-10-05"));
  assert.equal(b.gained, 0);
  assert.deepEqual(b.badges, []);
  const c = applyAction(b.state, "anchor", {}, at("2026-10-05"));
  const d = applyAction(c.state, "anchor", {}, at("2026-10-05"));
  assert.equal(c.gained, XP.anchor);
  assert.equal(d.gained, XP.anchor);
  assert.deepEqual(c.badges, ["first_receipt"]);
  assert.deepEqual(d.badges, []);
});
t("tamper XP is once per market per day; level up is reported", () => {
  let s = NEW_GAME;
  s = { ...s, xp: 95 };
  const a = applyAction(s, "tamper", { ref: "m1" }, at("2026-10-05"));
  assert.equal(a.levelUp, "Verifier");
  assert.deepEqual(a.badges, ["tamper_caught"]);
  assert.equal(applyAction(a.state, "tamper", { ref: "m1" }, at("2026-10-05")).gained, 0);
  assert.equal(applyAction(a.state, "tamper", { ref: "m1" }, at("2026-10-06")).gained, XP.tamper);
});
t("early catch on a dispute unlocks its badge; 5 markets unlock theirs", () => {
  const a = applyAction(NEW_GAME, "early_catch", { ref: "m1:t", disputed: true }, at("2026-10-05"));
  assert.deepEqual(a.badges, ["early_dispute"]);
  const b = applyAction(NEW_GAME, "add_market", { ref: "m5", watching: 5 }, at("2026-10-05"));
  assert.deepEqual(b.badges, ["watch_5"]);
  assert.deepEqual(applyAction(NEW_GAME, "add_market", { ref: "m4", watching: 4 }).badges, []);
});
t("weekly recap counts this week only", () => {
  let s = NEW_GAME;
  s = clockIn(s, at("2026-10-04")).state; // Sunday, previous week
  s = clockIn(s, at("2026-10-05")).state;
  s = clockIn(s, at("2026-10-06")).state;
  s = applyAction(s, "early_catch", { ref: "a" }, at("2026-10-06")).state;
  s = applyAction(s, "anchor", {}, at("2026-10-07")).state;
  const r = weeklyRecap(s, at("2026-10-08"));
  assert.equal(r.clockIns, 2);
  assert.equal(r.early, 1);
  assert.equal(r.receipts, 1);
  assert.equal(r.text, "This week: 2 clock-ins, 1 change caught early, 1 receipt on Solana");
  assert.equal(weekStart("2026-10-11"), "2026-10-05");
});
t("last seven days row and storage sanitising", () => {
  const s = clockIn(NEW_GAME, at("2026-10-11")).state;
  const row = lastSeven(s, at("2026-10-11"));
  assert.equal(row.length, 7);
  assert.equal(row[6].done, true);
  assert.equal(row[6].today, true);
  assert.equal(row[0].done, false);
  assert.equal(sanitizeGame("junk").xp, 0);
  assert.equal(sanitizeGame({ xp: -5, streak: "x" }).streak, 0);
});


// ---- Daily Dispute ----
import { isCorrect, liveStreak as puzzleStreak, NEW_PUZZLE_STATE, play as playPuzzle, playedToday, puzzleFor, puzzleNumber, revealLine, sanitizePuzzleState, shareText, shuffledOrder, type Puzzle } from "../src/dailyDispute/logic";
import puzzlesRaw from "../src/dailyDispute/puzzles.json";

const PZ = puzzlesRaw as Puzzle[];
const ps = (n: number): Puzzle[] =>
  Array.from({ length: n }, (_, i) => ({ id: String(i), q: `q${i}`, proposal: "Yes", final: i % 2 ? "No" : "Yes", date: "2026-08-01", diff: (i % 2) as 0 | 1, cat: "sports" }));

t("puzzle data: facts agree with the label, no banned words", () => {
  assert.ok(PZ.length >= 100);
  for (const p of PZ) {
    assert.equal(p.final !== p.proposal ? 1 : 0, p.diff, p.id);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(p.date));
    assert.ok(!/\b(bet|odds|wager|trump|kill)\b/i.test(p.q), p.q);
  }
});
t("puzzle rotation: same day same puzzle, no repeats across the set, number from epoch", () => {
  const a = puzzleFor("2026-10-12", PZ);
  assert.equal(a.puzzle.id, puzzleFor("2026-10-12", PZ).puzzle.id);
  assert.equal(a.number, 12);
  assert.equal(puzzleNumber("2026-10-01"), 1);
  const seen = new Set<string>();
  for (let d = 0; d < PZ.length; d++) seen.add(puzzleFor(`2026-11-${String((d % 28) + 1).padStart(2, "0")}`, PZ).puzzle.id + d);
  const order = shuffledOrder(PZ.length);
  assert.equal(new Set(order).size, PZ.length);
  const first = new Set<string>();
  for (let i = 1; i <= PZ.length; i++) {
    const day = new Date(Date.UTC(2026, 9, 1) + (i - 1) * 86400000).toISOString().slice(0, 10);
    first.add(puzzleFor(day, PZ).puzzle.id);
  }
  assert.equal(first.size, PZ.length);
});
t("hold and change are scored against the label", () => {
  const [stood, changed] = [ps(2)[0], ps(2)[1]];
  assert.equal(isCorrect("hold", stood), true);
  assert.equal(isCorrect("change", stood), false);
  assert.equal(isCorrect("change", changed), true);
  assert.equal(isCorrect("hold", changed), false);
});
t("one play per day: locked until tomorrow", () => {
  const p = ps(2)[1];
  const a = playPuzzle(NEW_PUZZLE_STATE, "2026-10-12", "change", p);
  assert.equal(a.correct, true);
  assert.equal(a.state.solved, 1);
  const b = playPuzzle(a.state, "2026-10-12", "hold", p);
  assert.equal(b.already, true);
  assert.equal(b.state, a.state);
  assert.equal(playedToday(a.state, "2026-10-12")?.pick, "change");
  assert.equal(playedToday(a.state, "2026-10-13"), null);
});
t("puzzle streak counts consecutive days played and resets after a gap", () => {
  const p = ps(2)[0];
  let s = NEW_PUZZLE_STATE;
  for (const d of ["2026-10-12", "2026-10-13", "2026-10-14"]) s = playPuzzle(s, d, "change", p).state; // wrong calls still count as played
  assert.equal(s.streak, 3);
  assert.equal(s.solved, 0);
  assert.equal(puzzleStreak(s, "2026-10-15"), 3);
  assert.equal(puzzleStreak(s, "2026-10-16"), 0);
  assert.equal(playPuzzle(s, "2026-10-16", "hold", p).state.streak, 1);
  assert.equal(playPuzzle(s, "2026-10-16", "hold", p).state.best, 3);
});
t("share text has no link; reveal line is plain; storage is sanitised", () => {
  assert.equal(shareText(12, true, 4), "Settle Watch Daily Dispute #12 \u2705 streak 4");
  assert.ok(!/http/.test(shareText(12, false, 0)));
  assert.ok(revealLine(ps(2)[1]).startsWith("It settled differently"));
  assert.ok(revealLine(ps(2)[0]).startsWith("The proposed answer stood"));
  assert.equal(sanitizePuzzleState({ plays: { bad: 1 }, streak: -1 }).streak, 0);
});
t("puzzle XP and badge: 15 for a right call, 5 for playing, badge after 3 right", () => {
  let g = NEW_GAME;
  const w1 = applyAction(g, "puzzle_win", { ref: "2026-10-12" }, at("2026-10-12"));
  assert.equal(w1.gained, 15);
  assert.equal(applyAction(w1.state, "puzzle_win", { ref: "2026-10-12" }, at("2026-10-12")).gained, 0);
  assert.equal(applyAction(w1.state, "puzzle_play", { ref: "2026-10-13" }, at("2026-10-13")).gained, 5);
  const w2 = applyAction(w1.state, "puzzle_win", { ref: "2026-10-13" }, at("2026-10-13"));
  const w3 = applyAction(w2.state, "puzzle_win", { ref: "2026-10-14" }, at("2026-10-14"));
  assert.deepEqual(w3.badges, ["puzzles"]);
  assert.deepEqual(w2.badges, []);
});

// ---- Glossary cards ----
import { CARDS, unlockedCards } from "../src/glossary/cards";

t("glossary: 12 short cards, free card first, unlocks follow actions", () => {
  assert.equal(CARDS.length, 12);
  for (const c of CARDS) {
    assert.ok(c.text.length <= 140, c.id);
    assert.ok(!/(\bbet\b|odds|wager|payout|flipped|\u2014)/i.test(c.title + c.text), c.id);
  }
  assert.deepEqual(unlockedCards(NEW_GAME), ["dispute"]);
  let g = applyAction(NEW_GAME, "verify", { ref: "m1" }, at("2026-10-12")).state;
  assert.ok(unlockedCards(g).includes("signature"));
  g = applyAction(g, "puzzle_play", { ref: "2026-10-12" }, at("2026-10-12")).state;
  assert.ok(unlockedCards(g).includes("final") && unlockedCards(g).includes("proposal"));
  g = applyAction(g, "anchor", {}, at("2026-10-12")).state;
  assert.ok(unlockedCards(g).includes("receipt"));
  assert.equal(unlockedCards({ ...g, best: 7 }).includes("bond"), true);
});
// ---- Rule Detective ----
import { caseIndex, KIND_HINT, segments, type Case } from "../src/ruleDetective/logic";
import casesRaw from "../src/ruleDetective/cases.json";

t("rule detective: cases have 3+ real phrases that appear in the text; segments rebuild the text", () => {
  const cs = casesRaw as Case[];
  assert.ok(cs.length >= 15);
  for (const c of cs) {
    assert.ok(c.phrases.length >= 3 && new Set(c.phrases.map((p) => p.kind)).size >= 3, c.id);
    for (const p of c.phrases) assert.ok(c.text.includes(p.t), `${c.id}: ${p.t}`);
    assert.equal(segments(c).map((s) => s.text).join(""), c.text, c.id);
    assert.ok(!/(\bbet\b|odds|wager)/i.test(c.q), c.q);
  }
  for (const h of Object.values(KIND_HINT)) assert.ok(!/(\u2014|\bbet\b|odds|wager)/i.test(h));
  assert.equal(caseIndex(12, 0, 19), caseIndex(12, 19, 19));
  assert.notEqual(caseIndex(12, 0, 19), caseIndex(13, 0, 19));
});
// ---- Discover ----
import { canCall, fmtVolume, parseMarkets, parseSegment, tierOf } from "../src/discover/api";

t("discover: market parsing drops bad ids and calm-feed words; segment parsing and tiers", () => {
  const ms = parseMarkets([
    { id: "123", question: "Will it rain in Paris on May 5?", slug: "rain", endDate: "2026-05-05T00:00:00Z", volume24hr: 1500 },
    { id: "abc", question: "bad id" },
    { id: "9", question: "Will someone be killed?" },
    { id: "10", question: "x".repeat(200) },
    { id: "11", question: "Will Someone win the 2028 Democratic presidential nomination?" },
    null,
  ]);
  assert.equal(ms.length, 1);
  assert.equal(ms[0].endDate, "2026-05-05");
  assert.equal(parseMarkets({} as unknown).length, 0);
  const seg = parseSegment({ segment: "politics", rate: "0.011683", markets: "28502", disputed: "333", ci95: ["0.0105", "0.013"] });
  assert.equal(seg?.disputed, 333);
  assert.equal(parseSegment({ segment: "x", rate: "7" }), null);
  assert.equal(tierOf(0.0117), "mid");
  assert.equal(tierOf(0.005), "low");
  assert.equal(tierOf(0.05), "high");
  assert.equal(fmtVolume(2_500_000), "2.5M");
  assert.equal(canCall(), true);
});
import { onXpAwarded } from "../src/game";
t("xp listener sees every award and cannot break the game", () => {
  const seen: string[] = [];
  const off = onXpAwarded((e) => seen.push(`${e.kind}:${e.xp}`));
  const off2 = onXpAwarded(() => {
    throw new Error("boom");
  });
  clockIn(NEW_GAME, at("2026-10-20"));
  applyAction(NEW_GAME, "anchor", {}, at("2026-10-20"));
  off();
  off2();
  applyAction(NEW_GAME, "anchor", {}, at("2026-10-20"));
  assert.deepEqual(seen, ["clock_in:12", "anchor:50"]);
});
// ---- status line ----
import { statusLine, type Snapshot } from "../src/store";
t("status line: a proposed answer in its challenge window is not called Quiet", () => {
  const base: Snapshot = { risk_level: "watch", uma_state: "proposed", dispute_count: 0, open_dispute: false, sent_to_uma_vote: false, bulletin_board_count: 0, resolved_on_chain: false, paused: false };
  assert.equal(statusLine(base), "Answer proposed, no dispute yet");
  assert.equal(statusLine({ ...base, risk_level: "ok", uma_state: "requested" }), "Quiet: no dispute, no clarification");
  assert.equal(statusLine({ ...base, open_dispute: true }), "Open UMA dispute");
});
console.log(`${n} checks passed`);
