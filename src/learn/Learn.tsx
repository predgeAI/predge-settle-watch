// "Prediction markets in 60 seconds": a five-card pixel tour for people new to prediction markets,
// plus its entry points (PLAY card, TODAY header link, empty watchlist, status help).
import React, { useEffect, useRef, useState } from "react";
import { Modal, SafeAreaView, ScrollView, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Text } from "../Text";
import { t, type Key } from "../i18n";
import { alpha, C, PX, T } from "../theme";
import { Button, Chip, LiveMascot, PixelBox, Press, Scanlines, useReducedMotion } from "../ui";
import { PixelIcon, type Mood } from "../sprites";
import * as haptic from "../haptic";
import { XP, type GameState } from "../game";
import { closeTour, goDiscover, openTour, setDiscoverHandler, tourDone, useTourOpen } from "./tour";
import { explain, QBadge, Term } from "./Term";
import { setHallWatchHandler } from "./HallOfDisputes";

// ---------------------------------------------------------------------------
// Pixel illustrations, built from plain Views
// ---------------------------------------------------------------------------

function Bar({ label, price, share, color }: { label: string; price: string; share: number; color: string }) {
  return (
    <View style={st.barRow}>
      <Text style={[st.barLabel, { color }]} numberOfLines={1}>
        {label} {price}
      </Text>
      <View style={st.barTrack}>
        <View style={{ width: `${share}%`, height: "100%", backgroundColor: color }} />
      </View>
    </View>
  );
}

/** A market card with YES and NO price bars. */
function MarketIllo() {
  return (
    <PixelBox border={C.line} bg={C.surfaceHi} lift="#0d1710" inner={{ padding: 12, width: 250, gap: 8 }}>
      <Text style={st.illoQ}>{t("learn.s1.q")}</Text>
      <Bar label={t("learn.yes")} price="70¢" share={70} color={C.green} />
      <Bar label={t("learn.no")} price="30¢" share={30} color={C.orange} />
    </PixelBox>
  );
}

/** A tilted proposal stamp and the objection window. */
function StampIllo() {
  return (
    <View style={{ alignItems: "center", gap: 12 }}>
      <View style={{ transform: [{ rotate: "-6deg" }] }}>
        <PixelBox p={4} border={C.purpleSoft} bg={alpha(C.purple, 0.16)} inner={{ paddingVertical: 12, paddingHorizontal: 16 }}>
          <Text style={[st.stamp, { color: C.purpleSoft }]}>{t("learn.s2.stamp")}</Text>
        </PixelBox>
      </View>
      <Chip text={t("learn.s2.timer")} color={C.teal} />
    </View>
  );
}

/** A dispute flag on a pole. */
function FlagIllo() {
  return (
    <View style={{ alignItems: "center", gap: 10 }}>
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: 6, height: 96, backgroundColor: C.creamDim }} />
        <View style={{ width: 84, height: 50, backgroundColor: C.orange, alignItems: "center", justifyContent: "center", borderBottomWidth: 6, borderBottomColor: "#a94f26" }}>
          <PixelIcon name="caution" px={3} color={C.bg} />
        </View>
      </View>
      <Chip text={t("learn.s3.flag")} color={C.orange} />
    </View>
  );
}

/** A UMA ballot box next to this year's numbers. */
function BallotIllo() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
      <View style={{ alignItems: "center" }}>
        <View style={{ width: 46, height: 30, backgroundColor: C.cream, alignItems: "center", justifyContent: "center", marginBottom: -8, zIndex: 1 }}>
          <PixelIcon name="check" px={2} color={C.ink} />
        </View>
        <View style={{ width: 100, height: 64, backgroundColor: C.purple, alignItems: "center", paddingTop: 6, borderBottomWidth: 6, borderBottomColor: "#5d24a8" }}>
          <View style={{ width: 60, height: 6, backgroundColor: "#2a1050" }} />
          <Text style={[st.ballot, { marginTop: 12 }]}>{t("learn.s4.ballot")}</Text>
        </View>
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text style={st.pct}>{t("learn.s4.pct")}</Text>
        <Text style={st.stat}>{t("learn.s4.stat")}</Text>
      </View>
    </View>
  );
}

/** Slide 4 only: one verified case from the Hall of Disputes (src/learn/hall.ts). */
const SLIDE_NOTE: Partial<Record<number, Key>> = { 4: "learn.s4.case" };

/** A closed treasure chest: settled for good. */
function ChestIllo() {
  return (
    <View style={{ alignItems: "center", gap: 10 }}>
      <View style={{ width: 120 }}>
        <View style={{ height: 28, backgroundColor: "#8a5a2b", borderTopWidth: 6, borderTopColor: "#a8733c", marginHorizontal: 6 }} />
        <View style={{ height: 6, backgroundColor: C.orange }} />
        <View style={{ height: 46, backgroundColor: "#6b4420", alignItems: "center" }}>
          <View style={{ width: 16, height: 18, backgroundColor: "#ffd29a", marginTop: -10, alignItems: "center", paddingTop: 6 }}>
            <View style={{ width: 4, height: 6, backgroundColor: C.ink }} />
          </View>
        </View>
      </View>
      <Chip text={t("learn.s5.chest")} color={C.green} />
    </View>
  );
}

const SLIDES: { n: number; mood: Mood; Illo: () => React.JSX.Element }[] = [
  { n: 1, mood: "idle", Illo: MarketIllo },
  { n: 2, mood: "idle", Illo: StampIllo },
  { n: 3, mood: "alarm", Illo: FlagIllo },
  { n: 4, mood: "alarm", Illo: BallotIllo },
  { n: 5, mood: "cheer", Illo: ChestIllo },
];

// ---------------------------------------------------------------------------
// The tour
// ---------------------------------------------------------------------------

function Tour({ onFinish }: { onFinish: () => void }) {
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [page, setPage] = useState(0);
  const ref = useRef<ScrollView>(null);
  const last = SLIDES.length - 1;

  const go = (n: number) => {
    const k = Math.max(0, Math.min(last, n));
    ref.current?.scrollTo({ x: k * width, animated: !reduced });
    setPage(k);
  };
  const onSwipe = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const k = Math.max(0, Math.min(last, Math.round(e.nativeEvent.contentOffset.x / width)));
    if (k !== page) {
      haptic.tab();
      setPage(k);
    }
  };

  return (
    <View style={st.root}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={st.top}>
          <Text style={st.kicker} accessibilityRole="header">
            {t("learn.title")}
          </Text>
          <Press onPress={closeTour} label={t("learn.close")} haptics={false}>
            <Text style={st.close}>{t("learn.close")}</Text>
          </Press>
        </View>

        <ScrollView ref={ref} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onSwipe} style={{ flex: 1 }}>
          {SLIDES.map((s, i) => (
            <ScrollView key={s.n} style={{ width }} contentContainerStyle={st.page}>
              <View style={{ alignItems: "center" }}>
                <LiveMascot mood={s.mood} px={6} />
              </View>
              <View style={st.illo}>
                <s.Illo />
              </View>
              <Text style={st.step}>{t("learn.step", { n: i + 1, total: SLIDES.length })}</Text>
              <Text style={st.title}>{t(`learn.s${s.n}.title` as Key)}</Text>
              <Text style={st.body}>{t(`learn.s${s.n}.body` as Key)}</Text>
              {SLIDE_NOTE[s.n] ? <Text style={st.note}>{t(SLIDE_NOTE[s.n] as Key)}</Text> : null}
            </ScrollView>
          ))}
        </ScrollView>

        <View style={st.foot}>
          <View style={st.dots}>
            {SLIDES.map((s, i) => (
              <View key={s.n} style={[st.pip, i === page && { backgroundColor: C.green }, i < page && { backgroundColor: C.greenDeep }]} />
            ))}
          </View>
          <View style={st.between}>
            <View style={{ flex: 1 }}>
              <Button kind="ghost" title={t("common.back")} onPress={() => go(page - 1)} disabled={page === 0} />
            </View>
            <View style={{ flex: 1 }}>{page < last ? <Button title={t("common.next")} onPress={() => go(page + 1)} /> : <Button title={t("learn.gotIt")} onPress={onFinish} />}</View>
          </View>
        </View>
      </SafeAreaView>
      <Scanlines />
    </View>
  );
}

/**
 * Mount once, before DialogHost. Shows the tour whenever openTour() is called.
 * `onDone` runs on "Got it" (the app credits the one-time XP); `onDiscover` switches to the DISCOVER tab.
 */
export function LearnHost({ onDone, onDiscover, onWatch }: { onDone: () => void; onDiscover: () => void; onWatch?: (marketId: string) => Promise<boolean> }) {
  const open = useTourOpen();
  const discover = useRef(onDiscover);
  discover.current = onDiscover;
  const watchRef = useRef(onWatch);
  watchRef.current = onWatch;
  useEffect(() => {
    setDiscoverHandler(() => discover.current());
    // The Hall of Disputes adds its markets through the app's add path.
    setHallWatchHandler((id) => (watchRef.current ? watchRef.current(id) : false));
    return () => {
      setDiscoverHandler(null);
      setHallWatchHandler(null);
    };
  }, []);
  const finish = () => {
    haptic.success();
    closeTour();
    onDone();
  };
  return (
    <Modal visible={open} statusBarTranslucent animationType="slide" onRequestClose={closeTour}>
      {open ? <Tour onFinish={finish} /> : null}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/** PLAY tab card: "NEW HERE? 60-SECOND TOUR". */
export function TourCard({ game }: { game: GameState }) {
  const done = tourDone(game);
  return (
    <Press onPress={openTour} label={t("learn.open")}>
      <PixelBox border={C.teal} bg={alpha(C.teal, 0.08)} style={{ marginTop: 14 }} inner={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <PixelIcon name="question" px={5} color={C.teal} />
        <View style={{ flex: 1 }}>
          <Text style={st.entryKicker}>
            {t("learn.kicker")} {t("learn.cardTitle")}
          </Text>
          <Text style={st.entryText}>{t("learn.cardBody")}</Text>
        </View>
        <Chip text={done ? t("learn.cardDone") : `+${XP.learn} XP`} color={done ? C.greenDeep : C.green} />
      </PixelBox>
    </Press>
  );
}

/** TODAY header: a small "? 60-SECOND TOUR" link and the XP and streak explanation. */
export function HeaderHelp() {
  return (
    <View style={st.headerRow}>
      <Press onPress={openTour} label={t("learn.open")}>
        <PixelBox p={2} border={alpha(C.teal, 0.9)} bg={alpha(C.teal, 0.14)} inner={{ paddingVertical: 5, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <PixelIcon name="question" px={2} color={C.teal} />
          <Text style={st.headerLink}>{t("learn.headerTour")}</Text>
        </PixelBox>
      </Press>
      <Term id="xp" />
    </View>
  );
}

/** Under the four status tiles: one "?" that explains all four. */
export function StatusHelp() {
  return (
    <Press onPress={() => explain("status")} label={t("term.a11y", { term: t("term.status.title") })}>
      <View style={st.statusHelp}>
        <Text style={st.statusHelpText}>{t("learn.statusHelp")}</Text>
        <QBadge />
      </View>
    </Press>
  );
}

/** TODAY with an empty watchlist: what to do next, in plain words. */
export function EmptyWatchlist() {
  return (
    <PixelBox border={C.teal} bg={alpha(C.teal, 0.08)} style={{ marginTop: 12 }} inner={{ padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <LiveMascot mood="sleep" px={4} />
        <Text style={[st.entryKicker, { flex: 1, marginBottom: 0 }]}>{t("learn.empty.title")}</Text>
      </View>
      <Text style={[st.entryText, { marginTop: 12 }]}>{t("learn.empty.body")}</Text>
      <View style={[st.between, { marginTop: 14 }]}>
        <View style={{ flex: 1 }}>
          <Button small title={t("learn.empty.discover")} onPress={goDiscover} />
        </View>
        <View style={{ flex: 1 }}>
          <Button small kind="ghost" title={t("learn.empty.tour")} onPress={openTour} />
        </View>
      </View>
    </PixelBox>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 52, paddingBottom: 8 },
  kicker: { color: C.green, fontFamily: PX, fontSize: 9, lineHeight: 14, flex: 1 },
  close: { color: C.dim, fontFamily: PX, fontSize: 10, padding: 6 },
  page: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24 },
  illo: { alignItems: "center", justifyContent: "center", minHeight: 150, marginVertical: 18 },
  step: { color: C.greenDeep, fontFamily: PX, fontSize: 8, marginBottom: 10 },
  title: { color: C.text, fontFamily: PX, fontSize: 14, lineHeight: 24, marginBottom: 12 },
  body: { color: C.text, fontSize: 17, lineHeight: 26 },
  note: { color: C.dim, fontSize: T.body, lineHeight: 21, marginTop: 14 },
  foot: { paddingHorizontal: 24, paddingBottom: 20 },
  dots: { flexDirection: "row", gap: 6, justifyContent: "center", marginBottom: 14 },
  pip: { width: 10, height: 10, backgroundColor: C.line },
  between: { flexDirection: "row", gap: 12 },
  illoQ: { color: C.text, fontSize: T.body, fontWeight: "700" },
  barRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  barLabel: { fontFamily: PX, fontSize: 9, width: 92 },
  barTrack: { flex: 1, height: 14, backgroundColor: alpha(C.text, 0.1) },
  stamp: { fontFamily: PX, fontSize: 13, lineHeight: 20, textAlign: "center" },
  ballot: { color: C.text, fontFamily: PX, fontSize: 7 },
  pct: { color: C.orange, fontFamily: PX, fontSize: 24, lineHeight: 32 },
  stat: { color: C.dim, fontSize: T.body, marginTop: 4 },
  entryKicker: { color: C.teal, fontFamily: PX, fontSize: 9, lineHeight: 15, marginBottom: 6 },
  entryText: { color: C.text, fontSize: T.body, lineHeight: 21 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  headerLink: { color: C.teal, fontFamily: PX, fontSize: 8, lineHeight: 12 },
  statusHelp: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  statusHelpText: { color: C.dim, fontFamily: PX, fontSize: 8, lineHeight: 12 },
});
