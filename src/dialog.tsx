// In-app pixel dialog that replaces the system Android alert.
// showDialog(title, message?, buttons?) takes the same arguments as Alert.alert and queues
// dialogs shown at the same time. Falls back to Alert.alert while no DialogHost is mounted.
import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Alert, Animated, Easing, Modal, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { t, type Key } from "./i18n";
import { CLUSTERS, type Cluster } from "./config";
import { alpha, C, PX, T } from "./theme";
import { Button, PixelBox, useReducedMotion } from "./ui";
import { Mascot } from "./sprites";

export interface DialogButton {
  text?: string;
  onPress?: () => void;
  style?: "cancel" | "destructive" | "default";
}
export type DialogVariant = "success" | "error" | "neutral";
export interface DialogOptions {
  cancelable?: boolean;
  /** Overrides the variant inferred from the title. */
  variant?: DialogVariant;
}

interface Item {
  id: number;
  title: string;
  message?: string;
  buttons: DialogButton[];
  variant: DialogVariant;
}

let queue: Item[] = [];
let nextId = 1;
let hosts = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const head = () => queue[0] ?? null;

// Titles of success events (receipt confirmed, receipt saved, evidence pack unlocked) and of failures.
const SUCCESS: Key[] = ["anchor.savedTitle", "skr.okTitle"];
const ERROR: Key[] = ["anchor.failed", "add.failed", "skr.failedTitle", "wallet.title", "faucet.title", "anchor.notFinishedTitle", "explorer.title"];

function inferVariant(title: string): DialogVariant {
  const nets = (Object.keys(CLUSTERS) as Cluster[]).map((c) => t("anchor.okTitle", { net: CLUSTERS[c].label }));
  if (nets.includes(title) || SUCCESS.some((k) => t(k) === title)) return "success";
  if (ERROR.some((k) => t(k) === title)) return "error";
  return "neutral";
}

/** Same arguments and behaviour as Alert.alert, drawn as an in-app pixel dialog. */
export function showDialog(title: string, message?: string, buttons?: DialogButton[], options?: DialogOptions): void {
  if (hosts === 0) {
    Alert.alert(title, message, buttons, options);
    return;
  }
  const list = buttons && buttons.length ? buttons : [{ text: t("common.ok") }];
  queue = [...queue, { id: nextId++, title, message, buttons: list, variant: options?.variant ?? inferVariant(title) }];
  emit();
}

function close(item: Item, button?: DialogButton) {
  queue = queue.filter((q) => q.id !== item.id);
  emit();
  // Close first, then run the handler, like the system dialog.
  if (button?.onPress) setTimeout(button.onPress, 0);
}

const TITLE_COLOR: Record<DialogVariant, string> = { success: C.green, error: C.orange, neutral: C.purpleSoft };

/** Mount once, after every other Modal, so dialogs show above them. */
export function DialogHost() {
  const item = useSyncExternalStore(subscribe, head, head);
  const reduced = useReducedMotion();
  const pop = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState<Item | null>(null);

  useEffect(() => {
    hosts++;
    return () => {
      hosts--;
    };
  }, []);

  useEffect(() => {
    setShown(item);
    if (!item) return;
    if (reduced) {
      pop.setValue(1);
      return;
    }
    pop.setValue(0);
    Animated.timing(pop, { toValue: 1, duration: 180, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }).start();
  }, [item, reduced, pop]);

  const cur = shown;
  const cancel = cur?.buttons.find((b) => b.style === "cancel");
  const primaryIndex = cur ? cur.buttons.map((b) => b.style !== "cancel").lastIndexOf(true) : -1;
  const stack = (cur?.buttons.length ?? 0) > 2;
  const color = cur ? TITLE_COLOR[cur.variant] : C.purpleSoft;

  return (
    <Modal visible={!!cur} transparent statusBarTranslucent animationType="fade" onRequestClose={() => cur && close(cur, cancel)}>
      <View style={st.scrim}>
        {cur ? (
          <Animated.View
            style={[st.wrap, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }] }]}
            accessibilityViewIsModal
            accessibilityLiveRegion="assertive"
          >
            <PixelBox border={color} bg={C.surface} lift={alpha(color, 0.55)} inner={st.inner}>
              {cur.variant === "success" ? (
                <View style={st.mascot}>
                  <Mascot mood="cheer" px={5} />
                </View>
              ) : null}
              <Text style={[st.title, { color }]} accessibilityRole="header">
                {cur.title}
              </Text>
              {cur.message ? <Text style={st.body}>{cur.message}</Text> : null}
              <View style={stack ? st.col : st.row}>
                {cur.buttons.map((b, i) => (
                  <View key={`${i}-${b.text}`} style={stack ? undefined : { flex: 1 }}>
                    <Button small={stack} kind={i === primaryIndex ? "primary" : "ghost"} title={b.text ?? t("common.ok")} onPress={() => close(cur, b)} />
                  </View>
                ))}
              </View>
            </PixelBox>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: "#000000b3", alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  wrap: { width: "100%", maxWidth: 420 },
  inner: { padding: 18 },
  mascot: { alignItems: "center", marginBottom: 12 },
  title: { fontFamily: PX, fontSize: 12, lineHeight: 19, marginBottom: 10 },
  body: { color: C.text, fontSize: T.body, lineHeight: 21 },
  row: { flexDirection: "row", gap: 10, marginTop: 18 },
  col: { gap: 10, marginTop: 18 },
});
