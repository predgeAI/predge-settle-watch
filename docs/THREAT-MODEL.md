# Threat model

This document says what Settle Watch checks, what it relies on, and where it stops. Every claim points to the code that does it. If the code and this file disagree, the code wins and this file has a bug.

## Assets

- The user's view of a market: the record shown as verified must be one Predge signed.
- The user's funds: SOL for fees and SKR for evidence packs.
- The user's receipts: a memo on Solana that names the exact bytes the user saw.
- League standing: game points only, with no value.

## What the phone verifies

`verifyRecord` in [src/verify.ts](../src/verify.ts) runs these checks on the device. A record counts as verified only if every check passes.

1. **Pinned key.** `attestation.public_key` must equal `PINNED_PUBLIC_KEY_HEX` and its first 16 hex characters must equal `PINNED_KID` (`13fa3d18a369e6c7`). Both are constants in [src/config.ts](../src/config.ts). A record signed by any other key never verifies.
2. **Published key list.** The key must be listed as active, role `attestation`, in `https://api.predge.io/.well-known/predge-keys.json`. The list is cached for one hour. If the list cannot be fetched, this check passes and says "key list unreachable, using pinned key" (see limitations).
3. **Algorithm.** `attestation.algorithm` must be `ed25519`.
4. **Canonical bytes.** `canonicalize(attestation.payload)` ([src/canonical.ts](../src/canonical.ts): keys sorted at every level, no whitespace, a subset of RFC 8785) must reproduce `attestation.canonical` byte for byte. This binds the parsed payload to the signed string.
5. **Signature.** `nacl.sign.detached.verify` over the UTF-8 bytes of `canonical`, with the pinned public key.
6. **Displayed fields match the signed payload.** These 11 values shown in the app are compared with the signed payload: `risk_level`, `recommendation`, `uma_state`, `dispute_count`, `open_dispute`, `sent_to_uma_vote`, `resolved_on_chain`, `paused`, `bulletin_board_count`, `market_id`, `condition_id`. Any mismatch fails and names the field.
7. **Pack hash.** `sha256(canonical)` in hex. This is the value written to Solana.

**Tamper test.** `verifyRecord(r, { tamper: true })` changes one character of the signed bytes (the first letter of `risk_level`). Checks 4 and 5 then fail and the screen shows the rejection. `scripts/verify-live.ts` runs both paths against live records and exits non-zero if a real record fails or a tampered one passes.

A record that is not verified cannot be anchored or used for an SKR payment. `doAnchor` in [App.tsx](../App.tsx) and `doPay` in [src/skr/EvidencePack.tsx](../src/skr/EvidencePack.tsx) both require `verification.verified` and a `packHash`.

Before verification, [src/api.ts](../src/api.ts) shape-checks the response (`assertSettlementRisk`: numeric market id up to 12 digits, known risk level, length limits) and times out after 20 s. User input is limited to `polymarket.com` and `www.polymarket.com` links, slugs, numeric ids up to 12 digits and 0x condition ids, 300 characters at most (`parseMarketInput`). Lookalike hosts and path tricks are rejected and covered by `npm test`.

## What a receipt proves, and what it does not

A watch receipt is a memo transaction signed by the user's wallet. Format and instructions are in [RECEIPTS-AND-SKR.md](RECEIPTS-AND-SKR.md).

It proves:
- The wallet that signed it published `pack=sha256:<hash>` on Solana no later than the block time of that transaction.
- Anyone who holds the signed record can recompute the hash and check it is the same bytes.
- `kid=` names the Predge key the record was signed with.

It does not prove:
- That the record is correct. The signature proves Predge published those bytes. Whether the chain facts and Predge's reading of them are right is a separate question. `data_basis` in each record says how to re-check the facts on any Polygon RPC.
- That the user read or understood the record.
- When Predge produced the record. That is `checked_at` and `issued_at` inside the signed payload, which the app does not compare with the receipt time.

## Trust assumptions

| We trust | For | If it fails |
|---|---|---|
| The Predge signing key | Records are what Predge published | A stolen key can sign false records that verify. Rotation needs a new app build, because the key is pinned. |
| The Solana RPC (`api.devnet.solana.com`, `api.mainnet-beta.solana.com`) | Blockhash, balances, confirmation status | A lying RPC can claim a transaction confirmed when it did not, or report wrong balances. It cannot forge a wallet signature or change a signed transaction. |
| The wallet app | Holding keys, showing the transaction, signing | The wallet sees and signs the transaction. The app sends the bytes the wallet returns. |
| Android | App sandbox and storage | Data in AsyncStorage (watchlist, wallet auth token, League session) is protected only by the app sandbox. |

## Attacker models

**Network attacker on the Predge API.** Traffic is HTTPS. Even with TLS broken, an attacker cannot make a forged or altered record verify (checks 1, 4, 5, 6). They can block responses, which shows as an error, or replay an older record that Predge did sign (see below).

**Replayed old record.** A genuine older record still passes every check. The app does not reject a record because its `checked_at` or `issued_at` is old, and it does not compare those signed timestamps with the values it displays. What it does: the app records its own poll time (`lastPolledAt`) and shows "checked ... ago", and every receipt carries the Solana block time. A replay can make the app show a stale but authentic status. It cannot make it show a status Predge never signed.

**Malicious or faulty RPC.** Covered in the table above. Re-sending in `landTransaction` uses `skipPreflight`, so a bad transaction is caught by the status poll, not by preflight. A status with `err` is treated as rejected and the receipt or payment is dropped.

**App impersonation.** Another app can present itself to a wallet as "Settle Watch, predge.io". The defence is Digital Asset Links: `https://predge.io/.well-known/assetlinks.json` is served as `application/json` and lists `io.predge.settlewatch` with the release certificate fingerprint `07:D3:6A:05:3F:88:36:38:6E:88:B3:80:2D:73:04:C3:E8:4F:40:9A:E6:15:12:26:BC:0A:C3:7B:8E:EC:EF:36`. A wallet that checks this can tell the real app from a copy. Whether a wallet checks it depends on the wallet. In every case the wallet shows the transaction before signing.

**Malicious League backend.** It can see wallet addresses, nicknames and reported XP events. It can send any text as the sign-in message (the app does not inspect it before `signMessages`; the wallet shows it). It cannot move funds: sign-in uses `signMessages`, never a transaction.

## SKR payment safety

Code: [src/skr/spl.ts](../src/skr/spl.ts), [src/skr/chain.ts](../src/skr/chain.ts), [src/skr/EvidencePack.tsx](../src/skr/EvidencePack.tsx).

- **Fixed constants.** Mint `SKR_MINT`, decimals 6, treasury `SKR_TREASURY` and `PACK_PRICE_BASE = 1_000_000` (1 SKR) are compile-time constants. No amount comes from user input or the network. `treasuryKey` rejects an address that does not round-trip as base58.
- **TransferChecked**, not Transfer, so the token program also checks the mint and decimals.
- **Memo fields are validated** (`^\d{1,12}$` market id, `^[0-9a-f]{64}$` hash) before the transaction is built.
- **Pre-checks before the wallet opens** (`checkCanPay`): the payer's associated SKR account must hold at least 1 SKR, and the SOL balance must cover 20,000 lamports of fee headroom plus 2,039,280 lamports of rent if the treasury's SKR account does not exist yet.
- **User confirmation** in an in-app dialog before the wallet opens.
- **Same account.** Inside the wallet session, the account the wallet returns must equal the connected address, or the payment stops.
- **One payment at a time.** A module-level `paying` flag blocks double taps and parallel payments.
- **Unlock only after confirmation.** `payForPack` resolves only when `getSignatureStatuses` reports `confirmed` or `finalized` on mainnet.
- **Interrupted payment resume.** The signed transaction and `lastValidBlockHeight` are saved as soon as the wallet returns them. On the next start, `resumePendingUnlock` re-sends and checks. Confirmed: the pack unlocks. Expired: the pending entry is removed and the user is told nothing was charged. Unknown: it is kept and checked again later.
- **Mainnet always.** `SKR_CLUSTER` is `mainnet-beta` regardless of the receipt network setting. A mainnet auth token is saved only if the app itself is on mainnet, so devnet receipts keep working.

## League anti-abuse

Client: [src/league/](../src/league). Server: the separate `settle-watch-league` repository (`lib/config.ts`, `lib/service.ts`).

- **Sign-in.** The server issues a 16-byte random nonce bound to the wallet, valid 300 s. The message names the domain, wallet, nonce, issued-at and expiry. On verify, the server rebuilds the message and requires an exact match, an allowed domain, an unexpired message, issued-at no more than 60 s in the future and a lifetime of at most 600 s. The ed25519 signature is checked with tweetnacl. Only a valid signature consumes the nonce, and a nonce works once. Sessions last 24 h and are stored server-side as a sha256 of the token.
- **XP is decided by the server.** The app reports only the action name and an idempotency key. Each action has a fixed value, a daily cap and a minimum gap (for example `anchor`: 50 XP, 3 a day, 20 s apart). One account can earn at most 150 XP a day. A repeated idempotency key returns the first result and grants nothing.
- **Other caps.** 100 friends, 20 clan members, at most 400 weekly XP per member counted toward a clan, invite bonus 25 XP up to 5 times per account.
- **Rate limits.** 120 requests a minute per IP, 20 sign-in requests a minute per IP and per wallet, 60 a minute per wallet.
- **Disclaimer in the app and API:** League scores are game points reported by the app, not verified, and carry no value.

## Key handling

- The app holds no private keys and needs no API key. It receives a public address and an MWA auth token.
- Release signing reads `SETTLEWATCH_UPLOAD_*` Gradle properties from the developer's machine ([plugins/with-release-signing.js](../plugins/with-release-signing.js)). `.gitignore` excludes `*.jks`, `*.keystore`, `*.p8`, `*.p12`, `*.key`, `*.pem`, `.env*.local` and the generated `/android` and `/ios` folders.
- Dependencies are pinned to exact versions (`.npmrc` `save-exact=true`) and locked in `package-lock.json`.
- Android permissions: `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK` ([app.json](../app.json)). No location, contacts, camera or storage.

## Known limitations

These are true of the code today. They are listed so reviewers do not have to find them.

1. **Key list fails open.** If `/.well-known/predge-keys.json` is unreachable, check 2 passes and the app relies on the pinned key alone. A revoked key would still verify while the list is blocked.
2. **Not every displayed value is bound.** The market question, slug and `checked_at` come from the unsigned envelope. The question and slug are not in the signed payload at all. `checked_at` is signed but not compared. The evidence pack also shows `current_proposal`, `onchain_resolution` and the dispute list from the envelope; they are in the signed payload but not compared. The 11 fields in check 6 are the ones that drive status, alerts and receipts.
3. **No freshness check.** An old signed record is accepted (see replay above).
4. **Watch receipts do not re-check the account.** `anchorPack` signs with whatever account the wallet returns. The SKR payment path does check it.
5. **The app does not inspect the transaction the wallet returns** before sending it. Wallets may add instructions. The mainnet example transaction contains ComputeBudget and Lighthouse instructions added by the wallet.
6. **The SKR unlock is enforced on the phone.** The evidence pack is built from data the phone already holds (the verified record and the local timeline). The unlock is stored in AsyncStorage. No server checks the payment, so a modified APK can skip it.
7. **One RPC per cluster.** Confirmation and balances come from a single public endpoint.
8. **League sign-in message is not inspected by the app** before signing; the user relies on the wallet's display.
9. **The `pack_open` XP action is not in the server's action table**, so the League server rejects it with `unknown_action` and the app drops the report. Local XP is unaffected.
10. **Key rotation needs an app update** because the key is pinned.
11. **Alerts are not gated on verification.** Change detection runs on every well-formed response. The alert text then says "Verified on device" or "NOT verified", so an unsigned or altered record can raise an alert, marked as not verified. It cannot be anchored or paid for.

## Reporting

See [SECURITY.md](../SECURITY.md).
