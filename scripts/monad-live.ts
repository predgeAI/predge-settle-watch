// Runs every live read behind the Monad edition's Integrations screen and prints the results.
// Read-only: no transaction is signed or sent. Run: EXPO_PUBLIC_EDITION=monad npx tsx scripts/monad-live.ts
import { fetchSettlementRisk } from "../src/api";
import { verifyRecord } from "../src/verify";
import { auroraQuote, DEMO_WALLET, FAMOUS, guardDecision, NANSEN_EXPOSURE, readCre, readKuruBook, readMainnetVerdict, usd0, verdictWords } from "../src/monad/integrations";
import { btcMarket, snapshot } from "../src/monad/chain";

async function main() {
  for (const f of FAMOUS) {
    const v = await readMainnetVerdict(f.id, { bind: true });
    console.log(`verdict ${f.id} ${f.name}: ${verdictWords(v)} bound=${v.bound} updated=${v.lastUpdate} ${v.txUrl}`);
  }
  const r = await fetchSettlementRisk("5219930");
  const ver = await verifyRecord(r);
  console.log(`guard record 5219930: risk ${r.risk_level}, verified on device ${ver.verified}`);
  const g = guardDecision(r, "Yes");
  console.log(`metamask guard: ${g.allowed ? "ALLOWED" : "REFUSED"} to ${g.action}: ${g.reason}`);
  console.log(`nansen (as of ${NANSEN_EXPOSURE.asOf}): ${NANSEN_EXPOSURE.contestedOutcome} cost ${usd0(NANSEN_EXPOSURE.contestedCostUsd)} vs ${usd0(NANSEN_EXPOSURE.otherCostUsd)}, ${NANSEN_EXPOSURE.decision}`);
  console.log("kuru", await readKuruBook());
  console.log("aurora", await auroraQuote(10, DEMO_WALLET));
  console.log("cre", await readCre());
  const [s, m] = await Promise.all([snapshot(DEMO_WALLET), btcMarket()]);
  console.log(`perpl: account ${s.perplAccountId}, margin ${Number(s.perplBalance) / 1e6} AUSD, wallet ${Number(s.ausd) / 1e6} AUSD, BTC mark ${Number(m.markPNS) / 10 ** m.priceDecimals}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
