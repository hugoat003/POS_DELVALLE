/* FUWA POS — mascota (blob mochi sonriente) y logotipo con subtítulo japonés. */

export function Mascot({ size = 40, color = "var(--navy)" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ display: "block" }}>
      <path
        d="M50 14c20 0 32 14 32 30 0 10-6 14-14 16-6 1.5-12 2-18 2s-12-.5-18-2c-8-2-14-6-14-16 0-16 12-30 32-30z"
        fill={color}
      />
      <path
        d="M40 52c3 4 7 6 10 6s7-2 10-6"
        stroke="var(--cream)"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function Logo({ size = 34 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Mascot size={size} />
      <div style={{ lineHeight: 1 }}>
        <div
          style={{
            fontFamily: "var(--display)",
            fontWeight: 800,
            fontSize: size * 0.62,
            color: "var(--navy)",
            letterSpacing: ".5px",
          }}
        >
          FUWA
        </div>
        <div
          style={{
            fontFamily: "var(--jp)",
            fontSize: size * 0.24,
            color: "var(--gold)",
            letterSpacing: "2px",
            marginTop: 2,
          }}
        >
          日本のコーヒー
        </div>
      </div>
    </div>
  );
}
