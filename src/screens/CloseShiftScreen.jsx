/* FUWA POS — cierre de caja: arqueo de efectivo, disponible para cualquier rol con turno abierto.

   El arqueo cuenta SOLO efectivo. Los cobros con tarjeta se muestran aparte
   porque no hay billetes que contar por ellos: mezclarlos haría aparecer
   faltantes que no existen.

   La nota de cierre resuelve el traspaso de turno: al cerrar se llevan los
   billetes grandes al banco y queda solo sencillo, así que quien abra después
   necesita saber por escrito con cuánto se queda y por qué. */
import { useState } from "react";
import { Btn } from "../components/ui.jsx";
import { Icon } from "../components/Icon.jsx";
import { money, cashFromOrders, cardFromOrders, cashMovesFromExpenses } from "../lib/format.js";

function Row({ label, value, strong, tone }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "4px 0", color: strong ? "var(--navy)" : "var(--muted)" }}>
      <span style={{ fontWeight: strong ? 800 : 400 }}>{label}</span>
      <span style={{ fontWeight: 800, color: tone || "var(--ink)" }}>{value}</span>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "13px 16px",
  border: "2px solid var(--line)",
  borderRadius: 14,
  fontFamily: "var(--display)",
  fontSize: 22,
  fontWeight: 800,
  color: "var(--navy)",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle = { fontSize: 12, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 };

export function CloseShiftScreen({ shiftOpen, openingCash, orders, expenses, onCloseShift }) {
  const [counted, setCounted] = useState("");
  const [cashLeft, setCashLeft] = useState("");
  const [note, setNote] = useState("");

  if (!shiftOpen) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" }}>
        <div style={{ color: "var(--muted)", fontSize: 16, maxWidth: 360 }}>No hay un turno abierto para cerrar. Abre la caja desde Orden para empezar a cobrar.</div>
      </div>
    );
  }

  const validOrders = orders.filter((o) => !o.voided);
  const cashSales = cashFromOrders(orders);
  const cardSales = cardFromOrders(orders);
  const { cashExpenses, cashIn } = cashMovesFromExpenses(expenses);
  const expected = openingCash + cashSales + cashIn - cashExpenses;
  const diff = (parseFloat(counted) || 0) - expected;
  const ok = Math.abs(diff) < 0.01;

  return (
    <div style={{ height: "100%", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 40, overflowY: "auto" }}>
      <div style={{ width: "100%", maxWidth: 460 }}>
        <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 28, color: "var(--navy)", margin: "0 0 4px" }}>Cierre de caja</h1>
        <p style={{ color: "var(--muted)", margin: "0 0 22px", fontSize: 15 }}>{validOrders.length} órdenes cobradas en este turno. Cuenta el efectivo de la caja antes de cerrar.</p>

        <div style={{ background: "#fff", border: "2px solid var(--line)", borderRadius: "var(--r)", padding: "20px 22px" }}>
          <Row label="Fondo de apertura" value={money(openingCash)} />
          <Row label="+ Ventas en efectivo" value={money(cashSales)} />
          {cashIn > 0 && <Row label="+ Entradas de dinero" value={money(cashIn)} />}
          {cashExpenses > 0 && <Row label="− Gastos en efectivo" value={money(cashExpenses)} />}
          <div style={{ borderTop: "1.5px dashed var(--line)", marginTop: 6, paddingTop: 8 }}>
            <Row label="Efectivo esperado" value={money(expected)} strong />
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={labelStyle}>Efectivo contado en caja</div>
            <input
              value={counted}
              onChange={(e) => setCounted(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder="Q0.00"
              autoFocus
              style={inputStyle}
            />
          </div>

          {counted !== "" && (
            <div style={{ marginTop: 14, padding: "12px 16px", borderRadius: 14, background: ok ? "var(--primary-soft)" : "oklch(0.94 0.05 25)", display: "flex", justifyContent: "space-between", fontWeight: 800, color: ok ? "var(--primary)" : "oklch(0.5 0.16 25)" }}>
              <span>{ok ? "Caja cuadrada ✓" : diff > 0 ? "Sobrante" : "Faltante"}</span>
              <span>{money(Math.abs(diff))}</span>
            </div>
          )}
        </div>

        {/* Tarjeta: fuera del arqueo a propósito. Va aquí para cuadrar contra el
            voucher del datáfono sin ensuciar la cuenta del efectivo. */}
        <div style={{ background: "#fff", border: "2px solid var(--line)", borderRadius: "var(--r)", padding: "16px 22px", marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Icon name="card" size={17} color="var(--muted)" />
            <span style={{ ...labelStyle, marginBottom: 0 }}>Cobros con tarjeta</span>
          </div>
          <Row label="Total cobrado con tarjeta" value={money(cardSales)} strong />
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.45 }}>
            No entra en el efectivo esperado: es solo para cuadrar contra el datáfono.
          </div>
        </div>

        {/* Traspaso al siguiente turno. */}
        <div style={{ background: "#fff", border: "2px solid var(--line)", borderRadius: "var(--r)", padding: "18px 22px", marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Icon name="note" size={17} color="var(--muted)" />
            <span style={{ ...labelStyle, marginBottom: 0 }}>Para el siguiente turno</span>
          </div>

          <div style={labelStyle}>Efectivo que queda en caja (opcional)</div>
          <input
            value={cashLeft}
            onChange={(e) => setCashLeft(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            placeholder="Q0.00"
            style={{ ...inputStyle, fontSize: 19 }}
          />
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.45 }}>
            Lo que dejas en sencillo después de apartar los billetes para el banco. Se propone como fondo al abrir el siguiente turno.
          </div>

          <div style={{ ...labelStyle, marginTop: 16 }}>Nota (opcional)</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            rows={3}
            placeholder="Ej. Se dejaron Q300 en sencillo, el resto va al banco."
            style={{
              width: "100%", padding: "12px 14px", border: "2px solid var(--line)", borderRadius: 14,
              fontFamily: "var(--ui)", fontSize: 14.5, color: "var(--ink)", outline: "none",
              boxSizing: "border-box", resize: "vertical", lineHeight: 1.45,
            }}
          />
        </div>

        <div style={{ marginTop: 18, marginBottom: 20 }}>
          <Btn
            kind="dark"
            size="lg"
            full
            icon="check"
            disabled={counted === ""}
            onClick={() =>
              onCloseShift(parseFloat(counted) || 0, {
                closeNote: note.trim(),
                cashLeft: cashLeft === "" ? null : parseFloat(cashLeft) || 0,
              })
            }
          >
            Cerrar caja
          </Btn>
        </div>
      </div>
    </div>
  );
}
