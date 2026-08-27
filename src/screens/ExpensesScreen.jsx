/* FUWA POS — movimientos de dinero del turno.

   Dos tipos: SALIDAS (compras y pagos, lo tradicional) y ENTRADAS (dinero que
   entra a la caja aparte de las ventas: un aporte del dueño, un reembolso, un
   cambio traído de otro lado).

   El monto siempre se guarda positivo; el signo lo da `kind`. Guardar entradas
   como montos negativos habría roto todas las sumas que ya existen. */
import { useEffect, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { Btn } from "../components/ui.jsx";
import { money } from "../lib/format.js";

const VERDE = "oklch(0.5 0.11 150)";
const VERDE_SUAVE = "oklch(0.95 0.05 150)";

function KindPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, background: "var(--cream)", padding: 5, borderRadius: 999, marginBottom: 2 }}>
      {[
        { id: "salida", label: "Salida", hint: "Sale dinero" },
        { id: "entrada", label: "Entrada", hint: "Entra dinero" },
      ].map((k) => {
        const active = value === k.id;
        const tone = k.id === "entrada" ? VERDE : "var(--primary)";
        return (
          <button
            key={k.id}
            onClick={() => onChange(k.id)}
            title={k.hint}
            style={{
              flex: 1,
              padding: "9px 14px",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--ui)",
              fontWeight: 800,
              fontSize: 14,
              background: active ? "#fff" : "transparent",
              color: active ? tone : "var(--muted)",
              boxShadow: active ? "0 2px 8px -2px rgba(40,44,60,.25)" : "none",
              transition: "all .12s ease",
            }}
          >
            {k.label}
          </button>
        );
      })}
    </div>
  );
}

function MethodPicker({ value, onChange, disabledCash }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {[
        { id: "efectivo", icon: "cash", label: "Efectivo (caja)" },
        { id: "otro", icon: "card", label: "Otro" },
      ].map((m) => {
        const disabled = m.id === "efectivo" && disabledCash;
        return (
          <button
            key={m.id}
            onClick={() => !disabled && onChange(m.id)}
            disabled={disabled}
            title={disabled ? "El monto supera el efectivo disponible en caja" : undefined}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 12,
              cursor: disabled ? "not-allowed" : "pointer",
              fontFamily: "var(--ui)",
              border: "2px solid " + (value === m.id ? "var(--primary)" : "var(--line)"),
              background: value === m.id ? "var(--primary-soft)" : "#fff",
              color: value === m.id ? "var(--primary)" : "var(--ink)",
              opacity: disabled ? 0.4 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontWeight: 800,
              fontSize: 14,
              transition: "all .12s ease",
            }}
          >
            <Icon name={m.icon} size={17} />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

export function ExpensesScreen({ expenses, onAdd, onRemove, availableCash = 0 }) {
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("efectivo");
  const [kind, setKind] = useState("salida");

  const esEntrada = kind === "entrada";
  const amountNum = parseFloat(amount) || 0;
  // El tope de efectivo solo aplica a las salidas: una entrada nunca puede
  // dejar la caja en negativo, la llena.
  const exceedsCash = !esEntrada && amountNum > 0 && amountNum > availableCash + 0.001;
  const valid = concept.trim().length > 0 && amountNum > 0;
  const sorted = [...expenses].reverse();

  const salidas = expenses.filter((e) => (e.kind || "salida") !== "entrada");
  const entradas = expenses.filter((e) => (e.kind || "salida") === "entrada");
  const total = salidas.reduce((s, e) => s + e.amount, 0);
  const totalCash = salidas.filter((e) => e.method === "efectivo").reduce((s, e) => s + e.amount, 0);
  const totalEntradas = entradas.reduce((s, e) => s + e.amount, 0);

  // Si el monto supera el efectivo disponible en caja, no se puede marcar
  // como "Efectivo" — se cambia automáticamente a "Otro" para no dejar la
  // caja en negativo.
  useEffect(() => {
    if (exceedsCash && method === "efectivo") setMethod("otro");
  }, [exceedsCash, method]);

  function handleMethodChange(m) {
    if (m === "efectivo" && exceedsCash) return;
    setMethod(m);
  }

  function submit() {
    if (!valid) return;
    onAdd(concept.trim(), Math.round(amountNum * 100) / 100, exceedsCash ? "otro" : method, kind);
    setConcept("");
    setAmount("");
    setMethod("efectivo");
    setKind("salida");
  }

  return (
    <div className="fuwa-split" style={{ height: "100%", display: "grid", gridTemplateColumns: "1fr 380px", minHeight: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0, borderRight: "2px solid var(--line)" }}>
        <div style={{ padding: "22px 32px 14px", flexShrink: 0 }}>
          <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 28, color: "var(--navy)", margin: "0 0 4px" }}>Gastos y movimientos</h1>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: 15 }}>
            Compras y pagos del turno, y también el dinero que entra a caja aparte de las ventas. Se archiva junto con el turno al cerrar caja.
          </p>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 32px 32px" }}>
          {sorted.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--muted)", padding: 60, fontSize: 16 }}>Aún no hay movimientos registrados en este turno.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 640 }}>
              {sorted.map((e) => {
                const entrada = (e.kind || "salida") === "entrada";
                return (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", border: "2px solid " + (entrada ? "oklch(0.88 0.06 150)" : "var(--line)"), borderRadius: "var(--r)", padding: "14px 16px" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: entrada ? VERDE_SUAVE : "var(--cream)", display: "flex", alignItems: "center", justifyContent: "center", color: entrada ? VERDE : "var(--navy)", flexShrink: 0 }}>
                    <Icon name={entrada ? "plus" : e.method === "efectivo" ? "cash" : "card"} size={18} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: "var(--ink)" }}>{e.concept}</div>
                    <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                      {new Date(e.ts).toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" })} · {entrada ? "Entrada" : "Salida"} · {e.method === "efectivo" ? "Efectivo" : "Otro"} · {e.registeredBy}
                    </div>
                  </div>
                  <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 17, color: entrada ? VERDE : "var(--navy)" }}>
                    {entrada ? "+" : "−"}{money(e.amount)}
                  </div>
                  <button onClick={() => onRemove(e.id)} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", display: "flex", padding: 4 }}>
                    <Icon name="trash" size={17} />
                  </button>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div style={{ background: "#fff", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ padding: "24px 26px", flex: 1, overflowY: "auto" }}>
          <div style={{ fontWeight: 800, fontSize: 13.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>Nuevo movimiento</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <KindPicker value={kind} onChange={setKind} />
            <input
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder={esEntrada ? "Concepto · ej. Aporte, reembolso, cambio…" : "Concepto · ej. Hielo, leche, gas…"}
              style={{ width: "100%", padding: "12px 14px", border: "2px solid var(--line)", borderRadius: 12, fontFamily: "var(--ui)", fontSize: 15, color: "var(--ink)", outline: "none", boxSizing: "border-box" }}
            />
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontFamily: "var(--display)", fontWeight: 800, fontSize: 18 }}>Q</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                placeholder="0.00"
                style={{ width: "100%", padding: "12px 14px 12px 34px", border: "2px solid var(--line)", borderRadius: 12, fontFamily: "var(--display)", fontSize: 18, fontWeight: 800, color: "var(--navy)", outline: "none", boxSizing: "border-box" }}
              />
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6 }}>Efectivo disponible en caja: {money(Math.max(0, availableCash))}</div>
            </div>
            {esEntrada && (
              <div style={{ fontSize: 13, color: "var(--muted)", background: VERDE_SUAVE, borderRadius: 10, padding: "8px 12px", lineHeight: 1.4 }}>
                Dinero que <b>entra</b> a caja sin ser una venta. Suma al efectivo esperado del cierre, pero no cuenta como ingreso en los reportes.
              </div>
            )}
            {exceedsCash && (
              <div style={{ fontSize: 13, fontWeight: 700, color: "oklch(0.5 0.16 25)", background: "oklch(0.94 0.05 25)", borderRadius: 10, padding: "8px 12px", lineHeight: 1.4 }}>
                El monto supera el efectivo disponible en caja — se registrará como "Otro" en vez de Efectivo.
              </div>
            )}
            <MethodPicker value={method} onChange={handleMethodChange} disabledCash={exceedsCash} />
            <Btn kind="primary" size="lg" full disabled={!valid} onClick={submit} icon="plus">
              {esEntrada ? "Registrar entrada" : "Registrar gasto"}
            </Btn>
          </div>
        </div>
        <div style={{ padding: "18px 26px 24px", borderTop: "2px solid var(--line)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--muted)", padding: "4px 0" }}>
            <span>Gastos en efectivo</span>
            <span style={{ fontWeight: 800, color: "var(--ink)" }}>{money(totalCash)}</span>
          </div>
          {totalEntradas > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--muted)", padding: "4px 0" }}>
              <span>Entradas de dinero</span>
              <span style={{ fontWeight: 800, color: VERDE }}>+{money(totalEntradas)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 6 }}>
            <span style={{ fontWeight: 800, fontSize: 16, color: "var(--navy)" }}>Gastos del turno</span>
            <span style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 24, color: "var(--navy)" }}>{money(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
