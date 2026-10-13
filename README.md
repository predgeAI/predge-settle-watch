# Settle Watch

## Monad edition (branch `edition/monad`, release `v0.6.0-monad`)

**A third of disputed Polymarket markets settle differently than proposed. Settle Watch checks the settlement on your phone and on Monad.**

From 1 Jan to 2 Oct 2026 there were 3,005 UMA disputes on 2,666 Polymarket markets; 853 of the 2,543 that settled (33.5%) settled differently from the disputed proposal, and at least $299M was traded on them. Example: Iran, $15M, proposed YES, settled NO. Its verdict (0) is on Monad mainnet and the app reads it live.

| | |
|---|---|
| APK | [v0.6.0-monad](https://github.com/predgeAI/predge-settle-watch/releases/tag/v0.6.0-monad) (Android 7+, arm64) |
| Package | `io.predge.settlewatch.monad`, installs next to other Settle Watch builds |
| Chains | Monad mainnet (chain 143) for verdicts and reads, Monad testnet (10143) for Perpl, Agora, Kuru, CRE and default receipts |

**MONAD tab (opens first).** One sentence, one famous example with its live Monad mainnet verdict, and **Integrations**: one card per sponsor, each with one live, read-only action and a proof link.

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

**Everything else** (Today, Play, Discover, Me, Daily Dispute, Rule Detective, badges, alerts, widget, share card, QR) works as in the default build. Receipts are Monad transactions from the mera passkey wallet: a zero-value transaction to itself whose calldata is the receipt text, on Monad testnet by default or mainnet after a confirmation. Left out of this edition: the evidence-pack payment, token-holder perks and the League (its sign-in server accepts only the default build's wallet signature).

Build it:

```bash
npm ci
EXPO_PUBLIC_EDITION=monad npx tsx scripts/monad-copy-check.ts   # no other chain named in any language
EXPO_PUBLIC_EDITION=monad npx tsx scripts/monad-live.ts         # every live read, read-only
EXPO_PUBLIC_EDITION=monad npx expo prebuild --platform android --clean
cd android && EXPO_PUBLIC_EDITION=monad ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

Without `EXPO_PUBLIC_EDITION` the build is the default app described on the `main` branch.

## Security

Every record is signed by Predge with ed25519 and verified on the phone against pinned keys before it is shown as verified. Nothing on the Integrations screen signs or sends a transaction; receipts and the Perpl hedge need a passkey confirmation.

## Support

Open source under MIT, maintained by Predge. Donations cover RPC and hosting and buy no service or token: EVM `0x9084f5000E07C7133D6dA5eE4f271AB6D1821144`.
