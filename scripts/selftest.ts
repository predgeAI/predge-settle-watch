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
