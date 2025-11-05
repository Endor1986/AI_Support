import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const USE_DUMMY = process.env.USE_DUMMY_AI === "true";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/* ---------- Schemas ---------- */
const ReplyInput = z.object({
  message: z.string().min(1),
  triage: z.object({
    intent: z.string(),
    urgency: z.string(),
    entities: z.object({
      orderId: z.string().optional(),
      email: z.string().optional(),
      name: z.string().optional(),
    }).partial(),
    language: z.string(),
    confidence: z.number(),
  }),
});

/* ---------- Helpers ---------- */
// gleiche Plausibilitätsregeln wie in Triage
function cleanOrderId(maybe: string | undefined): string | undefined {
  if (!maybe) return undefined;
  const id = (maybe || "").toUpperCase().trim();
  if (id.length < 5 || id.length > 24) return undefined;
  if (/[^A-Z0-9-]/.test(id)) return undefined;
  const STOP = /^(ORDER|BESTELLUNG|AUFTRAG|STATUS|TRACK|SENDUNG|DELIVERY|SHIPMENT|TRACKING)$/i;
  if (STOP.test(id)) return undefined;
  if (!/\d/.test(id)) return undefined; // mind. 1 Ziffer
  return id;
}

// Demo-Tool: holt Bestellstatus (Mock)
async function getOrderStatus(orderId: string) {
  await new Promise((r) => setTimeout(r, 150));
  return { orderId, status: "shipped", carrier: "DHL", tracking: "00340434123DE", etaDays: 2 };
}

/* ---------- Handler ---------- */
export async function POST(req: NextRequest) {
  try {
    const { message, triage } = ReplyInput.parse(await req.json());

    // Re-Validierung der OrderId (falls Triage "ORDER" o.ä. lieferte)
    const orderId = cleanOrderId(triage.entities.orderId);
    const lang = (triage.language === "de" ? "de" : "en") as "de" | "en";

    /* ===== DUMMY-MODUS ===== */
    if (USE_DUMMY) {
      const polite = lang === "de" ? "Danke für Ihre Anfrage." : "Thanks for your message.";
      // Kein intent? neutrale Antwort
      if (!triage.intent) {
        return NextResponse.json({ reply: polite });
      }

      if (triage.intent === "order_status") {
        if (!orderId) {
          const ask = lang === "de"
            ? " Bitte teilen Sie mir Ihre Bestellnummer mit (z. B. A12345), dann prüfe ich den Status."
            : " Please share your order number (e.g., A12345) so I can check the status.";
          return NextResponse.json({ reply: polite + ask });
        }
        const info = await getOrderStatus(orderId);
        const txt = lang === "de"
          ? ` Ihre Bestellung ${info.orderId} ist unterwegs (${info.carrier}, Tracking: ${info.tracking}). Voraussichtliche Zustellung in ca. ${info.etaDays} Tagen.`
          : ` Your order ${info.orderId} is on its way (${info.carrier}, tracking: ${info.tracking}). Estimated delivery in ~${info.etaDays} days.`;
        return NextResponse.json({ reply: polite + txt });
      }

      if (triage.intent === "cancellation") {
        const txt = lang === "de"
          ? " Ich kann den Widerruf einleiten. Nennen Sie mir bitte (falls vorhanden) Ihre Bestellnummer und den Grund."
          : " I can start the cancellation. Please share your order number (if available) and the reason.";
        return NextResponse.json({ reply: polite + " " + txt });
      }

      if (triage.intent === "technical") {
        const txt = lang === "de"
          ? " Bitte beschreiben Sie das technische Problem kurz (Gerät/Browser, Schritt, Fehlermeldung)."
          : " Please describe the technical issue briefly (device/browser, step, error message).";
        return NextResponse.json({ reply: polite + " " + txt });
      }

      return NextResponse.json({ reply: polite });
    }

    /* ===== ECHTER LLM-PFAD ===== */
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    // Optionales Tool (Mock): nur wenn OrderId valide
    let toolContext = "";
    if (triage.intent === "order_status" && orderId) {
      const info = await getOrderStatus(orderId);
      toolContext = `Tool:getOrderStatus => ${JSON.stringify(info)}`;
    }

    // Guardrails für das Modell
    const system =
      `You are a support assistant. Respond briefly, politely and in the user's language (${lang}).
- Never invent order numbers, tracking codes or carriers. Use only provided toolContext.
- If no valid orderId is present for order_status intent, ask for it with an example.
- Keep PII out of logs; do not echo emails or phone numbers.
- Prefer bullet-like clarity in 1-2 sentences.`;

    const messages = [
      { role: "system", content: system },
      { role: "system", content: `LANG:${lang}` },
      { role: "system", content: `TRIAGE:${JSON.stringify({ ...triage, entities: { ...triage.entities, orderId } })}` },
      { role: "system", content: toolContext },
      { role: "user", content: message },
    ];

    // Wenn Order-Status aber keine valide OrderId → dem Modell explizit sagen: nachfragen
    if (triage.intent === "order_status" && !orderId) {
      messages.push({
        role: "system",
        content:
          lang === "de"
            ? "Hinweis: Es liegt keine valide Bestellnummer vor. Bitte freundlich nach der Nummer fragen (Beispiel: A12345)."
            : "Note: No valid order number present. Politely ask for it (example: A12345).",
      } as any);
    }

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        messages,
      }),
    });

    if (!resp.ok) {
      const errTxt = await resp.text();
      return NextResponse.json({ error: "OpenAI error", details: errTxt }, { status: 500 });
    }

    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || "";
    return NextResponse.json({ reply: text });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown error" }, { status: 500 });
  }
}
