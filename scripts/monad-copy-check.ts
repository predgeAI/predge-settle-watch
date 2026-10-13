// Monad edition copy check: every interface string a Monad-edition user can reach, in all six languages,
// with plain words on and off, must not name another chain or its wallets and tokens.
// Run: EXPO_PUBLIC_EDITION=monad npx tsx scripts/monad-copy-check.ts
import { en, LANGS, setLanguage, setPlainWords, t, type Key } from "../src/i18n";
import { IS_MONAD } from "../src/edition";

if (!IS_MONAD) {
  console.error("Run with EXPO_PUBLIC_EDITION=monad");
  process.exit(2);
}

// Strings that only the default edition's features show (evidence pack payment, token perks, devnet
// faucet, wallet-app errors, League sign-in). The Monad edition does not render these features.
const HIDDEN = [/^skr\./, /^perks\./, /^faucet\./, /^lg\./, /^badge\.(skr_holder|pack_opener)\./, /^xp\.pack_open$/, /^wallet\.(devnetSol|connectFail|errNetwork|errExpired|errDeclined|errNoSig|errNoAccount|errOtherAccount|errTxChanged|errDropped|errNotConfirmed|errClosed)$/, /^anchor\.(resignTitle|resignBody|droppedBody|savedConfirmed|notFinishedBody)$/];
const BAD = /solana|\bskr\b|seeker|phantom|solflare|mobile wallet adapter|\bmwa\b|devnet|\bsol\b|lamport|seed vault|blockhash|\bspl\b|ソラナ|索拉纳|솔라나|солан/i;

let bad = 0;
for (const { id } of LANGS) {
  setLanguage(id);
  for (const plain of [true, false]) {
    setPlainWords(plain);
    for (const k of Object.keys(en) as Key[]) {
      if (HIDDEN.some((re) => re.test(k))) continue;
      const s = t(k);
      if (BAD.test(s)) {
        bad++;
        console.log(`${id}${plain ? " (plain)" : ""} ${k}: ${s.slice(0, 140)}`);
      }
    }
  }
}
console.log(bad ? `${bad} strings name another chain` : "ok: no visible string names another chain");
process.exit(bad ? 1 : 0);
