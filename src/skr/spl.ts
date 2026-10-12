// SKR payment instructions, built by hand (no spl-token dependency).
// Pure module: only web3.js and buffer, so the offline selftest can run it.
import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { Buffer } from "buffer";
import { ATA_PROGRAM_ID, MEMO_PROGRAM_ID, SKR_DECIMALS, SKR_MINT, SKR_TREASURY, TOKEN_PROGRAM_ID } from "../config";

/** Price of one evidence pack: exactly 1 SKR in base units. Never user input. */
export const PACK_PRICE_BASE = 1_000_000;
export const PACK_PRICE_SKR = 1;

export const TOKEN_PROGRAM = new PublicKey(TOKEN_PROGRAM_ID);
export const ATA_PROGRAM = new PublicKey(ATA_PROGRAM_ID);
export const MEMO_PROGRAM = new PublicKey(MEMO_PROGRAM_ID);
export const SKR_MINT_KEY = new PublicKey(SKR_MINT);

const TRANSFER_CHECKED = 12;
const CREATE_IDEMPOTENT = 1;

/** The treasury as a key, or null while it is not configured or not a valid address. */
export function treasuryKey(addr: string = SKR_TREASURY): PublicKey | null {
  if (!addr) return null;
  try {
    const k = new PublicKey(addr);
    return k.toBase58() === addr ? k : null;
  } catch {
    return null;
  }
}

/** Associated token account of `owner` for `mint` under the classic token program. */
export function associatedTokenAddress(owner: PublicKey, mint: PublicKey = SKR_MINT_KEY): PublicKey {
  return PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()], ATA_PROGRAM)[0];
}

/** Unsigned 64-bit little endian, for safe integers only. */
export function u64le(n: number): Buffer {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("amount out of range");
  const out = Buffer.alloc(8);
  let v = n;
  for (let i = 0; i < 8; i++) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  return out;
}

/** SPL Token TransferChecked data: [12, amount u64 LE, decimals]. */
export function transferCheckedData(amount: number, decimals: number): Buffer {
  return Buffer.concat([Buffer.from([TRANSFER_CHECKED]), u64le(amount), Buffer.from([decimals])]);
}

export function transferCheckedIx(source: PublicKey, mint: PublicKey, destination: PublicKey, owner: PublicKey, amount: number, decimals: number) {
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data: transferCheckedData(amount, decimals),
  });
}

/** Associated Token Account program CreateIdempotent: does nothing if the account already exists. */
export function createAtaIdempotentIx(payer: PublicKey, ata: PublicKey, owner: PublicKey, mint: PublicKey) {
  return new TransactionInstruction({
    programId: ATA_PROGRAM,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([CREATE_IDEMPOTENT]),
  });
}

const MARKET_RE = /^\d{1,12}$/;
const HASH_RE = /^[0-9a-f]{64}$/;

export function packMemoText(marketId: string, packHash: string): string {
  if (!MARKET_RE.test(marketId) || !HASH_RE.test(packHash)) throw new Error("Refusing to pay: unexpected memo fields");
  return `predge-settle-watch v1 pack market=${marketId} pack=sha256:${packHash}`;
}

/**
 * The one transaction that unlocks a pack: optional CreateIdempotent for the treasury's SKR account,
 * TransferChecked of exactly 1 SKR from the payer's associated account, and a memo naming the pack.
 */
export function buildUnlockTx(p: {
  payer: PublicKey;
  treasury: PublicKey;
  blockhash: string;
  lastValidBlockHeight: number;
  marketId: string;
  packHash: string;
  createTreasuryAta: boolean;
}): Transaction {
  const memo = packMemoText(p.marketId, p.packHash);
  const source = associatedTokenAddress(p.payer);
  const dest = associatedTokenAddress(p.treasury);
  const tx = new Transaction({ feePayer: p.payer, blockhash: p.blockhash, lastValidBlockHeight: p.lastValidBlockHeight });
  if (p.createTreasuryAta) tx.add(createAtaIdempotentIx(p.payer, dest, p.treasury, SKR_MINT_KEY));
  tx.add(transferCheckedIx(source, SKR_MINT_KEY, dest, p.payer, PACK_PRICE_BASE, SKR_DECIMALS));
  tx.add(new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [{ pubkey: p.payer, isSigner: true, isWritable: false }], data: Buffer.from(memo, "utf8") }));
  return tx;
}

/** "12500000" base units -> "12.5". */
export function formatSkr(base: string): string {
  if (!/^\d+$/.test(base)) return "0";
  const s = base.padStart(SKR_DECIMALS + 1, "0");
  const whole = s.slice(0, -SKR_DECIMALS).replace(/^0+(?=\d)/, "");
  const frac = s.slice(-SKR_DECIMALS).slice(0, 4).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

/** True when a base-unit amount string covers the pack price. */
export function coversPrice(base: string): boolean {
  if (!/^\d+$/.test(base)) return false;
  const s = base.replace(/^0+/, "");
  const p = String(PACK_PRICE_BASE);
  return s.length > p.length || (s.length === p.length && s >= p);
}
