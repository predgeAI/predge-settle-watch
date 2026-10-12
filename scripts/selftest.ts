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
  assert.equal(input.text.checks, "7/7 checks on my phone");
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
console.log(`${n} checks passed`);
