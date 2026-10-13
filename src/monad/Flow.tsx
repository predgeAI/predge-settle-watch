// Monad edition home: one market, one flow. Check -> who is exposed -> act in one tap -> fund -> passkey.
// Plain words on the main path; chain detail sits behind small "Recorded on Monad" links and the
// Integrations screen. Only real actions: reads, adding to the watchlist, and (after a confirm dialog and a
// fingerprint) test-dollar transactions on Kuru from the passkey wallet.
import React, { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import type { LocalAccount } from "viem";
import { Text } from "../Text";
import { PX } from "../theme";
import * as haptic from "../haptic";
import { showDialog } from "../dialog";
import { fetchSettlementRisk, type SettlementRisk } from "../api";
import { verifyRecord, type Verification } from "../verify";
import { AURORA, auroraQuote, DEMO_WALLET, FAMOUS, guardDecision, NANSEN_EXPOSURE, readMainnetVerdict, usd0, type Verdict } from "./integrations";
import { EXPLORER } from "./networks";
import { heldNotes, insure, NOTE_MARKET, planInsure } from "./kuru";
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

export function MonadFlow(p: { watching: string[]; onWatch: (id: string) => void; onHedge: () => void; onHowItWorks: () => void; account: LocalAccount | undefined }) {
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
  const [busy, setBusy] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  useEffect(() => {
    if (p.account && market === NOTE_MARKET) heldNotes(p.account.address).then(setHeld).catch(() => setHeld(null));
    else setHeld(null);
  }, [p.account, market, lastTx]);

  const r = check.data?.r;
  const verified = !!check.data?.v.verified;
  const guard = r ? guardDecision(r, "Yes") : null;
  const nansen = NANSEN_EXPOSURE.marketId === market ? NANSEN_EXPOSURE : null;
  const watched = p.watching.includes(market);

  const signIn = async (): Promise<LocalAccount | null> => {
    try {
      if (await passkey.storedCredential()) return await passkey.signIn();
      // First time on this phone: use an existing predge.io passkey, or make one.
      const create = await new Promise<boolean | null>((res) =>
        showDialog("Your fingerprint is your wallet", "Use a passkey you already have for predge.io, or create one now. No seed phrase either way.", [
          { text: "Cancel", style: "cancel", onPress: () => res(null) },
          { text: "I have one", onPress: () => res(false) },
          { text: "Create", onPress: () => res(true) },
        ])
      );
      if (create === null) return null;
      return create ? await passkey.createAndSignIn() : await passkey.signIn();
    } catch (e) {
      showDialog("Fingerprint sign-in did not finish", passkey.describeError(e), undefined, { variant: "error" });
      return null;
    }
  };

  const doInsure = async () => {
    try {
      const plan = await planInsure(4);
      showDialog(
        "Insure against a flip?",
        [
          `Buys ${plan.notes} notes at $${plan.askUsd.toFixed(2)} each, about $${plan.costUsd.toFixed(2)}.`,
          `Each note pays $1 if the answer under dispute flips from ${firstProposal(r!) ?? "the proposal"}.`,
          "",
          "Uses test dollars, not real money. You confirm with your fingerprint next.",
        ].join("\n"),
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Confirm",
            onPress: async () => {
              const account = await signIn(); // fresh fingerprint for every purchase
              if (!account) return;
              setBusy("Starting...");
              try {
                const hash = await insure(account, plan, setBusy);
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
          <LButton title={busy ?? (held ? `INSURED: ${held.toFixed(1)} NOTES · BUY MORE` : "INSURE AGAINST A FLIP")} onPress={doInsure} disabled={!!busy} stretch />
          {lastTx ? <Small text="Recorded on Monad" url={`${EXPLORER.testnet}/tx/${lastTx}`} /> : null}
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
          <Text style={fst.body}>Signed in with your fingerprint. No seed phrase, nothing to write down.</Text>
        ) : (
          <>
            <Text style={fst.body}>Your fingerprint is your wallet. No seed phrase.</Text>
            <View style={{ height: 10 }} />
            <LButton title="SIGN IN WITH FINGERPRINT" onPress={() => void signIn()} stretch />
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
