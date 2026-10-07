import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Clipboard from "expo-clipboard";
import * as Notifications from "expo-notifications";
import { fetchSettlementRisk, MAX_INPUT_LENGTH, parseMarketInput, type SettlementRisk } from "./src/api";
import { verifyRecord, type Verification } from "./src/verify";
import { CLUSTERS, EXPLORER_TX, FOREGROUND_POLL_MS, MAX_WATCHLIST, PINNED_KID, type Cluster } from "./src/config";
import {
  changesLast24h,
  DEFAULT_SETTINGS,
  loadSettings,
  loadWallet,
  loadWatchlist,
  saveSettings,
  saveWallet,
  saveWatchlist,
  snapshotOf,
  statusLine,
  type Settings,
  type StoredWallet,
  type WatchItem,
} from "./src/store";
import { digestText, notify, pollAll, registerBackgroundPolling, setupNotifications } from "./src/watcher";
import { anchorPack, balanceSol, connectWallet, disconnectWallet, memoText, requestDevnetAirdrop } from "./src/wallet";

// Same palette as predge.io: deep navy, graphite cards, one amber accent.
const C = {
  bg: "#0b1220",
  card: "#121b2d",
  cardHi: "#17233a",
  line: "#22314d",
  text: "#e8edf5",
  dim: "#93a1b8",
  accent: "#f5a524",
  ok: "#3fb950",
  watch: "#d29922",
  caution: "#f85149",
  resolved: "#58a6ff",
};

const RISK_COLOR: Record<string, string> = { ok: C.ok, watch: C.watch, caution: C.caution, resolved: C.resolved };
const RISK_LABEL: Record<string, string> = { caution: "Caution", watch: "Watch", ok: "Quiet", resolved: "Settled" };
const RISK_ORDER = ["caution", "watch", "ok", "resolved"];

const EXAMPLES = [
  { label: "Disputed, not settled", key: "5186278" },
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

function hh(h: number) {
  return `${String(h).padStart(2, "0")}:00`;
}

function openExplorer(sig: string, cluster: Cluster) {
  try {
    Linking.openURL(EXPLORER_TX(sig, cluster));
  } catch {
    Alert.alert("Explorer", "This receipt has no valid transaction signature.");
  }
}

function Button(props: { title: string; onPress: () => void; kind?: "primary" | "ghost"; disabled?: boolean; small?: boolean }) {
  const primary = props.kind !== "ghost";
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityLabel={props.title}
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

function Chip({ text, color }: { text: string; color: string }) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{text}</Text>
    </View>
  );
}

function RiskBadge({ level }: { level?: string }) {
  return <Chip text={(RISK_LABEL[level ?? ""] ?? "...").toUpperCase()} color={RISK_COLOR[level ?? ""] ?? C.dim} />;
}

function VerifiedBadge({ v }: { v?: Verification }) {
  if (!v) return null;
  return <Chip text={v.verified ? "VERIFIED ON DEVICE" : "NOT VERIFIED"} color={v.verified ? C.ok : C.caution} />;
}

// ---------------------------------------------------------------------------
// Onboarding: three short screens on first launch.
// ---------------------------------------------------------------------------

const STEPS = [
  {
    kicker: "1 of 3 . The problem",
    title: "Prediction markets settle after trading",
    body:
      "On Polymarket a proposed outcome can be disputed. From 1 Jan to 2 Oct 2026 there were 3,005 UMA disputes on 2,666 markets, and 853 of 2,543 settled disputed markets (33.5%) settled differently from the disputed proposal. Most holders hear about it late.",
  },
  {
    kicker: "2 of 3 . What Settle Watch does",
    title: "An alert you can check yourself",
    body:
      "Add markets to your watchlist. When one gets a dispute, a clarification, a UMA vote or settles on chain, your phone alerts you. Every record is signed by Predge, and this phone verifies the signature before it shows you anything.",
  },
  {
    kicker: "3 of 3 . Start",
    title: "Build your watchlist",
    body:
      "Start with three real markets (one disputed and not settled yet, one disputed twice and settled, one quiet), or paste your own Polymarket links. You also get one short digest a day. Connect a wallet later to anchor receipts on Solana.",
  },
];

function Onboarding(props: { onDone: (addExamples: boolean) => void }) {
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.onb}>
        <Text style={styles.brand}>Settle Watch</Text>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <Text style={styles.kicker}>{s.kicker}</Text>
          <Text style={styles.onbTitle}>{s.title}</Text>
          <Text style={styles.onbBody}>{s.body}</Text>
          {step === 0 ? <Text style={[styles.dim, { marginTop: 12 }]}>Source: UMA and Polymarket adapter logs on Polygon, scanned by Predge.</Text> : null}
        </View>
        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, i === step && { backgroundColor: C.accent, width: 22 }]} />
          ))}
        </View>
        {last ? (
          <>
            <Button title="Add 3 example markets" onPress={() => props.onDone(true)} />
            <View style={{ height: 8 }} />
            <Button kind="ghost" title="I will paste my own" onPress={() => props.onDone(false)} />
          </>
        ) : (
          <View style={styles.rowBetween}>
            <Button kind="ghost" title={step === 0 ? "Skip" : "Back"} onPress={() => (step === 0 ? props.onDone(false) : setStep(step - 1))} />
            <Button title="Next" onPress={() => setStep(step + 1)} />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------

export default function App() {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [wallet, setWallet] = useState<StoredWallet | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [showChecks, setShowChecks] = useState(false);
  const [tamper, setTamper] = useState<Verification | null>(null);
  const [context, setContext] = useState<SettlementRisk["context"] | null>(null);
  const [bgOk, setBgOk] = useState<boolean | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const pollingRef = useRef(false);
  const detail = items.find((i) => i.key === detailKey) ?? null;
  const cluster: Cluster = settings?.cluster ?? DEFAULT_SETTINGS.cluster;
  const net = CLUSTERS[cluster].label;

  const persist = useCallback(async (next: WatchItem[]) => {
    setItems(next);
    await saveWatchlist(next);
  }, []);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    setSettings(await saveSettings(patch));
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

  const refreshBalance = useCallback(async (w: StoredWallet | null, c: Cluster) => {
    if (!w) return setBalance(null);
    try {
      setBalance(await balanceSol(w.address, c));
    } catch {
      setBalance(null);
    }
  }, []);

  const openDetail = useCallback((key: string) => {
    setTamper(null);
    setShowChecks(false);
    setDetailKey(key);
  }, []);

  useEffect(() => {
    (async () => {
      const s = await loadSettings();
      setSettings(s);
      setItems(await loadWatchlist());
      const w = await loadWallet();
      setWallet(w);
      refreshBalance(w, s.cluster);
      if (s.onboarded) {
        await setupNotifications();
        setBgOk(await registerBackgroundPolling());
      }
      await refreshAll();
    })();
  }, [refreshAll, refreshBalance]);

  // Tapping an alert opens that market.
  useEffect(() => {
    const open = (r: Notifications.NotificationResponse | null) => {
      const key = r?.notification.request.content.data?.key;
      if (typeof key === "string") openDetail(key);
    };
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [openDetail]);

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
    async (raw: string, opts: { quiet?: boolean } = {}) => {
      const key = parseMarketInput(raw);
      if (!key) {
        if (!opts.quiet) Alert.alert("Not a market", "Paste a polymarket.com link, a market slug, a numeric market id or a 0x condition id.");
        return;
      }
      const current = await loadWatchlist();
      if (current.length >= MAX_WATCHLIST) return Alert.alert("Watchlist full", `Up to ${MAX_WATCHLIST} markets. Remove one first.`);
      if (current.some((i) => i.key === key || i.marketId === key)) {
        if (!opts.quiet) Alert.alert("Already watching", key);
        return;
      }
      setBusy("add");
      try {
        const r = await fetchSettlementRisk(key);
        if (current.some((i) => i.marketId === r.market.market_id)) {
          if (!opts.quiet) Alert.alert("Already watching", r.market.question);
          return;
        }
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
          timeline: [{ at: now, text: `Watching. ${r.recommendation}`, verified: v.verified, kind: "info" }],
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
    [persist]
  );

  const finishOnboarding = useCallback(
    async (addExamples: boolean) => {
      await updateSettings({ onboarded: true });
      await setupNotifications();
      setBgOk(await registerBackgroundPolling());
      if (addExamples) {
        for (const e of [...EXAMPLES].reverse()) await addMarket(e.key, { quiet: true });
      }
    },
    [updateSettings, addMarket]
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
      const w = await connectWallet(wallet, cluster);
      setWallet(w);
      await saveWallet(w);
      refreshBalance(w, cluster);
    } catch (e) {
      Alert.alert(
        "Wallet",
        `Could not connect: ${(e as Error).message}\n\nInstall a Mobile Wallet Adapter wallet (Seed Vault on Seeker, Phantom or Solflare) and set it to ${net}.`
      );
    } finally {
      setBusy(null);
    }
  }, [wallet, cluster, net, refreshBalance]);

  const onDisconnect = useCallback(async () => {
    await disconnectWallet(wallet);
    setWallet(null);
    setBalance(null);
    await saveWallet(null);
  }, [wallet]);

  const onSwitchCluster = useCallback(
    async (c: Cluster) => {
      if (c === cluster) return;
      // A wallet session is bound to one chain, so switching asks to connect again.
      if (wallet) await onDisconnect();
      await updateSettings({ cluster: c });
    },
    [cluster, wallet, onDisconnect, updateSettings]
  );

  const onAirdrop = useCallback(async () => {
    if (!wallet || cluster !== "devnet") return;
    setBusy("airdrop");
    try {
      await requestDevnetAirdrop(wallet.address);
      await refreshBalance(wallet, cluster);
    } catch (e) {
      await Clipboard.setStringAsync(wallet.address);
      Alert.alert("Devnet faucet", `Airdrop failed (${(e as Error).message}). Your address is copied: paste it at faucet.solana.com.`);
    } finally {
      setBusy(null);
    }
  }, [wallet, cluster, refreshBalance]);

  const doAnchor = useCallback(
    async (item: WatchItem, action: "watch" | "acknowledge") => {
      if (!wallet) return;
      const v = item.verification;
      const last = item.last;
      if (!v?.verified || !v.packHash || !last) return;
      const packHash = v.packHash;
      setBusy(`anchor:${item.key}`);
      try {
        const { signature, wallet: w } = await anchorPack(
          wallet,
          { action, marketId: last.market.market_id, riskLevel: last.risk_level, packHash },
          cluster
        );
        setWallet(w);
        await saveWallet(w);
        const now = new Date().toISOString();
        const list = await loadWatchlist();
        const next = list.map((i) =>
          i.key === item.key
            ? {
                ...i,
                anchors: [{ signature, packHash, action, riskLevel: last.risk_level, at: now, cluster }, ...i.anchors],
                timeline: [
                  { at: now, text: `Receipt anchored on Solana ${net} (${action})`, verified: true, kind: "receipt" as const },
                  ...i.timeline,
                ],
              }
            : i
        );
        await persist(next);
        refreshBalance(w, cluster);
        Alert.alert(`Receipt on Solana ${net}`, `Memo tx ${short(signature, 6)}`, [
          { text: "Open explorer", onPress: () => openExplorer(signature, cluster) },
          { text: "OK" },
        ]);
      } catch (e) {
        Alert.alert(
          "Anchor failed",
          `${(e as Error).message}\n\n${cluster === "devnet" ? 'On devnet the wallet needs a little SOL for the fee: tap "Devnet SOL".' : "The wallet needs a little SOL for the network fee."}`
        );
      } finally {
        setBusy(null);
      }
    },
    [wallet, cluster, net, persist, refreshBalance]
  );

  const onAnchor = useCallback(
    (item: WatchItem, action: "watch" | "acknowledge") => {
      if (!wallet) return Alert.alert("Connect a wallet first", `A receipt is a Solana ${net} memo signed by your wallet.`);
      if (!item.verification?.verified || !item.verification.packHash || !item.last) {
        return Alert.alert("Not verified", "Only a record that verified on this phone can be anchored.");
      }
      if (cluster === "mainnet-beta") {
        return Alert.alert("Anchor on mainnet?", "This sends a real Solana transaction. The only cost is the network fee, about 0.000005 SOL.", [
          { text: "Cancel", style: "cancel" },
          { text: "Anchor", onPress: () => doAnchor(item, action) },
        ]);
      }
      doAnchor(item, action);
    },
    [wallet, cluster, net, doAnchor]
  );

  const onTestAlert = useCallback(async () => {
    await notify(
      "[TEST] Settle Watch",
      "Test notification only, not a real dispute. Real alerts fire when a watched market gets a UMA dispute, a clarification or settles on chain.",
      { test: true }
    );
  }, []);

  const onDigestNow = useCallback(async () => {
    if (!items.length) return Alert.alert("Digest", "Add a market first.");
    const { title, body } = digestText(items);
    await notify(title, body, { digest: true });
  }, [items]);

  const onTamperTest = useCallback(async (item: WatchItem) => {
    if (!item.last) return;
    setTamper(await verifyRecord(item.last, { tamper: true }));
  }, []);

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    await refreshBalance(wallet, cluster);
    setRefreshing(false);
  }, [refreshAll, refreshBalance, wallet, cluster]);

  const today = useMemo(
    () =>
      items
        .map((i) => ({ item: i, changes: changesLast24h(i) }))
        .filter((x) => x.changes.length > 0)
        .sort((a, b) => Date.parse(b.changes[0].at) - Date.parse(a.changes[0].at)),
    [items]
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = { caution: 0, watch: 0, ok: 0, resolved: 0 };
    for (const i of items) if (i.last?.risk_level && c[i.last.risk_level] !== undefined) c[i.last.risk_level]++;
    return c;
  }, [items]);
  const shown = useMemo(() => {
    const list = filter ? items.filter((i) => i.last?.risk_level === filter) : items;
    return [...list].sort((a, b) => RISK_ORDER.indexOf(a.last?.risk_level ?? "") - RISK_ORDER.indexOf(b.last?.risk_level ?? ""));
  }, [items, filter]);
  const lastCheck = items.map((i) => i.lastPolledAt ?? "").sort().pop();

  if (!settings) {
    return (
      <SafeAreaView style={[styles.root, { justifyContent: "center" }]}>
        <ActivityIndicator color={C.accent} />
      </SafeAreaView>
    );
  }
  if (!settings.onboarded) return <Onboarding onDone={finishOnboarding} />;

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

        {/* Wallet: one compact row */}
        <View style={[styles.card, styles.rowBetween]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardLabel}>Wallet . Solana {net}</Text>
            {wallet ? (
              <Pressable onPress={() => Clipboard.setStringAsync(wallet.address)} accessibilityLabel="Copy wallet address">
                <Text style={styles.mono}>
                  {short(wallet.address, 6)}
                  <Text style={styles.dim}>  {balance === null ? "" : `${balance.toFixed(4)} SOL`}</Text>
                </Text>
              </Pressable>
            ) : (
              <Text style={styles.dim}>Connect to anchor receipts on Solana</Text>
            )}
          </View>
          {busy === "wallet" || busy === "airdrop" ? (
            <ActivityIndicator color={C.accent} />
          ) : wallet ? (
            <View style={styles.row}>
              {cluster === "devnet" ? <Button small kind="ghost" title="Devnet SOL" onPress={onAirdrop} disabled={!!busy} /> : null}
              <Button small kind="ghost" title="Disconnect" onPress={onDisconnect} />
            </View>
          ) : (
            <Button small title="Connect wallet" onPress={onConnect} disabled={!!busy} />
          )}
        </View>

        {/* Today: the daily reason to open the app */}
        <View style={[styles.card, { backgroundColor: C.cardHi, borderColor: today.length ? C.accent : C.line }]}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Today</Text>
            <Text style={styles.dim}>last 24 h . checked {ago(lastCheck)}</Text>
          </View>
          {items.length === 0 ? (
            <Text style={styles.body}>Add a market below and its status changes will show up here.</Text>
          ) : today.length === 0 ? (
            <Text style={styles.body}>
              No status changes across your {items.length} market{items.length > 1 ? "s" : ""}.{" "}
              {counts.caution ? `${counts.caution} still need${counts.caution > 1 ? "" : "s"} attention.` : "Nothing needs attention."}
            </Text>
          ) : (
            today.map(({ item, changes }) => (
              <Pressable key={item.key} onPress={() => openDetail(item.key)} style={styles.todayRow}>
                <View style={[styles.dotBig, { backgroundColor: RISK_COLOR[item.last?.risk_level ?? ""] ?? C.dim }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.body} numberOfLines={1}>
                    {item.question ?? item.key}
                  </Text>
                  <Text style={styles.dim}>
                    {changes[0].text} . {ago(changes[0].at)}
                    {changes.length > 1 ? ` . +${changes.length - 1} more` : ""}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
          <Text style={[styles.dim, { marginTop: 6 }]}>
            {settings.digest ? `Daily digest at ${hh(settings.digestHour)}.` : "Daily digest is off."}{" "}
            {bgOk === false ? "Background checks are off on this phone." : "Checked every minute while open, about every 15 min in the background."}
          </Text>
        </View>

        {/* Watchlist at a glance */}
        <Text style={styles.section}>Watchlist ({items.length})</Text>
        {items.length ? (
          <View style={styles.glance}>
            {RISK_ORDER.map((r) => (
              <Pressable
                key={r}
                onPress={() => setFilter(filter === r ? null : r)}
                accessibilityLabel={`Show ${RISK_LABEL[r]} markets`}
                style={[styles.glanceCell, filter === r && { borderColor: RISK_COLOR[r] }]}
              >
                <Text style={[styles.glanceNum, { color: RISK_COLOR[r] }]}>{counts[r]}</Text>
                <Text style={styles.dim}>{RISK_LABEL[r]}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {filter ? <Text style={[styles.dim, { marginTop: 6 }]}>Showing {RISK_LABEL[filter]} only. Tap again to show all.</Text> : null}
        {shown.map((it) => {
          const changedToday = changesLast24h(it).length > 0;
          return (
            <Pressable
              key={it.key}
              onPress={() => openDetail(it.key)}
              style={({ pressed }) => [
                styles.card,
                { borderColor: `${RISK_COLOR[it.last?.risk_level ?? ""] ?? C.line}66` },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={styles.question} numberOfLines={2}>
                {it.question ?? it.key}
              </Text>
              <Text style={[styles.body, { color: RISK_COLOR[it.last?.risk_level ?? ""] ?? C.dim }]}>{statusLine(it.snapshot)}</Text>
              <View style={styles.rowWrap}>
                <RiskBadge level={it.last?.risk_level} />
                {it.verification ? <Chip text={it.verification.verified ? "VERIFIED" : "NOT VERIFIED"} color={it.verification.verified ? C.ok : C.caution} /> : null}
                {changedToday ? <Chip text="CHANGED TODAY" color={C.accent} /> : null}
                {it.anchors.length ? <Chip text={`RECEIPT x${it.anchors.length}`} color={C.accent} /> : null}
                <Text style={styles.dim}>
                  {" "}
                  checked {ago(it.lastPolledAt)}
                  {it.lastError ? ` . error: ${it.lastError.slice(0, 80)}` : ""}
                </Text>
              </View>
            </Pressable>
          );
        })}

        {/* Add a market */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Watch a market</Text>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="polymarket.com link, slug or market id"
            placeholderTextColor={C.dim}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={MAX_INPUT_LENGTH}
            onSubmitEditing={() => addMarket(input)}
          />
          <View style={styles.row}>
            <Button title={busy === "add" ? "Checking..." : "Add to watchlist"} onPress={() => addMarket(input)} disabled={!!busy} />
            <Button
              kind="ghost"
              title="Paste"
              onPress={async () => setInput((await Clipboard.getStringAsync()).slice(0, MAX_INPUT_LENGTH))}
              disabled={!!busy}
            />
          </View>
          <Text style={[styles.dim, { marginTop: 8 }]}>Examples (real markets)</Text>
          <View style={styles.rowWrap}>
            {EXAMPLES.map((e) => (
              <Button key={e.key} small kind="ghost" title={e.label} onPress={() => addMarket(e.key)} disabled={!!busy} />
            ))}
          </View>
        </View>

        {/* Settings */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Settings</Text>
          <View style={styles.rowBetween}>
            <Text style={styles.body}>Daily digest notification</Text>
            <Switch
              value={settings.digest}
              onValueChange={(v) => updateSettings({ digest: v })}
              trackColor={{ true: C.accent, false: C.line }}
              thumbColor={C.text}
            />
          </View>
          {settings.digest ? (
            <View style={styles.rowBetween}>
              <Text style={styles.dim}>Sent once a day after {hh(settings.digestHour)}</Text>
              <View style={styles.row}>
                <Button small kind="ghost" title="-" onPress={() => updateSettings({ digestHour: (settings.digestHour + 23) % 24 })} />
                <Button small kind="ghost" title="+" onPress={() => updateSettings({ digestHour: (settings.digestHour + 1) % 24 })} />
              </View>
            </View>
          ) : null}
          <View style={[styles.rowBetween, { marginTop: 10 }]}>
            <Text style={styles.body}>Receipt network</Text>
            <View style={styles.segment}>
              {(["devnet", "mainnet-beta"] as Cluster[]).map((c) => (
                <Pressable key={c} onPress={() => onSwitchCluster(c)} style={[styles.segItem, cluster === c && { backgroundColor: C.accent }]}>
                  <Text style={[styles.badgeText, { color: cluster === c ? "#111" : C.text }]}>{CLUSTERS[c].label.toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={[styles.rowWrap, { marginTop: 10 }]}>
            <Button small kind="ghost" title="Check now" onPress={refreshAll} />
            <Button small kind="ghost" title="Digest now" onPress={onDigestNow} />
            <Button small kind="ghost" title="Send test alert" onPress={onTestAlert} />
            <Button small kind="ghost" title="Show intro" onPress={() => updateSettings({ onboarded: false })} />
          </View>
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
                <Button
                  small
                  kind="ghost"
                  title="Remove"
                  onPress={() =>
                    Alert.alert("Stop watching?", detail.question ?? detail.key, [
                      { text: "Cancel", style: "cancel" },
                      { text: "Remove", style: "destructive", onPress: () => removeMarket(detail.key) },
                    ])
                  }
                />
              </View>
              <Text style={[styles.question, { fontSize: 20, marginTop: 12 }]}>{detail.question}</Text>
              <Text style={[styles.statusBig, { color: RISK_COLOR[detail.last?.risk_level ?? ""] ?? C.dim }]}>{statusLine(detail.snapshot)}</Text>
              <View style={styles.rowWrap}>
                <RiskBadge level={detail.last?.risk_level} />
                <VerifiedBadge v={detail.verification} />
              </View>
              {detail.last ? <Text style={[styles.body, { marginTop: 8 }]}>{detail.last.recommendation}</Text> : null}

              <View style={[styles.card, { borderColor: detail.verification?.verified ? C.ok : C.caution }]}>
                <Text style={[styles.cardTitle, { color: detail.verification?.verified ? C.ok : C.caution }]}>
                  {detail.verification?.verified ? "Verified on this phone" : "Not verified"}
                </Text>
                <Text style={styles.dim}>
                  {detail.verification?.checks.filter((c) => c.ok).length ?? 0} of {detail.verification?.checks.length ?? 0} checks passed .
                  ed25519 signature by Predge key {PINNED_KID} . {ago(detail.verification?.verifiedAt)}
                </Text>
                {showChecks
                  ? detail.verification?.checks.map((c) => (
                      <View key={c.label} style={styles.checkRow}>
                        <Text style={{ color: c.ok ? C.ok : C.caution, width: 28, fontWeight: "800" }}>{c.ok ? "OK" : "X"}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.body}>{c.label}</Text>
                          {c.detail ? <Text style={[styles.mono, { fontSize: 11, color: C.dim }]}>{c.detail}</Text> : null}
                        </View>
                      </View>
                    ))
                  : null}
                <View style={styles.row}>
                  <Button small kind="ghost" title={showChecks ? "Hide checks" : "Show the checks"} onPress={() => setShowChecks(!showChecks)} />
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
                <Text style={styles.cardTitle}>Receipt on Solana {net}</Text>
                <Text style={styles.dim}>
                  Writes the hash of this verified record into a memo transaction, signed by your wallet through Mobile Wallet Adapter. You keep
                  a public, timestamped proof of exactly what you were shown.
                </Text>
                {detail.verification?.packHash && detail.last ? (
                  <Text style={[styles.mono, { fontSize: 11, marginVertical: 6, color: C.dim }]}>
                    {(() => {
                      try {
                        return memoText({
                          action: "watch",
                          marketId: detail.last.market.market_id,
                          riskLevel: detail.last.risk_level,
                          packHash: detail.verification.packHash,
                        });
                      } catch {
                        return "";
                      }
                    })()}
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
                  <Pressable key={a.signature} onPress={() => openExplorer(a.signature, a.cluster ?? "devnet")}>
                    <Text style={[styles.mono, { color: C.accent, marginTop: 6 }]}>
                      {a.action} . {CLUSTERS[a.cluster ?? "devnet"].label} . {short(a.signature, 8)} . {ago(a.at)}
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
  cardLabel: { color: C.dim, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 2, textTransform: "uppercase" },
  section: { color: C.text, fontSize: 16, fontWeight: "700", marginTop: 20 },
  question: { color: C.text, fontSize: 16, fontWeight: "600", marginVertical: 4 },
  statusBig: { fontSize: 17, fontWeight: "700", marginBottom: 6 },
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
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  checkRow: { flexDirection: "row", alignItems: "flex-start", marginVertical: 4 },
  todayRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  glance: { flexDirection: "row", gap: 8, marginTop: 8 },
  glanceCell: { flex: 1, backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 10, paddingVertical: 8, alignItems: "center" },
  glanceNum: { fontSize: 22, fontWeight: "800" },
  segment: { flexDirection: "row", borderColor: C.line, borderWidth: 1, borderRadius: 8, overflow: "hidden" },
  segItem: { paddingHorizontal: 10, paddingVertical: 6 },
  btn: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, alignItems: "center" },
  btnSmall: { paddingVertical: 7, paddingHorizontal: 10 },
  btnPrimary: { backgroundColor: C.accent },
  btnGhost: { borderColor: C.line, borderWidth: 1 },
  btnText: { color: "#111", fontWeight: "700", fontSize: 15 },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  onb: { flex: 1, padding: 24, paddingTop: 56 },
  brand: { color: C.accent, fontSize: 22, fontWeight: "800" },
  kicker: { color: C.accent, fontSize: 12, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 },
  onbTitle: { color: C.text, fontSize: 28, fontWeight: "800", lineHeight: 34, marginBottom: 14 },
  onbBody: { color: C.text, fontSize: 16, lineHeight: 24 },
  dots: { flexDirection: "row", gap: 6, justifyContent: "center", marginBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.line },
  dotBig: { width: 10, height: 10, borderRadius: 5 },
});
