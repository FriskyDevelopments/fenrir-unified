const card: React.CSSProperties = {
  background: "rgba(12, 22, 16, 0.85)",
  borderColor: "rgba(255,255,255,0.1)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 16,
  padding: 24,
  width: 400,
  maxWidth: "92vw",
  backdropFilter: "blur(20px)",
  boxShadow: "0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
};

const btn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  padding: "14px 16px",
  borderRadius: 12,
  fontSize: 14,
  fontWeight: 500,
  color: "rgba(255,255,255,0.88)",
  textDecoration: "none",
  border: "1px solid rgba(255,255,255,0.12)",
  marginBottom: 12,
  boxSizing: "border-box",
};

const providers = [
  { id: "apple", label: "Continue with Apple", bg: "linear-gradient(135deg, #2a2a2e 0%, #1a1a1f 100%)" },
  { id: "google", label: "Continue with Google", bg: "linear-gradient(135deg, #1a2a1a 0%, #1a231a 100%)" },
  { id: "microsoft", label: "Continue with Microsoft", bg: "linear-gradient(135deg, #1a1f2e 0%, #151a28 100%)" },
];

export default function Page() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background:
          "radial-gradient(ellipse at 60% 40%, #0d2e1f 0%, #091a12 40%, #050e0a 100%)",
        fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
      }}
    >
      <div style={{ display: "flex", gap: 60, maxWidth: 1080, width: "100%", flexWrap: "wrap", justifyContent: "center" }}>
        <div style={{ flex: 1, minWidth: 280, color: "#e8e8d8" }}>
          <div style={{ fontWeight: 900, letterSpacing: "0.15em", fontSize: 24, color: "#e8e0d0", marginBottom: 24 }}>
            FENRIR
          </div>
          <h1 style={{ fontWeight: 900, fontSize: "clamp(2.4rem, 5vw, 4rem)", lineHeight: 1, textTransform: "uppercase", margin: 0 }}>
            <span>Secure the </span>
            <span style={{ color: "#f08050" }}>front </span>
            <span style={{ color: "#f0c060" }}>door</span>
            <br />
            <span>to </span>
            <span style={{ color: "#80c8a0" }}>every</span>
            <br />
            <span style={{ color: "#60b8e0" }}>Telegram </span>
            <span style={{ color: "#e060a0" }}>group.</span>
          </h1>
          <p style={{ color: "rgba(255,255,255,0.5)", maxWidth: 380, lineHeight: 1.6 }}>
            Secure access powered by passkeys, federated identity, and protected
            workspace sessions.
          </p>
        </div>

        <div style={card}>
          <h2 style={{ fontWeight: 900, textTransform: "uppercase", fontSize: "1.9rem", margin: "0 0 24px" }}>
            <span style={{ color: "#e8e8e0" }}>Enter </span>
            <span style={{ color: "#60d090" }}>Fenrir.</span>
          </h2>
          {providers.map((p) => (
            <a key={p.id} href={`/api/auth/login?provider=${p.id}`} data-testid={`button-${p.id}`} style={{ ...btn, background: p.bg }}>
              {p.label}
            </a>
          ))}
          <a
            href="/api/auth/login?provider=authkit"
            style={{
              display: "block",
              textAlign: "center",
              marginTop: 8,
              padding: "10px 16px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              color: "rgba(160,190,255,0.9)",
              textDecoration: "none",
              background: "rgba(80,120,200,0.2)",
              border: "1px solid rgba(80,120,200,0.4)",
            }}
          >
            More sign-in options
          </a>
        </div>
      </div>
    </div>
  );
}
