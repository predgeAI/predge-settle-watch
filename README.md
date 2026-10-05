# Settle Watch

Android app for Polymarket holders. Watch a market and get a phone alert when it gets a UMA dispute, a bulletin-board update (clarification) or settles on chain. Every alert is backed by a signed Predge record that the phone verifies itself, and you can anchor a receipt of that record on Solana through Mobile Wallet Adapter.

Built for **Clock In, the Solana Mobile hackathon** (Radiants, 2026). New project, started in October 2026 in this repository.

## Why

Prediction-market outcomes are decided after trading, through UMA's optimistic oracle, where a proposed answer can be disputed. From 1 January to 2 October 2026 there were 3,005 UMA disputes on 2,666 Polymarket markets. Of the 2,543 disputed markets that have settled, 853 (33.5%) settled differently from the disputed proposal. Holders usually hear about a dispute late, from social media, and cannot check what happened. Settle Watch puts the alert and the proof on the phone.

## What it does

| Feature | How |
|---|---|
| Watchlist | Paste a Polymarket link, a market slug, a numeric market id or a 0x condition id. Stored on the device. |
| Polling | Every 60 s while the app is open; about every 15 min in the background (Android WorkManager via `expo-background-fetch`, survives reboot). |
| Alerts | Native Android notifications on a high-importance channel when any of these change: dispute count, UMA vote, bulletin-board updates, UMA state, paused, on-chain resolution. |
| On-device verification | 7 checks per record: pinned key `13fa3d18a369e6c7`, key listed active in `/.well-known/predge-keys.json`, ed25519 algorithm, payload re-canonicalises (JCS subset) to the signed bytes, ed25519 signature valid (tweetnacl), every field on screen equals the signed one, sha256 pack hash. A "Tamper test" button flips one character and shows the check fail. |
| Mobile Wallet Adapter | Connect, reauthorize, deauthorize (`@solana-mobile/mobile-wallet-adapter-protocol-web3js`). Works with Seed Vault on Seeker, Phantom, Solflare. |
| Solana interaction | "Anchor watch receipt" / "Acknowledge alert" build a memo transaction (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`) containing the market id, risk level, sha256 of the verified pack and the key id; the wallet signs and sends it via MWA `signAndSendTransactions`; the app confirms it and links to Solana Explorer. Devnet only. |
| Devnet faucet | In-app airdrop request, with a fallback to faucet.solana.com. |

## Existing dependency (built before the hackathon)

The Predge data API is an existing Predge service and is used here as a backend dependency:

- `GET https://api.predge.io/v1/settlement-risk/:market` (free). Reads UMA's Optimistic Oracle and Polymarket's UMA CTF adapter on Polygon live and returns the dispute state, `risk_level` and `recommendation`, signed ed25519.
- `GET https://api.predge.io/.well-known/predge-keys.json` (key list).

Everything in this repository (the Android app, verification, notifications, MWA and memo anchoring) is new work for the hackathon.

## Build an APK locally

Requirements: Node 20, JDK 17, Android SDK (platform 35, build-tools 35.0.0, NDK 26.1.10909125). No Expo account and no EAS needed.

```bash
npm install
npx expo prebuild --platform android
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
# APK: android/app/build/outputs/apk/release/app-release.apk
```

Release signing: if the Gradle properties `SETTLEWATCH_UPLOAD_STORE_FILE`, `SETTLEWATCH_UPLOAD_STORE_PASSWORD`, `SETTLEWATCH_UPLOAD_KEY_ALIAS` and `SETTLEWATCH_UPLOAD_KEY_PASSWORD` are set (for example in `~/.gradle/gradle.properties`), that key signs the release; otherwise the debug key is used. No key material is in the repository.

## Check the verifier against the live API

```bash
npx tsx scripts/verify-live.ts 5186278 4585694 601819
```

Runs the same `src/verify.ts` the app uses: each record must verify, and the tampered copy must be rejected.

## Try it on a phone

1. Install the APK (`adb install app-release.apk`) on a Seeker or any Android 8+ phone.
2. Install an MWA wallet and switch it to devnet.
3. Open Settle Watch, allow notifications, tap **Connect wallet**, then **Devnet SOL**.
4. Tap an example market ("Disputed, open"), open it, check the 7 verification lines, tap **Anchor watch receipt**, approve in the wallet, open the explorer link.
5. **Send test alert** shows what an alert looks like (marked [TEST]).

## Layout

```
App.tsx            UI (watchlist, detail, verification, anchoring)
index.ts           polyfills, background task definition
src/api.ts         Predge API client, market input parsing
src/verify.ts      on-device ed25519 + canonical JSON + field checks
src/canonical.ts   JCS-subset canonicaliser
src/watcher.ts     polling, change detection, notifications, background task
src/wallet.ts      Mobile Wallet Adapter, devnet memo anchoring
src/store.ts       AsyncStorage watchlist and wallet session
plugins/           Expo config plugins (MWA <queries>, release signing)
scripts/           live verifier check
```

## Limits (honest)

- Background checks follow Android's schedule (15 min minimum, may be deferred by battery optimisation). There is no push server yet.
- Paying for a full evidence pack in USDC on Solana is not live: the Predge x402 paywall settles on EVM today. The memo receipt is the Solana interaction in this build.
- Devnet only. No mainnet funds are used.
- `risk_level` and `recommendation` are Predge's reading of chain facts, not advice.
- No users, downloads or revenue yet.

## License

MIT
