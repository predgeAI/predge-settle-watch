// Offline checks for input validation and canonical JSON. Run: npm test
import assert from "node:assert/strict";
import { assertSettlementRisk, MAX_INPUT_LENGTH, parseMarketInput } from "../src/api";
import { canonicalize } from "../src/canonical";
import { setPlainWords } from "../src/i18n";

// Most checks below pin the technical wording; the plain-words overlay has its own checks near the end.
setPlainWords(false);

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
import { buildWidgetSummary, topMarket } from "../src/widgetSummary";
import { setLanguage } from "../src/i18n";
import type { WatchItem } from "../src/store";
{
  const item = (key: string, level: string | undefined, extra: Partial<WatchItem> = {}): WatchItem =>
    ({ key, addedAt: "2026-10-01T00:00:00Z", timeline: [], anchors: [], ...(level ? { last: { risk_level: level } } : {}), ...extra }) as WatchItem;
  const items = [
    item("a", "ok", { lastPolledAt: "2026-10-12T10:00:00Z" }),
    item("b", "watch", { question: "Will B happen?", lastChangeAt: "2026-10-12T09:00:00Z" }),
    item("c", "caution", { question: "Will C happen?", lastChangeAt: "2026-10-10T09:00:00Z", lastPolledAt: "2026-10-12T10:05:00Z" }),
    item("d", "resolved"),
    item("e", "watch", { question: "Will E happen?", lastChangeAt: "2026-10-12T11:00:00Z" }),
    item("f", undefined),
  ];
  t("widget: counts per level, labels in order", () => {
    const w = buildWidgetSummary(items, NEW_GAME, new Date("2026-10-12T12:00:00Z"));
    assert.deepEqual(w.tiles.map((x) => [x.label, x.count]), [["CAUTION", 1], ["WATCH", 2], ["QUIET", 1], ["SETTLED", 1]]);
    assert.equal(w.checkedAt, Date.parse("2026-10-12T10:05:00Z"));
    assert.equal(w.streak, 0);
  });
  t("widget: caution beats a newer watch", () => {
    const w = buildWidgetSummary(items, NEW_GAME);
    assert.equal(w.topWord, "CAUTION");
    assert.equal(w.topTitle, "Will C happen?");
  });
  t("widget: newest watch when no caution", () => assert.equal(topMarket(items.filter((i) => i.key !== "c"))?.key, "e"));
  t("widget: quiet and empty lines", () => {
    const quiet = buildWidgetSummary([items[0]], NEW_GAME);
    assert.equal(quiet.topWord, "");
    assert.equal(quiet.topLine, "Nothing needs attention.");
    assert.equal(buildWidgetSummary([], NEW_GAME).checkedAt, 0);
    assert.equal(buildWidgetSummary([], NEW_GAME).topLine, "Tap to add a market to watch.");
  });
  t("widget: long titles are cut", () => {
    const w = buildWidgetSummary([item("x", "caution", { question: "Q".repeat(200) })], NEW_GAME);
    assert.equal(w.topTitle.length, 80);
  });
  t("widget: labels follow the app language", () => {
    setLanguage("es");
    try {
      const w = buildWidgetSummary(items, NEW_GAME);
      assert.equal(w.tiles[0].label, "CUIDADO");
      assert.equal(w.streakLabel, "DÍAS DE RACHA");
    } finally {
      setLanguage("en");
    }
  });
}
// ---- share card: QR encoder ----
import { encodeQr, formatBits, qrByteCapacity, rsRemainder, versionBits } from "../src/share/qr";
// Reference matrices from python-qrcode 8.2 (byte mode, level M, mask forced), see scripts/qr-vectors.json.
import qrVectors from "./qr-vectors.json";
import { cardShapes, cardSvg, CARD_H, CARD_W, emWidth, plainPunctuation, pixelSafe, shortId, wrapText } from "../src/share/card";
import { receiptCardInput, receiptFromAnchor, shareMessage } from "../src/share/receipt";
import { en as enDict, setLanguage as setLang } from "../src/i18n";
t("qr: Reed-Solomon matches the ISO 18004 worked example (01234567, 1-M)", () =>
  assert.deepEqual(
    rsRemainder([0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11], 10),
    [0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55]
  ));
t("qr: format bits for level M", () => {
  assert.equal(formatBits(0), 0b101010000010010);
  assert.equal(formatBits(5), 0b100000011001110);
  assert.equal(formatBits(7), 0b100101010100000);
});
t("qr: version 7 information bits", () => assert.equal(versionBits(7), 0b000111110010010100));
t("qr: byte capacities at level M", () => assert.deepEqual([1, 2, 6, 7, 8, 10].map(qrByteCapacity), [14, 26, 106, 122, 152, 213]));
for (const v of qrVectors as { text: string; version: number; mask: number; rows: string[] }[]) {
  t(`qr: version ${v.version} mask ${v.mask} matches the reference matrix (${v.text.length} bytes)`, () => {
    const q = encodeQr(v.text, { mask: v.mask });
    assert.equal(q.version, v.version);
    assert.deepEqual(q.modules.map((r) => r.map((d) => (d ? "1" : "0")).join("")), v.rows);
  });
}
t("qr: picks a mask by penalty and refuses text that is too long", () => {
  const q = encodeQr("https://explorer.solana.com/tx/" + "5".repeat(88) + "?cluster=devnet");
  assert.equal(q.version, 8);
  assert.ok(q.mask >= 0 && q.mask < 8);
  assert.throws(() => encodeQr("x".repeat(214)));
});
// ---- share card: layout and text ----
const SIG = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRBrFmSx6fPkMqR4hP2a";
t("card: wraps by words, splits long words, ellipsis past the last line", () => {
  assert.deepEqual(wrapText("Will the Fed cut rates in December?", 12, 4), ["Will the Fed", "cut rates in", "December?"]);
  assert.deepEqual(wrapText("abcdefghij", 4, 4), ["abcd", "efgh", "ij"]);
  assert.deepEqual(wrapText("one two three four five six", 9, 2), ["one two", "three..."]);
});
t("card: short ids keep head and tail", () => {
  assert.equal(shortId(SIG, 6), "5VERv8...R4hP2a");
  assert.equal(shortId("0x" + "ab".repeat(32), 6), "0xababab...ababab");
});
t("card: receipt card carries the exact numbers and the explorer link", () => {
  setLang("en");
  const r = receiptFromAnchor(
    { key: "5186278", question: "Will it happen?", addedAt: "", timeline: [], anchors: [] },
    { signature: SIG, packHash: "f".repeat(64), riskLevel: "caution", at: "2026-10-12T09:30:00.000Z", cluster: "devnet" }
  );
  const input = receiptCardInput(r, "#e2703a");
  assert.equal(input.text.checks, "8/8 checks on my phone");
  assert.equal(input.statusWord, "CAUTION");
  assert.equal(input.networkLabel, "Devnet");
  assert.equal(input.explorerUrl, `https://explorer.solana.com/tx/${SIG}?cluster=devnet`);
  assert.equal(shareMessage(r), `I verified this Polymarket market on my phone with Settle Watch. Receipt on Solana: https://explorer.solana.com/tx/${SIG}?cluster=devnet`);
  const svg = cardSvg(input);
  for (const s of ["I VERIFIED THIS MARKET", "Will it happen?", "CAUTION", "2026-10-12", "Devnet", "5VERv8...R4hP2a", "Settle Watch · verified on my phone · Solana Mobile"])
    assert.ok(svg.includes(s), s);
  for (const sh of cardShapes(input)) if (sh.kind === "rect") assert.ok(sh.x >= 0 && sh.y >= 0 && sh.x + sh.w <= CARD_W && sh.y + sh.h <= CARD_H);
});
t("card: curly punctuation becomes ASCII so the pixel font can draw it", () => {
  const q = plainPunctuation("Will Trump\u2019s \u201cdeal\u201d pass \u2014 by 2027\u2026");
  assert.equal(q, 'Will Trump\'s "deal" pass - by 2027...');
  assert.ok(pixelSafe(q));
  assert.ok(!pixelSafe("\u4e2d\u6587"));
  assert.equal(emWidth("\u4e2d\u6587", "sans"), 2);
});
t("card: English share strings have no em dashes", () => {
  for (const [k, v] of Object.entries(enDict)) if (k.startsWith("share.")) assert.ok(!v.includes("\u2014"), k);
});
// ---- SKR evidence pack payment ----
import { PublicKey as SkrKey, SystemProgram as SkrSystem } from "@solana/web3.js";
import { ATA_PROGRAM_ID, MEMO_PROGRAM_ID as SKR_MEMO, SKR_MINT, SKR_TREASURY, TOKEN_PROGRAM_ID } from "../src/config";
import {
  associatedTokenAddress,
  buildUnlockTx,
  coversPrice,
  formatSkr,
  PACK_PRICE_BASE,
  packMemoText,
  transferCheckedData,
  treasuryKey,
  u64le,
} from "../src/skr/spl";
t("SKR TransferChecked data is [12, amount u64 LE, decimals]", () => {
  assert.equal(transferCheckedData(1_000_000, 6).toString("hex"), "0c" + "40420f0000000000" + "06");
  assert.equal(u64le(2 ** 40 + 5).toString("hex"), "0500000000010000");
  assert.throws(() => u64le(-1));
  assert.throws(() => u64le(2 ** 60));
  assert.equal(PACK_PRICE_BASE, 1_000_000);
});
t("SKR associated token account derivation", () => {
  // Known SKR account on mainnet (seen in a live transfer): owner 3sLy... holds SKR at 3QrU...
  assert.equal(associatedTokenAddress(new SkrKey("3sLy3PvzRPFMk1sfnXE9WDJgyc39mZenmjNWtEfpUrBC")).toBase58(), "3QrUjNJ6yXpfh6kFeC2DJjcQXEQM5pcQvx7MWX9MHXXe");
  // Same seeds computed directly with web3.js.
  const owner = new SkrKey("8gTLrkxZkL3yewzGBEQhv3Y3C7DzsfMUEZqybvP5Nh8S");
  const [want] = SkrKey.findProgramAddressSync(
    [owner.toBuffer(), new SkrKey(TOKEN_PROGRAM_ID).toBuffer(), new SkrKey(SKR_MINT).toBuffer()],
    new SkrKey(ATA_PROGRAM_ID)
  );
  assert.equal(associatedTokenAddress(owner).toBase58(), want.toBase58());
  assert.equal(want.toBase58(), "4Y67b3ejiBZkzAPjnsp8JF9DAnMruNd1jEDQNHrEHBLF");
});
t("SKR treasury is validated", () => {
  assert.equal(treasuryKey(""), null);
  assert.equal(treasuryKey("not-an-address"), null);
  if (SKR_TREASURY) assert.equal(treasuryKey()?.toBase58(), SKR_TREASURY);
});
t("SKR unlock transaction: programs, key order, amounts, memo", () => {
  const payer = new SkrKey("3sLy3PvzRPFMk1sfnXE9WDJgyc39mZenmjNWtEfpUrBC");
  const treasury = new SkrKey("8gTLrkxZkL3yewzGBEQhv3Y3C7DzsfMUEZqybvP5Nh8S");
  const hash = "ab".repeat(32);
  const base = { payer, treasury, blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1, marketId: "5186278", packHash: hash };
  const tx = buildUnlockTx({ ...base, createTreasuryAta: true });
  assert.equal(tx.instructions.length, 3);
  const [create, transfer, memo] = tx.instructions;
  const payerAta = associatedTokenAddress(payer).toBase58();
  const treasuryAta = associatedTokenAddress(treasury).toBase58();
  assert.equal(create.programId.toBase58(), ATA_PROGRAM_ID);
  assert.deepEqual([...create.data], [1]);
  assert.deepEqual(create.keys.map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable]), [
    [payer.toBase58(), true, true],
    [treasuryAta, false, true],
    [treasury.toBase58(), false, false],
    [SKR_MINT, false, false],
    [SkrSystem.programId.toBase58(), false, false],
    [TOKEN_PROGRAM_ID, false, false],
  ]);
  assert.equal(transfer.programId.toBase58(), TOKEN_PROGRAM_ID);
  assert.equal(transfer.data.toString("hex"), "0c40420f000000000006");
  assert.deepEqual(transfer.keys.map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable]), [
    [payerAta, false, true],
    [SKR_MINT, false, false],
    [treasuryAta, false, true],
    [payer.toBase58(), true, false],
  ]);
  assert.equal(memo.programId.toBase58(), SKR_MEMO);
  assert.equal(memo.data.toString("utf8"), `predge-settle-watch v1 pack market=5186278 pack=sha256:${hash}`);
  assert.equal(buildUnlockTx({ ...base, createTreasuryAta: false }).instructions.length, 2);
  assert.throws(() => packMemoText("1;x", hash));
  assert.throws(() => packMemoText("5186278", "AB".repeat(32)));
});
t("SKR amounts format and compare in base units", () => {
  assert.equal(formatSkr("12500000"), "12.5");
  assert.equal(formatSkr("1000000"), "1");
  assert.equal(formatSkr("1"), "0");
  assert.equal(formatSkr("123456789"), "123.4567");
  assert.equal(coversPrice("1000000"), true);
  assert.equal(coversPrice("999999"), false);
  assert.equal(coversPrice("00999999"), false);
  assert.equal(coversPrice("25000000000"), true);
  assert.equal(coversPrice("x"), false);
});
t("SKR pack unlock awards XP once per market and the Pack opener badge", () => {
  const a = applyAction(NEW_GAME, "pack_open", { ref: "5186278" }, at("2026-10-12"));
  assert.equal(a.gained, XP.pack_open);
  assert.deepEqual(a.badges, ["pack_opener"]);
  const b = applyAction(a.state, "pack_open", { ref: "5186278" }, at("2026-10-12"));
  assert.equal(b.gained, 0);
  assert.deepEqual(b.badges, []);
});
import { boardRank, rankRows } from "../src/league/logic";
t("league: the board list and the This week line use one rank", () => {
  const row = (nickname: string, weeklyXp: number, rank: number, you = false) => ({ nickname, avatar: "a00", weeklyXp, rank, you });
  assert.equal(boardRank([row("me", 0, 2, true)], 2), 1);
  assert.deepEqual(rankRows([row("a", 10, 1), row("b", 30, 3), row("c", 10, 2)]).map((r) => r.rank), [1, 2, 2]);
  assert.equal(boardRank([row("a", 50, 1), row("me", 20, 1, true)], 1), 2);
  assert.equal(boardRank([row("a", 50, 1)], 37), 37);
});
// ---- haptic choreography ----
import { LAUNCH_LEAD_MS, MAX_PATTERN_MS, PATTERNS, patternMs, PRIMITIVE_MS, verifyPattern } from "../src/hapticPatterns";

t("haptic patterns stay short and well-formed", () => {
  for (const [name, steps] of Object.entries({ ...PATTERNS, verify7: verifyPattern(7), verify12: verifyPattern(12) })) {
    assert.ok(steps.length > 0, name);
    assert.ok(patternMs(steps) <= MAX_PATTERN_MS, `${name} is ${patternMs(steps)} ms`);
    for (const st of steps) {
      assert.ok(st.p in PRIMITIVE_MS, `${name}: ${st.p}`);
      assert.ok(st.scale >= 0 && st.scale <= 1 && st.delay >= 0, name);
    }
  }
});
t("verify ticks rise from 0.35 to 0.6, then a firm click", () => {
  const v = verifyPattern(7);
  assert.equal(v.length, 8);
  assert.deepEqual([v[0].scale, v[6].scale, v[7].p, v[7].scale], [0.35, 0.6, "CLICK", 0.9]);
  assert.ok(v.slice(1).every((st) => st.delay === 60));
  assert.equal(LAUNCH_LEAD_MS, PRIMITIVE_MS.QUICK_RISE + PATTERNS.launch[1].delay);
});

// ---- watch my positions: address, response parsing, dedupe ----
import positionsFixture from "./positions-fixture.json";
import { fetchPositions, normalizeAddress, openPositions, parsePositions, positionsUrl, PositionsError } from "../src/positions/api";
import { applyHeld, byMarket, clearHeld, conditionOf, fmtShares, heldOf, planSync } from "../src/positions/sync";

const CID_A = "0x0389a98934283c9bee606cc9525d5c49f44b65596e669b151369eb03977d06a1";
const CID_B = "0x451b2ab83c45abe91a283bb26d521f4973c4bbc3f183b38244bd08c6daf9e1e7";
const CID_R = "0xbb1c34c6b611df6a4138eaa2ec6b887d5635ed372e62d9b91b971f302443c3e2";
const wi = (key: string, extra: Partial<WatchItem> = {}): WatchItem => ({ key, addedAt: "2026-10-01T00:00:00Z", timeline: [], anchors: [], ...extra });

t("positions: address validation", () => {
  assert.equal(normalizeAddress(" 0xC69BD5567B40EF4D11922EAA57E1F9BE1C642076 "), "0xc69bd5567b40ef4d11922eaa57e1f9be1c642076");
  assert.equal(normalizeAddress("0x" + "a".repeat(39)), null);
  assert.equal(normalizeAddress("0x" + "a".repeat(41)), null);
  assert.equal(normalizeAddress("0x" + "g".repeat(40)), null);
  assert.equal(normalizeAddress("c69bd5567b40ef4d11922eaa57e1f9be1c642076"), null);
  assert.equal(normalizeAddress("0x" + "a".repeat(40) + "&limit=1"), null);
  assert.equal(normalizeAddress("8gTLrkxZkL3yewzGBEQhv3Y3C7DzsfMUEZqybvP5Nh8S"), null);
  assert.equal(normalizeAddress(undefined), null);
  assert.ok(positionsUrl("0x" + "a".repeat(40)).startsWith("https://data-api.polymarket.com/positions?user=0x"));
});
t("positions: fixture parses, bad entries are dropped", () => {
  const ps = parsePositions(positionsFixture);
  assert.equal(ps.length, 4);
  assert.deepEqual(ps.map((p) => p.conditionId), [CID_A, CID_B, CID_R, CID_A]);
  assert.equal(ps[0].outcome, "BNK FEARX");
  assert.equal(ps[0].size, 19227.0184);
  assert.equal(ps[2].redeemable, true);
  assert.deepEqual(openPositions(ps).map((p) => p.conditionId), [CID_A, CID_B, CID_A]);
});
t("positions: response that is not a list is rejected", () => {
  for (const bad of [null, {}, { error: "x" }, "[]", 1]) assert.throws(() => parsePositions(bad), (e: unknown) => e instanceof PositionsError && e.kind === "shape");
  assert.throws(() => parsePositions(new Array(501).fill({})));
  assert.deepEqual(parsePositions([]), []);
  assert.deepEqual(parsePositions([{ conditionId: CID_A, size: "abc" }, { conditionId: CID_A.toUpperCase().replace("0X", "0x"), size: 2, slug: "../x" }]).map((p) => [p.conditionId, p.slug]), [[CID_A, undefined]]);
});
t("positions: one entry per market, the larger outcome wins", () => {
  const m = byMarket(openPositions(parsePositions(positionsFixture)));
  assert.equal(m.size, 2);
  assert.equal(m.get(CID_A)?.outcome, "BNK FEARX");
});
t("positions: plan skips watched markets (by key or condition id) and caps to free slots", () => {
  const open = openPositions(parsePositions(positionsFixture));
  const fresh = planSync(open, [], 50);
  assert.deepEqual(fresh.toAdd.map((p) => p.conditionId), [CID_A, CID_B]);
  assert.equal(fresh.found, 2);
  const byKey = planSync(open, [wi(CID_A)], 50);
  assert.deepEqual(byKey.toAdd.map((p) => p.conditionId), [CID_B]);
  assert.equal(byKey.watched, 1);
  const bySlug = planSync(open, [wi("some-slug", { last: { market: { condition_id: CID_B.toUpperCase().replace("0X", "0x") } } as WatchItem["last"] })], 50);
  assert.deepEqual(bySlug.toAdd.map((p) => p.conditionId), [CID_A]);
  const full = planSync(open, Array.from({ length: 49 }, (_, i) => wi(String(i))), 50);
  assert.equal(full.toAdd.length, 1);
  assert.equal(full.overflow, 1);
  assert.equal(planSync(open, [], 50, 1).toAdd.length, 1);
  assert.equal(planSync(open, Array.from({ length: 60 }, (_, i) => wi(String(i))), 50).toAdd.length, 0);
});
t("positions: held marks, closed positions are marked and never removed", () => {
  const open = openPositions(parsePositions(positionsFixture));
  const list = [wi(CID_A, { source: "positions" }), wi(CID_B), wi("5186278")];
  const a = applyHeld(list, open, "2026-10-12T10:00:00Z");
  assert.equal(a.changed, true);
  assert.deepEqual(heldOf(a.items[0]), { outcome: "BNK FEARX", size: 19227.0184, closed: false, at: "2026-10-12T10:00:00Z" });
  assert.equal(a.items[1].held?.outcome, "JD Gaming");
  assert.equal(a.items[2].held, undefined);
  assert.equal(applyHeld(a.items, open, "2026-10-12T11:00:00Z").changed, false);
  const later = applyHeld(a.items, open.filter((p) => p.conditionId !== CID_B), "2026-10-12T12:00:00Z");
  assert.equal(later.closed, 1);
  assert.equal(later.items.length, 3);
  assert.equal(heldOf(later.items[1])?.closed, true);
  assert.equal(applyHeld(later.items, [], "2026-10-12T13:00:00Z").closed, 1);
  const cleared = clearHeld(later.items);
  assert.ok(cleared.every((i) => i.held === undefined));
  assert.equal(cleared[0].source, "positions");
});
t("positions: stored held marks are checked before drawing", () => {
  assert.equal(heldOf(wi("x", { held: { outcome: 1, size: 2 } as never })), null);
  assert.equal(heldOf(wi("x", { held: { outcome: "Yes", size: NaN } as never })), null);
  assert.equal(conditionOf(wi("5186278")), undefined);
  assert.equal(fmtShares(19227.0184, (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ",")), "19,227");
  assert.equal(fmtShares(3.888), "3.9");
  assert.equal(fmtShares(-1), "0");
});

// fetchPositions with a fake fetch: never throws anything but PositionsError.
const fakeFetch = (impl: () => Promise<unknown>) => (() => impl()) as never;
const asyncChecks: Promise<void>[] = [];
const at2 = (name: string, fn: () => Promise<void>) =>
  asyncChecks.push(
    fn().then(() => {
      n++;
      console.log(`ok ${n} ${name}`);
    })
  );
const kindOf = async (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof PositionsError ? e.kind : "other:" + String(e)));
const ADDR = "0x" + "a".repeat(40);
at2("positions: fetch errors map to kinds", async () => {
  assert.equal(await kindOf(fetchPositions("nope")), "address");
  assert.equal(await kindOf(fetchPositions(ADDR, { fetchImpl: fakeFetch(() => Promise.reject(new TypeError("Network request failed"))) })), "network");
  assert.equal(await kindOf(fetchPositions(ADDR, { fetchImpl: fakeFetch(async () => ({ ok: false, status: 503, json: async () => ({}) })) })), "http");
  assert.equal(await kindOf(fetchPositions(ADDR, { fetchImpl: fakeFetch(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("x"); } })) })), "shape");
  assert.equal(await kindOf(fetchPositions(ADDR, { fetchImpl: fakeFetch(async () => ({ ok: true, status: 200, json: async () => ({ error: "x" }) })) })), "shape");
  const slow = (_u: string, init: { signal: AbortSignal }) =>
    new Promise((_res, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  assert.equal(await kindOf(fetchPositions(ADDR, { timeoutMs: 20, fetchImpl: slow as never })), "timeout");
  const ok = await fetchPositions(ADDR, { fetchImpl: fakeFetch(async () => ({ ok: true, status: 200, json: async () => positionsFixture })) });
  assert.equal(ok.length, 3);
});

// ---- 60-second tour and term explanations ----
import { TOUR_REF, tourDone } from "../src/learn/tour";
t("tour: the numbers are exactly 853 / 2,543 / 33.5% in English", () => {
  setLang("en");
  assert.equal(enDict["learn.s4.stat"], "853 of 2,543");
  assert.equal(enDict["learn.s4.pct"], "33.5%");
  assert.equal(
    enDict["learn.s4.body"],
    "This year 853 of 2,543 disputed markets that settled ended up different from the disputed proposal. That is 33.5%, from 1 Jan to 2 Oct 2026."
  );
  assert.equal((853 / 2543 * 100).toFixed(1), "33.5");
});
t("tour and term strings stay plain: no em dashes, no payout or flipped wording", () => {
  const keys = Object.keys(enDict).filter((k) => k.startsWith("learn.") || k.startsWith("term."));
  assert.ok(keys.length > 40);
  for (const k of keys) assert.ok(!/(\u2014|payout|flipped|settle[sd]? wrong|\bbet\b|wager)/i.test(enDict[k as keyof typeof enDict]), k);
  for (const n of [1, 2, 3, 4, 5]) assert.ok(`learn.s${n}.title` in enDict && `learn.s${n}.body` in enDict, `slide ${n}`);
});
t("tour XP: +10 once via the game award system", () => {
  const a = applyAction(NEW_GAME, "learn", { ref: TOUR_REF }, at("2026-10-12"));
  assert.equal(a.gained, 10);
  assert.equal(XP.learn, 10);
  assert.ok(tourDone(a.state));
  assert.ok(!tourDone(NEW_GAME));
  assert.equal(applyAction(a.state, "learn", { ref: TOUR_REF }, at("2026-10-13")).gained, 0);
});

// ---- Russian ----
import { detectLanguage, fmtDec as fmtDecRu, fmtNum as fmtNumRu, LANGS as LANGS_RU, pixelFontOk as pixelOkRu, pluralForm, ru as ruDict, t as tRu, tn as tnRu } from "../src/i18n";
{
  const placeholders = (s: string) => [...new Set(s.match(/\{\w+\}/g) ?? [])].sort();
  const enAll = enDict as Record<string, string>;
  const ruAll = ruDict as Record<string, string>;
  const pluralBases = Object.keys(enAll).filter((k) => k.endsWith(".one")).map((k) => k.slice(0, -4));
  t("ru: every English key has a non-empty Russian value", () => {
    for (const k of Object.keys(enAll)) assert.ok(typeof ruAll[k] === "string" && ruAll[k].trim() !== "", k);
  });
  t("ru: extra keys are only .few/.many plural forms, one pair per plural key", () => {
    for (const k of Object.keys(ruAll)) {
      if (k in enAll) continue;
      const m = /^(.*)\.(few|many)$/.exec(k);
      assert.ok(m && pluralBases.includes(m[1]), k);
    }
    for (const b of pluralBases) assert.ok(`${b}.few` in ruAll && `${b}.many` in ruAll, b);
  });
  t("ru: placeholders match English", () => {
    for (const k of Object.keys(enAll)) {
      const want = placeholders(enAll[k]);
      // Russian "one" also covers 21, 31, 101..., so a `.one` string may name {n} where English says "a" or "new".
      const got = placeholders(ruAll[k]).filter((p) => !(k.endsWith(".one") && p === "{n}" && !want.includes("{n}")));
      assert.deepEqual(got, want, k);
    }
    for (const b of pluralBases)
      for (const f of ["few", "many"]) assert.deepEqual(placeholders(ruAll[`${b}.${f}`]), placeholders(enAll[`${b}.other`]), `${b}.${f}`);
  });
  t("ru: plural categories", () => {
    const cases: [number, string][] = [
      [0, "many"], [1, "one"], [2, "few"], [4, "few"], [5, "many"], [11, "many"], [12, "many"], [14, "many"],
      [20, "many"], [21, "one"], [22, "few"], [25, "many"], [101, "one"], [111, "many"], [112, "many"], [122, "few"], [1.5, "other"],
    ];
    for (const [n, f] of cases) assert.equal(pluralForm("ru", n), f, String(n));
    assert.equal(pluralForm("en", 1), "one");
    assert.equal(pluralForm("en", 21), "other");
    assert.equal(pluralForm("es", 2), "other");
  });
  t("ru: tn picks one/few/many, other languages keep one/other", () => {
    setLang("ru");
    try {
      assert.equal(tnRu("home.noChanges", 1), "Статус не менялся: 1 рынок под наблюдением.");
      assert.equal(tnRu("home.noChanges", 2), "Статус не менялся: 2 рынка под наблюдением.");
      assert.equal(tnRu("home.noChanges", 5), "Статус не менялся: 5 рынков под наблюдением.");
      assert.equal(tnRu("home.noChanges", 21), "Статус не менялся: 21 рынок под наблюдением.");
      assert.equal(tnRu("home.noChanges", 22), "Статус не менялся: 22 рынка под наблюдением.");
      assert.equal(tnRu("home.noChanges", 25), "Статус не менялся: 25 рынков под наблюдением.");
      assert.equal(tnRu("home.noChanges", 11), "Статус не менялся: 11 рынков под наблюдением.");
      assert.equal(tnRu("recap.receipts", 3), "3 квитанции");
      assert.equal(tnRu("change.dispute", 21), "21 новый спор UMA по предложенному ответу");
      assert.equal(tnRu("digest.changed", 5, { changed: 2 }), "Settle Watch за день: статус сменился у 2 из 5 рынков");
    } finally {
      setLang("en");
    }
    assert.equal(tnRu("home.noChanges", 1), "No status changes across your 1 market.");
    assert.equal(tnRu("home.noChanges", 21), "No status changes across your 21 markets.");
    setLang("es");
    try {
      // Spanish has no .few/.many keys, so 2 falls back to .other.
      assert.equal(tnRu("recap.receipts", 2), tRu("recap.receipts.other", { n: 2 }));
    } finally {
      setLang("en");
    }
  });
  t("ru: numbers, picker, font, status words", () => {
    setLang("ru");
    try {
      assert.equal(fmtNumRu(2543), "2\u00a0543");
      assert.equal(fmtNumRu(3005), "3\u00a0005");
      assert.equal(fmtDecRu("33.5"), "33,5");
      assert.equal(tRu("learn.s4.stat"), "853 из 2\u00a0543");
      assert.equal(tRu("learn.s4.pct"), "33,5%");
      assert.deepEqual(["caution", "watch", "ok", "resolved"].map((k) => tRu(`status.${k}.word` as "status.ok.word")), ["ОСТОРОЖНО", "ВНИМАНИЕ", "ТИХО", "РЕШЁН"]);
      const one = { key: "a", addedAt: "2026-10-01T00:00:00Z", timeline: [], anchors: [], last: { risk_level: "caution" } } as unknown as WatchItem;
      assert.deepEqual(buildWidgetSummary([one], NEW_GAME).tiles.map((x) => x.label), ["ОСТОРОЖНО", "ВНИМАНИЕ", "ТИХО", "РЕШЁН"]);
    } finally {
      setLang("en");
    }
    assert.equal(fmtNumRu(2543), "2,543");
    assert.deepEqual(LANGS_RU[LANGS_RU.length - 1], { id: "ru", name: "Русский" });
    assert.ok(pixelOkRu("ru"));
    assert.ok(!pixelOkRu("zh"));
    assert.ok(pixelSafe("СЕГОДНЯ Ёлка ёж"));
    const realDtf = Intl.DateTimeFormat;
    const fakeLocale = (locale: string) =>
      ((() => ({ resolvedOptions: () => ({ locale }) })) as unknown as typeof Intl.DateTimeFormat);
    try {
      Intl.DateTimeFormat = fakeLocale("ru-RU");
      assert.equal(detectLanguage(), "ru");
      Intl.DateTimeFormat = fakeLocale("ko-KR");
      assert.equal(detectLanguage(), "ko");
      Intl.DateTimeFormat = fakeLocale("uk-UA");
      assert.equal(detectLanguage(), "en");
    } finally {
      Intl.DateTimeFormat = realDtf;
    }
  });
}
// ---- verification: freshness and the key list ----
import { CLOCK_SKEW_MS, freshnessCheck, KEY_LIST_GRACE_MS, MAX_RECORD_AGE_MS, resetKeyListMemory, usableForReceipt, verifyRecord, VERIFY_CHECKS, type KeyListCache, type KeyListStore } from "../src/verify";
import { PINNED_PUBLIC_KEY_HEX } from "../src/config";
import { VERIFIED_CHECKS } from "../src/share/receipt";
import recordFixture from "./record-fixture.json";
const REC = recordFixture as unknown as import("../src/api").SettlementRisk;
const SIGNED_AT = Date.parse("2026-10-12T13:15:17.617Z"); // issued_at inside the signed payload of the fixture
const memStore = (init: KeyListCache | null = null) => {
  let v = init;
  const st: KeyListStore & { value: () => KeyListCache | null } = { get: async () => v, set: async (x) => void (v = x), value: () => v };
  return st;
};
const listed = async () => [PINNED_PUBLIC_KEY_HEX];
const down = async () => null;
t("freshness: 24 h window, 10 min clock skew, signed time required", () => {
  const p = { issued_at: "2026-10-12T12:00:00Z", checked_at: "2026-10-01T00:00:00Z" };
  const at = Date.parse(p.issued_at);
  assert.equal(freshnessCheck(p, at + 60_000).ok, true);
  assert.equal(freshnessCheck(p, at + 60_000).detail, "signed 1 min ago");
  assert.equal(freshnessCheck(p, at + MAX_RECORD_AGE_MS).ok, true);
  const stale = freshnessCheck(p, at + MAX_RECORD_AGE_MS + 1);
  assert.equal(stale.ok, false);
  assert.equal(stale.detail, "stale: signed 24 h ago");
  assert.equal(freshnessCheck(p, at - CLOCK_SKEW_MS).ok, true);
  assert.equal(freshnessCheck(p, at - CLOCK_SKEW_MS - 1).ok, false);
  assert.match(freshnessCheck(p, at - CLOCK_SKEW_MS - 60_000).detail ?? "", /in the future/);
  // issued_at wins over checked_at; checked_at is the fallback.
  assert.equal(freshnessCheck({ checked_at: p.issued_at }, at + 60_000).ok, true);
  assert.equal(freshnessCheck({}, at).detail, "no signed timestamp");
  assert.equal(freshnessCheck({ issued_at: "yesterday" }, at).ok, false);
});
at2("verify: a live signed record passes all 8 checks while fresh", async () => {
  resetKeyListMemory();
  const v = await verifyRecord(REC, { now: SIGNED_AT + 3_600_000, fetchKeys: listed, keyStore: memStore() });
  assert.equal(v.checks.length, VERIFY_CHECKS);
  assert.equal(VERIFY_CHECKS, 8);
  assert.equal(VERIFIED_CHECKS, VERIFY_CHECKS);
  assert.ok(v.checks.every((c) => c.ok && c.status === "pass"), JSON.stringify(v.checks));
  assert.equal(v.verified, true);
  assert.equal(v.signedAt, "2026-10-12T13:15:17.617Z");
  assert.equal(usableForReceipt(v, SIGNED_AT + 3_600_000), true);
  assert.equal(usableForReceipt(v, SIGNED_AT + MAX_RECORD_AGE_MS + 1), false, "a saved verification goes stale");
  assert.equal(usableForReceipt({ ...v, signedAt: undefined }, SIGNED_AT), false, "verifications from before 0.3.9 cannot back a receipt");
  const tampered = await verifyRecord(REC, { tamper: true, now: SIGNED_AT + 3_600_000, fetchKeys: listed, keyStore: memStore() });
  assert.equal(tampered.verified, false);
});
at2("verify: a stale record is shown but not verified", async () => {
  resetKeyListMemory();
  const v = await verifyRecord(REC, { now: SIGNED_AT + MAX_RECORD_AGE_MS + 3_600_000, fetchKeys: listed, keyStore: memStore() });
  assert.equal(v.verified, false);
  assert.equal(v.packHash !== null, true);
  const fresh = v.checks[7];
  assert.equal(fresh.label, "Record was signed in the last 24 hours");
  assert.equal(fresh.status, "fail");
  assert.equal(fresh.detail, "stale: signed 25 h ago");
  assert.equal(v.checks.filter((c) => c.ok).length, 7);
  const future = await verifyRecord(REC, { now: SIGNED_AT - CLOCK_SKEW_MS - 60_000, fetchKeys: listed, keyStore: memStore() });
  assert.equal(future.verified, false);
});
at2("verify: unreachable key list is unknown, never passed; verified only with a good list from the last 7 days", async () => {
  const now = SIGNED_AT + 3_600_000;
  // A successful fetch is remembered with its time.
  resetKeyListMemory();
  const store = memStore();
  await verifyRecord(REC, { now, fetchKeys: listed, keyStore: store });
  assert.equal(store.value()?.at, now);
  // List down, good copy 2 days old: check 2 is unknown, the record still counts as verified.
  resetKeyListMemory();
  const cached = memStore({ at: now - 2 * 24 * 3_600_000, activeKeys: [PINNED_PUBLIC_KEY_HEX] });
  const a = await verifyRecord(REC, { now, fetchKeys: down, keyStore: cached });
  assert.equal(a.checks[1].ok, false);
  assert.equal(a.checks[1].status, "unknown");
  assert.equal(a.checks[1].detail, "key list not reachable, pinned key used; last good list 48 h ago");
  assert.equal(a.verified, true);
  assert.equal(a.checks.filter((c) => c.ok).length, 7);
  // List down, no good copy: unknown and not verified.
  resetKeyListMemory();
  const b = await verifyRecord(REC, { now, fetchKeys: down, keyStore: memStore() });
  assert.equal(b.checks[1].status, "unknown");
  assert.equal(b.checks[1].detail, "key list not reachable, pinned key used; no good list in the last 7 days");
  assert.equal(b.verified, false);
  // Good copy older than 7 days, or one that did not list the key: not verified.
  resetKeyListMemory();
  const old = await verifyRecord(REC, { now, fetchKeys: down, keyStore: memStore({ at: now - KEY_LIST_GRACE_MS - 1, activeKeys: [PINNED_PUBLIC_KEY_HEX] }) });
  assert.equal(old.verified, false);
  resetKeyListMemory();
  const other = await verifyRecord(REC, { now, fetchKeys: down, keyStore: memStore({ at: now - 60_000, activeKeys: ["ab".repeat(32)] }) });
  assert.equal(other.verified, false);
  // A fetched list without the key fails outright and is not stored as good.
  resetKeyListMemory();
  const revokedStore = memStore();
  const revoked = await verifyRecord(REC, { now, fetchKeys: async () => ["ab".repeat(32)], keyStore: revokedStore });
  assert.equal(revoked.checks[1].status, "fail");
  assert.equal(revoked.verified, false);
  assert.equal(revokedStore.value(), null);
  // A throwing fetch is treated like an unreachable list.
  resetKeyListMemory();
  const threw = await verifyRecord(REC, { now, fetchKeys: async () => { throw new Error("offline"); }, keyStore: memStore() });
  assert.equal(threw.checks[1].status, "unknown");
  resetKeyListMemory();
});
t("share card: the checks line uses the real count", () => {
  setLang("en");
  const base = { question: "Q", riskLevel: "caution", packHash: "f".repeat(64), signature: SIG, at: "2026-10-12T09:30:00.000Z" };
  assert.equal(receiptCardInput(base, "#e2703a").text.checks, "8/8 checks on my phone");
  assert.equal(receiptCardInput({ ...base, checks: { ok: 7, total: 8 } }, "#e2703a").text.checks, "7/8 checks on my phone");
});

// ---- wallet transactions: what the wallet may add ----
import { PublicKey as TxKey, SystemProgram as TxSystem, Transaction as TxTransaction, TransactionInstruction as TxIx } from "@solana/web3.js";
import { Buffer as TxBuffer } from "buffer";
import { checkReceiptTx, COMPUTE_BUDGET_PROGRAM_ID, decodeTransaction, LIGHTHOUSE_PROGRAM_ID, memoIx, priorityFeeLamports, TxCheckError } from "../src/txcheck";
import { checkUnlockTx } from "../src/skr/spl";
import { memoText } from "../src/wallet";
import txFixtures from "./wallet-tx-fixtures.json";
const SKR_TX = txFixtures.skrPaymentMainnet;
const RCPT_TX = txFixtures.watchReceiptDevnet;
const b64 = (s: string) => Uint8Array.from(TxBuffer.from(s, "base64"));
const skrParams = {
  payer: new TxKey(SKR_TX.payer),
  treasury: new TxKey(SKR_TX.treasury),
  marketId: SKR_TX.marketId,
  packHash: SKR_TX.packHash,
  createTreasuryAta: SKR_TX.createTreasuryAta,
};
const rcptMemo = memoText({ action: "watch", marketId: RCPT_TX.marketId, riskLevel: RCPT_TX.riskLevel, packHash: RCPT_TX.packHash });
const reason = (fn: () => unknown) => {
  try {
    fn();
    return "accepted";
  } catch (e) {
    return e instanceof TxCheckError ? e.reason : "other:" + String(e);
  }
};
t("wallet tx: the real mainnet SKR payment decodes to our 3 instructions plus ComputeBudget and Lighthouse", () => {
  const d = decodeTransaction(b64(SKR_TX.tx));
  assert.equal(d.feePayer, SKR_TX.payer);
  assert.deepEqual(d.instructions.map((i) => i.programId), [
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
    COMPUTE_BUDGET_PROGRAM_ID,
    COMPUTE_BUDGET_PROGRAM_ID,
    LIGHTHOUSE_PROGRAM_ID,
    LIGHTHOUSE_PROGRAM_ID,
  ]);
  // The wallet set 640,000 compute units at 100,000 micro-lamports: 64,000 lamports of priority fee.
  assert.equal(priorityFeeLamports(d.instructions.filter((i) => i.programId === COMPUTE_BUDGET_PROGRAM_ID), 5), 64_000);
  assert.equal(reason(() => checkUnlockTx(b64(SKR_TX.tx), skrParams)), "accepted");
});
t("wallet tx: the real devnet watch receipt decodes to our memo plus ComputeBudget", () => {
  const d = decodeTransaction(b64(RCPT_TX.tx));
  assert.deepEqual(d.instructions.map((i) => i.programId), ["MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", COMPUTE_BUDGET_PROGRAM_ID, COMPUTE_BUDGET_PROGRAM_ID]);
  assert.equal(TxBuffer.from(d.instructions[0].data).toString("utf8"), rcptMemo);
  assert.equal(reason(() => checkReceiptTx(b64(RCPT_TX.tx), new TxKey(RCPT_TX.payer), rcptMemo)), "accepted");
});
t("wallet tx: wrong payer, changed memo, wrong pack parameters are rejected", () => {
  const other = new TxKey("3sLy3PvzRPFMk1sfnXE9WDJgyc39mZenmjNWtEfpUrBC");
  assert.equal(reason(() => checkReceiptTx(b64(RCPT_TX.tx), other, rcptMemo)), "fee payer");
  assert.equal(reason(() => checkReceiptTx(b64(RCPT_TX.tx), new TxKey(RCPT_TX.payer), rcptMemo.replace("caution", "ok"))), "instructions");
  assert.equal(reason(() => checkUnlockTx(b64(SKR_TX.tx), { ...skrParams, createTreasuryAta: false })), "instructions");
  assert.equal(reason(() => checkUnlockTx(b64(SKR_TX.tx), { ...skrParams, treasury: other })), "instructions");
  assert.equal(reason(() => checkUnlockTx(b64(SKR_TX.tx), { ...skrParams, packHash: "0".repeat(64) })), "instructions");
  assert.equal(reason(() => checkReceiptTx(Uint8Array.from([1, 2, 3]), other, rcptMemo)), "unreadable");
});
// Rebuilds a transaction the way a misbehaving wallet might return it.
const payerKey = new TxKey(RCPT_TX.payer);
const serialize = (ixs: TxIx[], feePayer = payerKey) =>
  Uint8Array.from(
    new TxTransaction({ feePayer, blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 0 })
      .add(...ixs)
      .serialize({ requireAllSignatures: false, verifySignatures: false })
  );
const cuLimit = (n: number) => new TxIx({ programId: new TxKey(COMPUTE_BUDGET_PROGRAM_ID), keys: [], data: TxBuffer.from([2, n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]) });
const cuPrice = (micro: number) => {
  const d = TxBuffer.alloc(9);
  d[0] = 3;
  d.writeBigUInt64LE(BigInt(micro), 1);
  return new TxIx({ programId: new TxKey(COMPUTE_BUDGET_PROGRAM_ID), keys: [], data: d });
};
const lighthouse = new TxIx({ programId: new TxKey(LIGHTHOUSE_PROGRAM_ID), keys: [{ pubkey: payerKey, isSigner: false, isWritable: false }], data: TxBuffer.from([1, 2, 3]) });
t("wallet tx: ComputeBudget and Lighthouse may be added, transfers and other programs may not", () => {
  const memo = memoIx(payerKey, rcptMemo);
  assert.equal(reason(() => checkReceiptTx(serialize([memo]), payerKey, rcptMemo)), "accepted");
  assert.equal(reason(() => checkReceiptTx(serialize([cuLimit(200_000), cuPrice(100_000), memo, lighthouse]), payerKey, rcptMemo)), "accepted");
  const drain = TxSystem.transfer({ fromPubkey: payerKey, toPubkey: new TxKey("3sLy3PvzRPFMk1sfnXE9WDJgyc39mZenmjNWtEfpUrBC"), lamports: 1 });
  assert.equal(reason(() => checkReceiptTx(serialize([memo, drain]), payerKey, rcptMemo)), "instructions");
  const unknown = new TxIx({ programId: new TxKey("3sLy3PvzRPFMk1sfnXE9WDJgyc39mZenmjNWtEfpUrBC"), keys: [], data: TxBuffer.from([0]) });
  assert.equal(reason(() => checkReceiptTx(serialize([memo, unknown]), payerKey, rcptMemo)), "instructions");
  assert.equal(reason(() => checkReceiptTx(serialize([memo, memo]), payerKey, rcptMemo)), "instructions");
  assert.equal(reason(() => checkReceiptTx(serialize([cuLimit(200_000)]), payerKey, rcptMemo)), "instructions");
  // Priority fee: 1,400,000 units at 1,000,000 micro-lamports is 1.4M lamports, over the 0.001 SOL cap.
  assert.equal(reason(() => checkReceiptTx(serialize([cuLimit(1_400_000), cuPrice(1_000_000), memo]), payerKey, rcptMemo)), "priority fee too high");
  assert.equal(reason(() => checkReceiptTx(serialize([cuPrice(10_000_000), memo]), payerKey, rcptMemo)), "priority fee too high");
  const legacyUnits = new TxIx({ programId: new TxKey(COMPUTE_BUDGET_PROGRAM_ID), keys: [], data: TxBuffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0]) });
  assert.equal(reason(() => checkReceiptTx(serialize([legacyUnits, memo]), payerKey, rcptMemo)), "unknown compute budget instruction");
  // A second signer the wallet added.
  const cosigned = new TxIx({ ...memo, keys: [...memo.keys] });
  const extraSigner = new TxIx({ programId: new TxKey(LIGHTHOUSE_PROGRAM_ID), keys: [{ pubkey: new TxKey("3sLy3PvzRPFMk1sfnXE9WDJgyc39mZenmjNWtEfpUrBC"), isSigner: true, isWritable: false }], data: TxBuffer.from([1]) });
  assert.equal(reason(() => checkReceiptTx(serialize([cosigned, extraSigner]), payerKey, rcptMemo)), "extra signer");
});
t("wallet tx: SKR payment rejects added transfers and a changed amount", () => {
  const built = buildUnlockTx({ ...skrParams, blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 0 });
  const ixs = built.instructions;
  const pay = new TxKey(SKR_TX.payer);
  assert.equal(reason(() => checkUnlockTx(serialize([...ixs, cuPrice(1000), lighthouse], pay), skrParams)), "accepted");
  const two = new TxIx({ ...ixs[1], keys: [...ixs[1].keys], data: transferCheckedData(2_000_000, 6) });
  assert.equal(reason(() => checkUnlockTx(serialize([ixs[0], two, ixs[2]], pay), skrParams)), "instructions");
  const drain = TxSystem.transfer({ fromPubkey: pay, toPubkey: new TxKey("3sLy3PvzRPFMk1sfnXE9WDJgyc39mZenmjNWtEfpUrBC"), lamports: 5000 });
  assert.equal(reason(() => checkUnlockTx(serialize([...ixs, drain], pay), skrParams)), "instructions");
  assert.equal(reason(() => checkUnlockTx(serialize([...ixs, ixs[1]], pay), skrParams)), "instructions");
});

// ---- League sign-in message ----
import { checkSignInMessage, leagueHost, reportsToLeague } from "../src/league/logic";
import { LEAGUE_API } from "../src/league/config";
// Same text as buildMessage in the settle-watch-league server (lib/service.ts).
const siws = (p: { domain?: string; wallet?: string; nonce?: string; issuedAt?: string; expiresAt?: string }) =>
  [
    `${p.domain ?? "settle-watch-league.vercel.app"} wants you to sign in with your Solana account:`,
    p.wallet ?? RCPT_TX.payer,
    "",
    "Sign in to the Settle Watch League. This does not send a transaction and costs nothing.",
    "",
    `URI: https://${p.domain ?? "settle-watch-league.vercel.app"}`,
    "Version: 1",
    "Chain ID: mainnet",
    `Nonce: ${p.nonce ?? "0123456789abcdef0123456789abcdef"}`,
    `Issued At: ${p.issuedAt ?? "2026-10-12T10:00:00.000Z"}`,
    `Expiration Time: ${p.expiresAt ?? "2026-10-12T10:05:00.000Z"}`,
  ].join("\n");
t("league: sign-in message must name this League, this wallet and now", () => {
  const domain = leagueHost(LEAGUE_API);
  assert.equal(domain, "settle-watch-league.vercel.app");
  const now = Date.parse("2026-10-12T10:01:00Z");
  const ok = { domain, address: RCPT_TX.payer, now };
  assert.equal(checkSignInMessage(siws({}), ok), null);
  assert.equal(checkSignInMessage(siws({ domain: "evil.example" }), ok), "domain");
  assert.equal(checkSignInMessage(siws({ domain: "settle-watch-league.vercel.app.evil.io" }), ok), "domain");
  assert.equal(checkSignInMessage(siws({ wallet: "3sLy3PvzRPFMk1sfnXE9WDJgyc39mZenmjNWtEfpUrBC" }), ok), "address");
  assert.equal(checkSignInMessage(siws({}).replace("Chain ID: mainnet\n", ""), ok), "chain");
  assert.equal(checkSignInMessage(siws({ nonce: "" }), ok), "nonce");
  assert.equal(checkSignInMessage(siws({}).replace(/Issued At: .*\n/, ""), ok), "issued at");
  assert.equal(checkSignInMessage(siws({ issuedAt: "2026-10-12T09:50:00.000Z", expiresAt: "2026-10-12T10:20:00.000Z" }), ok), "issued at");
  assert.equal(checkSignInMessage(siws({ issuedAt: "2026-10-12T10:12:00.000Z", expiresAt: "2026-10-12T10:17:00.000Z" }), ok), "issued at");
  assert.equal(checkSignInMessage(siws({ issuedAt: "2026-10-12T09:52:00.000Z", expiresAt: "2026-10-12T09:57:00.000Z" }), ok), "expiration");
  assert.equal(checkSignInMessage(siws({}).replace("URI: https://settle-watch-league.vercel.app", "URI: https://evil.example"), ok), "uri");
  assert.equal(checkSignInMessage(siws({}) + "\nNonce: 1111111111111111", ok), "duplicate field");
  assert.equal(checkSignInMessage("transfer all funds", ok), "header");
  assert.equal(checkSignInMessage("x".repeat(1001), ok), "length");
});
t("league: pack_open stays local XP and is never reported", () => {
  assert.equal(reportsToLeague("pack_open"), false);
  for (const k of ["clock_in", "verify", "tamper", "anchor", "add_market"]) assert.equal(reportsToLeague(k), true);
});

// ---- evidence pack: which fields are signed ----
import { packFieldOrigins } from "../src/skr/packFields";
t("evidence pack: unsigned envelope fields are tagged, signed ones compared", () => {
  const o = packFieldOrigins(REC);
  assert.equal(o.checked, "signed");
  assert.equal(o.history, "signed");
  assert.equal(o.proposal, "signed");
  assert.equal(o.resolution, "signed");
  assert.equal(o.clarLatest, "signed");
  assert.equal(o.source, "unsigned");
  assert.equal(o.basis, "unsigned");
  const forged = { ...REC, checked_at: "2026-10-12T23:59:59Z", disputes: [], current_proposal: { price: "1" } };
  const f = packFieldOrigins(forged);
  assert.equal(f.checked, "mismatch");
  assert.equal(f.history, "mismatch");
  assert.equal(f.proposal, "mismatch");
  const unsigned = packFieldOrigins({ ...REC, attestation: null });
  assert.ok(Object.values(unsigned).every((x) => x === "unsigned"));
});

// ---- Feed interests, country boost, settings migration, streak plurals ----
import { countryFromLocale, disputeScore, forYou, hasWord, isCryptoOrTech, leadsWithCryptoTech, mentionsCountry, MIN_FEED, rankFeed, sanitizeInterests, topicsOf, toggleInterest, INTERESTS as FEED_INTERESTS } from "../src/discover/interests";
import { normalizeSettings, serializeSettings } from "../src/store";
import type { DiscoverMarket } from "../src/discover/api";
{
  const mk = (id: string, question: string, extra: Partial<DiscoverMarket> = {}): DiscoverMarket => ({ id, question, slug: id, volume24hr: 0, ...extra });
  const feed = [
    mk("1", "Will the Los Angeles Chargers win the 2027 NFL league championship?"),
    mk("2", "Will the price of Bitcoin be above $86,000 on October 12?"),
    mk("3", "Will the Fed decrease interest rates by 25 bps after the October 2026 meeting?"),
    mk("4", "Will Flamengo win the Copa Libertadores?"),
    mk("5", "Will Lula's party win the Senate vote?"),
    mk("6", "Will the US confirm that aliens exist before 2027?"),
    mk("7", "LoL: BNK FEARX vs JD Gaming", { tags: ["Esports", "Sports"] }),
    mk("8", "Will Solana launch a new phone before 2027?"),
    mk("9", "Will Taylor Swift release a new album in 2026?"),
  ];
  const ids = (r: { market: DiscoverMarket }[]) => r.map((x) => x.market.id);

  t("feed: market parsing keeps category and tag labels", () => {
    const [m] = parseMarkets([{ id: "7", question: "LoL final?", slug: "l", tags: [{ label: "Esports" }, { label: "Sports" }, "x".repeat(50)], category: "Games" }]);
    assert.deepEqual(m.tags, ["Esports", "Sports"]);
    assert.equal(m.category, "Games");
    assert.equal(parseMarkets([{ id: "8", question: "Q?", slug: "q" }])[0].tags, undefined);
  });
  t("feed: topics come from tags and whole-word keywords", () => {
    assert.ok(topicsOf(feed[6]).has("sports"));
    assert.ok(topicsOf(feed[1]).has("crypto"));
    assert.ok(topicsOf(feed[2]).has("world"));
    assert.ok(topicsOf(feed[4]).has("politics"));
    assert.ok(hasWord("will btc go up", "btc"));
    assert.ok(!hasWord("solar power", "sol"));
    assert.ok(!hasWord("the ukraine", "uk"));
    assert.ok(hasWord("são paulo derby", "são paulo"));
  });

  t("feed: interest filtering keeps only chosen topics when enough match", () => {
    const more = [mk("11", "Will Arsenal win the Premier League?"), mk("12", "NBA Finals: Lakers vs Celtics"), mk("13", "Wimbledon winner?")];
    const sportsOnly = rankFeed([...feed, ...more], { interests: ["sports"] });
    for (const r of sportsOnly) assert.ok(topicsOf(r.market).has("sports"), r.market.question);
    assert.deepEqual(ids(sportsOnly), ["1", "4", "7", "11", "12", "13"]);
    assert.ok(sportsOnly.length >= MIN_FEED);
    // Everything chosen keeps every market, including ones with no known topic.
    assert.equal(rankFeed(feed, { interests: [...FEED_INTERESTS] }).length, feed.length);
  });

  t("feed: fill-up rule never leaves fewer than 5 when the feed has them", () => {
    const r = rankFeed(feed, { interests: ["crypto"] });
    assert.equal(r.length, feed.length);
    assert.deepEqual(r.filter((x) => x.matched).map((x) => x.market.id).sort(), ["2", "8"]);
    assert.ok(r.slice(0, 2).every((x) => x.matched));
    assert.equal(rankFeed(feed, { interests: [] }).length, feed.length);
    assert.equal(rankFeed([], { interests: ["sports"] }).length, 0);
  });

  t("feed: country keywords boost local markets to the top", () => {
    assert.ok(mentionsCountry(feed[3], "BR"));
    assert.ok(mentionsCountry(feed[4], "BR"));
    assert.ok(!mentionsCountry(feed[0], "BR"));
    assert.ok(mentionsCountry(mk("x", "Will Putin meet anyone?"), "RU"));
    assert.ok(mentionsCountry(mk("y", "Seoul housing prices up?"), "KR"));
    assert.ok(mentionsCountry(mk("z", "Strait question", { tags: ["United States"] }), "US"));
    const r = rankFeed(feed, { interests: [...FEED_INTERESTS], country: "BR" });
    assert.deepEqual(ids(r).slice(0, 2).sort(), ["4", "5"]);
    // Without the country interest there is no boost.
    const topicsOnly = { interests: ["sports", "politics", "crypto", "world"] as typeof FEED_INTERESTS };
    assert.deepEqual(ids(rankFeed(feed, { ...topicsOnly, country: "BR" })), ids(rankFeed(feed, topicsOnly)));
    assert.ok(!mentionsCountry(feed[3], "ZZ"));
    assert.ok(!mentionsCountry(feed[3], undefined));
  });

  t("feed: wording-resolved markets above price-threshold markets, deterministic", () => {
    assert.equal(disputeScore("Will the price of Bitcoin be above $86,000 on October 12?"), -1);
    assert.equal(disputeScore("Will SOL be above $200 on Friday?"), -1);
    assert.equal(disputeScore("Will Apple announce a foldable iPhone?"), 1);
    assert.equal(disputeScore("Will the files be declassified by end of year?"), 1);
    assert.equal(disputeScore("Will Arsenal win on Sunday?"), 0);
    const r = ids(rankFeed(feed, { interests: ["crypto"] }));
    assert.deepEqual(r.slice(0, 2), ["8", "2"]); // launch before price
    assert.deepEqual(ids(rankFeed(feed, { interests: [...FEED_INTERESTS] })), ids(rankFeed(feed, { interests: [...FEED_INTERESTS] })));
  });

  t("feed: English phone in the US leads with crypto and tech", () => {
    assert.ok(leadsWithCryptoTech({ interests: [...FEED_INTERESTS], country: "US" }, "en"));
    assert.ok(leadsWithCryptoTech({ interests: [...FEED_INTERESTS] }, "en"));
    assert.ok(!leadsWithCryptoTech({ interests: [...FEED_INTERESTS], country: "BR" }, "en"));
    assert.ok(!leadsWithCryptoTech({ interests: [...FEED_INTERESTS], country: "US" }, "ru"));
    assert.ok(!leadsWithCryptoTech({ interests: ["sports"], country: "US" }, "en"));
    assert.ok(isCryptoOrTech(mk("a", "Will OpenAI release GPT-6 in 2026?")));
    const withAi = [...feed, mk("10", "Will OpenAI release GPT-6 in 2026?")];
    const top = rankFeed(withAi, { interests: ["sports", "politics", "crypto", "world"] }, { cryptoTechFirst: true });
    assert.deepEqual(ids(top).slice(0, 3), ["8", "10", "2"]); // crypto/tech first; wording before price inside the lead
    // With "country" on, US markets (here the NFL one) still come first.
    assert.equal(ids(rankFeed(withAi, { interests: [...FEED_INTERESTS], country: "US" }, { cryptoTechFirst: true }))[0], "1");
  });

  t("feed: For you picks matches only and skips the example markets", () => {
    const r = rankFeed(feed, { interests: ["crypto"] });
    assert.deepEqual(forYou(r, 2).map((m) => m.id), ["8", "2"]);
    assert.deepEqual(forYou(r, 2, ["8"]).map((m) => m.id), ["2"]);
    assert.equal(forYou(rankFeed([], { interests: ["crypto"] })).length, 0);
  });

  t("feed: interests toggle in a fixed order and sanitize", () => {
    assert.deepEqual(toggleInterest(["crypto"], "sports"), ["sports", "crypto"]);
    assert.deepEqual(toggleInterest(["sports", "crypto"], "sports"), ["crypto"]);
    assert.deepEqual(sanitizeInterests(undefined), [...FEED_INTERESTS]);
    assert.deepEqual(sanitizeInterests(["world", "nope", "sports", "world"]), ["sports", "world"]);
    assert.deepEqual(sanitizeInterests([]), []);
  });

  t("locale -> country", () => {
    assert.equal(countryFromLocale("pt-BR"), "BR");
    assert.equal(countryFromLocale("en_US"), "US");
    assert.equal(countryFromLocale("zh-Hans-CN"), "CN");
    assert.equal(countryFromLocale("ru-RU"), "RU");
    assert.equal(countryFromLocale("es"), undefined);
    assert.equal(countryFromLocale("es-419"), undefined);
    assert.equal(countryFromLocale(""), undefined);
    assert.equal(countryFromLocale(undefined), undefined);
  });

  t("settings: old stored settings load with interests and country defaults", () => {
    const device = { language: () => "pt" as const, country: () => "BR" };
    const old = normalizeSettings({ onboarded: true, digest: false, digestHour: 9, cluster: "mainnet-beta", language: "ru" }, device);
    assert.equal(old.onboarded, true);
    assert.equal(old.digest, false);
    assert.equal(old.digestHour, 9);
    assert.equal(old.cluster, "mainnet-beta");
    assert.equal(old.language, "ru");
    assert.deepEqual(old.interests, [...FEED_INTERESTS]);
    assert.equal(old.country, "BR");
    const empty = normalizeSettings(null, device);
    assert.equal(empty.language, "pt");
    assert.equal(empty.onboarded, false);
    // A cleared country stays cleared; a bad one is dropped.
    const cleared = normalizeSettings(JSON.parse(serializeSettings({ ...old, country: undefined })), device);
    assert.equal(cleared.country, undefined);
    assert.equal(normalizeSettings({ country: "brazil" }, device).country, undefined);
    const kept = normalizeSettings(JSON.parse(serializeSettings({ ...old, interests: ["crypto"], country: "KR" })), device);
    assert.deepEqual(kept.interests, ["crypto"]);
    assert.equal(kept.country, "KR");
    assert.equal(normalizeSettings({ digestHour: 30 }, device).digestHour, normalizeSettings({}, device).digestHour);
  });

  t("streak label agrees with the number", () => {
    const cases: [string, number, string][] = [
      ["ru", 1, "ДЕНЬ ПОДРЯД"], ["ru", 2, "ДНЯ ПОДРЯД"], ["ru", 4, "ДНЯ ПОДРЯД"], ["ru", 5, "ДНЕЙ ПОДРЯД"], ["ru", 11, "ДНЕЙ ПОДРЯД"],
      ["ru", 21, "ДЕНЬ ПОДРЯД"], ["ru", 0, "ДНЕЙ ПОДРЯД"], ["es", 1, "DÍA DE RACHA"], ["es", 3, "DÍAS DE RACHA"], ["pt", 1, "DIA SEGUIDO"],
      ["pt", 0, "DIAS SEGUIDOS"], ["en", 1, "DAY STREAK"], ["en", 7, "DAY STREAK"],
    ];
    try {
      for (const [l, n, want] of cases) {
        setLang(l as "ru");
        assert.equal(tnRu("home.streakDays", n), want, `${l} ${n}`);
      }
    } finally {
      setLang("en");
    }
  });
}

// ---- Plain words overlay, first screen, example walkthrough ----
import { PLAIN, PLAIN_EN } from "../src/i18nPlain";
import { getPlainWords, LANGS as ALL_LANGS, t as tPlain } from "../src/i18n";
import { memoText as memoPlain } from "../src/wallet";
import { readFileSync, readdirSync } from "node:fs";
{
  const enAll = enDict as Record<string, string>;
  const ph = (x: string) => [...new Set(x.match(/\{\w+\}/g) ?? [])].sort();
  const base = Object.keys(PLAIN_EN);
  t("plain words: every overlay key is a real key, in all six languages, with the same placeholders", () => {
    assert.equal(ALL_LANGS.length, 6);
    for (const k of base) assert.ok(k in enAll, k);
    for (const { id } of ALL_LANGS) {
      const o = PLAIN[id] as Record<string, string>;
      for (const k of base) assert.ok(typeof o[k] === "string" && o[k].trim() !== "", `${id} ${k}`);
      for (const k of Object.keys(o)) {
        const b = k.replace(/\.(few|many)$/, ".other");
        assert.ok(base.includes(b), `${id} extra ${k}`);
        // Russian .one may name {n} where English says "someone".
        const want = ph((PLAIN_EN as Record<string, string>)[b]);
        const got = ph(o[k]).filter((p) => !(id === "ru" && k.endsWith(".one") && p === "{n}" && !want.includes("{n}")));
        assert.deepEqual(got, want, `${id} ${k}`);
      }
    }
    for (const k of base.filter((x) => x.endsWith(".other"))) {
      const b = k.slice(0, -6);
      assert.ok(`${b}.few` in PLAIN.ru && `${b}.many` in PLAIN.ru, `ru ${b}`);
    }
  });
  t("plain words: no em dashes in English, no payout/flipped/settle-wrong wording anywhere", () => {
    const en = [...Object.values(PLAIN_EN), ...["onb.plain.body", "onb.plain.example", "ex.walk.s1", "ex.walk.s2", "ex.walk.s3", "ex.walk.s4", "ex.walk.watch", "home.exampleLink", "settings.plainWords", "settings.plainWordsHint"].map((k) => enAll[k])];
    for (const v of en) assert.ok(!/\u2014/.test(v), v);
    for (const { id } of ALL_LANGS) for (const v of Object.values(PLAIN[id])) assert.ok(!/(payout|flipped|settle[sd]? wrong)/i.test(v ?? ""), v ?? "");
    assert.equal(enAll["onb.plain.body"], "People bet on real events. Sometimes the result gets challenged and changed. Settle Watch warns you if that happens to yours.");
  });
  t("plain words: never touches memo, verification, checks, share or wallet text", () => {
    for (const k of base) assert.ok(!/^(check|share|wallet|anchor\.ok|timeline|action|detail\.checks)/.test(k), k);
    const files = ["src/verify.ts", "src/wallet.ts", "src/txcheck.ts", "src/canonical.ts", ...readdirSync("src/share").map((f) => `src/share/${f}`)];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const k of base) assert.ok(!src.includes(`"${k.replace(/\.(one|other)$/, "")}`), `${f} uses ${k}`);
    }
    const memoArgs = { action: "watch" as const, marketId: "5186278", riskLevel: "caution", packHash: "a".repeat(64) };
    setPlainWords(true);
    const on = [memoPlain(memoArgs), canonicalize({ risk_level: "caution", note: "Disputed" })];
    setPlainWords(false);
    assert.deepEqual([memoPlain(memoArgs), canonicalize({ risk_level: "caution", note: "Disputed" })], on);
  });
  t("plain words: on shows everyday labels, off shows the technical ones, in the widget too", () => {
    const snap = { risk_level: "caution", uma_state: "Disputed", dispute_count: 1, open_dispute: true, sent_to_uma_vote: false, bulletin_board_count: 0, resolved_on_chain: false, paused: false };
    try {
      setPlainWords(true);
      assert.equal(getPlainWords(), true);
      assert.equal(tPlain("status.caution.word"), "CHALLENGED");
      assert.equal(tPlain("status.ok.label"), "All calm");
      assert.equal(tPlain("status.resolved.word"), "FINAL");
      assert.equal(tPlain("detail.anchorWatch"), "Save proof on Solana");
      assert.equal(tPlain("term.pack.title"), "FULL STORY");
      assert.equal(statusLine(snap), "Being challenged right now");
      assert.deepEqual(buildWidgetSummary([], NEW_GAME).tiles.map((x) => x.label), ["CHALLENGED", "WATCH", "CALM", "FINAL"]);
      setLang("ru");
      assert.equal(tnRu("change.dispute", 2), "2 новых спора");
      assert.equal(tnRu("change.dispute", 5), "5 новых споров");
      assert.equal(tnRu("line.settledAfter", 1), "Итог окончательный после 1 спора");
      assert.equal(tRu("status.caution.word"), "ОСПАРИВАЮТ");
      // The checks keep the technical names.
      assert.equal(tRu("check.d.fields", { n: 3 }), ruDict["check.d.fields"].replace("{n}", "3"));
      setLang("en");
      setPlainWords(false);
      assert.equal(tPlain("status.caution.word"), "CAUTION");
      assert.equal(statusLine(snap), "Open UMA dispute");
      assert.deepEqual(buildWidgetSummary([], NEW_GAME).tiles.map((x) => x.label), ["CAUTION", "WATCH", "QUIET", "SETTLED"]);
    } finally {
      setLang("en");
      setPlainWords(false);
    }
  });
  t("widget: streak label agrees with the number", () => {
    setLang("ru");
    try {
      const g = clockIn(NEW_GAME, at("2026-10-12")).state;
      assert.equal(buildWidgetSummary([], g, at("2026-10-12")).streakLabel, "ДЕНЬ ПОДРЯД");
      assert.equal(buildWidgetSummary([], NEW_GAME, at("2026-10-12")).streakLabel, "ДНЕЙ ПОДРЯД");
    } finally {
      setLang("en");
    }
  });
  t("settings: plain words default on, a turned-off value stays off", () => {
    const device = { language: () => "en" as const, country: () => undefined };
    assert.equal(normalizeSettings({ onboarded: true, language: "ru" }, device).plainWords, true);
    assert.equal(normalizeSettings({}, device).plainWords, true);
    assert.equal(normalizeSettings(JSON.parse(serializeSettings({ ...normalizeSettings({}, device), plainWords: false })), device).plainWords, false);
  });
}

Promise.all(asyncChecks).then(
  () => console.log(`${n} checks passed`),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
