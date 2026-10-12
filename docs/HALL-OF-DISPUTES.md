# Hall of Disputes: verification evidence

Data for `src/learn/hallCases.ts`, shown in PLAY > HALL OF DISPUTES and in tour card 4.
Checked 2026-10-12. Every number in the app comes from one of two primary sources:

- **Predge signed settlement-risk record** `https://api.predge.io/v1/settlement-risk/<market_id>`:
  `dispute_count`, `sent_to_uma_vote`, `current_proposal`, `uma_state`, `disputes[]` (time, Polygon tx,
  disputed proposal) and `onchain_resolution.outcome`. All fields below are taken from `attestation.payload`,
  and the ed25519 signature over `attestation.canonical` was verified locally with key
  `13fa3d18a369e6c71bf941563ba47822b30182273d5106a0e8fb61c5016352d9` (kid `13fa3d18a369e6c7`) for all three records.
- **Polymarket gamma API** `https://gamma-api.polymarket.com/markets?slug=<slug>&closed=true`:
  `id`, `question`, `endDate`, `umaEndDate` / `closedTime` (on-chain settle time), `volume`, `outcomePrices`.

No press narrative is used in the app. Claims from news coverage (for example about vote concentration in the
minerals market) were left out because they were not cross-checked against two independent sources in this pass.

"Proposed" in the app is the first proposed answer, i.e. `disputes[0].disputed_proposal`.

## 1. Ukraine agrees to Trump mineral deal before April? (521607)

Predge record (`checked_at` 2026-10-12T15:01:08Z), signed payload excerpt:

```json
{
  "market_id": "521607",
  "condition_id": "0x1663edea3eba0d1ae8f064276dd426cb0497a19bb5188dae48a2f8fa8ea34da8",
  "uma_state": "settled",
  "dispute_count": "2",
  "sent_to_uma_vote": true,
  "current_proposal": null,
  "disputes": [
    { "disputed_at": "2025-03-22T22:00:10Z", "disputed_proposal": "Yes", "tx": "0x94554648ea036744a9de2bced1c83fc75b006c87e133c60598d986dae381fdf8" },
    { "disputed_at": "2025-03-22T23:05:12Z", "disputed_proposal": "Yes", "tx": "0xa1d8a6101c55ffe90637f2a27fe79a78b26951215f24d7d8204025fe6081b576" }
  ],
  "bulletin_board_count": "3",
  "latest_bulletin_board_update": { "kind": "clarification", "posted_at": "2025-03-24T23:57:16Z", "poster": "question_creator" },
  "onchain_resolution": { "outcome": "Yes" }
}
```

Gamma excerpt: `"id":"521607"`, `"endDate":"2025-03-31T12:00:00Z"`, `"umaEndDate":"2025-03-25T00:21:27Z"`,
`"outcomePrices":"[\"1\", \"0\"]"` (Yes), `"volume":"7079947.244644"`.

In the app: proposed Yes, disputed x2, UMA vote, settled Yes on 2025-03-25. Volume $7,079,947.

Sources:
- https://api.predge.io/v1/settlement-risk/521607
- https://gamma-api.polymarket.com/markets?slug=ukraine-agrees-to-give-trump-rare-earth-metals-before-april&closed=true
- https://polygonscan.com/tx/0x94554648ea036744a9de2bced1c83fc75b006c87e133c60598d986dae381fdf8
- https://polygonscan.com/tx/0xa1d8a6101c55ffe90637f2a27fe79a78b26951215f24d7d8204025fe6081b576

## 2. Trump declassifies UFO files in 2025? (537892)

Predge record (`checked_at` 2026-10-12T15:07:53Z), signed payload excerpt:

```json
{
  "market_id": "537892",
  "uma_state": "settled",
  "dispute_count": "2",
  "sent_to_uma_vote": true,
  "current_proposal": null,
  "disputes": [
    { "disputed_at": "2025-12-07T10:04:01Z", "disputed_proposal": "Yes", "tx": "0x44a16ccadfbc4263b5dbf993e6933953da03ae2b6afcfcac4e5e15b0b08d4f08" },
    { "disputed_at": "2025-12-07T11:43:09Z", "disputed_proposal": "Yes", "tx": "0xe0f6018297ccf906c377c321cb3331288af8daa69609b77bfdb8cc0bd223d84f" }
  ],
  "bulletin_board_count": "0",
  "onchain_resolution": { "outcome": "Yes" }
}
```

Gamma excerpt: `"id":"537892"`, `"conditionId":"0x2865bc483dd523f4a36eb961f7467c8635ee9a13f39748bad55f645ce1f61512"`,
`"endDate":"2025-12-31T12:00:00Z"`, `"umaEndDate":"2025-12-10T00:27:58Z"`, `"outcomePrices":"[\"1\", \"0\"]"` (Yes),
`"volume":"16680240.903723"`.

In the app: proposed Yes, disputed x2, UMA vote, settled Yes on 2025-12-10. Volume $16,680,240.

Sources:
- https://api.predge.io/v1/settlement-risk/537892
- https://gamma-api.polymarket.com/markets?slug=trump-declassifies-ufo-files-in-2025&closed=true
- https://polygonscan.com/tx/0x44a16ccadfbc4263b5dbf993e6933953da03ae2b6afcfcac4e5e15b0b08d4f08
- https://polygonscan.com/tx/0xe0f6018297ccf906c377c321cb3331288af8daa69609b77bfdb8cc0bd223d84f

## 3. Trump declassifies new UFO files by May 15? (2190153)

Predge record (`checked_at` 2026-10-12T15:04:11Z), signed payload excerpt:

```json
{
  "market_id": "2190153",
  "condition_id": "0xa7f9dfe2a90e8556fe6b9045ae2dce6950bb4cd8c7fc33efc2876c0bf2f81c0a",
  "uma_state": "settled",
  "dispute_count": "2",
  "sent_to_uma_vote": true,
  "current_proposal": null,
  "disputes": [
    { "disputed_at": "2026-05-16T08:06:10Z", "disputed_proposal": "No", "tx": "0x6b42fd14e550d2d40c984983dd73f84d01e25008da2aad9aaaa0e0029f1d1f0b" },
    { "disputed_at": "2026-05-16T08:10:14Z", "disputed_proposal": "Yes", "tx": "0xb741b81c64546c4c9cfa6d17fbf13dce034db4940840c34f9d6d0db758d5789e" }
  ],
  "bulletin_board_count": "0",
  "onchain_resolution": { "outcome": "Yes" }
}
```

Gamma excerpt: `"id":"2190153"`, `"endDate":"2026-12-31T00:00:00Z"`, `"umaEndDate":"2026-05-19T00:32:04Z"`,
`"outcomePrices":"[\"1\", \"0\"]"` (Yes), `"volume":"3215359.293827996"`,
`"umaResolutionStatuses":"[\"proposed\", \"disputed\", \"proposed\", \"disputed\"]"`.

In the app: first proposed No, disputed x2 (the first dispute objected to No, the second to Yes), UMA vote,
settled Yes on 2026-05-19. Volume $3,215,359. This is the case referenced on tour card 4.

Sources:
- https://api.predge.io/v1/settlement-risk/2190153
- https://gamma-api.polymarket.com/markets?slug=trump-declassifies-new-ufo-files-by-may-15&closed=true
- https://polygonscan.com/tx/0x6b42fd14e550d2d40c984983dd73f84d01e25008da2aad9aaaa0e0029f1d1f0b
- https://polygonscan.com/tx/0xb741b81c64546c4c9cfa6d17fbf13dce034db4940840c34f9d6d0db758d5789e

## Not included

- **Will Zelenskyy wear a suit before July? (546814)**. Gamma confirms the market (`endDate` 2025-06-30,
  `umaEndDate` 2025-07-09T00:30:39Z, `outcomePrices` `["0","1"]` = No, volume 242,231,180). The Predge record
  returned `502 upstream_unavailable` on every attempt on 2026-10-12 (by id, slug and condition id), so the
  dispute count and dispute txs could not be read from the signed record. Left out until the record loads.
