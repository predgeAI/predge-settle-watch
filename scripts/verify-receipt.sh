#!/bin/sh
# Usage: scripts/verify-receipt.sh <signature> [devnet|mainnet-beta]
# Fetches the transaction from the public RPC and prints the memo, failing unless it contains pack=sha256:
SIG="$1"; NET="${2:-devnet}"
[ -n "$SIG" ] || { echo "usage: $0 <signature> [devnet|mainnet-beta]"; exit 2; }
URL="https://api.${NET}.solana.com"
curl -s -m 20 -X POST "$URL" -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getTransaction\",\"params\":[\"$SIG\",{\"encoding\":\"jsonParsed\",\"maxSupportedTransactionVersion\":0,\"commitment\":\"confirmed\"}]}" > /tmp/receipt.json
python3 -I - <<'PY'
import json,sys
d=json.load(open('/tmp/receipt.json'))
r=d.get('result')
if not r: print('not found yet:', json.dumps(d)[:200]); sys.exit(1)
memos=[i.get('parsed') for i in r['transaction']['message']['instructions'] if i.get('program')=='spl-memo']
print('err:', r['meta']['err'], '| slot:', r['slot'], '| memo:', memos)
sys.exit(0 if any(m and 'pack=sha256:' in m for m in memos) else 1)
PY
