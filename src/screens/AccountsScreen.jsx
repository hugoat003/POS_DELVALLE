/* FUWA POS — cuentas de mesa abiertas.

   Es la pantalla desde la que trabaja el mesero: ve el salón, cuáles mesas
   tienen cuenta viva y por cuánto van, y entra a cualquiera para agregarle
   items, enviarla a preparar o cobrarla.

   El mapa es el mismo de TablesEditor pero en modo lectura, para que la mesa 4
   esté en el mismo lugar en las dos pantallas. Una mesa con cuenta se pinta
   llena; una libre queda en el fondo crema de siempre. */
import { useEffect, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { Mascot } from "../components/Mascot.jsx";
import { Btn } from "../components/ui.jsx";
import { lineTotal } from "../lib/format.js";
import { activeLines, pendingLines } from "../lib/stations.js";

const money = (n) => "Q" + (Math.round(n * 100) / 100).toFixed(2);

export const cuentaTotal = (order) =>
  activeLines(order.lines).reduce((s, l) => s + lineTotal(l), 0);

// Minutos desde que se abrió: es la señal de una mesa olvidada.
const minutos = (order, ahora) => Math.max(0, Math.floor((ahora - (order.openedAt || order.ts)) / 60000));

function Mesa({ table, cuenta, ahora, onTap }) {
  const ocupada = !!cuenta;
  const porEnviar = ocupada && pendingLines(cuenta.lines).length > 0;
  return (
    <button
      onClick={() => onTap(table, cuenta)}
      style={{
        position: "absolute",
        left: table.x + "%",
        top: table.y + "%",
        transform: "translate(-50%,-50%)",
        width: 82,
        height: 82,
        borderRadius: 20,
        border: "2.5px solid " + (ocupada ? "var(--primary)" : "var(--line)"),
        background: ocupada ? "var(--primary)" : "var(--cream)",
        color: ocupada ? "#fff" : "var(--navy)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
        fontFamily: "var(--ui)",
        boxShadow: ocupada ? "0 10px 22px -10px rgba(58,65,88,.45)" : "0 2px 0 rgba(58,65,88,.06)",
        transition: "all .12s ease",
      }}
    >
      {/* Punto ámbar: tiene items que nadie ha mandado a preparar todavía. */}
      {porEnviar && (
        <span
          title="Tiene items sin enviar"
          style={{
            position: "absolute", top: -5, right: -5, width: 16, height: 16, borderRadius: 999,
            background: "oklch(0.72 0.16 70)", border: "2.5px solid #fff",
          }}
        />
      )}
      <span style={{ fontSize: 10, fontWeight: 800, opacity: 0.75, textTransform: "uppercase", letterSpacing: 0.5 }}>Mesa</span>
      <span style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 21, lineHeight: 1 }}>{table.label}</span>
      {ocupada && <span style={{ fontSize: 11, fontWeight: 800, opacity: 0.9 }}>{money(cuentaTotal(cuenta))}</span>}
      {ocupada && <span style={{ fontSize: 9.5, opacity: 0.7 }}>{minutos(cuenta, ahora)}m</span>}
    </button>
  );
}

/* Las cuentas para llevar no tienen mesa en el mapa, así que van en tarjetas
   aparte. Sin esto quedarían invisibles y nadie las cobraría. */
function SinMesa({ order, ahora, onTap }) {
  const porEnviar = pendingLines(order.lines).length > 0;
  return (
    <button
      onClick={() => onTap(null, order)}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
        borderRadius: "var(--r)", border: "2px solid var(--line)", background: "#fff",
        cursor: "pointer", fontFamily: "var(--ui)", textAlign: "left",
      }}
    >
      <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 17, color: "var(--navy)" }}>#{order.number}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--navy)" }}>{order.orderType}</div>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>{minutos(order, ahora)}m · {activeLines(order.lines).length} items</div>
      </div>
      {porEnviar && <span style={{ width: 10, height: 10, borderRadius: 999, background: "oklch(0.72 0.16 70)" }} />}
      <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 15, color: "var(--navy)" }}>{money(cuentaTotal(order))}</div>
    </button>
  );
}

export function AccountsScreen({ openOrders, areas, onAbrir, onNueva }) {
  const [ahora, setAhora] = useState(Date.now());
  const [areaId, setAreaId] = useState(areas[0] ? areas[0].id : null);

  // El reloj del "hace cuánto" avanza solo; no hace falta pedirle nada al server.
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const area = areas.find((a) => a.id === areaId) || areas[0];
  const porMesa = new Map();
  for (const o of openOrders) if (o.table && o.table.label) porMesa.set(o.table.label, o);
  const sinMesa = openOrders.filter((o) => !o.table);
  const totalAbierto = openOrders.reduce((s, o) => s + cuentaTotal(o), 0);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: 16, gap: 12, overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 21, color: "var(--navy)" }}>Cuentas abiertas</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
            {openOrders.length === 0
              ? "Ninguna mesa tiene cuenta ahora mismo"
              : `${openOrders.length} ${openOrders.length === 1 ? "cuenta" : "cuentas"} · ${money(totalAbierto)} sin cobrar`}
          </div>
        </div>
        <Btn icon="plus" onClick={() => onNueva(null)}>Cuenta para llevar</Btn>
      </div>

      {areas.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {areas.map((a) => (
            <button
              key={a.id}
              onClick={() => setAreaId(a.id)}
              style={{
                border: "2px solid " + (a.id === area.id ? "var(--primary)" : "var(--line)"),
                background: a.id === area.id ? "var(--primary-soft)" : "#fff",
                color: a.id === area.id ? "var(--primary)" : "var(--navy)",
                borderRadius: 999, padding: "6px 16px", fontWeight: 800, fontSize: 13,
                fontFamily: "var(--ui)", cursor: "pointer",
              }}
            >
              {a.name}
            </button>
          ))}
        </div>
      )}

      {area && (
        <div
          style={{
            position: "relative",
            minHeight: 340,
            borderRadius: "var(--r)",
            border: "2px dashed var(--line)",
            background:
              "repeating-linear-gradient(0deg, transparent, transparent 34px, rgba(58,65,88,.045) 34px, rgba(58,65,88,.045) 35px), repeating-linear-gradient(90deg, transparent, transparent 34px, rgba(58,65,88,.045) 34px, rgba(58,65,88,.045) 35px), #fff",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {area.tables.map((t) => (
            <Mesa key={t.id} table={t} cuenta={porMesa.get(t.label)} ahora={ahora} onTap={(tb, cta) => (cta ? onAbrir(cta) : onNueva({ ...tb, areaName: area.name }))} />
          ))}
        </div>
      )}

      {sinMesa.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Sin mesa
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {sinMesa.map((o) => (
              <SinMesa key={o.id} order={o} ahora={ahora} onTap={() => onAbrir(o)} />
            ))}
          </div>
        </div>
      )}

      {openOrders.length === 0 && (
        <div style={{ textAlign: "center", padding: "24px 16px", color: "var(--muted)" }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Mascot size={72} color="var(--line)" />
          </div>
          <div style={{ marginTop: 8, fontSize: 13.5 }}>
            Toca una mesa para abrirle cuenta. Lo que pidan se manda a preparar y se cobra al final.
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--muted)", paddingTop: 2 }}>
        <span style={{ width: 10, height: 10, borderRadius: 999, background: "oklch(0.72 0.16 70)", flexShrink: 0 }} />
        <span>El punto ámbar marca una cuenta con items que todavía no se han mandado a preparar.</span>
      </div>
    </div>
  );
}
