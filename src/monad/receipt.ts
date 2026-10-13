// Monad edition receipts: one zero-value transaction from the passkey wallet to itself whose calldata is
// the receipt text (the same text the default edition writes as a memo). Testnet by default, mainnet
// after the confirmation dialog in App.tsx. The phone signs locally, so no wallet app is involved.
import { createPublicClient, createWalletClient, http, stringToHex, type Hex, type LocalAccount } from "viem";
import { monadTestnet } from "viem/chains";
import type { Cluster } from "../config";
import type { Signer } from "./signer";
import { monadMainnet } from "./networks";

const NETS = {
  devnet: { chain: monadTestnet, rpc: "https://testnet-rpc.monad.xyz" },
  "mainnet-beta": { chain: monadMainnet, rpc: "https://rpc.monad.xyz" },
} as const;

export function clientsFor(cluster: Cluster, account?: LocalAccount) {
  const n = NETS[cluster];
  const pub = createPublicClient({ chain: n.chain, transport: http(n.rpc, { timeout: 15_000, retryCount: 2 }) });
  const wallet = account ? createWalletClient({ account, chain: n.chain, transport: http(n.rpc, { timeout: 20_000 }) }) : null;
  return { pub, wallet };
}

/** MON balance (in MON) of an address on the receipt network. */
export async function balanceMon(address: Hex, cluster: Cluster): Promise<number> {
  const { pub } = clientsFor(cluster);
  return Number(await pub.getBalance({ address })) / 1e18;
}

/** Sends the receipt and waits for it to be included. Returns the transaction hash. */
export async function sendReceipt(signer: Signer, text: string, cluster: Cluster): Promise<Hex> {
  const { pub } = clientsFor(cluster);
  const wallet = await signer.walletClient(NETS[cluster].chain, NETS[cluster].rpc);
  const data = stringToHex(text);
  const gas = await pub.estimateGas({ account: signer.address, to: signer.address, value: 0n, data });
  // Monad charges the gas limit, so keep it close to the estimate.
  const hash = await wallet.sendTransaction({ account: wallet.account!, chain: NETS[cluster].chain, to: signer.address, value: 0n, data, gas: (gas * 12n) / 10n });
  const rc = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (rc.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
  return hash;
}

/** Plain wording for a failed Monad receipt. */
export function receiptError(e: unknown): string {
  const m = ((e as any)?.shortMessage ?? (e as Error)?.message ?? String(e)) as string;
  if (/insufficient funds|exceeds the balance|gas required exceeds/i.test(m)) return "The passkey wallet has too little MON for gas on this network.";
  if (/network request failed|timed out|fetch/i.test(m)) return "The phone could not reach Monad. Check the connection and try again.";
  return m.length > 300 ? `${m.slice(0, 300)}...` : m;
}
