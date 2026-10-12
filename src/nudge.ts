import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { ALERT_CHANNEL } from "./watcher";
import { t } from "./i18n";

const ID = "settle-watch-clock-in";

/** One local daily reminder at the digest hour. No server involved. */
export async function scheduleClockInNudge(hour: number, enabled: boolean): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(ID);
    if (!enabled) return;
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    await Notifications.scheduleNotificationAsync({
      identifier: ID,
      content: {
        title: t("nudge.title"),
        body: t("nudge.body"),
        data: { clockIn: true },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute: 5,
        channelId: Platform.OS === "android" ? ALERT_CHANNEL : undefined,
      },
    });
  } catch {
    // A missing reminder must never break the app.
  }
}
