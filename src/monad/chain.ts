// Monad testnet, AUSD and Perpl: addresses, minimal ABIs and the reads/writes the Monad tab needs.
// Testnet only. Mainnet addresses are listed for reference and are never used for orders here.
import { createPublicClient, createWalletClient, http, parseAbi, type Hex, type LocalAccount } from "viem";
import { monadTestnet } from "viem/chains";

export const NET = {
  chain: monadTestnet,
  chainId: 10143,
  rpc: "https://testnet-rpc.monad.xyz",
  explorer: "https://testnet.monadscan.com",
  perplApi: "https://testnet.perpl.xyz/api",
  // Perpl Exchange on Monad testnet (docs.perpl.xyz, Networks & Configuration).
  exchange: "0x1964C32f0bE608E7D29302AFF5E61268E72080cc" as Hex,
  // AUSD (Agora Dollar) on Monad testnet, 6 decimals. Perpl's testnet collateral.
  ausd: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC" as Hex,
  // Agora's public AUSD faucet contract: requestFunds(address) sends 10,000 test AUSD.
  ausdFaucet: "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C" as Hex,
  // Perpl testnet BTC perpetual.
  btcPerp: 16n,
} as const;

export const ERC20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

export const FAUCET = parseAbi(["function requestFunds(address to)"]);

// The slice of Perpl's Exchange ABI used here (dex-sdk crates/sdk/abi/dex/Exchange.json).
export const EXCHANGE = [
  {
    type: "function",
    name: "getAccountByAddr",
    stateMutability: "view",
    inputs: [{ name: "accountAddress", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "accountId", type: "uint256" },
          { name: "balanceCNS", type: "uint256" },
          { name: "lockedBalanceCNS", type: "uint256" },
          { name: "frozen", type: "uint8" },
          { name: "accountAddr", type: "address" },
          {
            name: "positions",
            type: "tuple",
            components: [{ name: "bank1", type: "uint256" }, { name: "bank2", type: "uint256" }, { name: "bank3", type: "uint256" }, { name: "bank4", type: "uint256" }],
          },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getMinAccountOpenCNS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "createAccount",
    stateMutability: "nonpayable",
    inputs: [{ name: "amountCNS", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "execOrder",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "orderDesc",
        type: "tuple",
        components: [
          { name: "orderDescId", type: "uint256" },
          { name: "perpId", type: "uint256" },
          { name: "orderType", type: "uint8" },
          { name: "orderId", type: "uint256" },
          { name: "pricePNS", type: "uint256" },
          { name: "lotLNS", type: "uint256" },
          { name: "expiryBlock", type: "uint256" },
          { name: "postOnly", type: "bool" },
          { name: "fillOrKill", type: "bool" },
          { name: "immediateOrCancel", type: "bool" },
          { name: "maxMatches", type: "uint256" },
          { name: "leverageHdths", type: "uint256" },
          { name: "lastExecutionBlock", type: "uint256" },
          { name: "amountCNS", type: "uint256" },
          { name: "maxNegPnlCollatBPS", type: "uint256" },
        ],
      },
    ],
    outputs: [
      {
        name: "signature",
        type: "tuple",
        components: [
          { name: "perpId", type: "uint256" },
          { name: "orderId", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getPosition",
    stateMutability: "view",
    inputs: [
      { name: "perpId", type: "uint256" },
      { name: "accountId", type: "uint256" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "accountId", type: "uint256" },
          { name: "nextNodeId", type: "uint256" },
          { name: "prevNodeId", type: "uint256" },
          { name: "positionType", type: "uint8" },
          { name: "depositCNS", type: "uint256" },
          { name: "pricePNS", type: "uint256" },
          { name: "lotLNS", type: "uint256" },
          { name: "entryBlock", type: "uint256" },
          { name: "pnlCNS", type: "int256" },
          { name: "deltaPnlCNS", type: "int256" },
          { name: "premiumPnlCNS", type: "int256" },
        ],
      },
      { name: "markPricePNS", type: "uint256" },
      { name: "markPriceValid", type: "bool" },
    ],
  },
] as const;

// On-chain order types (dex-sdk RequestType as u8): 0 OpenLong, 1 OpenShort, 2 CloseLong, 3 CloseShort.
export const ORDER = { openLong: 0, openShort: 1, closeLong: 2, closeShort: 3 } as const;

export const pub = createPublicClient({ chain: monadTestnet, transport: http(NET.rpc, { timeout: 15_000, retryCount: 2 }) });

export function walletFor(account: LocalAccount) {
  return createWalletClient({ account, chain: monadTestnet, transport: http(NET.rpc, { timeout: 20_000 }) });
}

export const usd = (raw: bigint) => Number(raw) / 1e6;

export interface Snapshot {
  mon: bigint;
  ausd: bigint;
  perplAccountId: bigint;
  perplBalance: bigint;
  position: { type: number; lot: bigint; entry: bigint; pnl: bigint; deposit: bigint } | null;
  mark: bigint;
  minOpen: bigint;
}

export interface Market {
  markPNS: bigint;
  priceDecimals: number;
  sizeDecimals: number;
  maxNegPnlBps: number;
  orderTtlBlocks: number;
}

/** Market config and live mark from Perpl's public context endpoint (no auth). */
export async function btcMarket(): Promise<Market> {
  const r = await fetch(`${NET.perplApi}/v1/pub/context`);
  if (!r.ok) throw new Error(`Perpl context ${r.status}`);
  const ctx = await r.json();
  const m = ctx.markets.find((x: any) => x.perpetual_id === Number(NET.btcPerp));
  if (!m) throw new Error("BTC market not found on Perpl testnet");
  return {
    markPNS: BigInt(m.state.mrk),
    priceDecimals: m.config.price_decimals,
    sizeDecimals: m.config.size_decimals,
    maxNegPnlBps: m.order_max_neg_pnl_collat_bps ?? 1000,
    orderTtlBlocks: m.order_ttl_blocks ?? 20,
  };
}

export async function snapshot(address: Hex): Promise<Snapshot> {
  const [mon, ausd, acct, minOpen] = await Promise.all([
    pub.getBalance({ address }),
    pub.readContract({ address: NET.ausd, abi: ERC20, functionName: "balanceOf", args: [address] }),
    pub.readContract({ address: NET.exchange, abi: EXCHANGE, functionName: "getAccountByAddr", args: [address] }),
    pub.readContract({ address: NET.exchange, abi: EXCHANGE, functionName: "getMinAccountOpenCNS" }),
  ]);
  let position: Snapshot["position"] = null;
  let mark = 0n;
  if (acct.accountId > 0n) {
    const [p, m] = await pub.readContract({ address: NET.exchange, abi: EXCHANGE, functionName: "getPosition", args: [NET.btcPerp, acct.accountId] });
    mark = m;
    if (p.lotLNS > 0n) position = { type: p.positionType, lot: p.lotLNS, entry: p.pricePNS, pnl: p.pnlCNS, deposit: p.depositCNS };
  }
  return { mon, ausd, perplAccountId: acct.accountId, perplBalance: acct.balanceCNS, position, mark, minOpen };
}

async function send(account: LocalAccount, req: Parameters<ReturnType<typeof walletFor>["writeContract"]>[0]): Promise<Hex> {
  const w = walletFor(account);
  // Simulate first so a revert shows up as an error here, before any MON is spent.
  const { gas: _cap, ...call } = req as any;
  await pub.simulateContract({ ...call, account });
  // Monad charges the gas limit, not gas used, so keep the limit close to the estimate.
  const est = await pub.estimateContractGas({ ...call, account });
  const hash = await w.writeContract({ ...call, gas: (est * 13n) / 10n } as any);
  const rc = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (rc.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
  return hash;
}

/** Agora's testnet faucet: 10,000 test AUSD to this address. Needs a little testnet MON for gas. */
export function requestTestAusd(account: LocalAccount) {
  return send(account, { address: NET.ausdFaucet, abi: FAUCET, functionName: "requestFunds", args: [account.address], gas: 150_000n } as any);
}

/** Approves the exchange for `amount` AUSD (if needed) and opens a Perpl account with it. */
export async function openPerplAccount(account: LocalAccount, amount: bigint): Promise<Hex[]> {
  const out: Hex[] = [];
  const allowance = await pub.readContract({ address: NET.ausd, abi: ERC20, functionName: "allowance", args: [account.address, NET.exchange] });
  if (allowance < amount) out.push(await send(account, { address: NET.ausd, abi: ERC20, functionName: "approve", args: [NET.exchange, amount], gas: 120_000n } as any));
  out.push(await send(account, { address: NET.exchange, abi: EXCHANGE, functionName: "createAccount", args: [amount], gas: 400_000n } as any));
  return out;
}

export interface HedgePlan {
  lotLNS: bigint;
  limitPNS: bigint;
  leverageHdths: bigint;
  notionalUsd: number;
  sizeBtc: number;
  markUsd: number;
}

/** A short BTC IOC order sized to `notionalUsd`, limit 2% below mark, 2x leverage. */
export function planShort(m: Market, notionalUsd: number): HedgePlan {
  const markUsd = Number(m.markPNS) / 10 ** m.priceDecimals;
  const sizeBtc = notionalUsd / markUsd;
  const lot = BigInt(Math.max(1, Math.round(sizeBtc * 10 ** m.sizeDecimals)));
  return {
    lotLNS: lot,
    limitPNS: (m.markPNS * 98n) / 100n,
    leverageHdths: 200n,
    notionalUsd: (Number(lot) / 10 ** m.sizeDecimals) * markUsd,
    sizeBtc: Number(lot) / 10 ** m.sizeDecimals,
    markUsd,
  };
}

/** Sends the short to Perpl's on-chain order book. Immediate-or-cancel: fills now or not at all. */
export function placeShort(account: LocalAccount, m: Market, plan: HedgePlan) {
  return send(account, {
    address: NET.exchange,
    abi: EXCHANGE,
    functionName: "execOrder",
    args: [
      {
        orderDescId: 0n,
        perpId: NET.btcPerp,
        orderType: ORDER.openShort,
        orderId: 0n,
        pricePNS: plan.limitPNS,
        lotLNS: plan.lotLNS,
        expiryBlock: 0n,
        postOnly: false,
        fillOrKill: false,
        immediateOrCancel: true,
        maxMatches: 16n,
        leverageHdths: plan.leverageHdths,
        lastExecutionBlock: 0n,
        amountCNS: 0n,
        maxNegPnlCollatBPS: BigInt(m.maxNegPnlBps),
      },
    ],
    gas: 1_500_000n,
  } as any);
}

/** Closes the whole BTC position with an IOC order on the other side. */
export function closePosition(account: LocalAccount, m: Market, pos: NonNullable<Snapshot["position"]>) {
  const isShort = pos.type === 1;
  return send(account, {
    address: NET.exchange,
    abi: EXCHANGE,
    functionName: "execOrder",
    args: [
      {
        orderDescId: 0n,
        perpId: NET.btcPerp,
        orderType: isShort ? ORDER.closeShort : ORDER.closeLong,
        orderId: 0n,
        pricePNS: isShort ? (m.markPNS * 102n) / 100n : (m.markPNS * 98n) / 100n,
        lotLNS: pos.lot,
        expiryBlock: 0n,
        postOnly: false,
        fillOrKill: false,
        immediateOrCancel: true,
        maxMatches: 16n,
        leverageHdths: 200n,
        lastExecutionBlock: 0n,
        amountCNS: 0n,
        maxNegPnlCollatBPS: BigInt(m.maxNegPnlBps),
      },
    ],
    gas: 1_500_000n,
  } as any);
}
