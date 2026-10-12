// SKR on Solana mainnet: read-only balance and the 1 SKR evidence pack payment through Mobile Wallet Adapter.
import { transact } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";
import { TX_SIGNATURE_RE, type Cluster } from "../config";
import { saveWallet, type StoredWallet } from "../store";
import { authorizeSession, base58, confirmByPolling, connectionFor, freshBlockhash, landTransaction, withRetry, type LandResult } from "../wallet";
import { t } from "../i18n";
import { associatedTokenAddress, buildUnlockTx, coversPrice, SKR_MINT_KEY, treasuryKey } from "./spl";
import type { PendingUnlock } from "./store";

/** Payments are always on mainnet, whatever the receipt network setting says. */
export const SKR_CLUSTER: Cluster = "mainnet-beta";

// Rent for a 165 byte token account, paid once if the treasury has no SKR account yet.
const TOKEN_ACCOUNT_RENT = 2_039_280;
// Network fee headroom (a signature costs 5000 lamports).
const FEE_HEADROOM = 20_000;

/** Adds two non-negative integer strings. */
function addDec(a: string, b: string): string {
  let out = "";
  let carry = 0;
  for (let i = a.length - 1, j = b.length - 1; i >= 0 || j >= 0 || carry; i--, j--) {
    const s = (i >= 0 ? a.charCodeAt(i) - 48 : 0) + (j >= 0 ? b.charCodeAt(j) - 48 : 0) + carry;
    out = String(s % 10) + out;
    carry = s >= 10 ? 1 : 0;
  }
  return out.replace(/^0+(?=\d)/, "") || "0";
}

export interface SkrHoldings {
  total: string; // base units across every SKR account of the owner
  ata: string; // base units in the associated account, the one a payment spends from
}

/** SKR held by an address on mainnet. Throws on network errors; the caller decides what to show. */
export async function skrHoldings(address: string): Promise<SkrHoldings> {
  const owner = new PublicKey(address);
  const ata = associatedTokenAddress(owner).toBase58();
  const res = await withRetry(() => connectionFor(SKR_CLUSTER).getParsedTokenAccountsByOwner(owner, { mint: SKR_MINT_KEY }), 2);
  let total = "0";
  let inAta = "0";
  for (const a of res.value) {
    const info = (a.account.data as { parsed?: { info?: { tokenAmount?: { amount?: unknown }; state?: unknown } } }).parsed?.info;
    const amt = info?.tokenAmount?.amount;
    if (typeof amt !== "string" || !/^\d+$/.test(amt)) continue;
    total = addDec(total, amt);
    if (a.pubkey.toBase58() === ata && info?.state === "initialized") inAta = amt;
  }
  return { total, ata: inAta };
}

export interface PayCheck {
  ok: boolean;
  reason?: "no_skr" | "no_sol";
  skr: SkrHoldings;
  lamports: number;
  needLamports: number;
  createTreasuryAta: boolean;
}

/** Everything that must hold before the wallet opens. Throws only on network errors. */
export async function checkCanPay(address: string): Promise<PayCheck> {
  const treasury = treasuryKey();
  if (!treasury) throw new Error("SKR payments are not configured");
  const c = connectionFor(SKR_CLUSTER);
  const [skr, lamports, treasuryAta] = await Promise.all([
    skrHoldings(address),
    withRetry(() => c.getBalance(new PublicKey(address)), 2),
    withRetry(() => c.getAccountInfo(associatedTokenAddress(treasury)), 2),
  ]);
  const createTreasuryAta = !treasuryAta;
  const needLamports = FEE_HEADROOM + (createTreasuryAta ? TOKEN_ACCOUNT_RENT : 0);
  if (!coversPrice(skr.ata)) return { ok: false, reason: "no_skr", skr, lamports, needLamports, createTreasuryAta };
  if (lamports < needLamports) return { ok: false, reason: "no_sol", skr, lamports, needLamports, createTreasuryAta };
  return { ok: true, skr, lamports, needLamports, createTreasuryAta };
}

/**
 * Pays exactly 1 SKR to the Predge treasury for one market's evidence pack. Same pattern as the watch
 * receipt: fresh blockhash before the wallet opens, the wallet only signs, the app sends and re-sends
 * until the network confirms. `onSigned` runs as soon as a signature exists so an interrupted payment
 * can be finished later. Resolves only once confirmed on mainnet.
 */
export async function payForPack(
  stored: StoredWallet,
  p: { key: string; marketId: string; packHash: string; createTreasuryAta: boolean },
  onSigned?: (s: PendingUnlock) => Promise<void> | void
): Promise<{ signature: string }> {
  const treasury = treasuryKey();
  if (!treasury) throw new Error("SKR payments are not configured");
  const connection = connectionFor(SKR_CLUSTER);
  const fresh = await freshBlockhash(SKR_CLUSTER);
  const signed = await transact(async (wallet) => {
    // authorizeSession only reuses the token when it is bound to mainnet; otherwise it asks for solana:mainnet.
    const auth = await authorizeSession(wallet, stored, SKR_CLUSTER);
    const acct = auth.accounts[0];
    if (!acct) throw new Error("The wallet returned no account");
    const payer = new PublicKey(Buffer.from(acct.address, "base64"));
    // The balance checks ran for the connected address; never sign for a different one.
    if (payer.toBase58() !== stored.address) throw new Error(t("skr.otherAccount"));
    const next: StoredWallet = { address: payer.toBase58(), authToken: auth.auth_token, label: acct.label?.slice(0, 64), cluster: SKR_CLUSTER };
    const tx = buildUnlockTx({
      payer,
      treasury,
      blockhash: fresh.blockhash,
      lastValidBlockHeight: fresh.lastValidBlockHeight,
      marketId: p.marketId,
      packHash: p.packHash,
      createTreasuryAta: p.createTreasuryAta,
    });
    try {
      const [st] = await wallet.signTransactions({ transactions: [tx] });
      return { kind: "signed" as const, raw: st.serialize(), sig: st.signature, wallet: next };
    } catch (e) {
      if (/declined|rejected|cancel/i.test((e as Error).message ?? "")) throw e;
      const [signature] = await wallet.signAndSendTransactions({ transactions: [tx], minContextSlot: fresh.slot });
      return { kind: "sent" as const, signature, wallet: next };
    }
  });
  let signature: string;
  let raw: Uint8Array | null = null;
  if (signed.kind === "signed") {
    if (!signed.sig) throw new Error("The wallet returned no valid signature");
    signature = base58(signed.sig);
    raw = signed.raw;
  } else {
    signature = signed.signature;
  }
  if (typeof signature !== "string" || !TX_SIGNATURE_RE.test(signature)) throw new Error("The wallet returned no valid signature");
  // Keep a mainnet session only if the app itself runs on mainnet, so devnet receipts are not disturbed.
  if ((stored.cluster ?? "devnet") === SKR_CLUSTER) saveWallet(signed.wallet).catch(() => undefined);
  try {
    await onSigned?.({
      key: p.key,
      marketId: p.marketId,
      packHash: p.packHash,
      signature,
      rawTx: raw ? Buffer.from(raw).toString("base64") : undefined,
      lastValidBlockHeight: fresh.lastValidBlockHeight,
      startedAt: new Date().toISOString(),
    });
  } catch {
    // persistence is best effort
  }
  const result = raw
    ? await landTransaction(connection, raw, signature, fresh.lastValidBlockHeight)
    : (await confirmByPolling(connection, signature, 90_000)) ? "confirmed" : "unknown";
  if (result === "expired") throw new Error("payment not landed: block height exceeded");
  if (result !== "confirmed") throw new Error("payment not confirmed: timed out");
  return { signature };
}

/** Finishes a payment interrupted after signing. Never reports a payment the chain does not have. */
export async function resumePendingUnlock(p: PendingUnlock): Promise<LandResult> {
  const connection = connectionFor(SKR_CLUSTER);
  if (p.rawTx) return landTransaction(connection, Buffer.from(p.rawTx, "base64"), p.signature, p.lastValidBlockHeight, 60_000);
  return (await confirmByPolling(connection, p.signature, 20_000)) ? "confirmed" : "unknown";
}

// Lets the wallet card re-read the balance after a payment.
const listeners = new Set<() => void>();
export function onSkrChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function skrChanged(): void {
  for (const fn of listeners) fn();
}
