# Settle Watch 0.3.0 design

Goal: an app people want to open daily, in the visual language of the Solana Mobile "Clock In" hackathon.

## Sources (checked 11 Oct 2026)

- Clock In hackathon site (served at https://www.solanamobile.com/hackathon, hosted on https://solanamobile.radiant.nexus/). Its CSS defines a CRT terminal theme and a paper theme:
  - CRT: background `#0a0f0b`, phosphor green `#86e28a`, bright `#c2ffc4`, dim `#55965a`, rule `#3f7043`, danger orange `#e2703a`, monospace type (`ui-monospace`, SFMono, Menlo), wide letter spacing, soft green glow.
  - Paper: cream `#efe7d6`, ink `#241f18`, soft ink `#5b5145`, monospace headings.
- Solana Mobile main site https://solanamobile.com (purple `#6939c9`, orange `#fd8f3a` in its CSS) and Solana brand purple `#9945FF` to green `#14F195`.

## Decisions

- Ground: `#0a0f0b`. Primary action and "Settled": phosphor green. Monospace for headings, numbers and labels; system sans for body text.
- Today card is the hero, drawn as a cream paper card with ink text (the paper theme from the site).
- The Solana purple to green gradient appears in the header, the app mark and the level ring, so the app reads as Solana Mobile and as Clock In.
- Status colors: Caution orange `#e2703a`, Watch purple `#b98bff`, Quiet neutral `#9fb0a3`, Settled green `#86e28a`. Failure red `#ff5d4d` only for "Not verified" and the tamper rejection.
- Type scale (px): 11 / 13 / 15 / 18 / 24 / 34. Cards use 20 px radius, buttons 14 px.
- Motion: native splash with the mark on the brand background, then a 1.2 s intro (ring draws, check draws, pulse, wordmark, fade). The app mounts underneath, so readiness is not delayed. Reduced motion shows the mark for 350 ms and fades. Press feedback (scale and light haptic), status change pulse, ring-and-check burst on "Verified", red shake and flash on "Rejected", stamp on a receipt, unlock card for badges and levels.
- Icon: clock ring with a check, purple to green gradient on the brand ground. Adaptive foreground, background color and monochrome layer. Regenerate with `python3 scripts/make-icons.py`.

## Clock-in loop (all local, nothing leaves the phone)

- Clock in once per local day (button on the Today card, or opening a market from it). Streak counts consecutive days. One free miss per week (Monday to Sunday) keeps the streak; a second miss resets it.
- XP: clock in 10 (+2 per streak day, up to 7), verify 20 (once per market), tamper test 15 (once per market per day), anchor receipt 50, add a market 10 (once per market), open a changed market within 1 h of the change 40.
- Levels: Watcher 0, Verifier 100, Settler 300, Oracle 700 XP.
- Badges: First verify, Tamper caught, First receipt on Solana, 7-day streak, Dispute spotted early, 5 markets watched.
- Weekly recap on Home. A daily local reminder at the digest hour asks you to clock in.
- No server, tokens, money or leaderboard. The receipt on Solana stays the only on-chain action. Logic is in `src/game.ts` and covered by `npm test`.
