// Privy (Expo SDK): email one-time code, then the user's embedded EVM wallet becomes the app's signer.
// Same Privy app as Predge Guard on the web, with a native app client for io.predge.settlewatch.monad.
import React, { useEffect, useState } from "react";
import { TextInput, View } from "react-native";
import { PrivyProvider, useEmbeddedEthereumWallet, useLoginWithEmail, usePrivy } from "@privy-io/expo";
import { monadTestnet } from "viem/chains";
import type { Hex } from "viem";
import { Text } from "../Text";
import { L, LButton } from "./IntegrationsScreen";
import { monadMainnet } from "./networks";
import { providerSigner, setSigner, current } from "./signer";

export const PRIVY_APP_ID = "cmo7lfg0f000k0cl251pk1m2o";
export const PRIVY_CLIENT_ID = "client-WY6YVWabfMRJeJ9eqwei4R5rhomATqBFFA5Dm3FxYx2bn";

export function PrivyRoot({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      clientId={PRIVY_CLIENT_ID}
      supportedChains={[monadTestnet, monadMainnet]}
      config={{ embedded: { ethereum: { createOnLogin: "users-without-wallets" } } }}
    >
      {children}
    </PrivyProvider>
  );
}

/** Keeps the app signer in step with the Privy session (also after an app restart). */
function usePrivySigner() {
  const { user, logout } = usePrivy();
  const { wallets, create } = useEmbeddedEthereumWallet();
  useEffect(() => {
    if (!user) {
      if (current()?.kind === "email") setSigner(undefined);
      return;
    }
    const w = wallets[0];
    if (!w) {
      create().catch(() => undefined);
      return;
    }
    if (current()?.kind === "email" && current()?.address.toLowerCase() === w.address.toLowerCase()) return;
    if (current() && current()?.kind !== "email") return; // another way is signed in; don't take over
    setSigner(providerSigner("email", w.address as Hex, () => w.getProvider(), logout));
  }, [user, wallets, create, logout]);
  return { user, logout };
}

export function PrivySync() {
  usePrivySigner();
  return null;
}

export function PrivyEmailLogin({ onDone }: { onDone: () => void }) {
  const { user, logout } = usePrivySigner();
  const { wallets } = useEmbeddedEthereumWallet();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (user && wallets[0]) {
      setSigner(providerSigner("email", wallets[0].address as Hex, () => wallets[0].getProvider(), logout));
      onDone();
    }
  }, [user, wallets, onDone, logout]);

  const go = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(((e as any)?.message ?? String(e)).slice(0, 200));
    } finally {
      setBusy(false);
    }
  };

  if (user) return <Text style={{ color: L.ink, fontSize: 15 }}>{wallets[0] ? "Signed in with email." : "Setting up your wallet..."}</Text>;
  return (
    <View>
      {!sent ? (
        <>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={L.dim}
            autoCapitalize="none"
            keyboardType="email-address"
            style={{ borderWidth: 2, borderColor: L.line, padding: 10, color: L.ink, fontSize: 15, backgroundColor: "#fff" }}
          />
          <View style={{ height: 8 }} />
          <LButton title={busy ? "SENDING..." : "EMAIL ME A CODE"} disabled={busy || !/.+@.+\..+/.test(email)} onPress={() => go(async () => { await sendCode({ email: email.trim() }); setSent(true); })} stretch />
        </>
      ) : (
        <>
          <Text style={{ color: L.dim, fontSize: 13, marginBottom: 6 }}>Code sent to {email.trim()}.</Text>
          <TextInput
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit code"
            placeholderTextColor={L.dim}
            keyboardType="number-pad"
            style={{ borderWidth: 2, borderColor: L.line, padding: 10, color: L.ink, fontSize: 18, letterSpacing: 4, backgroundColor: "#fff" }}
          />
          <View style={{ height: 8 }} />
          <LButton title={busy ? "SIGNING IN..." : "SIGN IN"} disabled={busy || code.length !== 6} onPress={() => go(() => loginWithCode({ code, email: email.trim() }))} stretch />
        </>
      )}
      {err ? <Text style={{ color: L.accentInk, fontSize: 13, marginTop: 6 }}>{err}</Text> : null}
    </View>
  );
}
