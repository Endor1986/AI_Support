import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const USE_DUMMY = process.env.USE_DUMMY_AI === "true";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/* ---------- Schemas ---------- */
const TriageSchema = z.object({
  intent: z.enum(["order_status", "cancellation", "technical", "other"]),
  urgency: z.enum(["low", "medium", "high"]).default("low"),
  entities: z.object({
    orderId: z.string().optional(),
    email: z.string().email().optional(),
    name: z.string().optional(),
  }).partial(),
  language: z.enum(["de", "en"]).default("de"),
  confidence: z.number().min(0).max(1).default(0.6),
});

const InputSchema = z.object({
  message: z.string().min(1),
});

/* ---------- Utilities ---------- */
// E-Mail, Telefon, IBAN grob maskieren (Demo, nicht für Hochsicherheit)
function redactPII(input: string) {
  return input
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<email>")
    .replace(/\+?\d[0-9\s()\-\u2010\u2011\u2012\u2013\u2014]{6,}\d/g, "<phone>") // erlaubt Strichvarianten
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{1,30}\b/g, "<iban>");
}

// robustere Intent-Erkennung (DE/EN)
function detectIntent(text: string): "order_status" | "cancellation" | "technical" | "other" {
  const t = text.toLowerCase();
  if (/(widerruf|storno|cancel|refund|return)/.test(t)) return "cancellation";
  if (/(bestell|order|status|track|sendung|shipment|delivery|tracking)/.test(t)) return "order_status";
  if (/(technik|error|bug|crash|stürzt|problem|issue|fault)/.test(t)) return "technical";
  return "other";
}

// einfache Sprachheuristik
function detectLanguage(text: string): "de" | "en" {
  const t = text.toLowerCase();
  const deHit = /[äöüß]|bestell|auftrag|widerruf|storno|retoure|rücksend|liefer|paket|versand/.test(t);
  const enHit = /order|cancel|return|refund|shipment|delivery|tracking/.test(t);
  if (deHit && !enHit) return "de";
  if (enHit && !deHit) return "en";
  return /[äöüß]/i.test(text) ? "de" : "en";
}

// deutlich strengere Order-ID-Erkennung
function extractOrderId(text: string): string | undefined {
  // 1) Nach Keywords + ID dahinter (enthält mind. eine Ziffer)
  const kw = text.match(
    /(bestell(?:ung)?|order(?:-?id)?|auftrag(?:s)?nr\.?|ord(?:er)?\s*#?)[:\s-]*([A-Z0-9][A-Z0-9-]*\d[A-Z0-9-]*)/i
  );
  let candidate = kw?.[2];

  // 2) Fallback: neutrales Token (alphanum/-), min. 5 Zeichen, mind. 1 Ziffer
  if (!candidate) {
    const tok = text.match(/\b([A-Z0-9][A-Z0-9-]*\d[A-Z0-9-]{3,})\b/i);
    if (tok?.[1]) candidate = tok[1];
  }
  if (!candidate) return undefined;

  let id = candidate.toUpperCase();

  // Stopwörter/ungeeignete Tokens ausschließen
  const STOP = /^(ORDER|BESTELLUNG|AUFTRAG|STATUS|TRACK|SENDUNG|DELIVERY|SHIPMENT|TRACKING)$/i;
  if (STOP.test(id)) return undefined;

  // Nur A-Z, 0-9, '-' zulassen
  if (/[^A-Z0-9-]/.test(id)) return undefined;

  // plausibel kurz halten
  if (id.length < 5 || id.length > 24) return undefined;

  return id;
}

/* ---------- Handler ---------- */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message } = InputSchema.parse(body);
    const redacted = redactPII(message);

    // ----- DUMMY: regelbasierte Triage -----
    if (USE_DUMMY) {
      const intent = detectIntent(redacted);
      const language = detectLanguage(redacted);
      const orderId = intent === "order_status" ? extractOrderId(redacted) : undefined;

      const triage = {
        intent,
        urgency: "low" as const,
        entities: { orderId },
        language,
        confidence: 0.9,
      };
      const parsed = TriageSchema.parse(triage);
      return NextResponse.json(parsed);
    }

    // ----- REAL: OpenAI structured output -----
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const SYSTEM_PROMPT = `Du bist ein Support-Triage-Assistent. Antworte NUR als JSON exakt im Schema:
{
  "intent": "order_status|cancellation|technical|other",
  "urgency": "low|medium|high",
  "entities": { "orderId"?: string, "email"?: string, "name"?: string },
  "language": "de|en",
  "confidence": number
}
- Sei konservativ, keine Halluzinationen, nur die erlaubten Felder.
- "orderId" nur, wenn eindeutig erkennbar (alphanum/-, mind. 1 Ziffer, 5..24 Zeichen).
`;

    const jsonSchema = {
      name: "triage_schema",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          intent: { enum: ["order_status", "cancellation", "technical", "other"] },
          urgency: { enum: ["low", "medium", "high"] },
          entities: {
            type: "object",
            additionalProperties: false,
            properties: {
              orderId: { type: "string" },
              email: { type: "string" },
              name: { type: "string" },
            },
          },
          language: { enum: ["de", "en"] },
          confidence: { type: "number" },
        },
        required: ["intent", "urgency", "entities", "language", "confidence"],
      },
      strict: true,
    } as const;

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        response_format: { type: "json_schema", json_schema: jsonSchema },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: redacted },
        ],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return NextResponse.json({ error: "OpenAI error", details: err }, { status: 500 });
    }

    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) return NextResponse.json({ error: "No content" }, { status: 500 });

    const parsed = TriageSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return NextResponse.json({ error: "Schema validation failed", issues: parsed.error.format() }, { status: 500 });
    }

    // Nachschärfen (falls das Modell zu großzügig war)
    const post = parsed.data;
    if (post.intent === "order_status") {
      const cleaned = post.entities.orderId ? extractOrderId(post.entities.orderId) : extractOrderId(redacted);
      post.entities.orderId = cleaned;
    } else {
      post.entities.orderId = undefined;
    }

    return NextResponse.json(post);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown error" }, { status: 500 });
  }
}
