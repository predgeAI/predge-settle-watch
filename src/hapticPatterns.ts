// Haptic choreography as plain data, so it can be checked offline (npm test).
// Each step is one Android composition primitive: `delay` is the pause in ms before it starts,
// `scale` its strength from 0 to 1. The native RichHaptics module plays a whole pattern at once.

export type Primitive = "CLICK" | "TICK" | "LOW_TICK" | "THUD" | "SPIN" | "QUICK_RISE" | "SLOW_RISE" | "QUICK_FALL";
export interface Step {
  p: Primitive;
  scale: number;
  delay: number;
}

/** Rough on-device length of each primitive (Pixel-class actuators), used for timing and budgets. */
export const PRIMITIVE_MS: Record<Primitive, number> = {
  CLICK: 12,
  TICK: 8,
  LOW_TICK: 12,
  THUD: 100,
  SPIN: 140,
  QUICK_RISE: 150,
  SLOW_RISE: 250,
  QUICK_FALL: 80,
};

/** Every pattern stays under this length. */
export const MAX_PATTERN_MS = 700;

const s = (p: Primitive, scale: number, delay = 0): Step => ({ p, scale, delay });

/** n ticks (1..9, so it stays under MAX_PATTERN_MS) rising from 0.35 to 0.6, 60 ms apart, then a firm click. */
export function verifyPattern(n = 7): Step[] {
  const k = Math.max(1, Math.min(9, Math.round(n)));
  const ticks = Array.from({ length: k }, (_, i) => s("TICK", +(0.35 + (k === 1 ? 0 : (0.25 * i) / (k - 1))).toFixed(3), i === 0 ? 0 : 60));
  return [...ticks, s("CLICK", 0.9, 60)];
}

export const PATTERNS = {
  /** Mascot run-up, landing, settle. The THUD lands LAUNCH_LEAD_MS after the call. */
  launch: [s("QUICK_RISE", 0.4), s("THUD", 0.8, 30), s("TICK", 0.3, 120)],
  tap: [s("TICK", 0.5)],
  tab: [s("LOW_TICK", 0.6)],
  /** Heartbeat. */
  clockIn: [s("CLICK", 0.7), s("CLICK", 0.5, 80), s("THUD", 0.6, 180)],
  /** Sharp buzz. */
  rejected: [s("QUICK_FALL", 0.8), s("TICK", 1, 30), s("TICK", 1, 30), s("TICK", 1, 30)],
  /** Receipt confirmed / pack paid. */
  stamp: [s("THUD", 1), s("LOW_TICK", 0.4, 90)],
  levelUp: [s("SLOW_RISE", 0.6), s("SPIN", 0.7, 20), s("CLICK", 1, 40)],
  /** Single heavy beat (status change). */
  thud: [s("THUD", 0.8)],
  /** Generic success: the short tail of the verify run. */
  success: verifyPattern(2),
} satisfies Record<string, Step[]>;

/** Time from starting the launch pattern to its THUD. */
export const LAUNCH_LEAD_MS = PRIMITIVE_MS.QUICK_RISE + 30;

/** Estimated total length of a pattern in ms. */
export function patternMs(steps: Step[]): number {
  return steps.reduce((ms, st) => ms + st.delay + PRIMITIVE_MS[st.p], 0);
}
