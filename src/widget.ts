// Pushes the watchlist summary to the Android home-screen widget (native module
// SettleWatchWidget, sources in plugins/home-widget/android). A no-op where the module
// is missing: iOS, web, Expo Go and the offline selftest.
import { NativeModules, Platform } from "react-native";
import type { GameState } from "./game";
import { loadGame } from "./gameStore";
import type { WatchItem } from "./store";
import { buildWidgetSummary } from "./widgetSummary";

type WidgetModule = { update(json: string): Promise<boolean> };

function nativeWidget(): WidgetModule | null {
  try {
    if (Platform.OS !== "android") return null;
    const m = (NativeModules as Record<string, unknown>).SettleWatchWidget as WidgetModule | undefined;
    return m && typeof m.update === "function" ? m : null;
  } catch {
    return null;
  }
}

let lastJson = "";

/** Redraws the widget. Reads the game state itself when it is not passed (background task). Never throws. */
export async function updateWidget(items: WatchItem[], game?: GameState): Promise<void> {
  const m = nativeWidget();
  if (!m) return;
  try {
    const json = JSON.stringify(buildWidgetSummary(items, game ?? (await loadGame())));
    if (json === lastJson) return;
    await m.update(json);
    lastJson = json;
  } catch {
    // The widget is a convenience; a failure here must never break a refresh.
  }
}
