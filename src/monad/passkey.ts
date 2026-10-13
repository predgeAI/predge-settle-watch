// Passkey sign-in with mera (Category Labs). The passkey's WebAuthn PRF output is the root of a
// standard BIP-44 EVM account, so the same passkey gives the same Monad address on every sign-in.
// Nothing secret is stored: only the credential id. The key lives in memory while signed in.
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  isMeraError,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { reactNativeWebAuthnClient } from "@category-labs/mera/react-native-webauthn-client";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import type { LocalAccount } from "viem";

// The relying party. predge.io/.well-known/assetlinks.json must list io.predge.settlewatch with
// delegate_permission/common.get_login_creds for Android to allow passkeys for this host.
export const RP_ID = "predge.io";
const CRED_KEY = "sw.monad.credential.v1";

interface StoredCredential {
  credentialId: string;
  transports?: readonly string[];
}

let session: Secp256k1SigningSession | undefined;
let account: LocalAccount | undefined;

function deriveEvmKey(prfOutput: Uint8Array, index = 0): Uint8Array {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive(`m/44'/60'/0'/0/${index}`);
  if (!node.privateKey) throw new Error("derivation produced no key");
  return node.privateKey;
}

function startSession(prfOutput: Uint8Array): LocalAccount {
  session?.end();
  const key = deriveEvmKey(prfOutput);
  session = createSecp256k1SigningSession({ privateKey: key });
  key.fill(0);
  prfOutput.fill(0);
  account = toViemAccount(session) as LocalAccount;
  return account;
}

export async function storedCredential(): Promise<StoredCredential | null> {
  try {
    const raw = await AsyncStorage.getItem(CRED_KEY);
    return raw ? (JSON.parse(raw) as StoredCredential) : null;
  } catch {
    return null;
  }
}

/** First run: creates a passkey for predge.io and signs in with it. */
export async function createAndSignIn(): Promise<LocalAccount> {
  const created = await createPasskeyWithPrfOutput({
    rp: { id: RP_ID, name: "Settle Watch" },
    user: { name: "settle-watch", displayName: "Settle Watch on Monad" },
    webAuthnClient: reactNativeWebAuthnClient,
  });
  await AsyncStorage.setItem(CRED_KEY, JSON.stringify({ credentialId: created.credentialId, transports: created.transports }));
  return startSession(created.prfOutput);
}

/** Returning user: one biometric prompt, same address as before. */
export async function signIn(): Promise<LocalAccount> {
  const known = await storedCredential();
  const got = await getPasskeyPrfOutput({
    rpId: RP_ID,
    credential: known ? ({ credentialId: known.credentialId, transports: known.transports } as any) : undefined,
    webAuthnClient: reactNativeWebAuthnClient,
  });
  if (!known || known.credentialId !== got.credentialId) await AsyncStorage.setItem(CRED_KEY, JSON.stringify({ credentialId: got.credentialId }));
  return startSession(got.prfOutput);
}

export function current(): LocalAccount | undefined {
  return account;
}

export function signOut() {
  session?.end();
  session = undefined;
  account = undefined;
}

export function describeError(e: unknown): string {
  if (isMeraError(e)) {
    switch (e.code) {
      case "PRF_UNAVAILABLE":
        return "This phone's passkey provider does not support the PRF extension. Use Google Password Manager as the passkey provider.";
      case "PASSKEY_OPERATION_FAILED":
        return "The passkey prompt was dismissed or failed. Try again.";
      case "CRYPTO_UNAVAILABLE":
        return "Secure random numbers are not available.";
      default:
        return `${e.code}: ${e.message}`;
    }
  }
  const msg = (e as any)?.shortMessage ?? (e as Error)?.message ?? String(e);
  return msg.length > 400 ? `${msg.slice(0, 400)}...` : msg;
}
