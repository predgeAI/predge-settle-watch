# Builds src/ruleDetective/cases.json: real market rule excerpts (offline) with candidate phrases found by pattern.
# Usage: python3 scripts/build-rule-cases.py <settlement-risk-model/data dir>
import json, re, sys, random, os
base = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/Downloads/predge-night-2026-10-03/strategy/settlement-risk-model/data")
g = {}
for fn in ("disputed_gamma.jsonl", "disputed_gamma_missing.jsonl"):
    for line in open(f"{base}/{fn}"):
        try:
            j = json.loads(line)
        except Exception:
            continue
        g[str(j["id"])] = j
BAN = re.compile(r"\b(kill\w*|dead|death|die\w*|shot|war|attack|bomb|missile|strike|nuclear|covid|virus|cancer|health|assassin|terror|trump|biden|harris|putin|zelensky|netanyahu|musk|elect\w*|president|senate|congress|vote|tariff|ceasefire|arrest|jail|prison|murder|crime|injur\w*|insult|bet|odds|wager|earthquake|falling|iran|cuba|diplomatic|israel|gaza|ukraine|russia|china|taiwan|mrbeast)\b", re.I)
PATTERNS = [
    ("time", r"(?:[A-Z][a-z]+ \d{1,2}(?:, \d{4})?(?:,| at)? \d{1,2}:\d{2} ?[AP]M ET|\d{1,2}:\d{2} ?[AP]M ET)"),
    ("time", r"(?:by|before|on|between) [A-Z][a-z]+ \d{1,2}(?:, \d{4})?"),
    ("range", r"(?:equals? or exceeds? \d+|(?<![\d.])\d+ or more|more than [\d.,]+|[\d.,]+ or fewer|at least one|equal to or above|greater than or equal to|higher than|above or equal to|wins 2 or more|[\d.]+ or more total games|2-0)"),
    ("source", r"(?:officially (?:joins|announced)|Binance 1 minute candle|close price|open price|Bloomberg x Subdial Watch Index|final \"Close\" price|total number of games completed|records the first touchdown|first blood|upper bound of the target federal funds range)"),
    ("name", r"(?:between [A-Z][\w.'-]+(?: [A-Z][\w.'-]+)* and [A-Z][\w.'-]+(?: [A-Z][\w.'-]+)*|“Other”|'[A-Z][^']{3,30}'|\"(?!Yes\"|No\"|Over\"|Under\"|Up\"|Down\"|Odd\"|Even\")[A-Z][^\"]{2,30}\")"),
]
HINT_KINDS = {"time", "range", "source", "name"}
cands = []
for i, j in g.items():
    q = (j.get("question") or "").strip()
    d = (j.get("description") or "").replace("\n", " ").strip()
    if not q or BAN.search(q) or BAN.search(d):
        continue
    ex = " ".join(re.split(r"(?<=[.!?])\s+", re.split(r"\s*Otherwise", d)[0])[:2]).strip()
    if not (70 <= len(ex) <= 250):
        continue
    found = []
    for kind, pat in PATTERNS:
        for m in re.finditer(pat, ex):
            t = m.group(0).strip()
            if 3 <= len(t) <= 60 and not any(t in f["t"] or f["t"] in t for f in found):
                found.append({"t": t, "kind": kind, "at": m.start()})
                break  # one phrase per pattern
    kinds = {f["kind"] for f in found}
    if len(found) < 3 or len(kinds) < 3:
        continue
    found = sorted(found, key=lambda f: f["at"])[:4]
    # drop overlaps
    clean, end = [], -1
    for f in found:
        if f["at"] >= end:
            clean.append({"t": f["t"], "kind": f["kind"]})
            end = f["at"] + len(f["t"])
    if len(clean) < 3 or len({c["kind"] for c in clean}) < 3:
        continue
    key = re.sub(r"\"[^\"]*\"|\u201c[^\u201d]*\u201d|[A-Z][\w.'/-]*(?: [A-Z][\w.'/-]*)*|\d[\d.,:]*", "X", ex)
    key = re.sub(r"\s+", " ", key)[-90:]
    cands.append({"id": i, "q": q, "text": ex, "phrases": clean, "key": key})
random.seed(7)
random.shuffle(cands)
out, per = [], {}
for c in cands:
    if per.get(c["key"], 0) >= 1:
        continue
    per[c["key"]] = per.get(c["key"], 0) + 1
    del c["key"]
    out.append(c)
    if len(out) >= 30:
        break
json.dump(out, open("src/ruleDetective/cases.json", "w"), ensure_ascii=False, indent=1)
print(len(cands), len(out))
for o in out[:30]:
    print(o["q"], "\n  ", o["text"], "\n  ", [(p["kind"], p["t"]) for p in o["phrases"]])
