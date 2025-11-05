"use client";
import { useState } from "react";

type Triage = {
  intent: "order_status" | "cancellation" | "technical" | "other";
  urgency: "low" | "medium" | "high";
  entities: { orderId?: string; email?: string; name?: string };
  language: "de" | "en";
  confidence: number;
};

export default function Page() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [triage, setTriage] = useState<Triage | null>(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");

  async function onTriage() {
    setLoading(true); setError(""); setReply("");
    try {
      const r = await fetch("/api/support/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const txt = await r.text();           // zeigt echte Fehltexte
      if (!r.ok) throw new Error(txt || "triage failed");
      const j = JSON.parse(txt);
      setTriage(j as Triage);
    } catch (e: any) {
      setError(e?.message || "triage failed");
    } finally { setLoading(false); }
  }

  async function onReply() {
    if (!triage) return;
    setLoading(true); setError(""); setReply("");
    try {
      const r = await fetch("/api/support/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, triage }),
      });
      const txt = await r.text();           // zeigt echte Fehltexte
      if (!r.ok) throw new Error(txt || "reply failed");
      const j = JSON.parse(txt);
      setReply(j.reply || "");
    } catch (e: any) {
      setError(e?.message || "reply failed");
    } finally { setLoading(false); }
  }

  async function onReplyStream() {
    if (!triage) return;
    setLoading(true); setError(""); setReply("");
    try {
      const res = await fetch("/api/support/reply/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, triage })
      });
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setReply(acc);
      }
    } catch (e: any) {
      setError(e?.message || "stream failed");
    } finally { setLoading(false); }
  }

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Support-AI MVP</h1>
      <p style={{ opacity: 0.8, marginBottom: 20 }}>
        Schritt 1: Triage → Schritt 2: Antwort. Optional: 2b Live-Antwort (SSE).
      </p>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={6}
        placeholder="Beispiel: Hallo, meine Bestellung #A123456 ist noch nicht angekommen. Was ist der Status?"
        style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #ccc" }}
      />

      <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
        <button onClick={onTriage} disabled={loading || !message} style={btnStyle}>1) Triage</button>
        <button onClick={onReply} disabled={loading || !triage} style={btnStyle}>2) Antwort generieren</button>
        <button onClick={onReplyStream} disabled={loading || !triage} style={btnStyle}>2b) Live-Antwort (SSE)</button>
      </div>

      {error && <p style={{ color: "#b00020", marginTop: 12 }}>Fehler: {error}</p>}

      {triage && (
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Triage Ergebnis</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(triage, null, 2)}</pre>
        </section>
      )}

      {reply && (
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Antwort</h2>
          <p>{reply}</p>
        </section>
      )}
    </main>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #999",
  cursor: "pointer",
  background: "#f8f8f8",
};

const cardStyle: React.CSSProperties = {
  marginTop: 16,
  padding: 16,
  borderRadius: 12,
  border: "1px solid #e5e5e5",
  background: "#fff",
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
};
