import React, { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Easing, SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { t, useLang } from "./i18n";
import { C, PX, T } from "./theme";
import { Button, LiveMascot, PixelBox, Press, Reveal, Scanlines, useReducedMotion, useTicker } from "./ui";
import * as haptic from "./haptic";
import { XP } from "./game";
import type { Mood } from "./sprites";
import { openTour } from "./learn/tour";
import { FeedPicker } from "./discover/FeedPicker";
import { ExampleWalkthrough } from "./learn/Example";
import type { FeedPrefs } from "./discover/interests";

// One idea per screen. The longer explanation lives in Settings > How it works.
export const steps = () => [
  { kicker: t("onb.level", { n: 1 }), title: t("onb.s1.title"), body: t("onb.s1.body"), note: t("onb.s1.note") },
  { kicker: t("onb.level", { n: 2 }), title: t("onb.s2.title"), body: t("onb.s2.body"), note: "" },
  { kicker: t("onb.level", { n: 3 }), title: t("onb.s3.title"), body: t("onb.s3.body"), note: "" },
];

// Screens: 0 title, 1 problem, 2 solution, 3 collect markets, 4 first clock in, 5 what do you follow, 6 ready.
const FEED = 5;
const LAST = 6;
const W = Dimensions.get("window").width - 48;
const DOT_AT = [0.3, 0.55, 0.8];

export default function Onboarding(props: {
  initialFeed: FeedPrefs;
  onWatchExample: () => void;
  onDone: (addExamples: boolean, clockedIn: boolean, feed?: FeedPrefs) => void;
}) {
  // Before the game-style steps: one plain sentence, then an optional walkthrough on a real market.
  const [pre, setPre] = useState<"plain" | "example" | null>("plain");
  const [step, setStep] = useState(0);
  const [feed, setFeed] = useState<FeedPrefs>(props.initialFeed);
  const [feedSet, setFeedSet] = useState(false); // only save what the user actually chose
  const [add, setAdd] = useState(false);
  const [walking, setWalking] = useState(false);
  const [clocked, setClocked] = useState(false);
  const reduced = useReducedMotion();
  const blink = useTicker(500, !reduced);
  const x = useRef(new Animated.Value(0)).current;
  const dotTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => dotTimers.current.forEach(clearTimeout), []);
  const pop = useRef(new Animated.Value(0)).current;
  const first = XP.clock_in + 2;
  useLang();

  const go = (n: number) => setStep(n);
  const skip = () => props.onDone(false, false);

  const collect = () => {
    setAdd(true);
    haptic.tap();
    if (reduced) {
      x.setValue(W - 60);
      go(4);
      return;
    }
    setWalking(true);
    // A light tick as the mascot picks up each market dot.
    dotTimers.current = DOT_AT.map((f) => setTimeout(haptic.tap, Math.round(1500 * f)));
    Animated.timing(x, { toValue: W - 60, duration: 1500, easing: Easing.linear, useNativeDriver: false }).start(() => {
      setWalking(false);
      haptic.success();
      setTimeout(() => go(4), 450);
    });
  };

  const clockIn = () => {
    if (clocked) return;
    setClocked(true);
    haptic.clockIn();
    pop.setValue(0);
    Animated.timing(pop, { toValue: 1, duration: reduced ? 1 : 1100, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };

  useEffect(() => {
    if (step === LAST) haptic.levelUp();
  }, [step]);

  useEffect(() => {
    if (step === 3) {
      x.setValue(0);
      setWalking(false);
    }
  }, [step, x]);

  const mood: Mood = step === 1 ? "alarm" : step === 2 || step === LAST || clocked ? "cheer" : "idle";
  const STEPS = steps();
  const info = step === 1 ? STEPS[0] : step === 2 ? STEPS[1] : step === 3 ? STEPS[2] : null;

  if (pre) {
    return (
      <View style={st.root}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={st.wrap}>
            {pre === "plain" ? (
              <>
                <View style={{ flex: 1, justifyContent: "center" }}>
                  <Reveal key="plain" style={{ alignItems: "center" }}>
                    <LiveMascot mood="idle" px={10} />
                    <Text style={[st.body, st.plain]}>{t("onb.plain.body")}</Text>
                  </Reveal>
                </View>
                <Button title={t("onb.plain.example")} onPress={() => setPre("example")} />
                <Press onPress={() => setPre(null)} label={t("onb.plain.skip")} haptics={false}>
                  <Text style={st.link}>{t("onb.plain.skip")}</Text>
                </Press>
              </>
            ) : (
              <ExampleWalkthrough
                onWatch={() => {
                  props.onWatchExample();
                  setPre(null);
                }}
                onClose={() => setPre(null)}
              />
            )}
          </View>
        </SafeAreaView>
        <Scanlines />
      </View>
    );
  }

  return (
    <View style={st.root}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={st.wrap}>
          <View style={st.top}>
            <Text style={st.brand}>SETTLE WATCH</Text>
            {step < LAST ? (
              <Press onPress={skip} label={t("onb.skipLabel")} haptics={false}>
                <Text style={st.skip}>{t("onb.skip")}</Text>
              </Press>
            ) : null}
          </View>

          <View style={{ flex: 1, justifyContent: "center" }}>
            {step === 0 ? (
              <Reveal key="s0" style={{ alignItems: "center" }}>
                <LiveMascot mood="idle" px={12} />
                <Text style={st.logo}>SETTLE{"\n"}WATCH</Text>
                <Text style={st.tag}>{t("intro.tagline")}</Text>
                <Text style={[st.press, { opacity: blink % 2 || reduced ? 1 : 0.15 }]}>{t("onb.pressStart")}</Text>
              </Reveal>
            ) : null}

            {info ? (
              <Reveal key={`s${step}`}>
                <View style={{ alignItems: "center", marginBottom: 18 }}>
                  <LiveMascot mood={mood} px={7} walking={false} />
                </View>
                <Text style={st.kicker}>{info.kicker}</Text>
                <Text style={st.title}>{info.title}</Text>
                <Text style={st.body}>{info.body}</Text>
                {info.note ? <Text style={[st.dim, { marginTop: 12 }]}>{info.note}</Text> : null}
                {step === 3 ? (
                  <View style={{ marginTop: 22 }}>
                    <PixelBox border={C.line} bg={C.surface} inner={{ padding: 10, height: 76, justifyContent: "center" }}>
                      {DOT_AT.map((d, i) => (
                        <Animated.View
                          key={i}
                          style={[st.dot, { left: W * d - 8, opacity: x.interpolate({ inputRange: [W * d - 60, W * d - 30], outputRange: [1, 0], extrapolate: "clamp" }) }]}
                        />
                      ))}
                      <Animated.View style={{ position: "absolute", left: 6, transform: [{ translateX: x }] }}>
                        <LiveMascot walking={walking} px={4} />
                      </Animated.View>
                    </PixelBox>
                    <Text style={[st.dim, { marginTop: 8, textAlign: "center" }]}>{t("onb.realMarkets")}</Text>
                  </View>
                ) : null}
              </Reveal>
            ) : null}

            {step === 4 ? (
              <Reveal key="s4" style={{ alignItems: "center" }}>
                <View style={{ height: 40, justifyContent: "flex-end" }}>
                  <Animated.Text
                    style={[st.plus, { opacity: pop.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 1, 0.3] }), transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [10, -26] }) }] }]}
                  >
                    {clocked ? `+${first} XP` : ""}
                  </Animated.Text>
                </View>
                <LiveMascot mood={clocked ? "cheer" : "idle"} px={10} />
                <Text style={[st.title, { marginTop: 22, textAlign: "center" }]}>{clocked ? t("onb.clockedIn") : t("onb.clockIn")}</Text>
                <Text style={[st.body, { textAlign: "center" }]}>
                  {clocked ? t("onb.clockedBody") : t("onb.clockBody")}
                </Text>
              </Reveal>
            ) : null}

            {step === FEED ? (
              <Reveal key="s5">
                <Text style={st.title}>{t("onb.feed.title")}</Text>
                <Text style={[st.dim, { marginBottom: 14 }]}>{t("onb.feed.body")}</Text>
                {/* Scrolls when the country list is open on a small screen. */}
                <ScrollView style={{ maxHeight: Dimensions.get("window").height * 0.5 }}>
                  <FeedPicker
                    prefs={feed}
                    onChange={(p) => {
                      setFeed(p);
                      setFeedSet(true);
                    }}
                  />
                </ScrollView>
              </Reveal>
            ) : null}

            {step === LAST ? (
              <Reveal key="s6" style={{ alignItems: "center" }}>
                <LiveMascot mood="cheer" px={10} />
                <Text style={st.logo}>{t("onb.ready")}</Text>
                <Text style={[st.body, { textAlign: "center" }]}>
                  {add ? t("onb.readyAdded") : t("onb.readyPaste")} {t("onb.readyAlerts")}
                </Text>
              </Reveal>
            ) : null}
          </View>

          <View style={st.dots}>
            {Array.from({ length: LAST + 1 }).map((_, i) => (
              <View key={i} style={[st.pip, i === step && { backgroundColor: C.green }, i < step && { backgroundColor: C.greenDeep }]} />
            ))}
          </View>

          {step === 0 ? <Button title={t("onb.pressStartBtn")} onPress={() => go(1)} /> : null}
          {step === 1 || step === 2 ? (
            <View style={st.between}>
              <Button kind="ghost" title={t("common.back")} onPress={() => go(step - 1)} />
              <Button title={t("common.next")} onPress={() => go(step + 1)} />
            </View>
          ) : null}
          {step === 3 ? (
            <>
              <Button title={t("onb.grab")} onPress={collect} disabled={walking} />
              <Press
                onPress={() => {
                  setAdd(false);
                  go(4);
                }}
                disabled={walking}
                label={t("onb.ownLabel")}
                haptics={false}
              >
                <Text style={st.link}>{t("onb.ownLink")}</Text>
              </Press>
            </>
          ) : null}
          {step === 4 ? <Button title={clocked ? t("common.next") : t("onb.clockInBtn")} onPress={() => (clocked ? go(FEED) : clockIn())} /> : null}
          {step === FEED ? (
            <>
              <Button title={t("common.next")} onPress={() => go(LAST)} />
              <Press
                onPress={() => {
                  setFeedSet(false);
                  go(LAST);
                }}
                label={t("onb.feed.skip")}
                haptics={false}
              >
                <Text style={st.link}>{t("onb.feed.skip")}</Text>
              </Press>
            </>
          ) : null}
          {step === LAST ? (
            <>
              {/* Optional: a 60-second tour for people new to prediction markets. "Let's go" skips it. */}
              <Button kind="ghost" title={t("learn.onbOffer")} onPress={openTour} style={{ marginBottom: 12 }} />
              <Button title={t("onb.letsGo")} onPress={() => props.onDone(add, clocked, feedSet ? feed : undefined)} />
            </>
          ) : null}
        </View>
      </SafeAreaView>
      <Scanlines />
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  wrap: { flex: 1, padding: 24, paddingTop: 52 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: { color: C.greenBright, fontFamily: PX, fontSize: 10 },
  skip: { color: C.dim, fontFamily: PX, fontSize: 10, padding: 6 },
  logo: { color: C.greenBright, fontFamily: PX, fontSize: 28, lineHeight: 42, textAlign: "center", marginTop: 26 },
  tag: { color: C.greenDeep, fontFamily: PX, fontSize: 8, lineHeight: 12, marginTop: 14, textAlign: "center" },
  press: { color: C.orange, fontFamily: PX, fontSize: 12, lineHeight: 18, marginTop: 40, textAlign: "center" },
  kicker: { color: C.green, fontFamily: PX, fontSize: 9, lineHeight: 14, marginBottom: 12 },
  title: { color: C.text, fontFamily: PX, fontSize: 16, lineHeight: 26, marginBottom: 12 },
  body: { color: C.text, fontSize: 16, lineHeight: 24 },
  plain: { fontSize: 19, lineHeight: 29, textAlign: "center", marginTop: 28 },
  dim: { color: C.dim, fontSize: T.small, lineHeight: 18, fontFamily: undefined },
  plus: { color: C.greenBright, fontFamily: PX, fontSize: 18 },
  dot: { position: "absolute", top: 33, width: 14, height: 14, backgroundColor: C.greenBright },
  link: { color: C.dim, fontSize: T.small, textAlign: "center", textDecorationLine: "underline", paddingVertical: 14 },
  dots: { flexDirection: "row", gap: 6, justifyContent: "center", marginVertical: 18 },
  pip: { width: 10, height: 10, backgroundColor: C.line },
  between: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
});
