# Settle Watch: pitch deck outline (6 slides)

## 1. Title
- Settle Watch: settlement alerts for prediction markets, verified on your phone
- Predge . Clock In, the Solana Mobile hackathon . github.com/predgeAI/predge-settle-watch

## 2. Problem
- Prediction-market outcomes are decided after trading, through UMA's optimistic oracle. A proposed answer can be disputed.
- 1 Jan to 2 Oct 2026: 3,005 UMA disputes on 2,666 Polymarket markets.
- Of 2,543 disputed markets that settled, 853 (33.5%) settled differently from the disputed proposal.
- Holders learn about disputes and clarifications late, from social media, with no way to check what happened.
- Source: UMA Optimistic Oracle and Polymarket UMA CTF adapter logs on Polygon, scanned by Predge.

## 3. Product (demo screenshots)
- Watchlist by Polymarket link
- Android alerts on dispute, UMA vote, bulletin-board update (clarification), on-chain resolution
- On-device verification: 7 checks, ed25519, tamper test
- Solana receipt: pack hash anchored in a memo, signed through Mobile Wallet Adapter

## 4. How it works
- Predge API (existing service) reads UMA and the Polymarket adapter on Polygon live, signs each record with ed25519 (key 13fa3d18a369e6c7, published at api.predge.io/.well-known/predge-keys.json)
- The phone verifies: pinned key, canonical bytes, signature, every displayed field
- Solana: Mobile Wallet Adapter (Seed Vault on Seeker), memo program, devnet today
- Why mobile: disputes happen around the clock and the window to act is hours (median 3.3 h from first dispute to on-chain resolution in the 2026 data)

## 5. Business model
- Free: basic alerts and verification
- Pay per evidence pack (full timeline, bulletin-board text, on-chain references) in USDC on Solana through MWA, no account and no subscription
- Optional SKR payments
- No users or revenue yet; this is the first mobile client

## 6. Roadmap
- Next: USDC (SPL) pay-per-pack on Solana via x402, server push instead of polling
- Solana dApp Store listing
- Watch by wallet: import positions instead of pasting links
- Team: Amir, solo developer of Predge
