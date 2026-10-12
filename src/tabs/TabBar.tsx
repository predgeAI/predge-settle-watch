// Bottom tab bar in the pixel style: four tabs with tiny sprite icons, the active one lit.
import React, { useEffect, useState } from "react";
import { Keyboard, Pressable, StyleSheet, View } from "react-native";
import { alpha, C, PX } from "../theme";
import { Sprite } from "../ui";
import { PixelIcon } from "../sprites";
import * as haptic from "../haptic";
import { Text } from "../Text";
import { t, type Key } from "../i18n";

export type TabId = "today" | "play" | "discover" | "me";

const PERSON = ["...XX...", "..XXXX..", "..XXXX..", "...XX...", "........", ".XXXXXX.", "XXXXXXXX", "XXXXXXXX"];

const TABS: { id: TabId; label: Key; icon: string | string[] }[] = [
  { id: "today", label: "tab.today", icon: "flame" },
  { id: "play", label: "tab.play", icon: "league" },
  { id: "discover", label: "tab.discover", icon: "eye" },
  { id: "me", label: "tab.me", icon: PERSON },
];

export function TabBar({ tab, onChange }: { tab: TabId; onChange: (t: TabId) => void }) {
  // Hide the bar while the keyboard is up so the "Watch a market" input keeps its room.
  const [kb, setKb] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener("keyboardDidShow", () => setKb(true));
    const b = Keyboard.addListener("keyboardDidHide", () => setKb(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  if (kb) return null;
  return (
    <View style={st.bar} accessibilityRole="tablist" accessibilityLabel={t("tab.bar")}>
      {TABS.map((x) => {
        const on = x.id === tab;
        const color = on ? C.greenBright : C.dim;
        return (
          <Pressable
            key={x.id}
            style={st.cell}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t(x.label)}
            onPress={() => {
              if (on) return;
              haptic.tap();
              onChange(x.id);
            }}
          >
            {({ pressed }) => (
              <View style={[st.inner, on && st.innerOn, { transform: [{ translateY: pressed ? 2 : 0 }] }]}>
                {typeof x.icon === "string" ? <PixelIcon name={x.icon} px={3} color={color} /> : <Sprite map={x.icon} px={3} color={color} />}
                <Text style={[st.label, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {t(x.label)}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: "row", backgroundColor: "#0d1510", borderTopWidth: 4, borderTopColor: C.purple, paddingHorizontal: 6, paddingTop: 6, paddingBottom: 8, gap: 6 },
  cell: { flex: 1 },
  inner: { alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderWidth: 3, borderColor: "transparent" },
  innerOn: { borderColor: C.green, backgroundColor: alpha(C.green, 0.16) },
  label: { fontFamily: PX, fontSize: 8, lineHeight: 12 },
});
