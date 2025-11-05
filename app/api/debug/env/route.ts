export async function GET() {
  const key = process.env.OPENAI_API_KEY || ""; // Füge hier die Key-Definition hinzu
  return new Response(
    JSON.stringify({ hasKey: !!key, prefix: key.slice(0, 7) }),
    { headers: { "Content-Type": "application/json" } }
  );
}