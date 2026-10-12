// Run with: npx tsx src/league/logic.selftest.ts
import assert from "node:assert/strict";
import { AVATAR_IDS, boardRank, rankRows, avatarMap, clanShareText, EMBLEM_IDS, emblemMap, friendlyError, inviteCodeFromUrl, inviteShareText, medalFor, passedLine, shortCountdown, xpKey } from "./logic";

// avatars and emblems: fixed sets, deterministic, 8x8
assert.equal(AVATAR_IDS.length, 16);
assert.equal(EMBLEM_IDS.length, 12);
for (const id of AVATAR_IDS) {
  const a = avatarMap(id);
  assert.equal(a.map.length, 8);
  assert.ok(a.map.every((r) => r.length === 8));
  assert.deepEqual(a, avatarMap(id));
  assert.ok(a.map.some((r) => r.includes("B")), "has eyes");
}
assert.equal(new Set(AVATAR_IDS.map((i) => avatarMap(i).map.join("|"))).size, 16, "all avatars differ");
for (const id of EMBLEM_IDS) assert.ok(emblemMap(id).map.every((r) => r.length === 8));
assert.equal(new Set(EMBLEM_IDS.map((i) => emblemMap(i).map.join("|"))).size, 12);

// medals
assert.equal(medalFor(1)?.name, "Gold");
assert.equal(medalFor(3)?.name, "Bronze");
assert.equal(medalFor(4), null);
assert.equal(medalFor(null), null);

// idempotency key is stable and server-valid
const k = xpKey({ kind: "puzzle_win", at: "2026-10-12T10:00:00.000Z", total: 125 });
assert.equal(k, xpKey({ kind: "puzzle_win", at: "2026-10-12T10:00:00.000Z", total: 125 }));
assert.match(k, /^[A-Za-z0-9_-]{8,64}$/);
assert.notEqual(k, xpKey({ kind: "puzzle_win", at: "2026-10-12T10:00:01.000Z", total: 130 }));

// invite links
assert.equal(inviteCodeFromUrl("settlewatch://invite/abcd2345"), "ABCD2345");
assert.equal(inviteCodeFromUrl("https://settle-watch-league.vercel.app/i/ABCD2345"), "ABCD2345");
assert.equal(inviteCodeFromUrl("https://example.com/other"), null);
assert.equal(inviteCodeFromUrl("settlewatch://invite/short"), null);
assert.equal(inviteCodeFromUrl(null), null);

// copy rules: plain English, no em dash, no banned words
const banned = /bet|odds|wager|payout|flipped|\u2014/i;
for (const t of [inviteShareText("https://x/i/ABCD2345", "ABCD2345"), clanShareText("Night Owls", "ABC234"), passedLine(["Bob", "Cara"]) ?? "", friendlyError("rate_limited", undefined), shortCountdown(90_000_000)]) {
  assert.ok(!banned.test(t), t);
}
assert.equal(passedLine([]), null);
assert.equal(passedLine(["Bob"]), "You passed Bob!");
assert.equal(shortCountdown(0), "resetting");
assert.equal(friendlyError("nope", "Custom"), "Custom");
// ranks: one rule for the board list and the "This week" line
const row = (nickname: string, weeklyXp: number, rank: number, you = false) => ({ nickname, avatar: "a00", weeklyXp, rank, you });
assert.equal(boardRank([row("me", 0, 2, true)], 2), 1, "a solo player is #1 on their own board");
assert.deepEqual(rankRows([row("a", 10, 1), row("b", 30, 3), row("c", 10, 2)]).map((r) => [r.nickname, r.rank]), [["b", 1], ["a", 2], ["c", 2]]);
assert.equal(boardRank([row("a", 50, 1), row("me", 20, 1, true)], 1), 2, "server rank on a row never disagrees with the list order");
assert.equal(boardRank([row("a", 50, 1)], 37), 37, "not on the board: keep the server rank");
assert.equal(boardRank([], null), null);
console.log("league selftest ok");
