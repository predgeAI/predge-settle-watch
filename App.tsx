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
import { fetchSettlementRisk, MAX_INPUT_LENGTH, parseMarketInput, type SettlementRisk } from "./src/api";
import { verifyRecord, type Verification } from "./src/verify";
import { CLUSTERS, EXPLORER_TX, FOREGROUND_POLL_MS, MAX_WATCHLIST, PINNED_KID, type Cluster } from "./src/config";
import {
  changesLast24h,
  DEFAULT_SETTINGS,
  loadSettings,
  loadWallet,
  loadPending,
  loadWatchlist,
  savePending,
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
import { anchorPack, balanceSol, confirmByPolling, connectionFor, connectWallet, disconnectWallet, friendlyWalletError, memoText, requestDevnetAirdrop, type PendingReceipt } from "./src/wallet";
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
import { alpha, C, MONO, PX, STATUS, STATUS_ORDER, T } from "./src/theme";
import * as haptic from "./src/haptic";
import { BadgeIcon, Burst, Button, CelebrationOverlay, Chip, Flame, LevelBadge, LiveMascot, PixelBar, PixelBox, Press, Reveal, Scanlines, StatusIcon, useReducedMotion, useShake, XpToast, type Celebration } from "./src/ui";
import { PixelIcon, type Mood } from "./src/sprites";
import Onboarding from "./src/Onboarding";
import { FLAGS } from "./src/features";
import { DiscoverCard, DiscoverModal } from "./src/discover/Discover";
import { RuleDetectiveCard, RuleDetectiveModal } from "./src/ruleDetective/RuleDetective";
import { GlossaryEntry, GlossaryModal } from "./src/glossary/Glossary";
import { DailyDisputeCard, DailyDisputeModal } from "./src/dailyDispute/DailyDispute";
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

/** Plain wording for a failed add. */
function friendlyAddError(e: unknown): string {
  const m = (e as Error)?.message ?? "";
  if (/network request failed|timed out|failed to fetch|HTTP 5\d\d|aborted/i.test(m)) {
    return "Could not reach the market data right now. Check your connection and try again in a moment.";
  }
  return m.slice(0, 200) || "Something went wrong. Try again.";
}

/** Bold, color-coded market card with a pixel icon. Pulses when its status changes. */
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
    <Reveal delay={Math.min(index, 6) * 60} style={{ marginTop: 12 }}>
      <Press onPress={onOpen} label={item.question ?? item.key}>
        <PixelBox border={color} bg={alpha(color, 0.1)} lift={alpha(color, 0.55)} inner={{ padding: 14 }}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color, opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] }) }]} />
          <View style={styles.rowBetween}>
            <View style={styles.statusHead}>
              <StatusIcon level={level} color={color} px={3} />
              <Text style={[styles.statusWord, { color }]}>{STATUS[level]?.word ?? "CHECKING"}</Text>
            </View>
            <Text style={[styles.dim, { flexShrink: 1, textAlign: "right" }]}>
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
        </PixelBox>
      </Press>
    </Reveal>
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
  const anchoringRef = useRef(false);
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
  const [puzzleOpen, setPuzzleOpen] = useState(false);
  const [pendingExamples, setPendingExamples] = useState<string[]>([]);
  const [puzzleTick, setPuzzleTick] = useState(0);
  const [glossOpen, setGlossOpen] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [glossTick, setGlossTick] = useState(0);
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
    async (raw: string, opts: { quiet?: boolean } = {}): Promise<boolean> => {
      const key = parseMarketInput(raw);
      if (!key) {
        if (!opts.quiet) Alert.alert("Not a market", "Paste a polymarket.com link, a market slug, a numeric market id or a 0x condition id.");
        return false;
      }
      const current = await loadWatchlist();
      if (current.length >= MAX_WATCHLIST) {
        Alert.alert("Watchlist full", `Up to ${MAX_WATCHLIST} markets. Remove one first.`);
        return false;
      }
      if (current.some((i) => i.key === key || i.marketId === key)) {
        if (!opts.quiet) Alert.alert("Already watching", key);
        return true;
      }
      setBusy("add");
      try {
        const r = await fetchSettlementRisk(key);
        if (current.some((i) => i.marketId === r.market.market_id)) {
          if (!opts.quiet) Alert.alert("Already watching", r.market.question);
          return true;
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
        return true;
      } catch (e) {
        // Quiet adds (the example markets) retry on their own, so no alert for a network problem.
        if (!opts.quiet) Alert.alert("Could not add market", friendlyAddError(e));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [persist, award]
  );

  const finishOnboarding = useCallback(
    async (addExamples: boolean, clockedIn = false) => {
      await updateSettings({ onboarded: true });
      if (clockedIn) doClockIn();
      await setupNotifications();
      setBgOk(await registerBackgroundPolling());
      if (addExamples) {
        const missed: string[] = [];
        for (const e of [...EXAMPLES].reverse()) if (!(await addMarket(e.key, { quiet: true }))) missed.push(e.key);
        setPendingExamples(missed);
      }
    },
    [updateSettings, addMarket, doClockIn]
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

  /** Adds a finished receipt to the market's list and timeline, and credits the XP. */
  const recordAnchor = useCallback(
    async (key: string, signature: string, packHash: string, action: "watch" | "acknowledge", riskLevel: string, c: Cluster) => {
      const now = new Date().toISOString();
      const list = await loadWatchlist();
      const next = list.map((i) =>
        i.key === key && !i.anchors.some((a) => a.signature === signature)
          ? {
              ...i,
              anchors: [{ signature, packHash, action, riskLevel, at: now, cluster: c }, ...i.anchors],
              timeline: [{ at: now, text: `Receipt anchored on Solana ${CLUSTERS[c].label} (${action})`, verified: true, kind: "receipt" as const }, ...i.timeline],
            }
          : i
      );
      await persist(next);
      award("anchor", { ref: signature });
    },
    [persist, award]
  );

  const doAnchor = useCallback(
    async (item: WatchItem, action: "watch" | "acknowledge") => {
      if (!wallet) return;
      const v = item.verification;
      const last = item.last;
      if (!v?.verified || !v.packHash || !last) return;
      const packHash = v.packHash;
      const pending: PendingReceipt = {
        key: item.key,
        marketId: last.market.market_id,
        riskLevel: last.risk_level,
        packHash,
        action,
        cluster,
        startedAt: new Date().toISOString(),
      };
      setBusy(`anchor:${item.key}`);
      anchoringRef.current = true;
      let signed = false;
      try {
        // Remember the attempt, so if Android recreates the app behind the wallet we can finish or explain.
        await savePending(pending);
        const { signature, wallet: w, confirmed } = await anchorPack(
          wallet,
          { action, marketId: pending.marketId, riskLevel: pending.riskLevel, packHash },
          cluster,
          async (sig) => {
            signed = true;
            await savePending({ ...pending, signature: sig });
          }
        );
        setWallet(w);
        await saveWallet(w);
        await recordAnchor(item.key, signature, packHash, action, last.risk_level, cluster);
        await savePending(null);
        refreshBalance(w, cluster);
        haptic.success();
        setStampPlay((n) => n + 1);
        setStamp(true);
        await new Promise((res) => setTimeout(res, reduced ? 300 : 1300));
        setStamp(false);
        Alert.alert(`Receipt on Solana ${net}`, `Memo tx ${short(signature, 6)}${confirmed ? "" : "\n\nSent. The network has not confirmed it yet, so the explorer may take a minute."}`, [
          { text: "Open explorer", onPress: () => openExplorer(signature, cluster) },
          { text: "OK" },
        ]);
      } catch (e) {
        if (!signed) await savePending(null);
        Alert.alert(
          "Anchor failed",
          `${friendlyWalletError(e)}\n\n${cluster === "devnet" ? 'On devnet the wallet needs a little SOL for the fee: tap "Devnet SOL".' : "The wallet needs a little SOL for the network fee."}`
        );
      } finally {
        anchoringRef.current = false;
        setBusy(null);
      }
    },
    [wallet, cluster, net, refreshBalance, reduced, recordAnchor]
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

  // Finish or explain a receipt that was interrupted, for example if Android recreated the app behind the wallet.
  useEffect(() => {
    if (!settings?.onboarded) return;
    (async () => {
      const p = await loadPending<PendingReceipt>();
      if (!p || anchoringRef.current) return;
      await savePending(null);
      if (p.signature) {
        const ok = await confirmByPolling(connectionFor(p.cluster), p.signature, 15_000).catch(() => false);
        await recordAnchor(p.key, p.signature, p.packHash, p.action, p.riskLevel, p.cluster);
        Alert.alert("Receipt saved", ok ? "Your earlier receipt finished and is now in the market's list." : "Your earlier receipt was sent. It is in the market's list and may take a minute to confirm.");
      } else {
        Alert.alert("Receipt not finished", "A receipt was started but the wallet did not return in time. Nothing was sent. Tap Anchor watch receipt to try again.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.onboarded]);

  // Example markets that failed to load (for example a blocked network) retry on their own.
  useEffect(() => {
    if (!pendingExamples.length) return;
    let busyRetry = false;
    const id = setInterval(async () => {
      if (busyRetry) return;
      busyRetry = true;
      const left: string[] = [];
      for (const k of pendingExamples) if (!(await addMarket(k, { quiet: true }))) left.push(k);
      busyRetry = false;
      if (left.length !== pendingExamples.length) setPendingExamples(left);
    }, 25_000);
    return () => clearInterval(id);
  }, [pendingExamples, addMarket]);

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
  const top = discoverOpen ? "discover" : ruleOpen ? "rule" : puzzleOpen ? "puzzle" : badgesOpen ? "badges" : detail ? "detail" : "main";
  const overlays = (where: string) => (
    <>
      <XpToast text={toast.text} tick={toast.tick} />
      <CelebrationOverlay item={where === top ? (celebs[0] ?? null) : null} onClose={() => setCelebs((c) => c.slice(1))} />
    </>
  );
  // The Watcher mirrors the watchlist: asleep when quiet, alarmed on caution or watch, cheering once clocked in.
  const homeMood: Mood = !items.length ? "sleep" : counts.caution + counts.watch > 0 ? "alarm" : !canIn ? "cheer" : "sleep";
  const detailMood: Mood = !detail ? "idle" : detail.last?.risk_level === "caution" || detail.last?.risk_level === "watch" ? "alarm" : detail.last?.risk_level === "resolved" ? "cheer" : "sleep";

  let content: React.ReactNode;
  if (!settings) {
    content = (
      <SafeAreaView style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <LiveMascot mood="idle" px={6} />
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
          <View style={styles.header}>
            <View style={styles.rowBetween}>
              <Text style={styles.brand}>SETTLE WATCH</Text>
              <Press onPress={() => setBadgesOpen(true)} label={`Level ${level.index + 1} ${level.name}, open badges`}>
                <LevelBadge index={level.index} progress={level.progress} />
              </Press>
            </View>
            <Text style={styles.display}>{level.name.toUpperCase()}</Text>
            <View style={{ marginTop: 10 }}>
              <PixelBar value={level.progress} />
            </View>
            <Text style={[styles.subtitle, { marginTop: 8 }]}>
              {game.xp} XP{level.next ? ` . ${level.toNext} to ${level.next}` : " . top level"}
            </Text>
            <Text style={[styles.subtitle, { marginTop: 8 }]}>Settlement alerts for Polymarket, verified on your phone</Text>
            <View style={styles.stepRow}>
              {Array.from({ length: 24 }).map((_, i) => (
                <View key={i} style={[styles.stepBit, { backgroundColor: i % 3 === 0 ? alpha(C.purple, 0.55) : alpha(C.green, 0.35) }]} />
              ))}
            </View>
          </View>

          {pendingExamples.length ? (
            <PixelBox border={C.orange} bg={alpha(C.orange, 0.1)} style={{ marginTop: 14 }} inner={{ padding: 12 }}>
              <Text style={styles.body}>
                Still loading {pendingExamples.length} example market{pendingExamples.length > 1 ? "s" : ""}. The network is slow, so the app keeps trying.
              </Text>
            </PixelBox>
          ) : null}

          {/* Today: the hero, on paper */}
          <PixelBox border={C.ink} bg={C.cream} lift="#8c7f66" style={{ marginTop: 14 }} inner={{ padding: 16 }}>
            <View style={styles.rowBetween}>
              <Text style={styles.heroKicker}>TODAY</Text>
              <View style={{ marginTop: -4 }}>
                <LiveMascot mood={homeMood} px={4} />
              </View>
            </View>
            <Text style={styles.heroDim}>last 24 h . checked {ago(lastCheck)}</Text>
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
              <Flame size={5} lit={streak > 0} />
              <View style={{ flex: 1 }}>
                <Text style={styles.streakNum}>
                  {streak} <Text style={styles.streakUnit}>DAY STREAK</Text>
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
                      d.saved && !d.done && { borderColor: C.purple, backgroundColor: alpha(C.purple, 0.2) },
                      d.today && !d.done && { borderColor: C.ink, borderStyle: "dashed" },
                    ]}
                  >
                    {d.done ? <PixelIcon name="check" px={3} color={C.green} /> : null}
                  </View>
                  <Text style={styles.weekLabel}>{d.label}</Text>
                </View>
              ))}
            </View>
            <View style={styles.clockRow}>
              {clockPlay > 0 && !canIn ? <Burst play={clockPlay} size={46} /> : null}
              <View style={{ flex: 1 }}>
                <Press onPress={doClockIn} disabled={!canIn} haptics={false} label={canIn ? "Clock in" : "Clocked in today"}>
                  <PixelBox border={canIn ? C.ink : alpha(C.ink, 0.25)} bg={canIn ? C.ink : alpha(C.ink, 0.1)} lift={canIn ? "#000000" : undefined} inner={{ paddingVertical: 15, alignItems: "center" }}>
                    <Text style={[styles.clockBtnText, !canIn && { color: C.inkSoft }]}>{canIn ? `CLOCK IN +${XP.clock_in + Math.min(streak + 1, 7) * 2} XP` : "CLOCKED IN TODAY"}</Text>
                  </PixelBox>
                </Press>
              </View>
            </View>
            <Text style={[styles.heroDim, { marginTop: 10 }]}>
              {settings.digest ? `Daily digest at ${hh(settings.digestHour)}.` : "Daily digest is off."}{" "}
              {bgOk === false ? "Background checks are off on this phone." : "Live checks while open, about every 15 min in the background."}
            </Text>
          </PixelBox>

          {FLAGS.dailyDispute ? <DailyDisputeCard refreshKey={puzzleTick} onOpen={() => setPuzzleOpen(true)} /> : null}

          {/* Wallet: one compact row */}
          <PixelBox style={styles.cardGap} inner={[styles.cardPad, wallet ? { gap: 10 } : styles.rowBetween]}>
            <View style={wallet ? undefined : { flex: 1 }}>
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
          </PixelBox>

          {/* Watchlist at a glance */}
          <Text style={styles.section}>WATCHLIST ({items.length})</Text>
          {items.length ? (
            <View style={styles.glance}>
              {STATUS_ORDER.map((r) => (
                <Press key={r} onPress={() => setFilter(filter === r ? null : r)} label={`Show ${STATUS[r].label} markets`} fill>
                  <PixelBox
                    p={3}
                    border={alpha(STATUS[r].color, filter === r ? 1 : 0.5)}
                    bg={alpha(STATUS[r].color, filter === r ? 0.28 : 0.1)}
                    inner={{ paddingVertical: 10, alignItems: "center", gap: 6 }}
                  >
                    <StatusIcon level={r} color={STATUS[r].color} px={2} />
                    <Text style={[styles.glanceNum, { color: STATUS[r].color }]}>{counts[r]}</Text>
                    <Text style={[styles.glanceLabel, { color: STATUS[r].color }]}>{STATUS[r].label}</Text>
                  </PixelBox>
                </Press>
              ))}
            </View>
          ) : null}
          {filter ? <Text style={[styles.dim, { marginTop: 6 }]}>Showing {STATUS[filter].label} only. Tap again to show all.</Text> : null}
          {shown.map((it, i) => (
            <MarketCard key={it.key} item={it} index={i} onOpen={() => openDetail(it.key)} />
          ))}

          {/* Add a market */}
          <PixelBox style={styles.cardGap} inner={styles.cardPad}>
            <Text style={styles.cardTitle}>WATCH A MARKET</Text>
            <PixelBox p={2} border={C.line} bg={C.bg} style={{ marginVertical: 8 }} inner={{ paddingHorizontal: 12 }}>
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
            </PixelBox>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Button title={busy === "add" ? "Checking..." : "Add to watchlist"} onPress={() => addMarket(input)} disabled={!!busy} />
              </View>
              <Button
                kind="ghost"
                title="Paste"
                onPress={async () => setInput((await Clipboard.getStringAsync()).slice(0, MAX_INPUT_LENGTH))}
                disabled={!!busy}
              />
            </View>
            <Text style={[styles.dim, { marginTop: 10 }]}>Examples (real markets)</Text>
            <View style={styles.rowWrap}>
              {EXAMPLES.map((e) => (
                <Button key={e.key} small kind="ghost" title={e.label} onPress={() => addMarket(e.key)} disabled={!!busy} />
              ))}
            </View>
          </PixelBox>

          {FLAGS.discover ? <DiscoverCard onOpen={() => setDiscoverOpen(true)} /> : null}
          {FLAGS.ruleDetective ? <RuleDetectiveCard onOpen={() => setRuleOpen(true)} /> : null}
          {FLAGS.glossary ? <GlossaryEntry game={game} refreshKey={glossTick} onOpen={() => setGlossOpen(true)} /> : null}

          {/* Weekly recap */}
          <PixelBox border={C.purple} bg="#1b1233" style={styles.cardGap} inner={styles.cardPad}>
            <Text style={styles.cardLabel}>Weekly recap</Text>
            <Text style={styles.recapText}>{recap.text}</Text>
            <Text style={styles.dim}>{recap.xp} XP earned since Monday.</Text>
          </PixelBox>

          {/* Badges */}
          <PixelBox style={styles.cardGap} inner={styles.cardPad}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>BADGES</Text>
              <Text style={styles.dim}>
                {unlocked} of {BADGES.length} unlocked
              </Text>
            </View>
            <View style={[styles.rowBetween, { marginVertical: 10 }]}>
              {BADGES.map((b) => (
                <BadgeIcon key={b.id} id={b.id} size={40} locked={!game.badges[b.id]} />
              ))}
            </View>
            <Button small kind="ghost" title="All badges" onPress={() => setBadgesOpen(true)} />
          </PixelBox>

          {/* Settings */}
          <PixelBox style={styles.cardGap} inner={styles.cardPad}>
            <Text style={styles.cardTitle}>SETTINGS</Text>
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
            <View style={[styles.rowBetween, { marginTop: 12 }]}>
              <Text style={styles.body}>Receipt network</Text>
              <View style={styles.row}>
                {(["devnet", "mainnet-beta"] as Cluster[]).map((c) => (
                  <Press key={c} onPress={() => onSwitchCluster(c)} label={CLUSTERS[c].label}>
                    <PixelBox p={2} border={cluster === c ? "#2f6b38" : C.line} bg={cluster === c ? C.green : C.surfaceHi} inner={{ paddingHorizontal: 8, paddingVertical: 8 }}>
                      <Text style={[styles.chipText, { color: cluster === c ? "#07120a" : C.text }]}>{CLUSTERS[c].label.toUpperCase()}</Text>
                    </PixelBox>
                  </Press>
                ))}
              </View>
            </View>
            <View style={[styles.rowWrap, { marginTop: 12 }]}>
              <Button small kind="ghost" title="Check now" onPress={refreshAll} />
              <Button small kind="ghost" title="Digest now" onPress={onDigestNow} />
              <Button small kind="ghost" title="Send test alert" onPress={onTestAlert} />
              <Button small kind="ghost" title="Show intro" onPress={() => updateSettings({ onboarded: false })} />
            </View>
            <View style={styles.howRule} />
            <Text style={styles.cardTitle}>HOW IT WORKS</Text>
            <Text style={styles.body}>
              On Polymarket a proposed outcome can be disputed in a UMA vote. Add markets to your watchlist. When one gets a dispute, a clarification, a UMA vote or settles on chain, your phone alerts you.
            </Text>
            <Text style={styles.body}>
              Every record is signed by Predge with ed25519, and this phone verifies the signature before it shows you anything. Anchor a receipt to save a Solana memo of exactly what you saw, signed by your wallet.
            </Text>
            {context ? (
              <>
                <Text style={[styles.body, { marginTop: 6 }]}>
                  {String(context.period)}: {num(context.disputes)} UMA disputes on {num(context.disputed_markets)} Polymarket
                  markets. Of {num(context.settled_disputed_markets)} disputed markets that settled,{" "}
                  {num(context.settled_differently_from_disputed_proposal)} ({String(context.settled_differently_share)}) settled
                  differently from the disputed proposal.
                </Text>
                <Text style={[styles.dim, { marginTop: 6 }]}>Source: {String(context.source)}</Text>
              </>
            ) : null}
          </PixelBox>

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
                <View style={[styles.detailHead, { backgroundColor: alpha(statusColor(detail.last?.risk_level), 0.16), borderBottomColor: statusColor(detail.last?.risk_level) }]}>
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
                  <View style={[styles.rowBetween, { marginTop: 18 }]}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.statusHead}>
                        <StatusIcon level={detail.last?.risk_level} color={statusColor(detail.last?.risk_level)} px={4} />
                        <Text style={[styles.display, { color: statusColor(detail.last?.risk_level), marginTop: 0, fontSize: 20 }]}>{STATUS[detail.last?.risk_level ?? ""]?.word ?? "CHECKING"}</Text>
                      </View>
                    </View>
                    <LiveMascot mood={detailMood} px={4} />
                  </View>
                  <Text style={[styles.question, { fontSize: T.heading + 2, marginTop: 12 }]}>{detail.question}</Text>
                  <Text style={[styles.statusBig, { color: statusColor(detail.last?.risk_level) }]}>{statusLine(detail.snapshot)}</Text>
                  <View style={styles.rowWrap}>
                    <RiskBadge level={detail.last?.risk_level} />
                    <VerifiedBadge v={detail.verification} />
                  </View>
                </View>
                {detail.last ? <Text style={[styles.body, { marginTop: 12 }]}>{detail.last.recommendation}</Text> : null}

                <Animated.View style={{ transform: [{ translateX: shake.x }] }}>
                  <PixelBox border={detail.verification?.verified ? C.green : C.red} style={styles.cardGap} inner={styles.cardPad}>
                    <View style={styles.verifyHead}>
                      <Burst play={verifyPlay} kind={detail.verification?.verified ? "ok" : "bad"} size={72} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle, { color: detail.verification?.verified ? C.green : C.red, marginBottom: 6 }]}>
                          {detail.verification?.verified ? "VERIFIED ON THIS PHONE" : "NOT VERIFIED"}
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
                            <Text style={{ color: c.ok ? C.green : C.red, width: 36, fontFamily: PX, fontSize: 10 }}>{c.ok ? "OK" : "X"}</Text>
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
                      <View style={[styles.rowBetween, { marginTop: 12, justifyContent: "flex-start", gap: 12 }]}>
                        {!tamper.verified ? <Burst play={rejectPlay} kind="bad" size={52} /> : null}
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
                  </PixelBox>
                </Animated.View>

                <PixelBox style={styles.cardGap} inner={styles.cardPad}>
                  <Text style={styles.cardTitle}>RECEIPT ON SOLANA {net.toUpperCase()}</Text>
                  <Text style={styles.dim}>
                    Writes the hash of this verified record into a memo transaction, signed by your wallet through Mobile Wallet Adapter. You keep
                    a public, timestamped proof of exactly what you were shown.
                  </Text>
                  {detail.verification?.packHash && detail.last ? (
                    <Text style={[styles.mono, { fontSize: 11, marginVertical: 8, color: C.greenDeep }]}>
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
                </PixelBox>

                <PixelBox style={styles.cardGap} inner={styles.cardPad}>
                  <Text style={styles.cardTitle}>TIMELINE</Text>
                  {detail.timeline.map((t, i) => (
                    <Text key={`${t.at}-${i}`} style={styles.body}>
                      <Text style={styles.dim}>{t.at.replace("T", " ").slice(0, 16)} </Text>
                      {t.text}
                    </Text>
                  ))}
                  {detail.last?.disputes?.length ? (
                    <>
                      <Text style={[styles.cardTitle, { marginTop: 12 }]}>DISPUTES ON CHAIN</Text>
                      {detail.last.disputes.map((d, i) => (
                        <Text key={i} style={[styles.mono, { fontSize: 11, color: C.dim }]}>
                          {JSON.stringify(d).slice(0, 240)}
                        </Text>
                      ))}
                    </>
                  ) : null}
                </PixelBox>
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
            <Scanlines />
          </SafeAreaView>
        </Modal>

        {/* Badges */}
        <Modal visible={badgesOpen} statusBarTranslucent animationType="slide" onRequestClose={() => setBadgesOpen(false)}>
          <SafeAreaView style={styles.root}>
            <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: 0 }]}>
              <View style={styles.header}>
                <View style={styles.rowBetween}>
                  <Button small kind="ghost" title="Back" onPress={() => setBadgesOpen(false)} />
                  <LevelBadge index={level.index} progress={level.progress} />
                </View>
                <View style={[styles.rowBetween, { marginTop: 14 }]}>
                  <Text style={[styles.display, { marginTop: 0 }]}>{level.name.toUpperCase()}</Text>
                  <LiveMascot mood="cheer" px={4} />
                </View>
                <View style={{ marginTop: 10 }}>
                  <PixelBar value={level.progress} />
                </View>
                <Text style={[styles.subtitle, { marginTop: 8 }]}>
                  Level {level.index + 1} . {game.xp} XP{level.next ? ` . ${level.toNext} to ${level.next}` : ""}
                </Text>
                <Text style={[styles.subtitle, { marginTop: 4 }]}>
                  Streak {streak} . best {game.best} . kept on this phone only
                </Text>
              </View>
              <Text style={styles.section}>
                BADGES ({unlocked} of {BADGES.length})
              </Text>
              <View style={styles.badgeGrid}>
                {BADGES.map((b) => {
                  const at = game.badges[b.id];
                  return (
                    <View key={b.id} style={{ width: "48%", flexGrow: 1 }} accessibilityLabel={`${b.name}, ${at ? "unlocked" : "locked"}`}>
                      <PixelBox border={at ? C.green : C.line} inner={[styles.badgeCell, !at && { opacity: 0.8 }]}>
                        <BadgeIcon id={b.id} size={72} locked={!at} />
                        <Text style={[styles.badgeName, !at && { color: C.dim }]}>{b.name}</Text>
                        <Text style={[styles.dim, { textAlign: "center" }]}>{at ? `Unlocked ${at.slice(0, 10)}` : b.hint}</Text>
                      </PixelBox>
                    </View>
                  );
                })}
              </View>
              <Text style={styles.section}>HOW XP WORKS</Text>
              <PixelBox style={styles.cardGap} inner={styles.cardPad}>
                {(Object.keys(XP) as (keyof typeof XP)[]).map((k) => (
                  <View key={k} style={[styles.rowBetween, { paddingVertical: 5 }]}>
                    <Text style={[styles.body, { flex: 1 }]}>{ACTION_LABEL[k]}</Text>
                    <Text style={[styles.chipText, { color: C.green, fontSize: 10 }]}>+{XP[k]}</Text>
                  </View>
                ))}
                <Text style={[styles.dim, { marginTop: 8 }]}>
                  Each market counts once for verify and add. Levels: {LEVELS.map((l) => `${l.name} ${l.min}`).join(", ")}. XP is a personal log, not money.
                </Text>
              </PixelBox>
            </ScrollView>
            {overlays("badges")}
            <Scanlines />
          </SafeAreaView>
        </Modal>
        {FLAGS.discover ? (
          <DiscoverModal
            visible={discoverOpen}
            onClose={() => setDiscoverOpen(false)}
            watchingIds={items.map((i) => i.marketId ?? i.key)}
            onWatch={(id) => addMarket(id)}
            overlay={overlays("discover")}
          />
        ) : null}
        {FLAGS.ruleDetective ? (
          <RuleDetectiveModal visible={ruleOpen} onClose={() => setRuleOpen(false)} award={(kind, ref) => award(kind, { ref })} overlay={overlays("rule")} />
        ) : null}
        {FLAGS.glossary ? (
          <GlossaryModal
            visible={glossOpen}
            game={game}
            refreshKey={glossTick}
            onClose={() => {
              setGlossOpen(false);
              setGlossTick((n) => n + 1);
            }}
          />
        ) : null}
        {FLAGS.dailyDispute ? (
          <DailyDisputeModal
            visible={puzzleOpen}
            onClose={() => {
              setPuzzleOpen(false);
              setPuzzleTick((n) => n + 1);
            }}
            award={(kind, ref) => award(kind, { ref })}
            overlay={overlays("puzzle")}
          />
        ) : null}
        <Scanlines />
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
  header: { marginHorizontal: -16, paddingHorizontal: 20, paddingTop: 52, paddingBottom: 18, backgroundColor: "#160f2b", borderBottomWidth: 4, borderBottomColor: C.purple },
  detailHead: { marginHorizontal: -16, paddingHorizontal: 16, paddingTop: 52, paddingBottom: 18, borderBottomWidth: 4 },
  stepRow: { flexDirection: "row", marginTop: 14, marginHorizontal: -20, marginBottom: -18 },
  stepBit: { flex: 1, height: 4 },
  brand: { color: C.greenBright, fontFamily: PX, fontSize: 10 },
  display: { color: C.text, fontFamily: PX, fontSize: 22, marginTop: 18 },
  subtitle: { color: C.dim, fontSize: T.small, lineHeight: 19 },
  heroKicker: { color: C.ink, fontFamily: PX, fontSize: 16 },
  heroDim: { color: C.inkSoft, fontSize: T.small, lineHeight: 18 },
  heroBody: { color: C.ink, fontSize: T.body, lineHeight: 22, marginTop: 8 },
  heroRowTitle: { color: C.ink, fontSize: T.body, fontWeight: "700" },
  heroRule: { height: 3, backgroundColor: alpha(C.ink, 0.18), marginVertical: 14 },
  streakRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  streakNum: { color: C.ink, fontFamily: PX, fontSize: 22, marginBottom: 6 },
  streakUnit: { fontSize: 10 },
  weekRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  weekCell: { alignItems: "center", gap: 6 },
  weekDot: { width: 34, height: 34, borderWidth: 3, borderColor: alpha(C.ink, 0.3), alignItems: "center", justifyContent: "center" },
  weekLabel: { color: C.inkSoft, fontFamily: PX, fontSize: 8 },
  clockRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  clockBtnText: { color: C.greenBright, fontFamily: PX, fontSize: 11 },
  cardGap: { marginTop: 14 },
  cardPad: { padding: 14 },
  statusHead: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  statusWord: { fontFamily: PX, fontSize: 13 },
  recapText: { color: C.text, fontSize: T.heading, fontWeight: "700", lineHeight: 25, marginVertical: 6 },
  cardTitle: { color: C.text, fontFamily: PX, fontSize: 11, lineHeight: 18, marginBottom: 8 },
  cardLabel: { color: C.dim, fontSize: 8, marginBottom: 4, textTransform: "uppercase", fontFamily: PX },
  section: { color: C.greenBright, fontSize: 12, marginTop: 26, fontFamily: PX },
  question: { color: C.text, fontSize: T.body + 1, fontWeight: "700", marginVertical: 6, lineHeight: 22 },
  statusBig: { fontSize: T.heading, fontWeight: "700", marginBottom: 6 },
  body: { color: C.text, fontSize: T.body, lineHeight: 21, marginVertical: 2 },
  dim: { color: C.dim, fontSize: T.small, lineHeight: 18 },
  mono: { color: C.text, fontFamily: MONO, fontSize: T.small },
  input: { color: C.text, paddingVertical: 12, fontSize: T.body },
  row: { flexDirection: "row", gap: 8, marginTop: 8, alignItems: "center" },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8, alignItems: "center" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  checkRow: { flexDirection: "row", alignItems: "flex-start", marginVertical: 4 },
  todayRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  glance: { flexDirection: "row", gap: 8, marginTop: 12 },
  glanceNum: { fontSize: 18, fontFamily: PX },
  glanceLabel: { fontSize: 7, textTransform: "uppercase", fontFamily: PX },
  chipText: { fontSize: 8, fontFamily: PX },
  verifyHead: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 10 },
  bigCount: { color: C.text, fontFamily: PX, fontSize: 28 },
  bigCountOf: { color: C.dim, fontSize: 14 },
  stamp: { ...StyleSheet.absoluteFillObject, backgroundColor: "#0a0f0bd9", alignItems: "center", justifyContent: "center", zIndex: 40 },
  stampText: { color: C.greenBright, fontFamily: PX, marginTop: 22, fontSize: 12 },
  badgeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  badgeCell: { padding: 14, alignItems: "center", gap: 8 },
  badgeName: { color: C.text, fontFamily: PX, fontSize: 9, lineHeight: 14, textAlign: "center" },
  howRule: { height: 3, backgroundColor: C.line, marginVertical: 16 },
  dotBig: { width: 12, height: 12 },
});
