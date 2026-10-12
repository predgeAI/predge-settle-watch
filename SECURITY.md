# Security

## Reporting

Email **hello@predge.io** with the affected version, steps to reproduce and, if you have one, a proof of concept. Please do not open a public issue for a vulnerability. We reply within 3 working days and credit reporters who want credit.

## Scope

In scope:
- The Android app in this repository: on-device verification ([src/verify.ts](src/verify.ts), [src/canonical.ts](src/canonical.ts)), Mobile Wallet Adapter flows and transaction building ([src/wallet.ts](src/wallet.ts), [src/skr/](src/skr)), input and response validation ([src/api.ts](src/api.ts)), local storage ([src/store.ts](src/store.ts)), the widget and the config plugins ([plugins/](plugins)).
- The League backend `settle-watch-league` (SIWS sign-in, sessions, XP caps, rate limits).
- App identity: `https://predge.io/.well-known/assetlinks.json` and the release signing setup.

Out of scope:
- Wallet apps, Seed Vault and the Solana runtime.
- The Predge API at `api.predge.io` beyond the signed records the app consumes. Report API issues to the same address.
- Denial of service against public RPC endpoints.
- League scores. They are game points with no value; cap bypasses are still welcome as reports.

## Design summary

- The app holds no private keys and no API keys. It receives a public address and an MWA auth token.
- Records from `https://api.predge.io` are trusted only after on-device ed25519 verification against the pinned key `13fa3d18a369e6c7`, and only while their signed time is at most 24 h old.
- The app builds two transactions: a memo receipt, and a 1 SKR `TransferChecked` plus memo on mainnet. All amounts, mints and addresses are constants, and memo fields are validated before signing. The transaction the wallet returns is decoded and checked before it is sent; a wallet may add only ComputeBudget and Lighthouse instructions.
- Release signing keys are kept outside the repository and read from local Gradle properties.

Full model, trust assumptions and known limitations: [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).

## Dependency advisories (12 Oct 2026)

The Clock In security module flagged known advisories in `tar`, `@xmldom/xmldom`, `image-size`, `postcss`, `uuid` and `stream-json`, all pulled in through Expo, React Native tooling and the Solana and wallet adapter packages.

- Updated through `overrides` in `package.json`: `@xmldom/xmldom` 0.8.15, `postcss` 8.5.29, `image-size` 2.0.4, `uuid` 11.1.1, `stream-json` 3.7.0. Type check, the 103 self-tests, `expo prebuild` and the release build pass.
- `tar` is now 7.5.22 through `overrides`. Expo CLI 0.22 imported it as a default export, which the 7.x line no longer has, so `patches/@expo+cli+0.22.28.patch` (applied by `patch-package` on install) imports it as a module. `expo prebuild` and the release build pass. `tar` only runs on the developer machine when generating `android/`.
- None of these packages ship in the app. The release APK built with and without the overrides is byte-identical (sha256 `b826dff4…`, the same file as the v0.3.9 release asset), so they are build and tooling dependencies only.

## Client-integration leads reviewed (12 Oct 2026)

The security module listed three leads it could not confirm. Each was checked by hand:

- **Deep links** (`src/league/LeagueEntry.tsx`): the only thing read from an incoming link is an
  invite code, extracted by `inviteCodeFromUrl` in `src/league/logic.ts` with a strict pattern
  (`settlewatch://invite/<8 alphanumerics>` or `/i/<8 alphanumerics>`). Anything else is ignored. The
  code is stored as a pending invite and shown to the user; a link cannot trigger a transaction,
  a signature or a network call to an arbitrary host.
- **Non-local `http://`** (`src/share/card.ts`): the string is the SVG XML namespace
  `http://www.w3.org/2000/svg`, not a network endpoint. The app makes no plain-HTTP requests.
- **`skipPreflight`** (`src/wallet.ts`): used only when re-broadcasting a transaction the wallet has
  already signed and the app has already decoded and checked (`src/txcheck.ts`: memo, fee payer, no
  unexpected programs). Preflight is skipped because lagging public devnet nodes report a false
  "Blockhash not found". The result is still checked: the loop reads `getSignatureStatuses`,
  surfaces any on-chain error, and records a receipt only once it is confirmed.

