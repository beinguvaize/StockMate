// What goes to Anthropic (docs/ai-chat-v1.md §6). Customer, supplier, account,
// expense-category and staff names become stand-ins, ids never leave, and the
// map lives for one request.

const isIdKey = (k: string) => k === "id" || k.endsWith("_id");

// A second line behind the SQL functions, which select none of these: if a
// later change ever adds one, it is dropped here before anything is sent.
const PRIVATE_KEY = /phone|mobile|contact|email|gstin|gst_no|pan|aadhaar|aadhar|address|account_no|ifsc|upi_id|bank_name/i;
// Staff records also hold HR and statutory fields. None is selected by the
// staff functions; these are dropped by name if one ever is. Anchored where a
// bare substring would hit an ordinary key ("uan" is inside "quantity").
const HR_KEY = /bank_account|bank_ac|(^|_)(dob|uan|esi|pf)(_|$)|esi_no|pf_account|birth|emergency|blood_group|gender|employee_code|staff_code|statutory/i;
const PERSON_KEY = /^(client|customer|supplier|staff|employee|vendor|worker|payee)_?name$/i;
// And by value: a GSTIN, or a run of 10 or more digits that could be a phone.
const GSTIN = /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]\b/i;
const PHONE = /(?:\+?\d[\s-]?){10,}/;

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isIdKey(k) || PRIVATE_KEY.test(k) || HR_KEY.test(k) || PERSON_KEY.test(k)) continue;
      if (typeof v === "string" && (GSTIN.test(v) || PHONE.test(v))) continue;
      out[k] = strip(v);
    }
    return out;
  }
  return value;
}

export function toModelFigures(figures: Record<string, unknown>) {
  const map: Record<string, string> = {};
  const view = strip(figures) as Record<string, any>;
  const realCustomers = (figures.customers as any[]) || [];
  const realAccounts = (figures.accounts as any[]) || [];

  if (Array.isArray(view.customers)) {
    view.customers = view.customers.map((c: any, i: number) => {
      const token = `[C${i + 1}]`;
      map[token] = String(realCustomers[i]?.name ?? "");
      return { ...c, name: token };
    });
  }
  if (Array.isArray(view.suppliers)) {
    const real = (figures.suppliers as any[]) || [];
    view.suppliers = view.suppliers.map((x: any, i: number) => {
      const token = `[S${i + 1}]`;
      map[token] = String(real[i]?.name ?? "");
      return { ...x, name: token };
    });
  }
  if (Array.isArray(view.accounts)) {
    view.accounts = view.accounts.map((a: any, i: number) => {
      const token = `[A${i + 1}]`;
      map[token] = String(realAccounts[i]?.label ?? "");
      return { ...a, label: token, type: a.type === "CASH" ? "CASH" : "BANK" };
    });
  }
  expenseStandIns(view, figures, map);
  staffStandIns(view, figures, map);
  return { view, map };
}

/**
 * Staff: every name goes as [P1], [P2]... and one person keeps one token on a
 * card, whichever list they are in (salary_due sends `due_staff`, the others
 * `staff`). The token is keyed by the employee's id from the real figures, by
 * position, so two staff with the same name stay two people and the id itself
 * never leaves (strip() drops every *_id key). Pay figures go alongside.
 */
function staffStandIns(view: Record<string, any>, figures: Record<string, any>, map: Record<string, string>) {
  const token = new Map<string, string>();
  const swap = (person: any) => {
    const key = String(person?.employee_id ?? `name:${person?.name ?? ""}`);
    if (!token.has(key)) {
      const t = `[P${token.size + 1}]`;
      token.set(key, t);
      map[t] = String(person?.name ?? "");
    }
    return token.get(key)!;
  };
  for (const list of ["staff", "due_staff"]) {
    if (!Array.isArray(view[list])) continue;
    const real = (figures[list] as any[]) || [];
    view[list] = view[list].map((x: any, i: number) => ({ ...x, name: swap(real[i]) }));
  }
}

/**
 * Expenses: a category is the owner's own free text and can be a person's
 * name (a shop files "Ravi" or "umma cash" as a category), and an entry's
 * description can name the payee. So every category goes as [E1], [E2]... the
 * same token wherever the same category appears, and descriptions never go at
 * all. The SQL already drops the description of a payroll-linked entry, which
 * names the staff member paid.
 */
function expenseStandIns(view: Record<string, any>, figures: Record<string, any>, map: Record<string, string>) {
  const token = new Map<string, string>();
  const swap = (name: unknown) => {
    const real = String(name ?? "");
    if (!token.has(real)) {
      const t = `[E${token.size + 1}]`;
      token.set(real, t);
      map[t] = real;
    }
    return token.get(real)!;
  };
  // Names come from the real figures, by position, as for customers: strip()
  // may already have dropped a value that looked like a phone number.
  // Categories first, so the biggest category is [E1] on every question.
  if (Array.isArray(view.categories)) {
    const real = (figures.categories as any[]) || [];
    view.categories = view.categories.map((c: any, i: number) => ({ ...c, category: swap(real[i]?.category) }));
  }
  if (Array.isArray(view.entries)) {
    const real = (figures.entries as any[]) || [];
    view.entries = view.entries.map(({ description: _drop, ...e }: any, i: number) => ({ ...e, category: swap(real[i]?.category) }));
  }
}

/** Swap real names back in, longest token first so [C1] never clips [C10]. */
export function restoreNames(text: string, map: Record<string, string>) {
  return Object.keys(map)
    .sort((a, b) => b.length - a.length)
    .reduce((t, token) => t.split(token).join(map[token]), text);
}

/** Canonical JSON: key order must not change the hash. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** as_of changes every call, so it stays out of the hash. */
export async function figuresHash(view: Record<string, unknown>) {
  const { as_of: _omit, ...rest } = view;
  const bytes = new TextEncoder().encode(stableStringify(rest));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
