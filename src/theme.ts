import { Platform } from "react-native";

// Clock In palette: CRT phosphor green on near-black (from the hackathon site CSS),
// paper cream for the hero card, Solana purple as the secondary accent. See docs/DESIGN.md.
export const C = {
  bg: "#0a0f0b",
  surface: "#111a13",
  surfaceHi: "#16231a",
  line: "#25382b",
  text: "#e9f3ea",
  dim: "#93a898",
  green: "#86e28a",
  greenBright: "#c2ffc4",
  greenDeep: "#55965a",
  orange: "#e2703a",
  purple: "#9945ff",
  purpleSoft: "#b98bff",
  teal: "#28bee6",
  cream: "#efe7d6",
  creamDim: "#d8ccb4",
  ink: "#241f18",
  inkSoft: "#5b5145",
  red: "#ff5d4d",
};

export const STATUS: Record<string, { color: string; label: string; word: string }> = {
  caution: { color: C.orange, label: "Caution", word: "CAUTION" },
  watch: { color: C.purpleSoft, label: "Watch", word: "WATCH" },
  ok: { color: "#9fb0a3", label: "Quiet", word: "QUIET" },
  resolved: { color: C.green, label: "Settled", word: "SETTLED" },
};
export const STATUS_ORDER = ["caution", "watch", "ok", "resolved"];

export const MONO = Platform.select({ android: "monospace", default: "Menlo" }) as string;

// Type scale (px): micro 11, small 13, body 15, heading 18, title 24, display 34.
export const T = { micro: 11, small: 13, body: 15, heading: 18, title: 24, display: 34 };

export const alpha = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
