// Kuru on Monad testnet: buy CHANGE dispute notes for market 5219930 with the passkey wallet.
// A CHANGE note pays 1 test dollar if the disputed proposal flips, so holding it insures a position
// against a flip. Steps (all testnet, test dollars): TestUSD faucet -> approve the Kuru MarginAccount ->
// deposit -> limit buy at the live best ask (fills against the book). Every step is simulated first.
import { parseAbi, type Hex, type LocalAccount } from "viem";
import { monadTestnet } from "viem/chains";
import { createWalletClient, http } from "viem";
import { testnetClient as pub } from "./networks";
import { KURU } from "./integrations";

export const KURU_MARGIN = "0xd029C2D98ff85D8F64799017fE00a59B1159CE02" as Hex;
export const TEST_USD = "0x860f9c8b5d95B5BA204BDC80167C84969708eF3d" as Hex;
export const NOTE_MARKET = "5219930";
const SIZE_PRECISION = 10_000n; // Kuru market params for CHANGE/tUSD
const PRICE_PRECISION = 10_000;

const USD_ABI = parseAbi([
  "function faucet(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);
const MARGIN_ABI = parseAbi(["function deposit(address _user, address _token, uint256 _amount) payable", "function getBalance(address _user, address _token) view returns (uint256)"]);
const BOOK_ABI = parseAbi(["function addBuyOrder(uint32 _price, uint96 _size, bool _postOnly)", "function bestBidAsk() view returns (uint256, uint256)"]);

export interface InsurePlan {
  notes: number;
  askUsd: number;
  costUsd: number;
  priceUnits: number;
}

export async function planInsure(notes: number): Promise<InsurePlan> {
  const [, ask] = await pub.readContract({ address: KURU.book, abi: BOOK_ABI, functionName: "bestBidAsk" });
  const askUsd = Number(ask) / 1e18;
  if (!(askUsd > 0 && askUsd < 1)) throw new Error("No one is selling notes right now.");
  return { notes, askUsd, costUsd: Math.round(notes * askUsd * 100) / 100, priceUnits: Math.round(askUsd * PRICE_PRECISION) };
}

/** Notes this address holds in its Kuru margin account (CHANGE, 6 decimals). */
export async function heldNotes(address: Hex): Promise<number> {
  const b = await pub.readContract({ address: KURU_MARGIN, abi: MARGIN_ABI, functionName: "getBalance", args: [address, KURU.change] });
  return Number(b) / 1e6;
}

async function send(account: LocalAccount, req: any): Promise<Hex> {
  const w = createWalletClient({ account, chain: monadTestnet, transport: http("https://testnet-rpc.monad.xyz", { timeout: 20_000 }) });
  await pub.simulateContract({ ...req, account });
  const est = await pub.estimateContractGas({ ...req, account });
  const hash = await w.writeContract({ ...req, account, chain: monadTestnet, gas: (est * 13n) / 10n });
  const rc = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (rc.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
  return hash;
}

/** Runs the steps; onStep reports progress in plain words. Returns the buy transaction. */
export async function insure(account: LocalAccount, plan: InsurePlan, onStep: (s: string) => void): Promise<Hex> {
  const cost = BigInt(Math.ceil(plan.notes * plan.askUsd * 1e6)) + 10_000n; // + 0.01 for fees
  const [usd, allowance] = await Promise.all([
    pub.readContract({ address: TEST_USD, abi: USD_ABI, functionName: "balanceOf", args: [account.address] }),
    pub.readContract({ address: TEST_USD, abi: USD_ABI, functionName: "allowance", args: [account.address, KURU_MARGIN] }),
  ]);
  if (usd < cost) {
    onStep("Getting test dollars...");
    await send(account, { address: TEST_USD, abi: USD_ABI, functionName: "faucet", args: [account.address, 10_000_000n] });
  }
  if (allowance < cost) {
    onStep("Approving...");
    await send(account, { address: TEST_USD, abi: USD_ABI, functionName: "approve", args: [KURU_MARGIN, cost] });
  }
  onStep("Depositing...");
  await send(account, { address: KURU_MARGIN, abi: MARGIN_ABI, functionName: "deposit", args: [account.address, TEST_USD, cost] });
  onStep("Buying notes...");
  return send(account, { address: KURU.book, abi: BOOK_ABI, functionName: "addBuyOrder", args: [plan.priceUnits, BigInt(plan.notes) * SIZE_PRECISION, false] });
}
