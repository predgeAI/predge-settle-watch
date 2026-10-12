// Helpers, styles and small building blocks shared by App.tsx and the tab screens.
import React, { useEffect, useRef } from "react";
import { Animated, ScrollView, StyleSheet, TextInput, View, type ScrollViewProps } from "react-native";
import * as Clipboard from "expo-clipboard";
import { MAX_INPUT_LENGTH } from "../api";
import { changesLast24h, statusLine, type WatchItem } from "../store";
import { alpha, C, MONO, PX, STATUS, T } from "../theme";
import * as haptic from "../haptic";
import { Button, Chip, PixelBox, Press, Reveal, StatusIcon } from "../ui";
import { Text } from "../Text";
import { fmtNum, t, type Key } from "../i18n";
import { fmtShares, heldOf } from "../positions/sync";

export const EXAMPLES: { label: Key; key: string }[] = [
  { label: "ex.disputed", key: "5186278" },
  { label: "ex.twice", key: "4585694" },
  { label: "ex.quiet", key: "601819" },
];

export function short(s: string, n = 4) {
  return s.length > n * 2 + 3 ? `${s.slice(0, n)}...${s.slice(-n)}` : s;
}

export function ago(iso?: string) {
  if (!iso) return t("time.never");
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return t("time.s", { n: s });
  if (s < 3600) return t("time.m", { n: Math.round(s / 60) });
  if (s < 86400) return t("time.h", { n: Math.round(s / 3600) });
  return t("time.d", { n: Math.round(s / 86400) });
}

export function hh(h: number) {
  return `${String(h).padStart(2, "0")}:00`;
}

export const statusColor = (level?: string) => STATUS[level ?? ""]?.color ?? C.dim;
export const statusLabel = (level?: string) => (level && STATUS[level] ? t(`status.${level}.label` as Key) : "...");
export const statusWord = (level?: string) => (level && STATUS[level] ? t(`status.${level}.word` as Key) : t("status.checking"));

/** Bold, color-coded market card with a pixel icon. Pulses when its status changes. */
export function MarketCard({ item, index, onOpen }: { item: WatchItem; index: number; onOpen: () => void }) {
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
  const held = heldOf(item);
  return (
    <Reveal delay={Math.min(index, 6) * 60} style={{ marginTop: 12 }}>
      <Press onPress={onOpen} label={item.question ?? item.key}>
        <PixelBox border={color} bg={alpha(color, 0.1)} lift={alpha(color, 0.55)} inner={{ padding: 14 }}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color, opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] }) }]} />
          <View style={styles.rowBetween}>
            <View style={styles.statusHead}>
              <StatusIcon level={level} color={color} px={3} />
              <Text style={[styles.statusWord, { color }]}>{statusWord(level)}</Text>
            </View>
            <Text style={[styles.dim, { flexShrink: 1, textAlign: "right" }]}>
              {t("card.checked", { ago: ago(item.lastPolledAt) })}
              {item.lastError ? t("card.error", { msg: item.lastError.slice(0, 80) }) : ""}
            </Text>
          </View>
          <Text style={styles.question} numberOfLines={2}>
            {item.question ?? item.key}
          </Text>
          <Text style={[styles.body, { color }]}>{statusLine(item.snapshot)}</Text>
          {held ? (
            <Text style={[styles.dim, { marginTop: 4 }]} numberOfLines={2}>
              {held.closed ? t("card.heldClosed") : t("card.held", { outcome: held.outcome || "?", size: fmtShares(held.size, fmtNum) })}
            </Text>
          ) : null}
          <View style={styles.rowWrap}>
            {held ? <Chip text={held.closed ? t("chip.heldClosed") : t("chip.held")} color={held.closed ? C.dim : C.teal} /> : null}
            {item.verification ? <Chip text={item.verification.verified ? t("chip.verified") : t("chip.notVerified")} color={item.verification.verified ? C.green : C.red} /> : null}
            {changedToday ? <Chip text={t("chip.changedToday")} color={C.orange} /> : null}
            {item.anchors.length ? <Chip text={t("chip.receipts", { n: item.anchors.length })} color={C.purpleSoft} /> : null}
          </View>
        </PixelBox>
      </Press>
    </Reveal>
  );
}

/** State and handler for the "Watch a market" card. Kept in App.tsx so both tabs share one input. */
export interface AddMarketProps {
  input: string;
  setInput: (s: string) => void;
  busy: string | null;
  addMarket: (raw: string) => unknown;
}

/** "Watch a market": input, paste, add and the example markets. */
export function AddMarketCard({ input, setInput, busy, addMarket }: AddMarketProps) {
  return (
    <PixelBox style={styles.cardGap} inner={styles.cardPad}>
      <Text style={styles.cardTitle}>{t("add.title")}</Text>
      <PixelBox p={2} border={C.line} bg={C.bg} style={{ marginVertical: 8 }} inner={{ paddingHorizontal: 12 }}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={t("add.placeholder")}
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
          <Button title={busy === "add" ? t("add.checking") : t("add.button")} onPress={() => addMarket(input)} disabled={!!busy} />
        </View>
        <Button kind="ghost" title={t("add.paste")} onPress={async () => setInput((await Clipboard.getStringAsync()).slice(0, MAX_INPUT_LENGTH))} disabled={!!busy} />
      </View>
      <Text style={[styles.dim, { marginTop: 10 }]}>{t("add.examples")}</Text>
      <View style={styles.rowWrap}>
        {EXAMPLES.map((e) => (
          <Button key={e.key} small kind="ghost" title={t(e.label)} onPress={() => addMarket(e.key)} disabled={!!busy} />
        ))}
      </View>
    </PixelBox>
  );
}

/**
 * One tab's ScrollView. Inactive tabs stay mounted but hidden, and the scroll offset is
 * restored when the tab comes back, so each tab keeps its place.
 */
export function TabScroll({ active, refreshControl, children }: { active: boolean; refreshControl?: ScrollViewProps["refreshControl"]; children: React.ReactNode }) {
  const ref = useRef<ScrollView>(null);
  const y = useRef(0);
  useEffect(() => {
    if (!active) return;
    const id = requestAnimationFrame(() => ref.current?.scrollTo({ y: y.current, animated: false }));
    return () => cancelAnimationFrame(id);
  }, [active]);
  return (
    <View style={[{ flex: 1 }, !active && { display: "none" }]} accessibilityElementsHidden={!active} importantForAccessibility={active ? "auto" : "no-hide-descendants"}>
      <ScrollView
        ref={ref}
        contentContainerStyle={styles.scroll}
        refreshControl={refreshControl}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={32}
        onScroll={(e) => {
          if (active) y.current = e.nativeEvent.contentOffset.y;
        }}
      >
        {children}
      </ScrollView>
    </View>
  );
}

/** Compact header band for the PLAY and ME tabs, in the same style as the TODAY header. */
export function TabHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.rowBetween}>
        <Text style={styles.brand}>SETTLE WATCH</Text>
        {right}
      </View>
      <Text style={styles.display}>{title}</Text>
      {sub ? <Text style={[styles.subtitle, { marginTop: 8 }]}>{sub}</Text> : null}
      <View style={styles.stepRow}>
        {Array.from({ length: 24 }).map((_, i) => (
          <View key={i} style={[styles.stepBit, { backgroundColor: i % 3 === 0 ? alpha(C.purple, 0.55) : alpha(C.green, 0.35) }]} />
        ))}
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 56 },
  header: { marginHorizontal: -16, paddingHorizontal: 20, paddingTop: 52, paddingBottom: 18, backgroundColor: "#160f2b", borderBottomWidth: 4, borderBottomColor: C.purple },
  detailHead: { marginHorizontal: -16, paddingHorizontal: 16, paddingTop: 52, paddingBottom: 18, borderBottomWidth: 4 },
  stepRow: { flexDirection: "row", marginTop: 14, marginHorizontal: -20, marginBottom: -18 },
  stepBit: { flex: 1, height: 4 },
  brand: { color: C.greenBright, fontFamily: PX, fontSize: 10 },
  display: { color: C.text, fontFamily: PX, fontSize: 22, lineHeight: 30, marginTop: 18 },
  subtitle: { color: C.dim, fontSize: T.small, lineHeight: 19 },
  heroKicker: { color: C.ink, fontFamily: PX, fontSize: 16, lineHeight: 22 },
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
  clockBtnText: { color: C.greenBright, fontFamily: PX, fontSize: 11, lineHeight: 16, textAlign: "center", paddingHorizontal: 6 },
  cardGap: { marginTop: 14 },
  cardPad: { padding: 14 },
  statusHead: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  statusWord: { fontFamily: PX, fontSize: 13, lineHeight: 18, flexShrink: 1 },
  recapText: { color: C.text, fontSize: T.heading, fontWeight: "700", lineHeight: 25, marginVertical: 6 },
  cardTitle: { color: C.text, fontFamily: PX, fontSize: 11, lineHeight: 18, marginBottom: 8 },
  cardLabel: { color: C.dim, fontSize: 8, marginBottom: 4, textTransform: "uppercase", fontFamily: PX },
  section: { color: C.greenBright, fontSize: 12, lineHeight: 18, marginTop: 26, fontFamily: PX },
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
  langText: { fontSize: T.small, fontWeight: "700" },
  verifyHead: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 10 },
  bigCount: { color: C.text, fontFamily: PX, fontSize: 28 },
  bigCountOf: { color: C.dim, fontSize: 14 },
  stamp: { ...StyleSheet.absoluteFillObject, backgroundColor: "#0a0f0bd9", alignItems: "center", justifyContent: "center", zIndex: 40 },
  stampText: { color: C.greenBright, fontFamily: PX, marginTop: 22, fontSize: 12, lineHeight: 18, textAlign: "center", paddingHorizontal: 24 },
  badgeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  badgeCell: { padding: 14, alignItems: "center", gap: 8 },
  badgeName: { color: C.text, fontFamily: PX, fontSize: 9, lineHeight: 14, textAlign: "center" },
  howRule: { height: 3, backgroundColor: C.line, marginVertical: 16 },
  dotBig: { width: 12, height: 12 },
});
