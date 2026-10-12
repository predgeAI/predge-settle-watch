// Checks a transaction the wallet returned before the app sends it. Pure module (web3.js and buffer only),
// so the offline selftest can run it on real wallet output.
import { PublicKey, TransactionInstruction, VersionedTransaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import { MEMO_PROGRAM_ID } from "./config";

/** Programs a wallet may add on its own. Neither can move funds out of the payer's accounts. */
export const COMPUTE_BUDGET_PROGRAM_ID = "ComputeBudget111111111111111111111111111111";
/** Lighthouse assertion program: the wallet adds checks that make the transaction fail if balances change unexpectedly. */
export const LIGHTHOUSE_PROGRAM_ID = "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95";
export const WALLET_EXTRA_PROGRAMS = [COMPUTE_BUDGET_PROGRAM_ID, LIGHTHOUSE_PROGRAM_ID] as const;

/** Upper bound on the priority fee a wallet may set through ComputeBudget: 0.001 SOL. */
export const MAX_PRIORITY_FEE_LAMPORTS = 1_000_000;

export class TxCheckError extends Error {
  constructor(public reason: string) {
    super(`The wallet changed the transaction (${reason}), so it was not sent`);
  }
}

export interface DecodedIx {
  programId: string;
  accounts: string[];
  data: Uint8Array;
}

export interface DecodedTx {
  feePayer: string;
  requiredSigners: number;
  lookups: number;
  instructions: DecodedIx[];
}

/** Decodes a serialized legacy or v0 transaction. Instructions that use address lookup tables are not resolved. */
export function decodeTransaction(raw: Uint8Array): DecodedTx {
  let tx: VersionedTransaction;
  try {
    tx = VersionedTransaction.deserialize(raw);
  } catch {
    throw new TxCheckError("unreadable");
  }
  const m = tx.message;
  const keys = m.staticAccountKeys.map((k) => k.toBase58());
  const key = (i: number) => {
    const k = keys[i];
    if (k === undefined) throw new TxCheckError("account from a lookup table");
    return k;
  };
  const instructions = m.compiledInstructions.map((ix) => ({
    programId: key(ix.programIdIndex),
    accounts: ix.accountKeyIndexes.map(key),
    data: Uint8Array.from(ix.data),
  }));
  return { feePayer: keys[0] ?? "", requiredSigners: m.header.numRequiredSignatures, lookups: m.addressTableLookups.length, instructions };
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

function sameIx(d: DecodedIx, e: TransactionInstruction): boolean {
  return (
    d.programId === e.programId.toBase58() &&
    d.accounts.length === e.keys.length &&
    d.accounts.every((a, i) => a === e.keys[i].pubkey.toBase58()) &&
    sameBytes(d.data, Uint8Array.from(e.data))
  );
}

const u32 = (b: Uint8Array, o: number) => b[o] + b[o + 1] * 2 ** 8 + b[o + 2] * 2 ** 16 + b[o + 3] * 2 ** 24;
const u64 = (b: Uint8Array, o: number) => u32(b, o) + u32(b, o + 4) * 2 ** 32;

/**
 * ComputeBudget instructions only change limits and the priority fee. Returns the priority fee in lamports.
 * Rejects the deprecated RequestUnits form, unknown forms and a priority fee above MAX_PRIORITY_FEE_LAMPORTS.
 */
export function priorityFeeLamports(budget: DecodedIx[], otherIxCount: number): number {
  let limit: number | null = null;
  let microLamports = 0;
  for (const ix of budget) {
    if (ix.accounts.length) throw new TxCheckError("compute budget with accounts");
    const d = ix.data;
    if (d[0] === 1 && d.length === 5) continue; // RequestHeapFrame
    if (d[0] === 2 && d.length === 5) limit = u32(d, 1); // SetComputeUnitLimit
    else if (d[0] === 3 && d.length === 9) microLamports = u64(d, 1); // SetComputeUnitPrice
    else if (d[0] === 4 && d.length === 5) continue; // SetLoadedAccountsDataSizeLimit
    else throw new TxCheckError("unknown compute budget instruction");
  }
  // Without SetComputeUnitLimit the runtime grants 200k units per non-budget instruction, up to 1.4M.
  const units = limit ?? Math.min(1_400_000, 200_000 * otherIxCount);
  const fee = Math.ceil((units * microLamports) / 1_000_000);
  if (!Number.isFinite(fee) || fee > MAX_PRIORITY_FEE_LAMPORTS) throw new TxCheckError("priority fee too high");
  return fee;
}

/**
 * The transaction the wallet returned must be the one the app built: same fee payer, a single signer, our
 * instructions byte for byte and in order, and nothing else except ComputeBudget and Lighthouse instructions.
 * Any SystemProgram, Token or other instruction the wallet added is rejected. Throws TxCheckError.
 */
export function checkWalletTx(raw: Uint8Array, expected: { feePayer: PublicKey; instructions: TransactionInstruction[] }): DecodedTx {
  const tx = decodeTransaction(raw);
  if (tx.lookups) throw new TxCheckError("address lookup table");
  if (tx.feePayer !== expected.feePayer.toBase58()) throw new TxCheckError("fee payer");
  if (tx.requiredSigners !== 1) throw new TxCheckError("extra signer");
  const budget = tx.instructions.filter((i) => i.programId === COMPUTE_BUDGET_PROGRAM_ID);
  const ours = tx.instructions.filter((i) => !(WALLET_EXTRA_PROGRAMS as readonly string[]).includes(i.programId));
  if (ours.length !== expected.instructions.length || !ours.every((d, i) => sameIx(d, expected.instructions[i]))) {
    throw new TxCheckError("instructions");
  }
  priorityFeeLamports(budget, tx.instructions.length - budget.length);
  return tx;
}

/** The single memo instruction of a watch receipt, signed by the payer. */
export function memoIx(payer: PublicKey, memo: string): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(MEMO_PROGRAM_ID),
    keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
    data: Buffer.from(memo, "utf8"),
  });
}

/** Watch receipt: only our memo, plus ComputeBudget and Lighthouse instructions the wallet may add. */
export function checkReceiptTx(raw: Uint8Array, payer: PublicKey, memo: string): DecodedTx {
  return checkWalletTx(raw, { feePayer: payer, instructions: [memoIx(payer, memo)] });
}
