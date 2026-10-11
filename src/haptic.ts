import * as Haptics from "expo-haptics";

const safe = (p: Promise<unknown>) => p.catch(() => undefined);
export const tap = () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
export const thud = () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
export const success = () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
export const reject = () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
