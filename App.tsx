import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import * as Notifications from "expo-notifications";
import Svg, { Path } from "react-native-svg";
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
import {
  ACTION_LABEL,
  applyAction,
  BADGES,
  canClockIn,
  clockIn,
  lastSeven,
  levelOf,
  LEVELS,
  liveStreak,
  NEW_GAME,
  weeklyRecap,
  XP,
  type ActionKind,
  type BadgeId,
  type GameState,
} from "./src/game";
import { loadGame, saveGame } from "./src/gameStore";
import { scheduleClockInNudge } from "./src/nudge";
import { alpha, C, MONO, STATUS, STATUS_ORDER, T } from "./src/theme";
import * as haptic from "./src/haptic";
import { BadgeIcon, Burst, Button, CelebrationOverlay, Chip, Flame, LevelBadge, Mark, Press, Reveal, useReducedMotion, useShake, XpToast, type Celebration } from "./src/ui";
import Intro from "./src/Intro";

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

/** 3005 -> "3,005" without relying on Intl support in the JS engine. */
function num(v: unknown) {
  const s = String(v ?? "");
  return /^\d+$/.test(s) ? s.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : s;
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

const statusColor = (level?: string) => STATUS[level ?? ""]?.color ?? C.dim;

function RiskBadge({ level }: { level?: string }) {
  return <Chip text={(STATUS[level ?? ""]?.label ?? "...").toUpperCase()} color={statusColor(level)} />;
}

function VerifiedBadge({ v }: { v?: Verification }) {
  if (!v) return null;
  return <Chip text={v.verified ? "VERIFIED ON DEVICE" : "NOT VERIFIED"} color={v.verified ? C.green : C.red} />;
}

/** Bold, color-coded market card. Pulses when its status changes. */
function MarketCard({ item, index, onOpen }: { item: WatchItem; index: number; onOpen: () => void }) {
  const level = item.last?.risk_level ?? "";
  const color = statusColor(level);
  const prev = useRef(level);
  const flash = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (prev.current !== level) {
      prev.current = level;
      flash.setValue(1);
      haptic.thud();
      Animated.timing(flash, { toValue: 0, duration: 1400, useNativeDriver: true }).start();
    }
  }, [level, flash]);
  const changedToday = changesLast24h(item).length > 0;
  return (
    <Reveal delay={Math.min(index, 6) * 60}>
      <Press onPress={onOpen} label={item.question ?? item.key} style={[styles.market, { backgroundColor: alpha(color, 0.1), borderColor: alpha(color, 0.5) }]}>
        <View style={[styles.stripe, { backgroundColor: color }]} />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color, opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] }) }]} />
        <View style={{ paddingLeft: 10 }}>
          <View style={styles.rowBetween}>
            <Text style={[styles.statusWord, { color }]}>{(STATUS[level]?.word ?? "CHECKING")}</Text>
            <Text style={styles.dim}>
              checked {ago(item.lastPolledAt)}
              {item.lastError ? ` . error: ${item.lastError.slice(0, 80)}` : ""}
            </Text>
          </View>
          <Text style={styles.question} numberOfLines={2}>
            {item.question ?? item.key}
          </Text>
          <Text style={[styles.body, { color }]}>{statusLine(item.snapshot)}</Text>
          <View style={styles.rowWrap}>
            {item.verification ? <Chip text={item.verification.verified ? "VERIFIED" : "NOT VERIFIED"} color={item.verification.verified ? C.green : C.red} /> : null}
            {changedToday ? <Chip text="CHANGED TODAY" color={C.orange} /> : null}
            {item.anchors.length ? <Chip text={`RECEIPT x${item.anchors.length}`} color={C.purpleSoft} /> : null}
          </View>
        </View>
      </Press>
    </Reveal>
  );
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
    <View style={styles.root}>
      <LinearGradient colors={["#2a1458", "#0f2616", C.bg]} locations={[0, 0.35, 0.75]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.onb}>
          <View style={styles.brandRow}>
            <Mark size={30} />
            <Text style={styles.brand}>SETTLE WATCH</Text>
          </View>
          <View style={{ flex: 1, justifyContent: "center" }}>
            <Reveal key={step}>
              <Text style={styles.kicker}>{s.kicker}</Text>
              <Text style={styles.onbTitle}>{s.title}</Text>
              <Text style={styles.onbBody}>{s.body}</Text>
              {step === 0 ? <Text style={[styles.dim, { marginTop: 12 }]}>Source: UMA and Polymarket adapter logs on Polygon, scanned by Predge.</Text> : null}
            </Reveal>
          </View>
          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View key={i} style={[styles.dot, i === step && { backgroundColor: C.green, width: 26 }]} />
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
    </View>
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
  const itemsRef = useRef<WatchItem[]>([]);
  const [game, setGame] = useState<GameState>(NEW_GAME);
  const gameRef = useRef<GameState>(NEW_GAME);
  const [celebs, setCelebs] = useState<Celebration[]>([]);
  const [toast, setToast] = useState({ text: "", tick: 0 });
  const [verifyPlay, setVerifyPlay] = useState(0);
  const [stampPlay, setStampPlay] = useState(0);
  const [rejectPlay, setRejectPlay] = useState(0);
  const [stamp, setStamp] = useState(false);
  const [badgesOpen, setBadgesOpen] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [clockPlay, setClockPlay] = useState(0);
  const reduced = useReducedMotion();
  const shake = useShake();
  const celebId = useRef(0);
  itemsRef.current = items;
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

  // Clock-in loop. Every helper reads and writes gameRef so quick taps never use stale state.
  const commitGame = useCallback(
    (next: GameState, info: { gained: number; levelUp?: string; badges: BadgeId[] }) => {
      gameRef.current = next;
      setGame(next);
      saveGame(next).catch(() => undefined);
      if (info.gained > 0) setToast((t) => ({ text: `+${info.gained} XP`, tick: t.tick + 1 }));
      const add: Celebration[] = [];
      for (const id of info.badges) {
        const b = BADGES.find((x) => x.id === id);
        if (b) add.push({ id: ++celebId.current, kind: "badge", title: b.name, sub: b.hint, badge: id });
      }
      if (info.levelUp) {
        const idx = LEVELS.findIndex((l) => l.name === info.levelUp);
        add.push({ id: ++celebId.current, kind: "level", title: `Level ${idx + 1}: ${info.levelUp}`, sub: "Your checks on this phone are adding up.", level: idx });
      }
      // Short delay so the action's own animation (burst, shake) is seen before the unlock card.
      if (add.length) setTimeout(() => setCelebs((c) => [...c, ...add]), 1100);
    },
    []
  );
  const award = useCallback(
    (kind: ActionKind, opts: { ref?: string; disputed?: boolean } = {}) => {
      const r = applyAction(gameRef.current, kind, { ...opts, watching: itemsRef.current.length });
      commitGame(r.state, r);
    },
    [commitGame]
  );
  const doClockIn = useCallback(() => {
    const r = clockIn(gameRef.current);
    if (r.already) return;
    commitGame(r.state, r);
    setClockPlay((n) => n + 1);
    haptic.success();
    if (r.usedFreeMiss) Alert.alert("Streak saved", "You missed a day, so this week's free miss kept your streak alive.");
  }, [commitGame]);

  const openDetail = useCallback(
    (key: string) => {
      setTamper(null);
      setShowChecks(false);
      setDetailKey(key);
      setVerifyPlay((n) => n + 1);
      const it = itemsRef.current.find((i) => i.key === key);
      if (!it) return;
      if (it.verification?.verified && it.last) award("verify", { ref: it.last.market.market_id });
      // Caught within 1 h of the alert: opened a market whose status changed in the last hour.
      const fresh = changesLast24h(it).find((c) => (c.kind ?? "change") === "change" && Date.now() - Date.parse(c.at) <= 3600_000);
      if (fresh) {
        const s = it.snapshot;
        award("early_catch", { ref: `${key}:${fresh.at}`, disputed: !!s && (s.dispute_count > 0 || s.open_dispute) });
      }
    },
    [award]
  );

  useEffect(() => {
    (async () => {
      const s = await loadSettings();
      setSettings(s);
      setItems(await loadWatchlist());
      const g = await loadGame();
      gameRef.current = g;
      setGame(g);
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
        const nextList = [item, ...(await loadWatchlist())];
        await persist(nextList);
        itemsRef.current = nextList;
        setInput("");
        award("add_market", { ref: r.market.market_id });
        if (v.verified) award("verify", { ref: r.market.market_id });
      } catch (e) {
        Alert.alert("Could not add market", (e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [persist, award]
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
        award("anchor", { ref: signature });
        haptic.success();
        setStampPlay((n) => n + 1);
        setStamp(true);
        await new Promise((res) => setTimeout(res, reduced ? 300 : 1300));
        setStamp(false);
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
    [wallet, cluster, net, persist, refreshBalance, award, reduced]
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

  const onTamperTest = useCallback(
    async (item: WatchItem) => {
      if (!item.last) return;
      const res = await verifyRecord(item.last, { tamper: true });
      setTamper(res);
      if (!res.verified) {
        haptic.reject();
        shake.run(reduced);
        setRejectPlay((n) => n + 1);
        award("tamper", { ref: item.last.market.market_id });
      }
    },
    [award, reduced, shake]
  );

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
    return [...list].sort((a, b) => STATUS_ORDER.indexOf(a.last?.risk_level ?? "") - STATUS_ORDER.indexOf(b.last?.risk_level ?? ""));
  }, [items, filter]);
  useEffect(() => {
    if (settings?.onboarded) scheduleClockInNudge(settings.digestHour, settings.digest);
  }, [settings?.onboarded, settings?.digest, settings?.digestHour]);

  const lastCheck = items.map((i) => i.lastPolledAt ?? "").sort().pop();


  const level = levelOf(game.xp);
  const streak = liveStreak(game);
  const week = lastSeven(game);
  const recap = weeklyRecap(game);
  const canIn = canClockIn(game);
  const unlocked = BADGES.filter((b) => game.badges[b.id]).length;
  const top = badgesOpen ? "badges" : detail ? "detail" : "main";
  const overlays = (where: string) => (
    <>
      <XpToast text={toast.text} tick={where === top ? toast.tick : 0} />
      <CelebrationOverlay item={where === top ? (celebs[0] ?? null) : null} onClose={() => setCelebs((c) => c.slice(1))} />
    </>
  );

  let content: React.ReactNode;
  if (!settings) {
    content = (
      <SafeAreaView style={[styles.root, { justifyContent: "center" }]}>
        <ActivityIndicator color={C.green} />
      </SafeAreaView>
    );
  } else if (!settings.onboarded) {
    content = <Onboarding onDone={finishOnboarding} />;
  } else {
    content = (
      <SafeAreaView style={styles.root}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={C.green} progressBackgroundColor={C.surfaceHi} />}
          keyboardShouldPersistTaps="handled"
        >
          <LinearGradient colors={["#2f1763", "#123022", C.bg]} locations={[0, 0.55, 1]} style={styles.header}>
            <View style={styles.rowBetween}>
              <View style={styles.brandRow}>
                <Mark size={30} />
                <Text style={styles.brand}>SETTLE WATCH</Text>
              </View>
              <Press onPress={() => setBadgesOpen(true)} label={`Level ${level.index + 1} ${level.name}, open badges`}>
                <LevelBadge index={level.index} progress={level.progress} size={52} />
              </Press>
            </View>
            <Text style={styles.display}>{level.name}</Text>
            <Text style={styles.subtitle}>
              {game.xp} XP{level.next ? ` . ${level.toNext} to ${level.next}` : " . top level"}
            </Text>
            <Text style={[styles.subtitle, { marginTop: 10 }]}>Settlement alerts for Polymarket, verified on your phone</Text>
          </LinearGradient>

          {/* Today: the hero, on paper */}
          <View style={styles.hero}>
            <View style={styles.rowBetween}>
              <Text style={styles.heroKicker}>TODAY</Text>
              <Text style={styles.heroDim}>last 24 h . checked {ago(lastCheck)}</Text>
            </View>
            {items.length === 0 ? (
              <Text style={styles.heroBody}>Add a market below and its status changes will show up here.</Text>
            ) : today.length === 0 ? (
              <Text style={styles.heroBody}>
                No status changes across your {items.length} market{items.length > 1 ? "s" : ""}.{" "}
                {counts.caution + counts.watch
                  ? `${counts.caution + counts.watch} still need${counts.caution + counts.watch > 1 ? "" : "s"} attention.`
                  : "Nothing needs attention."}
              </Text>
            ) : (
              today.map(({ item, changes }) => (
                <Pressable
                  key={item.key}
                  onPress={() => {
                    doClockIn();
                    openDetail(item.key);
                  }}
                  style={styles.todayRow}
                  accessibilityRole="button"
                >
                  <View style={[styles.dotBig, { backgroundColor: statusColor(item.last?.risk_level) }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.heroRowTitle} numberOfLines={1}>
                      {item.question ?? item.key}
                    </Text>
                    <Text style={styles.heroDim}>
                      {changes[0].text} . {ago(changes[0].at)}
                      {changes.length > 1 ? ` . +${changes.length - 1} more` : ""}
                    </Text>
                  </View>
                </Pressable>
              ))
            )}

            <View style={styles.heroRule} />
            <View style={styles.streakRow}>
              <Flame size={34} lit={streak > 0} />
              <View style={{ flex: 1 }}>
                <Text style={styles.streakNum}>
                  {streak} <Text style={styles.streakUnit}>day streak</Text>
                </Text>
                <Text style={styles.heroDim}>One free miss per week keeps it alive. Best: {game.best}.</Text>
              </View>
            </View>
            <View style={styles.weekRow}>
              {week.map((d) => (
                <View key={d.day} style={styles.weekCell} accessibilityLabel={`${d.day} ${d.done ? "clocked in" : d.saved ? "saved by free miss" : "not clocked in"}`}>
                  <View
                    style={[
                      styles.weekDot,
                      d.done && { backgroundColor: C.ink, borderColor: C.ink },
                      d.saved && !d.done && { borderColor: C.purple, backgroundColor: alpha(C.purple, 0.15) },
                      d.today && !d.done && { borderColor: C.ink, borderStyle: "dashed" },
                    ]}
                  >
                    {d.done ? (
                      <Svg width={14} height={14} viewBox="0 0 24 24">
                        <Path d="M5 12.5l4.5 4.5L19 7" stroke={C.green} strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    ) : null}
                  </View>
                  <Text style={styles.weekLabel}>{d.label}</Text>
                </View>
              ))}
            </View>
            <View style={styles.clockRow}>
              {clockPlay > 0 && !canIn ? <Burst play={clockPlay} size={46} /> : null}
              <View style={{ flex: 1 }}>
                <Press onPress={doClockIn} disabled={!canIn} haptics={false} label={canIn ? "Clock in" : "Clocked in today"} style={[styles.clockBtn, !canIn && { backgroundColor: alpha(C.ink, 0.12) }]}>
                  <Text style={[styles.clockBtnText, !canIn && { color: C.inkSoft }]}>{canIn ? `CLOCK IN  +${XP.clock_in + Math.min(streak + 1, 7) * 2} XP` : "CLOCKED IN TODAY"}</Text>
                </Press>
              </View>
            </View>
            <Text style={[styles.heroDim, { marginTop: 10 }]}>
              {settings.digest ? `Daily digest at ${hh(settings.digestHour)}.` : "Daily digest is off."}{" "}
              {bgOk === false ? "Background checks are off on this phone." : "Checked every minute while open, about every 15 min in the background."}
            </Text>
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
              <ActivityIndicator color={C.green} />
            ) : wallet ? (
              <View style={styles.row}>
                {cluster === "devnet" ? <Button small kind="ghost" title="Devnet SOL" onPress={onAirdrop} disabled={!!busy} /> : null}
                <Button small kind="ghost" title="Disconnect" onPress={onDisconnect} />
              </View>
            ) : (
              <Button small title="Connect wallet" onPress={onConnect} disabled={!!busy} />
            )}
          </View>

          {/* Watchlist at a glance */}
          <Text style={styles.section}>Watchlist ({items.length})</Text>
          {items.length ? (
            <View style={styles.glance}>
              {STATUS_ORDER.map((r) => (
                <Press
                  key={r}
                  onPress={() => setFilter(filter === r ? null : r)}
                  label={`Show ${STATUS[r].label} markets`}
                  fill
                  style={[styles.glanceCell, { backgroundColor: alpha(STATUS[r].color, filter === r ? 0.28 : 0.1), borderColor: alpha(STATUS[r].color, filter === r ? 1 : 0.4) }]}
                >
                  <Text style={[styles.glanceNum, { color: STATUS[r].color }]}>{counts[r]}</Text>
                  <Text style={[styles.glanceLabel, { color: STATUS[r].color }]}>{STATUS[r].label}</Text>
                </Press>
              ))}
            </View>
          ) : null}
          {filter ? <Text style={[styles.dim, { marginTop: 6 }]}>Showing {STATUS[filter].label} only. Tap again to show all.</Text> : null}
          {shown.map((it, i) => (
            <MarketCard key={it.key} item={it} index={i} onOpen={() => openDetail(it.key)} />
          ))}

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

          {/* Weekly recap */}
          <LinearGradient colors={["#2a1458", "#10281a"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.recap}>
            <Text style={styles.cardLabel}>Weekly recap</Text>
            <Text style={styles.recapText}>{recap.text}</Text>
            <Text style={styles.dim}>{recap.xp} XP earned since Monday.</Text>
          </LinearGradient>

          {/* Badges */}
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>Badges</Text>
              <Text style={styles.dim}>
                {unlocked} of {BADGES.length} unlocked
              </Text>
            </View>
            <View style={[styles.rowBetween, { marginVertical: 8 }]}>
              {BADGES.map((b) => (
                <BadgeIcon key={b.id} id={b.id} size={44} locked={!game.badges[b.id]} />
              ))}
            </View>
            <Button small kind="ghost" title="All badges" onPress={() => setBadgesOpen(true)} />
          </View>

          {/* Settings */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Settings</Text>
            <View style={styles.rowBetween}>
              <Text style={styles.body}>Daily digest notification</Text>
              <Switch
                value={settings.digest}
                onValueChange={(v) => updateSettings({ digest: v })}
                trackColor={{ true: C.greenDeep, false: C.line }}
                thumbColor={settings.digest ? C.green : C.dim}
              />
            </View>
            {settings.digest ? (
              <View style={styles.rowBetween}>
                <Text style={[styles.dim, { flex: 1 }]}>Sent once a day after {hh(settings.digestHour)}, with a reminder to clock in</Text>
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
                  <Pressable key={c} onPress={() => onSwitchCluster(c)} style={[styles.segItem, cluster === c && { backgroundColor: C.green }]} accessibilityRole="button">
                    <Text style={[styles.chipText, { color: cluster === c ? "#07120a" : C.text }]}>{CLUSTERS[c].label.toUpperCase()}</Text>
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
                {String(context.period)}: {num(context.disputes)} UMA disputes on {num(context.disputed_markets)} Polymarket
                markets. Of {num(context.settled_disputed_markets)} disputed markets that settled,{" "}
                {num(context.settled_differently_from_disputed_proposal)} ({String(context.settled_differently_share)}) settled
                differently from the disputed proposal.
              </Text>
              <Text style={[styles.dim, { marginTop: 6 }]}>Source: {String(context.source)}</Text>
            </View>
          ) : null}

          <Text style={[styles.dim, { marginTop: 16, textAlign: "center" }]}>
            Data: Predge API (api.predge.io), ed25519 signed, key {PINNED_KID}. Not advice.
          </Text>
        </ScrollView>
        {overlays("main")}

        {/* Market detail */}
        <Modal visible={!!detail} statusBarTranslucent animationType="slide" onRequestClose={() => setDetailKey(null)}>
          <SafeAreaView style={styles.root}>
            {detail ? (
              <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: 0 }]}>
                <LinearGradient colors={[alpha(statusColor(detail.last?.risk_level), 0.45), C.bg]} style={styles.detailHead}>
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
                  <Text style={[styles.display, { color: statusColor(detail.last?.risk_level), marginTop: 18 }]}>{STATUS[detail.last?.risk_level ?? ""]?.word ?? "CHECKING"}</Text>
                  <Text style={[styles.question, { fontSize: T.heading + 2 }]}>{detail.question}</Text>
                  <Text style={[styles.statusBig, { color: statusColor(detail.last?.risk_level) }]}>{statusLine(detail.snapshot)}</Text>
                  <View style={styles.rowWrap}>
                    <RiskBadge level={detail.last?.risk_level} />
                    <VerifiedBadge v={detail.verification} />
                  </View>
                </LinearGradient>
                {detail.last ? <Text style={[styles.body, { marginTop: 12 }]}>{detail.last.recommendation}</Text> : null}

                <Animated.View style={{ transform: [{ translateX: shake.x }] }}>
                  <View style={[styles.card, { borderColor: detail.verification?.verified ? C.green : C.red, overflow: "hidden" }]}>
                    <View style={styles.verifyHead}>
                      <Burst play={verifyPlay} kind={detail.verification?.verified ? "ok" : "bad"} size={64} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle, { color: detail.verification?.verified ? C.green : C.red, marginBottom: 0 }]}>
                          {detail.verification?.verified ? "Verified on this phone" : "Not verified"}
                        </Text>
                        <Text style={styles.bigCount}>
                          {detail.verification?.checks.filter((c) => c.ok).length ?? 0}
                          <Text style={styles.bigCountOf}>/{detail.verification?.checks.length ?? 0}</Text>
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.dim}>
                      {detail.verification?.checks.filter((c) => c.ok).length ?? 0} of {detail.verification?.checks.length ?? 0} checks passed .
                      ed25519 signature by Predge key {PINNED_KID} . {ago(detail.verification?.verifiedAt)}
                    </Text>
                    {showChecks
                      ? detail.verification?.checks.map((c) => (
                          <View key={c.label} style={styles.checkRow}>
                            <Text style={{ color: c.ok ? C.green : C.red, width: 28, fontWeight: "800", fontFamily: MONO }}>{c.ok ? "OK" : "X"}</Text>
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
                      <View style={[styles.rowBetween, { marginTop: 10, justifyContent: "flex-start", gap: 12 }]}>
                        {!tamper.verified ? <Burst play={rejectPlay} kind="bad" size={44} /> : null}
                        <Text style={[styles.body, { flex: 1, color: tamper.verified ? C.red : C.greenBright }]}>
                          Tamper test: one character of the signed bytes changed.{" "}
                          {tamper.verified ? "Still verified (unexpected)." : "Rejected, as it should be."}
                        </Text>
                      </View>
                    ) : null}
                    <Animated.View
                      pointerEvents="none"
                      style={[StyleSheet.absoluteFill, { backgroundColor: C.red, opacity: shake.flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] }) }]}
                    />
                  </View>
                </Animated.View>

                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Receipt on Solana {net}</Text>
                  <Text style={styles.dim}>
                    Writes the hash of this verified record into a memo transaction, signed by your wallet through Mobile Wallet Adapter. You keep
                    a public, timestamped proof of exactly what you were shown.
                  </Text>
                  {detail.verification?.packHash && detail.last ? (
                    <Text style={[styles.mono, { fontSize: 11, marginVertical: 6, color: C.greenDeep }]}>
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
                      <Text style={[styles.mono, { color: C.purpleSoft, marginTop: 6 }]}>
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
            {stamp ? (
              <View style={styles.stamp} pointerEvents="none">
                <Burst play={stampPlay} size={150} />
                <Text style={styles.stampText}>RECEIPT ON SOLANA</Text>
              </View>
            ) : null}
            {overlays("detail")}
          </SafeAreaView>
        </Modal>

        {/* Badges */}
        <Modal visible={badgesOpen} statusBarTranslucent animationType="slide" onRequestClose={() => setBadgesOpen(false)}>
          <SafeAreaView style={styles.root}>
            <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: 0 }]}>
              <LinearGradient colors={["#2f1763", "#123022", C.bg]} locations={[0, 0.55, 1]} style={styles.detailHead}>
                <View style={styles.rowBetween}>
                  <Button small kind="ghost" title="Back" onPress={() => setBadgesOpen(false)} />
                  <LevelBadge index={level.index} progress={level.progress} size={52} />
                </View>
                <Text style={[styles.display, { marginTop: 14 }]}>{level.name}</Text>
                <Text style={styles.subtitle}>
                  Level {level.index + 1} . {game.xp} XP{level.next ? ` . ${level.toNext} to ${level.next}` : ""}
                </Text>
                <Text style={[styles.subtitle, { marginTop: 4 }]}>
                  Streak {streak} . best {game.best} . kept on this phone only
                </Text>
              </LinearGradient>
              <Text style={styles.section}>
                Badges ({unlocked} of {BADGES.length})
              </Text>
              <View style={styles.badgeGrid}>
                {BADGES.map((b) => {
                  const at = game.badges[b.id];
                  return (
                    <View key={b.id} style={[styles.badgeCell, at ? { borderColor: alpha(C.green, 0.5) } : { opacity: 0.75 }]} accessibilityLabel={`${b.name}, ${at ? "unlocked" : "locked"}`}>
                      <BadgeIcon id={b.id} size={72} locked={!at} />
                      <Text style={[styles.badgeName, !at && { color: C.dim }]}>{b.name}</Text>
                      <Text style={[styles.dim, { textAlign: "center" }]}>{at ? `Unlocked ${at.slice(0, 10)}` : b.hint}</Text>
                    </View>
                  );
                })}
              </View>
              <Text style={styles.section}>How XP works</Text>
              <View style={styles.card}>
                {(Object.keys(XP) as (keyof typeof XP)[]).map((k) => (
                  <View key={k} style={[styles.rowBetween, { paddingVertical: 4 }]}>
                    <Text style={[styles.body, { flex: 1 }]}>{ACTION_LABEL[k]}</Text>
                    <Text style={[styles.mono, { color: C.green }]}>+{XP[k]}</Text>
                  </View>
                ))}
                <Text style={[styles.dim, { marginTop: 8 }]}>
                  Each market counts once for verify and add. Levels: {LEVELS.map((l) => `${l.name} ${l.min}`).join(", ")}. XP is a personal log, not money.
                </Text>
              </View>
            </ScrollView>
            {overlays("badges")}
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {content}
      {!introDone ? <Intro onDone={() => setIntroDone(true)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 56 },
  header: { marginHorizontal: -16, paddingHorizontal: 20, paddingTop: 48, paddingBottom: 28, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  detailHead: { marginHorizontal: -16, paddingHorizontal: 16, paddingTop: 52, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brand: { color: C.greenBright, fontFamily: MONO, fontSize: T.small, fontWeight: "800", letterSpacing: 3 },
  display: { color: C.text, fontFamily: MONO, fontSize: T.display, fontWeight: "800", marginTop: 16, letterSpacing: 0.5 },
  subtitle: { color: C.dim, fontSize: T.small, marginTop: 2, lineHeight: 19 },
  hero: { backgroundColor: C.cream, borderRadius: 24, padding: 18, marginTop: -8, shadowColor: "#000", elevation: 8 },
  heroKicker: { color: C.ink, fontFamily: MONO, fontWeight: "800", fontSize: T.heading, letterSpacing: 4 },
  heroDim: { color: C.inkSoft, fontSize: T.small, lineHeight: 18 },
  heroBody: { color: C.ink, fontSize: T.body, lineHeight: 22, marginTop: 8 },
  heroRowTitle: { color: C.ink, fontSize: T.body, fontWeight: "700" },
  heroRule: { height: 1, backgroundColor: alpha(C.ink, 0.18), marginVertical: 14 },
  streakRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  streakNum: { color: C.ink, fontFamily: MONO, fontWeight: "800", fontSize: 30 },
  streakUnit: { fontSize: T.body, fontWeight: "700" },
  weekRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
  weekCell: { alignItems: "center", gap: 4 },
  weekDot: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: alpha(C.ink, 0.25), alignItems: "center", justifyContent: "center" },
  weekLabel: { color: C.inkSoft, fontFamily: MONO, fontSize: T.micro, fontWeight: "700" },
  clockRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  clockBtn: { backgroundColor: C.ink, borderRadius: 16, paddingVertical: 15, alignItems: "center" },
  clockBtnText: { color: C.greenBright, fontFamily: MONO, fontWeight: "800", fontSize: T.body, letterSpacing: 1.5 },
  card: { backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 20, padding: 16, marginTop: 14 },
  market: { borderWidth: 1, borderRadius: 20, padding: 14, marginTop: 12, overflow: "hidden" },
  stripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 6 },
  statusWord: { fontFamily: MONO, fontSize: T.heading, fontWeight: "800", letterSpacing: 2 },
  recap: { borderRadius: 20, padding: 16, marginTop: 14, borderWidth: 1, borderColor: alpha(C.purple, 0.4) },
  recapText: { color: C.text, fontSize: T.heading, fontWeight: "700", lineHeight: 25, marginVertical: 6 },
  cardTitle: { color: C.text, fontSize: T.body + 1, fontWeight: "800", marginBottom: 6 },
  cardLabel: { color: C.dim, fontSize: T.micro, fontWeight: "800", letterSpacing: 1, marginBottom: 2, textTransform: "uppercase", fontFamily: MONO },
  section: { color: C.text, fontSize: T.heading, fontWeight: "800", marginTop: 24, fontFamily: MONO },
  question: { color: C.text, fontSize: T.body + 1, fontWeight: "700", marginVertical: 4, lineHeight: 22 },
  statusBig: { fontSize: T.heading, fontWeight: "700", marginBottom: 6 },
  body: { color: C.text, fontSize: T.body, lineHeight: 21, marginVertical: 2 },
  dim: { color: C.dim, fontSize: T.small, lineHeight: 18 },
  mono: { color: C.text, fontFamily: MONO, fontSize: T.small },
  input: {
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 14,
    backgroundColor: C.bg,
    color: C.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: T.body,
    marginVertical: 8,
  },
  row: { flexDirection: "row", gap: 8, marginTop: 8, alignItems: "center" },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6, alignItems: "center" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  checkRow: { flexDirection: "row", alignItems: "flex-start", marginVertical: 4 },
  todayRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  glance: { flexDirection: "row", gap: 8, marginTop: 10 },
  glanceCell: { flex: 1, borderWidth: 1, borderRadius: 16, paddingVertical: 10, alignItems: "center" },
  glanceNum: { fontSize: 26, fontWeight: "800", fontFamily: MONO },
  glanceLabel: { fontSize: T.micro, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase", fontFamily: MONO },
  segment: { flexDirection: "row", borderColor: C.line, borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  segItem: { paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: T.micro, fontWeight: "800", letterSpacing: 0.6, fontFamily: MONO },
  verifyHead: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 8 },
  bigCount: { color: C.text, fontFamily: MONO, fontSize: T.display, fontWeight: "800" },
  bigCountOf: { color: C.dim, fontSize: T.heading },
  stamp: { ...StyleSheet.absoluteFillObject, backgroundColor: "#0a0f0bd9", alignItems: "center", justifyContent: "center", zIndex: 40 },
  stampText: { color: C.greenBright, fontFamily: MONO, fontWeight: "800", letterSpacing: 4, marginTop: 18, fontSize: T.body },
  badgeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  badgeCell: { width: "48%", flexGrow: 1, backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 18, padding: 14, alignItems: "center", gap: 6 },
  badgeName: { color: C.text, fontWeight: "800", fontSize: T.body, textAlign: "center" },
  onb: { flex: 1, padding: 24, paddingTop: 56 },
  kicker: { color: C.green, fontSize: T.small, fontWeight: "800", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10, fontFamily: MONO },
  onbTitle: { color: C.text, fontSize: 30, fontWeight: "800", lineHeight: 36, marginBottom: 14 },
  onbBody: { color: C.text, fontSize: 16, lineHeight: 25 },
  dots: { flexDirection: "row", gap: 6, justifyContent: "center", marginBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.line },
  dotBig: { width: 12, height: 12, borderRadius: 6 },
});
