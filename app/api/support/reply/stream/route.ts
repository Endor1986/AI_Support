import { NextRequest } from "next/server";

export const runtime = "edge";

const USE_DUMMY = process.env.USE_DUMMY_AI === "true";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// gleiche Ordnungskriterien wie in /reply
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

async function getOrderStatus(orderId: string) {
  await new Promise((r) => setTimeout(r, 150));
  return { orderId, status: "shipped", carrier: "DHL", tracking: "00340434123DE", etaDays: 2 };
}

export async function POST(req: NextRequest) {
  try {
    const { message, triage } = await req.json();
    const lang: "de" | "en" = triage?.language === "de" ? "de" : "en";
    const orderId = cleanOrderId(triage?.entities?.orderId);

    // ===== DUMMY-STREAM =====
    if (USE_DUMMY) {
      const polite = lang === "de" ? "Danke für Ihre Anfrage." : "Thanks for your message.";
      let text = polite;

      if (triage?.intent === "order_status") {
        if (!orderId) {
          text += lang === "de"
            ? " Bitte nennen Sie Ihre Bestellnummer (z. B. A12345), dann prüfe ich den Status."
            : " Please share your order number (e.g., A12345) so I can check the status.";
        } else {
          const info = await getOrderStatus(orderId);
          text += lang === "de"
            ? ` Ihre Bestellung ${info.orderId} ist unterwegs (${info.carrier}, Tracking: ${info.tracking}). ETA ~${info.etaDays} Tage.`
            : ` Your order ${info.orderId} is on its way (${info.carrier}, tracking: ${info.tracking}). ETA ~${info.etaDays} days.`;
        }
      }

      const encoder = new TextEncoder();
      const chunks = text.split(" ");
      let i = 0;

      const stream = new ReadableStream({
        start(controller) {
          function push() {
            if (i >= chunks.length) { controller.close(); return; }
            controller.enqueue(encoder.encode((i ? " " : "") + chunks[i++]));
            setTimeout(push, 40); // kleine Tippgefühl-Verzögerung
          }
          push();
        },
      });

      return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }

    // ===== OPENAI-STREAM =====
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return new Response("Missing OPENAI_API_KEY", { status: 500 });

    // optionaler Tool-Kontext
    let toolContext = "";
    if (triage?.intent === "order_status" && orderId) {
      const info = await getOrderStatus(orderId);
      toolContext = `Tool:getOrderStatus => ${JSON.stringify(info)}`;
    }

    const system =
      `You are a support assistant. Respond briefly, politely and in the user's language (${lang}).
- Never invent order numbers, tracking codes or carriers. Use only provided toolContext.
- If no valid orderId is present for order_status intent, ask for it with an example.
- Keep PII out of logs; do not echo emails or phone numbers.`;

    const openAIResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        stream: true,
        messages: [
          { role: "system", content: system },
          { role: "system", content: `TRIAGE:${JSON.stringify({ ...triage, entities: { ...triage?.entities, orderId } })}` },
          { role: "system", content: toolContext },
          { role: "user", content: String(message || "") },
        ],
      }),
    });

    if (!openAIResp.ok || !openAIResp.body) {
      const t = await openAIResp.text().catch(() => "");
      return new Response(`OpenAI error: ${t}`, { status: 500 });
    }

    // OpenAI SSE -> einfacher Textstream
    const stream = new ReadableStream({
      start(controller) {
        const reader = openAIResp.body!.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();

        function pump() {
          reader.read().then(({ done, value }) => {
            if (done) { controller.close(); return; }
            const chunk = decoder.decode(value, { stream: true });
            for (let line of chunk.split("\n")) {
              if (!line.startsWith("data:")) continue;
              line = line.slice(5).trimStart();
              if (line === "[DONE]") continue;
              try {
                const obj = JSON.parse(line);
                const token = obj?.choices?.[0]?.delta?.content || "";
                if (token) controller.enqueue(encoder.encode(token));
              } catch { /* ignore parse errors */ }
            }
            pump();
          }).catch(err => {
            controller.error(err);
          });
        }
        pump();
      },
    });

    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch (e: any) {
    return new Response(e?.message || "unknown error", { status: 500 });
  }
}
