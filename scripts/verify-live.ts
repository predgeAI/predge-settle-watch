// Runs the app's own verifier against the live Predge API from Node.
// Usage: npx tsx scripts/verify-live.ts [market ...]
import { fetchSettlementRisk } from "../src/api";
import { verifyRecord } from "../src/verify";
import { memoText } from "../src/wallet";

async function main() {
  const markets = process.argv.slice(2).length ? process.argv.slice(2) : ["5186278", "4585694", "601819"];
  let failed = 0;
  for (const m of markets) {
    const r = await fetchSettlementRisk(m);
    const v = await verifyRecord(r);
    const t = await verifyRecord(r, { tamper: true });
    console.log(`${m} ${r.risk_level} verified=${v.verified} tamper_rejected=${!t.verified}`);
    for (const c of v.checks) console.log(`   ${c.ok ? "OK" : "X "} ${c.label} ${c.detail ?? ""}`);
    console.log(`   memo: ${memoText({ action: "watch", marketId: r.market.market_id, riskLevel: r.risk_level, packHash: v.packHash! })}`);
    if (!v.verified || t.verified) failed++;
  }
  process.exit(failed ? 1 : 0);
}
main();
