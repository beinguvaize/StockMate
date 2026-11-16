// What the owner types in the chat box, made safe to send to the model.
//
// The consent notice asks owners not to type customers' phone numbers, bank or
// ID details. This is the second line behind that: anything shaped like one is
// replaced with a neutral token before any model call, and before the text is
// put in a prompt at all. Order matters: the most specific shapes go first, so
// a GSTIN is not half-eaten by the PAN rule inside it, and an email is gone
// before the UPI rule looks for an "@".

export const REMOVED = "[removed]";
export const CHAT_MAX_CHARS = 500;

const RULES: Array<[string, RegExp]> = [
  // name@example.com
  ["email", /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.[\p{L}]{2,}/giu],
  // UPI ids: ramesh@okaxis, 9876543210@ybl
  ["upi", /[\p{L}\p{N}._-]{2,}@[\p{L}]{2,}(?![\p{L}\p{N}])/giu],
  // GSTIN: 2-digit state, PAN, entity digit, Z, check character
  ["gstin", /(?<![\p{L}\p{N}])\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d](?![\p{L}\p{N}])/giu],
  // PAN: ABCDE1234F
  ["pan", /(?<![\p{L}\p{N}])[A-Z]{5}\d{4}[A-Z](?![\p{L}\p{N}])/giu],
  // IFSC: SBIN0001234 (4 letters, a zero, 6 letters or digits)
  ["ifsc", /(?<![\p{L}\p{N}])[A-Z]{4}0[A-Z\d]{6}(?![\p{L}\p{N}])/giu],
  // Aadhaar-like: 12 digits, alone or as 4-4-4 with spaces or hyphens
  ["aadhaar", /(?<![\p{N}])\d{4}[\s-]?\d{4}[\s-]?\d{4}(?![\p{N}])/gu],
  // Phone numbers: +91 98765 43210, 098765-43210, 9876543210, (022) 2345 6789
  ["phone", /(?<![\p{N}])(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,5}\)?[\s-]?)?\d{3,5}[\s-]?\d{4,5}(?![\p{N}])/gu],
  // Bank account-like: any run of 9 to 18 digits, or 10 or more digits split by spaces or hyphens
  ["digits", /(?<![\p{N}])\d{9,18}(?![\p{N}])/gu],
  ["digits", /(?<![\p{N}])(?:\d[\s-]?){10,}(?![\p{N}])/gu],
];

/** A phone rule hit that is really a date or a short amount is left alone. */
function phoneLike(match: string) {
  const digits = match.replace(/\D/g, "");
  // A phone has at least 10 digits (8 for a landline with an STD code written
  // apart). Anything shorter is an amount, a count or a date: keep it.
  if (digits.length < 10 && !(digits.length >= 8 && /[()]/.test(match))) return false;
  // Longer than +91 and 10 digits: an account number, which the digits rule takes.
  if (digits.length > 13) return false;
  // 2026-11-01 and the like are dates, not numbers to hide.
  if (/^\d{4}-\d{2}-\d{2}$/.test(match.trim())) return false;
  return true;
}

export interface Sanitised {
  text: string;
  /** Which rules fired, for tests and a "something was removed" note. Never logged with the text. */
  removed: string[];
}

export function sanitiseChatText(input: unknown): Sanitised {
  let text = String(input ?? "")
    .normalize("NFC")
    // Control characters and zero-width marks can hide text from a reader.
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g, " ")
    // The prompt wraps this text in <question> tags: it may not open or close one.
    .replace(/[<>]/g, " ");
  const removed: string[] = [];
  for (const [name, re] of RULES) {
    text = text.replace(re, (m) => {
      if (name === "phone" && !phoneLike(m)) return m;
      removed.push(name);
      return REMOVED;
    });
  }
  text = text.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  return { text, removed };
}
