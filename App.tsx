import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Clipboard from "expo-clipboard";
import { fetchSettlementRisk, parseMarketInput, type SettlementRisk } from "./src/api";
import { verifyRecord, type Verification } from "./src/verify";
import { EXPLORER_TX, FOREGROUND_POLL_MS, PINNED_KID } from "./src/config";
import {
  loadWallet,
  loadWatchlist,
  saveWallet,
  saveWatchlist,
  snapshotOf,
  type StoredWallet,
  type WatchItem,
} from "./src/store";
import { notify, pollAll, registerBackgroundPolling, setupNotifications } from "./src/watcher";
import { anchorPack, balanceSol, connectWallet, disconnectWallet, memoText, requestDevnetAirdrop } from "./src/wallet";

const C = {
  bg: "#0b0f14",
  card: "#131a22",
  line: "#223040",
  text: "#e6edf3",
  dim: "#8b9bab",
  accent: "#f5a524",
  ok: "#3fb950",
  watch: "#d29922",
  caution: "#f85149",
  resolved: "#58a6ff",
};

const RISK_COLOR: Record<string, string> = { ok: C.ok, watch: C.watch, caution: C.caution, resolved: C.resolved };

const EXAMPLES = [
  { label: "Disputed, open", key: "5186278" },
  { label: "Disputed twice, settled", key: "4585694" },
  { label: "Quiet market", key: "601819" },
];

function short(s: string, n = 4) {
  return s.length > n * 2 + 3 ? `${s.slice(0, n)}...${s.slice(-n)}` : s;
}

function ago(iso?: string) {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function Button(props: { title: string; onPress: () => void; kind?: "primary" | "ghost"; disabled?: boolean; small?: boolean }) {
  const primary = props.kind !== "ghost";
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => [
        styles.btn,
        props.small && styles.btnSmall,
        primary ? styles.btnPrimary : styles.btnGhost,
        (pressed || props.disabled) && { opacity: 0.6 },
      ]}
    >
      <Text style={[styles.btnText, !primary && { color: C.text }, props.small && { fontSize: 13 }]}>{props.title}</Text>
    </Pressable>
  );
}

function RiskBadge({ level }: { level?: string }) {
  const color = RISK_COLOR[level ?? ""] ?? C.dim;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{(level ?? "...").toUpperCase()}</Text>
    </View>
  );
}

function VerifiedBadge({ v }: { v?: Verification }) {
  if (!v) return null;
  return (
    <View style={[styles.badge, { borderColor: v.verified ? C.ok : C.caution }]}>
      <Text style={[styles.badgeText, { color: v.verified ? C.ok : C.caution }]}>
        {v.verified ? "VERIFIED ON DEVICE" : "NOT VERIFIED"}
      </Text>
    </View>
  );
}

export default function App() {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [wallet, setWallet] = useState<StoredWallet | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [tamper, setTamper] = useState<Verification | null>(null);
  const [context, setContext] = useState<SettlementRisk["context"] | null>(null);
  const [bgOk, setBgOk] = useState<boolean | null>(null);
  const pollingRef = useRef(false);
  const detail = items.find((i) => i.key === detailKey) ?? null;

  const persist = useCallback(async (next: WatchItem[]) => {
    setItems(next);
    await saveWatchlist(next);
  }, []);

  const refreshAll = useCallback(async () => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    try {
      const { items: next } = await pollAll();
      setItems(next);
      const withCtx = next.find((i) => i.last?.context);
      if (withCtx?.last?.context) setContext(withCtx.last.context);
    } finally {
      pollingRef.current = false;
    }
  }, []);

  const refreshBalance = useCallback(async (w: StoredWallet | null) => {
    if (!w) return setBalance(null);
    try {
      setBalance(await balanceSol(w.address));
    } catch {
      setBalance(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setItems(await loadWatchlist());
      const w = await loadWallet();
      setWallet(w);
      refreshBalance(w);
      await setupNotifications();
      setBgOk(await registerBackgroundPolling());
      await refreshAll();
    })();
  }, [refreshAll, refreshBalance]);

  // Foreground polling every minute while the app is open.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = setInterval(refreshAll, FOREGROUND_POLL_MS);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        refreshAll();
        if (!timer) timer = setInterval(refreshAll, FOREGROUND_POLL_MS);
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    });
    return () => {
      if (timer) clearInterval(timer);
      sub.remove();
    };
  }, [refreshAll]);

  const addMarket = useCallback(
    async (raw: string) => {
      const key = parseMarketInput(raw);
      if (!key) return Alert.alert("Not a market", "Paste a Polymarket link, a market slug, a numeric market id or a 0x condition id.");
      if (items.some((i) => i.key === key || i.marketId === key)) return Alert.alert("Already watching", key);
      setBusy("add");
      try {
        const r = await fetchSettlementRisk(key);
        if (items.some((i) => i.marketId === r.market.market_id)) return Alert.alert("Already watching", r.market.question);
        const v = await verifyRecord(r);
        const now = new Date().toISOString();
        const item: WatchItem = {
          key,
          marketId: r.market.market_id,
          question: r.market.question,
          slug: r.market.slug,
          addedAt: now,
          snapshot: snapshotOf(r),
          last: r,
          verification: v,
          lastPolledAt: now,
          timeline: [{ at: now, text: `Watching. ${r.recommendation}`, verified: v.verified }],
          anchors: [],
        };
        if (r.context) setContext(r.context);
        await persist([item, ...(await loadWatchlist())]);
        setInput("");
      } catch (e) {
        Alert.alert("Could not add market", (e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [items, persist]
  );

  const removeMarket = useCallback(
    async (key: string) => {
      setDetailKey(null);
      const next = (await loadWatchlist()).filter((i) => i.key !== key);
      await persist(next);
    },
    [persist]
  );

  const onConnect = useCallback(async () => {
    setBusy("wallet");
    try {
      const w = await connectWallet(wallet);
      setWallet(w);
      await saveWallet(w);
      refreshBalance(w);
    } catch (e) {
      Alert.alert(
        "Wallet",
        `Could not connect: ${(e as Error).message}\n\nInstall a Mobile Wallet Adapter wallet (Seed Vault on Seeker, Phantom or Solflare) and set it to devnet.`
      );
    } finally {
      setBusy(null);
    }
  }, [wallet, refreshBalance]);

  const onDisconnect = useCallback(async () => {
    await disconnectWallet(wallet);
    setWallet(null);
    setBalance(null);
    await saveWallet(null);
  }, [wallet]);

  const onAirdrop = useCallback(async () => {
    if (!wallet) return;
    setBusy("airdrop");
    try {
      await requestDevnetAirdrop(wallet.address);
      await refreshBalance(wallet);
    } catch (e) {
      await Clipboard.setStringAsync(wallet.address);
      Alert.alert("Devnet faucet", `Airdrop failed (${(e as Error).message}). Your address is copied: paste it at faucet.solana.com.`);
    } finally {
      setBusy(null);
    }
  }, [wallet, refreshBalance]);

  const onAnchor = useCallback(
    async (item: WatchItem, action: "watch" | "acknowledge") => {
      if (!wallet) return Alert.alert("Connect a wallet first", "Anchoring writes a devnet memo signed by your wallet.");
      const v = item.verification;
      const last = item.last;
      if (!v?.verified || !v.packHash || !last) {
        return Alert.alert("Not verified", "Only a pack that verified on this device can be anchored.");
      }
      const packHash = v.packHash;
      setBusy(`anchor:${item.key}`);
      try {
        const { signature, wallet: w } = await anchorPack(wallet, {
          action,
          marketId: last.market.market_id,
          riskLevel: last.risk_level,
          packHash,
        });
        setWallet(w);
        await saveWallet(w);
        const now = new Date().toISOString();
        const list = await loadWatchlist();
        const next = list.map((i) =>
          i.key === item.key
            ? {
                ...i,
                anchors: [{ signature, packHash, action, riskLevel: last.risk_level, at: now }, ...i.anchors],
                timeline: [{ at: now, text: `Receipt anchored on Solana devnet (${action})`, verified: true }, ...i.timeline],
              }
            : i
        );
        await persist(next);
        refreshBalance(w);
        Alert.alert("Anchored on Solana devnet", `Memo tx ${short(signature, 6)}`, [
          { text: "Open explorer", onPress: () => Linking.openURL(EXPLORER_TX(signature)) },
          { text: "OK" },
        ]);
      } catch (e) {
        Alert.alert("Anchor failed", `${(e as Error).message}\n\nOn devnet the wallet needs a little SOL for the fee: tap "Devnet SOL".`);
      } finally {
        setBusy(null);
      }
    },
    [wallet, persist, refreshBalance]
  );

  const onTestAlert = useCallback(async () => {
    const it = items[0];
    await notify(
      `[TEST] ${it?.question ?? "Settle Watch"}`.slice(0, 120),
      "Test notification. Real alerts fire when a watched market gets a UMA dispute, a bulletin-board update or settles on chain.",
      { test: true }
    );
  }, [items]);

  const onTamperTest = useCallback(async (item: WatchItem) => {
    if (!item.last) return;
    setTamper(await verifyRecord(item.last, { tamper: true }));
  }, []);

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    await refreshBalance(wallet);
    setRefreshing(false);
  }, [refreshAll, refreshBalance, wallet]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={C.accent} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Settle Watch</Text>
          <Text style={styles.subtitle}>Settlement alerts for Polymarket, verified on your phone</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Wallet (Solana devnet)</Text>
            {busy === "wallet" || busy === "airdrop" ? <ActivityIndicator color={C.accent} /> : null}
          </View>
          {wallet ? (
            <>
              <Pressable onPress={() => Clipboard.setStringAsync(wallet.address)}>
                <Text style={styles.mono}>{short(wallet.address, 8)}</Text>
              </Pressable>
              <Text style={styles.dim}>
                {wallet.label ? `${wallet.label} . ` : ""}
                {balance === null ? "balance unknown" : `${balance.toFixed(4)} SOL`}
              </Text>
              <View style={styles.row}>
                <Button small title="Devnet SOL" onPress={onAirdrop} disabled={!!busy} />
                <Button small kind="ghost" title="Disconnect" onPress={onDisconnect} />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.dim}>Connect through Mobile Wallet Adapter to anchor receipts of verified packs on Solana.</Text>
              <View style={styles.row}>
                <Button title="Connect wallet" onPress={onConnect} disabled={!!busy} />
              </View>
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Watch a market</Text>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Polymarket link, slug or market id"
            placeholderTextColor={C.dim}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={() => addMarket(input)}
          />
          <View style={styles.row}>
            <Button title={busy === "add" ? "Checking..." : "Add to watchlist"} onPress={() => addMarket(input)} disabled={!!busy} />
          </View>
          <Text style={[styles.dim, { marginTop: 8 }]}>Examples</Text>
          <View style={styles.rowWrap}>
            {EXAMPLES.map((e) => (
              <Button key={e.key} small kind="ghost" title={e.label} onPress={() => addMarket(e.key)} disabled={!!busy} />
            ))}
          </View>
        </View>

        <Text style={styles.section}>Watchlist ({items.length})</Text>
        <Text style={styles.dim}>
          {bgOk === false ? "Background checks are off on this device." : bgOk ? "Checked every minute while open, about every 15 min in background." : ""}
        </Text>
        {items.length === 0 ? <Text style={styles.dim}>Nothing watched yet. Add a market above.</Text> : null}
        {items.map((it) => (
          <Pressable
            key={it.key}
            onPress={() => {
              setTamper(null);
              setDetailKey(it.key);
            }}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
          >
            <View style={styles.rowWrap}>
              <RiskBadge level={it.last?.risk_level} />
              <VerifiedBadge v={it.verification} />
              {it.anchors.length ? (
                <View style={[styles.badge, { borderColor: C.accent }]}>
                  <Text style={[styles.badgeText, { color: C.accent }]}>ANCHORED x{it.anchors.length}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.question}>{it.question ?? it.key}</Text>
            {it.snapshot ? (
              <Text style={styles.dim}>
                UMA {it.snapshot.uma_state} . disputes {it.snapshot.dispute_count}
                {it.snapshot.open_dispute ? " (open)" : ""}
                {it.snapshot.sent_to_uma_vote ? " . UMA vote" : ""} . bulletin updates {it.snapshot.bulletin_board_count}
              </Text>
            ) : null}
            <Text style={styles.dim}>
              checked {ago(it.lastPolledAt)}
              {it.lastError ? ` . error: ${it.lastError}` : ""}
            </Text>
          </Pressable>
        ))}

        <View style={styles.row}>
          <Button small kind="ghost" title="Check now" onPress={refreshAll} />
          <Button small kind="ghost" title="Send test alert" onPress={onTestAlert} />
        </View>

        {context ? (
          <View style={[styles.card, { marginTop: 16 }]}>
            <Text style={styles.cardTitle}>Why this matters</Text>
            <Text style={styles.body}>
              {String(context.period)}: {String(context.disputes)} UMA disputes on {String(context.disputed_markets)} Polymarket
              markets. Of {String(context.settled_disputed_markets)} disputed markets that settled,{" "}
              {String(context.settled_differently_from_disputed_proposal)} ({String(context.settled_differently_share)}) settled
              differently from the disputed proposal.
            </Text>
            <Text style={[styles.dim, { marginTop: 6 }]}>Source: {String(context.source)}</Text>
          </View>
        ) : null}

        <Text style={[styles.dim, { marginTop: 16, textAlign: "center" }]}>
          Data: Predge API (api.predge.io), ed25519 signed, key {PINNED_KID}. Not advice.
        </Text>
      </ScrollView>

      <Modal visible={!!detail} animationType="slide" onRequestClose={() => setDetailKey(null)}>
        <SafeAreaView style={styles.root}>
          {detail ? (
            <ScrollView contentContainerStyle={styles.scroll}>
              <View style={styles.rowBetween}>
                <Button small kind="ghost" title="Back" onPress={() => setDetailKey(null)} />
                <Button small kind="ghost" title="Remove" onPress={() => removeMarket(detail.key)} />
              </View>
              <Text style={[styles.question, { fontSize: 20, marginTop: 12 }]}>{detail.question}</Text>
              <View style={styles.rowWrap}>
                <RiskBadge level={detail.last?.risk_level} />
                <VerifiedBadge v={detail.verification} />
              </View>
              {detail.last ? <Text style={[styles.body, { marginTop: 8 }]}>{detail.last.recommendation}</Text> : null}

              <View style={styles.card}>
                <Text style={styles.cardTitle}>On-device verification</Text>
                {detail.verification?.checks.map((c) => (
                  <View key={c.label} style={styles.checkRow}>
                    <Text style={{ color: c.ok ? C.ok : C.caution, width: 28, fontWeight: "800" }}>{c.ok ? "OK" : "X"}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.body}>{c.label}</Text>
                      {c.detail ? <Text style={[styles.mono, { fontSize: 11, color: C.dim }]}>{c.detail}</Text> : null}
                    </View>
                  </View>
                ))}
                <Text style={styles.dim}>verified {ago(detail.verification?.verifiedAt)}</Text>
                <View style={styles.row}>
                  <Button small kind="ghost" title="Tamper test" onPress={() => onTamperTest(detail)} />
                </View>
                {tamper ? (
                  <Text style={[styles.body, { color: tamper.verified ? C.caution : C.ok }]}>
                    Tamper test: one character of the signed bytes changed.{" "}
                    {tamper.verified ? "Still verified (unexpected)." : "Rejected, as it should be."}
                  </Text>
                ) : null}
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Anchor a receipt on Solana</Text>
                <Text style={styles.dim}>
                  Writes the pack hash into a devnet memo transaction, signed by your wallet through Mobile Wallet Adapter.
                </Text>
                {detail.verification?.packHash && detail.last ? (
                  <Text style={[styles.mono, { fontSize: 11, marginVertical: 6, color: C.dim }]}>
                    {memoText({
                      action: "watch",
                      marketId: detail.last.market.market_id,
                      riskLevel: detail.last.risk_level,
                      packHash: detail.verification.packHash,
                    })}
                  </Text>
                ) : null}
                <View style={styles.rowWrap}>
                  <Button
                    small
                    title={busy === `anchor:${detail.key}` ? "Waiting for wallet..." : "Anchor watch receipt"}
                    onPress={() => onAnchor(detail, "watch")}
                    disabled={!!busy}
                  />
                  <Button small kind="ghost" title="Acknowledge alert" onPress={() => onAnchor(detail, "acknowledge")} disabled={!!busy} />
                </View>
                {detail.anchors.map((a) => (
                  <Pressable key={a.signature} onPress={() => Linking.openURL(EXPLORER_TX(a.signature))}>
                    <Text style={[styles.mono, { color: C.accent, marginTop: 6 }]}>
                      {a.action} . {a.riskLevel} . {short(a.signature, 8)} . {ago(a.at)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Timeline</Text>
                {detail.timeline.map((t, i) => (
                  <Text key={`${t.at}-${i}`} style={styles.body}>
                    <Text style={styles.dim}>{t.at.replace("T", " ").slice(0, 16)} </Text>
                    {t.text}
                  </Text>
                ))}
                {detail.last?.disputes?.length ? (
                  <>
                    <Text style={[styles.cardTitle, { marginTop: 10 }]}>Disputes on chain</Text>
                    {detail.last.disputes.map((d, i) => (
                      <Text key={i} style={[styles.mono, { fontSize: 11, color: C.dim }]}>
                        {JSON.stringify(d).slice(0, 240)}
                      </Text>
                    ))}
                  </>
                ) : null}
              </View>
              <Text style={[styles.dim, { marginTop: 12 }]}>
                market {detail.last?.market.market_id} . condition {short(detail.last?.market.condition_id ?? "", 8)}
              </Text>
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 16, paddingTop: 40, paddingBottom: 48 },
  header: { marginBottom: 4 },
  title: { color: C.accent, fontSize: 28, fontWeight: "800" },
  subtitle: { color: C.dim, fontSize: 14, marginTop: 2 },
  card: { backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 12 },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: "700", marginBottom: 6 },
  section: { color: C.text, fontSize: 16, fontWeight: "700", marginTop: 20 },
  question: { color: C.text, fontSize: 16, fontWeight: "600", marginVertical: 6 },
  body: { color: C.text, fontSize: 14, lineHeight: 20, marginVertical: 2 },
  dim: { color: C.dim, fontSize: 12, lineHeight: 18 },
  mono: { color: C.text, fontFamily: "monospace", fontSize: 13 },
  input: {
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 8,
    color: C.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginVertical: 6,
  },
  row: { flexDirection: "row", gap: 8, marginTop: 8, alignItems: "center" },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4, alignItems: "center" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  checkRow: { flexDirection: "row", alignItems: "flex-start", marginVertical: 4 },
  btn: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, alignItems: "center" },
  btnSmall: { paddingVertical: 7, paddingHorizontal: 10 },
  btnPrimary: { backgroundColor: C.accent },
  btnGhost: { borderColor: C.line, borderWidth: 1 },
  btnText: { color: "#111", fontWeight: "700", fontSize: 15 },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
});
