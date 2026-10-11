# Builds src/dailyDispute/puzzles.json from the frozen benchmark test set joined with Polymarket gamma records.
# Usage: python3 scripts/build-daily-dispute.py <settlement-risk-model/data dir>
# Only facts are kept: question, disputed proposed answer, final on-chain result, first dispute date, label.
import json, re, sys, random, os
base = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/Downloads/predge-night-2026-10-03/strategy/settlement-risk-model/data")
ts = json.load(open(f"{base}/benchmark-test-set-2026-08-09.json"))["rows"]
gamma = {}
for fn in ("disputed_gamma.jsonl", "disputed_gamma_missing.jsonl"):
    for line in open(f"{base}/{fn}"):
        try:
            j = json.loads(line)
        except Exception:
            continue
        gamma[str(j.get("id"))] = j
BAN = re.compile(r"\b(kill|killed|dead|death|die|dies|died|shot|shoot|shooting|war|attack|bomb|missile|strike|invade|invasion|nuclear|covid|virus|cancer|sick|ill|hospital|health|assassin|terror|trump|biden|harris|putin|zelensky|netanyahu|musk|election|elect|president|prime minister|senate|congress|vote|tariff|ceasefire|arrest|jail|prison|sentence|murder|crime|rape|abuse|suicide|injur\w*|insult|says|say|tweet|post|kills|falling|earthquake|bet|odds|wager)\b", re.I)
CATS = {"sports", "esports", "weather", "culture", "crypto", "finance", "tech"}
pool = {0: [], 1: []}
for r in ts:
    g = gamma.get(r["market_id"])
    if not g or r["category"] not in CATS:
        continue
    q = (g.get("question") or "").strip()
    if not q or len(q) > 90 or BAN.search(q):
        continue
    # keep only self-contained questions (the player sees nothing else)
    if not (q.startswith("Will ") or " vs" in q or "Up or Down" in q) or re.match(r"^(Game|Games|Total|First|Spread|3Q|Set)\b", q) or "Daytime" in q:
        continue
    try:
        outs = json.loads(g["outcomes"])
        prices = [float(x) for x in json.loads(g["outcomePrices"])]
    except Exception:
        continue
    if len(outs) != 2 or sorted(prices) != [0.0, 1.0]:
        continue
    prop = outs[0] if r["disputed_proposal_is_outcome_0"] == 1 else outs[1]
    final = outs[prices.index(1.0)]
    diff = 1 if final != prop else 0
    if diff != r["settled_differently"]:
        continue  # keep only rows whose facts agree with the label
    pool[diff].append({"id": r["market_id"], "q": q, "proposal": prop, "final": final, "date": r["first_dispute_utc"][:10], "diff": diff, "cat": r["category"]})
random.seed(2026)
out = []
per_cat = {}
for d, n in ((1, 60), (0, 60)):
    rows = pool[d]
    random.shuffle(rows)
    taken = 0
    for row in rows:
        t = "tennis" if re.search(r"(Set \d Games|Match) O/U|Total Sets", row["q"]) else "handicap" if "Handicap" in row["q"] else "ou" if "O/U" in row["q"] else "other"
        tk = (d, t)
        tcap = {"tennis": 12, "handicap": 8, "ou": 14, "other": 99}[t]
        if per_cat.get(tk, 0) >= tcap:
            continue
        k = (d, row["cat"])
        cap = 40 if row["cat"] == "sports" else 12
        if per_cat.get(k, 0) >= cap:
            continue
        per_cat[k] = per_cat.get(k, 0) + 1
        per_cat[tk] = per_cat.get(tk, 0) + 1
        out.append(row)
        taken += 1
        if taken >= n:
            break
random.shuffle(out)
json.dump(out, open("src/dailyDispute/puzzles.json", "w"), ensure_ascii=False, indent=0)
from collections import Counter
print(len(out), Counter(o["cat"] for o in out), Counter(o["diff"] for o in out), {d: len(v) for d, v in pool.items()})
