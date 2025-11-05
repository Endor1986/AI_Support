export const metadata = {
  title: "Support-AI MVP",
  description: "Minimal scaffold for AI Support prototype",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body style={{ background: "#fafafa", color: "#111" }}>{children}</body>
    </html>
  );
}
