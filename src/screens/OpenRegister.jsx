/* FUWA POS — pantalla de caja cerrada: abrir turno con un fondo inicial. */
import { useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { Btn } from "../components/ui.jsx";
import { money } from "../lib/format.js";

export function OpenRegister({ onOpen, lastClose, lastCloseNote, lastCashLeft }) {
  // Si el turno anterior dejó anotado cuánto quedaba en caja, se propone como
  // fondo: es lo que hay que contar para confirmar que cuadra.
  const [fondo, setFondo] = useState(() => (lastCashLeft != null ? String(lastCashLeft) : ""));
  const amount = parseFloat(fondo) || 0;

  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
      <div style={{ width: "100%", maxWidth: 440, background: "#fff", border: "2px solid var(--line)", borderRadius: "calc(var(--r) * 1.2)", padding: "32px 32px 28px", textAlign: "center", boxShadow: "0 24px 60px -28px rgba(40,44,60,.4)" }}>
        <div style={{ width: 72, height: 72, borderRadius: 999, background: "var(--primary-soft)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <Icon name="lock" size={34} />
        </div>
        <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 26, color: "var(--navy)", margin: "0 0 6px" }}>La caja está cerrada</h1>
        <p style={{ color: "var(--muted)", margin: "0 0 22px", fontSize: 15, lineHeight: 1.5 }}>
          Para tomar órdenes y cobrar, abre la caja con el efectivo inicial del turno (fondo de caja).
        </p>

        {lastClose && (
          <div style={{ background: "var(--cream)", borderRadius: 12, padding: "10px 14px", marginBottom: lastCloseNote || lastCashLeft != null ? 12 : 20, fontSize: 13, color: "var(--muted)", fontWeight: 700 }}>
            Último cierre: {lastClose}
          </div>
        )}

        {/* Traspaso de turno: lo que dejó dicho quien cerró. Va destacado
            porque es lo que hay que verificar ANTES de empezar a cobrar. */}
        {(lastCloseNote || lastCashLeft != null) && (
          <div
            style={{
              background: "oklch(0.97 0.03 85)",
              border: "2px solid oklch(0.88 0.07 85)",
              borderRadius: 14,
              padding: "12px 16px",
              marginBottom: 20,
              textAlign: "left",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
              <Icon name="note" size={15} color="oklch(0.45 0.1 70)" />
              <span style={{ fontSize: 11.5, fontWeight: 800, color: "oklch(0.45 0.1 70)", textTransform: "uppercase", letterSpacing: 0.7 }}>
                Del turno anterior
              </span>
            </div>
            {lastCashLeft != null && (
              <div style={{ fontSize: 14, color: "var(--ink)", fontWeight: 800, marginBottom: lastCloseNote ? 5 : 0 }}>
                Dejaron {money(lastCashLeft)} en caja — cuenta que cuadre antes de abrir.
              </div>
            )}
            {lastCloseNote && <div style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.45 }}>{lastCloseNote}</div>}
          </div>
        )}

        <div style={{ textAlign: "left", marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Fondo de apertura</div>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontFamily: "var(--display)", fontWeight: 800, fontSize: 22 }}>Q</span>
            <input
              value={fondo}
              onChange={(e) => setFondo(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder="0.00"
              autoFocus
              style={{ width: "100%", padding: "14px 18px 14px 40px", border: "2px solid var(--line)", borderRadius: 14, fontFamily: "var(--display)", fontSize: 24, fontWeight: 800, color: "var(--navy)", outline: "none", boxSizing: "border-box" }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {[0, 200, 500, 1000].map((q) => (
              <button
                key={q}
                onClick={() => setFondo(String(q))}
                style={{
                  flex: "1 1 70px",
                  padding: "10px 8px",
                  borderRadius: 12,
                  cursor: "pointer",
                  fontFamily: "var(--ui)",
                  fontWeight: 800,
                  fontSize: 14,
                  border: "2px solid " + (amount === q ? "var(--primary)" : "var(--line)"),
                  background: amount === q ? "var(--primary-soft)" : "#fff",
                  color: amount === q ? "var(--primary)" : "var(--ink)",
                }}
              >
                {q === 0 ? "Sin fondo" : money(q)}
              </button>
            ))}
          </div>
        </div>

        <Btn kind="primary" size="lg" full icon="unlock" onClick={() => onOpen(amount)}>
          Abrir caja {amount > 0 ? "· " + money(amount) : ""}
        </Btn>
      </div>
    </div>
  );
}
