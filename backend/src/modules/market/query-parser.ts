import type { ListingKind, SaleType } from '@prisma/client';
import { MARKET_CATEGORIES, SHONA_TO_ENGLISH, ZW_PLACES, findCategory } from './market.constants';

export type SearchSort = 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'nearest' | 'ending_soon';
export const SEARCH_SORTS: SearchSort[] = ['relevance', 'price_asc', 'price_desc', 'newest', 'nearest', 'ending_soon'];

/** Structured filters behind a search, whether typed into filters or understood from a phrase. */
export interface SearchFilters {
  /** Lower-case words to look for in titles and descriptions. */
  keywords: string[];
  category: string | null;
  kind: ListingKind | null;
  minPriceCents: number | null;
  maxPriceCents: number | null;
  /** NEW = brand new only; USED = anything second hand. */
  condition: 'NEW' | 'USED' | null;
  saleType: SaleType | null;
  /** Only listings whose sellers take swaps. */
  barter: boolean;
  /** Limit to listings near the searcher's location. */
  nearMe: boolean;
  /** A town or suburb named in the search. */
  area: string | null;
  sort: SearchSort;
}

export interface Interpretation extends SearchFilters {
  /** Short English description of what was understood, shown to the searcher. */
  summary: string;
  language: 'en' | 'sn' | 'mixed';
  source: 'ai' | 'rules';
}

export const EMPTY_FILTERS: SearchFilters = {
  keywords: [],
  category: null,
  kind: null,
  minPriceCents: null,
  maxPriceCents: null,
  condition: null,
  saleType: null,
  barter: false,
  nearMe: false,
  area: null,
  sort: 'newest',
};

const STOP_WORDS_EN = new Set(
  `i i'm im ive i've me my mine we our you your a an the some any for to of in on at by with and or but is are am be been
  need needs needed want wanted wants looking look find finding search searching show get getting buy buying bought sell
  selling sale sold available please pls plz who that which can could will would should someone somebody person people
  anyone anybody guy guys lady good best great nice quality item items thing things stuff one ones there here this these
  those how what where when much many price prices cost costs dollar dollars usd bucks service services help do does
  doing just very really also like about around for from into than then them they it its it's`.split(/\s+/),
);

const STOP_WORDS_SN = new Set(
  `ndiri ndinoda ndingada ndida kuda kutsvaga kutsvagawo tsvaga ndipe ndipeiwo ndiwanire ndiwanirei ndibatsirei
  ndibatsireiwo ari aripo ariko vari varipo anogona vanogona anoziva munhu vanhu mumwe mumwewo neni newe kana uye here
  ndapota ane ine ino iri chii kwazvo chete zvangu yangu wangu rangu rwangu dzangu kuti nekuti zvakanaka yakanaka
  akanaka anogadzira vanogadzira tenga kutenga nditenge kutengesa zvinhu chinhu mutengo madhora dhora ichi izvi iyi uyu
  ava ndokumbirawo mhoro makadii pane panewo pano kune kwete zvose ese`.split(/\s+/),
);

/** Words that mark a search as (at least partly) Shona. */
const SHONA_MARKERS = new Set([...STOP_WORDS_SN, ...Object.keys(SHONA_TO_ENGLISH), 'pedyo', 'padyo', 'padhuze', 'pasi']);

interface Phrase {
  re: RegExp;
  apply: (f: SearchFilters, flags: Flags) => void;
}

interface Flags {
  cheap: boolean;
  expensive: boolean;
  newest: boolean;
  nearest: boolean;
  endingSoon: boolean;
}

const w = (alternatives: string) => new RegExp(`(?:^|\\s)(?:${alternatives})(?=\\s|$)`, 'g');

/** `test` for the shared global patterns, without leaking `lastIndex` between calls. */
function has(re: RegExp, text: string): boolean {
  re.lastIndex = 0;
  const found = re.test(text);
  re.lastIndex = 0;
  return found;
}

/** Intent phrases in English and Shona (order matters: longer phrases first). */
const PHRASES: Phrase[] = [
  {
    re: w('ending soon|closing soon|last chance|zvava kupera|zvoda kupera'),
    apply: (f, flags) => {
      f.saleType = 'AUCTION';
      flags.endingSoon = true;
    },
  },
  {
    re: w('near me|nearby|near by|close to me|close by|around me|around here|in my area|near here|pedyo neni|padyo neni|pedyo|padyo|padhuze|pedo|kwandiri|nharaunda yangu'),
    apply: (f) => {
      f.nearMe = true;
    },
  },
  {
    re: w('nearest|closest'),
    apply: (f, flags) => {
      f.nearMe = true;
      flags.nearest = true;
    },
  },
  {
    re: w('mutengo wakaderera|mutengo wakadzikira|low[- ]cost|low price|lowest price|cheapest|cheaper|cheap|affordable|budget|inexpensive|bargain|bargains|[a-z]*kachipa|[a-z]*singadhur[a-z]*|[a-z]*singa ?dhur[a-z]*'),
    apply: (_f, flags) => {
      flags.cheap = true;
    },
  },
  {
    re: w('most expensive|expensive|premium|luxury|high[- ]end|[a-z]*nodhura'),
    apply: (_f, flags) => {
      flags.expensive = true;
    },
  },
  {
    re: w('just posted|new listings|latest|newest|recent|recently posted|zvichangoiswa|zvichangobva kuiswa'),
    apply: (_f, flags) => {
      flags.newest = true;
    },
  },
  {
    re: w('brand new|new in box|sealed|unused|boxed|zvitsva|chitsva|itsva|dzitsva|rutsva|matsva|mitsva|new'),
    apply: (f) => {
      f.condition = 'NEW';
    },
  },
  {
    re: w('second[- ]hand|pre[- ]owned|refurbished|used|[a-z]*kashandiswa'),
    apply: (f) => {
      f.condition = 'USED';
    },
  },
  {
    re: w('auctions|auction|bidding|bids|bid|okisheni|okishoni'),
    apply: (f) => {
      f.saleType = 'AUCTION';
    },
  },
  {
    re: w('trade in|swaps|swap|exchange|trade|barter|kuchinjana|chinjana|kutsinhana|tsinhana'),
    apply: (f) => {
      f.barter = true;
    },
  },
];

// "5k" is five thousand; the k must end the number ("100 kuMbare" is a hundred).
const NUM = String.raw`(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:(k)(?![a-z]))?`;
const CUR = String.raw`(?:us\s*)?\$?\s*`;
const AFTER = String.raw`\s*(?:usd|us\$|dollars?|bucks|madhora|dhora)?`;

function money(num: string, k?: string): number | null {
  // "2,000" is two thousand; decimals use a dot.
  const value = Number(num.replace(/,/g, '')) * (k ? 1000 : 1);
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000) return null;
  return Math.round(value * 100);
}

/** Pulls price limits out of the text and returns the text without them. */
function extractPrices(text: string, f: SearchFilters): string {
  const range = new RegExp(String.raw`(?:between|pakati pe)\s*${CUR}${NUM}${AFTER}\s*(?:and|to|-|ne|na)\s*${CUR}${NUM}${AFTER}`);
  const dash = new RegExp(String.raw`${CUR.replace('\\$?', '\\$')}${NUM}\s*(?:-|to)\s*${CUR}${NUM}${AFTER}`);
  const max = new RegExp(
    String.raw`(?:under|below|less than|cheaper than|not more than|no more than|at most|max(?:imum)?|up to|pasi pe(?:madhora\s*)?|pasi pa|[a-z]*singapfuuri|isingapindi)\s*${CUR}${NUM}${AFTER}`,
  );
  // Weaker words ("for", "around", "from") only count with a currency, so "for 50 people" or
  // "from 2015" aren't read as prices.
  const maxWeak = new RegExp(
    String.raw`(?:for|around|about|within)\s*(?:(?:us\s*)?\$\s*${NUM}|${NUM}\s*(?:usd|us\$|dollars?|bucks|madhora|dhora))`,
  );
  const min = new RegExp(String.raw`(?:over|above|more than|at least|kupfuura|pamusoro pe(?:madhora\s*)?)\s*${CUR}${NUM}${AFTER}`);
  const minWeak = new RegExp(String.raw`from\s*(?:us\s*)?\$\s*${NUM}`);
  const bare = new RegExp(String.raw`\$\s*${NUM}`);

  let m = text.match(range) ?? text.match(dash);
  if (m) {
    const a = money(m[1], m[2]);
    const b = money(m[3], m[4]);
    if (a !== null && b !== null) {
      f.minPriceCents = Math.min(a, b);
      f.maxPriceCents = Math.max(a, b);
      return text.replace(m[0], ' ');
    }
  }
  m = text.match(max);
  if (m) {
    const v = money(m[1], m[2]);
    if (v !== null) f.maxPriceCents = v;
    text = text.replace(m[0], ' ');
  } else if ((m = text.match(maxWeak))) {
    const v = m[1] ? money(m[1], m[2]) : money(m[3], m[4]);
    if (v !== null) f.maxPriceCents = v;
    text = text.replace(m[0], ' ');
  }
  m = text.match(min) ?? text.match(minWeak);
  if (m) {
    const v = money(m[1], m[2]);
    if (v !== null) f.minPriceCents = v;
    text = text.replace(m[0], ' ');
  }
  if (f.maxPriceCents === null && f.minPriceCents === null) {
    // "iPhone $200": treat a lone price as the most someone will pay.
    m = text.match(bare);
    if (m) {
      const v = money(m[1], m[2]);
      if (v !== null) f.maxPriceCents = v;
      text = text.replace(m[0], ' ');
    }
  }
  return text;
}

const PLACE_PATTERNS = [...new Set(ZW_PLACES)]
  .sort((a, b) => b.length - a.length)
  .map((place) => ({ place, re: w(`(?:ku|mu|pa|in |at |around )?${place.toLowerCase()}`) }));

const CATEGORY_PATTERNS = MARKET_CATEGORIES.flatMap((c) =>
  c.words.map((word) => ({ slug: c.slug, word, weight: word.includes(' ') ? 2 : 1, re: w(word.replace(/[-]/g, '[- ]?')) })),
);

/** Hints that someone wants a service rather than an item. */
const SERVICE_HINT = w('services?|someone to|somebody to|anyone to|who can|hire|munhu anogona|anogona kugadzira|basa|mabasa');

const ONE_WORD_PLACES = new Set(ZW_PLACES.filter((p) => !p.includes(' ')).map((p) => p.toLowerCase()));

function isShonaWord(word: string): boolean {
  if (SHONA_MARKERS.has(word) || /kachipa$|kashandiswa$|singadhura$/.test(word)) return true;
  // Places with a Shona prefix: kumbare, muavondale, pachitungwiza.
  const prefixed = word.match(/^(?:ku|mu|pa)([a-z]{3,})$/);
  return Boolean(prefixed && ONE_WORD_PLACES.has(prefixed[1]));
}

function detectLanguage(original: string): Interpretation['language'] {
  const words = original.toLowerCase().split(/[^a-z']+/).filter(Boolean);
  let sn = 0;
  let en = 0;
  for (const word of words) {
    if (isShonaWord(word)) sn++;
    else if (STOP_WORDS_EN.has(word)) en++;
  }
  if (sn === 0) return 'en';
  return en === 0 ? 'sn' : 'mixed';
}

/** Adds the English word for Shona keywords so English listings match too. */
export function expandKeywords(words: string[]): string[] {
  const out = new Set<string>();
  for (const word of words) {
    const lower = word.toLowerCase().trim();
    if (lower.length < 2) continue;
    out.add(lower);
    const english = SHONA_TO_ENGLISH[lower];
    if (english) out.add(english);
  }
  return [...out].slice(0, 12);
}

const fmtUsd = (cents: number) => `US$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

/** Plain-English description of filters, e.g. "Plumbers · cheapest first · near you". */
export function describeFilters(f: SearchFilters): string {
  const parts: string[] = [];
  const category = f.category ? findCategory(f.category) : undefined;
  // Quote the words the category name doesn't already say.
  const keywordText = f.keywords.filter((k) => !SHONA_TO_ENGLISH[k] && !category?.words.includes(k)).slice(0, 4);
  if (category) parts.push(category.name);
  if (keywordText.length) parts.push(`“${keywordText.join(' ')}”`);
  if (!category && !keywordText.length) parts.push(f.kind === 'SERVICE' ? 'Services' : f.kind === 'ITEM' ? 'Items' : 'Everything');
  if (f.condition === 'NEW') parts.push('brand new');
  if (f.condition === 'USED') parts.push('second hand');
  if (f.saleType === 'AUCTION') parts.push('auctions');
  if (f.barter) parts.push('open to swaps');
  if (f.minPriceCents !== null && f.maxPriceCents !== null) parts.push(`${fmtUsd(f.minPriceCents)}–${fmtUsd(f.maxPriceCents)}`);
  else if (f.maxPriceCents !== null) parts.push(`under ${fmtUsd(f.maxPriceCents)}`);
  else if (f.minPriceCents !== null) parts.push(`over ${fmtUsd(f.minPriceCents)}`);
  if (f.area) parts.push(`in ${f.area}`);
  if (f.nearMe) parts.push('near you');
  const sortLabel: Record<SearchSort, string | null> = {
    relevance: null,
    newest: null,
    price_asc: 'cheapest first',
    price_desc: 'most expensive first',
    nearest: 'nearest first',
    ending_soon: 'ending soonest',
  };
  const s = sortLabel[f.sort];
  if (s) parts.push(s);
  return parts.join(' · ');
}

/**
 * Understands everyday search phrases in English, Shona or a mix ("cheapest plumber near
 * me", "foni yakachipa pasi pe$100 kuMbare") without calling any outside service.
 */
export function parseQuery(query: string): Interpretation {
  const f: SearchFilters = { ...EMPTY_FILTERS, keywords: [] };
  const flags: Flags = { cheap: false, expensive: false, newest: false, nearest: false, endingSoon: false };
  const original = query.slice(0, 200);
  let text = ` ${original.toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9$.,'\- ]+/g, ' ').replace(/\s+/g, ' ')} `;

  text = extractPrices(text, f);

  // Places first, so "in Avondale" isn't read as a keyword.
  for (const { place, re } of PLACE_PATTERNS) {
    if (has(re, text)) {
      f.area = place;
      text = text.replace(re, ' ');
      break;
    }
  }

  for (const phrase of PHRASES) {
    if (has(phrase.re, text)) {
      phrase.apply(f, flags);
      text = text.replace(phrase.re, ' ');
    }
  }

  // Category: the one with the most (and longest) matching words wins.
  const scores = new Map<string, number>();
  const categoryWords: string[] = [];
  for (const c of CATEGORY_PATTERNS) {
    if (has(c.re, text)) {
      scores.set(c.slug, (scores.get(c.slug) ?? 0) + c.weight);
      categoryWords.push(c.word);
    }
  }
  if (scores.size) {
    const best = [...scores.entries()].sort((a, b) => b[1] - a[1])[0][0];
    f.category = best;
    f.kind = findCategory(best)!.kind;
  } else if (has(SERVICE_HINT, text)) {
    f.kind = 'SERVICE';
  }
  text = text.replace(SERVICE_HINT, ' ');

  const words = text
    .split(/[^a-z0-9'-]+/)
    .map((x) => x.replace(/^['-]+|['-]+$/g, ''))
    .filter((x) => x.length >= 2 && !/^\d+([.,]\d+)?k?$/.test(x) && !STOP_WORDS_EN.has(x) && !STOP_WORDS_SN.has(x));
  // Keep the words that named the category as extra matches ("geyser", "iphone").
  f.keywords = expandKeywords([...words, ...categoryWords.filter((cw) => !cw.includes(' '))]);

  if (flags.endingSoon) f.sort = 'ending_soon';
  else if (flags.cheap) f.sort = 'price_asc';
  else if (flags.expensive) f.sort = 'price_desc';
  else if (flags.newest) f.sort = 'newest';
  else if (flags.nearest || f.nearMe) f.sort = 'nearest';
  else if (f.keywords.length || f.category) f.sort = 'relevance';
  else f.sort = 'newest';

  return { ...f, summary: describeFilters(f), language: detectLanguage(original), source: 'rules' };
}
