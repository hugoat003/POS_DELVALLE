/* Café del Valle POS — tablero de barra (KDS).

   Sustituye a la comandera impresa. Cada orden cobrada entra como ticket y
   recorre dos firmas distintas:

     pendiente → (barista: "Listo") → listo → (mesero: "Entregado") → fuera

   El segundo paso existe porque la mesa sigue en pantalla hasta que alguien
   recoge el pedido: si el ticket desapareciera al marcarlo listo, quien lleva
   el pedido perdería la referencia de a dónde va.

   No hay diálogo de confirmación a propósito: en barra ocupada un modal por
   comanda estorba más de lo que protege. El seguro es poder deshacer.

   Teclado numérico (la pantalla del barista está a unos metros y con las manos
   ocupadas, sin tocarla):

     Enter   avanza la comanda resaltada un paso: Listo, y otro Enter, Entregado.
     + / −   cambia la comanda resaltada (de la más antigua a la más nueva).
     .       deshace el último movimiento.

   Sin tocar nada, la comanda resaltada es la MÁS ANTIGUA: se atiende en orden de
   llegada. Tras marcar Listo el resaltado se queda en esa comanda, así el
   segundo Enter la entrega; al entregarla, salta a la siguiente más antigua. */
import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { Logo } from "../components/Mascot.jsx";
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

function Ticket({ order, ahora, enFoco, onAvanzar, onRetroceder }) {
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
      data-kds-foco={enFoco ? "1" : undefined}
      style={{
        background: "#fff",
        border: "1px solid " + (listo ? "var(--primary)" : "var(--line)"),
        // El resaltado del teclado es un contorno grueso: se ve desde lejos y,
        // al ser outline, no mueve el diseño de la rejilla.
        outline: enFoco ? "4px solid var(--navy)" : "none",
        outlineOffset: 2,
        borderRadius: "var(--r)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: listo ? "var(--primary-soft)" : "var(--cream)" }}>
        <div style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 25, letterSpacing: "-.01em", color: "var(--tinta)"}}>#{order.number}</div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {order.orderType === "Aquí" ? "Para aquí" : "Para llevar"}
        </div>
        {enFoco && (
          <span style={{ flexShrink: 0, whiteSpace: "nowrap", background: "var(--navy)", color: "#fff", borderRadius: 8, padding: "3px 9px", fontSize: 12, fontWeight: 700, letterSpacing: 0.3 }}>
            ⏎ {listo ? "Entregado" : "Listo"}
          </span>
        )}
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, fontWeight: 700, fontSize: 13.5, color: colorEspera(min) }}>
          <Icon name="clock" size={15} />
          {min}m
        </div>
      </div>

      {/* Mesa en grande: es lo primero que busca quien recoge el pedido. */}
      {order.table ? (
        <div style={{ margin: "12px 16px 0", border: "2.5px solid var(--navy)", borderRadius: 12, textAlign: "center", padding: "8px 10px" }}>
          <div style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 27, letterSpacing: "-.01em", color: "var(--tinta)", lineHeight: 1.1 }}>MESA {order.table.label}</div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>{order.table.areaName}</div>
        </div>
      ) : (
        <div style={{ margin: "12px 16px 0", border: "2.5px dashed var(--line)", borderRadius: 12, textAlign: "center", padding: "8px 10px" }}>
          <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 18, color: "var(--gold)" }}>PARA LLEVAR</div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>Entregar en barra</div>
        </div>
      )}

      <div style={{ padding: "12px 16px", flex: 1 }}>
        {order.lines.map((l) => {
          const sub = lineSub(l);
          return (
            <div key={l.uid} style={{ padding: "7px 0", borderBottom: "1px dashed var(--line)" }}>
              <div style={{ display: "flex", gap: 8, fontSize: 16.5, fontWeight: 700, color: "var(--ink)", lineHeight: 1.25, alignItems: "baseline" }}>
                <span style={{ minWidth: 26, color: "var(--primary)" }}>{l.qty}×</span>
                <span style={{ flex: 1 }}>{l.name}</span>
                {marcarNuevas && (l.sentSeq || 0) === order.sendSeq && (
                  <span
                    style={{
                      flexShrink: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5,
                      background: "oklch(0.72 0.16 70)", color: "#fff",
                      borderRadius: 999, padding: "2px 8px", textTransform: "uppercase",
                    }}
                  >
                    Nuevo
                  </span>
                )}
              </div>
              {/* Extra desviado desde otro plato: sin este renglón el barista ve
                  un "Café" suelto y no sabe a qué mesa ni a qué platillo va. */}
              {l.desdeLinea && (
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--cafe)", paddingLeft: 34, marginTop: 1 }}>
                  {/* Cuando el extra lleva el nombre del platillo (combos) repetirlo
                      leería "Combo N.1 · del Combo N.1". */}
                  {l.desdeLinea === l.name ? "bebida incluida" : `del ${l.desdeLinea}`}
                </div>
              )}
              {sub && <div style={{ fontSize: 13, color: "var(--muted)", paddingLeft: 34 }}>{sub}</div>}
              {l.note && (
                <div style={{ fontSize: 13, fontWeight: 700, color: "oklch(0.5 0.16 25)", paddingLeft: 34, marginTop: 2 }}>⚠ {l.note}</div>
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
              border: "1px solid var(--line)", color: "var(--muted)",
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
        <h2 style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 19, color: "var(--navy)", margin: 0 }}>{titulo}</h2>
        <span style={{ fontWeight: 700, fontSize: 13, color: "var(--muted)" }}>{tickets}</span>
        {hint && <span style={{ fontSize: 12.5, color: "var(--muted)" }}>· {hint}</span>}
      </div>
      {/* 8px de colchón: el contorno del ticket resaltado (4px + 2px de separación)
          se dibuja FUERA de la tarjeta y el contenedor con scroll lo recortaba. */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px 12px" }}>{children}</div>
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

  // De la más antigua a la más nueva: es el orden de atención y el del teclado.
  const antiguedad = (o) => o.sentAt || o.ts;
  const activas = orders
    .filter((o) => !o.voided && (o.prepStatus || "pendiente") !== "entregado")
    .sort((a, b) => antiguedad(a) - antiguedad(b));
  const pendientes = activas.filter((o) => (o.prepStatus || "pendiente") === "pendiente");
  const listas = activas.filter((o) => o.prepStatus === "listo");

  /* Comanda resaltada para el teclado. Se guarda el id y no el objeto: el objeto
     cambia en cada sync. Si ese id ya no está (se entregó, se anuló), cae en la
     más antigua. */
  const [foco, setFoco] = useState(null);
  const enFoco = activas.find((o) => o.id === foco) || activas[0] || null;

  // El manejador se registra una sola vez y lee siempre lo último desde aquí:
  // si se re-registrara en cada render, una pulsación entre dos renders se perdería.
  const teclas = useRef(null);
  teclas.current = { activas, enFoco, mover, deshacer, setFoco, shiftOpen };
  useEffect(() => {
    function onKey(e) {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      const t = e.target;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      const { activas, enFoco, mover, deshacer, setFoco, shiftOpen } = teclas.current;
      if (!shiftOpen) return;

      if (e.key === "Enter") {
        // preventDefault: si un botón quedó con el foco tras un toque, Enter
        // también lo pulsaría y la comanda avanzaría dos pasos de un solo golpe.
        e.preventDefault();
        if (!enFoco) return;
        const listo = enFoco.prepStatus === "listo";
        mover(enFoco, listo ? "entregado" : "listo");
        setFoco(listo ? null : enFoco.id); // entregada → salta a la más antigua
        return;
      }
      const paso =
        e.code === "NumpadAdd" || e.key === "+" || e.key === "ArrowRight" || e.key === "ArrowDown" ? 1
        : e.code === "NumpadSubtract" || e.key === "-" || e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1
        : 0;
      if (paso && activas.length) {
        e.preventDefault();
        const i = Math.max(0, activas.findIndex((o) => enFoco && o.id === enFoco.id));
        setFoco(activas[(i + paso + activas.length) % activas.length].id);
      } else if (e.code === "NumpadDecimal" || e.key === "." || e.key === "," || e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deshacer();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Con la pantalla a metros de distancia el resaltado tiene que seguir a la vista.
  const idFoco = enFoco ? enFoco.id : null;
  useEffect(() => {
    const el = document.querySelector('[data-kds-foco="1"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [idFoco, enFoco && enFoco.prepStatus]);

  if (!shiftOpen) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" }}>
        <div style={{ maxWidth: 380 }}>
          <Logo variant="mark" size={90} opacidad={0.3} />
          <div style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 25, letterSpacing: "-.01em", color: "var(--tinta)", marginTop: 14 }}>La caja está cerrada</div>
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
        <h1 style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 31, letterSpacing: "-.01em", color: "var(--tinta)", margin: "0 0 4px" }}>Barra</h1>
        <p style={{ color: "var(--muted)", margin: 0, fontSize: 15 }}>
          {activas.length === 0 ? "Todo al día: no hay comandas pendientes." : `${activas.length} comanda${activas.length === 1 ? "" : "s"} en curso.`}
        </p>
      </div>

      <div
        className="cdv-split cdv-kds"
        style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, padding: "0 32px 12px", minHeight: 0 }}
      >
        <Columna titulo="En preparación" tickets={pendientes.length} hint="marca Listo al terminar">
          {pendientes.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 15, padding: "30px 0", textAlign: "center" }}>Nada pendiente por preparar.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14, alignItems: "start" }}>
              {pendientes.map((o) => (
                <Ticket key={o.id} order={o} ahora={ahora} enFoco={o.id === idFoco} onAvanzar={() => mover(o, "listo")} />
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
                  enFoco={o.id === idFoco}
                  onAvanzar={() => mover(o, "entregado")}
                  onRetroceder={() => mover(o, "pendiente")}
                />
              ))}
            </div>
          )}
        </Columna>
      </div>

      {/* Leyenda del teclado numérico: fija, para que quien llegue a la barra por
          primera vez no tenga que preguntar qué hace cada tecla. */}
      <div style={{ flexShrink: 0, display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "6px 22px", padding: "0 32px 12px", fontSize: 13, color: "var(--muted)" }}>
        {[["Enter", "Listo → Entregado"], ["+ / −", "cambiar comanda"], [".", "deshacer"]].map(([tecla, txt]) => (
          <span key={tecla} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <kbd style={{ border: "1px solid var(--line)", borderBottomWidth: 2, borderRadius: 6, background: "#fff", padding: "1px 8px", fontFamily: "var(--ui)", fontWeight: 700, fontSize: 12.5, color: "var(--ink)" }}>{tecla}</kbd>
            {txt}
          </span>
        ))}
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
            <span style={{ fontWeight: 700, fontSize: 14 }}>
              Orden #{ultimo.number} · {ultimo.hacia === "entregado" ? "entregada" : ultimo.hacia === "listo" ? "lista" : "de vuelta a preparación"}
            </span>
            <button
              onClick={deshacer}
              style={{
                background: "rgba(255,255,255,.16)", border: "none", color: "#fff",
                borderRadius: 999, padding: "7px 16px", fontWeight: 700, fontSize: 13.5,
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
