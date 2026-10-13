import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AppState,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import * as Notifications from "expo-notifications";
import { fetchSettlementRisk, parseMarketInput, type SettlementRisk } from "./src/api";
import { usableForReceipt, verifyRecord, type Check, type Verification } from "./src/verify";
import { CLUSTERS, EXPLORER_TX, FOREGROUND_POLL_MS, PINNED_KID, type Cluster } from "./src/config";
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
import { digestText, notify, pollAll, registerBackgroundPolling, setupChannel, setupNotifications } from "./src/watcher";
import { anchorPack, balanceSol, connectWallet, resumePending, disconnectWallet, friendlyWalletError, memoText, requestDevnetAirdrop, type PendingReceipt } from "./src/wallet";
import {
  actionLabel,
  applyAction,
  badgeHint,
  badgeName,
  BADGES,
  canClockIn,
  clockIn,
  lastSeven,
  levelName,
  levelOf,
  LEVELS,
  liveStreak,
  NEW_GAME,
  unlockBadges,
  weeklyRecap,
  XP,
  type ActionKind,
  type BadgeId,
  type GameState,
} from "./src/game";
import { loadGame, saveGame } from "./src/gameStore";
import { boostClockIn, canAddMarket, watchlistLimit } from "./src/skr/perks";
import { getPerks, refreshPerks, setPerksWallet, usePerks } from "./src/skr/perksStore";
import { scheduleClockInNudge } from "./src/nudge";
import { updateWidget } from "./src/widget";
import { alpha, C, PX, STATUS_ORDER, T } from "./src/theme";
import * as haptic from "./src/haptic";
import { BadgeIcon, Burst, Button, CelebrationOverlay, Chip, LevelBadge, LiveMascot, PixelBar, PixelBox, Scanlines, StatusIcon, useReducedMotion, useShake, XpToast, type Celebration } from "./src/ui";
import type { Mood } from "./src/sprites";
import Onboarding from "./src/Onboarding";
import { EXAMPLE_MARKET } from "./src/learn/Example";
import { setFeedPrefs, setFeedPrefsSaver, type FeedPrefs } from "./src/discover/interests";
import { FLAGS } from "./src/features";
import { RuleDetectiveModal } from "./src/ruleDetective/RuleDetective";
import { GlossaryModal } from "./src/glossary/Glossary";
import { shareReceipt, ShareCardHost } from "./src/share/ShareCard";
import { LEAGUE_ENABLED } from "./src/league/config";
import { LeagueModal } from "./src/league/LeagueEntry";
import { DailyDisputeModal } from "./src/dailyDispute/DailyDispute";
import Intro from "./src/Intro";
import { EvidencePackCard } from "./src/skr";
import { Text } from "./src/Text";
import { DialogHost, showDialog } from "./src/dialog";
import { LearnHost, Term, TOUR_REF } from "./src/learn";
import { detectLanguage, en, setLanguage, setPlainWords, t, useLang, type Key } from "./src/i18n";
import { ago, EXAMPLES, short, statusColor, statusLabel, statusWord, styles } from "./src/tabs/shared";
import { TodayTab } from "./src/tabs/TodayTab";
import { PlayTab } from "./src/tabs/PlayTab";
import { DiscoverTab } from "./src/tabs/DiscoverTab";
import { MeTab } from "./src/tabs/MeTab";
import { MonadTab } from "./src/tabs/MonadTab";
import { TabBar, type TabId } from "./src/tabs/TabBar";
import { fetchPositions, normalizeAddress, PositionsError } from "./src/positions/api";
import { applyHeld, clearHeld, planSync, positionsErrorText } from "./src/positions/sync";
import { loadPositionsState, savePositionsState, type PositionsState } from "./src/positions/store";

// Use the phone's language for the intro until the saved choice loads.
setLanguage(detectLanguage());

function openExplorer(sig: string, cluster: Cluster) {
  try {
    Linking.openURL(EXPLORER_TX(sig, cluster));
  } catch {
    showDialog(t("explorer.title"), t("explorer.noSig"));
  }
}


// Check labels and details come from src/verify.ts in English; only their display is translated.
const CHECK_KEYS = new Map<string, Key>(
  (Object.keys(en) as Key[]).filter((k) => k.startsWith("check.") && !k.startsWith("check.d.")).map((k) => [en[k], k])
);
const checkLabel = (label: string) => {
  const k = CHECK_KEYS.get(label);
  return k ? t(k) : label;
};
function checkDetail(d: string): string {
  const fixed: Record<string, Key> = {
    [en["check.d.unsigned"]]: "check.d.unsigned",
    [en["check.d.listed"]]: "check.d.listed",
    [en["check.d.notListed"]]: "check.d.notListed",
  };
  if (fixed[d]) return t(fixed[d]);
  let m = /^key list not reachable, pinned key used; last good list (\d+) h ago$/.exec(d);
  if (m) return t("check.d.unreachableCached", { n: m[1] });
  if (d === "key list not reachable, pinned key used; no good list in the last 7 days") return t("check.d.unreachableNone");
  m = /^signed (\d+) min ago$/.exec(d);
  if (m) return t("check.d.age", { n: m[1] });
  m = /^stale: signed (\d+) h ago$/.exec(d);
  if (m) return t("check.d.stale", { n: m[1] });
  m = /^signed (\d+) min in the future, check the phone clock$/.exec(d);
  if (m) return t("check.d.future", { n: m[1] });
  if (d === "no signed timestamp") return t("check.d.noTime");
  m = /^mismatch: (.+)$/.exec(d);
  if (m) return t("check.d.mismatch", { list: m[1] });
  m = /^(\d+) fields$/.exec(d);
  if (m) return t("check.d.fields", { n: m[1] });
  m = /^(\d+) bytes$/.exec(d);
  if (m) return t("check.d.bytes", { n: m[1] });
  return d;
}

/** pass, fail or unknown; verifications saved before 0.3.9 have no status. */
const statusOf = (c: Check) => c.status ?? (c.ok ? "pass" : "fail");

function RiskBadge({ level }: { level?: string }) {
  return <Chip text={statusLabel(level).toUpperCase()} color={statusColor(level)} />;
}

function VerifiedBadge({ v }: { v?: Verification }) {
  if (!v) return null;
  return <Chip text={v.verified ? t("chip.verifiedOnDevice") : t("chip.notVerified")} color={v.verified ? C.green : C.red} />;
}

/** Plain wording for a failed add. */
function friendlyAddError(e: unknown): string {
  const m = (e as Error)?.message ?? "";
  if (/network request failed|timed out|failed to fetch|HTTP 5\d\d|aborted/i.test(m)) {
    return t("add.errNetwork");
  }
  return m.slice(0, 200) || t("common.wrongRetry");
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
  const [leagueOpen, setLeagueOpen] = useState(false);
  const [glossTick, setGlossTick] = useState(0);
  const [introDone, setIntroDone] = useState(false);
  const [clockPlay, setClockPlay] = useState(0);
  // Bottom tabs. Always opens on TODAY; the choice is not saved.
  const [tab, setTab] = useState<TabId>("today");
  // "Watch my positions": a Polymarket wallet address kept on this phone, synced on foreground and on demand.
  const [positions, setPositions] = useState<PositionsState>({});
  const [posBusy, setPosBusy] = useState(false);
  const syncingRef = useRef(false);
  const lastAutoSyncRef = useRef(0);
  const reduced = useReducedMotion();
  const shake = useShake();
  const lang = useLang();
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
    const next = await saveSettings(patch);
    setLanguage(next.language);
    setPlainWords(next.plainWords);
    setSettings(next);
  }, []);

  // Feed interests and country: Discover, "For you" and the tour read them from the shared feed state.
  useEffect(() => {
    if (settings) setFeedPrefs({ interests: settings.interests, country: settings.country });
  }, [settings]);
  useEffect(() => {
    setFeedPrefsSaver((p) => updateSettings({ interests: p.interests, country: p.country }));
    return () => setFeedPrefsSaver(null);
  }, [updateSettings]);

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
        if (b) add.push({ id: ++celebId.current, kind: "badge", title: badgeName(id), sub: badgeHint(id), badge: id });
      }
      if (info.levelUp) {
        const idx = LEVELS.findIndex((l) => l.name === info.levelUp);
        add.push({ id: ++celebId.current, kind: "level", title: t("celeb.levelTitle", { n: idx + 1, name: levelName(idx) }), sub: t("celeb.levelSub"), level: idx });
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
  // SKR perks: read-only mainnet balance of the connected wallet. No wallet, no perks.
  const perks = usePerks();
  useEffect(() => setPerksWallet(wallet?.address ?? null), [wallet?.address]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") refreshPerks().catch(() => undefined);
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!perks.tier || gameRef.current.badges.skr_holder) return;
    const b = unlockBadges(gameRef.current, { watching: itemsRef.current.length, skrHolder: true });
    if (b.unlocked.length) commitGame(b.state, { gained: 0, badges: b.unlocked });
  }, [perks.tier, commitGame]);

  const doClockIn = useCallback(() => {
    // The multiplier is local XP only; the League still gets the plain clock-in (see clockIn).
    const tier = getPerks().tier;
    const r = clockIn(gameRef.current, new Date(), { boost: (x) => boostClockIn(x, tier), skrHolder: !!tier });
    if (r.already) return;
    commitGame(r.state, r);
    setClockPlay((n) => n + 1);
    haptic.success();
    if (r.usedFreeMiss) showDialog(t("streak.savedTitle"), t("streak.savedBody"));
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
      setLanguage(s.language);
      setPlainWords(s.plainWords);
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
    async (raw: string, opts: { quiet?: boolean; source?: "positions" } = {}): Promise<boolean> => {
      const key = parseMarketInput(raw);
      if (!key) {
        if (!opts.quiet) showDialog(t("add.notMarketTitle"), t("add.notMarketBody"));
        return false;
      }
      const current = await loadWatchlist();
      const room = canAddMarket(current.length, getPerks().tier);
      if (!room.ok) {
        showDialog(room.title, room.body);
        return false;
      }
      if (current.some((i) => i.key === key || i.marketId === key)) {
        if (!opts.quiet) showDialog(t("add.already"), key);
        return true;
      }
      setBusy("add");
      try {
        const r = await fetchSettlementRisk(key);
        if (current.some((i) => i.marketId === r.market.market_id)) {
          if (!opts.quiet) showDialog(t("add.already"), r.market.question);
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
          timeline: [{ at: now, text: t("timeline.watching", { rec: r.recommendation }), verified: v.verified, kind: "info" }],
          anchors: [],
          ...(opts.source ? { source: opts.source } : {}),
        };
        if (r.context) setContext(r.context);
        const nextList = [item, ...(await loadWatchlist())];
        await persist(nextList);
        itemsRef.current = nextList;
        // Positions sync adds many markets at once: it keeps the user's typed input and earns its own XP once.
        if (opts.source) return true;
        setInput("");
        award("add_market", { ref: r.market.market_id });
        if (v.verified) award("verify", { ref: r.market.market_id });
        return true;
      } catch (e) {
        // Quiet adds (the example markets) retry on their own, so no alert for a network problem.
        if (!opts.quiet) showDialog(t("add.failed"), friendlyAddError(e));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [persist, award]
  );

  /**
   * Reads the wallet's open positions (Polymarket Data API, see src/positions/api.ts), adds markets
   * not yet watched (quietly, one at a time, at most 50) and marks held and closed positions.
   * Closed positions are never removed. `manual` shows the result or the error in a dialog.
   */
  const syncPositions = useCallback(
    async (opts: { manual?: boolean; address?: string } = {}) => {
      if (syncingRef.current) return;
      const state = await loadPositionsState();
      const address = opts.address ?? state.address;
      if (!address) return;
      syncingRef.current = true;
      setPosBusy(true);
      try {
        const open = await fetchPositions(address);
        const plan = planSync(open, await loadWatchlist(), watchlistLimit(getPerks().tier), 50);
        let failed = 0;
        for (const pos of plan.toAdd) if (!(await addMarket(pos.conditionId, { quiet: true, source: "positions" }))) failed++;
        // A foreground poll merges its results over the list when it ends, so wait for it before marking.
        for (let i = 0; i < 60 && pollingRef.current; i++) await new Promise((res) => setTimeout(res, 500));
        const now = new Date().toISOString();
        let closed = 0;
        let added = 0;
        const acquired = !pollingRef.current;
        if (acquired) pollingRef.current = true;
        try {
          const list = await loadWatchlist();
          const marked = applyHeld(list, open, now);
          closed = marked.closed;
          added = plan.toAdd.filter((p) => marked.items.some((i) => i.key === p.conditionId)).length;
          if (marked.changed) await persist(marked.items);
        } finally {
          if (acquired) pollingRef.current = false;
        }
        const next: PositionsState = { address, lastSyncAt: now, found: plan.found, added, failed, overflow: plan.overflow };
        await savePositionsState(next);
        setPositions(next);
        award("positions_sync", { ref: "first" });
        if (opts.manual) {
          const notes = [plan.overflow ? t("pos.fullNote", { n: plan.overflow }) : "", failed ? t("pos.failedNote", { n: failed }) : ""].filter(Boolean);
          showDialog(t("pos.doneTitle"), [t("pos.doneBody", { found: plan.found, added, closed }), ...notes].join("\n\n"));
        }
      } catch (e) {
        const kind = e instanceof PositionsError ? e.kind : "other";
        const next: PositionsState = { ...state, address, lastError: kind, lastErrorAt: new Date().toISOString() };
        await savePositionsState(next).catch(() => undefined);
        setPositions(next);
        if (opts.manual) showDialog(t("pos.failTitle"), positionsErrorText(kind));
      } finally {
        syncingRef.current = false;
        setPosBusy(false);
      }
    },
    [addMarket, persist, award]
  );

  const onSavePositions = useCallback(
    async (raw: string) => {
      const address = normalizeAddress(raw);
      if (!address) return showDialog(t("pos.badTitle"), t("pos.badBody"));
      const next: PositionsState = { address };
      await savePositionsState(next);
      setPositions(next);
      showDialog(t("pos.apiTitle"), t("pos.apiBody"));
      syncPositions({ manual: true, address });
    },
    [syncPositions]
  );

  const onForgetPositions = useCallback(() => {
    showDialog(t("pos.forgetTitle"), t("pos.forgetBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("pos.forget"),
        style: "destructive",
        onPress: async () => {
          await savePositionsState({});
          setPositions({});
          await persist(clearHeld(await loadWatchlist()));
        },
      },
    ]);
  }, [persist]);

  // Positions sync runs when the app opens or comes to the foreground (at most every 5 minutes), never in the background task.
  useEffect(() => {
    if (!settings?.onboarded) return;
    const auto = () => {
      if (Date.now() - lastAutoSyncRef.current < 5 * 60_000) return;
      lastAutoSyncRef.current = Date.now();
      syncPositions().catch(() => undefined);
    };
    loadPositionsState().then((s) => {
      setPositions(s);
      auto();
    });
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") auto();
    });
    return () => sub.remove();
  }, [settings?.onboarded, syncPositions]);

  const finishOnboarding = useCallback(
    async (addExamples: boolean, clockedIn = false, feed?: FeedPrefs) => {
      await updateSettings(feed ? { onboarded: true, interests: feed.interests, country: feed.country } : { onboarded: true });
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
      showDialog(t("wallet.title"), t("wallet.connectFail", { msg: (e as Error).message, net }));
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
      showDialog(t("faucet.title"), t("faucet.body"));
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
              timeline: [{ at: now, text: t("timeline.receipt", { net: CLUSTERS[c].label, action: t(`action.${action}`) }), verified: true, kind: "receipt" as const }, ...i.timeline],
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
      if (!v || !usableForReceipt(v) || !v.packHash || !last) return;
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
        const { signature, wallet: w } = await anchorPack(
          wallet,
          { action, marketId: pending.marketId, riskLevel: pending.riskLevel, packHash },
          cluster,
          async (s) => {
            signed = true;
            setBusy(`anchor-send:${item.key}`);
            await savePending({ ...pending, ...s });
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
        showDialog(t("anchor.okTitle", { net }), `${t("anchor.okBody", { sig: short(signature, 6) })}${t("anchor.onChain")}`, [
          { text: t("anchor.openExplorer"), onPress: () => openExplorer(signature, cluster) },
          { text: t("share.card"), onPress: () => shareReceipt(item, { signature, packHash, riskLevel: last.risk_level, at: new Date().toISOString(), cluster }) },
          { text: t("common.ok") },
        ]);
      } catch (e) {
        // Keep a signed receipt that may still land, so it is checked again later. Drop one that cannot.
        if (!signed || /not landed|block height|rejected/i.test((e as Error)?.message ?? "")) await savePending(null);
        showDialog(t("anchor.failed"), `${friendlyWalletError(e)}\n\n${cluster === "devnet" ? t("anchor.feeDevnet") : t("anchor.feeMain")}`);
      } finally {
        anchoringRef.current = false;
        setBusy(null);
      }
    },
    [wallet, cluster, net, refreshBalance, reduced, recordAnchor]
  );

  const onAnchor = useCallback(
    (item: WatchItem, action: "watch" | "acknowledge") => {
      if (!wallet) return showDialog(t("anchor.connectFirst"), t("anchor.connectFirstBody", { net }));
      if (!item.verification?.verified || !item.verification.packHash || !item.last) {
        return showDialog(t("anchor.notVerified"), t("anchor.notVerifiedBody"));
      }
      // A verification saved earlier can go stale; the next poll re-verifies the record.
      if (!usableForReceipt(item.verification)) return showDialog(t("anchor.notVerified"), t("anchor.staleBody"));
      if (cluster === "mainnet-beta") {
        return showDialog(t("anchor.mainnetTitle"), t("anchor.mainnetBody"), [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("anchor.anchor"), onPress: () => doAnchor(item, action) },
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
      if (p.signature) {
        const result = await resumePending(p).catch(() => "unknown" as const);
        if (result === "unknown") return; // keep it and check again next time the app opens
        await savePending(null);
        if (result === "confirmed") {
          await recordAnchor(p.key, p.signature, p.packHash, p.action, p.riskLevel, p.cluster);
          showDialog(t("anchor.savedTitle"), t("anchor.savedConfirmed"));
        } else {
          showDialog(t("anchor.notFinishedTitle"), t("anchor.droppedBody"));
        }
      } else {
        await savePending(null);
        showDialog(t("anchor.notFinishedTitle"), t("anchor.notFinishedBody"));
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
    await notify(t("test.title"), t("test.body"), { test: true });
  }, []);

  const onDigestNow = useCallback(async () => {
    if (!items.length) return showDialog(t("digest.title"), t("digest.addFirst"));
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
  }, [settings?.onboarded, settings?.digest, settings?.digestHour, settings?.language]);
  // Rename the Android notification channel after a language change.
  useEffect(() => {
    if (settings?.onboarded) setupChannel().catch(() => undefined);
  }, [settings?.onboarded, settings?.language]);
  // Home-screen widget follows the watchlist, streak and language (debounced to skip the load-time flicker).
  useEffect(() => {
    if (!settings) return;
    const id = setTimeout(() => updateWidget(items, game), 400);
    return () => clearTimeout(id);
  }, [items, game, settings?.language]);

  // Showing the intro again leaves the tabs, so coming back starts on TODAY.
  useEffect(() => {
    if (settings && !settings.onboarded) setTab("today");
  }, [settings?.onboarded]);

  const lastCheck = items.map((i) => i.lastPolledAt ?? "").sort().pop();


  const level = levelOf(game.xp);
  const streak = liveStreak(game);
  const week = lastSeven(game);
  const recap = weeklyRecap(game);
  const canIn = canClockIn(game);
  const unlocked = BADGES.filter((b) => game.badges[b.id]).length;
  const top = leagueOpen ? "league" : ruleOpen ? "rule" : puzzleOpen ? "puzzle" : badgesOpen ? "badges" : detail ? "detail" : "main";
  const overlays = (where: string) => (
    <>
      <XpToast text={toast.text} tick={toast.tick} />
      <CelebrationOverlay item={where === top ? (celebs[0] ?? null) : null} onClose={() => setCelebs((c) => c.slice(1))} />
    </>
  );
  // The Watcher mirrors the watchlist: asleep when quiet, alarmed on caution or watch, cheering once clocked in.
  const homeMood: Mood = !items.length ? "sleep" : counts.caution + counts.watch > 0 ? "alarm" : !canIn ? "cheer" : "sleep";
  const detailMood: Mood = !detail ? "idle" : detail.last?.risk_level === "caution" || detail.last?.risk_level === "watch" ? "alarm" : detail.last?.risk_level === "resolved" ? "cheer" : "sleep";

  const refreshControl = () => (
    <RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={C.green} progressBackgroundColor={C.surfaceHi} />
  );
  const add = { input, setInput, busy, addMarket };
  const watchExample = () => void addMarket(EXAMPLE_MARKET.key, { quiet: true });

  let content: React.ReactNode;
  if (!settings) {
    content = (
      <SafeAreaView style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <LiveMascot mood="idle" px={6} />
      </SafeAreaView>
    );
  } else if (!settings.onboarded) {
    content = <Onboarding initialFeed={{ interests: settings.interests, country: settings.country }} onWatchExample={watchExample} onDone={finishOnboarding} />;
  } else {
    content = (
      <SafeAreaView style={styles.root}>
        <TodayTab
          active={tab === "today"}
          refreshControl={refreshControl()}
          settings={settings}
          game={game}
          level={level}
          streak={streak}
          week={week}
          canIn={canIn}
          clockPlay={clockPlay}
          bgOk={bgOk}
          items={items}
          today={today}
          counts={counts}
          shown={shown}
          filter={filter}
          setFilter={setFilter}
          pendingExamples={pendingExamples}
          lastCheck={lastCheck}
          homeMood={homeMood}
          puzzleTick={puzzleTick}
          onBadges={() => setBadgesOpen(true)}
          onClockIn={doClockIn}
          onOpenDetail={openDetail}
          onPuzzle={() => setPuzzleOpen(true)}
          add={add}
          positionsHint={!positions.address}
          onOpenMe={() => setTab("me")}
          onWatchExample={watchExample}
        />
        <PlayTab
          active={tab === "play"}
          refreshControl={refreshControl()}
          game={game}
          level={level}
          recap={recap}
          unlocked={unlocked}
          puzzleTick={puzzleTick}
          glossTick={glossTick}
          onPuzzle={() => setPuzzleOpen(true)}
          onRule={() => setRuleOpen(true)}
          onGlossary={() => setGlossOpen(true)}
          onLeague={() => setLeagueOpen(true)}
          onBadges={() => setBadgesOpen(true)}
        />
        <DiscoverTab
          active={tab === "discover"}
          refreshControl={refreshControl()}
          watchingIds={items.map((i) => i.marketId ?? i.key)}
          onWatch={(id) => addMarket(id)}
          add={add}
        />
        <MonadTab active={tab === "monad"} refreshControl={refreshControl()} items={items} />
        <MeTab
          active={tab === "me"}
          refreshControl={refreshControl()}
          settings={settings}
          lang={lang}
          wallet={wallet}
          balance={balance}
          busy={busy}
          cluster={cluster}
          net={net}
          context={context}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
          onAirdrop={onAirdrop}
          onSwitchCluster={onSwitchCluster}
          updateSettings={updateSettings}
          onCheckNow={refreshAll}
          onDigestNow={onDigestNow}
          onTestAlert={onTestAlert}
          positions={positions}
          positionsBusy={posBusy}
          onSavePositions={onSavePositions}
          onSyncPositions={() => syncPositions({ manual: true })}
          onForgetPositions={onForgetPositions}
        />
        <TabBar tab={tab} onChange={setTab} />
        {overlays("main")}

        {/* Market detail */}
        <Modal visible={!!detail} statusBarTranslucent animationType="slide" onRequestClose={() => setDetailKey(null)}>
          <SafeAreaView style={styles.root}>
            {detail ? (
              <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: 0 }]}>
                <View style={[styles.detailHead, { backgroundColor: alpha(statusColor(detail.last?.risk_level), 0.16), borderBottomColor: statusColor(detail.last?.risk_level) }]}>
                  <View style={styles.rowBetween}>
                    <Button small kind="ghost" title={t("common.back")} onPress={() => setDetailKey(null)} />
                    <Button
                      small
                      kind="ghost"
                      title={t("common.remove")}
                      onPress={() =>
                        showDialog(t("detail.removeTitle"), detail.question ?? detail.key, [
                          { text: t("common.cancel"), style: "cancel" },
                          { text: t("common.remove"), style: "destructive", onPress: () => removeMarket(detail.key) },
                        ])
                      }
                    />
                  </View>
                  <View style={[styles.rowBetween, { marginTop: 18 }]}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.statusHead}>
                        <StatusIcon level={detail.last?.risk_level} color={statusColor(detail.last?.risk_level)} px={4} />
                        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[styles.display, { color: statusColor(detail.last?.risk_level), marginTop: 0, fontSize: 20, lineHeight: 28, flexShrink: 1 }]}>{statusWord(detail.last?.risk_level)}</Text>
                        <Term id="status" />
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
                      <Burst play={verifyPlay} kind={detail.verification?.verified ? "ok" : "bad"} size={72} haptic={detail.verification?.verified ? "verify" : "rejected"} steps={detail.verification?.checks.length} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle, { color: detail.verification?.verified ? C.green : C.red, marginBottom: 6 }]}>
                          {detail.verification?.verified ? t("detail.verifiedPhone") : t("chip.notVerified")}
                        </Text>
                        <Text style={styles.bigCount}>
                          {detail.verification?.checks.filter((c) => c.ok).length ?? 0}
                          <Text style={styles.bigCountOf}>/{detail.verification?.checks.length ?? 0}</Text>
                        </Text>
                      </View>
                      <Term id="verified" />
                    </View>
                    <Text style={styles.dim}>
                      {t("detail.checksPassed", {
                        ok: detail.verification?.checks.filter((c) => c.ok).length ?? 0,
                        n: detail.verification?.checks.length ?? 0,
                        kid: PINNED_KID,
                        ago: ago(detail.verification?.verifiedAt),
                      })}
                    </Text>
                    {showChecks
                      ? detail.verification?.checks.map((c) => (
                          <View key={c.label} style={styles.checkRow}>
                            <Text style={{ color: statusOf(c) === "pass" ? C.green : statusOf(c) === "unknown" ? C.orange : C.red, width: 36, fontFamily: PX, fontSize: 10 }}>
                              {statusOf(c) === "pass" ? "OK" : statusOf(c) === "unknown" ? "?" : "X"}
                            </Text>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.body}>{checkLabel(c.label)}</Text>
                              {c.detail ? <Text style={[styles.mono, { fontSize: 11, color: C.dim }]}>{checkDetail(c.detail)}</Text> : null}
                            </View>
                          </View>
                        ))
                      : null}
                    <View style={styles.row}>
                      <Button small kind="ghost" title={showChecks ? t("detail.hideChecks") : t("detail.showChecks")} onPress={() => setShowChecks(!showChecks)} />
                      <Button small kind="ghost" title={t("detail.tamperTest")} onPress={() => onTamperTest(detail)} />
                    </View>
                    {tamper ? (
                      <View style={[styles.rowBetween, { marginTop: 12, justifyContent: "flex-start", gap: 12 }]}>
                        {!tamper.verified ? <Burst play={rejectPlay} kind="bad" size={52} haptic="rejected" /> : null}
                        <Text style={[styles.body, { flex: 1, color: tamper.verified ? C.red : C.greenBright }]}>
                          {t("detail.tamperLine")} {tamper.verified ? t("detail.tamperStill") : t("detail.tamperRejected")}
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
                  <View style={styles.rowBetween}>
                    <Text style={[styles.cardTitle, { flexShrink: 1 }]}>{t("detail.receiptTitle", { net: net.toUpperCase() })}</Text>
                    <Term id="receipt" />
                  </View>
                  <Text style={styles.dim}>{t("detail.receiptBody")}</Text>
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
                      title={busy === `anchor:${detail.key}` ? t("common.waitingWallet") : busy === `anchor-send:${detail.key}` ? t("common.confirmingSolana") : t("detail.anchorWatch")}
                      onPress={() => onAnchor(detail, "watch")}
                      disabled={!!busy}
                    />
                    <Button small kind="ghost" title={t("detail.ack")} onPress={() => onAnchor(detail, "acknowledge")} disabled={!!busy} />
                  </View>
                  {detail.anchors.map((a) => (
                    <Pressable key={a.signature} onPress={() => openExplorer(a.signature, a.cluster ?? "devnet")}>
                      <Text style={[styles.mono, { color: C.purpleSoft, marginTop: 6 }]}>
                        {t(`action.${a.action}`)} . {CLUSTERS[a.cluster ?? "devnet"].label} . {short(a.signature, 8)} . {ago(a.at)}
                      </Text>
                      <Text style={[styles.mono, { color: C.green, paddingVertical: 4 }]} onPress={() => shareReceipt(detail, a)}>{`> ${t("share.card")}`}</Text>
                    </Pressable>
                  ))}
                </PixelBox>
                <EvidencePackCard item={detail} wallet={wallet} disabled={!!busy} onUnlocked={(ref) => award("pack_open", { ref })} />

                <PixelBox style={styles.cardGap} inner={styles.cardPad}>
                  <Text style={styles.cardTitle}>{t("detail.timeline")}</Text>
                  {detail.timeline.map((t, i) => (
                    <Text key={`${t.at}-${i}`} style={styles.body}>
                      <Text style={styles.dim}>{t.at.replace("T", " ").slice(0, 16)} </Text>
                      {t.text}
                    </Text>
                  ))}
                  {detail.last?.disputes?.length ? (
                    <>
                      <Text style={[styles.cardTitle, { marginTop: 12 }]}>{t("detail.disputes")}</Text>
                      {detail.last.disputes.map((d, i) => (
                        <Text key={i} style={[styles.mono, { fontSize: 11, color: C.dim }]}>
                          {JSON.stringify(d).slice(0, 240)}
                        </Text>
                      ))}
                    </>
                  ) : null}
                </PixelBox>
                <Text style={[styles.dim, { marginTop: 12 }]}>
                  {t("detail.ids", { id: detail.last?.market.market_id ?? "", cond: short(detail.last?.market.condition_id ?? "", 8) })}
                </Text>
              </ScrollView>
            ) : null}
            {stamp ? (
              <View style={styles.stamp} pointerEvents="none">
                <Burst play={stampPlay} size={150} haptic="stamp" />
                <Text style={styles.stampText}>{t("detail.stamp")}</Text>
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
                  <Button small kind="ghost" title={t("common.back")} onPress={() => setBadgesOpen(false)} />
                  <LevelBadge index={level.index} progress={level.progress} />
                </View>
                <View style={[styles.rowBetween, { marginTop: 14 }]}>
                  <Text style={[styles.display, { marginTop: 0, flexShrink: 1 }]}>{levelName(level.index).toUpperCase()}</Text>
                  <LiveMascot mood="cheer" px={4} />
                </View>
                <View style={{ marginTop: 10 }}>
                  <PixelBar value={level.progress} />
                </View>
                <Text style={[styles.subtitle, { marginTop: 8 }]}>
                  {t("badges.level", { n: level.index + 1, xp: game.xp })}
                  {level.next ? t("badges.toNext", { toNext: level.toNext, next: levelName(level.index + 1) }) : ""}
                </Text>
                <Text style={[styles.subtitle, { marginTop: 4 }]}>{t("badges.streak", { streak, best: game.best })}</Text>
              </View>
              <Text style={styles.section}>{t("badges.section", { n: unlocked, total: BADGES.length })}</Text>
              <View style={styles.badgeGrid}>
                {BADGES.map((b) => {
                  const at = game.badges[b.id];
                  return (
                    <View key={b.id} style={{ width: "48%", flexGrow: 1 }} accessibilityLabel={t(at ? "badges.a11yUnlocked" : "badges.a11yLocked", { name: badgeName(b.id) })}>
                      <PixelBox border={at ? C.green : C.line} inner={[styles.badgeCell, !at && { opacity: 0.8 }]}>
                        <BadgeIcon id={b.id} size={72} locked={!at} />
                        <Text style={[styles.badgeName, !at && { color: C.dim }]}>{badgeName(b.id)}</Text>
                        <Text style={[styles.dim, { textAlign: "center" }]}>{at ? t("badges.unlockedOn", { date: at.slice(0, 10) }) : badgeHint(b.id)}</Text>
                      </PixelBox>
                    </View>
                  );
                })}
              </View>
              <Text style={styles.section}>{t("xpHow.title")}</Text>
              <PixelBox style={styles.cardGap} inner={styles.cardPad}>
                {(Object.keys(XP) as (keyof typeof XP)[]).map((k) => (
                  <View key={k} style={[styles.rowBetween, { paddingVertical: 5 }]}>
                    <Text style={[styles.body, { flex: 1 }]}>{actionLabel(k)}</Text>
                    <Text style={[styles.chipText, { color: C.green, fontSize: 10 }]}>+{XP[k]}</Text>
                  </View>
                ))}
                <Text style={[styles.dim, { marginTop: 8 }]}>
                  {t("xpHow.note", { levels: LEVELS.map((l, i) => `${levelName(i)} ${l.min}`).join(t("list.sep")) })}
                </Text>
              </PixelBox>
            </ScrollView>
            {overlays("badges")}
            <Scanlines />
          </SafeAreaView>
        </Modal>
        {LEAGUE_ENABLED ? <LeagueModal visible={leagueOpen} onClose={() => setLeagueOpen(false)} overlay={overlays("league")} /> : null}
        {FLAGS.ruleDetective ? (
          <RuleDetectiveModal visible={ruleOpen} onClose={() => setRuleOpen(false)} award={(kind, ref) => award(kind, { ref })} overlay={overlays("rule")} />
        ) : null}
        <ShareCardHost />
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
      <LearnHost onDone={() => award("learn", { ref: TOUR_REF })} onDiscover={() => setTab("discover")} onWatch={(id) => addMarket(id)} />
      <DialogHost />
    </View>
  );
}
