import React from "react";
import Svg, { Rect } from "react-native-svg";
import data from "./sprites.json";
import { C } from "./theme";

type Pal = Record<string, string>;
const PAL = data.palette as Pal;

/** Draws a character grid as crisp square pixels. "." is transparent. */
export function Sprite(props: { map: string[]; px: number; color?: string; palette?: Pal; accent?: string }) {
  const rows = props.map.length;
  const cols = props.map[0]?.length ?? 0;
  const pal = props.palette ?? PAL;
  const rects: React.ReactNode[] = [];
  props.map.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === ".") continue;
      const fill = props.color ? (ch === "K" ? C.bg : props.color) : (pal[ch] ?? "#ff00ff");
      rects.push(<Rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={fill} />);
    }
  });
  return (
    <Svg width={cols * props.px} height={rows * props.px} viewBox={`0 0 ${cols} ${rows}`}>
      {rects}
    </Svg>
  );
}

export type Mood = "idle" | "walk" | "sleep" | "alarm" | "cheer";
export type MascotFrame = Mood | "walk2";

const M = data.mascot as Record<string, string[]>;
const WALK2 = [...M.idle.slice(0, 11), ".DD......DD."];

/** The Watcher: an original little clock-eye creature. */
export function Mascot({ mood = "idle", px = 4 }: { mood?: MascotFrame; px?: number }) {
  const map = mood === "walk2" ? WALK2 : (M[mood] ?? M.idle);
  return <Sprite map={map} px={px} />;
}

export const MASCOT_IDLE = M.idle;
export const MASCOT_SPRITES = M;

const I = data.icons as Record<string, string[]>;
export const FLAME = I.flame2;
export type IconName = keyof typeof data.icons;
export function PixelIcon({ name, px = 3, color }: { name: string; px?: number; color: string }) {
  return <Sprite map={I[name] ?? I.check} px={px} color={color} />;
}

function mix(hex: string, bg: string, t: number) {
  const n = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  const c = [1, 3, 5].map((i) => Math.round(n(hex, i) * t + n(bg, i) * (1 - t)));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Octagon medal with a glyph, for badges. */
export function Medal({ glyph, color, locked, px = 5 }: { glyph: string; color: string; locked?: boolean; px?: number }) {
  const frame = locked ? "#1b2a20" : mix(color, C.bg, 0.22);
  const edge = locked ? "#2b3a30" : color;
  const g = locked ? "#4a5a4f" : color;
  const med = I.medal;
  const rows: React.ReactNode[] = [];
  med.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === ".") continue;
      const isEdge = y === 0 || y === med.length - 1 || x === 0 || x === row.length - 1 || med[y - 1]?.[x] === "." || med[y + 1]?.[x] === "." || row[x - 1] === "." || row[x + 1] === ".";
      rows.push(<Rect key={`m${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={isEdge ? edge : frame} />);
    }
  });
  const gl = I[glyph] ?? I.check;
  gl.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === "." || row[x] === "K") continue;
      rows.push(<Rect key={`g${x}-${y}`} x={x + 2} y={y + 2} width={1.02} height={1.02} fill={g} />);
    }
  });
  return (
    <Svg width={12 * px} height={12 * px} viewBox="0 0 12 12">
      {rows}
    </Svg>
  );
}
