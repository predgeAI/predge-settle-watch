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

console.log(`${n} checks passed`);

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
