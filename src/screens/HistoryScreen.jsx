/* FUWA POS — historial: órdenes del turno actual + turnos anteriores archivados. */
import { useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { money, lineTotal } from "../lib/format.js";

function payLabel(p) {
  if (p.split) return "Mixto";
  return p.method === "efectivo" ? "Efectivo" : "Tarjeta";
}

function OrderRow({ order: o, isOpen, onToggle, onVoid, onReprint }) {
  return (
    <div style={{ background: "#fff", border: "2px solid var(--line)", borderRadius: "var(--r)", overflow: "hidden", opacity: o.voided ? 0.6 : 1 }}>
      <button
        onClick={onToggle}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "var(--ui)" }}
      >
        <div style={{ width: 46, height: 46, borderRadius: 12, background: "var(--cream)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--navy)", flexShrink: 0 }}>
          <Icon name={o.payment.split ? "users" : o.payment.method === "efectivo" ? "cash" : "card"} size={22} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "var(--ink)", textDecoration: o.voided ? "line-through" : "none" }}>
            Orden #{o.number}{" "}
            <span style={{ fontWeight: 700, color: "var(--muted)", fontSize: 13.5 }}>
              · {o.orderType}
              {o.table ? ` · Mesa ${o.table.label} (${o.table.areaName})` : ""}
            </span>
            {o.voided && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, color: "oklch(0.55 0.16 25)", background: "oklch(0.94 0.05 25)", padding: "2px 8px", borderRadius: 999 }}>ANULADA</span>}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            {o.time} · {o.lines.filter((l) => !l.voided).reduce((s, l) => s + l.qty, 0)} productos · {payLabel(o.payment)}
            {o.cashier ? " · " + o.cashier : ""}
          </div>
        </div>
        <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 19, color: "var(--navy)" }}>{money(o.payment.total)}</div>
        <span style={{ color: "var(--muted)", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s ease" }}>
          <Icon name="back" size={20} style={{ transform: "scaleX(-1)" }} />
        </span>
      </button>
      {isOpen && (
        <div style={{ padding: "4px 20px 18px 82px", borderTop: "1.5px dashed var(--line)" }}>
          {o.voided && <div style={{ fontSize: 13, color: "oklch(0.5 0.16 25)", fontWeight: 800, marginBottom: 8 }}>Anulada{o.voidReason ? ": " + o.voidReason : ""}</div>}
          {o.lines.map((l) => {
            const sub = [l.size && l.size.name, ...(l.mods || []).filter((m) => !(m.group === "azucar" && m.name === "100%")).map((m) => m.name)].filter(Boolean).join(", ");
            return (
              /* Las líneas anuladas SÍ se muestran aquí —el historial es
                 auditoría— pero tachadas y sin contar en "N productos", para que
                 se vea por qué el total no cuadra con la lista. */
              <div key={l.uid} style={{ padding: "8px 0", borderBottom: "1px dashed var(--line)", opacity: l.voided ? 0.55 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14.5, fontWeight: 700, color: "var(--ink)", textDecoration: l.voided ? "line-through" : "none" }}>
                  <span>
                    {l.qty}× {l.name}
                  </span>
                  <span>{money(lineTotal(l))}</span>
                </div>
                {l.voided && <div style={{ fontSize: 12, fontWeight: 800, color: "oklch(0.55 0.16 25)" }}>Anulado{l.voidReason ? ": " + l.voidReason : ""}</div>}
                {sub && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{sub}</div>}
                {l.note && <div style={{ fontSize: 12.5, color: "var(--gold)", fontStyle: "italic" }}>“{l.note}”</div>}
              </div>
            );
          })}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, fontSize: 14, color: "var(--muted)", gap: 12, flexWrap: "wrap" }}>
            <span>
              {o.payment.split ? (
                <>
                  Pago dividido: {o.payment.parts.map((p, i) => `P${i + 1} ${p.method === "efectivo" ? "efectivo" : "tarjeta"} ${money(p.total)}`).join(" · ")}
                </>
              ) : (
                <>Pago: {o.payment.method === "efectivo" ? `Efectivo ${money(o.payment.received)} · cambio ${money(o.payment.change)}` : "Tarjeta"}</>
              )}
              {o.payment.tip > 0 && <span> · Propina {money(o.payment.tip)}</span>}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              {onReprint && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onReprint(o);
                  }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "2px solid var(--line)", color: "var(--navy)", borderRadius: 999, padding: "6px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "var(--ui)" }}
                >
                  <Icon name="print" size={15} /> Reimprimir
                </button>
              )}
              {onVoid && !o.voided && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onVoid(o);
                  }}
                  style={{ background: "none", border: "2px solid oklch(0.85 0.07 25)", color: "oklch(0.55 0.16 25)", borderRadius: 999, padding: "6px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "var(--ui)" }}
                >
                  Anular orden
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ShiftCard({ shift, isOpen, onToggle, openOrder, onToggleOrder, onReprint, onReopen }) {
  const validOrders = shift.orders.filter((o) => !o.voided);
  // Turnos compactados: solo conservan totales y arqueo, sin órdenes detalladas.
  const orderCount = shift.compacted ? shift.totals?.count || 0 : validOrders.length;
  const shiftTotal = shift.compacted ? shift.totals?.total || 0 : validOrders.reduce((s, o) => s + o.payment.total, 0);
  const ok = Math.abs(shift.diff) < 0.01;
  return (
    <div style={{ background: "#fff", border: "2px solid var(--line)", borderRadius: "var(--r)", overflow: "hidden" }}>
      <button
        onClick={onToggle}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "var(--ui)" }}
      >
        <div style={{ width: 46, height: 46, borderRadius: 12, background: "var(--cream)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--navy)", flexShrink: 0 }}>
          <Icon name="lock" size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "var(--ink)" }}>Turno cerrado · {shift.closedAtLabel}</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            {orderCount} órdenes{shift.cashExpenses > 0 ? ` · gastos ${money(shift.cashExpenses)}` : ""}
            {shift.cashIn > 0 ? ` · entradas ${money(shift.cashIn)}` : ""}
            {shift.cardSales > 0 ? ` · tarjeta ${money(shift.cardSales)}` : ""} · efectivo esperado {money(shift.expected)} · contado {money(shift.counted)}{" "}
            <span style={{ fontWeight: 800, color: ok ? "var(--primary)" : "oklch(0.5 0.16 25)" }}>{ok ? "(caja cuadrada)" : shift.diff > 0 ? `(sobrante ${money(shift.diff)})` : `(faltante ${money(-shift.diff)})`}</span>
          </div>
        </div>
        <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 19, color: "var(--navy)" }}>{money(shiftTotal)}</div>
        <span style={{ color: "var(--muted)", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s ease" }}>
          <Icon name="back" size={20} style={{ transform: "scaleX(-1)" }} />
        </span>
      </button>
      {isOpen && (
        <div style={{ padding: "0 20px 18px", borderTop: "1.5px dashed var(--line)", display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
          {shift.compacted && (
            <div style={{ paddingTop: 12, fontSize: 13.5, color: "var(--muted)", fontWeight: 700 }}>
              Turno antiguo compactado: se conservan los totales y el arqueo, pero ya no el detalle de cada orden.
            </div>
          )}
          {/* Lo que dejó escrito quien cerró: queda con el turno como registro. */}
          {shift.closeNote && (
            <div style={{ marginTop: 12, background: "oklch(0.97 0.03 85)", border: "2px solid oklch(0.9 0.05 85)", borderRadius: 12, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "oklch(0.45 0.1 70)", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 4 }}>Nota del cierre</div>
              <div style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.45 }}>{shift.closeNote}</div>
              {shift.cashLeft != null && (
                <div style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 700, marginTop: 4 }}>Efectivo dejado en caja: {money(shift.cashLeft)}</div>
              )}
            </div>
          )}
          {onReopen && !shift.compacted && (
            <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 12 }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReopen(shift.id);
                }}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "2px solid var(--line)", color: "var(--navy)", borderRadius: 999, padding: "7px 16px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "var(--ui)" }}
              >
                <Icon name="unlock" size={15} /> Reabrir turno para corregir
              </button>
            </div>
          )}
          {[...shift.orders].reverse().map((o) => (
            <OrderRow key={o.number} order={o} isOpen={openOrder === o.number} onToggle={() => onToggleOrder(o.number)} onReprint={onReprint} />
          ))}
        </div>
      )}
    </div>
  );
}

export function HistoryScreen({ orders, shiftHistory = [], onVoid, onReprint, onReopenShift }) {
  const [openOrder, setOpenOrder] = useState(null);
  const [openShift, setOpenShift] = useState(null);
  const [openShiftOrder, setOpenShiftOrder] = useState(null);
  const sorted = [...orders].reverse();
  const sortedShifts = [...shiftHistory].reverse();

  function handleVoid(o) {
    const reason = window.prompt(`Motivo de la anulación de la orden #${o.number} (opcional):`, "");
    if (reason === null) return;
    onVoid(o.number, reason.trim());
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: "22px 32px 14px", flexShrink: 0 }}>
        <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 28, color: "var(--navy)", margin: "0 0 4px" }}>Historial</h1>
        <p style={{ color: "var(--muted)", margin: 0, fontSize: 15 }}>{orders.length} órdenes en el turno actual · {shiftHistory.length} turnos archivados.</p>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 32px 32px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 760 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Turno actual</div>
            {sorted.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--muted)", padding: 50, fontSize: 16 }}>Todavía no hay órdenes en este turno.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {sorted.map((o) => (
                  <OrderRow key={o.number} order={o} isOpen={openOrder === o.number} onToggle={() => setOpenOrder(openOrder === o.number ? null : o.number)} onVoid={onVoid ? handleVoid : null} onReprint={onReprint} />
                ))}
              </div>
            )}
          </div>

          {sortedShifts.length > 0 && (
            <div>
              <div style={{ fontWeight: 800, fontSize: 13.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Turnos anteriores</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {sortedShifts.map((s) => (
                  <ShiftCard
                    key={s.id}
                    shift={s}
                    isOpen={openShift === s.id}
                    onToggle={() => {
                      setOpenShift(openShift === s.id ? null : s.id);
                      setOpenShiftOrder(null);
                    }}
                    openOrder={openShiftOrder}
                    onToggleOrder={(n) => setOpenShiftOrder(openShiftOrder === n ? null : n)}
                    onReprint={onReprint}
                    onReopen={onReopenShift}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
