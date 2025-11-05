# Changelog

## [v0.1.0] - 2025-11-05
**Status:** Lern-/Demo-Release (kein Produktiveinsatz).

### Added
- **Triage-API** (`POST /api/support/triage`): Intent, Entities, Urgency · Zod-Validierung · einfache PII-Redaktion.
- **Reply-API** (`POST /api/support/reply`): Kurze Antwort (DE/EN) · Mock-Orderstatus.
- **Streaming** (`POST /api/support/reply/stream`): SSE-ähnliche Ausgabe.
- **Minimal-Frontend**: Textarea + Buttons + Fehlerausgabe.
- **Env/Config**: `.env.example`, `USE_DUMMY_AI` für lokalen Betrieb.
- **Doku**: README, Screens unter `docs/screens`.

> Hinweis: Weitere ausführliche Changelogs sind **nicht vorgesehen**. Künftige Anpassungen werden (falls nötig) ausschließlich über **Git-Tags** dokumentiert.
