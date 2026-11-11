// The number guard (docs/ai-chat-v1.md §6). Runs on every model reply and again
// on every cached reply. Any number the figures cannot account for drops the
// whole reply: there is no partial text and no retry. It checks numbers, not
// meaning, which is why the card stays the source of truth.

const nfc = (s: string) => s.normalize("NFC");

const LAKH = ["lakh", "lakhs", "lac", "lacs", "लाख"].map(nfc);
const CRORE = ["crore", "crores", "cr", "करोड़"].map(nfc);
const THOUSAND = ["thousand", "k", "हज़ार", "हजार"].map(nfc);
const PERCENT = ["%", "percent", "per cent", "प्रतिशत", "फ़ीसदी", "फीसदी"].map(nfc);

const UNIT_RE = [...LAKH, ...CRORE, ...THOUSAND, ...PERCENT]
  .sort((a, b) => b.length - a.length)
  .join("|");
const NUMBER_RE = new RegExp(`(\\d+(?:\\.\\d+)?)(?:\\s*(${UNIT_RE})(?![\\p{L}\\p{M}]))?`, "giu");

// Words that state an amount with no digit in sight. "one" and Hindi "दो"/"एक"
// are too common alone ("दो" is also "give"), so those count only before a unit.
const SPELLED = new Set([
  "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen",
  "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty",
  "sixty", "seventy", "eighty", "ninety", "hundred", "thousand", "million", "billion", "lakh", "lakhs", "lac",
  "lacs", "crore", "crores", "dozen", "half", "halved", "double", "doubled", "doubles", "twice", "triple",
  "tripled", "third", "thirds", "quarter", "quarters",
  "तीन", "चार", "पाँच", "पांच", "छह", "छः", "सात", "आठ", "नौ", "दस", "ग्यारह", "बारह", "तेरह", "चौदह", "पंद्रह",
  "सोलह", "सत्रह", "अठारह", "उन्नीस", "बीस", "तीस", "चालीस", "पचास", "साठ", "सत्तर", "अस्सी", "नब्बे", "सौ",
  "हज़ार", "हजार", "लाख", "करोड़", "डेढ़", "ढाई", "आधा", "आधी", "आधे", "दोगुना", "दुगना", "तिहाई", "चौथाई",
].map(nfc));
const SPELLED_BEFORE_UNIT = new Set(["one", "a", "an", "एक", "दो"].map(nfc));
const UNIT_WORDS = new Set(
  ["rupee", "rupees", "percent", "रुपये", "रुपए", "प्रतिशत", ...LAKH, ...CRORE, ...THOUSAND, "hundred", "सौ"].map(nfc),
);

const MONTHS: Record<string, number> = {};
[
  ["jan", "january", "जनवरी"], ["feb", "february", "फ़रवरी", "फरवरी"], ["mar", "march", "मार्च"],
  ["apr", "april", "अप्रैल"], ["may", "मई"], ["jun", "june", "जून"], ["jul", "july", "जुलाई"],
  ["aug", "august", "अगस्त"], ["sep", "sept", "september", "सितंबर", "सितम्बर"],
  ["oct", "october", "अक्टूबर", "अक्तूबर"], ["nov", "november", "नवंबर", "नवम्बर"],
  ["dec", "december", "दिसंबर", "दिसम्बर"],
].forEach((names, i) => names.forEach((n) => { MONTHS[nfc(n)] = i + 1; }));
const MONTH_ALT = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

const DAY_MONTH_RE = new RegExp(`(?<![\\d.])(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_ALT})(?![\\p{L}\\p{M}])(?:,?\\s+(\\d{4}))?`, "giu");
const MONTH_DAY_RE = new RegExp(`(?<![\\p{L}\\p{M}])(${MONTH_ALT})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?!\\d)(?:,?\\s+(\\d{4}))?`, "giu");
const ISO_DATE_RE = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g;
const SLASH_DATE_RE = /(?<!\d)(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?!\d)/g;

const DAY_RANGE_RE = new RegExp(`(?<![\\d.])(\\d{1,2})\\s*(?:to|से|-|–)\\s*(\\d{1,2})\\s+(${MONTH_ALT})(?![\\p{L}\\p{M}])(?:,?\\s+(\\d{4}))?`, "giu");
const MONTH_YEAR_RE = new RegExp(`(?<![\\p{L}\\p{M}])(${MONTH_ALT})\\s+(\\d{4})(?!\\d)`, "giu");

// Names and phrases that hold a digit or a number word but state no quantity.
const FORM_NAME_RE = /(?<![\p{L}\p{M}\d])GSTR[-\s]?(?:1|2A|2B|3B|9C|9)(?![\p{L}\d])/giu;
const NOT_A_QUANTITY_RE = /\bdouble[-\s]check(?:s|ed|ing)?\b|\b(?:this|the|whole|last|next|that|each|every|same)\s+quarter\b/gi;
// An attendance mark, not an amount: "on a half day", "आधा दिन". Only the
// word next to day; "half the staff" still trips the spelled-amount check.
const HALF_DAY_RE = /(?<![\p{L}\p{M}])(?:half[-\s]days?|आधा\s+दिन|आधे\s+दिन(?:ों)?)(?![\p{L}\p{M}])/giu;

// A rank inside a list is not a figure, but it cannot be longer than the list.
const WORD_RANK: Record<string, number> = {};
[
  ["one", "एक"], ["two", "दो"], ["three", "तीन"], ["four", "चार"], ["five", "पाँच", "पांच"],
  ["six", "छह", "छः"], ["seven", "सात"], ["eight", "आठ"], ["nine", "नौ"], ["ten", "दस"],
].forEach((names, i) => names.forEach((n) => { WORD_RANK[nfc(n)] = i + 1; }));
const TOP_RE = new RegExp(`(?<![\\p{L}\\p{M}])(?:top|टॉप|शीर्ष)\\s+(\\d{1,3}|${Object.keys(WORD_RANK).join("|")})(?![\\p{L}\\p{M}\\d])`, "giu");
const ORDINAL_RE = /(?<![\d.])(\d{1,3})(?:st|nd|rd|th)(?![\p{L}\d])/giu;

const DAY_WORDS = new Set(["day", "days", "दिन", "दिनों"].map(nfc));
const MEASURE_WORDS = new Set(["g", "gm", "kg", "ml", "l", "ltr", "litre", "litres", "ग्राम", "किलो", "किग्रा", "मिली", "लीटर"].map(nfc));
const BANNED = new Set(["overdue", "overdues", "अतिदेय"].map(nfc));

const UP_WORDS = ["more", "higher", "up", "rise", "rose", "increase", "increased", "grew", "growth", "ज़्यादा", "ज्यादा", "अधिक", "बढ़"].map(nfc);
const DOWN_WORDS = ["less", "lower", "down", "fall", "fell", "drop", "dropped", "decrease", "decreased", "कम", "घट", "गिर"].map(nfc);
const hasWord = (words: string[], list: string[]) =>
  words.some((w) => list.some((d) => w === d || (/^\P{ASCII}/u.test(d) && w.startsWith(d))));

const ISO_VALUE = /^(\d{4})-(\d{2})-(\d{2})/;
const NUMERIC_LABEL = /^[\d\s+\-–.]+$/;
const hundredths = (n: number) => Math.round(n * 100);

function roundTo(v: number, d: number) {
  const f = 10 ** d;
  return Math.round((v + Number.EPSILON * Math.sign(v)) * f) / f;
}

interface Allowed {
  plain: Set<number>;
  exact: number[];
  lakh: Set<number>;
  crore: Set<number>;
  thousand: Set<number>;
  dates: Set<string>;   // "2026-11-3"
  dayMonths: Set<string>; // "11-3"
  yearMonths: Set<string>; // "2026-11"
  textWithDigits: string[];
  textNumbers: Set<number>; // digits inside names: "500" of "Parle-G 500g"
  listLength: number;       // the longest list of rows
  periodDays: number | null;
}

function collect(value: unknown, into: Allowed) {
  if (typeof value === "number" && Number.isFinite(value)) {
    addNumber(value, into);
  } else if (typeof value === "string") {
    const iso = value.match(ISO_VALUE);
    if (iso) {
      const [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
      into.dates.add(`${y}-${m}-${d}`);
      into.dayMonths.add(`${m}-${d}`);
      into.yearMonths.add(`${y}-${m}`);
    } else if (NUMERIC_LABEL.test(value)) {
      // "0-30", "90+": the numbers in a bucket label may be said.
      (value.match(/\d+(?:\.\d+)?/g) || []).forEach((n) => addNumber(Number(n), into));
    } else if (/\d/.test(value)) {
      into.textWithDigits.push(nfc(value));
      (value.match(/\d+(?:\.\d+)?/g) || []).forEach((n) => into.textNumbers.add(Number(n)));
    }
  } else if (Array.isArray(value)) {
    addNumber(value.length, into);
    if (value.some((v) => v && typeof v === "object")) into.listLength = Math.max(into.listLength, value.length);
    value.forEach((v) => collect(v, into));
  } else if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((v) => collect(v, into));
  }
}

function addNumber(raw: number, into: Allowed) {
  const v = Math.abs(raw);
  into.exact.push(v);
  [0, 1, 2].forEach((d) => into.plain.add(hundredths(roundTo(v, d))));
  [1, 2].forEach((d) => {
    into.lakh.add(hundredths(roundTo(v / 1e5, d)));
    into.crore.add(hundredths(roundTo(v / 1e7, d)));
    into.thousand.add(hundredths(roundTo(v / 1e3, d)));
  });
}

function buildAllowed(figures: unknown): Allowed {
  const a: Allowed = {
    plain: new Set(), exact: [], lakh: new Set(), crore: new Set(), thousand: new Set(),
    dates: new Set(), dayMonths: new Set(), yearMonths: new Set(), textWithDigits: [],
    textNumbers: new Set(), listLength: 0, periodDays: null,
  };
  collect(figures, a);
  // The span of the period: "30 days" on the expiring and dead stock questions.
  const f = figures as { period_from?: unknown; period_to?: unknown } | null;
  const from = Date.parse(String(f?.period_from ?? "").slice(0, 10));
  const to = Date.parse(String(f?.period_to ?? "").slice(0, 10));
  if (!Number.isNaN(from) && !Number.isNaN(to)) a.periodDays = Math.round((to - from) / 864e5);
  a.textWithDigits.sort((x, y) => y.length - x.length);
  return a;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type GuardResult = { ok: true } | { ok: false; reason: string };

/**
 * @param text     the reply, stand-ins still in place
 * @param figures  the figures the model was given (stand-ins, no ids)
 * @param standIns the stand-in map for this request, e.g. { "[C1]": "..." }
 */
export function checkReply(text: string, figures: unknown, standIns: Record<string, string>): GuardResult {
  if (typeof text !== "string" || !text.trim()) return { ok: false, reason: "empty" };
  let t = nfc(text);

  // Stand-ins: each must be one we issued.
  // Lower case counts as unknown: it would not be swapped back for the owner.
  for (const m of t.match(/\[[a-z]\d+\]/gi) || []) {
    if (!(m in standIns)) return { ok: false, reason: `unknown_stand_in:${m}` };
  }
  t = t.replace(/\[[a-z]\d+\]/gi, " ");

  const allowed = buildAllowed(figures);

  // Text from the figures, so "Parle-G 500g" does not read as 500.
  for (const s of allowed.textWithDigits) t = t.replace(new RegExp(escapeRe(s), "giu"), " ");

  // Any digit outside 0-9. Checked after the shop's own text is removed.
  if (/(?![0-9])\p{Nd}/u.test(t)) return { ok: false, reason: "non_western_digits" };

  t = t.replace(FORM_NAME_RE, " ").replace(NOT_A_QUANTITY_RE, " ").replace(HALF_DAY_RE, " ");

  // Dates: only a date in the figures may be stated.
  const dateFail: string[] = [];
  const checkDate = (y: number | null, m: number, d: number, raw: string) => {
    const known = y ? allowed.dates.has(`${y}-${m}-${d}`) : allowed.dayMonths.has(`${m}-${d}`);
    if (!known) dateFail.push(raw);
    return " ";
  };
  t = t.replace(DAY_RANGE_RE, (raw, d1, d2, mon, y) => {
    const m = MONTHS[mon.toLowerCase()];
    checkDate(y ? +y : null, m, +d1, raw);
    return checkDate(y ? +y : null, m, +d2, raw);
  });
  t = t.replace(ISO_DATE_RE, (raw, y, m, d) => checkDate(+y, +m, +d, raw));
  t = t.replace(SLASH_DATE_RE, (raw, d, m, y) => checkDate(+y, +m, +d, raw));
  t = t.replace(DAY_MONTH_RE, (raw, d, mon, y) => checkDate(y ? +y : null, MONTHS[mon.toLowerCase()], +d, raw));
  t = t.replace(MONTH_DAY_RE, (raw, mon, d, y) => checkDate(y ? +y : null, MONTHS[mon.toLowerCase()], +d, raw));
  t = t.replace(MONTH_YEAR_RE, (raw, mon, y) => {
    if (!allowed.yearMonths.has(`${+y}-${MONTHS[mon.toLowerCase()]}`)) dateFail.push(raw);
    return " ";
  });
  if (dateFail.length) return { ok: false, reason: `date:${dateFail[0]}` };

  // Grouping commas, Indian or Western: 1,23,456 is one number.
  t = t.replace(/(\d),(?=\d)/g, "$1");

  // Ranks: within the list, or the reply claims rows that are not there.
  const rankFail: string[] = [];
  const checkRank = (raw: string, n: number) => {
    if (!(n >= 1 && n <= allowed.listLength)) rankFail.push(raw);
    return " ";
  };
  t = t.replace(TOP_RE, (raw, n) => checkRank(raw, /\d/.test(n) ? +n : WORD_RANK[nfc(n).toLowerCase()]));
  t = t.replace(ORDINAL_RE, (raw, n) => checkRank(raw, +n));
  if (rankFail.length) return { ok: false, reason: `rank:${rankFail[0]}` };

  const nextWords = (at: number, n: number) => (t.slice(at).toLowerCase().match(/[\p{L}\p{M}]+/gu) || []).slice(0, n);
  const prevWords = (at: number, n: number) => (t.slice(0, at).toLowerCase().match(/[\p{L}\p{M}]+/gu) || []).slice(-n);
  const change = (figures as { change_pct?: unknown } | null)?.change_pct;

  for (const m of t.matchAll(NUMBER_RE)) {
    const n = Number(m[1]);
    const at = m.index! + m[0].length;
    const unit = m[2] ? nfc(m[2]).toLowerCase() : "";
    const decimals = (m[1].split(".")[1] || "").length;
    let ok: boolean;
    if (LAKH.includes(unit)) ok = decimals <= 2 && allowed.lakh.has(hundredths(n));
    else if (CRORE.includes(unit)) ok = decimals <= 2 && allowed.crore.has(hundredths(n));
    else if (THOUSAND.includes(unit)) ok = decimals <= 2 && allowed.thousand.has(hundredths(n));
    else if (decimals > 2) ok = allowed.exact.some((v) => Math.abs(v - n) < 1e-9);
    else ok = allowed.plain.has(hundredths(n));
    const next = nextWords(at, 1)[0];
    // "30 days": the span of the period, which only the dates hold.
    if (!ok && !unit && n === allowed.periodDays && DAY_WORDS.has(next)) ok = true;
    // "500 ग्राम": a size from a product name written another way. Only as a
    // size, never as money, so digits in a name cannot pass for an amount.
    if (!ok && !unit && allowed.textNumbers.has(n) && MEASURE_WORDS.has(next)
        && !/(₹|rs\.?|inr)\s*$/i.test(t.slice(0, m.index))) ok = true;
    if (!ok) return { ok: false, reason: `number:${m[0].trim()}` };

    // A right percentage in the wrong direction.
    if (PERCENT.includes(unit) && typeof change === "number" && change !== 0 && Math.abs(change) === n) {
      const after = nextWords(at, 3);
      const near = hasWord(after, UP_WORDS) || hasWord(after, DOWN_WORDS) ? after : prevWords(m.index!, 3);
      const says = hasWord(near, UP_WORDS) ? 1 : hasWord(near, DOWN_WORDS) ? -1 : 0;
      if (says !== 0 && says !== Math.sign(change)) return { ok: false, reason: `direction:${m[0].trim()}` };
    }
  }

  // Spelled-out amounts, once the digits and their units are gone.
  const words = t.replace(NUMBER_RE, " ").toLowerCase().match(/[\p{L}\p{M}]+/gu) || [];
  for (let i = 0; i < words.length; i += 1) {
    // These books have no due dates, so nothing in them can be overdue.
    if (BANNED.has(words[i])) return { ok: false, reason: `banned:${words[i]}` };
    if (SPELLED.has(words[i])) return { ok: false, reason: `spelled:${words[i]}` };
    if (SPELLED_BEFORE_UNIT.has(words[i]) && UNIT_WORDS.has(words[i + 1])) {
      return { ok: false, reason: `spelled:${words[i]} ${words[i + 1]}` };
    }
  }
  return { ok: true };
}
