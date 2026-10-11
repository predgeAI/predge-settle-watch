import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { C, PX } from "./theme";
import { LiveMascot, useReducedMotion } from "./ui";

const TRACK = 240;
const DOTS = [70, 110, 150, 190];

/**
 * Arcade intro, about 1.2 s, drawn over the app while it loads underneath.
 * The native splash (same background, mascot icon) hides as soon as this view is laid out.
 * With reduced motion on, the title shows still for 350 ms and fades.
 */
export default function Intro({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion();
  const x = useRef(new Animated.Value(reduced ? TRACK : 0)).current;
  const title = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const out = useRef(new Animated.Value(1)).current;
  const started = useRef(false);

  const start = () => {
    if (started.current) return;
    started.current = true;
    SplashScreen.hideAsync().catch(() => undefined);
    const fade = Animated.timing(out, { toValue: 0, duration: 220, useNativeDriver: true });
    if (reduced) {
      Animated.sequence([Animated.delay(350), fade]).start(onDone);
      return;
    }
    Animated.parallel([
      Animated.timing(x, { toValue: TRACK, duration: 700, easing: Easing.linear, useNativeDriver: false }),
      Animated.timing(title, { toValue: 1, duration: 200, delay: 500, useNativeDriver: false }),
      Animated.sequence([Animated.delay(980), fade]),
    ]).start(onDone);
  };

  useEffect(() => {
    // Safety net: never hold the splash if layout is slow.
    const id = setTimeout(start, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[styles.root, { opacity: out }]} onLayout={start} pointerEvents="auto">
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
        <Text style={styles.sub}>CLOCK IN. CHECK THE SETTLEMENT.</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", zIndex: 100 },
  dot: { position: "absolute", width: 10, height: 10, backgroundColor: C.greenBright, top: 30 },
  word: { color: C.greenBright, fontFamily: PX, fontSize: 26, lineHeight: 38, textAlign: "center" },
  sub: { color: C.greenDeep, fontFamily: PX, fontSize: 8, marginTop: 14, textAlign: "center" },
});
