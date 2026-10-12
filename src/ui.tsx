import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "./Text";
import { t } from "./i18n";
import Svg, { Defs, Pattern, Rect } from "react-native-svg";
import { alpha, C, PX, T } from "./theme";
import * as haptic from "./haptic";
import type { BadgeId } from "./game";
import { FLAME, Mascot, Medal, PixelIcon, Sprite, type MascotFrame } from "./sprites";

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

/** Ticks a value on an interval, used for 2-frame sprite animation. */
export function useTicker(ms: number, on = true): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setN((v) => v + 1), ms);
    return () => clearInterval(id);
  }, [ms, on]);
  return n;
}

// ---------------------------------------------------------------------------
// Pixel box: stepped corners, no smooth radius
// ---------------------------------------------------------------------------

export function PixelBox(props: {
  border?: string;
  bg?: string;
  p?: number;
  lift?: string; // thicker darker bottom edge, arcade-button style
  style?: StyleProp<ViewStyle>;
  inner?: StyleProp<ViewStyle>;
  fill?: boolean; // stretch to the parent's height
  children?: React.ReactNode;
}) {
  const p = props.p ?? 3;
  const border = props.border ?? C.line;
  return (
    <View style={[props.style, props.fill && { flex: 1 }]}>
      <View style={{ height: p, marginHorizontal: p, backgroundColor: border }} />
      <View style={[{ borderLeftWidth: p, borderRightWidth: p, borderColor: border, backgroundColor: props.bg ?? C.surface }, props.fill && { flex: 1 }]}>
        <View style={[props.inner, props.fill && { flex: 1 }]}>{props.children}</View>
      </View>
      <View style={{ height: props.lift ? p * 2 : p, marginHorizontal: p, backgroundColor: props.lift ?? border }} />
    </View>
  );
}

/** Subtle CRT scanlines over a screen. */
export function Scanlines() {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 200 }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse">
            <Rect x="0" y="0" width="4" height="1" fill="#000000" opacity="0.12" />
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#scan)" />
      </Svg>
    </View>
  );
}

/** Segmented XP bar. */
export function PixelBar({ value, blocks = 14, color = C.green }: { value: number; blocks?: number; color?: string }) {
  const filled = Math.round(Math.min(1, Math.max(0, value)) * blocks);
  return (
    <View style={{ flexDirection: "row", gap: 2 }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}>
      {Array.from({ length: blocks }).map((_, i) => (
        <View key={i} style={{ flex: 1, height: 10, backgroundColor: i < filled ? color : alpha(C.text, 0.1) }} />
      ))}
    </View>
  );
}

export function StatusIcon({ level, color, px = 3 }: { level?: string; color: string; px?: number }) {
  const name = level === "caution" ? "caution" : level === "watch" ? "eye" : level === "resolved" ? "settled" : "quiet";
  return <PixelIcon name={name} color={color} px={px} />;
}

// ---------------------------------------------------------------------------
// Pressable with pixel press feedback and haptic tick
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
  const [down, setDown] = useState(false);
  return (
    <Pressable
      onPress={() => {
        if (props.haptics !== false) haptic.tap();
        props.onPress?.();
      }}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      disabled={props.disabled}
      accessibilityRole={props.role ?? "button"}
      accessibilityLabel={props.label}
      style={props.fill ? { flex: 1 } : undefined}
    >
      <View style={[props.style, { transform: [{ translateY: down ? 2 : 0 }], opacity: props.disabled ? 0.5 : 1 }]}>{props.children}</View>
    </Pressable>
  );
}

export function Button(props: { title: string; onPress: () => void; kind?: "primary" | "ghost"; disabled?: boolean; small?: boolean; style?: StyleProp<ViewStyle> }) {
  const primary = props.kind !== "ghost";
  return (
    <Press onPress={props.onPress} disabled={props.disabled} label={props.title} style={props.style}>
      <PixelBox
        border={primary ? "#2f6b38" : C.line}
        bg={primary ? C.green : C.surfaceHi}
        lift={primary ? "#2f6b38" : "#0d1710"}
        inner={{ paddingVertical: props.small ? 8 : 12, paddingHorizontal: props.small ? 8 : 12, alignItems: "center" }}
      >
        <Text style={[st.btnText, !primary && { color: C.text }, props.small && { fontSize: 9, lineHeight: 14 }]}>{props.title}</Text>
      </PixelBox>
    </Press>
  );
}

export function Chip({ text, color }: { text: string; color: string }) {
  return (
    <PixelBox p={2} border={alpha(color, 0.8)} bg={alpha(color, 0.14)} inner={{ paddingHorizontal: 6, paddingVertical: 4 }}>
      <Text style={[st.chipText, { color }]}>{text}</Text>
    </PixelBox>
  );
}

// ---------------------------------------------------------------------------
// Streak flame, level box, badge medals
// ---------------------------------------------------------------------------

export function Flame({ size = 4, lit = true }: { size?: number; lit?: boolean }) {
  const t = useTicker(450, lit);
  const reduced = useReducedMotion();
  const hot = lit && !reduced && t % 2 === 0;
  const map = FLAME;
  const pal = lit ? { O: hot ? C.orange : "#ff9a4d", Y: hot ? "#ffd29a" : "#fff0c8" } : { O: "#3a4a3f", Y: "#55665a" };
  return (
    <View style={{ transform: [{ translateY: hot ? -2 : 0 }] }}>
      <Sprite map={map} px={size} palette={pal} />
    </View>
  );
}

export function LevelBadge(props: { index: number; progress: number; size?: number }) {
  return (
    <PixelBox p={3} border={C.green} bg={C.bg} inner={{ paddingHorizontal: 8, paddingVertical: 8, alignItems: "center", minWidth: 54 }}>
      <Text style={{ color: C.greenDeep, fontFamily: PX, fontSize: 8 }}>LV</Text>
      <Text style={{ color: C.greenBright, fontFamily: PX, fontSize: 18, marginTop: 4 }}>{props.index + 1}</Text>
    </PixelBox>
  );
}

const BADGE_COLOR: Record<BadgeId, string> = {
  first_verify: C.green,
  tamper_caught: C.orange,
  first_receipt: C.purpleSoft,
  streak_7: C.orange,
  early_dispute: C.teal,
  watch_5: C.greenBright,
  puzzles: C.purpleSoft,
};
const BADGE_GLYPH: Record<BadgeId, string> = {
  first_verify: "check",
  tamper_caught: "tamper",
  first_receipt: "receipt",
  streak_7: "flame",
  early_dispute: "bell",
  watch_5: "eye",
  puzzles: "question",
};

export function BadgeIcon({ id, size = 56, locked = false }: { id: BadgeId; size?: number; locked?: boolean }) {
  return <Medal glyph={BADGE_GLYPH[id]} color={BADGE_COLOR[id]} locked={locked} px={Math.max(2, Math.round(size / 12))} />;
}

// ---------------------------------------------------------------------------
// Success / reject burst: pixel check or cross with square sparks
// ---------------------------------------------------------------------------

const SPARK_DIRS = [
  [1, 0],
  [0.7, 0.7],
  [0, 1],
  [-0.7, 0.7],
  [-1, 0],
  [-0.7, -0.7],
  [0, -1],
  [0.7, -0.7],
];

/** Pops a pixel check (or cross) with a spray of pixel sparks. Re-plays when `play` changes. */
export function Burst(props: { play: number; kind?: "ok" | "bad"; size?: number }) {
  const size = props.size ?? 64;
  const p = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  const bad = props.kind === "bad";
  const col = bad ? C.red : C.green;
  useEffect(() => {
    if (!props.play) return;
    p.setValue(0);
    Animated.timing(p, { toValue: 1, duration: reduced ? 1 : 800, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [props.play, reduced, p]);
  const pop = p.interpolate({ inputRange: [0, 0.35, 0.55, 1], outputRange: [0.3, 1.25, 1, 1], extrapolate: "clamp" });
  const spark = p.interpolate({ inputRange: [0.2, 1], outputRange: [0, 1], extrapolate: "clamp" });
  const sparkO = p.interpolate({ inputRange: [0.2, 0.4, 1], outputRange: [0, 1, 0], extrapolate: "clamp" });
  const px = Math.max(3, Math.floor(size / 12));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {reduced
        ? null
        : SPARK_DIRS.map(([dx, dy], i) => (
            <Animated.View
              key={i}
              style={{
                position: "absolute",
                width: px,
                height: px,
                backgroundColor: i % 2 ? C.purpleSoft : col,
                opacity: sparkO,
                transform: [{ translateX: spark.interpolate({ inputRange: [0, 1], outputRange: [0, dx * size * 0.62] }) }, { translateY: spark.interpolate({ inputRange: [0, 1], outputRange: [0, dy * size * 0.62] }) }],
              }}
            />
          ))}
      <Animated.View style={{ transform: [{ scale: reduced ? 1 : pop }] }}>
        <PixelBox p={Math.max(2, px - 1)} border={col} bg={alpha(col, 0.16)} inner={{ padding: px * 1.5 }}>
          <PixelIcon name={bad ? "cross" : "check"} px={Math.max(3, Math.floor(size / 16))} color={col} />
        </PixelBox>
      </Animated.View>
    </View>
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
  const tick = useTicker(350, !!item && !reduced);
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
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t("common.close")} />
      <Animated.View style={{ transform: [{ scale }], width: "100%", maxWidth: 340 }} pointerEvents="box-none">
        <PixelBox border={C.green} bg={C.surfaceHi} inner={{ padding: 22, alignItems: "center" }}>
          <Text style={st.celebKicker}>{item.kind === "badge" ? t("celeb.badge") : t("celeb.level")}</Text>
          {item.kind === "badge" && item.badge ? (
            <BadgeIcon id={item.badge} size={96} />
          ) : (
            <View style={{ transform: [{ translateY: tick % 2 ? -6 : 0 }] }}>
              <Mascot mood="cheer" px={8} />
            </View>
          )}
          <Text style={st.celebTitle}>{item.title}</Text>
          <Text style={st.celebSub}>{item.sub}</Text>
          <Button title={t("common.nice")} onPress={onClose} style={{ alignSelf: "stretch", marginTop: 16 }} />
        </PixelBox>
      </Animated.View>
    </Animated.View>
  );
}

export function XpToast({ text, tick }: { text: string; tick: number }) {
  const v = useRef(new Animated.Value(0)).current;
  const last = useRef(tick); // a toast mounted later must not replay an old award
  useEffect(() => {
    if (tick === last.current) return;
    last.current = tick;
    v.setValue(0);
    Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.delay(1500),
      Animated.timing(v, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [tick, v]);
  return (
    <Animated.View pointerEvents="none" style={[st.toast, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }] }]}>
      <PixelBox p={3} border="#2f6b38" bg={C.green} inner={{ paddingHorizontal: 14, paddingVertical: 8 }}>
        <Text style={st.toastText}>{text}</Text>
      </PixelBox>
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

/** Mascot that bobs on a 2-frame loop. Pass `walking` to alternate feet. */
export function LiveMascot({ mood = "idle", px = 4, walking = false }: { mood?: MascotFrame; px?: number; walking?: boolean }) {
  const reduced = useReducedMotion();
  const t = useTicker(walking ? 200 : 600, !reduced);
  let frame: MascotFrame = mood;
  if (walking) frame = t % 2 ? "walk2" : "walk";
  const bob = !reduced && mood !== "sleep" && !walking && t % 2 === 1;
  return <View style={{ transform: [{ translateY: bob ? -px : 0 }] }}><Mascot mood={frame} px={px} /></View>;
}

export { Sprite };

const st = StyleSheet.create({
  btnText: { color: "#07120a", fontFamily: PX, fontSize: 11, lineHeight: 16, textTransform: "uppercase", textAlign: "center" },
  chipText: { fontSize: 8, fontFamily: PX },
  celeb: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000000cc", alignItems: "center", justifyContent: "center", padding: 28, zIndex: 50 },
  celebKicker: { color: C.green, fontFamily: PX, fontSize: T.small - 1, marginBottom: 16 },
  celebTitle: { color: C.text, fontFamily: PX, fontSize: 14, lineHeight: 22, marginTop: 16, textAlign: "center" },
  celebSub: { color: C.dim, fontSize: T.body, marginTop: 8, textAlign: "center", lineHeight: 21 },
  toast: { position: "absolute", top: 54, alignSelf: "center", zIndex: 60 },
  toastText: { color: "#07120a", fontFamily: PX, fontSize: 12 },
});
