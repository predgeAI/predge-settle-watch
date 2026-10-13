// Live reads behind the Monad edition's home and Integrations screen. Every function reads real data:
// the Predge API, Monad mainnet and testnet RPCs, Perpl's public API, the NEAR Intents 1Click quote API
// (Aurora's solver network). Nothing here signs or sends a transaction. Nansen is the one exception:
// its result is bundled from a paid run and labeled with the time Nansen returned it.
import nacl from "tweetnacl";
import { keccak256, parseAbi, toBytes, type Hex } from "viem";
import { PINNED_PUBLIC_KEY_HEX } from "../config";
import type { SettlementRisk } from "../api";
import { MAINNET_VALIDATOR_CONTRACT, MAINNET_VALIDATOR_VERDICTS } from "./mainnetVerdicts";
import { EXPLORER, mainnetClient, testnetClient } from "./networks";
import NANSEN from "./nansen-5219930.json";

export const GUARD_WEB = "https://guard.predge.io/";
export const REPO = "https://github.com/predgeAI/erc8004-outcome-validator";

/** Figures checked on 13 Oct 2026 (Predge scan of UMA and Polymarket logs on Polygon, and the Monad mainnet runs). */
export const FACTS = {
  disputes: "3,005",
  markets: "2,666",
  period: "1 Jan to 2 Oct 2026",
  settledDifferently: "853",
  settled: "2,543",
  share: "33.5%",
  traded: "$299M",
  verdicts: 26,
  openRequests: 12,
};

export interface Famous {
  id: string;
  name: string;
  size: string | null;
  story: string;
}

/** Real disputed markets with a Predge verdict request on Monad mainnet. */
export const FAMOUS: Famous[] = [
  { id: "2241873", name: "Iran", size: "$15M", story: "Proposed YES, settled NO" },
  { id: "1144023", name: "Mexico", size: "$30M", story: "Proposed NO, settled YES" },
  { id: "2169995", name: "MicroStrategy", size: "$376M", story: "Disputed, the proposal held" },
  { id: "5219930", name: "Trump \"Ammunition\"", size: null, story: "Disputed twice, in a UMA vote now" },
];

// ---------------------------------------------------------------------------
// Monad mainnet verdicts (PredgeAgentValidator)
// ---------------------------------------------------------------------------

const VALIDATOR_ABI = parseAbi([
  "function getValidationStatus(bytes32 requestHash) view returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, string tag, uint256 lastUpdate)",
]);

export interface Verdict {
  marketId: string;
  contract: Hex;
  requestHash: Hex;
  /** "verdict": a score is on chain; "pending": requested, no response yet (e.g. a UMA vote is running). */
  state: "verdict" | "pending" | "none";
  /** 100: the final outcome equals the first disputed proposal; 0: it settled differently. */
  response: number | null;
  responseHash: Hex | null;
  tag: string | null;
  lastUpdate: string | null;
  validator: Hex | null;
  /** Explorer link to the transaction that wrote the request or verdict. */
  txUrl: string;
  /** responseHash == keccak256 of a Predge record whose ed25519 signature verifies against the pinned key. null = not checked. */
  bound: boolean | null;
}

export function hasMainnetVerdict(marketId: string): boolean {
  return !!MAINNET_VALIDATOR_VERDICTS[marketId];
}

export async function readMainnetVerdict(marketId: string, opts: { bind?: boolean } = {}): Promise<Verdict> {
  const v = MAINNET_VALIDATOR_VERDICTS[marketId];
  if (!v) throw new Error(`no Monad mainnet verdict request for market ${marketId}`);
  const [validator, , response, responseHash, tag, lastUpdate] = await mainnetClient.readContract({
    address: MAINNET_VALIDATOR_CONTRACT as Hex,
    abi: VALIDATOR_ABI,
    functionName: "getValidationStatus",
    args: [v.requestHash],
  });
  const out: Verdict = {
    marketId,
    contract: MAINNET_VALIDATOR_CONTRACT as Hex,
    requestHash: v.requestHash,
    state: "none",
    response: null,
    responseHash: null,
    tag: null,
    lastUpdate: null,
    validator: null,
    txUrl: `${EXPLORER.mainnet}/tx/${v.tx}`,
    bound: null,
  };
  if (/^0x0+$/.test(validator) || lastUpdate === 0n) return out;
  out.validator = validator;
  out.lastUpdate = new Date(Number(lastUpdate) * 1000).toISOString();
  if (/^0x0+$/.test(responseHash) && !tag) {
    out.state = "pending";
    return out;
  }
  out.state = "verdict";
  out.response = Number(response);
  out.responseHash = responseHash;
  out.tag = tag;
  if (opts.bind) out.bound = await bindsToSignedRecord(v.recordUrl, responseHash).catch(() => false);
  return out;
}

/** Fetches the published record and checks responseHash == keccak256(canonical) and the ed25519 signature. */
export async function bindsToSignedRecord(recordUrl: string, responseHash: Hex): Promise<boolean> {
  const r = await fetch(recordUrl);
  if (!r.ok) throw new Error(`record ${r.status}`);
  const j = await r.json();
  const a = j?.attestation;
  if (typeof a?.canonical !== "string" || typeof a?.signature !== "string") return false;
  if (keccak256(toBytes(a.canonical)).toLowerCase() !== responseHash.toLowerCase()) return false;
  return nacl.sign.detached.verify(new TextEncoder().encode(a.canonical), hexBytes(a.signature), hexBytes(PINNED_PUBLIC_KEY_HEX));
}

function hexBytes(h: string): Uint8Array {
  const s = h.replace(/^0x/, "");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function verdictWords(v: Verdict): string {
  if (v.state === "pending") return "Requested, verdict pending";
  if (v.state === "none") return "No verdict on chain";
  return v.response === 100 ? "100: settled as first proposed" : v.response === 0 ? "0: settled differently" : `${v.response}`;
}

// ---------------------------------------------------------------------------
// MetaMask agent plugin: the same guard rule as mm-plugin (check.ts decide + guard.ts)
// ---------------------------------------------------------------------------

const RISK_ORDER: Record<string, number> = { resolved: 0, ok: 1, watch: 2, caution: 3 };
const why = (rec: string) => rec.replace(/^(resolved|ok|watch|caution):\s*/, "").replace(/\.\s*$/, "");

export interface GuardResult {
  allowed: boolean;
  reason: string;
  action: string;
}

/**
 * `mm predge guard <market> --side YES --size N`: refuses unless the signed record is within the "ok"
 * risk limit (no dispute, no paused market), and refuses buying a side the chain already resolved against.
 */
export function guardDecision(r: SettlementRisk, side: string, action: "buy" | "sell" = "buy"): GuardResult {
  const what = `${action} ${side}`;
  const refuse = (reason: string): GuardResult => ({ allowed: false, reason, action: what });
  if (r.paused) return refuse("the market is paused by the resolution adapter");
  const level = r.risk_level;
  if ((RISK_ORDER[level] ?? 9) > RISK_ORDER.ok) return refuse(`${why(r.recommendation)} (risk ${level}, above the ok limit)`);
  const final = (r as any).onchain_resolution?.outcome as string | undefined;
  if (final && action === "buy" && final.toLowerCase() !== side.toLowerCase()) return refuse(`the market already resolved on chain to ${final}; ${side} shares redeem at 0`);
  if (r.market.closed) return refuse(`the market is closed for trading; settlement risk is ${level}`);
  return { allowed: true, reason: `${why(r.recommendation)} (risk ${level}, within the ok limit)`, action: what };
}

// ---------------------------------------------------------------------------
// Nansen (bundled, paid run)
// ---------------------------------------------------------------------------

export const NANSEN_EXPOSURE = NANSEN as {
  marketId: string;
  question: string;
  decision: string;
  asOf: string;
  contestedOutcome: string;
  contestedCostUsd: number;
  otherCostUsd: number;
  payments: { endpoint: string; amountUSDC: string; tx: string }[];
};

export const usd0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

// ---------------------------------------------------------------------------
// Kuru (Monad testnet): dispute notes for market 5219930 and their CHANGE/tUSD book
// ---------------------------------------------------------------------------

export const KURU = {
  factory: "0x9FAC0dD79cf9D535ae890Cd1Bbf7a838f3B63D06" as Hex,
  hold: "0xBfD25f66f12d17820177DF63Bb66174eE16f2C04" as Hex,
  change: "0x65e05B95A4fc3eFFAf8881eb7A435f9c64d0319D" as Hex,
  book: "0x6Ee28124848dAb2685Ff424b9DF0eAc43e9b30A8" as Hex,
  bookTx: "0xab7545d89f0faeba818577f0bd64510c80b887ce56ef34f2e008a59579a45be3",
};

const KURU_ABI = parseAbi(["function bestBidAsk() view returns (uint256, uint256)"]);
const ERC20_ABI = parseAbi(["function totalSupply() view returns (uint256)", "function symbol() view returns (string)"]);

export async function readKuruBook(): Promise<{ bid: number; ask: number; changeSymbol: string; holdSupply: number; changeSupply: number }> {
  const [[bid, ask], changeSymbol, holdSupply, changeSupply] = await Promise.all([
    testnetClient.readContract({ address: KURU.book, abi: KURU_ABI, functionName: "bestBidAsk" }),
    testnetClient.readContract({ address: KURU.change, abi: ERC20_ABI, functionName: "symbol" }),
    testnetClient.readContract({ address: KURU.hold, abi: ERC20_ABI, functionName: "totalSupply" }),
    testnetClient.readContract({ address: KURU.change, abi: ERC20_ABI, functionName: "totalSupply" }),
  ]);
  return { bid: Number(bid) / 1e18, ask: Number(ask) / 1e18, changeSymbol, holdSupply: Number(holdSupply) / 1e6, changeSupply: Number(changeSupply) / 1e6 };
}

// ---------------------------------------------------------------------------
// Aurora: read-only quote, USDC on Base -> USDC on Monad (dry run, no deposit address is issued)
// ---------------------------------------------------------------------------

export const AURORA = {
  deliveryTx: "https://monadvision.com/tx/0xece785a6188c7c53aa27268b89e84b34a040296eb79a3a19bd443ab8daaa7caf",
  x402Tx: "https://monadvision.com/tx/0xfc9a6051f5cef2056ba8b52747e0ccdb58c5ecdfe1e57c13ff7c079543b61671",
};

const ONECLICK = "https://1click.chaindefuser.com/v0";
const BASE_USDC = "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near";
const MONAD_USDC = "nep245:v2_1.omni.hot.tg:143_2dmLwYWkCQKyTjeUPAsGJuiVLbFx";

export async function auroraQuote(amountUsdc: number, recipient: Hex): Promise<{ amountIn: string; amountOut: string; etaSeconds: number }> {
  const body = {
    dry: true,
    swapType: "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset: BASE_USDC,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: MONAD_USDC,
    amount: String(Math.round(amountUsdc * 1e6)),
    refundTo: recipient,
    refundType: "ORIGIN_CHAIN",
    recipient,
    recipientType: "DESTINATION_CHAIN",
    deadline: new Date(Date.now() + 3_600_000).toISOString(),
    referral: "predge",
  };
  const r = await fetch(`${ONECLICK}/quote`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`quote HTTP ${r.status}`);
  const j = await r.json();
  const q = j.quote ?? j;
  if (!q?.amountOutFormatted) throw new Error("quote came back empty");
  return { amountIn: q.amountInFormatted, amountOut: q.amountOutFormatted, etaSeconds: Number(q.timeEstimate) };
}

// ---------------------------------------------------------------------------
// Chainlink CRE: PredgeSettlementWatch consumer on Monad testnet
// ---------------------------------------------------------------------------

export const CRE = {
  consumer: "0x1518ad21cF96Ed0429D022b038263e68fD50A90c" as Hex,
  requestHash: "0x9ccefa67ebdc1f3f4ee31d17616a37be2546deca5dd2847523942f1e7e396e4a" as Hex,
  reportTx: "https://testnet.monadvision.com/tx/0xfc7af2fc6b0b9ad0f21e55bb0182df3a48f5379183f1f743c32ff466993e7d2a",
  workflow: `${REPO}/tree/main/cre`,
};

const CRE_ABI = parseAbi([
  "function safeToAct(bytes32 requestHash) view returns (bool)",
  "function watches(bytes32) view returns (string marketId, string riskLevel, bool openDispute, uint8 onchainVerdict, uint8 expectedVerdict, uint8 status, bytes32 contentHash, uint64 updatedAt)",
]);

export async function readCre(): Promise<{ safeToAct: boolean; marketId: string; riskLevel: string; openDispute: boolean; updatedAt: string }> {
  const [safe, w] = await Promise.all([
    testnetClient.readContract({ address: CRE.consumer, abi: CRE_ABI, functionName: "safeToAct", args: [CRE.requestHash] }),
    testnetClient.readContract({ address: CRE.consumer, abi: CRE_ABI, functionName: "watches", args: [CRE.requestHash] }),
  ]);
  return { safeToAct: safe, marketId: w[0], riskLevel: w[1], openDispute: w[2], updatedAt: new Date(Number(w[7]) * 1000).toISOString() };
}

// ---------------------------------------------------------------------------
// Perpl + Agora: the demo passkey wallet's live state on Monad testnet
// ---------------------------------------------------------------------------

export const DEMO_WALLET = "0x81e663d681fbF86F39070de0037f0708872c0969" as Hex;

export const shortHex = (h: string, n = 6) => (h.length > 2 * n + 2 ? `${h.slice(0, n + 2)}...${h.slice(-n)}` : h);
export const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};
