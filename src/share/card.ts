// Layout of the shareable receipt card (1080 x 1350) as plain shapes, so the same card can be drawn
// by react-native-svg on the phone and serialized to an SVG file anywhere else.
// No React Native imports here: this file also runs under Node for tests and previews.
import sprites from "../sprites.json";
import { encodeQr } from "./qr";

export const CARD_W = 1080;
export const CARD_H = 1350;

// Same values as src/theme.ts (kept here so this file stays free of react-native).
const K = {
  bg: "#0a0f0b",
  surface: "#111a13",
  line: "#25382b",
  text: "#e9f3ea",
  dim: "#93a898",
  green: "#86e28a",
  greenBright: "#c2ffc4",
  greenDeep: "#2f6b38",
  purple: "#9945ff",
  purpleSoft: "#b98bff",
  cream: "#efe7d6",
  ink: "#241f18",
  inkSoft: "#5b5145",
  white: "#ffffff",
};

export type CardFont = "pixel" | "sans" | "mono";

export type Shape =
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill: string }
  | { kind: "text"; x: number; y: number; text: string; size: number; fill: string; font: CardFont; anchor: "start" | "middle" | "end"; bold?: boolean };

export interface CardInput {
  question: string;
  statusWord: string;
  statusColor: string;
  checksOk: number;
  checksTotal: number;
  packHash: string;
  signature: string;
  /** ISO time of the receipt. Only the UTC date is shown. */
  at: string;
  networkLabel: string;
  explorerUrl: string;
  /** Translated labels. */
  text: {
    headline: string;
    checks: string; // already filled, e.g. "7/7 checks on my phone"
    pack: string;
    receipt: string;
    date: string;
    network: string;
    scan: string;
    footer: string;
  };
  /** False for Chinese and Korean: the pixel font has Latin and Latin-1 only. */
  pixelLabels: boolean;
}

/** "abcdef...uvwxyz" for long ids. */
export function shortId(s: string, n = 6): string {
  const v = s.replace(/^0x/i, "");
  const head = s.length !== v.length ? "0x" : "";
  return v.length > n * 2 + 3 ? `${head}${v.slice(0, n)}...${v.slice(-n)}` : s;
}

/** Curly quotes, dashes and the ellipsis as plain ASCII, so most English questions stay in the pixel font. */
export const plainPunctuation = (s: string) =>
  s.replace(/[\u2018\u2019\u201a\u2032]/g, "'").replace(/[\u201c\u201d\u201e\u2033]/g, '"').replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\u2026/g, "...");

/** Characters the bundled pixel font can draw (ASCII, Latin-1 and the Russian alphabet). */
export const pixelSafe = (s: string) => /^[ -~\u00a0-\u00ff\u0401\u0410-\u044f\u0451]*$/.test(s);

/**
 * Greedy word wrap by character count. The pixel font is monospaced (1 em per glyph), and CJK
 * glyphs in the system font are also about 1 em wide, so a character count is a fair width.
 * Words longer than a line are split. Adds "..." when it runs past maxLines.
 */
export function wrapText(text: string, perLine: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  const pushWord = (w: string) => {
    while (w.length > perLine) {
      if (cur) {
        lines.push(cur);
        cur = "";
      }
      lines.push(w.slice(0, perLine));
      w = w.slice(perLine);
    }
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= perLine) cur += ` ${w}`;
    else {
      lines.push(cur);
      cur = w;
    }
  };
  for (const w of words) pushWord(w);
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    if (last.length + 3 > perLine) last = last.slice(0, perLine - 3).trimEnd();
    kept[maxLines - 1] = `${last}...`;
    return kept;
  }
  return lines;
}

/** Utc date as YYYY-MM-DD, exact and the same in every language. */
export function cardDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

const WIDE = /[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/;

/** Rough width of a string in em: the pixel font is 1 em per glyph, the system font about 0.6 em for Latin and 1 em for CJK. */
export function emWidth(s: string, font: CardFont): number {
  let w = 0;
  for (const ch of s) w += font === "pixel" || WIDE.test(ch) ? 1 : font === "mono" ? 0.6 : 0.58;
  return w;
}

/** A stepped pixel frame: border, then fill, with notched corners like the app's PixelBox. */
function frame(out: Shape[], x: number, y: number, w: number, h: number, border: string, fill: string, p: number) {
  out.push({ kind: "rect", x: x + p, y, w: w - 2 * p, h, fill: border });
  out.push({ kind: "rect", x, y: y + p, w, h: h - 2 * p, fill: border });
  out.push({ kind: "rect", x: x + 2 * p, y: y + p, w: w - 4 * p, h: h - 2 * p, fill });
  out.push({ kind: "rect", x: x + p, y: y + 2 * p, w: w - 2 * p, h: h - 4 * p, fill });
}

function sprite(out: Shape[], map: string[], x: number, y: number, px: number) {
  const pal = sprites.palette as Record<string, string>;
  map.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === ".") continue;
      out.push({ kind: "rect", x: x + c * px, y: y + r * px, w: px, h: px, fill: pal[ch] ?? K.green });
    }
  });
}

/** QR code with a 4-module quiet zone, as runs of dark modules per row (fewer shapes to draw). */
function qr(out: Shape[], text: string, x: number, y: number, box: number) {
  const code = encodeQr(text);
  const quiet = 4;
  const n = code.size + quiet * 2;
  const m = Math.floor(box / n);
  const side = m * n;
  const ox = x + Math.floor((box - side) / 2);
  const oy = y + Math.floor((box - side) / 2);
  out.push({ kind: "rect", x: ox, y: oy, w: side, h: side, fill: K.white });
  code.modules.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) {
        c++;
        continue;
      }
      let e = c;
      while (e < row.length && row[e]) e++;
      out.push({ kind: "rect", x: ox + (quiet + c) * m, y: oy + (quiet + r) * m, w: (e - c) * m, h: m, fill: K.ink });
      c = e;
    }
  });
  return { version: code.version, module: m, side, ox, oy };
}

/** All shapes of the card, back to front. */
export function cardShapes(input: CardInput): Shape[] {
  const out: Shape[] = [];
  const W = CARD_W;
  const labelFont: CardFont = input.pixelLabels ? "pixel" : "sans";
  // Largest size up to `max` (in pixel-font terms) that fits `room`. The system font reads smaller, so it gets 1.25x.
  const fit = (s: string, max: number, room: number, font: CardFont = labelFont) => {
    const cap = font === "pixel" ? max : Math.round(max * 1.25);
    return Math.min(cap, Math.floor(room / Math.max(1, emWidth(s, font))));
  };

  // Background, outer frame and a faint scanline grid.
  out.push({ kind: "rect", x: 0, y: 0, w: W, h: CARD_H, fill: K.bg });
  frame(out, 24, 24, W - 48, CARD_H - 48, K.greenDeep, K.bg, 12);
  for (let y = 60; y < CARD_H - 60; y += 12) out.push({ kind: "rect", x: 48, y, w: W - 96, h: 2, fill: K.surface });

  // Mascot, cheering.
  const mascot = (sprites.mascot as Record<string, string[]>).cheer;
  const px = 14;
  sprite(out, mascot, (W - 12 * px) / 2, 60, px);

  // Headline.
  const head = input.text.headline;
  const headSize = fit(head, 40, 900);
  out.push({ kind: "text", x: W / 2, y: 296, text: head, size: headSize, fill: K.greenBright, font: labelFont, anchor: "middle", bold: !input.pixelLabels });

  // Market question on the paper card.
  const question = plainPunctuation(input.question);
  const qPixel = pixelSafe(question);
  const qSize = qPixel ? 28 : 34;
  const qFont: CardFont = qPixel ? "pixel" : "sans";
  const avgEm = emWidth(question, qFont) / Math.max(1, [...question].length);
  const perLine = Math.floor(840 / (qSize * Math.max(0.5, avgEm)));
  const lines = wrapText(question, perLine, 4);
  const qTop = 336;
  const lineH = qSize + 16;
  const qH = 48 + lines.length * lineH - 16 + 8;
  frame(out, 72, qTop, W - 144, qH, K.ink, K.cream, 8);
  lines.forEach((l, i) =>
    out.push({ kind: "text", x: 108, y: qTop + 28 + qSize + i * lineH, text: l, size: qSize, fill: K.ink, font: qFont, anchor: "start", bold: !qPixel })
  );

  // Facts and QR sit at a fixed place above the footer.
  const qrBox = 320;
  const fTop = 784;

  // Status word and the checks line, centred in the space left between the question and the facts.
  const word = input.statusWord;
  const wSize = fit(word, 56, 760);
  const chipH = wSize + 44;
  const checks = input.text.checks;
  const cSize = fit(checks, 28, 900);
  const midH = chipH + 32 + cSize;
  const qBottom = qTop + qH;
  const sTop = Math.round(qBottom + (fTop - 24 - qBottom - midH) / 2);
  const chipW = Math.min(W - 144, Math.round(emWidth(word, labelFont) * wSize) + 96);
  frame(out, (W - chipW) / 2, sTop, chipW, chipH, input.statusColor, K.bg, 8);
  out.push({ kind: "text", x: W / 2, y: sTop + 22 + wSize, text: word, size: wSize, fill: input.statusColor, font: labelFont, anchor: "middle", bold: !input.pixelLabels });
  out.push({ kind: "text", x: W / 2, y: sTop + chipH + 32 + cSize, text: checks, size: cSize, fill: K.green, font: labelFont, anchor: "middle", bold: !input.pixelLabels });

  // Facts on the left, QR on the right.
  const qrX = W - 72 - 12 - qrBox;
  const facts: [string, string][] = [
    [input.text.pack, shortId(input.packHash, 6)],
    [input.text.receipt, shortId(input.signature, 6)],
    [input.text.date, cardDate(input.at)],
    [input.text.network, input.networkLabel],
  ];
  const rowH = qrBox / facts.length;
  facts.forEach(([k, v], i) => {
    const y = fTop + i * rowH;
    out.push({ kind: "text", x: 84, y: y + 24, text: k, size: input.pixelLabels ? 16 : 24, fill: K.dim, font: labelFont, anchor: "start", bold: !input.pixelLabels });
    out.push({ kind: "text", x: 84, y: y + 62, text: v, size: 30, fill: K.text, font: "mono", anchor: "start", bold: true });
  });
  frame(out, qrX - 12, fTop - 12, qrBox + 24, qrBox + 24, K.purple, K.white, 6);
  qr(out, input.explorerUrl, qrX, fTop, qrBox);
  const scan = input.text.scan;
  out.push({ kind: "text", x: qrX + qrBox / 2, y: fTop + qrBox + 52, text: scan, size: fit(scan, 16, qrBox + 40), fill: K.purpleSoft, font: labelFont, anchor: "middle", bold: !input.pixelLabels });

  // Footer.
  const foot = input.text.footer;
  const footFont: CardFont = pixelSafe(foot) ? "pixel" : "sans";
  out.push({ kind: "rect", x: 72, y: CARD_H - 140, w: W - 144, h: 4, fill: K.line });
  out.push({ kind: "text", x: W / 2, y: CARD_H - 88, text: foot, size: fit(foot, 18, 900, footFont), fill: K.dim, font: footFont, anchor: "middle" });
  return out;
}

export const FONT_FAMILY: Record<CardFont, string> = {
  pixel: "PressStart2P-Regular",
  sans: "sans-serif",
  mono: "monospace",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The card as a standalone SVG document. */
export function cardSvg(input: CardInput, fonts: Partial<Record<CardFont, string>> = {}): string {
  const fam = { ...FONT_FAMILY, ...fonts };
  const body = cardShapes(input)
    .map((s) =>
      s.kind === "rect"
        ? `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${s.fill}"/>`
        : `<text x="${s.x}" y="${s.y}" font-family="${esc(fam[s.font])}" font-size="${s.size}" font-variant-ligatures="none"${s.bold ? ' font-weight="700"' : ""} fill="${s.fill}" text-anchor="${s.anchor}">${esc(s.text)}</text>`
    )
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}" shape-rendering="crispEdges">\n${body}\n</svg>\n`;
}
