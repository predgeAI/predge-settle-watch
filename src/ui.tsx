import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient as SvgGradient, Line, Path, Stop } from "react-native-svg";
import { alpha, C, MONO, T } from "./theme";
import * as haptic from "./haptic";
import type { BadgeId } from "./game";

// ---------------------------------------------------------------------------
// Motion helpers
// ---------------------------------------------------------------------------

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

export function useShake() {
  const x = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const run = (reduced: boolean) => {
    flash.setValue(1);
    Animated.timing(flash, { toValue: 0, duration: 700, useNativeDriver: false }).start();
    if (reduced) return;
    Animated.sequence([10, -10, 8, -8, 5, -5, 0].map((v) => Animated.timing(x, { toValue: v, duration: 55, useNativeDriver: true }))).start();
  };
  return { x, flash, run };
}

// ---------------------------------------------------------------------------
// Brand mark: clock ring + check, same drawing as the app icon
// ---------------------------------------------------------------------------

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const RING_LEN = 2 * Math.PI * 42;
const CHECK_LEN = 72;

export function Mark(props: { size: number; ring?: Animated.Value | number; check?: Animated.Value | number; ticks?: Animated.Value | number }) {
  const ring = props.ring ?? 1;
  const check = props.check ?? 1;
  const off = (v: Animated.Value | number, len: number) => (typeof v === "number" ? len * (1 - v) : v.interpolate({ inputRange: [0, 1], outputRange: [len, 0] }));
  return (
    <Svg width={props.size} height={props.size} viewBox="0 0 100 100">
      <Defs>
        <SvgGradient id="mg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0.1" stopColor="#9945ff" />
          <Stop offset="0.55" stopColor="#28bee6" />
          <Stop offset="0.95" stopColor="#14f195" />
        </SvgGradient>
      </Defs>
      <G rotation={-90} origin="50, 50">
        <AnimatedCircle cx="50" cy="50" r="42" stroke="url(#mg)" strokeWidth="7" fill="none" strokeLinecap="round" strokeDasharray={`${RING_LEN}`} strokeDashoffset={off(ring, RING_LEN) as never} />
      </G>
      <G opacity={(props.ticks ?? 1) as never}>
        {[0, 90, 180, 270].map((a) => (
          <Line key={a} x1="50" y1="14" x2="50" y2="19" stroke="url(#mg)" strokeWidth="3" strokeLinecap="round" transform={`rotate(${a} 50 50)`} />
        ))}
      </G>
      <AnimatedPath d="M30 52 L44 66 L71 33" stroke="#28d6c0" strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${CHECK_LEN}`} strokeDashoffset={off(check, CHECK_LEN) as never} />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Pressable with scale feedback and haptic tick
// ---------------------------------------------------------------------------

export function Press(props: {
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  label?: string;
  haptics?: boolean;
  role?: "button" | "tab" | "switch";
  fill?: boolean; // take an equal share of a row
}) {
  const s = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.spring(s, { toValue: v, speed: 40, bounciness: 4, useNativeDriver: true }).start();
  return (
    <Pressable
      onPress={() => {
        if (props.haptics !== false) haptic.tap();
        props.onPress?.();
      }}
      onPressIn={() => to(0.96)}
      onPressOut={() => to(1)}
      disabled={props.disabled}
      accessibilityRole={props.role ?? "button"}
      accessibilityLabel={props.label}
      style={props.fill ? { flex: 1 } : undefined}
    >
      <Animated.View style={[props.style, { transform: [{ scale: s }], opacity: props.disabled ? 0.5 : 1 }]}>{props.children}</Animated.View>
    </Pressable>
  );
}

export function Button(props: { title: string; onPress: () => void; kind?: "primary" | "ghost"; disabled?: boolean; small?: boolean; style?: StyleProp<ViewStyle> }) {
  const primary = props.kind !== "ghost";
  return (
    <Press
      onPress={props.onPress}
      disabled={props.disabled}
      label={props.title}
      style={[st.btn, props.small && st.btnSmall, primary ? st.btnPrimary : st.btnGhost, props.style]}
    >
      <Text style={[st.btnText, !primary && { color: C.text }, props.small && { fontSize: T.small }]}>{props.title}</Text>
    </Press>
  );
}

export function Chip({ text, color }: { text: string; color: string }) {
  return (
    <View style={[st.chip, { borderColor: alpha(color, 0.6), backgroundColor: alpha(color, 0.12) }]}>
      <Text style={[st.chipText, { color }]}>{text}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Streak flame, level ring, badge icons
// ---------------------------------------------------------------------------

export function Flame({ size = 28, lit = true }: { size?: number; lit?: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!lit || reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [lit, reduced, pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] });
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M12 2c1 3.5 5.5 5.5 5.5 11a5.5 5.5 0 0 1-11 0c0-2 .8-3.3 1.8-4.3.2 1.2.9 2 1.7 2.3C9.5 8 10.5 4.5 12 2z" fill={lit ? C.orange : "#3a4a3f"} />
        <Path d="M12 12.5c.6 1.2 2.2 1.9 2.2 3.6a2.2 2.2 0 0 1-4.4 0c0-1.2.9-1.8 1.4-2.6.3.5.5.7.8.8z" fill={lit ? "#ffd29a" : "#55665a"} />
      </Svg>
    </Animated.View>
  );
}

export function LevelBadge(props: { index: number; progress: number; size?: number }) {
  const size = props.size ?? 56;
  const r = 21;
  const len = 2 * Math.PI * r;
  const val = useRef(new Animated.Value(props.progress)).current;
  useEffect(() => {
    Animated.timing(val, { toValue: props.progress, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [props.progress, val]);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} viewBox="0 0 50 50" style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#9945ff" />
            <Stop offset="1" stopColor="#14f195" />
          </SvgGradient>
        </Defs>
        <Circle cx="25" cy="25" r={r} stroke={alpha(C.text, 0.14)} strokeWidth="4" fill="none" />
        <G rotation={-90} origin="25, 25">
          <AnimatedCircle
            cx="25"
            cy="25"
            r={r}
            stroke="url(#lg)"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${len}`}
            strokeDashoffset={val.interpolate({ inputRange: [0, 1], outputRange: [len, 0] }) as never}
          />
        </G>
      </Svg>
      <Text style={{ color: C.text, fontFamily: MONO, fontWeight: "800", fontSize: size * 0.3 }}>{props.index + 1}</Text>
    </View>
  );
}

const BADGE_COLOR: Record<BadgeId, string> = {
  first_verify: C.green,
  tamper_caught: C.orange,
  first_receipt: C.purpleSoft,
  streak_7: C.orange,
  early_dispute: C.teal,
  watch_5: C.greenBright,
};

export function BadgeIcon({ id, size = 56, locked = false }: { id: BadgeId; size?: number; locked?: boolean }) {
  const col = locked ? "#4a5a4f" : BADGE_COLOR[id];
  const glyph = (() => {
    switch (id) {
      case "first_verify":
        return <Path d="M16 25l6 6 12-13" stroke={col} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />;
      case "tamper_caught":
        return (
          <>
            <Path d="M25 12l11 4v8c0 7-5 11-11 14-6-3-11-7-11-14v-8z" stroke={col} strokeWidth="3" fill="none" strokeLinejoin="round" />
            <Path d="M20 21l10 10M30 21l-10 10" stroke={col} strokeWidth="3" strokeLinecap="round" />
          </>
        );
      case "first_receipt":
        return (
          <>
            <Path d="M15 12h20v26l-4-3-3 3-3-3-3 3-3-3-4 3z" stroke={col} strokeWidth="3" fill="none" strokeLinejoin="round" />
            <Path d="M20 20h10M20 26h10" stroke={col} strokeWidth="3" strokeLinecap="round" />
          </>
        );
      case "streak_7":
        return <Path d="M25 11c1 4 8 7 8 15a8 8 0 0 1-16 0c0-3 1.2-5 2.6-6.4.3 1.8 1.2 2.9 2.4 3.4C21.5 18 23 14 25 11z" fill={col} />;
      case "early_dispute":
        return (
          <>
            <Path d="M25 12c-5 0-8 4-8 9v6l-3 4h22l-3-4v-6c0-5-3-9-8-9z" stroke={col} strokeWidth="3" fill="none" strokeLinejoin="round" />
            <Path d="M22 36a3 3 0 0 0 6 0" stroke={col} strokeWidth="3" fill="none" />
          </>
        );
      case "watch_5":
        return (
          <>
            <Path d="M10 25c4-7 10-10 15-10s11 3 15 10c-4 7-10 10-15 10S14 32 10 25z" stroke={col} strokeWidth="3" fill="none" strokeLinejoin="round" />
            <Circle cx="25" cy="25" r="4.5" fill={col} />
          </>
        );
    }
  })();
  return (
    <Svg width={size} height={size} viewBox="0 0 50 50">
      <Path d="M25 3l19 11v22L25 47 6 36V14z" fill={locked ? "#111a13" : alpha(col, 0.14)} stroke={locked ? "#2b3a30" : alpha(col, 0.7)} strokeWidth="2" strokeLinejoin="round" />
      {glyph}
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Success / reject burst
// ---------------------------------------------------------------------------

/** Draws a ring and a check (or cross) with a small spray of sparks. Re-plays when `play` changes. */
export function Burst(props: { play: number; kind?: "ok" | "bad"; size?: number }) {
  const size = props.size ?? 64;
  const p = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  const bad = props.kind === "bad";
  const col = bad ? C.red : C.green;
  useEffect(() => {
    if (!props.play) return;
    p.setValue(0);
    Animated.timing(p, { toValue: 1, duration: reduced ? 1 : 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [props.play, reduced, p]);
  const ringOff = p.interpolate({ inputRange: [0, 0.55], outputRange: [RING_LEN, 0], extrapolate: "clamp" });
  const markOff = p.interpolate({ inputRange: [0.35, 0.8], outputRange: [CHECK_LEN, 0], extrapolate: "clamp" });
  const sparkR = p.interpolate({ inputRange: [0.4, 1], outputRange: [30, 48], extrapolate: "clamp" });
  const sparkO = p.interpolate({ inputRange: [0.4, 0.6, 1], outputRange: [0, 1, 0], extrapolate: "clamp" });
  const pop = p.interpolate({ inputRange: [0, 0.6, 0.8, 1], outputRange: [0.85, 1.0, 1.12, 1], extrapolate: "clamp" });
  return (
    <Animated.View style={{ width: size, height: size, transform: [{ scale: reduced ? 1 : pop }] }}>
      <Svg width={size} height={size} viewBox="-10 -10 120 120">
        <G rotation={-90} origin="50, 50">
          <AnimatedCircle cx="50" cy="50" r="42" stroke={col} strokeWidth="7" fill={alpha(col, 0.1)} strokeLinecap="round" strokeDasharray={`${RING_LEN}`} strokeDashoffset={ringOff as never} />
        </G>
        {bad ? (
          <AnimatedPath d="M34 34 L66 66 M66 34 L34 66" stroke={col} strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray="90" strokeDashoffset={markOff.interpolate({ inputRange: [0, CHECK_LEN], outputRange: [0, 90] }) as never} />
        ) : (
          <AnimatedPath d="M30 52 L44 66 L71 33" stroke={col} strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${CHECK_LEN}`} strokeDashoffset={markOff as never} />
        )}
        {reduced
          ? null
          : [0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
              <G key={a} rotation={a} origin="50, 50">
                <AnimatedCircle cx="50" cy={sparkR.interpolate({ inputRange: [30, 48], outputRange: [20, 0] }) as never} r="2.6" fill={a % 90 ? C.purpleSoft : col} opacity={sparkO as never} />
              </G>
            ))}
      </Svg>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Celebration overlay (badge unlock / level up) and XP toast
// ---------------------------------------------------------------------------

export interface Celebration {
  id: number;
  kind: "badge" | "level";
  title: string;
  sub: string;
  badge?: BadgeId;
  level?: number;
}

export function CelebrationOverlay({ item, onClose }: { item: Celebration | null; onClose: () => void }) {
  const s = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!item) return;
    haptic.success();
    s.setValue(0);
    Animated.spring(s, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }).start();
  }, [item, s]);
  if (!item) return null;
  const scale = reduced ? 1 : s.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  return (
    <Animated.View style={[st.celeb, { opacity: s }]} accessibilityViewIsModal>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <Animated.View style={[st.celebCard, { transform: [{ scale }] }]} pointerEvents="box-none">
        <Text style={st.celebKicker}>{item.kind === "badge" ? "BADGE UNLOCKED" : "LEVEL UP"}</Text>
        {item.kind === "badge" && item.badge ? <BadgeIcon id={item.badge} size={104} /> : <LevelBadge index={item.level ?? 0} progress={1} size={104} />}
        <Text style={st.celebTitle}>{item.title}</Text>
        <Text style={st.celebSub}>{item.sub}</Text>
        <Button title="Nice" onPress={onClose} style={{ alignSelf: "stretch", marginTop: 16 }} />
      </Animated.View>
    </Animated.View>
  );
}

export function XpToast({ text, tick }: { text: string; tick: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!tick) return;
    v.setValue(0);
    Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.delay(1500),
      Animated.timing(v, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [tick, v]);
  if (!tick) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[st.toast, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }] }]}
    >
      <Text style={st.toastText}>{text}</Text>
    </Animated.View>
  );
}

/** Fades and lifts a child in on mount. */
export function Reveal({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: reduced ? 1 : 380, delay: reduced ? 0 : delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v, delay, reduced]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>{children}</Animated.View>;
}


const st = StyleSheet.create({
  btn: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, alignItems: "center" },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12 },
  btnPrimary: { backgroundColor: C.green },
  btnGhost: { borderColor: C.line, borderWidth: 1, backgroundColor: alpha(C.text, 0.03) },
  btnText: { color: "#07120a", fontWeight: "800", fontSize: T.body, fontFamily: MONO, letterSpacing: 0.2 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: T.micro, fontWeight: "800", letterSpacing: 0.6, fontFamily: MONO },
  celeb: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000000cc", alignItems: "center", justifyContent: "center", padding: 28, zIndex: 50 },
  celebCard: { backgroundColor: C.surfaceHi, borderColor: C.greenDeep, borderWidth: 1, borderRadius: 24, padding: 24, alignItems: "center", width: "100%", maxWidth: 340 },
  celebKicker: { color: C.green, fontFamily: MONO, fontWeight: "800", letterSpacing: 2, fontSize: T.small, marginBottom: 14 },
  celebTitle: { color: C.text, fontSize: T.title, fontWeight: "800", marginTop: 14, textAlign: "center" },
  celebSub: { color: C.dim, fontSize: T.body, marginTop: 6, textAlign: "center", lineHeight: 21 },
  toast: { position: "absolute", top: 54, alignSelf: "center", backgroundColor: C.green, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, zIndex: 60 },
  toastText: { color: "#07120a", fontFamily: MONO, fontWeight: "800", fontSize: T.body },
});
