# Settle Watch

## Monad edition (branch `edition/monad`, release `v0.6.3-monad`)

**A third of disputed Polymarket markets settle differently than proposed. Settle Watch checks the settlement on your phone and on Monad.**

From 1 Jan to 2 Oct 2026 there were 3,005 UMA disputes on 2,666 Polymarket markets; 853 of the 2,543 that settled (33.5%) settled differently from the disputed proposal, and at least $299M was traded on them. Example: Iran, $15M, proposed YES, settled NO. Its verdict (0) is on Monad mainnet and the app reads it live.

| | |
|---|---|
| APK | [v0.6.3-monad](https://github.com/predgeAI/predge-settle-watch/releases/tag/v0.6.3-monad) (Android 7+, arm64) |
| Package | `io.predge.settlewatch.monad`, installs next to other Settle Watch builds |
| Chains | Monad mainnet (chain 143) for verdicts and reads, Monad testnet (10143) for Perpl, Agora, Kuru, CRE and default receipts |

**MONAD tab (opens first): one market, one flow.** One sentence, four real markets to pick from (Trump "Ammunition" is selected: disputed twice, in a vote now), then five steps in plain words:

1. **Check**: the signed Predge record, verified on the phone, and the verdict recorded on Monad ("Verified ✓", "Recorded on Monad ↗").
2. **Who's exposed**: Nansen holder cost on each side (saved result of a paid call, 12 Oct).
3. **Act, one tap**: when the guard says don't buy, **Insure against a flip** buys CHANGE dispute notes on Kuru (each pays $1 if the disputed answer flips; test dollars, confirm dialog plus fingerprint). For BTC price markets the action is a Perpl BTC short; otherwise **Alert me when it settles** adds the market to the watchlist.
4. **Add money**: live quote for USDC from Base to Monad (Aurora intents); data is paid per call with x402 in USDC on Monad.
5. **Your key**: three ways, no seed phrase. **Fingerprint** (mera passkey), **Email** (Privy Expo SDK, embedded wallet, one-time code) or **Wallet** (Dynamic React Native SDK, email login with an embedded wallet). Whichever is signed in signs the Kuru notes, the Perpl hedge, receipts and the League.

### How to try it (2 min)

1. Install the APK from the release and open it. Three short screens, then the MONAD tab.
2. Sign in (step 5): Fingerprint, Email or Wallet.
3. A new wallet has no test MON for fees. Tap **Get free test MON**: the app copies your address and opens the Monad faucet (faucet.monad.xyz); paste it, then come back. Or ask us at hello@predge.io and we send test MON to the address shown in My wallet. The app never holds a shared key.
4. With Trump "Ammunition" selected, tap **Insure against a flip**, then Confirm. Test dollars only.
5. See "You're insured" and the Recorded on Monad link.
6. Tap **How it works: 9 integrations**.

Then **Only possible on Monad** and **How it works: 9 integrations**, one card per sponsor, each with one live, read-only action and a proof link:

| Card | Live action | Proof |
|---|---|---|
| Predge Guard | Fetch the ed25519-signed settlement-risk record and verify it on the phone (pinned key, 8 checks) | [guard.predge.io](https://guard.predge.io/) |
| Monad mainnet verdicts | `getValidationStatus(requestHash)` on PredgeAgentValidator `0xf4EE0Af6...eeF9`; checks that `responseHash` is keccak256 of a signed record that verifies | monadvision.com transaction per market (26 verdicts, 12 open requests) |
| MetaMask agent plugin | The `mm predge guard` rule on Trump "Ammunition" (5219930): REFUSED to buy YES while disputed | [mm-plugin](https://github.com/predgeAI/erc8004-outcome-validator/tree/main/mm-plugin) |
| Nansen | Holders' cost on each side of 5219930 (No $91,170 vs Yes $36,208), decision HEDGE. Saved result of a paid call, as of 12 Oct 21:10 UTC; not called live | x402 payments in USDC on Monad mainnet |
| Kuru (testnet) | Best bid and ask of the CHANGE/tUSD book for the 5219930 dispute notes | order book `0x6Ee28124...30A8` |
| Aurora | Live quote, USDC on Base to USDC on Monad (dry run, no deposit address) | delivery and x402 payment transactions on Monad mainnet |
| Perpl + Agora (testnet) | Perpl account, AUSD margin and BTC mark for the passkey wallet `0x81e663d6...0969` | the MONAD tab's own passkey, faucet and hedge flow |
| Chainlink CRE (testnet) | `safeToAct(requestHash)` on PredgeSettlementWatch `0x1518ad21...A90c` | [workflow](https://github.com/predgeAI/erc8004-outcome-validator/tree/main/cre), report transaction |
| Privy / Dynamic | Opens Predge Guard on the web, where they sign you in | [guard.predge.io](https://guard.predge.io/) |

Nothing on the Integrations screen signs or sends a transaction.

**Everything else** (Today, Play, Discover, Me, Daily Dispute, Rule Detective, badges, alerts, widget, share card, QR) works as in the default build. Receipts are Monad transactions from the mera passkey wallet: a zero-value transaction to itself whose calldata is the receipt text, on Monad testnet by default or mainnet after a confirmation. The League (friends, weekly XP, clans) signs in with the passkey wallet: the server issues a Sign-In-With-Ethereum style challenge and checks an EIP-191 `personal_sign` signature (predgeAI/settle-watch-league). Left out of this edition: the evidence-pack payment and token-holder perks.

**Only possible on Monad: how we measured it.** `scripts/monad-measure.ts` reads Predge's mainnet run files (`monad/mainnet/runs/live-*.json` in predgeAI/erc8004-outcome-validator), and for every verdict with both a request and a response transaction fetches both from `https://rpc.monad.xyz`. Request-to-verdict time is the response block's timestamp minus the request block's timestamp; cost is the response transaction's gas limit times its effective gas price, because Monad charges the gas limit, not gas used. Result (13 Oct, 26 verdicts with both transactions): 1 to 2 s (5 to 6 blocks) from request to verdict when sent one at a time (4-market run), 8 s median (25 blocks) in the 34-market batch; about 0.046 MON per request plus verdict (about $0.0011 at the 13 Oct MON price). Stored in `src/monad/measured.json`.

Build it:

```bash
npm ci
EXPO_PUBLIC_EDITION=monad npx tsx scripts/monad-copy-check.ts   # no other chain named in any language
EXPO_PUBLIC_EDITION=monad npx tsx scripts/monad-live.ts         # every live read, read-only
npx tsx scripts/monad-measure.ts <path>/monad/mainnet/runs       # refresh the Monad latency and cost figures
EXPO_PUBLIC_EDITION=monad npx expo prebuild --platform android --clean
cd android && EXPO_PUBLIC_EDITION=monad ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

Without `EXPO_PUBLIC_EDITION` the build is the default app described on the `main` branch.

## Security

Every record is signed by Predge with ed25519 and verified on the phone against pinned keys before it is shown as verified. Nothing on the Integrations screen signs or sends a transaction; receipts, the Kuru notes and the Perpl hedge need a confirm dialog and the passkey; nothing is sent to mainnet without a confirm dialog.

## Support

Open source under MIT, maintained by Predge. Donations cover RPC and hosting and buy no service or token: EVM `0x9084f5000E07C7133D6dA5eE4f271AB6D1821144`.
