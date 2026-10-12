// Feed interests and home country: what the Discover feed shows first.
// Pure module (no React Native imports) so the selftest can load it. Keyword matching only, deterministic.
import { useSyncExternalStore } from "react";
import type { DiscoverMarket } from "./api";

export type Interest = "sports" | "politics" | "crypto" | "world" | "country";
export const INTERESTS: Interest[] = ["sports", "politics", "crypto", "world", "country"];
type Topic = Exclude<Interest, "country">;
const TOPICS: Topic[] = ["sports", "politics", "crypto", "world"];

export function isInterest(x: unknown): x is Interest {
  return typeof x === "string" && (INTERESTS as string[]).includes(x);
}

/** Stored value -> clean list. Anything that is not an array means "never chosen": everything. */
export function sanitizeInterests(x: unknown): Interest[] {
  if (!Array.isArray(x)) return [...INTERESTS];
  return INTERESTS.filter((i) => x.includes(i));
}

// ---------------------------------------------------------------------------
// Countries: a short list for the picker, English names as the fallback, keywords for the boost
// ---------------------------------------------------------------------------

interface CountryInfo {
  name: string; // English fallback when Intl.DisplayNames is missing (Hermes on Android)
  keywords: string[]; // lowercase; country, demonym, main cities, well-known names and clubs
}

export const COUNTRIES: Record<string, CountryInfo> = {
  US: { name: "United States", keywords: ["united states", "u.s.", "usa", "american", "america", "washington", "new york", "california", "texas", "nfl", "nba", "super bowl"] },
  BR: { name: "Brazil", keywords: ["brazil", "brasil", "brazilian", "lula", "bolsonaro", "são paulo", "sao paulo", "rio de janeiro", "flamengo", "palmeiras", "corinthians", "brasileirão", "brasileirao"] },
  MX: { name: "Mexico", keywords: ["mexico", "méxico", "mexican", "sheinbaum", "mexico city", "monterrey", "guadalajara", "liga mx", "club américa", "chivas"] },
  AR: { name: "Argentina", keywords: ["argentina", "argentine", "argentinian", "milei", "buenos aires", "boca juniors", "river plate", "messi"] },
  ES: { name: "Spain", keywords: ["spain", "spanish", "españa", "sánchez", "madrid", "barcelona", "real madrid", "la liga", "laliga", "atlético", "atletico"] },
  PT: { name: "Portugal", keywords: ["portugal", "portuguese", "lisbon", "lisboa", "porto", "benfica", "sporting cp", "ronaldo"] },
  GB: { name: "United Kingdom", keywords: ["united kingdom", "u.k.", "uk", "britain", "british", "england", "english", "scotland", "london", "starmer", "premier league", "arsenal", "chelsea", "liverpool", "manchester"] },
  DE: { name: "Germany", keywords: ["germany", "german", "berlin", "munich", "merz", "bundesliga", "bayern", "dortmund"] },
  FR: { name: "France", keywords: ["france", "french", "paris", "macron", "marseille", "ligue 1", "psg"] },
  RU: { name: "Russia", keywords: ["russia", "russian", "putin", "moscow", "kremlin", "ukraine", "st. petersburg", "zenit"] },
  UA: { name: "Ukraine", keywords: ["ukraine", "ukrainian", "kyiv", "kiev", "zelensky", "zelenskyy", "kharkiv", "odesa", "shakhtar"] },
  TR: { name: "Turkey", keywords: ["turkey", "türkiye", "turkiye", "turkish", "erdogan", "erdoğan", "istanbul", "ankara", "galatasaray", "fenerbahçe", "fenerbahce"] },
  IN: { name: "India", keywords: ["india", "indian", "modi", "delhi", "new delhi", "mumbai", "bengaluru", "ipl", "cricket", "bollywood"] },
  CN: { name: "China", keywords: ["china", "chinese", "beijing", "shanghai", "xi jinping", "hong kong", "shenzhen", "yuan"] },
  JP: { name: "Japan", keywords: ["japan", "japanese", "tokyo", "osaka", "nikkei", "yen", "ohtani"] },
  KR: { name: "South Korea", keywords: ["south korea", "korea", "korean", "seoul", "busan", "kospi", "k-pop", "samsung"] },
  VN: { name: "Vietnam", keywords: ["vietnam", "viet nam", "vietnamese", "hanoi", "ho chi minh"] },
  PH: { name: "Philippines", keywords: ["philippines", "philippine", "filipino", "manila", "marcos", "pba"] },
  ID: { name: "Indonesia", keywords: ["indonesia", "indonesian", "jakarta", "bali", "prabowo"] },
  NG: { name: "Nigeria", keywords: ["nigeria", "nigerian", "lagos", "abuja", "tinubu", "naira"] },
};

/** Picker order. */
export const COUNTRY_CODES = Object.keys(COUNTRIES);

export function sanitizeCountry(x: unknown): string | undefined {
  return typeof x === "string" && /^[A-Z]{2}$/.test(x) ? x : undefined;
}

/** "pt-BR" -> "BR", "zh-Hans-CN" -> "CN", "en_US" -> "US". No region (for example "es") -> undefined. */
export function countryFromLocale(locale: string | undefined | null): string | undefined {
  if (!locale || typeof locale !== "string") return undefined;
  const parts = locale.replace(/_/g, "-").split("-").slice(1);
  for (const p of parts) {
    if (p.length === 2 && /^[A-Za-z]{2}$/.test(p)) return p.toUpperCase();
    if (/^\d{3}$/.test(p)) return undefined; // UN M.49 region like 419 (Latin America): not a country
  }
  return undefined;
}

/** Region of the phone's locale, if it has one. */
export function deviceCountry(): string | undefined {
  try {
    return countryFromLocale(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return undefined;
  }
}

/** Country name in the interface language when the JS engine can, else English. */
export function countryName(code: string, lang = "en"): string {
  try {
    const DN = (Intl as unknown as { DisplayNames?: new (l: string[], o: { type: string }) => { of: (c: string) => string | undefined } }).DisplayNames;
    if (DN) {
      const name = new DN([lang], { type: "region" }).of(code);
      if (name && name !== code) return name;
    }
  } catch {
    // fall through to the table
  }
  return COUNTRIES[code]?.name ?? code;
}

// ---------------------------------------------------------------------------
// Matching and ranking
// ---------------------------------------------------------------------------

/** Whole-word (or whole-phrase) match on lowercase text. */
export function hasWord(text: string, kw: string): boolean {
  const isWordChar = (c: string | undefined) => !!c && /[a-z0-9À-ɏ]/.test(c);
  let i = text.indexOf(kw);
  while (i !== -1) {
    if (!isWordChar(text[i - 1]) && !isWordChar(text[i + kw.length])) return true;
    i = text.indexOf(kw, i + 1);
  }
  return false;
}

const TOPIC_WORDS: Record<Topic, string[]> = {
  sports: [
    "sports", "soccer", "football", "nfl", "nba", "wnba", "mlb", "nhl", "mls", "ufc", "mma", "boxing", "fifa", "uefa", "world cup", "champions league",
    "premier league", "la liga", "laliga", "serie a", "bundesliga", "ligue 1", "super bowl", "stanley cup", "world series", "playoffs", "finals", "f1",
    "formula 1", "grand prix", "tennis", "wimbledon", "us open", "french open", "australian open", "golf", "pga", "cricket", "ipl", "olympics", "olympic",
    "copa", "libertadores", "match", "game", "season", "mvp", "goal", "goals", "touchdown", "league", "cup", "tournament", "championship",
  ],
  politics: [
    "politics", "election", "elections", "vote", "votes", "voters", "poll", "polls", "approval", "parliament", "senate", "congress", "governor", "mayor",
    "prime minister", "minister", "chancellor", "party", "democrat", "democrats", "republican", "republicans", "gop", "cabinet", "supreme court",
    "referendum", "coalition", "speaker", "legislation", "white house",
  ],
  crypto: [
    "crypto", "bitcoin", "btc", "ethereum", "eth", "solana", "sol", "xrp", "dogecoin", "doge", "token", "tokens", "stablecoin", "usdc", "usdt", "binance",
    "coinbase", "airdrop", "memecoin", "blockchain", "defi", "nft", "fdv", "altcoin", "etf",
  ],
  world: [
    "world", "global", "geopolitics", "economy", "inflation", "gdp", "recession", "interest rate", "interest rates", "fed", "ecb", "central bank", "oil",
    "gold", "stock market", "s&p 500", "nasdaq", "un", "united nations", "nato", "eu", "summit", "treaty", "climate", "weather", "temperature",
    "hurricane", "earthquake", "space", "spacex", "nasa", "ai", "openai", "science", "business",
  ],
};

/** Polymarket category strings -> our topics. */
const CATEGORY_TOPIC: Record<string, Topic> = {
  sports: "sports", soccer: "sports", football: "sports", tennis: "sports", nba: "sports", nfl: "sports", mlb: "sports", nhl: "sports", ufc: "sports",
  esports: "sports", games: "sports", epl: "sports", "premier league": "sports", "champions league": "sports", ucl: "sports", f1: "sports", cricket: "sports",
  politics: "politics", elections: "politics", "global elections": "politics", "world elections": "politics", "us election": "politics",
  midterms: "politics", "us-current-affairs": "politics", senate: "politics",
  crypto: "crypto", "crypto prices": "crypto", bitcoin: "crypto", ethereum: "crypto", solana: "crypto",
  world: "world", geopolitics: "world", "world affairs": "world", "middle east": "world", economy: "world", "economic policy": "world", fed: "world",
  "fed rates": "world", "global rates": "world", "macro indicators": "world", business: "world", finance: "world", science: "world", tech: "world",
  weather: "world", climate: "world",
};

/** Topics of a market from its category and tags (when the gamma API sends them) and keywords in the question. */
export function topicsOf(m: Pick<DiscoverMarket, "question" | "category" | "tags">): Set<Topic> {
  const out = new Set<Topic>();
  const labels = [m.category ?? "", ...(m.tags ?? [])].map((s) => s.toLowerCase().trim()).filter(Boolean);
  for (const l of labels) {
    const c = CATEGORY_TOPIC[l];
    if (c) out.add(c);
  }
  const q = m.question.toLowerCase();
  for (const tp of TOPICS) if (TOPIC_WORDS[tp].some((w) => hasWord(q, w))) out.add(tp);
  return out;
}

/** True when the question, category or tags mention the country, its people, main cities or famous names. */
export function mentionsCountry(m: Pick<DiscoverMarket, "question" | "category" | "tags">, code: string | undefined): boolean {
  const info = code ? COUNTRIES[code] : undefined;
  if (!info) return false;
  const text = [m.question, m.category ?? "", ...(m.tags ?? [])].join(" | ").toLowerCase();
  return info.keywords.some((k) => hasWord(text, k));
}

export interface FeedPrefs {
  interests: Interest[];
  country?: string;
}

/** Below this many matches the feed is filled up with the rest, so it never looks empty. */
export const MIN_FEED = 5;

// Markets that settle on wording (did someone announce, launch, agree...) get disputed more often than
// markets that settle on a price feed. Plain keyword score, no data source.
const WORDING_WORDS = ["announce", "announces", "announced", "release", "released", "releases", "launch", "launches", "launched", "say", "says", "said",
  "meet", "meets", "meeting", "deal", "agree", "agrees", "agreement", "confirm", "confirms", "before", "by end of", "by the end of", "sign", "signs"];
const PRICE_WORDS = ["price of", "above $", "below $", "above", "below", "reach $", "dip to", "hit $", "market cap"];
const PRICE_ASSET = /\b(btc|bitcoin|eth|ethereum|sol|solana|xrp|doge|dogecoin|bnb|hype|gold|oil|nasdaq|s&p)\b/;

/** +1 for wording-resolved markets, -1 for price-threshold markets, 0 otherwise. Higher shows first. */
export function disputeScore(question: string): number {
  const q = question.toLowerCase();
  if (q.includes("price of") || (PRICE_ASSET.test(q) && PRICE_WORDS.some((w) => q.includes(w)))) return -1;
  if (WORDING_WORDS.some((w) => hasWord(q, w)) || q.includes("declassif")) return 1;
  return 0;
}

const TECH_WORDS = ["ai", "openai", "chatgpt", "gpt", "gemini", "nvidia", "apple", "google", "microsoft", "meta", "tesla", "spacex", "iphone", "tech"];

/** Crypto or tech market: shown first in the default feed for English-language phones in the US (or with no region). */
export function isCryptoOrTech(m: Pick<DiscoverMarket, "question" | "category" | "tags">): boolean {
  if (topicsOf(m).has("crypto")) return true;
  const text = [m.question, m.category ?? "", ...(m.tags ?? [])].join(" | ").toLowerCase();
  return TECH_WORDS.some((w) => hasWord(text, w));
}

/** Default lead for a phone: crypto + tech first when the interface is English and the country is the US or unknown. */
export function leadsWithCryptoTech(prefs: FeedPrefs, lang: string): boolean {
  const all = INTERESTS.every((i) => prefs.interests.includes(i));
  return all && lang === "en" && (prefs.country === undefined || prefs.country === "US");
}

export interface Ranked {
  market: DiscoverMarket;
  matched: boolean; // matches a chosen interest or the country
}

/**
 * Personal order: country matches first (when "country" is chosen), then interest matches. Inside each group:
 * crypto + tech first when `cryptoTechFirst`, then wording-resolved markets above price-threshold ones,
 * then the original volume order. Markets with no known topic stay when every topic is chosen (the default),
 * so the default feed is the same set as before. If fewer than MIN_FEED markets match, the rest follow in order.
 */
export function rankFeed(markets: DiscoverMarket[], prefs: FeedPrefs, opts: { cryptoTechFirst?: boolean } = {}): Ranked[] {
  const want = new Set(prefs.interests);
  const allTopics = TOPICS.every((tp) => want.has(tp));
  const country = want.has("country") ? prefs.country : undefined;
  const local: DiscoverMarket[] = [];
  const topical: DiscoverMarket[] = [];
  const rest: DiscoverMarket[] = [];
  for (const m of markets) {
    if (country && mentionsCountry(m, country)) {
      local.push(m);
      continue;
    }
    const topics = topicsOf(m);
    const hit = [...topics].some((tp) => want.has(tp)) || (allTopics && topics.size === 0);
    (hit ? topical : rest).push(m);
  }
  const order = (list: DiscoverMarket[]) =>
    list
      .map((m, i) => ({ m, i, lead: opts.cryptoTechFirst && isCryptoOrTech(m) ? 1 : 0, d: disputeScore(m.question) }))
      .sort((a, b) => b.lead - a.lead || b.d - a.d || a.i - b.i)
      .map((x) => ({ market: x.m, matched: true }));
  const picked = [...order(local), ...order(topical)];
  if (picked.length >= MIN_FEED) return picked;
  return [...picked, ...rest.map((m) => ({ market: m, matched: false }))];
}

/** Up to n personal suggestions for the "Watch a market" card: matches only, skipping ids already watched. */
export function forYou(ranked: Ranked[], n = 2, skipIds: string[] = []): DiscoverMarket[] {
  return ranked.filter((r) => r.matched && !skipIds.includes(r.market.id)).slice(0, n).map((r) => r.market);
}

// ---------------------------------------------------------------------------
// Shared state: the prefs App.tsx loaded and the last feed Discover fetched
// ---------------------------------------------------------------------------

interface FeedState {
  prefs: FeedPrefs;
  markets: DiscoverMarket[] | null;
}

let state: FeedState = { prefs: { interests: [...INTERESTS] }, markets: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const get = () => state;

export function setFeedPrefs(p: FeedPrefs): void {
  const same = p.country === state.prefs.country && p.interests.length === state.prefs.interests.length && p.interests.every((i) => state.prefs.interests.includes(i));
  if (same) return;
  state = { ...state, prefs: { interests: sanitizeInterests(p.interests), country: sanitizeCountry(p.country) } };
  emit();
}

export function setFeedMarkets(markets: DiscoverMarket[] | null): void {
  state = { ...state, markets };
  emit();
}

export function useFeed(): FeedState {
  return useSyncExternalStore(subscribe, get, get);
}

// App.tsx registers how a change is saved, so Discover can toggle interests without extra props.
let saver: ((p: FeedPrefs) => void) | null = null;
export function setFeedPrefsSaver(fn: ((p: FeedPrefs) => void) | null): void {
  saver = fn;
}

/** Change from the UI: shows at once, then saves to settings. */
export function changeFeedPrefs(p: FeedPrefs): void {
  setFeedPrefs(p);
  saver?.(state.prefs);
}

export function toggleInterest(list: Interest[], i: Interest): Interest[] {
  return list.includes(i) ? list.filter((x) => x !== i) : INTERESTS.filter((x) => x === i || list.includes(x));
}
