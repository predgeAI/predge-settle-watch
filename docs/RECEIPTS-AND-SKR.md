# Receipts and SKR

Settle Watch builds two kinds of Solana transaction. Both start from a record that `verifyRecord` ([src/verify.ts](../src/verify.ts)) verified and whose signed time is still at most 24 h old when the user taps (`usableForReceipt`). Both carry the same hash: `packHash = sha256(attestation.canonical)` in lowercase hex, which is the sha256 of the exact bytes Predge signed.

## 1. Watch receipt (devnet or mainnet)

Code: `memoText` and `anchorPack` in [src/wallet.ts](../src/wallet.ts).

**Memo format**

```
predge-settle-watch v1 <action> market=<market_id> risk=<risk_level> pack=sha256:<packHash> kid=<kid>
```

| Field | Rule |
|---|---|
| `action` | `watch` (button "Anchor watch receipt") or `acknowledge` (button "Acknowledge alert") |
| `market_id` | `^\d{1,12}$`, Polymarket numeric market id |
| `risk_level` | `^(ok\|watch\|caution\|resolved)$` |
| `packHash` | `^[0-9a-f]{64}$` |
| `kid` | constant `13fa3d18a369e6c7` |

If any field fails its pattern, `memoText` throws and nothing is signed.

**Instructions built by the app**

| # | Program | Accounts | Data |
|---|---|---|---|
| 0 | Memo `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` | payer (signer, read-only) | memo text, UTF-8 |

Fee payer: the wallet account. Cost: the network fee only (5,000 lamports per signature, plus any priority fee the wallet adds).

**Network:** devnet by default (`DEFAULT_CLUSTER` in [src/config.ts](../src/config.ts)). The user can switch to mainnet in Me > Settings. A mainnet anchor asks for confirmation first.

**Example (devnet, 12 Oct 2026)**
[`3adw8K21VicxJg9Ekxmq3bzRZrDSAZcN5doXvd1g8NYweDBNAfLUaGJcjKfupVLmGQA77v2K7jRpJdGn3gsAyFyB`](https://explorer.solana.com/tx/3adw8K21VicxJg9Ekxmq3bzRZrDSAZcN5doXvd1g8NYweDBNAfLUaGJcjKfupVLmGQA77v2K7jRpJdGn3gsAyFyB?cluster=devnet)

```
predge-settle-watch v1 watch market=5186278 risk=caution pack=sha256:ac60de602638422c376a17920fc76523f8d65f74c48c5e79ba97d0ece2d390a3 kid=13fa3d18a369e6c7
```

On chain the transaction also holds two ComputeBudget instructions (`SetComputeUnitLimit` 200,000 and `SetComputeUnitPrice` 100,000 micro-lamports). The wallet added them when it signed.

**Checks inside the wallet session** (`anchorPack`): the account the wallet authorizes must equal the connected address. After `signTransactions`, `checkReceiptTx` ([src/txcheck.ts](../src/txcheck.ts)) decodes the signed bytes and requires the connected address as fee payer, one signer, no lookup tables, and exactly our memo instruction (same program, accounts and bytes). See [What the wallet may add](#what-the-wallet-may-add).

## 2. SKR evidence pack unlock (mainnet only)

Code: [src/skr/spl.ts](../src/skr/spl.ts) (instructions), [src/skr/chain.ts](../src/skr/chain.ts) (checks, signing, sending), [src/skr/EvidencePack.tsx](../src/skr/EvidencePack.tsx) (UI).

**Constants** ([src/config.ts](../src/config.ts), [src/skr/spl.ts](../src/skr/spl.ts))

| Name | Value |
|---|---|
| Mint `SKR_MINT` | `SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3` (classic SPL Token program, 6 decimals) |
| Treasury `SKR_TREASURY` | `8gTLrkxZkL3yewzGBEQhv3Y3C7DzsfMUEZqybvP5Nh8S` |
| Price `PACK_PRICE_BASE` | `1_000_000` base units = 1 SKR |
| Token program | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` |
| Associated Token Account program | `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL` |
| Cluster `SKR_CLUSTER` | `mainnet-beta`, whatever the receipt network setting |

**Memo format**

```
predge-settle-watch v1 pack market=<market_id> pack=sha256:<packHash>
```

`market_id` must match `^\d{1,12}$` and `packHash` `^[0-9a-f]{64}$`, or `packMemoText` throws.

**Instructions built by the app** (`buildUnlockTx`)

| # | Program | Accounts (in order) | Data |
|---|---|---|---|
| 0, only if the treasury has no SKR account | Associated Token Account `CreateIdempotent` | payer (signer, writable), treasury ATA (writable), treasury, SKR mint, System program, Token program | `[1]` |
| next | SPL Token `TransferChecked` | payer ATA (writable), SKR mint, treasury ATA (writable), payer (signer) | `[12, 1000000 as u64 LE, 6]` |
| last | Memo | payer (signer) | memo text, UTF-8 |

ATAs are derived with `findProgramAddressSync([owner, tokenProgram, mint], ATA_PROGRAM)`. The byte layout, the account order and the memo are checked by `npm test` ("SKR unlock transaction: programs, key order, amounts, memo").

**Flow**

1. The record must be verified. The wallet must be connected.
2. `checkCanPay` reads, on mainnet: the payer's SKR in its associated account (the one the transfer spends), the SOL balance, and whether the treasury's SKR account exists. It needs 1 SKR and 20,000 lamports, plus 2,039,280 lamports of rent if the treasury account must be created.
3. The user confirms in an in-app dialog.
4. A fresh blockhash is fetched. Then the wallet opens with `authorize` or `reauthorize` for `solana:mainnet`.
5. The account the wallet returns must equal the connected address.
6. `signTransactions`. `checkUnlockTx` ([src/skr/spl.ts](../src/skr/spl.ts)) decodes the signed bytes: the instructions `buildUnlockTx` made must be there byte for byte and in order, and the one token instruction must be `TransferChecked` of exactly 1 SKR from the payer's associated account to the treasury's. Only then are the signed bytes saved as a pending unlock.
7. `landTransaction` sends and re-sends every 2 s until confirmed or the blockhash expires.
8. Only after confirmation is the unlock saved and the pack shown.

**Example (mainnet, 12 Oct 2026)**
[`27drBVRJfdbsdKT9hd36hvntTf528MdJUkscNSzAXQ2199bfsWZkXGZNmjHiLnBuQVZcGFbNHdji3FDfoHvcTCvM`](https://explorer.solana.com/tx/27drBVRJfdbsdKT9hd36hvntTf528MdJUkscNSzAXQ2199bfsWZkXGZNmjHiLnBuQVZcGFbNHdji3FDfoHvcTCvM)

Instructions on chain: `CreateIdempotent` for the treasury `8gTLrkxZ...Nh8S` (its SKR account did not exist yet), `TransferChecked` of `1000000` base units with 6 decimals, and the memo

```
predge-settle-watch v1 pack market=5186278 pack=sha256:b6ca4e780a71b837c6788781f7cc5c3f6ac05b426ba16e67fa42a311831daa2c
```

The wallet added two ComputeBudget instructions (`SetComputeUnitLimit` 640,000 and `SetComputeUnitPrice` 100,000 micro-lamports, so 64,000 lamports of priority fee) and two Lighthouse assertion instructions (`L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95`), after our three.

**What the pack contains.** The pack is built from what the phone already holds: the verified record (pack hash, UMA state, disputes, clarifications, current proposal, on-chain resolution, recommendation, data basis, checked time) and the local timeline of changes. Values that check 6 does not bind are compared with the signed payload: a value that differs is tagged "differs from signed record", and source and data basis, which are not in the signed payload, are tagged "not signed". The unlock is stored on the phone.

## What the wallet may add

Code: `checkWalletTx` in [src/txcheck.ts](../src/txcheck.ts). Wallets add instructions of their own when they sign. The app accepts only these two programs on top of its own instructions:

| Program | Id | Rule |
|---|---|---|
| ComputeBudget | `ComputeBudget111111111111111111111111111111` | no accounts; `RequestHeapFrame`, `SetComputeUnitLimit`, `SetComputeUnitPrice`, `SetLoadedAccountsDataSizeLimit` only; priority fee (units x price) at most 1,000,000 lamports (0.001 SOL) |
| Lighthouse | `L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95` | assertions only, accepted as is |

Everything else is refused, including any System program or Token instruction the app did not build, a second copy of one of ours, a changed memo, a different fee payer, a second required signer and address lookup tables. A refused transaction is not saved and not sent, and the user sees "The wallet changed the transaction in a way this app does not accept, so nothing was sent." Both example transactions above pass this check in `npm test` (the bytes are in [scripts/wallet-tx-fixtures.json](../scripts/wallet-tx-fixtures.json)). See the limitations in [THREAT-MODEL.md](THREAT-MODEL.md#known-limitations).

## Sending: why the app sends, not the wallet

`anchorPack` and `payForPack` share one pattern ([src/wallet.ts](../src/wallet.ts)):

- **No network call inside the wallet session.** Android can block the app's network while a wallet is in front. The blockhash and its `lastValidBlockHeight` are fetched first.
- **Sign only, then send from the app.** Android can freeze a wallet that is no longer in front before it broadcasts. If the wallet refuses `signTransactions` for a reason other than the user declining, the app falls back to `signAndSendTransactions` with `minContextSlot`, then polls for confirmation. In that fallback the wallet sends, so the app cannot check the transaction first. A transaction that fails the check above never triggers the fallback.
- **Re-send loop.** `landTransaction` calls `sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 })` every 2 s and polls `getSignatureStatuses` (with history). Every 5 s it compares the block height with `lastValidBlockHeight`. Past it, one last status check decides between `confirmed` and `expired`. A status with `err` stops the loop as rejected. Default limit 90 s.
- **Resume.** The pending entry holds the signature, the base64 signed transaction and `lastValidBlockHeight`. On the next start, `resumePending` (receipts) or `resumePendingUnlock` (SKR) runs the same loop for up to 60 s. `confirmed` records the receipt or unlock, `expired` drops it and tells the user nothing was charged, `unknown` keeps it for the next start.
- **Signature format.** A signature must match `^[1-9A-HJ-NP-Za-km-z]{80,90}$` before it is stored or turned into an explorer link.

## Check it yourself

```bash
scripts/verify-receipt.sh 3adw8K21VicxJg9Ekxmq3bzRZrDSAZcN5doXvd1g8NYweDBNAfLUaGJcjKfupVLmGQA77v2K7jRpJdGn3gsAyFyB devnet
scripts/verify-receipt.sh 27drBVRJfdbsdKT9hd36hvntTf528MdJUkscNSzAXQ2199bfsWZkXGZNmjHiLnBuQVZcGFbNHdji3FDfoHvcTCvM mainnet-beta
```

To match a hash to a record: fetch `GET https://api.predge.io/v1/settlement-risk/<market>`, take `attestation.canonical`, and compute `sha256` of its UTF-8 bytes. A record fetched later is a new record with a new `checked_at`, so its hash differs from an older receipt. Keep the record you anchored if you want to show the match later.
