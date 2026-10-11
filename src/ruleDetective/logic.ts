// Rule Detective: spot the risky phrase in a real market's written rules.
// Educational only. The hints describe common trouble spots, not what happened in any real dispute.
export type PhraseKind = "time" | "range" | "source" | "name";

export interface Case {
  id: string;
  q: string;
  text: string;
  phrases: { t: string; kind: PhraseKind }[];
}

export const KIND_LABEL: Record<PhraseKind, string> = {
  time: "A date or time",
  range: "A threshold",
  source: "A source or definition",
  name: "A name or label",
};

export const KIND_HINT: Record<PhraseKind, string> = {
  time: "If an event is moved, which day or window counts? Check the exact time and the time zone.",
  range: "Words like “or more” decide close calls. Read whether the line itself counts.",
  source: "The rules point to one source or one way of counting. If it is unclear, people can read the same news differently.",
  name: "Names and labels must match exactly. A short name, a rename or a quoted label can cause confusion.",
};

export interface Segment {
  text: string;
  phrase?: number; // index into case.phrases
}

/** Splits the excerpt into plain text and tappable phrases, in reading order. */
export function segments(c: Case): Segment[] {
  const hits = c.phrases
    .map((p, i) => ({ i, at: c.text.indexOf(p.t), len: p.t.length }))
    .filter((h) => h.at >= 0)
    .sort((a, b) => a.at - b.at);
  const out: Segment[] = [];
  let pos = 0;
  for (const h of hits) {
    if (h.at < pos) continue; // overlap: skip
    if (h.at > pos) out.push({ text: c.text.slice(pos, h.at) });
    out.push({ text: c.text.slice(h.at, h.at + h.len), phrase: h.i });
    pos = h.at + h.len;
  }
  if (pos < c.text.length) out.push({ text: c.text.slice(pos) });
  return out;
}

/** Cases start at a different point each day and then go in order. */
export function caseIndex(dayNumber: number, step: number, n: number): number {
  return (((dayNumber * 7 + step) % n) + n) % n;
}

export function otherKinds(c: Case, picked: number): PhraseKind[] {
  const k = c.phrases[picked]?.kind;
  return Array.from(new Set(c.phrases.map((p) => p.kind).filter((x) => x !== k)));
}
