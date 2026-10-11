import React, { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Easing, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { C, PX, T } from "./theme";
import { Button, LiveMascot, PixelBox, Press, Reveal, Scanlines, useReducedMotion, useTicker } from "./ui";
import * as haptic from "./haptic";
import { XP } from "./game";
import type { Mood } from "./sprites";

// One idea per screen. The longer explanation lives in Settings > How it works.
export const STEPS = [
  {
    kicker: "LEVEL 1",
    title: "RESOLVED \u2260 FINAL",
    body: "1 in 3 disputed Polymarket markets settled differently from the first answer in 2026.",
    note: "853 of 2,543, 1 Jan to 2 Oct 2026. Data: Polygon.",
  },
  {
    kicker: "LEVEL 2",
    title: "YOUR POWER-UP",
    body: "Watch a market. Get a ping when it's disputed or final. Your phone checks every alert itself.",
    note: "",
  },
  {
    kicker: "LEVEL 3",
    title: "PRESS START",
    body: "Grab 3 real markets and clock in.",
    note: "",
  },
];

// Screens: 0 title, 1 problem, 2 solution, 3 collect markets, 4 first clock in, 5 ready.
const LAST = 5;
const W = Dimensions.get("window").width - 48;
const DOT_AT = [0.3, 0.55, 0.8];

export default function Onboarding(props: { onDone: (addExamples: boolean, clockedIn: boolean) => void }) {
  const [step, setStep] = useState(0);
  const [add, setAdd] = useState(false);
  const [walking, setWalking] = useState(false);
  const [clocked, setClocked] = useState(false);
  const reduced = useReducedMotion();
  const blink = useTicker(500, !reduced);
  const x = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const first = XP.clock_in + 2;

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
    Animated.timing(x, { toValue: W - 60, duration: 1500, easing: Easing.linear, useNativeDriver: false }).start(() => {
      setWalking(false);
      haptic.success();
      setTimeout(() => go(4), 450);
    });
  };

  const clockIn = () => {
    if (clocked) return;
    setClocked(true);
    haptic.success();
    pop.setValue(0);
    Animated.timing(pop, { toValue: 1, duration: reduced ? 1 : 1100, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };

  useEffect(() => {
    if (step === 3) {
      x.setValue(0);
      setWalking(false);
    }
  }, [step, x]);

  const mood: Mood = step === 1 ? "alarm" : step === 2 || step === 5 || clocked ? "cheer" : "idle";
  const info = step === 1 ? STEPS[0] : step === 2 ? STEPS[1] : step === 3 ? STEPS[2] : null;

  return (
    <View style={st.root}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={st.wrap}>
          <View style={st.top}>
            <Text style={st.brand}>SETTLE WATCH</Text>
            {step < LAST ? (
              <Press onPress={skip} label="Skip" haptics={false}>
                <Text style={st.skip}>SKIP</Text>
              </Press>
            ) : null}
          </View>

          <View style={{ flex: 1, justifyContent: "center" }}>
            {step === 0 ? (
              <Reveal key="s0" style={{ alignItems: "center" }}>
                <LiveMascot mood="idle" px={12} />
                <Text style={st.logo}>SETTLE{"\n"}WATCH</Text>
                <Text style={st.tag}>CLOCK IN. CHECK THE SETTLEMENT.</Text>
                <Text style={[st.press, { opacity: blink % 2 || reduced ? 1 : 0.15 }]}>PRESS START</Text>
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
                    <Text style={[st.dim, { marginTop: 8, textAlign: "center" }]}>3 REAL MARKETS</Text>
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
                <Text style={[st.title, { marginTop: 22, textAlign: "center" }]}>{clocked ? "CLOCKED IN!" : "CLOCK IN"}</Text>
                <Text style={[st.body, { textAlign: "center" }]}>
                  {clocked ? "Day 1 of your streak. Come back tomorrow." : "Tap once a day. Build a streak. Earn XP."}
                </Text>
              </Reveal>
            ) : null}

            {step === LAST ? (
              <Reveal key="s5" style={{ alignItems: "center" }}>
                <LiveMascot mood="cheer" px={10} />
                <Text style={st.logo}>READY?</Text>
                <Text style={[st.body, { textAlign: "center" }]}>
                  {add ? "3 markets are ready." : "Paste a Polymarket link on Home."} Say yes to alerts when asked.
                </Text>
              </Reveal>
            ) : null}
          </View>

          <View style={st.dots}>
            {Array.from({ length: LAST + 1 }).map((_, i) => (
              <View key={i} style={[st.pip, i === step && { backgroundColor: C.green }, i < step && { backgroundColor: C.greenDeep }]} />
            ))}
          </View>

          {step === 0 ? <Button title="Press start" onPress={() => go(1)} /> : null}
          {step === 1 || step === 2 ? (
            <View style={st.between}>
              <Button kind="ghost" title="Back" onPress={() => go(step - 1)} />
              <Button title="Next" onPress={() => go(step + 1)} />
            </View>
          ) : null}
          {step === 3 ? (
            <>
              <Button title="Grab 3 markets" onPress={collect} disabled={walking} />
              <Press
                onPress={() => {
                  setAdd(false);
                  go(4);
                }}
                disabled={walking}
                label="I will paste my own"
                haptics={false}
              >
                <Text style={st.link}>I will paste my own link instead</Text>
              </Press>
            </>
          ) : null}
          {step === 4 ? <Button title={clocked ? "Next" : "Clock in"} onPress={() => (clocked ? go(5) : clockIn())} /> : null}
          {step === LAST ? <Button title="Let's go" onPress={() => props.onDone(add, clocked)} /> : null}
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
  tag: { color: C.greenDeep, fontFamily: PX, fontSize: 8, marginTop: 14, textAlign: "center" },
  press: { color: C.orange, fontFamily: PX, fontSize: 12, marginTop: 40 },
  kicker: { color: C.green, fontFamily: PX, fontSize: 9, lineHeight: 14, marginBottom: 12 },
  title: { color: C.text, fontFamily: PX, fontSize: 16, lineHeight: 26, marginBottom: 12 },
  body: { color: C.text, fontSize: 16, lineHeight: 24 },
  dim: { color: C.dim, fontSize: T.small, lineHeight: 18, fontFamily: undefined },
  plus: { color: C.greenBright, fontFamily: PX, fontSize: 18 },
  dot: { position: "absolute", top: 33, width: 14, height: 14, backgroundColor: C.greenBright },
  link: { color: C.dim, fontSize: T.small, textAlign: "center", textDecorationLine: "underline", paddingVertical: 14 },
  dots: { flexDirection: "row", gap: 6, justifyContent: "center", marginVertical: 18 },
  pip: { width: 10, height: 10, backgroundColor: C.line },
  between: { flexDirection: "row", justifyContent: "space-between" },
});
