import { transact } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";
import { APP_IDENTITY, CLUSTERS, DEFAULT_CLUSTER } from "../config";
import { LEAGUE_API, LEAGUE_EVM } from "./config";
import * as passkey from "../monad/passkey";
import { checkSignInMessage, leagueHost } from "./logic";
import { loadWallet } from "../store";
import { api, LeagueError, saveSession, type Session } from "./api";
import { t } from "../i18n";

/**
 * Sign in to the League with the Solana wallet: Mobile Wallet Adapter signMessages over a SIWS-style
 * message that holds a server nonce, the League domain and an expiry. No transaction, no fee.
 */
type Wallet = Parameters<Parameters<typeof transact>[0]>[0];

async function authorizeFor(wallet: Wallet, authToken: string | undefined, chain: "solana:devnet" | "solana:mainnet") {
  if (authToken) {
    try {
      return await wallet.reauthorize({ auth_token: authToken, identity: APP_IDENTITY });
    } catch {
      // token expired or revoked: ask again
    }
  }
  return wallet.authorize({ chain, identity: APP_IDENTITY });
}

const toBase58 = (b64: string) => new PublicKey(Buffer.from(b64, "base64")).toBase58();

/**
 * Sign in to the League with the Solana wallet: Mobile Wallet Adapter signMessages over a SIWS-style
 * message that holds a server nonce, the League domain and an expiry. No transaction, no fee.
 * No network call happens while a wallet session is open (a lesson from receipts): the nonce is fetched
 * before it and the signature is verified after it.
 */
/** Monad edition: the passkey wallet signs the server's challenge with personal_sign. No fee, no transaction. */
async function signInWithPasskey(): Promise<Session> {
  const account = passkey.current();
  if (!account) throw new LeagueError("no_account", t("lg.err.noAccount"), 0);
  const address = account.address.toLowerCase();
  const { message } = await api.nonce(address);
  const bad = checkSignInMessage(message, { domain: leagueHost(LEAGUE_API), address, now: Date.now() });
  if (bad) throw new LeagueError("bad_message", t("lg.err.badMessage"), 0);
  let signature: string;
  try {
    signature = await account.signMessage({ message });
  } catch {
    throw new LeagueError("wallet", t("lg.err.wallet"), 0);
  }
  const session = await api.verify(address, message, signature);
  await saveSession(session);
  return session;
}

export async function signInWithWallet(): Promise<Session> {
  if (LEAGUE_EVM) return signInWithPasskey();
  const stored = await loadWallet();
  const chain = CLUSTERS[stored?.cluster ?? DEFAULT_CLUSTER].chain;
  try {
    let address = stored?.address;
    let authToken = stored?.authToken;
    if (!address) {
      // First time: connect just to learn the address.
      const first = await transact(async (wallet) => {
        const auth = await authorizeFor(wallet, undefined, chain);
        const acct = auth.accounts[0];
        if (!acct) throw new LeagueError("no_account", t("lg.err.noAccount"), 0);
        return { address: toBase58(acct.address), authToken: auth.auth_token };
      });
      address = first.address;
      authToken = first.authToken;
    }
    const { message } = await api.nonce(address);
    // Refuse a message that is not for this League, this wallet and now, before the wallet ever sees it.
    const bad = checkSignInMessage(message, { domain: leagueHost(LEAGUE_API), address, now: Date.now() });
    if (bad) throw new LeagueError("bad_message", t("lg.err.badMessage"), 0);
    const signed = await transact(async (wallet) => {
      const auth = await authorizeFor(wallet, authToken, chain);
      const acct = auth.accounts[0];
      if (!acct || toBase58(acct.address) !== address) throw new LeagueError("wrong_account", t("lg.err.wrongAccount"), 0);
      const [out] = await wallet.signMessages({ addresses: [acct.address], payloads: [new TextEncoder().encode(message)] });
      if (!out) throw new LeagueError("no_signature", t("lg.err.noSignature"), 0);
      return out;
    });
    // The wallet returns either the 64 byte signature or the message followed by it. The server accepts both.
    const session = await api.verify(address, message, Buffer.from(signed).toString("base64"));
    await saveSession(session);
    return session;
  } catch (e) {
    if (e instanceof LeagueError) throw e;
    throw new LeagueError("wallet", t("lg.err.wallet"), 0);
  }
}

export async function signOut(): Promise<void> {
  await saveSession(null);
}
