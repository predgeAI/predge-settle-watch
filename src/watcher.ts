import * as Notifications from "expo-notifications";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { fetchSettlementRisk } from "./api";
import { verifyRecord } from "./verify";
import { BACKGROUND_TASK } from "./config";
import {
  changesLast24h,
  describeChanges,
  loadSettings,
  loadWatchlist,
  localDay,
  saveSettings,
  saveWatchlist,
  snapshotOf,
  type WatchItem,
} from "./store";

export const ALERT_CHANNEL = "settlement-alerts";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function setupNotifications(): Promise<boolean> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(ALERT_CHANNEL, {
      name: "Settlement alerts",
      description: "UMA disputes, clarifications and on-chain settlement of watched markets",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: "#f5a524",
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

export async function notify(title: string, body: string, data: Record<string, unknown> = {}): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data },
    trigger: Platform.OS === "android" ? { channelId: ALERT_CHANNEL } as Notifications.NotificationTriggerInput : null,
  });
}

/** Polls one item; returns the updated item and the changes found (if any). */
export async function pollItem(item: WatchItem): Promise<{ item: WatchItem; changes: string[] }> {
  try {
    const r = await fetchSettlementRisk(item.key);
    const verification = await verifyRecord(r);
    const snap = snapshotOf(r);
    const changes = describeChanges(item.snapshot, snap);
    const now = new Date().toISOString();
    const timeline = [...item.timeline];
    if (!item.snapshot) {
      timeline.unshift({ at: now, text: `Watching. ${r.recommendation}`, verified: verification.verified, kind: "info" });
    }
    for (const c of changes) timeline.unshift({ at: now, text: c, verified: verification.verified, kind: "change" });
    return {
      item: {
        ...item,
        marketId: r.market.market_id,
        question: r.market.question,
        slug: r.market.slug,
        snapshot: snap,
        last: r,
        verification,
        lastError: undefined,
        lastPolledAt: now,
        lastChangeAt: changes.length ? now : item.lastChangeAt,
        timeline: timeline.slice(0, 50),
      },
      changes,
    };
  } catch (e) {
    return { item: { ...item, lastError: (e as Error).message, lastPolledAt: new Date().toISOString() }, changes: [] };
  }
}

/** Polls the whole watchlist, persists it and raises one notification per changed market. */
export async function pollAll(): Promise<{ items: WatchItem[]; changed: number }> {
  const items = await loadWatchlist();
  const out: WatchItem[] = [];
  let changed = 0;
  for (const it of items) {
    const { item, changes } = await pollItem(it);
    out.push(item);
    if (changes.length) {
      changed++;
      const badge = item.verification?.verified ? "Verified on device" : "NOT verified";
      await notify(
        `${item.last?.risk_level?.toUpperCase() ?? "UPDATE"}: ${item.question ?? item.key}`.slice(0, 120),
        `${changes.join(". ")}. ${badge}.`,
        { key: item.key }
      );
    }
  }
  // Merge with anything the UI changed while we were polling (adds / removes).
  const latest = await loadWatchlist();
  const byKey = new Map(out.map((i) => [i.key, i]));
  const merged = latest.map((i) => {
    const p = byKey.get(i.key);
    return p ? { ...p, anchors: i.anchors.length >= p.anchors.length ? i.anchors : p.anchors } : i;
  });
  await saveWatchlist(merged);
  await maybeSendDigest(merged);
  return { items: merged, changed };
}

/** Text of the daily digest for the current watchlist. */
export function digestText(items: WatchItem[]): { title: string; body: string } {
  const changed = items.filter((i) => changesLast24h(i).length > 0);
  const attention = items.filter((i) => i.last?.risk_level === "caution" || i.last?.risk_level === "watch").length;
  const n = items.length;
  const title = changed.length
    ? `Settle Watch daily: ${changed.length} of ${n} market${n > 1 ? "s" : ""} changed status`
    : `Settle Watch daily: no status changes across ${n} market${n > 1 ? "s" : ""}`;
  const lines = changed
    .slice(0, 3)
    .map((i) => `${(i.question ?? i.key).slice(0, 60)}: ${changesLast24h(i)[0].text}`);
  if (changed.length > 3) lines.push(`and ${changed.length - 3} more`);
  lines.push(
    attention
      ? `${attention} market${attention > 1 ? "s" : ""} still need${attention > 1 ? "" : "s"} attention (Caution or Watch).`
      : "Nothing on your watchlist needs attention."
  );
  return { title, body: lines.join("\n") };
}

/**
 * Once a day, after the user's digest hour, sends one summary notification of the
 * watchlist: which markets changed status in the last 24 h and how many still need
 * attention. Runs from both the foreground poll and the background task.
 */
export async function maybeSendDigest(items: WatchItem[], now = new Date()): Promise<boolean> {
  if (!items.length) return false;
  const s = await loadSettings();
  const today = localDay(now);
  if (!s.digest || !s.onboarded || s.lastDigestDay === today || now.getHours() < s.digestHour) return false;
  const { title, body } = digestText(items);
  await saveSettings({ lastDigestDay: today });
  await notify(title, body, { digest: true });
  return true;
}

export function defineBackgroundTask(): void {
  if (TaskManager.isTaskDefined(BACKGROUND_TASK)) return;
  TaskManager.defineTask(BACKGROUND_TASK, async () => {
    try {
      const { changed } = await pollAll();
      return changed ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
    } catch {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

export async function registerBackgroundPolling(): Promise<boolean> {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (status === BackgroundFetch.BackgroundFetchStatus.Denied) return false;
    if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK)) return true;
    await BackgroundFetch.registerTaskAsync(BACKGROUND_TASK, {
      minimumInterval: 15 * 60, // Android's floor for periodic background work
      stopOnTerminate: false,
      startOnBoot: true,
    });
    return true;
  } catch {
    return false;
  }
}
