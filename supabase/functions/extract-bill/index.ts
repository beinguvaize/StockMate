// extract-bill — vision OCR for Indian GST purchase bills.
// Receives a bill image (base64), calls Gemini, returns structured JSON.
// API key stays server-side (GEMINI_API_KEY secret). JWT verified by platform.
// Retries transient 429/5xx once per model, then falls back to the next.
//
// Free tier: Google may use what is sent to improve its products and human
// reviewers may read it. A bill photo shows the supplier's name, GSTIN and
// address, so the phone asks the user before the first scan.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// gemini-2.0-flash has left the free tier and gemini-2.5-flash is deprecated
// (Google redirects it from 1 Dec 2026). The list can be changed without a
// deploy: GEMINI_BILL_MODELS="model-a,model-b". 2.5-flash stays last as a
// fallback while it still answers.
const DEFAULT_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"];
const MODELS = (Deno.env.get("GEMINI_BILL_MODELS") ?? "")
  .split(",").map((m) => m.trim()).filter(Boolean);
if (MODELS.length === 0) MODELS.push(...DEFAULT_MODELS);

const SCHEMA_PROMPT = `Extract this Indian GST purchase/tax invoice into STRICT JSON only (no markdown, no commentary).
Schema:
{
  "supplier_name": string,
  "gstin": string|null,
  "invoice_no": string|null,
  "date": string|null,            // ISO yyyy-mm-dd if parseable
  "place_of_supply": string|null,
  "is_interstate": boolean,        // true if IGST present / different states
  "items": [ { "name": string, "hsn": string|null, "qty": number, "rate": number, "tax_rate": number, "amount": number } ],
  "taxable": number,
  "cgst": number,
  "sgst": number,
  "igst": number,
  "total": number
}
Rules: numbers must be numeric (no currency symbols/commas). If a value is missing use null (or 0 for numeric tax fields). tax_rate is the GST percent for that line (0,5,12,18,28). Do not invent items.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      console.error("[extract-bill] GEMINI_API_KEY not set");
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not set" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const body = await req.json();
    const imageB64: string | undefined = body.image_base64;
    const mimeType: string = body.mime_type ?? "image/jpeg";
    if (!imageB64) {
      return new Response(JSON.stringify({ error: "image_base64 required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    console.log(`[extract-bill] req: mime=${mimeType} b64len=${imageB64.length}`);

    const gReq = JSON.stringify({
      contents: [{
        parts: [
          { text: SCHEMA_PROMPT },
          { inline_data: { mime_type: mimeType, data: imageB64 } },
        ],
      }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    });

    // Try each model; retry transient 429/5xx once per model.
    let gRes: Response | null = null;
    let lastErr = "";
    outer: for (const model of MODELS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body: gReq },
        );
        if (r.ok) { gRes = r; console.log(`[extract-bill] model=${model} attempt=${attempt} ok`); break outer; }
        lastErr = `${model} -> ${r.status}: ${(await r.text()).slice(0, 200)}`;
        console.error(`[extract-bill] ${lastErr}`);
        // 4xx other than 429 won't heal — skip retries, try next model
        if (r.status !== 429 && r.status < 500) break;
        await new Promise((res) => setTimeout(res, 800));
      }
    }

    if (!gRes) {
      return new Response(JSON.stringify({ error: "gemini_failed", detail: lastErr }), {
        status: 502, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const gJson = await gRes.json();
    // Newer models can return a thought part before the answer: take the
    // first text part that is not one.
    const parts: Array<{ text?: string; thought?: boolean }> = gJson?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.find((pt) => typeof pt.text === "string" && !pt.thought)?.text ?? "{}";
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(text); }
    catch { parsed = { _raw: text, error: "parse_failed" }; }

    // Reconcile: sum(line amounts) ~= taxable ; taxable + taxes ~= total.
    const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);
    const items = Array.isArray(parsed.items) ? parsed.items as Record<string, unknown>[] : [];
    const lineSum = items.reduce((s, it) => s + num(it.amount), 0);
    const taxable = num(parsed.taxable);
    const taxes = num(parsed.cgst) + num(parsed.sgst) + num(parsed.igst);
    const total = num(parsed.total);
    const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, b * 0.02);
    const reconcile = {
      line_sum: lineSum,
      taxable_ok: near(lineSum, taxable),
      total_ok: near(taxable + taxes, total),
    };
    console.log(`[extract-bill] ok: items=${items.length} total=${total}`);

    return new Response(
      JSON.stringify({ data: parsed, reconcile }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(`[extract-bill] crash: ${e}`);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
