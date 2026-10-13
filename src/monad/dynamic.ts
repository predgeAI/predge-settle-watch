// Dynamic (React Native SDK): email login with an embedded EVM wallet, inside the app's WebView host.
// Environment is the same one Predge Guard uses on the web. Created only in the Monad edition.
import { createClient } from "@dynamic-labs/client";
import { ReactNativeExtension } from "@dynamic-labs/react-native-extension";
import { ViemExtension } from "@dynamic-labs/viem-extension";
import type { Hex } from "viem";
import { IS_MONAD } from "../edition";
import { setSigner, current, type Signer } from "./signer";

export const DYNAMIC_ENV = "bf4fc614-b0ae-4976-874e-c470659d07f7";

export const dynamicClient = IS_MONAD
  ? createClient({ environmentId: DYNAMIC_ENV, appName: "Settle Watch", appLogoUrl: "https://predge.io/favicon.ico" })
      .extend(ReactNativeExtension({ appOrigin: "https://guard.predge.io" }))
      .extend(ViemExtension())
  : null;

function signerFor(): Signer | null {
  const c = dynamicClient;
  const wallet = c?.wallets.primary ?? c?.wallets.userWallets?.[0];
  if (!c || !wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet.address)) return null;
  return {
    kind: "wallet",
    address: wallet.address as Hex,
    walletClient: async (chain) => {
      // Dynamic's embedded wallet sends on its own selected network, not on the viem client's chain.
      // Switch it, then refuse unless it really is on the requested chain (never fall through to another network).
      await c.wallets.switchNetwork({ wallet, chainId: chain.id }).catch(() => undefined);
      const { network } = await c.wallets.getNetwork({ wallet });
      if (Number(network) !== chain.id) throw new Error(`This wallet is on network ${network}, not ${chain.name}. Nothing was sent.`);
      return c.viem.createWalletClient({ wallet, chain }) as any;
    },
    signMessage: async (message) => (await c.wallets.signMessage({ wallet, message })).signedMessage as Hex,
    signOut: async () => {
      await c.auth.logout();
    },
  };
}

/** Opens Dynamic's sign-in UI; resolves with the signer once a wallet is available, or null after 3 minutes. */
export async function signInWithDynamic(): Promise<Signer | null> {
  const c = dynamicClient;
  if (!c) return null;
  const existing = c.auth.authenticatedUser ? signerFor() : null;
  if (existing) {
    setSigner(existing);
    return existing;
  }
  await c.ui.auth.show();
  for (let i = 0; i < 360; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (c.auth.authenticatedUser) {
      const s = signerFor();
      if (s) {
        c.ui.auth.hide().catch(() => undefined);
        setSigner(s);
        return s;
      }
    }
  }
  return null;
}

if (dynamicClient) {
  dynamicClient.auth.on("loggedOut", () => {
    if (current()?.kind === "wallet") setSigner(undefined);
  });
  // A Dynamic session survives app restarts; pick it up once the SDK has loaded it (unless another way is signed in).
  let tries = 0;
  const restore = setInterval(() => {
    tries++;
    if (current() || tries > 30) return clearInterval(restore);
    if (dynamicClient.auth.authenticatedUser) {
      const s = signerFor();
      if (s) {
        setSigner(s);
        clearInterval(restore);
      }
    }
  }, 1000);
}
