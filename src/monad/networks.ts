// Monad mainnet (chain 143) and the explorers used for links. viem 2.38 ships only monadTestnet.
import { createPublicClient, defineChain, http } from "viem";
import { monadTestnet } from "viem/chains";

export const monadMainnet = defineChain({
  id: 143,
  name: "Monad",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "MonadVision", url: "https://monadvision.com" } },
});

export const EXPLORER = { mainnet: "https://monadvision.com", testnet: "https://testnet.monadvision.com" } as const;

export const mainnetClient = createPublicClient({ chain: monadMainnet, transport: http("https://rpc.monad.xyz", { timeout: 15_000, retryCount: 2 }) });
export const testnetClient = createPublicClient({ chain: monadTestnet, transport: http("https://testnet-rpc.monad.xyz", { timeout: 15_000, retryCount: 2 }) });
