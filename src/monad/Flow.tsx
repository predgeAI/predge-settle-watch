// Monad edition home: one market, one flow. Check -> who is exposed -> act in one tap -> fund -> passkey.
// Plain words on the main path; chain detail sits behind small "Recorded on Monad" links and the
// Integrations screen. Only real actions: reads, adding to the watchlist, and (after a confirm dialog and a
// fingerprint) test-dollar transactions on Kuru from the passkey wallet.
import React, { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Text } from "../Text";
import { PX } from "../theme";
import * as haptic from "../haptic";
import { showDialog } from "../dialog";
import { fetchSettlementRisk, type SettlementRisk } from "../api";
import { verifyRecord, type Verification } from "../verify";
import { AURORA, auroraQuote, DEMO_WALLET, FAMOUS, guardDecision, NANSEN_EXPOSURE, readMainnetVerdict, usd0, type Verdict } from "./integrations";
import { EXPLORER } from "./networks";
import { heldNotes, insure, MIN_TEST_MON, NOTE_MARKET, planInsure, testMon } from "./kuru";
import * as signer from "./signer";
import { kindLabel, type Signer } from "./signer";
import { signInWithDynamic } from "./dynamic";
import { PrivyEmailLogin } from "./PrivyLogin";

const FAUCET = "https://faucet.monad.xyz";
import * as passkey from "./passkey";
import { L, LButton, useLive } from "./IntegrationsScreen";
import MEASURED from "./measured.json";

const open = (url: string) => {
  haptic.tap();
  Linking.openURL(url).catch(() => undefined);
};

const finalOf = (r: SettlementRisk) => ((r.onchain_resolution as any)?.outcome as string | undefined) ?? null;
const firstProposal = (r: SettlementRisk) => (r.disputes?.[0]?.disputed_proposal as string | undefined) ?? null;
const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);
const isBtcThreshold = (q: string) => /\b(bitcoin|btc)\b/i.test(q) && /\b(above|below|over|under|reach|hit|\$\d)/i.test(q);

/** One plain sentence for a market's state. */
function stateLine(r: SettlementRisk): string {
  const fin = finalOf(r);
  const prop = firstProposal(r);
  if (r.resolved_on_chain && fin) return prop && prop !== fin ? `Proposed ${prop.toUpperCase()}. Settled ${fin.toUpperCase()}.` : `Settled ${fin.toUpperCase()}${prop ? ", as proposed" : ""}.`;
  if (r.open_dispute || r.sent_to_uma_vote) return `Disputed ${times(r.dispute_count || 1)}.${r.sent_to_uma_vote ? " A vote decides it now." : ""}`;
  if (r.dispute_count > 0) return `Disputed ${times(r.dispute_count)}. Waiting for a new answer.`;
  return "No dispute. Nothing unusual.";
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <View style={fst.step}>
      <View style={fst.stepHead}>
        <Text style={fst.stepNum}>{n}</Text>
        <Text style={fst.stepTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Small({ text, url }: { text: string; url?: string }) {
  return (
    <Text style={[fst.small, url && fst.smallLink]} onPress={url ? () => open(url) : undefined}>
      {text}
      {url ? " ↗" : ""}
    </Text>
  );
}

export function MonadFlow(p: { watching: string[]; onWatch: (id: string) => void; onHedge: () => void; onHowItWorks: () => void; account: Signer | undefined }) {
  const [market, setMarket] = useState(NOTE_MARKET);
  const f = FAMOUS.find((x) => x.id === market)!;

  const checkFn = useCallback(async () => {
    const r = await fetchSettlementRisk(market);
    return { r, v: await verifyRecord(r) };
  }, [market]);
  const check = useLive<{ r: SettlementRisk; v: Verification }>(checkFn, true);
  const verdictFn = useCallback(() => readMainnetVerdict(market), [market]);
  const verdict = useLive<Verdict>(verdictFn, true);
  const quoteFn = useCallback(() => auroraQuote(10, DEMO_WALLET), []);
  const quote = useLive(quoteFn, true);

  const [held, setHeld] = useState<number | null>(null);
  const [gas, setGas] = useState<bigint | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const refreshWallet = useCallback(() => {
    if (!p.account) {
      setHeld(null);
      setGas(null);
      return;
    }
    heldNotes(p.account.address).then(setHeld).catch(() => setHeld(null));
    testMon(p.account.address).then(setGas).catch(() => setGas(null));
  }, [p.account]);
  useEffect(refreshWallet, [refreshWallet, market, lastTx]);

  const r = check.data?.r;
  const verified = !!check.data?.v.verified;
  const guard = r ? guardDecision(r, "Yes") : null;
  const nansen = NANSEN_EXPOSURE.marketId === market ? NANSEN_EXPOSURE : null;
  const watched = p.watching.includes(market);
  const lowGas = !!p.account && gas !== null && gas < MIN_TEST_MON;

  const signInPasskey = async (): Promise<boolean> => {
    try {
      if (await passkey.storedCredential()) return !!(await passkey.signIn());
      // First time on this phone: use an existing predge.io passkey, or make one.
      const create = await new Promise<boolean | null>((res) =>
        showDialog("Your fingerprint is your wallet", "Use a passkey you already have for predge.io, or create one now. No seed phrase either way.", [
          { text: "Cancel", style: "cancel", onPress: () => res(null) },
          { text: "I have one", onPress: () => res(false) },
          { text: "Create", onPress: () => res(true) },
        ])
      );
      if (create === null) return false;
      return !!(create ? await passkey.createAndSignIn() : await passkey.signIn());
    } catch (e) {
      showDialog("Fingerprint sign-in did not finish", passkey.describeError(e), undefined, { variant: "error" });
      return false;
    }
  };

  const signInWallet = async () => {
    try {
      const s = await signInWithDynamic();
      if (!s) showDialog("Wallet sign-in did not finish", "Try again.", undefined, { variant: "error" });
    } catch (e) {
      showDialog("Wallet sign-in did not finish", passkey.describeError(e), undefined, { variant: "error" });
    }
  };

  const getTestMon = async () => {
    if (!p.account) return;
    await Clipboard.setStringAsync(p.account.address);
    showDialog("Get free test MON", "Fees for test dollars are paid in test MON, which is free. Your address is copied: paste it at the Monad faucet, then come back and tap Insure again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Open faucet", onPress: () => open(FAUCET) },
    ]);
  };

  const buy = async () => {
    const s = signer.current();
    if (!s) return showDialog("Sign in first", "Pick fingerprint, email or wallet in step 5 below. No seed phrase.");
    try {
      if ((await testMon(s.address)) < MIN_TEST_MON) return getTestMon();
      const plan = await planInsure(4);
      showDialog(
        "Insure against a flip?",
        [
          held ? `You already hold ${held.toFixed(1)} notes. This buys ${plan.notes} more.` : "",
          `Buys ${plan.notes} notes at $${plan.askUsd.toFixed(2)} each, about $${plan.costUsd.toFixed(2)}.`,
          `Each note pays $1 if the answer under dispute flips from ${firstProposal(r!) ?? "the proposal"}.`,
          "",
          `Uses test dollars, not real money.${s.kind === "passkey" ? " You confirm with your fingerprint next." : ""}`,
        ]
          .filter((x, i) => i > 0 || x)
          .join("\n"),
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Confirm",
            onPress: async () => {
              if (s.kind === "passkey" && !(await signInPasskey())) return; // fresh fingerprint for every purchase
              const who = signer.current();
              if (!who) return;
              setBusy("Starting...");
              try {
                const hash = await insure(who, plan, setBusy);
                setLastTx(hash);
                haptic.success();
                showDialog("You're insured", `${plan.notes} notes bought. If the answer flips, each pays $1.`, [
                  { text: "Recorded on Monad", onPress: () => open(`${EXPLORER.testnet}/tx/${hash}`) },
                  { text: "OK" },
                ]);
              } catch (e) {
                showDialog("Did not go through", passkey.describeError(e), undefined, { variant: "error" });
              } finally {
                setBusy(null);
              }
            },
          },
        ],
        { variant: "neutral" }
      );
    } catch (e) {
      showDialog("Did not go through", passkey.describeError(e), undefined, { variant: "error" });
    }
  };

  // The one action for this market.
  let act: React.ReactNode = null;
  if (r && guard) {
    if (r.resolved_on_chain) {
      act = <Text style={fst.body}>Final. Nothing left to insure or wait for.</Text>;
    } else if (!guard.allowed && market === NOTE_MARKET) {
      act = (
        <>
          <Text style={fst.body}>Don't buy YES now: it is in dispute. Insure against a flip instead.</Text>
          <View style={{ height: 10 }} />
          {busy ? (
            <LButton title={busy} onPress={() => undefined} disabled stretch />
          ) : held ? (
            <>
              <Text style={fst.big}>You're insured ({held.toFixed(1)} notes).</Text>
              <View style={fst.row}>
                {lastTx ? <Small text="Recorded on Monad" url={`${EXPLORER.testnet}/tx/${lastTx}`} /> : null}
              </View>
              <View style={{ height: 6 }} />
              <LButton small ghost title="BUY MORE" onPress={buy} />
            </>
          ) : lowGas ? (
            <>
              <Text style={fst.small}>Needs a little free test MON for fees first.</Text>
              <View style={{ height: 6 }} />
              <LButton title="GET FREE TEST MON" onPress={getTestMon} stretch />
            </>
          ) : (
            <LButton title="INSURE AGAINST A FLIP" onPress={buy} stretch />
          )}
        </>
      );
    } else if (!guard.allowed && isBtcThreshold(r.market.question)) {
      act = (
        <>
          <Text style={fst.body}>Don't add to it now. Offset the price risk while it settles.</Text>
          <View style={{ height: 10 }} />
          <LButton title="HEDGE WITH A BTC SHORT" onPress={p.onHedge} stretch />
        </>
      );
    } else if (!guard.allowed) {
      act = (
        <>
          <Text style={fst.body}>Wait. Don't trade it until it settles.</Text>
          <View style={{ height: 10 }} />
          <LButton title={watched ? "WATCHING: WE'LL ALERT YOU" : "ALERT ME WHEN IT SETTLES"} onPress={() => p.onWatch(market)} disabled={watched} stretch />
        </>
      );
    } else {
      act = (
        <>
          <Text style={fst.body}>Clear. No dispute is holding it up.</Text>
          <View style={{ height: 10 }} />
          <LButton title={watched ? "WATCHING" : "WATCH IT"} onPress={() => p.onWatch(market)} disabled={watched} stretch />
        </>
      );
    }
  }

  return (
    <View>
      <View style={[fst.card, { marginTop: 16 }]}>
        <Text style={fst.hero}>A third of disputed Polymarket markets settle differently than proposed.</Text>
        <View style={fst.chips}>
          {FAMOUS.map((x) => (
            <Pressable key={x.id} onPress={() => setMarket(x.id)} style={[fst.chip, market === x.id && fst.chipOn]} accessibilityRole="button" accessibilityLabel={x.name}>
              <Text style={[fst.chipText, market === x.id && { color: "#fff" }]}>{x.name}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Step n={1} title="Check">
        <Text style={fst.market}>{r?.market.question ?? f.name}</Text>
        <Text style={fst.big}>{r ? stateLine(r) : check.busy ? "Checking..." : check.err ? "Could not check it right now." : " "}</Text>
        <View style={fst.row}>
          {r ? <Text style={fst.ok}>{verified ? "Verified ✓" : "Not verified"}</Text> : null}
          {verdict.data && verdict.data.state !== "none" ? <Small text={verdict.data.state === "pending" ? "Waiting on Monad" : "Recorded on Monad"} url={verdict.data.txUrl} /> : null}
        </View>
      </Step>

      <Step n={2} title="Who's exposed">
        {nansen ? (
          <>
            <Text style={fst.body}>
              {usd0(nansen.contestedCostUsd)} is riding on {nansen.contestedOutcome}, the answer under dispute. {usd0(nansen.otherCostUsd)} on Yes.
            </Text>
            <Small text="Top 50 holders, Nansen, 12 Oct" url={`${EXPLORER.mainnet}/tx/${nansen.payments[0].tx}`} />
          </>
        ) : (
          <Text style={fst.body}>{r?.resolved_on_chain ? "Settled, so no one is exposed any more." : "No holder data saved for this market."}</Text>
        )}
      </Step>

      <Step n={3} title="Act">
        {act ?? <Text style={fst.body}>{check.busy ? "..." : " "}</Text>}
      </Step>

      <Step n={4} title="Add money">
        <Text style={fst.body}>
          {quote.data ? `$${Number(quote.data.amountIn).toFixed(0)} in USDC from Base arrives as $${Number(quote.data.amountOut).toFixed(2)} in about ${quote.data.etaSeconds} s.` : quote.err ? "Quote not available right now." : "Getting a quote..."}
        </Text>
        <View style={fst.row}>
          <Small text="Delivered on Monad" url={AURORA.deliveryTx} />
          <Small text="Data paid per call" url={AURORA.x402Tx} />
        </View>
      </Step>

      <Step n={5} title="Your key">
        {p.account ? (
          <>
            <Text style={fst.body}>Signed in with your {kindLabel(p.account.kind)}. No seed phrase, nothing to write down.</Text>
            <LButton small ghost title="SIGN OUT" onPress={() => void p.account?.signOut()} />
          </>
        ) : (
          <>
            <Text style={fst.body}>Your fingerprint, email or wallet is your account. No seed phrase.</Text>
            <View style={{ height: 10 }} />
            <LButton title="FINGERPRINT" onPress={() => void signInPasskey()} stretch />
            <View style={{ height: 8 }} />
            <LButton title="EMAIL" ghost onPress={() => setEmailOpen((o) => !o)} stretch />
            {emailOpen ? (
              <View style={{ marginTop: 8 }}>
                <PrivyEmailLogin onDone={() => setEmailOpen(false)} />
              </View>
            ) : null}
            <View style={{ height: 8 }} />
            <LButton title="WALLET" ghost onPress={() => void signInWallet()} stretch />
          </>
        )}
      </Step>

      <View style={[fst.card, { marginTop: 14 }]}>
        <Text style={fst.kicker}>ONLY POSSIBLE ON MONAD</Text>
        <Text style={fst.body}>
          A verdict lands on Monad 1 to 2 seconds after it is requested when sent one at a time, and 8 seconds (median) in a 34-market batch. A request plus its verdict costs about 0.046 MON, around $0.001. Fast and cheap enough to check every disputed market, every time.
        </Text>
        <Small text={`${MEASURED.verdicts} verdicts we measured on Monad mainnet, 12 to 13 Oct`} />
      </View>

      <View style={{ height: 14 }} />
      <LButton title="HOW IT WORKS: 9 INTEGRATIONS" ghost onPress={p.onHowItWorks} stretch />

      <View style={[fst.card, { marginTop: 14 }]}>
        <Text style={fst.kicker}>HOW TO TRY IT (2 MIN)</Text>
        {[
          "Sign in (step 5): fingerprint, email or wallet.",
          "A new wallet needs a little free test MON for fees: tap Get free test MON, paste the copied address at the Monad faucet, come back.",
          "Pick Trump \"Ammunition\" and tap Insure against a flip. Confirm. Test dollars only.",
          "See \"You're insured\" and the Recorded on Monad link.",
          "Tap How it works: 9 integrations.",
        ].map((x, i) => (
          <Text key={i} style={[fst.body, { marginTop: 6 }]}>
            {i + 1}. {x}
          </Text>
        ))}
      </View>
    </View>
  );
}

const fst = StyleSheet.create({
  card: { backgroundColor: L.card, borderWidth: 2, borderColor: L.line, padding: 16 },
  hero: { color: L.ink, fontSize: 22, lineHeight: 30, fontWeight: "800" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  chip: { paddingVertical: 8, paddingHorizontal: 10, backgroundColor: L.card, borderWidth: 2, borderColor: L.line },
  chipOn: { backgroundColor: L.accent, borderColor: L.accent },
  chipText: { color: L.ink, fontSize: 13, fontWeight: "600" },
  step: { backgroundColor: L.card, borderWidth: 2, borderColor: L.line, borderLeftWidth: 4, borderLeftColor: L.accent, padding: 14, marginTop: 10 },
  stepHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  stepNum: { color: "#fff", backgroundColor: L.accent, fontFamily: PX, fontSize: 9, lineHeight: 14, paddingHorizontal: 6, paddingVertical: 3 },
  stepTitle: { color: L.accentInk, fontFamily: PX, fontSize: 9, lineHeight: 14 },
  market: { color: L.dim, fontSize: 13, lineHeight: 18 },
  big: { color: L.ink, fontSize: 19, lineHeight: 26, fontWeight: "800", marginTop: 4 },
  body: { color: L.ink, fontSize: 15, lineHeight: 22 },
  ok: { color: L.ink, fontSize: 14, fontWeight: "700" },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 16, marginTop: 6 },
  small: { color: L.dim, fontSize: 12, lineHeight: 18, marginTop: 6 },
  smallLink: { color: L.accentInk, fontWeight: "600" },
  kicker: { color: L.accentInk, fontFamily: PX, fontSize: 8, lineHeight: 13, marginBottom: 8 },
});
