/* FUWA POS — comprobante del cliente + comanda imprimible para cocina. */
import { Icon } from "../components/Icon.jsx";
import { Mascot } from "../components/Mascot.jsx";
import { Btn } from "../components/ui.jsx";
import { money, lineTotal } from "../lib/format.js";

function TRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, color: "var(--muted)", padding: "2px 0" }}>
      <span>{label}</span>
      <span style={{ fontWeight: 700, color: "var(--ink)" }}>{value}</span>
    </div>
  );
}

// Descripción corta de los modificadores de una línea (sin azúcar 100% redundante).
function lineSub(l) {
  return [l.size && l.size.name, ...(l.mods || []).filter((m) => !(m.group === "azucar" && m.name === "100%")).map((m) => m.name)].filter(Boolean).join(", ");
}

/* Un recibo o comanda solo muestra las líneas vivas. Las anuladas se conservan
   en la orden como rastro de auditoría, pero el papel que ve el cliente ya las
   excluye (server/tickets.js) y la pantalla tenía que decir lo mismo: si no, el
   recibo lista productos que no están en el total y la cuenta no cuadra. */
const vivas = (order) => (order.lines || []).filter((l) => !l.voided);

// ---------- Comanda de cocina (sin precios) ----------
function KitchenComanda({ order }) {
  return (
    <div className="fuwa-comanda" style={{ width: 320, background: "#fff", padding: "22px 24px 26px", color: "#000" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid #000", paddingBottom: 8 }}>
        <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 22 }}>COMANDA</div>
        <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 22 }}>#{order.number}{order.pending ? "·P" : ""}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800, margin: "10px 0 4px" }}>
        <span style={{ textTransform: "uppercase" }}>{order.orderType === "Aquí" ? "🍽️ PARA AQUÍ" : "🥡 PARA LLEVAR"}</span>
        <span>{order.time}</span>
      </div>
      {/* Mesa destino: grande, es lo primero que busca quien lleva el pedido. */}
      {order.table && (
        <div style={{ border: "3px solid #000", borderRadius: 8, textAlign: "center", padding: "6px 8px", margin: "8px 0 4px" }}>
          <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 26, lineHeight: 1.1 }}>MESA {order.table.label}</div>
          <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>{order.table.areaName}</div>
        </div>
      )}
      <div style={{ fontSize: 13, marginBottom: 12 }}>Atendió: {order.cashier || "Barista"}</div>

      <div style={{ borderTop: "2px dashed #000", paddingTop: 10 }}>
        {vivas(order).map((l) => {
          const sub = lineSub(l);
          return (
            <div key={l.uid} style={{ marginBottom: 12, borderBottom: "1px dashed #aaa", paddingBottom: 8 }}>
              <div style={{ display: "flex", gap: 8, fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>
                <span style={{ minWidth: 28 }}>{l.qty}×</span>
                <span>{l.name}</span>
              </div>
              {sub && <div style={{ fontSize: 14, paddingLeft: 36, marginTop: 2 }}>{sub}</div>}
              {l.note && <div style={{ fontSize: 14, fontWeight: 800, paddingLeft: 36, marginTop: 3 }}>⚠ {l.note}</div>}
            </div>
          );
        })}
      </div>
      <div style={{ textAlign: "center", marginTop: 8, fontSize: 12 }}>FUWA · {vivas(order).reduce((s, l) => s + l.qty, 0)} productos</div>
    </div>
  );
}

// Dispara la impresión marcando qué documento mostrar vía data-print en <body>.
// onDone (opcional) se llama al terminar, para limpiar estado (p. ej. reimpresión).
export function printDoc(which, onDone) {
  document.body.setAttribute("data-print", which);
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    document.body.removeAttribute("data-print");
    window.removeEventListener("afterprint", cleanup);
    if (onDone) onDone();
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
  setTimeout(cleanup, 1500);
}

// ---------- Ticket del cliente (presentacional, reutilizable) ----------
export function ReceiptTicket({ order }) {
  const split = order.payment.split;
  return (
    <div className="fuwa-ticket" style={{ width: 340, background: "#fff", borderRadius: 18, padding: "26px 26px 30px", boxShadow: "0 20px 50px -22px rgba(40,44,60,.4)", position: "relative" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, paddingBottom: 16, borderBottom: "2px dashed var(--line)" }}>
        <Mascot size={42} />
        <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 22, color: "var(--navy)", letterSpacing: 1 }}>FUWA</div>
        <div style={{ fontFamily: "var(--jp)", fontSize: 11, color: "var(--gold)", letterSpacing: 2 }}>日本のコーヒー</div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted)", padding: "14px 0 4px" }}>
        <span>
          {/* ·P = número provisional (sin conexión): el server asigna el final al sincronizar */}
          Orden <b style={{ color: "var(--navy)" }}>#{order.number}{order.pending ? "·P" : ""}</b>
        </span>
        <span>{order.time}</span>
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
        {order.orderType}
        {order.table ? ` · Mesa ${order.table.label} (${order.table.areaName})` : ""} · Atendió: {order.cashier || "Barista"}
      </div>

      <div style={{ borderTop: "2px dashed var(--line)", paddingTop: 12 }}>
        {vivas(order).map((l) => {
          const sub = lineSub(l);
          return (
            <div key={l.uid} style={{ marginBottom: 9 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
                <span>
                  {l.qty}× {l.name}
                </span>
                <span>{money(lineTotal(l))}</span>
              </div>
              {sub && <div style={{ fontSize: 11.5, color: "var(--muted)", paddingLeft: 14 }}>{sub}</div>}
              {l.note && <div style={{ fontSize: 11.5, color: "var(--gold)", paddingLeft: 14, fontStyle: "italic" }}>“{l.note}”</div>}
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: "2px dashed var(--line)", marginTop: 8, paddingTop: 12 }}>
        <TRow label="Subtotal" value={money(order.payment.subtotal)} />
        {order.payment.tip > 0 && <TRow label={"Propina"} value={money(order.payment.tip)} />}
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 17, color: "var(--navy)", margin: "6px 0" }}>
          <span>TOTAL</span>
          <span>{money(order.payment.total)}</span>
        </div>
        {split ? (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--navy)", marginBottom: 4 }}>Pago dividido</div>
            {order.payment.parts.map((p, i) => (
              <div key={i} style={{ marginBottom: 4 }}>
                <TRow label={`Persona ${i + 1} · ${p.method === "efectivo" ? "Efectivo" : "Tarjeta"}`} value={money(p.total)} />
                {p.method === "efectivo" && p.change > 0 && <TRow label="  Cambio" value={money(p.change)} />}
              </div>
            ))}
          </div>
        ) : (
          <>
            <TRow label={order.payment.method === "efectivo" ? "Efectivo" : "Tarjeta"} value={money(order.payment.received)} />
            {order.payment.method === "efectivo" && <TRow label="Cambio" value={money(order.payment.change)} />}
          </>
        )}
      </div>

      <div style={{ textAlign: "center", marginTop: 18, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
        ¡Gracias por tu visita! 🤍
        <br />
        ふわふわ — suave como una nube
      </div>
    </div>
  );
}

// Documentos imprimibles fuera de pantalla (recibo + comanda), para reimprimir
// una orden vieja desde Historial. Ocultos salvo al imprimir (.fuwa-printsrc).
export function PrintDocs({ order }) {
  if (!order) return null;
  return (
    <div className="fuwa-printsrc" aria-hidden="true">
      <ReceiptTicket order={order} />
      <KitchenComanda order={order} />
    </div>
  );
}

export function Receipt({ order, onNew }) {
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, overflowY: "auto" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ width: 70, height: 70, borderRadius: 999, background: "var(--primary-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary)" }}>
            <Icon name="check" size={40} stroke={2.6} />
          </div>
          <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 26, color: "var(--navy)" }}>¡Pago recibido!</div>
          <div style={{ color: "var(--muted)", fontSize: 15 }}>Entrega el comprobante al cliente e imprime la comanda para cocina.</div>
        </div>

        {/* ticket cliente */}
        <ReceiptTicket order={order} />

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <Btn kind="dark" size="md" icon="print" onClick={() => printDoc("kitchen")}>
            Comanda cocina
          </Btn>
          <Btn kind="ghost" size="md" icon="print" onClick={() => printDoc("receipt")}>
            Imprimir recibo
          </Btn>
          <Btn kind="primary" size="md" icon="plus" onClick={onNew}>
            Nueva orden
          </Btn>
        </div>
      </div>

      {/* Comanda de cocina: oculta en pantalla (CSS), solo visible al imprimir. */}
      <KitchenComanda order={order} />
    </div>
  );
}
