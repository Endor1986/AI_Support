<p align="center">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-14-000000?logo=nextdotjs&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-18%2F20%2B-339933?logo=node.js&logoColor=white">
  <img alt="Streaming" src="https://img.shields.io/badge/Streaming-SSE-1f6feb">
  <img alt="Zod" src="https://img.shields.io/badge/Schema-Zod-3a86ff">
  <img alt="Status" src="https://img.shields.io/badge/Status-MVP-success">
  <img alt="Rights" src="https://img.shields.io/badge/Rights-All%20rights%20reserved-lightgrey">
</p>

# AI_Support (Next.js + TypeScript)

Minimaler Prototyp für eine Support-AI mit **Triage → Antwort → optionalem Streaming (SSE)**.  
Lokal ohne echten API-Key testbar (**Dummy-Modus**).

---

## ✨ Features
- `POST /api/support/triage` → strukturiertes JSON (**intent / entities / urgency**), **Zod-Validierung**, einfache **PII-Redaktion**
- `POST /api/support/reply` → kurze, höfliche Antwort (DE/EN), optionaler Tool-Kontext (Order-Status Mock)
- `POST /api/support/reply/stream` → **SSE**-ähnliches Live-Streaming
- **Frontend**: minimale Seite (Textarea + Buttons), klare Fehlermeldungen
- **Dummy-Modus**: komplett offline testbar (kein OpenAI erforderlich)

---

## 🗂 Projektstruktur
```
AI_SUPPORT/
├─ app/
│  ├─ api/
│  │  └─ support/
│  │     ├─ triage/route.ts          # Triage (Dummy + OpenAI structured output)
│  │     ├─ reply/route.ts           # Antwort (Dummy + OpenAI)
│  │     └─ reply/stream/route.ts    # Streaming (Dummy + OpenAI stream)
│  ├─ api/debug/env/route.ts         # (optional) Key-Check (lokal)
│  └─ page.tsx                       # Simple UI (Textarea + Buttons)
├─ .env.example
├─ next.config.mjs
├─ package.json
└─ README.md
```
_Screenshots zum MVP findest du im Ordner `docs/screens`._

---

## ⚙️ Voraussetzungen
- **Node.js 18/20+**
- **npm** (oder pnpm/yarn)
- Optional: **OPENAI_API_KEY**, falls echte LLM-Antworten gewünscht sind

---

## 🚀 Schnellstart
```bash
cp .env.example .env.local
# Für lokalen Test ohne API:
# USE_DUMMY_AI=true in .env.local

npm i
npm run dev
# Browser: http://localhost:3000
```

---

## 🔧 Umgebungsvariablen
```ini
# Für echten LLM-Betrieb (optional)
OPENAI_API_KEY=sk-REPLACE_ME
OPENAI_MODEL=gpt-4o-mini

# Für lokalen Test ohne API
USE_DUMMY_AI=true
```

---

## 🛣 API

### POST `/api/support/triage`
**Request**
```json
{ "message": "Hallo, wo ist Bestellung A12345?" }
```
**Response (Beispiel)**
```json
{
  "intent": "order_status",
  "urgency": "low",
  "entities": { "orderId": "A12345" },
  "language": "de",
  "confidence": 0.9
}
```
**Hinweis:** Order-ID Heuristik: `A–Z`, `0–9`, `-`, mind. **eine Ziffer**, Länge **5–24** (anpassbar).

### POST `/api/support/reply`
**Request**
```json
{
  "message": "Status zu Bestellung A12345",
  "triage": {
    "intent": "order_status",
    "urgency": "low",
    "entities": { "orderId": "A12345" },
    "language": "de",
    "confidence": 0.9
  }
}
```
**Response (Beispiel)**
```json
{ "reply": "Danke für Ihre Anfrage. Ihre Bestellung A12345 ist unterwegs (DHL, Tracking: 00340434123DE)." }
```

### POST `/api/support/reply/stream`
**Request**
```json
{
  "message": "Status zu Bestellung A12345",
  "triage": {
    "intent": "order_status",
    "urgency": "low",
    "entities": { "orderId": "A12345" },
    "language": "de",
    "confidence": 0.9
  }
}
```
**Response:** `Content-Type: text/plain` – Tokens werden fortlaufend gestreamt (Dummy oder OpenAI-Stream).

---

## 🧪 CLI-Tests
```bash
# Triage
curl -s -X POST http://localhost:3000/api/support/triage   -H "Content-Type: application/json"   -d '{"message":"Hallo, wo ist Bestellung A12345?"}'

# Antwort
curl -s -X POST http://localhost:3000/api/support/reply   -H "Content-Type: application/json"   -d '{"message":"Status zu Bestellung A12345","triage":{"intent":"order_status","urgency":"low","entities":{"orderId":"A12345"},"language":"de","confidence":0.9}}'

# Streaming
curl -N -X POST http://localhost:3000/api/support/reply/stream   -H "Content-Type: application/json"   -d '{"message":"Status zu Bestellung A12345","triage":{"intent":"order_status","urgency":"low","entities":{"orderId":"A12345"},"language":"de","confidence":0.9}}'
```

---

## 🛠 Troubleshooting
- **HTTP 500 bei Triage/Reply** → `USE_DUMMY_AI=true` setzen, Server neu starten.
- **`invalid_api_key`** → vollständigen `sk-...` Key eintragen (nicht die gekürzte Anzeige).
- **Key-Check (lokal)** → `GET /api/debug/env` sollte `{ "hasKey": true }` liefern.
- **Node 22-Eigenheiten** → ggf. Node 20 LTS testen.

---

## 📄 Changelog
Der Changelog liegt unter **`docs/CHANGELOG.md`**.

---

## 🔒 Rechte / Lizenzhinweis
Alle Rechte vorbehalten.  
Dieses Repository ist für Lern-/Demo-Zwecke vorgesehen und **nicht** zur produktiven Verwendung freigegeben.
