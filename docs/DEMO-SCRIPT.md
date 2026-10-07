# Settle Watch: demo video shot list (build 0.2.0) (target 2:50, hard cap 3:00)

Export 1920x1080, 16:9, 30 fps, H.264. Phone recording centered in a phone frame on navy #0B1220, captions on the left. The founder reads the voiceover (about 330 words). Use the same take order as the table; trim pauses.

Before recording: uninstall Settle Watch (or clear its data) so onboarding shows; wallet on devnet with about 0.1 devnet SOL; Do Not Disturb on; "Show touches" on.

| # | Time | Type | On screen | Voiceover |
|---|---|---|---|---|
| 1 | 0:00-0:06 | G1 or title card | "Prediction markets settle after trading." | "Prediction markets settle after trading, and a proposed outcome can be disputed." |
| 2 | 0:06-0:20 | Title card | Three lines in turn: "3,005 UMA disputes on 2,666 Polymarket markets" / "853 of 2,543 settled differently from the disputed proposal (33.5%)" / "1 Jan to 2 Oct 2026. Source: Polygon logs, scanned by Predge" | "From the first of January to the second of October 2026, Polymarket saw 3,005 UMA disputes on 2,666 markets. Of the 2,543 that settled, 853, or 33.5 percent, settled differently from the disputed proposal." |
| 3 | 0:20-0:26 | G4 or title card | "Median 3.3 h from a first dispute to on-chain resolution." | "It moves fast: a median of 3.3 hours from a first dispute to settlement. Holders usually hear about it late." |
| 4 | 0:26-0:44 | Phone | Open Settle Watch: onboarding screen 1, Next, screen 2, Next, screen 3, tap **Add 3 example markets**, allow notifications | "Settle Watch is a new Android app. Three screens explain it, and one tap gives me three real markets to watch." |
| 5 | 0:44-1:02 | Phone | Home: hold on the **Today** card, then the four counters, tap **Caution** to filter, tap again. Scroll the rows with status lines | "The home screen answers one question: what changed today. Below, my watchlist at a glance: caution, watch, quiet, settled, each with a status in plain words." |
| 6 | 1:02-1:12 | Phone | Scroll up, tap **Connect wallet**, approve in the wallet sheet, address and devnet balance appear | "I connect my wallet with Mobile Wallet Adapter. On Seeker, that is Seed Vault." |
| 7 | 1:12-1:30 | Phone | Open the Caution market (Adam Idah). Hold on "Disputed, reset for a new proposal" and the green **Verified on this phone, 7 of 7 checks passed** | "This market was disputed and is waiting for a new proposal. And it is verified on this phone: the record is signed by Predge, and the phone checked the signature itself." |
| 8 | 1:30-1:50 | Phone | Tap **Show the checks**, scroll slowly, tap **Tamper test**, hold on "Rejected, as it should be" for 2 s | "Seven checks: the pinned key, the key published at predge dot io, the canonical bytes, the signature, and that every value on screen is the signed one. If I change one character, verification fails." |
| 9 | 1:50-2:18 | Phone | Tap **Anchor watch receipt**, wallet asks to sign, approve, alert "Receipt on Solana Devnet", tap **Open explorer**: devnet transaction with the memo. Zoom (in editor) on `pack=sha256:` | "Then I anchor a receipt on Solana: a memo transaction with the hash of the exact record I saw, signed through Mobile Wallet Adapter. I now hold a public, timestamped proof of what I was shown." |
| 10 | 2:18-2:36 | Phone | Back to the app, scroll to Settings: digest toggle and hour, tap **Digest now**, pull down the shade showing the digest | "Every day, at the hour I choose, I get one digest: what changed and what still needs attention. The watchlist is checked every minute while open and in the background, and a dispute, clarification or settlement sends an alert." |
| 11 | 2:36-2:42 | Phone | Tap **Send test alert**, show the [TEST] notification. Caption: "Test alert, not a real dispute" | "This one is a test alert, so you can see what it looks like." |
| 12 | 2:42-2:50 | G6 or end card | Predge logo, "Settle Watch", "github.com/predgeAI/predge-settle-watch", "APK on GitHub Releases", "Built on Solana Mobile" | "Settle Watch. Settlement alerts for prediction markets, verified on your phone. Built on Solana Mobile." |

Rules for the edit:
- Shot 11 is labelled as a test alert on screen. Never present it as a real dispute.
- No seed phrase screens, no full personal wallet address (short form only), no mainnet balances.
- Do not show or say that USDC pay-per-pack works. It is roadmap only.
- If the receipt is sent on mainnet instead of devnet, say "on Solana" (not "devnet") in shot 9 and make sure the explorer page shows mainnet.
