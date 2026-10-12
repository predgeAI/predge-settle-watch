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
