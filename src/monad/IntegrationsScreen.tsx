// Monad edition: the home hero and the Integrations screen. One card per sponsor, each with one live,
// read-only action and a link to proof. Light look, one accent colour (Monad purple).
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Text } from "../Text";
import { PX } from "../theme";
import * as haptic from "../haptic";
import { fetchSettlementRisk, type SettlementRisk } from "../api";
import { verifyRecord, type Verification } from "../verify";
import { btcMarket, snapshot } from "./chain";
import { EXPLORER } from "./networks";
import {
  ago,
  AURORA,
  auroraQuote,
  CRE,
  DEMO_WALLET,
  FACTS,
  FAMOUS,
  GUARD_WEB,
  guardDecision,
  KURU,
  NANSEN_EXPOSURE,
  readCre,
  readKuruBook,
  readMainnetVerdict,
  REPO,
  shortHex,
  usd0,
  verdictWords,
  type GuardResult,
  type Verdict,
} from "./integrations";
import { MAINNET_VALIDATOR_CONTRACT } from "./mainnetVerdicts";

export const L = {
  bg: "#f6f5fb",
  card: "#ffffff",
  line: "#e2def0",
  ink: "#16132a",
  dim: "#625e7a",
  accent: "#836ef9",
  accentInk: "#5b45e0",
  accentSoft: "#efecfe",
};

const open = (url: string) => {
  haptic.tap();
  Linking.openURL(url).catch(() => undefined);
};

/** A live read with its own busy, result and error state. */
export function useLive<T>(fn: () => Promise<T>, auto: boolean) {
  const [state, setState] = useState<{ busy: boolean; data: T | null; err: string | null; at: number | null }>({ busy: false, data: null, err: null, at: null });
  const run = useCallback(async () => {
    setState((s) => ({ ...s, busy: true, err: null }));
    try {
      const data = await fn();
      setState({ busy: false, data, err: null, at: Date.now() });
    } catch (e) {
      const m = (e as any)?.shortMessage ?? (e as Error)?.message ?? String(e);
      setState((s) => ({ ...s, busy: false, err: String(m).slice(0, 160) }));
    }
  }, [fn]);
  useEffect(() => {
    if (auto) void run();
  }, [auto, run]);
  return { ...state, run };
}

export function LButton({ title, onPress, ghost, disabled, small, stretch }: { title: string; onPress: () => void; ghost?: boolean; disabled?: boolean; small?: boolean; stretch?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        haptic.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        lst.btn,
        ghost ? lst.btnGhost : lst.btnSolid,
        small && { paddingVertical: 8, paddingHorizontal: 10 },
        stretch && { alignSelf: "stretch" },
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.8 },
      ]}
    >
      <Text style={[lst.btnText, ghost && { color: L.accentInk }, small && { fontSize: 9 }]}>{title}</Text>
    </Pressable>
  );
}

function Link({ label, url }: { label: string; url: string }) {
  return (
    <Text style={lst.link} onPress={() => open(url)} accessibilityRole="link">
      {label} ↗
    </Text>
  );
}

function Card(props: { kicker: string; title: string; children: React.ReactNode; proof: { label: string; url: string }[] }) {
  return (
    <View style={lst.card}>
      <Text style={lst.kicker}>{props.kicker}</Text>
      <Text style={lst.title}>{props.title}</Text>
      {props.children}
      <View style={lst.proofRow}>
        {props.proof.map((p) => (
          <Link key={p.url} label={p.label} url={p.url} />
        ))}
      </View>
    </View>
  );
}

function Result({ big, lines, busy, err }: { big?: string | null; lines?: (string | null | false | undefined)[]; busy: boolean; err: string | null }) {
  return (
    <View style={lst.result}>
      {busy && !big ? <ActivityIndicator color={L.accent} /> : null}
      {big ? <Text style={lst.big}>{big}</Text> : null}
      {(lines ?? []).filter(Boolean).map((l, i) => (
        <Text key={i} style={lst.line}>
          {l as string}
        </Text>
      ))}
      {err ? <Text style={[lst.line, { color: L.accentInk }]}>Could not read it just now: {err}</Text> : null}
    </View>
  );
}

const firstClause = (s: string) => s.replace(/^(resolved|ok|watch|caution):\s*/, "").split(/;|\.(?:\s|$)/)[0];

// ---------------------------------------------------------------------------

/** First screen of the Monad edition: one sentence, one famous example, read live from Monad mainnet. */
export function MonadHero({ onOpen }: { onOpen: () => void }) {
  const fetchIran = useCallback(() => readMainnetVerdict("2241873"), []);
  const v = useLive(fetchIran, true);
  return (
    <View style={[lst.card, { marginTop: 16, paddingVertical: 20 }]}>
      <Text style={lst.kicker}>POLYMARKET SETTLEMENT, CHECKED ON MONAD</Text>
      <Text style={lst.hero}>A third of disputed Polymarket markets settle differently than proposed.</Text>
      <Pressable onPress={() => v.data && open(v.data.txUrl)} style={lst.example} accessibilityRole="link">
        <Text style={lst.exName}>Iran, $15M</Text>
        <Text style={lst.exStory}>Proposed YES. Settled NO.</Text>
        <Text style={lst.exChain}>
          {v.busy && !v.data ? "Reading Monad mainnet..." : v.data ? `Verdict on Monad mainnet: ${v.data.response ?? "-"} · read live ↗` : v.err ? "Monad mainnet not reachable right now" : " "}
        </Text>
      </Pressable>
      <View style={{ height: 14 }} />
      <LButton title="SEE IT LIVE: 9 INTEGRATIONS" onPress={onOpen} />
      <Text style={lst.fine}>
        {FACTS.settledDifferently} of {FACTS.settled} settled disputed markets, {FACTS.period}. {FACTS.verdicts} verdicts and {FACTS.openRequests} open requests on Monad mainnet.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------

function GuardCard({ market, auto }: { market: string; auto: boolean }) {
  const fn = useCallback(async () => {
    const r = await fetchSettlementRisk(market);
    const v = await verifyRecord(r);
    return { r, v };
  }, [market]);
  const s = useLive<{ r: SettlementRisk; v: Verification }>(fn, auto);
  const d = s.data;
  return (
    <Card kicker="PREDGE GUARD" title="Signed settlement risk, verified on this phone" proof={[{ label: "guard.predge.io", url: GUARD_WEB }]}>
      <Result
        busy={s.busy}
        err={s.err}
        big={d ? `${d.r.risk_level.toUpperCase()}${d.v.verified ? " · VERIFIED" : " · NOT VERIFIED"}` : null}
        lines={d ? [d.r.market.question, firstClause(d.r.recommendation), `${d.v.checks.filter((c) => c.ok).length}/${d.v.checks.length} checks passed on this phone (ed25519, pinned key)`] : []}
      />
      <LButton small title={s.busy ? "CHECKING..." : "FETCH AND VERIFY"} onPress={s.run} disabled={s.busy} />
    </Card>
  );
}

function VerdictCard({ market, auto }: { market: string; auto: boolean }) {
  const fn = useCallback(() => readMainnetVerdict(market, { bind: true }), [market]);
  const s = useLive<Verdict>(fn, auto);
  const d = s.data;
  return (
    <Card
      kicker="MONAD MAINNET · PREDGEAGENTVALIDATOR"
      title="The verdict, read from chain"
      proof={[
        ...(d ? [{ label: "Transaction", url: d.txUrl }] : []),
        { label: `Contract ${shortHex(MAINNET_VALIDATOR_CONTRACT, 4)}`, url: `${EXPLORER.mainnet}/address/${MAINNET_VALIDATOR_CONTRACT}` },
      ]}
    >
      <Result
        busy={s.busy}
        err={s.err}
        big={d ? verdictWords(d) : null}
        lines={
          d
            ? [
                d.state === "verdict" ? `Bound to the signed record: ${d.bound ? "yes (keccak256 + ed25519 checked here)" : d.bound === false ? "no" : "not checked"}` : null,
                d.tag ? `Tag ${d.tag}` : null,
                d.lastUpdate ? `Updated ${ago(d.lastUpdate)} · request ${shortHex(d.requestHash, 4)}` : null,
                `${FACTS.verdicts} verdicts and ${FACTS.openRequests} open requests on Monad mainnet.`,
              ]
            : []
        }
      />
      <LButton small title={s.busy ? "READING..." : "READ getValidationStatus"} onPress={s.run} disabled={s.busy} />
    </Card>
  );
}

function MetaMaskCard({ auto }: { auto: boolean }) {
  const fn = useCallback(async () => {
    const r = await fetchSettlementRisk("5219930");
    const v = await verifyRecord(r);
    if (!v.verified) return { allowed: false, reason: "the signed record did not verify on this phone", action: "buy Yes" } as GuardResult;
    return guardDecision(r, "Yes");
  }, []);
  const s = useLive<GuardResult>(fn, auto);
  const d = s.data;
  return (
    <Card kicker="METAMASK AGENT PLUGIN" title="An agent asks before it buys" proof={[{ label: "mm-plugin on GitHub", url: `${REPO}/tree/main/mm-plugin` }]}>
      <Text style={lst.line}>`mm predge guard 5219930 --side YES` on Trump "Ammunition", the same rule run here.</Text>
      <Result busy={s.busy} err={s.err} big={d ? `${d.allowed ? "ALLOWED" : "REFUSED"} to ${d.action.toUpperCase()}` : null} lines={d ? [`Because ${firstClause(d.reason)}.`] : []} />
      <LButton small title={s.busy ? "ASKING..." : "ASK THE GUARD"} onPress={s.run} disabled={s.busy} />
    </Card>
  );
}

function NansenCard() {
  const n = NANSEN_EXPOSURE;
  const pay = n.payments[0];
  return (
    <Card
      kicker="NANSEN · PAID WITH x402 ON MONAD"
      title="Who holds the contested side"
      proof={[
        { label: "x402 payment", url: `${EXPLORER.mainnet}/tx/${pay.tx}` },
        { label: "Code", url: `${REPO}/tree/main/nansen` },
      ]}
    >
      <Result
        busy={false}
        err={null}
        big={n.decision.toUpperCase()}
        lines={[
          `${n.question}`,
          `Top 50 holders' cost on ${n.contestedOutcome} (disputed): ${usd0(n.contestedCostUsd)} vs Yes: ${usd0(n.otherCostUsd)}.`,
          "As of 12 Oct 21:10 UTC. Saved result of a paid Nansen call, not live.",
        ]}
      />
      <LButton small title="OPEN THE x402 PAYMENT" onPress={() => open(`${EXPLORER.mainnet}/tx/${pay.tx}`)} />
    </Card>
  );
}

function KuruCard({ auto }: { auto: boolean }) {
  const s = useLive(readKuruBook, auto);
  const d = s.data;
  return (
    <Card
      kicker="KURU · MONAD TESTNET"
      title="Trade the dispute itself"
      proof={[
        { label: "Order book", url: `${EXPLORER.testnet}/address/${KURU.book}` },
        { label: "Code", url: `${REPO}/tree/main/kuru` },
      ]}
    >
      <Text style={lst.line}>HOLD pays if the disputed proposal stands, CHANGE pays if it flips. CHANGE trades on a Kuru order book.</Text>
      <Result
        busy={s.busy}
        err={s.err}
        big={d ? `BID ${d.bid.toFixed(2)} · ASK ${d.ask.toFixed(2)}` : null}
        lines={d ? [`${d.changeSymbol} in test USD, best bid and ask read live.`, `Notes minted: ${d.holdSupply} HOLD, ${d.changeSupply} CHANGE.`] : []}
      />
      <LButton small title={s.busy ? "READING..." : "READ THE BOOK"} onPress={s.run} disabled={s.busy} />
    </Card>
  );
}

function AuroraCard({ auto }: { auto: boolean }) {
  const fn = useCallback(() => auroraQuote(10, DEMO_WALLET), []);
  const s = useLive(fn, auto);
  const d = s.data;
  return (
    <Card
      kicker="AURORA · INTENTS"
      title="Fund the Monad wallet from Base"
      proof={[
        { label: "Delivery on Monad", url: AURORA.deliveryTx },
        { label: "x402 payment", url: AURORA.x402Tx },
      ]}
    >
      <Result
        busy={s.busy}
        err={s.err}
        big={d ? `${d.amountIn} USDC → ${Number(d.amountOut).toFixed(2)} USDC` : null}
        lines={d ? [`Base to Monad, about ${d.etaSeconds} s. Quote only: no deposit address, nothing moves.`] : []}
      />
      <LButton small title={s.busy ? "QUOTING..." : "GET A LIVE QUOTE"} onPress={s.run} disabled={s.busy} />
    </Card>
  );
}

function PerplCard({ auto, onWallet }: { auto: boolean; onWallet: () => void }) {
  const fn = useCallback(async () => {
    const [snap, m] = await Promise.all([snapshot(DEMO_WALLET), btcMarket()]);
    return { snap, mark: Number(m.markPNS) / 10 ** m.priceDecimals };
  }, []);
  const s = useLive(fn, auto);
  const d = s.data;
  return (
    <Card
      kicker="PERPL + AGORA · MONAD TESTNET"
      title="Hedge on Perpl, margin in AUSD"
      proof={[
        { label: "Passkey wallet", url: `${EXPLORER.testnet}/address/${DEMO_WALLET}` },
        { label: "Perpl", url: "https://perpl.xyz" },
      ]}
    >
      <Result
        busy={s.busy}
        err={s.err}
        big={d ? `PERPL ACCOUNT ${d.snap.perplAccountId}` : null}
        lines={
          d
            ? [
                `Margin ${(Number(d.snap.perplBalance) / 1e6).toFixed(2)} AUSD · wallet ${(Number(d.snap.ausd) / 1e6).toLocaleString("en-US")} AUSD`,
                `BTC mark $${d.mark.toLocaleString("en-US", { maximumFractionDigits: 1 })}. Wallet ${shortHex(DEMO_WALLET, 4)} comes from a mera passkey.`,
              ]
            : []
        }
      />
      <View style={lst.btnRow}>
        <LButton small title={s.busy ? "READING..." : "READ THE ACCOUNT"} onPress={s.run} disabled={s.busy} />
        <LButton small ghost title="MY WALLET" onPress={onWallet} />
      </View>
    </Card>
  );
}

function CreCard({ auto }: { auto: boolean }) {
  const s = useLive(readCre, auto);
  const d = s.data;
  return (
    <Card
      kicker="CHAINLINK CRE · MONAD TESTNET"
      title="A workflow writes the check on chain"
      proof={[
        { label: "Workflow", url: CRE.workflow },
        { label: "Report tx", url: CRE.reportTx },
      ]}
    >
      <Result
        busy={s.busy}
        err={s.err}
        big={d ? `safeToAct = ${d.safeToAct}` : null}
        lines={d ? [`Market ${d.marketId}: ${d.riskLevel}, open dispute ${d.openDispute ? "yes" : "no"}. Report ${ago(d.updatedAt)}.`, `PredgeSettlementWatch ${shortHex(CRE.consumer, 4)}`] : []}
      />
      <LButton small title={s.busy ? "READING..." : "READ safeToAct"} onPress={s.run} disabled={s.busy} />
    </Card>
  );
}

function WebCard() {
  return (
    <Card kicker="PRIVY · DYNAMIC" title="Sign in on the web" proof={[{ label: "guard.predge.io", url: GUARD_WEB }]}>
      <Text style={lst.line}>Predge Guard on the web signs you in with Privy or Dynamic. This app uses a passkey instead.</Text>
      <View style={{ height: 10 }} />
      <LButton small title="OPEN PREDGE GUARD" onPress={() => open(GUARD_WEB)} />
    </Card>
  );
}

export function IntegrationsModal({ visible, onClose, onWallet }: { visible: boolean; onClose: () => void; onWallet: () => void }) {
  const [market, setMarket] = useState(FAMOUS[0].id);
  return (
    <Modal visible={visible} statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: L.bg }}>
        {visible ? <StatusBar style="dark" /> : null}
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 48, paddingBottom: 56 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <LButton small ghost title="BACK" onPress={onClose} />
            <Text style={lst.kicker}>LIVE ON MONAD</Text>
          </View>
          <Text style={[lst.hero, { fontSize: 24, lineHeight: 31 }]}>Integrations</Text>
          <Text style={lst.line}>
            {FACTS.disputes} disputes on {FACTS.markets} Polymarket markets ({FACTS.period}). {FACTS.settledDifferently} of {FACTS.settled} settled differently ({FACTS.share}). At least {FACTS.traded} traded on them.
          </Text>
          <Text style={[lst.label, { marginTop: 16 }]}>MARKET</Text>
          <View style={lst.chips}>
            {FAMOUS.map((f) => (
              <Pressable key={f.id} onPress={() => setMarket(f.id)} style={[lst.chip, market === f.id && lst.chipOn]} accessibilityRole="button" accessibilityLabel={f.name}>
                <Text style={[lst.chipText, market === f.id && { color: "#fff" }]}>{f.name}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={lst.fine}>{(() => {
            const f = FAMOUS.find((x) => x.id === market)!;
            return `${f.name}${f.size ? `, ${f.size}` : ""}: ${f.story}. Market ${f.id}.`;
          })()}</Text>
          <GuardCard market={market} auto={visible} />
          <VerdictCard market={market} auto={visible} />
          <MetaMaskCard auto={visible} />
          <NansenCard />
          <KuruCard auto={visible} />
          <AuroraCard auto={visible} />
          <PerplCard auto={visible} onWallet={onWallet} />
          <CreCard auto={visible} />
          <WebCard />
          <Text style={[lst.fine, { marginTop: 18 }]}>
            Every card reads live except Nansen. Nothing on this screen signs or sends a transaction. risk_level and verdicts are Predge's reading of chain facts, not advice.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const lst = StyleSheet.create({
  card: { backgroundColor: L.card, borderWidth: 2, borderColor: L.line, padding: 16, marginTop: 14 },
  kicker: { color: L.accentInk, fontFamily: PX, fontSize: 8, lineHeight: 13 },
  title: { color: L.ink, fontSize: 17, lineHeight: 23, fontWeight: "700", marginTop: 8 },
  hero: { color: L.ink, fontSize: 22, lineHeight: 30, fontWeight: "800", marginTop: 12 },
  example: { marginTop: 14, padding: 14, backgroundColor: L.accentSoft, borderLeftWidth: 4, borderLeftColor: L.accent },
  exName: { color: L.ink, fontSize: 18, lineHeight: 24, fontWeight: "800" },
  exStory: { color: L.ink, fontSize: 16, lineHeight: 22, marginTop: 2 },
  exChain: { color: L.accentInk, fontSize: 13, lineHeight: 19, marginTop: 8, fontWeight: "600" },
  result: { marginVertical: 10, minHeight: 28, justifyContent: "center" },
  big: { color: L.ink, fontSize: 18, lineHeight: 24, fontWeight: "800" },
  line: { color: L.dim, fontSize: 13, lineHeight: 19, marginTop: 4 },
  fine: { color: L.dim, fontSize: 12, lineHeight: 17, marginTop: 10 },
  label: { color: L.dim, fontFamily: PX, fontSize: 8, lineHeight: 12 },
  link: { color: L.accentInk, fontSize: 13, lineHeight: 19, fontWeight: "600", paddingVertical: 4 },
  proofRow: { flexDirection: "row", flexWrap: "wrap", columnGap: 16, marginTop: 10, borderTopWidth: 1, borderTopColor: L.line, paddingTop: 6 },
  btn: { paddingVertical: 12, paddingHorizontal: 14, alignItems: "center", alignSelf: "flex-start" },
  btnSolid: { backgroundColor: L.accent },
  btnGhost: { backgroundColor: L.accentSoft },
  btnText: { color: "#ffffff", fontFamily: PX, fontSize: 10, lineHeight: 15 },
  btnRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 10, backgroundColor: L.card, borderWidth: 2, borderColor: L.line },
  chipOn: { backgroundColor: L.accent, borderColor: L.accent },
  chipText: { color: L.ink, fontSize: 13, fontWeight: "600" },
});
