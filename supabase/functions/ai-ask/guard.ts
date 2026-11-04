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
  "lacs", "crore", "crores", "dozen", "half", "double", "twice", "triple", "quarter",
  "तीन", "चार", "पाँच", "पांच", "छह", "छः", "सात", "आठ", "नौ", "दस", "ग्यारह", "बारह", "तेरह", "चौदह", "पंद्रह",
  "सोलह", "सत्रह", "अठारह", "उन्नीस", "बीस", "तीस", "चालीस", "पचास", "साठ", "सत्तर", "अस्सी", "नब्बे", "सौ",
  "हज़ार", "हजार", "लाख", "करोड़", "डेढ़", "ढाई", "आधा", "आधी", "दोगुना", "दुगना",
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
  textWithDigits: string[];
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
    } else if (NUMERIC_LABEL.test(value)) {
      // "0-30", "90+": the numbers in a bucket label may be said.
      (value.match(/\d+(?:\.\d+)?/g) || []).forEach((n) => addNumber(Number(n), into));
    } else if (/\d/.test(value)) {
      into.textWithDigits.push(nfc(value));
    }
  } else if (Array.isArray(value)) {
    addNumber(value.length, into);
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
    dates: new Set(), dayMonths: new Set(), textWithDigits: [],
  };
  collect(figures, a);
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
  for (const m of t.match(/\[[A-Z]\d+\]/g) || []) {
    if (!(m in standIns)) return { ok: false, reason: `unknown_stand_in:${m}` };
  }
  t = t.replace(/\[[A-Z]\d+\]/g, " ");

  const allowed = buildAllowed(figures);

  // Text from the figures, so "Parle-G 500g" does not read as 500.
  for (const s of allowed.textWithDigits) t = t.replace(new RegExp(escapeRe(s), "giu"), " ");

  // Any digit outside 0-9. Checked after the shop's own text is removed.
  if (/(?![0-9])\p{Nd}/u.test(t)) return { ok: false, reason: "non_western_digits" };

  // Dates: only a date in the figures may be stated.
  const dateFail: string[] = [];
  const checkDate = (y: number | null, m: number, d: number, raw: string) => {
    const known = y ? allowed.dates.has(`${y}-${m}-${d}`) : allowed.dayMonths.has(`${m}-${d}`);
    if (!known) dateFail.push(raw);
    return " ";
  };
  t = t.replace(ISO_DATE_RE, (raw, y, m, d) => checkDate(+y, +m, +d, raw));
  t = t.replace(SLASH_DATE_RE, (raw, d, m, y) => checkDate(+y, +m, +d, raw));
  t = t.replace(DAY_MONTH_RE, (raw, d, mon, y) => checkDate(y ? +y : null, MONTHS[mon.toLowerCase()], +d, raw));
  t = t.replace(MONTH_DAY_RE, (raw, mon, d, y) => checkDate(y ? +y : null, MONTHS[mon.toLowerCase()], +d, raw));
  if (dateFail.length) return { ok: false, reason: `date:${dateFail[0]}` };

  // Grouping commas, Indian or Western: 1,23,456 is one number.
  t = t.replace(/(\d),(?=\d)/g, "$1");

  for (const m of t.matchAll(NUMBER_RE)) {
    const n = Number(m[1]);
    const unit = m[2] ? nfc(m[2]).toLowerCase() : "";
    const decimals = (m[1].split(".")[1] || "").length;
    let ok: boolean;
    if (LAKH.includes(unit)) ok = decimals <= 2 && allowed.lakh.has(hundredths(n));
    else if (CRORE.includes(unit)) ok = decimals <= 2 && allowed.crore.has(hundredths(n));
    else if (THOUSAND.includes(unit)) ok = decimals <= 2 && allowed.thousand.has(hundredths(n));
    else if (decimals > 2) ok = allowed.exact.some((v) => Math.abs(v - n) < 1e-9);
    else ok = allowed.plain.has(hundredths(n));
    if (!ok) return { ok: false, reason: `number:${m[0].trim()}` };
  }

  // Spelled-out amounts, once the digits and their units are gone.
  const words = t.replace(NUMBER_RE, " ").toLowerCase().match(/[\p{L}\p{M}]+/gu) || [];
  for (let i = 0; i < words.length; i += 1) {
    if (SPELLED.has(words[i])) return { ok: false, reason: `spelled:${words[i]}` };
    if (SPELLED_BEFORE_UNIT.has(words[i]) && UNIT_WORDS.has(words[i + 1])) {
      return { ok: false, reason: `spelled:${words[i]} ${words[i + 1]}` };
    }
  }
  return { ok: true };
}
