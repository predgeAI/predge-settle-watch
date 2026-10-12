// Small QR Code encoder (ISO/IEC 18004): byte mode, error correction level M, versions 1 to 10.
// Enough for a Solana explorer link (about 135 bytes needs version 8). No dependencies.

/** Error correction level M per version: [ec codewords per block, blocks in group 1, data codewords, blocks in group 2, data codewords]. */
const EC_M: [number, number, number, number, number][] = [
  [0, 0, 0, 0, 0], // unused, versions start at 1
  [10, 1, 16, 0, 0],
  [16, 1, 28, 0, 0],
  [26, 1, 44, 0, 0],
  [18, 2, 32, 0, 0],
  [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0],
  [18, 4, 31, 0, 0],
  [22, 2, 38, 2, 39],
  [22, 3, 36, 2, 37],
  [26, 4, 43, 1, 44],
];

const ALIGN: number[][] = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

export const QR_MAX_VERSION = 10;

const dataCodewords = (v: number) => {
  const [, b1, d1, b2, d2] = EC_M[v];
  return b1 * d1 + b2 * d2;
};

/** Largest number of bytes that fits a version at level M. */
export function qrByteCapacity(v: number): number {
  const countBits = v < 10 ? 8 : 16;
  return Math.floor((dataCodewords(v) * 8 - 4 - countBits) / 8);
}

// GF(256) with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function generator(degree: number): number[] {
  let g = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = next;
  }
  return g;
}

/** Reed-Solomon remainder of `data` for `degree` error correction codewords. */
export function rsRemainder(data: number[], degree: number): number[] {
  const g = generator(degree);
  const rem = new Array(degree).fill(0);
  for (const d of data) {
    const factor = d ^ rem[0];
    rem.shift();
    rem.push(0);
    for (let i = 0; i < degree; i++) rem[i] ^= mul(g[i + 1], factor);
  }
  return rem;
}

function utf8(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    let c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else {
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
  }
  return out;
}

/** Data plus error correction codewords, interleaved, for a version. */
function codewords(bytes: number[], v: number): number[] {
  const bits: number[] = [];
  const put = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  const total = dataCodewords(v) * 8;
  put(0b0100, 4);
  put(bytes.length, v < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, total - bits.length));
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < dataCodewords(v); pad ^= 0xec ^ 0x11) data.push(pad);

  const [ec, b1, d1, b2, d2] = EC_M[v];
  const blocks: number[][] = [];
  let off = 0;
  for (let i = 0; i < b1 + b2; i++) {
    const len = i < b1 ? d1 : d2;
    blocks.push(data.slice(off, off + len));
    off += len;
  }
  const ecBlocks = blocks.map((b) => rsRemainder(b, ec));
  const out: number[] = [];
  const maxLen = Math.max(d1, d2);
  for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ec; i++) for (const b of ecBlocks) out.push(b[i]);
  return out;
}

const FINDER = [true, false, true, true, true, false, true];

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** BCH(15,5) format bits for level M (bits 00) and a mask, already XORed with 0x5412. */
export function formatBits(mask: number): number {
  const d = (0b00 << 3) | mask;
  let r = d << 10;
  for (let i = 14; i >= 10; i--) if ((r >>> i) & 1) r ^= 0x537 << (i - 10);
  return ((d << 10) | r) ^ 0x5412;
}

/** BCH(18,6) version bits for versions 7 and up. */
export function versionBits(v: number): number {
  let r = v << 12;
  for (let i = 17; i >= 12; i--) if ((r >>> i) & 1) r ^= 0x1f25 << (i - 12);
  return (v << 12) | r;
}

type Grid = { size: number; dark: boolean[][]; fixed: boolean[][] };

function baseGrid(v: number): Grid {
  const size = 17 + 4 * v;
  const dark = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fixed = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (r: number, c: number, on: boolean) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    dark[r][c] = on;
    fixed[r][c] = true;
  };
  // Finder patterns with separators.
  for (const [fr, fc] of [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ]) {
    for (let r = -1; r <= 7; r++)
      for (let c = -1; c <= 7; c++) {
        const inR = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const on = inR && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        set(fr + r, fc + c, on);
      }
  }
  // Timing patterns.
  for (let i = 8; i < size - 8; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  // Alignment patterns, skipping the three that would overlap finders.
  const pos = ALIGN[v];
  for (const r of pos)
    for (const c of pos) {
      if ((r === 6 && c === 6) || (r === 6 && c === pos[pos.length - 1]) || (r === pos[pos.length - 1] && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++)
        for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  // Reserve format areas (written later) and the dark module.
  for (let i = 0; i < 9; i++) {
    if (i === 6) continue; // timing pattern
    set(8, i, false);
    set(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    set(8, size - 1 - i, false);
    set(size - 1 - i, 8, false);
  }
  set(size - 8, 8, true);
  if (v >= 7) {
    const vb = versionBits(v);
    for (let i = 0; i < 18; i++) {
      const on = ((vb >>> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = (i % 3) + size - 11;
      set(a, b, on);
      set(b, a, on);
    }
  }
  return { size, dark, fixed };
}

function placeData(g: Grid, cw: number[]) {
  const { size, dark, fixed } = g;
  let bit = 0;
  const total = cw.length * 8;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let k = 0; k < size; k++) {
      const r = upward ? size - 1 - k : k;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (fixed[r][c]) continue;
        dark[r][c] = bit < total ? ((cw[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1 : false;
        bit++;
      }
    }
    upward = !upward;
  }
}

function applyMask(g: Grid, mask: number): boolean[][] {
  const fn = MASKS[mask];
  const out = g.dark.map((row, r) => row.map((d, c) => (g.fixed[r][c] ? d : d !== fn(r, c))));
  const fb = formatBits(mask);
  const s = g.size;
  const bitAt = (i: number) => ((fb >>> i) & 1) === 1;
  // Copy 1, around the top-left finder.
  for (let i = 0; i <= 5; i++) out[i][8] = bitAt(i);
  out[7][8] = bitAt(6);
  out[8][8] = bitAt(7);
  out[8][7] = bitAt(8);
  for (let i = 9; i < 15; i++) out[8][14 - i] = bitAt(i);
  // Copy 2, split between the other two finders.
  for (let i = 0; i < 8; i++) out[8][s - 1 - i] = bitAt(i);
  for (let i = 8; i < 15; i++) out[s - 15 + i][8] = bitAt(i);
  out[s - 8][8] = true;
  return out;
}

/** Standard penalty score (rules N1 to N4); lower is better. */
export function penalty(m: boolean[][]): number {
  const n = m.length;
  let score = 0;
  const line = (get: (i: number, j: number) => boolean) => {
    for (let i = 0; i < n; i++) {
      let run = 1;
      for (let j = 1; j <= n; j++) {
        if (j < n && get(i, j) === get(i, j - 1)) run++;
        else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
      // Finder-like 1:1:3:1:1 with four light modules on one side.
      for (let j = 0; j + 10 < n; j++) {
        let a = true;
        let b = true;
        for (let k = 0; k < 7; k++) {
          if (get(i, j + k) !== FINDER[k]) a = false;
          if (get(i, j + 4 + k) !== FINDER[k]) b = false;
        }
        for (let k = 7; k < 11; k++) if (get(i, j + k)) a = false;
        for (let k = 0; k < 4; k++) if (get(i, j + k)) b = false;
        if (a) score += 40;
        if (b) score += 40;
      }
    }
  };
  line((i, j) => m[i][j]);
  line((i, j) => m[j][i]);
  for (let r = 0; r < n - 1; r++)
    for (let c = 0; c < n - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
  let darkCount = 0;
  for (const row of m) for (const d of row) if (d) darkCount++;
  const pct = (darkCount * 100) / (n * n);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}

export interface QrCode {
  version: number;
  mask: number;
  size: number;
  /** modules[row][col], true = dark. No quiet zone. */
  modules: boolean[][];
}

/** Encodes text (UTF-8, byte mode, level M). Picks the smallest version and the lowest-penalty mask unless forced. */
export function encodeQr(text: string, opts: { version?: number; mask?: number } = {}): QrCode {
  const bytes = utf8(text);
  let v = opts.version ?? 0;
  if (!v) {
    for (let i = 1; i <= QR_MAX_VERSION; i++)
      if (bytes.length <= qrByteCapacity(i)) {
        v = i;
        break;
      }
  }
  if (!v || v > QR_MAX_VERSION || bytes.length > qrByteCapacity(v)) throw new Error("Text too long for a QR code here");
  const g = baseGrid(v);
  placeData(g, codewords(bytes, v));
  let best: boolean[][] | null = null;
  let bestMask = 0;
  let bestScore = Infinity;
  const masks = opts.mask === undefined ? [0, 1, 2, 3, 4, 5, 6, 7] : [opts.mask];
  for (const mk of masks) {
    const m = applyMask(g, mk);
    const s = masks.length > 1 ? penalty(m) : 0;
    if (s < bestScore) {
      best = m;
      bestScore = s;
      bestMask = mk;
    }
  }
  return { version: v, mask: bestMask, size: g.size, modules: best! };
}
