// Measures Predge's verdicts on Monad mainnet from the run files and the chain itself, and writes
// src/monad/measured.json for the app's "Only possible on Monad" card.
// Input: monad/mainnet/runs/live-*.json from predgeAI/erc8004-outcome-validator (request and response tx per market).
// For every verdict with both transactions: request->verdict latency = response block timestamp - request block
// timestamp (also in blocks); cost = gas limit x effective gas price of the response transaction, because Monad
// charges the gas limit, not gas used. Also the request transaction's cost, for a full request + verdict cycle.
// Run: npx tsx scripts/monad-measure.ts <path to monad/mainnet/runs>
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createPublicClient, defineChain, http, type Hex } from "viem";

const chain = defineChain({ id: 143, name: "Monad", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.monad.xyz"] } } });
const pub = createPublicClient({ chain, transport: http("https://rpc.monad.xyz", { retryCount: 3, timeout: 20_000 }) });

async function txInfo(hash: Hex) {
  const [tx, rc] = await Promise.all([pub.getTransaction({ hash }), pub.getTransactionReceipt({ hash })]);
  const block = await pub.getBlock({ blockNumber: rc.blockNumber });
  return { block: Number(rc.blockNumber), at: Number(block.timestamp), gasLimit: tx.gas, gasUsed: rc.gasUsed, price: rc.effectiveGasPrice, ok: rc.status === "success" };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("usage: monad-measure.ts <runs dir>");
  const files = readdirSync(dir).filter((f) => /^live-.*\.json$/.test(f)).sort();
  const rows: any[] = [];
  for (const f of files) {
    const run = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
    for (const v of run.verdicts ?? []) {
      if (!v.request?.tx || !v.response?.tx) continue;
      const [rq, rs] = await Promise.all([txInfo(v.request.tx), txInfo(v.response.tx)]);
      if (!rq.ok || !rs.ok) continue;
      rows.push({
        market: v.market_id,
        latencyS: rs.at - rq.at,
        blocks: rs.block - rq.block,
        verdictMon: Number(rs.gasLimit * rs.price) / 1e18,
        requestMon: Number(rq.gasLimit * rq.price) / 1e18,
        verdictGasUsed: Number(rs.gasUsed),
      });
    }
  }
  if (!rows.length) throw new Error("no verdict with both transactions");
  const lat = rows.map((r) => r.latencyS);
  const out = {
    measuredAt: new Date().toISOString(),
    runs: files,
    verdicts: rows.length,
    latencySeconds: { median: median(lat), max: Math.max(...lat), min: Math.min(...lat) },
    blocks: { median: median(rows.map((r) => r.blocks)) },
    monPerVerdict: { median: median(rows.map((r) => r.verdictMon)), max: Math.max(...rows.map((r) => r.verdictMon)) },
    monPerCycle: { median: median(rows.map((r) => r.verdictMon + r.requestMon)) },
    method: "request->verdict = response block timestamp - request block timestamp on Monad mainnet; cost = gas limit x effective gas price (Monad charges the limit)",
    rows,
  };
  writeFileSync(path.join(__dirname, "..", "src", "monad", "measured.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify({ ...out, rows: undefined }, null, 2));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
