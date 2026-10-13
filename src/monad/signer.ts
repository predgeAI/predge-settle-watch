// Monad edition: the one wallet the app signs with, whichever way the user signed in.
//   passkey: mera passkey (fingerprint), key held in memory
//   email:   Privy embedded wallet (email one-time code)
//   wallet:  Dynamic (email login with an embedded wallet)
// Kuru notes, Perpl, receipts and the League all sign through `current()`.
import { createWalletClient, custom, http, type Chain, type Hex, type LocalAccount, type WalletClient } from "viem";
import * as passkey from "./passkey";

export type SignerKind = "passkey" | "email" | "wallet";

export interface Signer {
  kind: SignerKind;
  address: Hex;
  /** A viem wallet client on `chain` with this signer as its account. */
  walletClient(chain: Chain, rpc: string): Promise<WalletClient>;
  signMessage(message: string): Promise<Hex>;
  signOut(): Promise<void>;
}

let active: Signer | undefined;
const listeners = new Set<(s: Signer | undefined) => void>();

export const current = () => active;

export function setSigner(s: Signer | undefined) {
  active = s;
  for (const fn of listeners) fn(active);
}

export function onSignerChange(fn: (s: Signer | undefined) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function passkeySigner(account: LocalAccount): Signer {
  return {
    kind: "passkey",
    address: account.address,
    walletClient: async (chain, rpc) => createWalletClient({ account, chain, transport: http(rpc, { timeout: 20_000 }) }),
    signMessage: (message) => account.signMessage({ message }),
    signOut: async () => passkey.signOut(),
  };
}

/** An EIP-1193 provider (Privy) as a signer. Switches the provider to `chain` before use. */
export function providerSigner(kind: SignerKind, address: Hex, getProvider: () => Promise<any>, signOut: () => Promise<void>): Signer {
  return {
    kind,
    address,
    walletClient: async (chain) => {
      const provider = await getProvider();
      try {
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${chain.id.toString(16)}` }] });
      } catch {
        // some providers switch implicitly per request
      }
      return createWalletClient({ account: address, chain, transport: custom(provider) });
    },
    signMessage: async (message) => {
      const provider = await getProvider();
      return (await provider.request({ method: "personal_sign", params: [message, address] })) as Hex;
    },
    signOut,
  };
}

// The passkey wallet becomes the signer when it signs in, and stops being it when it signs out.
passkey.onAccountChange((a) => {
  if (a) setSigner(passkeySigner(a));
  else if (active?.kind === "passkey") setSigner(undefined);
});

export const kindLabel = (k: SignerKind) => (k === "passkey" ? "fingerprint" : k === "email" ? "email" : "wallet");
