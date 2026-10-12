// Haptic choreography. On Android the RichHaptics native module (plugins/with-rich-haptics.js)
// plays each pattern as one composed vibration (Android 12+ primitives, waveform fallback on older
// phones). Without it (iOS, Expo Go) the beats are approximated with expo-haptics. Never throws.
import { NativeModules, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { LAUNCH_LEAD_MS, PATTERNS, PRIMITIVE_MS, verifyPattern, type Step } from "./hapticPatterns";

export { LAUNCH_LEAD_MS };

interface RichHapticsNative {
  play(pattern: Step[]): void;
  isRich(): Promise<boolean>;
}

const native: RichHapticsNative | null = Platform.OS === "android" ? ((NativeModules.RichHaptics as RichHapticsNative | undefined) ?? null) : null;

const quiet = (p: Promise<unknown> | undefined) => {
  p?.catch(() => undefined);
};

function expoBeat(st: Step) {
  try {
    switch (st.p) {
      case "TICK":
      case "LOW_TICK":
        return quiet(st.scale >= 0.8 ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid) : Haptics.selectionAsync());
      case "THUD":
        return quiet(Haptics.impactAsync(st.scale >= 0.7 ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium));
      case "QUICK_FALL":
        return quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
      case "SLOW_RISE":
      case "QUICK_RISE":
      case "SPIN":
        return quiet(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
      default:
        return quiet(Haptics.impactAsync(st.scale >= 0.8 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light));
    }
  } catch {
    return undefined;
  }
}

let timers: ReturnType<typeof setTimeout>[] = [];
function clearTimers() {
  for (const id of timers) clearTimeout(id);
  timers = [];
}

/** expo-haptics fallback: key beats only (at most 4), spaced as in the pattern. */
function playExpo(steps: Step[]) {
  clearTimers();
  let at = 0;
  const beats: { at: number; st: Step }[] = [];
  for (const st of steps) {
    at += st.delay;
    beats.push({ at, st });
    at += PRIMITIVE_MS[st.p];
  }
  const n = beats.length;
  const keep = n <= 4 ? beats : [beats[0], beats[Math.floor(n / 3)], beats[Math.floor((2 * n) / 3)], beats[n - 1]];
  for (const b of keep) {
    if (b.at <= 0) expoBeat(b.st);
    else timers.push(setTimeout(() => expoBeat(b.st), b.at));
  }
}

function play(steps: Step[]) {
  try {
    if (native) native.play(steps);
    else playExpo(steps);
  } catch {
    // Haptics are decoration; never let them break a flow.
  }
}

// success() / reject() are generic and often fire right before a component plays a richer,
// event-specific pattern (e.g. a Burst re-playing). They wait one short beat; a specific effect
// in that window replaces them, so the user feels one clean pattern instead of two.
const GENERIC_WAIT_MS = 90;
let pending: ReturnType<typeof setTimeout> | null = null;
function cancelGeneric() {
  if (pending) clearTimeout(pending);
  pending = null;
}
function generic(steps: Step[]) {
  cancelGeneric();
  pending = setTimeout(() => {
    pending = null;
    play(steps);
  }, GENERIC_WAIT_MS);
}
function specific(steps: Step[]) {
  cancelGeneric();
  play(steps);
}

/** True when the phone plays composed primitives (Android 12+ with a capable actuator). */
export async function isRich(): Promise<boolean> {
  try {
    return native ? await native.isRich() : false;
  } catch {
    return false;
  }
}

/** App launch: run-up, landing thud (LAUNCH_LEAD_MS after the call), settle tick. */
export const launch = () => specific(PATTERNS.launch);
/** Button press. */
export const tap = () => play(PATTERNS.tap);
/** Tab switch. */
export const tab = () => play(PATTERNS.tab);
/** Daily clock-in heartbeat. */
export const clockIn = () => specific(PATTERNS.clockIn);
/** n verification checks ticking through, then a firm click. */
export const verifySteps = (n = 7) => specific(verifyPattern(n));
/** Tampered record rejected: sharp buzz. */
export const rejected = () => specific(PATTERNS.rejected);
/** Receipt confirmed on chain / evidence pack paid. */
export const stamp = () => specific(PATTERNS.stamp);
/** Level up. */
export const levelUp = () => specific(PATTERNS.levelUp);
/** Single heavy beat (a watched market changed status). */
export const thud = () => play(PATTERNS.thud);
/** Generic success; replaced by a specific effect fired within ~90 ms. */
export const success = () => generic(PATTERNS.success);
/** Generic failure; replaced by a specific effect fired within ~90 ms. */
export const reject = () => generic(PATTERNS.rejected);
