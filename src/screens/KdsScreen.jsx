/* FUWA POS — tablero de barra (KDS).

   Sustituye a la comandera impresa. Cada orden cobrada entra como ticket y
   recorre dos firmas distintas:

     pendiente → (barista: "Listo") → listo → (mesero: "Entregado") → fuera

   El segundo paso existe porque la mesa sigue en pantalla hasta que alguien
   recoge el pedido: si el ticket desapareciera al marcarlo listo, quien lleva
   el pedido perdería la referencia de a dónde va.

   No hay diálogo de confirmación a propósito: en barra ocupada un modal por
   comanda estorba más de lo que protege. El seguro es poder deshacer. */
import { useEffect, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { Mascot } from "../components/Mascot.jsx";
import { Btn } from "../components/ui.jsx";

// Gris hasta 5 min, ámbar hasta 10, rojo después: la señal de "esto ya urge".
function colorEspera(min) {
  if (min >= 10) return "oklch(0.55 0.16 25)";
  if (min >= 5) return "oklch(0.62 0.13 70)";
  return "var(--muted)";
}

function lineSub(l) {
  return [l.size && l.size.name, ...(l.mods || []).filter((m) => !(m.group === "azucar" && m.name === "100%")).map((m) => m.name)]
    .filter(Boolean)
    .join(", ");
}

function Ticket({ order, ahora, onAvanzar, onRetroceder }) {
  const listo = order.prepStatus === "listo";
  /* Se mide desde el ÚLTIMO envío, no desde que se abrió la cuenta: una mesa
     que lleva dos horas sentada mostraba en rojo una bebida recién pedida. */
  const min = Math.max(0, Math.floor((ahora - (order.sentAt || order.ts)) / 60000));
  const items = order.lines.reduce((s, l) => s + l.qty, 0);
  /* Una cuenta puede pedir varias rondas. Si en el tablero hay líneas de más de
     una tanda, se marca la última para que el barista sepa qué acaba de entrar
     y no rehaga lo que ya tenía a medias. */
  const rondas = new Set(order.lines.map((l) => l.sentSeq || 0));
  const marcarNuevas = rondas.size > 1;

  return (
    <div
      style={{
        background: "#fff",
        border: "2px solid " + (listo ? "var(--primary)" : "var(--line)"),
        borderRadius: "var(--r)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: listo ? "var(--primary-soft)" : "var(--cream)" }}>
        <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 22, color: "var(--navy)" }}>#{order.number}</div>
        <div style={{ flex: 1, fontSize: 12.5, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          {order.orderType === "Aquí" ? "Para aquí" : "Para llevar"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 800, fontSize: 13.5, color: colorEspera(min) }}>
          <Icon name="clock" size={15} />
          {min}m
        </div>
      </div>

      {/* Mesa en grande: es lo primero que busca quien recoge el pedido. */}
      {order.table ? (
        <div style={{ margin: "12px 16px 0", border: "2.5px solid var(--navy)", borderRadius: 12, textAlign: "center", padding: "8px 10px" }}>
          <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 24, color: "var(--navy)", lineHeight: 1.1 }}>MESA {order.table.label}</div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>{order.table.areaName}</div>
        </div>
      ) : (
        <div style={{ margin: "12px 16px 0", border: "2.5px dashed var(--line)", borderRadius: 12, textAlign: "center", padding: "8px 10px" }}>
          <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 18, color: "var(--gold)" }}>PARA LLEVAR</div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>Entregar en barra</div>
        </div>
      )}

      <div style={{ padding: "12px 16px", flex: 1 }}>
        {order.lines.map((l) => {
          const sub = lineSub(l);
          return (
            <div key={l.uid} style={{ padding: "7px 0", borderBottom: "1px dashed var(--line)" }}>
              <div style={{ display: "flex", gap: 8, fontSize: 16.5, fontWeight: 800, color: "var(--ink)", lineHeight: 1.25, alignItems: "baseline" }}>
                <span style={{ minWidth: 26, color: "var(--primary)" }}>{l.qty}×</span>
                <span style={{ flex: 1 }}>{l.name}</span>
                {marcarNuevas && (l.sentSeq || 0) === order.sendSeq && (
                  <span
                    style={{
                      flexShrink: 0, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5,
                      background: "oklch(0.72 0.16 70)", color: "#fff",
                      borderRadius: 999, padding: "2px 8px", textTransform: "uppercase",
                    }}
                  >
                    Nuevo
                  </span>
                )}
              </div>
              {sub && <div style={{ fontSize: 13, color: "var(--muted)", paddingLeft: 34 }}>{sub}</div>}
              {l.note && (
                <div style={{ fontSize: 13, fontWeight: 800, color: "oklch(0.5 0.16 25)", paddingLeft: 34, marginTop: 2 }}>⚠ {l.note}</div>
              )}
            </div>
          );
        })}
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
          {items} producto{items === 1 ? "" : "s"} · {order.time} · {order.cashier || "Barista"}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, padding: "0 16px 14px" }}>
        {listo && (
          <button
            onClick={onRetroceder}
            title="Volver a preparación"
            style={{
              width: 46, borderRadius: 12, cursor: "pointer", background: "#fff",
              border: "2px solid var(--line)", color: "var(--muted)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Icon name="back" size={18} />
          </button>
        )}
        <div style={{ flex: 1 }}>
          <Btn kind={listo ? "dark" : "primary"} size="lg" full icon="check" onClick={onAvanzar}>
            {listo ? "Entregado" : "Listo"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function Columna({ titulo, hint, tickets, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexShrink: 0 }}>
        <h2 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 19, color: "var(--navy)", margin: 0 }}>{titulo}</h2>
        <span style={{ fontWeight: 800, fontSize: 13, color: "var(--muted)" }}>{tickets}</span>
        {hint && <span style={{ fontSize: 12.5, color: "var(--muted)" }}>· {hint}</span>}
      </div>
      <div style={{ flex: 1, overflowY: "auto", paddingRight: 4, paddingBottom: 12 }}>{children}</div>
    </div>
  );
}

export function KdsScreen({ orders, shiftOpen, onSetPrep }) {
  // Un reloj propio: los tickets tienen que envejecer en pantalla aunque nadie
  // toque nada. El sync de datos va por su cuenta cada 4s.
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  // Último movimiento, para poder deshacer un toque equivocado. Se guarda el
  // estado ANTERIOR: deshacer es simplemente volver a él.
  const [ultimo, setUltimo] = useState(null);
  useEffect(() => {
    if (!ultimo) return;
    const id = setTimeout(() => setUltimo(null), 10000);
    return () => clearTimeout(id);
  }, [ultimo]);

  function mover(order, destino) {
    setUltimo({ id: order.id, number: order.number, desde: order.prepStatus || "pendiente", hacia: destino });
    onSetPrep(order.id, destino);
  }

  function deshacer() {
    if (!ultimo) return;
    onSetPrep(ultimo.id, ultimo.desde);
    setUltimo(null);
  }

  const activas = orders.filter((o) => !o.voided && (o.prepStatus || "pendiente") !== "entregado");
  const pendientes = activas.filter((o) => (o.prepStatus || "pendiente") === "pendiente");
  const listas = activas.filter((o) => o.prepStatus === "listo");

  if (!shiftOpen) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" }}>
        <div style={{ maxWidth: 380 }}>
          <Mascot size={90} />
          <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 22, color: "var(--navy)", marginTop: 14 }}>La caja está cerrada</div>
          <div style={{ color: "var(--muted)", fontSize: 15, marginTop: 6, lineHeight: 1.5 }}>
            Las comandas aparecen aquí en cuanto caja abra el turno y empiece a cobrar.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: "22px 32px 12px", flexShrink: 0 }}>
        <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 28, color: "var(--navy)", margin: "0 0 4px" }}>Barra</h1>
        <p style={{ color: "var(--muted)", margin: 0, fontSize: 15 }}>
          {activas.length === 0 ? "Todo al día: no hay comandas pendientes." : `${activas.length} comanda${activas.length === 1 ? "" : "s"} en curso.`}
        </p>
      </div>

      <div
        className="fuwa-split"
        style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, padding: "0 32px 12px", minHeight: 0 }}
      >
        <Columna titulo="En preparación" tickets={pendientes.length} hint="marca Listo al terminar">
          {pendientes.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 15, padding: "30px 0", textAlign: "center" }}>Nada pendiente por preparar.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14, alignItems: "start" }}>
              {pendientes.map((o) => (
                <Ticket key={o.id} order={o} ahora={ahora} onAvanzar={() => mover(o, "listo")} />
              ))}
            </div>
          )}
        </Columna>

        <Columna titulo="Listas para entregar" tickets={listas.length} hint="marca Entregado al recogerla">
          {listas.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 15, padding: "30px 0", textAlign: "center" }}>Nada listo para recoger.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14, alignItems: "start" }}>
              {listas.map((o) => (
                <Ticket
                  key={o.id}
                  order={o}
                  ahora={ahora}
                  onAvanzar={() => mover(o, "entregado")}
                  onRetroceder={() => mover(o, "pendiente")}
                />
              ))}
            </div>
          )}
        </Columna>
      </div>

      {/* Deshacer: el seguro contra el toque equivocado, sin frenar el ritmo. */}
      {ultimo && (
        <div style={{ flexShrink: 0, padding: "0 32px 18px", display: "flex", justifyContent: "center" }}>
          <div
            style={{
              display: "flex", alignItems: "center", gap: 14,
              background: "var(--navy)", color: "#fff",
              borderRadius: 999, padding: "10px 12px 10px 20px",
              boxShadow: "0 18px 40px -18px rgba(40,44,60,.6)",
            }}
          >
            <span style={{ fontWeight: 800, fontSize: 14 }}>
              Orden #{ultimo.number} · {ultimo.hacia === "entregado" ? "entregada" : ultimo.hacia === "listo" ? "lista" : "de vuelta a preparación"}
            </span>
            <button
              onClick={deshacer}
              style={{
                background: "rgba(255,255,255,.16)", border: "none", color: "#fff",
                borderRadius: 999, padding: "7px 16px", fontWeight: 800, fontSize: 13.5,
                cursor: "pointer", fontFamily: "var(--ui)",
              }}
            >
              Deshacer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
