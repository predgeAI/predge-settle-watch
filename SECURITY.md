# Security

## Reporting

Email hello@predge.io with steps to reproduce. Please do not open a public issue for a vulnerability. We reply within 3 working days.

## Scope and design

- The app holds no secrets and needs no API key. Private keys stay in the user's wallet (Seed Vault on Seeker, or any Mobile Wallet Adapter wallet); the app only receives a public address and an auth token.
- Data comes from `https://api.predge.io` over HTTPS and is trusted only after on-device ed25519 verification against the pinned key `13fa3d18a369e6c7`.
- The only transaction the app builds is a Solana memo with the market id, risk level, record hash and key id. Each field is validated before signing.
- User input is restricted to polymarket.com links, slugs, numeric ids and condition ids (300 characters max).
- Release signing keys are kept outside the repository and read from local Gradle properties at build time.
