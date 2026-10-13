// MONAD: passkey wallet (mera), AUSD balance and a one-tap Perpl hedge, all on Monad testnet.
// A watched crypto-price market under dispute can be hedged with a BTC short sized to the exposure.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, StyleSheet, View, type ScrollViewProps } from "react-native";
import * as Clipboard from "expo-clipboard";
import type { Hex, LocalAccount } from "viem";
import { alpha, C, MONO, PX, T } from "../theme";
import { Button, Chip, PixelBox } from "../ui";
import { Text } from "../Text";
import { showDialog } from "../dialog";
import * as haptic from "../haptic";
import type { WatchItem } from "../store";
import { TabHeader, TabScroll, short } from "./shared";
import { btcMarket, closePosition, NET, openPerplAccount, placeShort, planShort, requestTestAusd, snapshot, usd, type Market, type Snapshot } from "../monad/chain";
import * as passkey from "../monad/passkey";

const MIN_GAS_MON = 10n ** 17n; // 0.1 testnet MON keeps several transactions going
const SIZES = [25, 50, 100];

interface TxRow {
  label: string;
  hash: Hex;
  at: number;
}

/** Watched markets about crypto prices that are disputed or flagged: the exposure a hedge covers. */
function cryptoExposure(items: WatchItem[]) {
  const re = /\b(bitcoin|btc|ethereum|eth|crypto|solana)\b/i;
  return items.filter((i) => {
    const q = i.question ?? i.last?.market?.question ?? "";
    return re.test(q) && !i.last?.resolved_on_chain && ((i.last?.dispute_count ?? 0) > 0 || i.last?.open_dispute);
  });
}

export function MonadTab(p: { active: boolean; refreshControl: ScrollViewProps["refreshControl"]; items: WatchItem[] }) {
  const [account, setAccount] = useState<LocalAccount | undefined>(passkey.current());
  const [hasCred, setHasCred] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [market, setMarket] = useState<Market | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [size, setSize] = useState(50);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const exposure = useMemo(() => cryptoExposure(p.items), [p.items]);

  useEffect(() => {
    passkey.storedCredential().then((c) => setHasCred(!!c));
  }, []);

  const refresh = useCallback(async () => {
    if (!account) return;
    try {
      const [s, m] = await Promise.all([snapshot(account.address), btcMarket()]);
      setSnap(s);
      setMarket(m);
      setErr(null);
    } catch (e) {
      setErr(passkey.describeError(e));
    }
  }, [account]);

  useEffect(() => {
    if (!p.active || !account) return;
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [p.active, account, refresh]);

  const run = async (label: string, fn: () => Promise<Hex | Hex[] | LocalAccount>) => {
    setBusy(label);
    setErr(null);
    try {
      const out = await fn();
      if (typeof out === "string") setTxs((t) => [{ label, hash: out, at: Date.now() }, ...t].slice(0, 8));
      else if (Array.isArray(out)) setTxs((t) => [...out.map((h) => ({ label, hash: h, at: Date.now() })), ...t].slice(0, 8));
      haptic.tap();
      return out;
    } catch (e) {
      const msg = passkey.describeError(e);
      setErr(msg);
      showDialog("Did not go through", msg, undefined, { variant: "error" });
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const signIn = (create: boolean) =>
    run(create ? "Create passkey" : "Sign in", async () => {
      const a = create ? await passkey.createAndSignIn() : await passkey.signIn();
      setAccount(a);
      setHasCred(true);
      return a;
    });

  const hedge = () => {
    if (!account || !market) return;
    const plan = planShort(market, size);
    const why = exposure[0]?.question ?? exposure[0]?.last?.market?.question;
    showDialog(
      "Short BTC on Perpl?",
      [
        why ? `Hedge for: ${why}` : "Hedge your crypto-price exposure.",
        "",
        `Size: ${plan.sizeBtc} BTC (about $${plan.notionalUsd.toFixed(2)})`,
        `Mark: $${plan.markUsd.toFixed(1)}`,
        `Limit: $${(Number(plan.limitPNS) / 10 ** market.priceDecimals).toFixed(1)}, immediate or cancel`,
        "Leverage: 2x, isolated margin",
        "",
        "Monad testnet. Test AUSD only, no real money.",
      ].join("\n"),
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign and send", onPress: () => run("Perpl short BTC", () => placeShort(account, market, plan)) },
      ],
      { variant: "neutral" },
    );
  };

  const lowGas = !!snap && snap.mon < MIN_GAS_MON;
  const needAusd = !!snap && snap.perplAccountId === 0n && snap.ausd < snap.minOpen;
  const canOpen = !!snap && snap.perplAccountId === 0n && snap.ausd >= snap.minOpen;
  const hasAccount = !!snap && snap.perplAccountId > 0n;

  return (
    <TabScroll active={p.active} refreshControl={p.refreshControl}>
      <TabHeader title="MONAD" sub="Passkey wallet, AUSD and Perpl hedges. Monad testnet." right={<Chip text="TESTNET" color={C.purpleSoft} />} />

      {!account ? (
        <PixelBox border={C.purple} bg={C.surface} style={st.card} inner={st.pad}>
          <Text style={st.kicker}>SIGN IN</Text>
          <Text style={st.body}>
            Your Monad wallet comes from a passkey on this phone: fingerprint or screen lock, no seed phrase. The same passkey gives the same address every time.
          </Text>
          <View style={st.gap} />
          {hasCred ? <Button title={busy ? "WAITING..." : "SIGN IN WITH PASSKEY"} disabled={!!busy} onPress={() => signIn(false)} /> : null}
          <View style={{ height: 10 }} />
          <Button
            title={hasCred ? "NEW PASSKEY" : busy ? "WAITING..." : "CREATE PASSKEY"}
            kind={hasCred ? "ghost" : "primary"}
            disabled={!!busy}
            onPress={() => signIn(true)}
          />
          {!hasCred ? (
            <>
              <View style={{ height: 10 }} />
              <Button title="I HAVE ONE: SIGN IN" kind="ghost" small disabled={!!busy} onPress={() => signIn(false)} />
            </>
          ) : null}
          <Text style={st.fine}>Powered by mera. Passkeys for {passkey.RP_ID}.</Text>
        </PixelBox>
      ) : (
        <>
          <PixelBox border={C.green} bg={C.surface} style={st.card} inner={st.pad}>
            <View style={st.rowBetween}>
              <Text style={st.kicker}>WALLET</Text>
              <Button
                title="SIGN OUT"
                kind="ghost"
                small
                onPress={() => {
                  passkey.signOut();
                  setAccount(undefined);
                  setSnap(null);
                }}
              />
            </View>
            <Text
              style={st.addr}
              onPress={() => {
                Clipboard.setStringAsync(account.address);
                haptic.tap();
              }}
            >
              {account.address}
            </Text>
            <Text style={st.fine}>Tap the address to copy it.</Text>
            <View style={st.balRow}>
              <Bal label="AUSD" value={snap ? usd(snap.ausd).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "..."} color={C.greenBright} />
              <Bal label="MON" value={snap ? (Number(snap.mon) / 1e18).toFixed(3) : "..."} color={C.purpleSoft} />
              <Bal label="ON PERPL" value={snap ? (hasAccount ? usd(snap.perplBalance).toFixed(2) : "-") : "..."} color={C.teal} />
            </View>
          </PixelBox>

          {lowGas ? (
            <Step n={1} title="Get testnet MON for gas" body="Paste your address at the Monad faucet. About 0.1 MON covers every step here.">
              <Button title="OPEN MONAD FAUCET" small onPress={() => Linking.openURL("https://faucet.monad.xyz")} />
            </Step>
          ) : null}

          {needAusd ? (
            <Step n={2} title="Get test AUSD" body={`Agora's faucet sends 10,000 test AUSD to this wallet. Perpl needs ${snap ? usd(snap.minOpen) : 100} AUSD to open an account.`}>
              <Button title={busy === "AUSD faucet" ? "SENDING..." : "GET 10,000 TEST AUSD"} small disabled={!!busy || lowGas} onPress={() => run("AUSD faucet", () => requestTestAusd(account))} />
            </Step>
          ) : null}

          {canOpen && snap ? (
            <Step n={3} title="Open a Perpl account" body={`Moves ${usd(snap.minOpen)} AUSD into Perpl's exchange contract as margin. Two transactions: approve, then open.`}>
              <Button title={busy === "Open Perpl account" ? "OPENING..." : `DEPOSIT ${usd(snap.minOpen)} AUSD`} small disabled={!!busy || lowGas} onPress={() => run("Open Perpl account", () => openPerplAccount(account, snap.minOpen))} />
            </Step>
          ) : null}

          {hasAccount && snap ? (
            <PixelBox border={C.orange} bg={C.surface} style={st.card} inner={st.pad}>
              <Text style={st.kicker}>HEDGE</Text>
              {exposure.length ? (
                <Text style={st.body}>
                  {exposure.length} watched crypto market{exposure.length > 1 ? "s are" : " is"} disputed: {exposure[0].question ?? exposure[0].last?.market?.question}. A dispute can flip the payout, so short BTC to offset the price leg while it settles.
                </Text>
              ) : (
                <Text style={st.body}>No watched crypto-price market is disputed right now. You can still open a BTC short on Perpl to hedge.</Text>
              )}
              <Text style={st.label}>SIZE (USD NOTIONAL)</Text>
              <View style={st.sizeRow}>
                {SIZES.map((s) => (
                  <Button key={s} title={`$${s}`} small kind={s === size ? "primary" : "ghost"} style={{ flex: 1 }} onPress={() => setSize(s)} />
                ))}
              </View>
              {market ? (
                <Text style={st.fine}>
                  BTC mark ${(Number(market.markPNS) / 10 ** market.priceDecimals).toFixed(1)}. Order: {planShort(market, size).sizeBtc} BTC short, 2x.
                </Text>
              ) : null}
              <View style={st.gap} />
              <Button title={busy === "Perpl short BTC" ? "SENDING..." : "SHORT BTC ON PERPL"} disabled={!!busy || !market || lowGas} onPress={hedge} />
              {snap.position ? (
                <View style={st.posBox}>
                  <Text style={st.label}>OPEN POSITION</Text>
                  <Text style={st.body}>
                    {snap.position.type === 1 ? "SHORT" : "LONG"} {Number(snap.position.lot) / 10 ** (market?.sizeDecimals ?? 5)} BTC at $
                    {(Number(snap.position.entry) / 10 ** (market?.priceDecimals ?? 1)).toFixed(1)}, margin {usd(snap.position.deposit).toFixed(2)} AUSD
                  </Text>
                  <View style={{ height: 8 }} />
                  <Button
                    title={busy === "Perpl close" ? "CLOSING..." : "CLOSE POSITION"}
                    kind="ghost"
                    small
                    disabled={!!busy || !market}
                    onPress={() => market && snap.position && run("Perpl close", () => closePosition(account, market, snap.position!))}
                  />
                </View>
              ) : null}
            </PixelBox>
          ) : null}

          {txs.length ? (
            <PixelBox border={C.line} bg={C.surface} style={st.card} inner={st.pad}>
              <Text style={st.kicker}>TRANSACTIONS</Text>
              {txs.map((x) => (
                <Text key={x.hash} style={st.tx} onPress={() => Linking.openURL(`${NET.explorer}/tx/${x.hash}`)}>
                  {x.label}: {short(x.hash, 6)}
                </Text>
              ))}
              <Text style={st.fine}>Tap a line to open it on Monadscan.</Text>
            </PixelBox>
          ) : null}

          {err ? <Text style={st.err}>{err}</Text> : null}
        </>
      )}
    </TabScroll>
  );
}

function Bal({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[st.label, { marginTop: 0 }]}>{label}</Text>
      <Text style={[st.balVal, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

function Step({ n, title, body, children }: { n: number; title: string; body: string; children: React.ReactNode }) {
  return (
    <PixelBox border={C.purple} bg={C.surface} style={st.card} inner={st.pad}>
      <Text style={st.kicker}>STEP {n}</Text>
      <Text style={st.title}>{title}</Text>
      <Text style={st.body}>{body}</Text>
      <View style={st.gap} />
      {children}
    </PixelBox>
  );
}

const st = StyleSheet.create({
  card: { marginTop: 16 },
  pad: { padding: 14 },
  kicker: { color: C.greenBright, fontFamily: PX, fontSize: 10, lineHeight: 14 },
  title: { color: C.text, fontSize: T.heading, fontWeight: "700", marginTop: 8 },
  body: { color: C.text, fontSize: T.body, lineHeight: 22, marginTop: 8 },
  fine: { color: C.dim, fontSize: T.micro, lineHeight: 16, marginTop: 10 },
  label: { color: C.dim, fontFamily: PX, fontSize: 8, lineHeight: 12, marginTop: 14 },
  addr: { color: C.text, fontFamily: MONO, fontSize: T.small, lineHeight: 19, marginTop: 10 },
  balRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  balVal: { fontFamily: PX, fontSize: 14, lineHeight: 22, marginTop: 6 },
  sizeRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  gap: { height: 14 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  posBox: { marginTop: 14, padding: 10, backgroundColor: alpha(C.orange, 0.1) },
  tx: { color: C.teal, fontFamily: MONO, fontSize: T.small, lineHeight: 22, marginTop: 6 },
  err: { color: C.red, fontSize: T.small, lineHeight: 19, marginTop: 14 },
});
