import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { C, PX } from "./theme";
import { LiveMascot, useReducedMotion } from "./ui";
import * as haptic from "./haptic";
import { Text } from "./Text";
import { t } from "./i18n";

const TRACK = 240;
const DOTS = [70, 110, 150, 190];
/** The mascot reaches the end of the track (lands) this long after the intro starts. */
const LAND_MS = 700;
/** Landing shake: a few px, 250 ms. */
const SHAKE_X = [4, -3, 2, -1, 0];
const SHAKE_Y = [3, -1, 0];

/**
 * Arcade intro, about 1.2 s, drawn over the app while it loads underneath.
 * The native splash (same background, mascot icon) hides as soon as this view is laid out.
 * When the mascot lands the screen gives a small shake, timed with the launch haptic's thud.
 * With reduced motion on, the title shows still for 350 ms and fades (no shake; haptics still play).
 */
export default function Intro({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion();
  const x = useRef(new Animated.Value(reduced ? TRACK : 0)).current;
  const title = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const out = useRef(new Animated.Value(1)).current;
  const sx = useRef(new Animated.Value(0)).current;
  const sy = useRef(new Animated.Value(0)).current;
  const started = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const start = () => {
    if (started.current) return;
    started.current = true;
    SplashScreen.hideAsync().catch(() => undefined);
    const fade = Animated.timing(out, { toValue: 0, duration: 220, useNativeDriver: true });
    if (reduced) {
      haptic.launch();
      Animated.sequence([Animated.delay(350), fade]).start(onDone);
      return;
    }
    // Start the haptic early so its thud lands with the mascot.
    timers.current.push(setTimeout(haptic.launch, Math.max(0, LAND_MS - haptic.LAUNCH_LEAD_MS)));
    const step = (v: Animated.Value, to: number[], ms: number) =>
      Animated.sequence(to.map((toValue) => Animated.timing(v, { toValue, duration: ms, easing: Easing.out(Easing.quad), useNativeDriver: true })));
    Animated.sequence([
      Animated.delay(LAND_MS),
      Animated.parallel([step(sx, SHAKE_X, 250 / SHAKE_X.length), step(sy, SHAKE_Y, 250 / SHAKE_Y.length)]),
    ]).start();
    Animated.parallel([
      Animated.timing(x, { toValue: TRACK, duration: LAND_MS, easing: Easing.linear, useNativeDriver: false }),
      Animated.timing(title, { toValue: 1, duration: 200, delay: 500, useNativeDriver: false }),
      Animated.sequence([Animated.delay(980), fade]),
    ]).start(onDone);
  };

  useEffect(() => {
    // Safety net: never hold the splash if layout is slow.
    const id = setTimeout(start, 400);
    return () => {
      clearTimeout(id);
      timers.current.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[styles.root, { opacity: out }]} onLayout={start} pointerEvents="auto">
      <Animated.View style={{ alignItems: "center", transform: [{ translateX: sx }, { translateY: sy }] }}>
        <View style={{ width: TRACK + 60, height: 70, justifyContent: "center" }}>
          {DOTS.map((d) => (
            <Animated.View key={d} style={[styles.dot, { left: d + 30, opacity: x.interpolate({ inputRange: [d - 20, d + 10], outputRange: [1, 0], extrapolate: "clamp" }) }]} />
          ))}
          <Animated.View style={{ position: "absolute", left: 0, transform: [{ translateX: x }] }}>
            <LiveMascot walking={!reduced} px={5} />
          </Animated.View>
        </View>
        <Animated.View style={{ opacity: title, marginTop: 28, alignItems: "center" }}>
          <Text style={styles.word}>SETTLE</Text>
          <Text style={styles.word}>WATCH</Text>
          <Text style={styles.sub}>{t("intro.tagline")}</Text>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", zIndex: 100 },
  dot: { position: "absolute", width: 10, height: 10, backgroundColor: C.greenBright, top: 30 },
  word: { color: C.greenBright, fontFamily: PX, fontSize: 26, lineHeight: 38, textAlign: "center" },
  sub: { color: C.greenDeep, fontFamily: PX, fontSize: 8, lineHeight: 12, marginTop: 14, textAlign: "center", paddingHorizontal: 24 },
});
