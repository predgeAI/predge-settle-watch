# Threat model

This document says what Settle Watch checks, what it relies on, and where it stops. Every claim points to the code that does it. If the code and this file disagree, the code wins and this file has a bug.

## Assets

- The user's view of a market: the record shown as verified must be one Predge signed.
- The user's funds: SOL for fees and SKR for evidence packs.
- The user's receipts: a memo on Solana that names the exact bytes the user saw.
- League standing: game points only, with no value.

## What the phone verifies

`verifyRecord` in [src/verify.ts](../src/verify.ts) runs these 8 checks on the device (`VERIFY_CHECKS` in [src/config.ts](../src/config.ts)). Each check is `pass`, `fail` or `unknown`. A record counts as verified only if every check passes, with one exception for check 2 described there.

1. **Pinned key.** `attestation.public_key` must equal `PINNED_PUBLIC_KEY_HEX` and its first 16 hex characters must equal `PINNED_KID` (`13fa3d18a369e6c7`). Both are constants in [src/config.ts](../src/config.ts). A record signed by any other key never verifies.
2. **Published key list.** The key must be listed as active, role `attestation`, in `https://api.predge.io/.well-known/predge-keys.json` (12 s timeout). A fetched list is kept in memory for one hour. A fetched list that does not list the key fails the check. If the list cannot be fetched, the check is `unknown`, never passed, and says "key list not reachable, pinned key used". The record then still counts as verified only if a fetch in the last 7 days (`KEY_LIST_GRACE_MS`) listed the key: every fetch that lists the key is saved with its time in AsyncStorage (`settle-watch/keylist/last-good/v1`). Without such a fetch the record is not verified. In the grace case the screen shows 7 of 8 checks passed and the check row shows `?`.
3. **Algorithm.** `attestation.algorithm` must be `ed25519`.
4. **Canonical bytes.** `canonicalize(attestation.payload)` ([src/canonical.ts](../src/canonical.ts): keys sorted at every level, no whitespace, a subset of RFC 8785) must reproduce `attestation.canonical` byte for byte. This binds the parsed payload to the signed string.
5. **Signature.** `nacl.sign.detached.verify` over the UTF-8 bytes of `canonical`, with the pinned public key.
6. **Displayed fields match the signed payload.** These 11 values shown in the app are compared with the signed payload: `risk_level`, `recommendation`, `uma_state`, `dispute_count`, `open_dispute`, `sent_to_uma_vote`, `resolved_on_chain`, `paused`, `bulletin_board_count`, `market_id`, `condition_id`. Any mismatch fails and names the field.
7. **Pack hash.** `sha256(canonical)` in hex. This is the value written to Solana.
8. **Freshness.** The signed `issued_at` (or, if missing, the signed `checked_at`) is compared with the phone clock. More than 24 h old (`MAX_RECORD_AGE_MS`) fails as "stale". More than 10 min in the future (`CLOCK_SKEW_MS`) fails and asks the user to check the phone clock. No signed time fails. A stale record is still shown, marked not verified, so it cannot be anchored or paid for.

**Tamper test.** `verifyRecord(r, { tamper: true })` changes one character of the signed bytes (the first letter of `risk_level`). Checks 4 and 5 then fail and the screen shows the rejection (check 8 also fails if the record on screen is more than 24 h old). `scripts/verify-live.ts` runs both paths against live records and exits non-zero if a real record fails or a tampered one passes.

A record that is not verified cannot be anchored or used for an SKR payment. `doAnchor` in [App.tsx](../App.tsx) and `doPay` in [src/skr/EvidencePack.tsx](../src/skr/EvidencePack.tsx) both require `usableForReceipt(verification)`: verified, a `packHash`, and a signed time that is still inside the 24 h window at the moment of the tap. A verification saved earlier therefore goes stale on its own; verifications saved before 0.3.9 have no signed time and cannot back a receipt until the next poll re-verifies the record.

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
- When Predge produced the record. That is `checked_at` and `issued_at` inside the signed payload. The app only anchors a record whose signed time was at most 24 h before the phone clock at the moment of the tap (check 8); it does not write the signed time into the memo.

## Trust assumptions

| We trust | For | If it fails |
|---|---|---|
| The Predge signing key | Records are what Predge published | A stolen key can sign false records that verify. Rotation needs a new app build, because the key is pinned. |
| The Solana RPC (`api.devnet.solana.com`, `api.mainnet-beta.solana.com`) | Blockhash, balances, confirmation status | A lying RPC can claim a transaction confirmed when it did not, or report wrong balances. It cannot forge a wallet signature or change a signed transaction. |
| The wallet app | Holding keys, showing the transaction, signing | The wallet sees and signs the transaction. Before sending, the app decodes the bytes the wallet returns and refuses any change other than added ComputeBudget and Lighthouse instructions (see below). With the `signAndSendTransactions` fallback the wallet sends itself and the app cannot inspect the result first. |
| Android | App sandbox and storage | Data in AsyncStorage (watchlist, wallet auth token, League session) is protected only by the app sandbox. |

## Attacker models

**Network attacker on the Predge API.** Traffic is HTTPS. Even with TLS broken, an attacker cannot make a forged or altered record verify (checks 1, 4, 5, 6). They can block responses, which shows as an error, or replay an older record that Predge did sign (see below).

**Replayed old record.** A genuine record signed more than 24 h before the phone clock fails check 8 and is shown as not verified, so it cannot be anchored or paid for. Inside the 24 h window a replayed record still verifies: an attacker who can block fresh responses can keep showing a status that is up to 24 h old. The app also records its own poll time (`lastPolledAt`) and shows "checked ... ago", and every receipt carries the Solana block time. The window is measured with the phone clock, so a phone whose clock is set back can accept an older record. A replay cannot make the app show a status Predge never signed.

**Malicious or faulty RPC.** Covered in the table above. Re-sending in `landTransaction` uses `skipPreflight`, so a bad transaction is caught by the status poll, not by preflight. A status with `err` is treated as rejected and the receipt or payment is dropped.

**App impersonation.** Another app can present itself to a wallet as "Settle Watch, predge.io". The defence is Digital Asset Links: `https://predge.io/.well-known/assetlinks.json` is served as `application/json` and lists `io.predge.settlewatch` with the release certificate fingerprint `07:D3:6A:05:3F:88:36:38:6E:88:B3:80:2D:73:04:C3:E8:4F:40:9A:E6:15:12:26:BC:0A:C3:7B:8E:EC:EF:36`. A wallet that checks this can tell the real app from a copy. Whether a wallet checks it depends on the wallet. In every case the wallet shows the transaction before signing.

**Malicious League backend.** It can see wallet addresses, nicknames and reported XP events. Before `signMessages`, `checkSignInMessage` ([src/league/logic.ts](../src/league/logic.ts)) parses the sign-in message and refuses it unless the first line names the League host taken from `LEAGUE_API` (`settle-watch-league.vercel.app`), the second line is the connected wallet, the `URI` (if present) points at the same host, `Chain ID` and `Nonce` are present, `Issued At` is within 10 min of the phone clock and `Expiration Time` (if present) is still ahead. The free-text statement line is not checked, so the backend controls that wording; the wallet shows it. It cannot move funds: sign-in uses `signMessages`, never a transaction.

## SKR payment safety

Code: [src/skr/spl.ts](../src/skr/spl.ts), [src/skr/chain.ts](../src/skr/chain.ts), [src/skr/EvidencePack.tsx](../src/skr/EvidencePack.tsx).

- **Fixed constants.** Mint `SKR_MINT`, decimals 6, treasury `SKR_TREASURY` and `PACK_PRICE_BASE = 1_000_000` (1 SKR) are compile-time constants. No amount comes from user input or the network. `treasuryKey` rejects an address that does not round-trip as base58.
- **TransferChecked**, not Transfer, so the token program also checks the mint and decimals.
- **Memo fields are validated** (`^\d{1,12}$` market id, `^[0-9a-f]{64}$` hash) before the transaction is built.
- **Pre-checks before the wallet opens** (`checkCanPay`): the payer's associated SKR account must hold at least 1 SKR, and the SOL balance must cover 20,000 lamports of fee headroom plus 2,039,280 lamports of rent if the treasury's SKR account does not exist yet.
- **User confirmation** in an in-app dialog before the wallet opens.
- **Same account.** Inside the wallet session, the account the wallet returns must equal the connected address, or the payment stops. Watch receipts (`anchorPack`) apply the same rule.
- **Returned transaction is checked before it is saved or sent** (`checkUnlockTx` in [src/skr/spl.ts](../src/skr/spl.ts), `checkWalletTx` in [src/txcheck.ts](../src/txcheck.ts)). The app decodes the signed bytes and requires: fee payer equal to the connected address, exactly one required signer, no address lookup tables, and the instructions `buildUnlockTx` made, byte for byte and in order (optional `CreateIdempotent`, `TransferChecked`, memo). The token instruction is then re-read: `TransferChecked` of exactly `1000000` base units, 6 decimals, mint `SKR_MINT`, from the payer's associated account to the treasury's associated account. The only extra instructions allowed are ComputeBudget (`ComputeBudget111111111111111111111111111111`; heap frame, unit limit, unit price and loaded data size only, priority fee at most 0.001 SOL) and Lighthouse assertions (`L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95`). Anything else stops the payment and nothing is sent. Watch receipts get the same check with the memo as the only instruction (`checkReceiptTx`). The rule is tested on the real devnet receipt and mainnet payment as the wallet returned them, and on altered copies.
- **One payment at a time.** A module-level `paying` flag blocks double taps and parallel payments.
- **Unlock only after confirmation.** `payForPack` resolves only when `getSignatureStatuses` reports `confirmed` or `finalized` on mainnet.
- **Interrupted payment resume.** The signed transaction and `lastValidBlockHeight` are saved as soon as the wallet returns them. On the next start, `resumePendingUnlock` re-sends and checks. Confirmed: the pack unlocks. Expired: the pending entry is removed and the user is told nothing was charged. Unknown: it is kept and checked again later.
- **Mainnet always.** `SKR_CLUSTER` is `mainnet-beta` regardless of the receipt network setting. A mainnet auth token is saved only if the app itself is on mainnet, so devnet receipts keep working.

## League anti-abuse

Client: [src/league/](../src/league). Server: the separate `settle-watch-league` repository (`lib/config.ts`, `lib/service.ts`).

- **Sign-in.** The server issues a 16-byte random nonce bound to the wallet, valid 300 s. The message names the domain, wallet, nonce, issued-at and expiry. On verify, the server rebuilds the message and requires an exact match, an allowed domain, an unexpired message, issued-at no more than 60 s in the future and a lifetime of at most 600 s. The ed25519 signature is checked with tweetnacl. Only a valid signature consumes the nonce, and a nonce works once. Sessions last 24 h and are stored server-side as a sha256 of the token.
- **Sign-in message check** on the phone before signing: see "Malicious League backend" above.
- **XP is decided by the server.** The app reports only the action name and an idempotency key. `pack_open` is not reported (`LOCAL_ONLY_XP` in [src/league/logic.ts](../src/league/logic.ts)) because the server's action table does not have it; it stays local XP. Each action has a fixed value, a daily cap and a minimum gap (for example `anchor`: 50 XP, 3 a day, 20 s apart). One account can earn at most 150 XP a day. A repeated idempotency key returns the first result and grants nothing.
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

1. **Key list grace period.** If `/.well-known/predge-keys.json` is unreachable, check 2 is `unknown`, but a record still verifies when a fetch in the last 7 days listed the key. A key revoked within those 7 days still verifies while the list is blocked. The grace period is measured with the phone clock.
2. **Not every displayed value is bound.** The market question and slug come from the unsigned envelope and are not in the signed payload at all. The market detail screen shows the envelope `checked_at` without comparing it. In the evidence pack, values outside check 6 are compared with the signed payload where it has them (latest clarification, current proposal, on-chain resolution, `checked_at`, dispute history) and tagged "differs from signed record" if they differ; source and data basis have no signed counterpart and are tagged "not signed" ([src/skr/packFields.ts](../src/skr/packFields.ts)). The latest clarification is compared on `posted_at`, `kind` and `poster`, the parts the pack shows. The 11 fields in check 6 are the ones that drive status, alerts and receipts.
3. **Freshness depends on the phone clock and allows 24 h.** A replayed record inside the window verifies, and a phone clock set back widens the window (see replay above).
4. **Wallets that cannot sign without sending.** If `signTransactions` fails for a reason other than the user declining, the app falls back to `signAndSendTransactions`. The wallet then broadcasts on its own, so the app cannot check that transaction before it is sent. The wallet still shows it before signing.
5. **Wallet-added instructions are trusted by program id.** ComputeBudget and Lighthouse instructions are allowed without decoding Lighthouse data. Lighthouse only asserts account state and cannot move funds; ComputeBudget can only raise the fee, which is capped at 0.001 SOL. The check does not compare the blockhash the wallet signed with the one the app fetched.
6. **The SKR unlock is enforced on the phone.** The evidence pack is built from data the phone already holds (the verified record and the local timeline). The unlock is stored in AsyncStorage. No server checks the payment, so a modified APK can skip it.
7. **One RPC per cluster.** Confirmation and balances come from a single public endpoint.
8. **League sign-in statement text is not checked.** The app checks domain, wallet, URI, chain, nonce and times, not the free-text line.
9. **The `pack_open` XP action is not in the server's action table** (`ACTIONS` in the server's `lib/config.ts`). The app therefore does not report it, so it counts for local XP only and never for League boards. Adding it on the server needs a server change and an app change.
10. **Key rotation needs an app update** because the key is pinned.
11. **Alerts are not gated on verification.** Change detection runs on every well-formed response. The alert text then says "Verified on device" or "NOT verified", so an unsigned or altered record can raise an alert, marked as not verified. It cannot be anchored or paid for.

## Reporting

See [SECURITY.md](../SECURITY.md).
