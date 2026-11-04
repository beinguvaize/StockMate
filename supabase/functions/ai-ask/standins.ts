// What goes to Anthropic (docs/ai-chat-v1.md §6). Customer names and account
// names become stand-ins, ids never leave, and the map lives for one request.

const isIdKey = (k: string) => k === "id" || k.endsWith("_id");

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!isIdKey(k)) out[k] = strip(v);
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
  if (Array.isArray(view.accounts)) {
    view.accounts = view.accounts.map((a: any, i: number) => {
      const token = `[A${i + 1}]`;
      map[token] = String(realAccounts[i]?.label ?? "");
      return { ...a, label: token, type: a.type === "CASH" ? "CASH" : "BANK" };
    });
  }
  return { view, map };
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
