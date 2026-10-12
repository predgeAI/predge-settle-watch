// Hall of Disputes: well-known Polymarket markets whose UMA resolution was disputed.
// Pure data module (no React Native imports) so the selftest can load it.
// Every number here was read from the Predge signed settlement-risk record (dispute count, dispute times
// and txs, disputed proposals, on-chain outcome) or from Polymarket's gamma API (question, end date,
// settled time, volume). Evidence and excerpts: docs/HALL-OF-DISPUTES.md.

export type Outcome = "Yes" | "No";

export interface HallDispute {
  /** ISO time of the DisputePrice event on Polygon. */
  at: string;
  /** Polygon transaction hash of the dispute. */
  tx: string;
  /** The proposed answer this dispute objected to. */
  against: Outcome;
}

export interface HallCase {
  id: string;
  /** Polymarket market id, the same id the app adds to the watchlist. */
  marketId: string;
  question: string;
  dates: {
    /** Scheduled end date of the market (gamma endDate). */
    end: string;
    /** First dispute on chain (Predge record). */
    firstDispute: string;
    /** UMA resolution on chain (gamma umaEndDate / closedTime). */
    settled: string;
  };
  disputes: HallDispute[];
  /** True when the second dispute sent the question to a UMA token-holder vote. */
  umaVote: boolean;
  /** The first proposed answer (the one the first dispute objected to). */
  proposedThen: Outcome;
  /** The on-chain resolution. */
  settled: Outcome;
  /** Polymarket volume in USD at verification time. */
  volumeUsd?: number;
  /** One plain sentence (English source; the UI shows the translation `hall.lesson.<id>`). */
  lesson: string;
  sources: string[];
  verifiedAt: string;
}

const PREDGE = (id: string) => `https://api.predge.io/v1/settlement-risk/${id}`;
const GAMMA = (slug: string) => `https://gamma-api.polymarket.com/markets?slug=${slug}&closed=true`;
const PM = (slug: string) => `https://polymarket.com/event/${slug}`;
export const POLYGON_TX = (tx: string) => `https://polygonscan.com/tx/${tx}`;

export const HALL: HallCase[] = [
  {
    id: "minerals",
    marketId: "521607",
    question: "Ukraine agrees to Trump mineral deal before April?",
    dates: { end: "2025-03-31T12:00:00Z", firstDispute: "2025-03-22T22:00:10Z", settled: "2025-03-25T00:21:27Z" },
    disputes: [
      { at: "2025-03-22T22:00:10Z", tx: "0x94554648ea036744a9de2bced1c83fc75b006c87e133c60598d986dae381fdf8", against: "Yes" },
      { at: "2025-03-22T23:05:12Z", tx: "0xa1d8a6101c55ffe90637f2a27fe79a78b26951215f24d7d8204025fe6081b576", against: "Yes" },
    ],
    umaVote: true,
    proposedThen: "Yes",
    settled: "Yes",
    volumeUsd: 7079947,
    lesson: "Two disputes sent this market to a UMA vote, and the vote kept the proposed answer two days later.",
    sources: [PREDGE("521607"), GAMMA("ukraine-agrees-to-give-trump-rare-earth-metals-before-april"), PM("ukraine-agrees-to-give-trump-rare-earth-metals-before-april")],
    verifiedAt: "2026-10-12",
  },
  {
    id: "ufo2025",
    marketId: "537892",
    question: "Trump declassifies UFO files in 2025?",
    dates: { end: "2025-12-31T12:00:00Z", firstDispute: "2025-12-07T10:04:01Z", settled: "2025-12-10T00:27:58Z" },
    disputes: [
      { at: "2025-12-07T10:04:01Z", tx: "0x44a16ccadfbc4263b5dbf993e6933953da03ae2b6afcfcac4e5e15b0b08d4f08", against: "Yes" },
      { at: "2025-12-07T11:43:09Z", tx: "0xe0f6018297ccf906c377c321cb3331288af8daa69609b77bfdb8cc0bd223d84f", against: "Yes" },
    ],
    umaVote: true,
    proposedThen: "Yes",
    settled: "Yes",
    volumeUsd: 16680240,
    lesson: "When a rule word like declassify can be read two ways, expect a dispute and a wait for the vote.",
    sources: [PREDGE("537892"), GAMMA("trump-declassifies-ufo-files-in-2025"), PM("trump-declassifies-ufo-files-in-2025")],
    verifiedAt: "2026-10-12",
  },
  {
    id: "ufoMay2026",
    marketId: "2190153",
    question: "Trump declassifies new UFO files by May 15?",
    dates: { end: "2026-12-31T00:00:00Z", firstDispute: "2026-05-16T08:06:10Z", settled: "2026-05-19T00:32:04Z" },
    disputes: [
      { at: "2026-05-16T08:06:10Z", tx: "0x6b42fd14e550d2d40c984983dd73f84d01e25008da2aad9aaaa0e0029f1d1f0b", against: "No" },
      { at: "2026-05-16T08:10:14Z", tx: "0xb741b81c64546c4c9cfa6d17fbf13dce034db4940840c34f9d6d0db758d5789e", against: "Yes" },
    ],
    umaVote: true,
    proposedThen: "No",
    settled: "Yes",
    volumeUsd: 3215359,
    lesson: "The first proposed answer is not always the final one: No was proposed first, and the UMA vote settled Yes.",
    sources: [PREDGE("2190153"), GAMMA("trump-declassifies-new-ufo-files-by-may-15"), PM("trump-declassifies-new-ufo-files-by")],
    verifiedAt: "2026-10-12",
  },
];

/** The case the tour's "Resolved is not final" card points to. */
export const TOUR_CASE_ID = "ufoMay2026";
