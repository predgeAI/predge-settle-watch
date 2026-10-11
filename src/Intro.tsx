import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { C, MONO } from "./theme";
import { Mark, useReducedMotion } from "./ui";

/**
 * Short branded intro, about 1.2 s, drawn over the app while it loads underneath.
 * The native splash (same background and mark) hides as soon as this view is laid out.
 * With reduced motion on, the mark just appears and fades.
 */
export default function Intro({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion();
  const ring = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const check = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const ticks = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const word = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const out = useRef(new Animated.Value(1)).current;
  const started = useRef(false);

  const start = () => {
    if (started.current) return;
    started.current = true;
    SplashScreen.hideAsync().catch(() => undefined);
    const t = (v: Animated.Value, to: number, duration: number, delay = 0, easing = Easing.out(Easing.cubic)) =>
      Animated.timing(v, { toValue: to, duration, delay, easing, useNativeDriver: false });
    const fade = Animated.timing(out, { toValue: 0, duration: 220, useNativeDriver: true });
    if (reduced) {
      Animated.sequence([Animated.delay(350), fade]).start(onDone);
      return;
    }
    Animated.parallel([
      t(ring, 1, 520),
      t(ticks, 1, 250, 300),
      t(check, 1, 320, 420),
      t(word, 1, 300, 520),
      Animated.sequence([Animated.delay(740), Animated.timing(pulse, { toValue: 1.08, duration: 160, useNativeDriver: true }), Animated.timing(pulse, { toValue: 1, duration: 160, useNativeDriver: true })]),
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
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <Mark size={132} ring={ring} check={check} ticks={ticks} />
      </Animated.View>
      <Animated.View style={{ opacity: word, transform: [{ translateY: word.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }], marginTop: 22 }}>
        <Text style={styles.word}>SETTLE WATCH</Text>
        <Text style={styles.sub}>clock in. check the settlement.</Text>
      </Animated.View>
      <View style={styles.glow} pointerEvents="none" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", zIndex: 100 },
  word: { color: C.greenBright, fontFamily: MONO, fontWeight: "800", fontSize: 20, letterSpacing: 5, textAlign: "center" },
  sub: { color: C.greenDeep, fontFamily: MONO, fontSize: 12, letterSpacing: 1, textAlign: "center", marginTop: 6 },
  glow: { position: "absolute", width: 320, height: 320, borderRadius: 160, backgroundColor: "#9945ff10", zIndex: -1 },
});
