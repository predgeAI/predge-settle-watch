import * as Notifications from "expo-notifications";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { fetchSettlementRisk } from "./api";
import { verifyRecord } from "./verify";
import { BACKGROUND_TASK } from "./config";
import { describeChanges, loadWatchlist, saveWatchlist, snapshotOf, type WatchItem } from "./store";

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
      timeline.unshift({ at: now, text: `Watching. ${r.recommendation}`, verified: verification.verified });
    }
    for (const c of changes) timeline.unshift({ at: now, text: c, verified: verification.verified });
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
  return { items: merged, changed };
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
