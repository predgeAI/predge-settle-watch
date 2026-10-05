# Settle Watch: 2-minute demo video script

Record on an Android phone (Seeker if available) with screen recording on. Wallet: Phantom or Solflare on devnet, or Seed Vault on Seeker. Have about 0.1 devnet SOL in the wallet before recording.

| Time | Screen | Voice-over |
|---|---|---|
| 0:00-0:12 | Title card, then the app home screen | "Prediction markets settle after trading, through UMA's oracle, and a proposed answer can be disputed. From January 1 to October 2, 2026 there were 3,005 UMA disputes on 2,666 Polymarket markets. Of 2,543 that settled, 853, a third, settled differently from the disputed proposal." |
| 0:12-0:25 | Tap **Connect wallet**, approve in the wallet sheet, address and devnet balance appear | "Settle Watch is an Android app. I connect my wallet with Mobile Wallet Adapter. On Seeker this is Seed Vault." |
| 0:25-0:45 | Paste a Polymarket link in **Watch a market**, tap **Add**. Then tap the example **Disputed, open**. Cards show CAUTION and VERIFIED ON DEVICE | "I add markets by link. Here is one with an open UMA dispute right now. The card says caution, and it says verified on device." |
| 0:45-1:10 | Open the market. Scroll through the 7 verification lines. Tap **Tamper test**, the red result appears | "Every record comes from the Predge API, signed with ed25519. The phone checks it itself: pinned key, key published at predge.io, the canonical bytes, the signature, and that every number on screen is the signed one. If I change one character, verification fails." |
| 1:10-1:35 | Tap **Anchor watch receipt**, the wallet asks to sign, approve, success alert, tap **Open explorer**: devnet memo with the pack hash | "Then I anchor a receipt on Solana: a memo transaction with the hash of the exact record I saw, signed through Mobile Wallet Adapter. Now I hold a public, timestamped proof of what I was shown and when." |
| 1:35-1:50 | Back on home, tap **Send test alert**, pull down the notification shade showing the [TEST] alert. Mention background checks line | "The watchlist is checked every minute while open and in the background. When a market gets a dispute, a clarification or settles, I get a notification. This one is a test alert." |
| 1:50-2:00 | Home screen, "Why this matters" card, repo URL on screen | "Settle Watch. Alerts and proof for prediction-market settlement, on your phone. Built on Solana Mobile." |

Notes for recording
- Say "settled differently from the disputed proposal". Do not say the outcome "flipped" or that rules were "edited"; say "bulletin-board update" or "clarification".
- The test alert is labelled [TEST]; do not present it as a real dispute.
- Devnet only. Do not show mainnet balances.
- If the in-app airdrop is rate limited, fund the wallet from faucet.solana.com before recording.
