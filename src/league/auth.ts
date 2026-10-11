import { transact } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";
import { APP_IDENTITY, CLUSTERS, DEFAULT_CLUSTER } from "../config";
import { loadWallet } from "../store";
import { api, LeagueError, saveSession, type Session } from "./api";

/**
 * Sign in to the League with the Solana wallet: Mobile Wallet Adapter signMessages over a SIWS-style
 * message that holds a server nonce, the League domain and an expiry. No transaction, no fee.
 */
export async function signInWithWallet(): Promise<Session> {
  const stored = await loadWallet();
  const chain = CLUSTERS[stored?.cluster ?? DEFAULT_CLUSTER].chain;
  try {
    const session = await transact(async (wallet) => {
      let auth;
      if (stored?.authToken) {
        try {
          auth = await wallet.reauthorize({ auth_token: stored.authToken, identity: APP_IDENTITY });
        } catch {
          auth = undefined;
        }
      }
      if (!auth) auth = await wallet.authorize({ chain, identity: APP_IDENTITY });
      const acct = auth.accounts[0];
      if (!acct) throw new LeagueError("no_account", "The wallet returned no account.", 0);
      const address = new PublicKey(Buffer.from(acct.address, "base64")).toBase58();
      const { message } = await api.nonce(address);
      const [signed] = await wallet.signMessages({ addresses: [acct.address], payloads: [new TextEncoder().encode(message)] });
      if (!signed) throw new LeagueError("no_signature", "The wallet did not sign.", 0);
      // The wallet returns either the 64 byte signature or the message followed by it. The server accepts both.
      return api.verify(address, message, Buffer.from(signed).toString("base64"));
    });
    await saveSession(session);
    return session;
  } catch (e) {
    if (e instanceof LeagueError) throw e;
    throw new LeagueError("wallet", "Sign-in was cancelled or the wallet is unavailable.", 0);
  }
}

export async function signOut(): Promise<void> {
  await saveSession(null);
}
