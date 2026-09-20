/* Café del Valle POS — pantalla de orden: menú con búsqueda, carrito en vivo y modal. */
import { useMemo, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { Mascot } from "../components/Mascot.jsx";
import { Btn, Pill, qtyBtn, overlay, sheet } from "../components/ui.jsx";
import { activeLines } from "../lib/stations.js";
import { money, lineTotal } from "../lib/format.js";
import { CustomizeModal } from "./CustomizeModal.jsx";
import { TablePickerModal } from "./TablesEditor.jsx";
import { producibleUnits, shortagesFor } from "../lib/recipe.js";

// ---------- Tarjeta de producto ----------
function ProductCard({ product, cat, showEmoji, stockLeft, onClick }) {
  const [hover, setHover] = useState(false);
  // stockLeft: unidades que alcanzan con el inventario (Infinity = sin receta).
  const out = stockLeft === 0;
  const low = !out && stockLeft <= 5;
  return (
    <button
      className="cdv-card"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        textAlign: "left",
        background: "var(--superficie)",
        border: "1px solid var(--borde)",
        borderRadius: "var(--r)",
        padding: 0,
        cursor: "pointer",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transition: "transform .12s ease, box-shadow .12s ease, border-color .12s ease",
        transform: hover ? "translateY(-2px)" : "none",
        boxShadow: hover ? "0 4px 14px rgba(60,45,25,.09)" : "0 1px 2px rgba(60,45,25,.04)",
        borderColor: out ? "var(--error)" : hover ? "var(--verde)" : "var(--borde)",
      }}
    >
      <div className="cdv-card-thumb" style={{ height: 104, margin: 10, borderRadius: 11, background: cat.tint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44, position: "relative", overflow: "hidden", opacity: out ? 0.45 : 1 }}>
        {/* Aviso de inventario: no bloquea la venta, solo advierte. */}
        {(out || low) && (
          <span
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              zIndex: 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 9px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              background: out ? "oklch(0.94 0.05 25)" : "oklch(0.95 0.06 85)",
              color: out ? "oklch(0.5 0.16 25)" : "oklch(0.45 0.1 70)",
            }}
          >
            <Icon name="alert" size={12} /> {out ? "Sin insumos" : `Quedan ${stockLeft}`}
          </span>
        )}
        {product.image ? (
          <img src={product.image} alt={product.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : showEmoji ? (
          product.icon || cat.icon
        ) : (
          /* Inicial en serif sobre el tinte de la categoría: es el lenguaje
             visual de Café del Valle, en lugar del emoji de la marca anterior.
             El campo `icon` sigue en el dato y editable desde el editor de menú. */
          <div style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 46, lineHeight: 1, color: cat.ink }}>
            {product.name.trim().charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      {/* Sin descripción en la tarjeta: en tablet a distancia de brazo no se lee
          y roba altura. El texto sigue en el dato y en el editor de menú. */}
      <div className="cdv-card-body" style={{ padding: "2px 14px 14px", display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: "var(--tinta)", lineHeight: 1.25, flex: 1, textWrap: "pretty" }}>{product.name}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
          <span style={{ fontWeight: 700, fontSize: 14.5, color: "var(--cafe)", fontVariantNumeric: "tabular-nums" }}>{money(product.price)}</span>
          {(product.sizes || (product.mods && product.mods.length > 0)) && (
            <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--tinta-3)", background: "var(--superficie-baja)", border: "1px solid var(--borde)", padding: "2px 8px", borderRadius: 999 }}>opciones</span>
          )}
        </div>
      </div>
    </button>
  );
}

// ---------- Línea del carrito ----------
function CartLine({ line, cat, onQty, onRemove, onEdit }) {
  const subtitle = [line.size && line.size.name, ...(line.mods || []).filter((m) => m.group !== "azucar" || m.name !== "100%").map((m) => m.name)]
    .filter(Boolean)
    .join(" · ");
  return (
    <div style={{ display: "flex", gap: 12, padding: "14px 0", borderBottom: "1.5px dashed var(--line)" }}>
      <div style={{ width: 6, alignSelf: "stretch", borderRadius: 4, background: cat ? cat.ink : "var(--gold)", opacity: 0.55, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 15.5, color: "var(--ink)" }}>{line.name}</span>
          <span style={{ fontWeight: 700, fontSize: 15.5, color: "var(--navy)" }}>{money(lineTotal(line))}</span>
        </div>
        {subtitle && <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>{subtitle}</div>}
        {line.note && <div style={{ fontSize: 12.5, color: cat ? cat.ink : "var(--gold)", marginTop: 3, fontStyle: "italic" }}>“{line.note}”</div>}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          {/* Targets táctiles: qtyBtn hereda 44×44 del átomo; editar/eliminar a 40×40. */}
          <div style={{ display: "flex", alignItems: "center", gap: 2, border: "1px solid var(--line)", borderRadius: 999, padding: 2 }}>
            <button onClick={() => onQty(line.qty - 1)} style={qtyBtn}>
              <Icon name="minus" size={17} />
            </button>
            <span style={{ width: 32, textAlign: "center", fontWeight: 700, fontSize: 16 }}>{line.qty}</span>
            <button onClick={() => onQty(line.qty + 1)} style={qtyBtn}>
              <Icon name="plus" size={17} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={onEdit} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40 }}>
              <Icon name="edit" size={18} />
            </button>
            <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40 }}>
              <Icon name="trash" size={19} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Línea que ya se mandó a preparar. No tiene control de cantidad ni edición: en
   cocina ya la están haciendo, así que "bajarle uno" no significa nada. La
   única salida es anularla, que es una acción con consecuencias reales
   (devuelve inventario y manda a imprimir una cancelación) y por eso pide
   motivo en vez de ejecutarse al primer toque. */
function SentLine({ line, cat, onAnular }) {
  const subtitle = [line.size && line.size.name, ...(line.mods || []).filter((m) => m.group !== "azucar" || m.name !== "100%").map((m) => m.name)]
    .filter(Boolean)
    .join(" · ");
  return (
    <div style={{ display: "flex", gap: 12, padding: "11px 0", borderBottom: "1.5px dashed var(--line)", opacity: line.voided ? 0.5 : 1 }}>
      <div style={{ width: 6, alignSelf: "stretch", borderRadius: 4, background: cat ? cat.ink : "var(--gold)", opacity: 0.3, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
          <span style={{ fontWeight: 700, fontSize: 14.5, color: "var(--ink)", textDecoration: line.voided ? "line-through" : "none" }}>
            {line.qty} · {line.name}
          </span>
          <span style={{ fontWeight: 700, fontSize: 14.5, color: "var(--navy)", textDecoration: line.voided ? "line-through" : "none" }}>
            {money(lineTotal(line))}
          </span>
        </div>
        {subtitle && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>{subtitle}</div>}
        {line.note && <div style={{ fontSize: 12, color: cat ? cat.ink : "var(--gold)", marginTop: 2, fontStyle: "italic" }}>“{line.note}”</div>}
        {line.voided ? (
          <div style={{ fontSize: 11.5, color: "oklch(0.55 0.16 25)", marginTop: 3, fontWeight: 700 }}>
            Anulado{line.voidReason ? ` · ${line.voidReason}` : ""}
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}>
            <button
              onClick={onAnular}
              style={{
                background: "none", border: "none", cursor: "pointer", color: "var(--muted)",
                display: "flex", alignItems: "center", gap: 5, height: 36, padding: "0 4px",
                fontFamily: "var(--ui)", fontWeight: 700, fontSize: 12,
              }}
            >
              <Icon name="trash" size={16} />
              Quitar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* Confirmación de anulación. Es un modal y no un "deshacer" porque a diferencia
   del KDS aquí la acción sale del sistema: se imprime papel en cocina y se
   mueve inventario. Deshacer eso después no despega el papel de la comanda. */
function CancelLineModal({ line, onClose, onConfirm }) {
  const [motivo, setMotivo] = useState("");
  const motivos = ["El cliente se arrepintió", "Se pidió por error", "Ya no hay ingrediente", "Tardó demasiado"];
  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...sheet, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "22px 24px 0" }}>
          <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 20, color: "var(--navy)" }}>¿Quitar este producto?</div>
          <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>
            <b style={{ color: "var(--ink)" }}>{line.qty} · {line.name}</b> ya se mandó a preparar. Se avisará a quien lo esté
            haciendo y el ingrediente volverá al inventario.
          </div>
        </div>
        <div style={{ padding: "16px 24px" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Motivo</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 10 }}>
            {motivos.map((m) => (
              <Pill key={m} active={motivo === m} onClick={() => setMotivo(m)}>{m}</Pill>
            ))}
          </div>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="O escribe el motivo…"
            style={{
              width: "100%", border: "1px solid var(--line)", borderRadius: 14, padding: "11px 14px",
              fontFamily: "var(--ui)", fontSize: 14.5, color: "var(--ink)", outline: "none",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 10, padding: "0 24px 22px" }}>
          <Btn kind="ghost" full onClick={onClose}>Cancelar</Btn>
          <Btn kind="danger" full disabled={!motivo.trim()} onClick={() => onConfirm(motivo.trim())} icon="trash">
            Quitar
          </Btn>
        </div>
      </div>
    </div>
  );
}

/* ---------- Cambiar el destino de una cuenta ya enviada ----------

   Tocar el selector de mesa o el botón de "para llevar" mientras hay una cuenta
   viva significa dos cosas muy distintas, y desde afuera se ven igual:

     · Toca atender a otro cliente → la cuenta se queda donde está y el destino
                                     nuevo arranca su propia cuenta. Es lo
                                     frecuente, así que va primero y destacado.
     · El cliente se movió         → la cuenta entera se muda al destino nuevo.

   Antes las dos hacían lo segundo en silencio. La opción destacada es además la
   que no toca nada de lo ya preparado: si el mesero elige de prisa, elige la
   que no puede arruinar una cuenta.

   El detalle de cada botón dice qué pasa con lo ya preparado, que es lo único
   que hace falta saber para elegir bien. */
function OpcionMesa({ titulo, detalle, icon, onClick, destacado }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        width: "100%",
        textAlign: "left",
        padding: "14px 16px",
        borderRadius: 14,
        cursor: "pointer",
        fontFamily: "var(--ui)",
        border: "1px solid " + (destacado ? "var(--verde)" : "var(--borde-fuerte)"),
        background: destacado ? "var(--verde-suave)" : "var(--superficie)",
        color: destacado ? "var(--verde-oscuro)" : "var(--tinta-2)",
      }}
    >
      <span style={{ flexShrink: 0, marginTop: 1 }}>
        <Icon name={icon} size={19} />
      </span>
      <span>
        <span style={{ display: "block", fontWeight: 700, fontSize: 15 }}>{titulo}</span>
        <span style={{ display: "block", fontSize: 12.5, lineHeight: 1.45, marginTop: 3, opacity: 0.85 }}>{detalle}</span>
      </span>
    </button>
  );
}

/* Aviso de mesa faltante. Nombra la acción que se frenó —enviar o cobrar—
   porque el pie tiene los dos botones y "elegí una mesa" a secas no dice cuál
   de los dos fue el que no salió. */
function AvisoMesa({ accion }) {
  return (
    <div
      role="status"
      style={{
        display: "flex", alignItems: "center", gap: 9, padding: "10px 13px",
        borderRadius: 11, background: "var(--aviso-suave)", color: "var(--aviso)",
        fontSize: 13, fontWeight: 600, lineHeight: 1.4,
      }}
    >
      <span style={{ flexShrink: 0, display: "flex" }}>
        <Icon name="alert" size={17} />
      </span>
      <span>
        Elegí una mesa para {accion === "enviar" ? "mandar a preparar" : "cobrar"}, o cambiá la orden a <b>Para llevar</b>.
      </span>
    </div>
  );
}

// Salidas discretas del pie de la cuenta: son escapes, no la acción principal.
const enlaceBtn = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "var(--muted)",
  fontFamily: "var(--ui)",
  fontWeight: 700,
  fontSize: 12.5,
  padding: "6px 8px",
};

function CambioDestinoModal({ destino, origen, enviadas, porEnviar, onMover, onNueva, onClose }) {
  /* Tanto el origen como el destino pueden no tener mesa ("para llevar"), así
     que cada uno se nombra aparte para que las frases salgan bien escritas en
     las cuatro combinaciones. */
  const sujeto = origen ? `La mesa ${origen.label}` : "Esta cuenta";
  const enOrigen = origen ? `la mesa ${origen.label}` : "la cuenta actual";
  const aDestino = destino ? `la mesa ${destino.label}` : "para llevar";
  const arrastre = porEnviar
    ? `${porEnviar === 1 ? "El producto que tenés" : `Los ${porEnviar} productos que tenés`} por enviar ${porEnviar === 1 ? "pasa" : "pasan"} a la orden nueva.`
    : "La orden nueva empieza vacía.";

  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...sheet, maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "22px 24px 0" }}>
          <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 20, color: "var(--navy)" }}>
            {destino ? `Mesa ${destino.label} · ${destino.areaName}` : "Para llevar"}
          </div>
          <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>
            {sujeto} tiene <b style={{ color: "var(--ink)" }}>{enviadas} {enviadas === 1 ? "producto" : "productos"}</b> que ya
            {enviadas === 1 ? " salió" : " salieron"} a preparar. ¿Qué querés hacer?
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 24px 22px" }}>
          <OpcionMesa
            destacado
            icon="plus"
            titulo={destino ? `Abrir una cuenta nueva en la mesa ${destino.label}` : "Empezar una orden nueva para llevar"}
            detalle={`Es otro cliente. Lo ya preparado se queda en ${enOrigen}. ${arrastre}`}
            onClick={onNueva}
          />
          <OpcionMesa
            icon="table"
            titulo={destino ? `Mover esta cuenta a la mesa ${destino.label}` : "Pasar esta cuenta a para llevar"}
            detalle={
              `Es el mismo cliente, que se movió. La cuenta se va completa a ${aDestino}, incluido lo que ya está en preparación` +
              (origen ? `, y la mesa ${origen.label} queda libre.` : ".")
            }
            onClick={onMover}
          />
          <Btn kind="ghost" full onClick={onClose}>
            Cancelar
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ---------- Pantalla de Orden ----------
export function OrderScreen({ cart, menu, mods, cats, areas, ingredients = [], openOrders = [], table, setTable, addLine, setLineQty, updateLine, removeLine, clearCart, onCheckout, orderType, setOrderType, showEmoji, account, accountId, onMoverCuenta, onNuevaCuentaConCarrito, onNuevaOrden, onEnviar, onAnularEnviado, onCerrarCuenta, onDescartarCuenta, enviando }) {
  const [activeCat, setActiveCat] = useState("all");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null);
  const [tablePicker, setTablePicker] = useState(false);
  /* Destino pendiente de decisión. Se guarda envuelto en un objeto porque el
     destino válido incluye `null` (para llevar), que como estado a secas sería
     indistinguible de "no hay nada que decidir". */
  const [cambioDestino, setCambioDestino] = useState(null); // { mesa } | null
  const [anulando, setAnulando] = useState(null);
  const [avisoMesa, setAvisoMesa] = useState(null); // null | "enviar" | "cobrar"

  /* Una orden "para aquí" sin mesa deja la comanda sin destino: cocina y barra
     no saben a quién entregarle, y en el historial la venta queda sin ubicar.
     Solo se exige si el local tiene mesas cargadas — un café de mostrador que
     nunca configuró el mapa no debe quedar bloqueado. "Para llevar" nunca la
     necesita. */
  const hayMesas = areas.some((a) => a.tables.length > 0);
  const faltaMesa = orderType === "Aquí" && !table && hayMesas;

  /* Mandar a preparar y cobrar exigen lo mismo: sin mesa, la comanda sale de la
     impresora sin decir a dónde va y el barista ve un pedido sin dueño. Enviar
     es además el más urgente de los dos, porque el papel ya impreso no se puede
     desimprimir: cuando alguien nota el error, la cocina ya está trabajando.

     No se deshabilita el botón: uno muerto no dice qué hacer. Se abre el
     selector de mesa y se deja el aviso puesto hasta que se resuelva. */
  function conMesa(accion, seguir) {
    if (faltaMesa) {
      setAvisoMesa(accion);
      setTablePicker(true);
      return;
    }
    setAvisoMesa(null);
    seguir();
  }
  const intentarEnviar = () => conMesa("enviar", onEnviar);
  const intentarCobrar = () => conMesa("cobrar", onCheckout);
  const catById = useMemo(() => Object.fromEntries(cats.map((c) => [c.id, c])), [cats]);
  const ingById = useMemo(() => Object.fromEntries(ingredients.map((i) => [i.id, i])), [ingredients]);
  // Unidades que alcanzan de cada producto con el inventario actual.
  const stockByProduct = useMemo(() => Object.fromEntries(menu.map((p) => [p.id, producibleUnits(p, ingById)])), [menu, ingById]);
  // Faltantes del carrito completo: se avisan al cobrar, sin bloquear.
  const shortages = useMemo(() => shortagesFor(cart, menu, mods, ingById), [cart, menu, mods, ingById]);

  const filtered = menu.filter((p) => {
    if (activeCat !== "all" && p.cat !== activeCat) return false;
    if (query && !p.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  function pick(product) {
    const cat = catById[product.cat];
    const hasOpts = product.sizes || (product.mods && product.mods.length > 0);
    if (hasOpts) {
      setModal({ product, cat });
      return;
    }
    addLine({
      uid: "L" + Date.now() + Math.random().toString(36).slice(2, 6),
      productId: product.id,
      name: product.name,
      basePrice: product.price,
      size: null,
      mods: [],
      note: "",
      qty: 1,
      catId: product.cat,
    });
  }

  function editLine(line) {
    const product = menu.find((p) => p.id === line.productId);
    if (!product) return;
    setModal({ product, cat: catById[product.cat], editLine: line });
  }

  const subtotal = cart.reduce((s, l) => s + lineTotal(l), 0);
  const count = cart.reduce((s, l) => s + l.qty, 0);
  /* Líneas ya mandadas a preparar. Vienen de la cuenta del servidor, no del
     carrito: el carrito solo tiene lo que todavía no se ha enviado. */
  const enviadas = account ? account.lines.filter((l) => l.sentSeq) : [];
  // El total de la cuenta suma lo enviado vivo (sin lo anulado) más el carrito.
  const totalCuenta = activeLines(enviadas).reduce((s, l) => s + lineTotal(l), 0) + subtotal;
  // Lo vivo que ya salió a preparar: es lo que hace que cambiar de mesa deje de
  // ser un cambio de etiqueta y pase a ser una decisión (ver `pedirDestino`).
  const enviadasVivas = activeLines(enviadas);

  /* Mesas con cuenta abierta de OTRA orden (la propia no cuenta: seguir en su
     mesa no es un choque). El picker las marca y no deja montarles encima una
     segunda cuenta. */
  const mesasOcupadas = useMemo(() => {
    const m = new Map();
    for (const o of openOrders) {
      if (!o.table || !o.table.id) continue;
      if (accountId && o.id === accountId) continue;
      m.set(o.table.id, o);
    }
    return m;
  }, [openOrders, accountId]);

  /* Empezar otra orden sin tocar la cuenta abierta. Lo del carrito todavía no
     existe en el servidor, así que se avisa antes de descartarlo: es lo único
     que se pierde de verdad al salir. */
  function empezarOtraOrden() {
    if (
      cart.length &&
      !window.confirm(
        `Hay ${count} ${count === 1 ? "producto" : "productos"} sin mandar a preparar en esta cuenta.\n\n` +
          `Si empezás otra orden se descartan. La cuenta y lo que ya salió a preparar se quedan como están.`
      )
    )
      return;
    onNuevaOrden();
  }

  /* Qué hacer cuando el mesero cambia el destino de la orden (otra mesa, o
     "para llevar", que es quitarle la mesa).

     Sin cuenta viva —mostrador, o una cuenta que aún no ha mandado nada— el
     destino es solo una etiqueta y se cambia y ya.

     Con productos YA mandados a preparar no: esas comandas salieron impresas a
     nombre del destino viejo y el inventario ya se descontó. Cambiar la
     etiqueta en silencio se llevaba la cuenta entera al destino nuevo —el viejo
     quedaba libre en el mapa y al nuevo se le cobraba lo que comió el otro—,
     que es justo el error reportado. Son dos intenciones distintas y solo el
     mesero sabe cuál es, así que se le pregunta. */
  function pedirDestino(mesa) {
    setTablePicker(false);
    setAvisoMesa(null); // ya se resolvió lo que el aviso pedía
    const mismoDestino = mesa ? !!table && mesa.id === table.id : !table;
    if (mismoDestino || !enviadasVivas.length || !onMoverCuenta || !onNuevaCuentaConCarrito) {
      setOrderType(mesa ? "Aquí" : "Para llevar");
      setTable(mesa || null);
      return;
    }
    setCambioDestino({ mesa: mesa || null });
  }

  return (
    <div className="cdv-split" style={{ display: "grid", gridTemplateColumns: "1fr 376px", height: "100%", minHeight: 0 }}>
      {/* ---- Menú ---- */}
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0, borderRight: "1px solid var(--borde)" }}>
        <div className="cdv-menu-head" style={{ padding: "20px 26px 14px", flexShrink: 0 }}>
          <div className="cdv-menu-head-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
            <h1 className="cdv-screen-title" style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 30, letterSpacing: "-.01em", color: "var(--tinta)", margin: 0 }}>Tomar orden</h1>
            <div className="cdv-search" style={{ position: "relative", width: 260 }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}>
                <Icon name="search" size={18} />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar producto…"
                style={{ width: "100%", padding: "12px 14px 12px 40px", border: "1px solid var(--borde)", borderRadius: 12, fontFamily: "var(--ui)", fontSize: 15, outline: "none", color: "var(--tinta)", background: "var(--fondo)" }}
              />
            </div>
          </div>
          <div className="cdv-cats" style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
            <Pill active={activeCat === "all"} onClick={() => setActiveCat("all")}>
              Todo
            </Pill>
            {cats.map((c) => (
              <Pill key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)}>
                {c.name}
              </Pill>
            ))}
          </div>
        </div>
        <div className="cdv-menu-scroll" style={{ flex: 1, overflowY: "auto", padding: "8px 26px 26px" }}>
          {/* Tarjetas amplias para tablet: menos columnas, targets más grandes. */}
          <div className="cdv-menu-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(195px, 1fr))", gap: 16 }}>
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} cat={catById[p.cat]} showEmoji={showEmoji} stockLeft={stockByProduct[p.id]} onClick={() => pick(p)} />
            ))}
          </div>
          {filtered.length === 0 && <div style={{ textAlign: "center", color: "var(--muted)", padding: 50, fontSize: 16 }}>Sin resultados</div>}
        </div>
      </div>

      {/* ---- Carrito / Ticket ---- */}
      <div className="cdv-cart" style={{ display: "flex", flexDirection: "column", minHeight: 0, background: "#fff" }}>
        <div className="cdv-cart-head" style={{ padding: "20px 22px 14px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            {/* Con una cuenta guardada el título la nombra: era lo único que
                faltaba para notar que se sigue parado en la cuenta de otra mesa
                y no en una orden nueva. */}
            <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 20, color: "var(--navy)", display: "flex", alignItems: "center", gap: 9 }}>
              <Icon name="bag" size={22} />{" "}
              {account && account.number ? (table ? `Cuenta · Mesa ${table.label}` : "Cuenta para llevar") : "Orden"}{" "}
              {count > 0 && <span style={{ fontSize: 13, background: "var(--primary-soft)", color: "var(--primary)", padding: "2px 10px", borderRadius: 999 }}>{count}</span>}
            </div>
            {cart.length > 0 && (
              <button onClick={clearCart} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "var(--ui)", padding: "10px 12px", minHeight: 44 }}>
                Vaciar
              </button>
            )}
          </div>
          <div className="cdv-seg" style={{ display: "flex", gap: 8, background: "var(--cream)", padding: 4, borderRadius: 12 }}>
            {["Aquí", "Para llevar"].map((o) => (
              <button
                key={o}
                onClick={() => {
                  /* Pasar a "para llevar" le quita la mesa a la orden, así que
                     con una cuenta ya enviada es el mismo cambio de destino que
                     tocar otra mesa y hace la misma pregunta. Es el camino por
                     el que el mesero intenta arrancar un pedido para llevar sin
                     salir de la cuenta, y antes lo único que lograba era mudar
                     la cuenta de la mesa. */
                  if (o === "Para llevar" && enviadasVivas.length && onMoverCuenta) {
                    pedirDestino(null);
                    return;
                  }
                  setOrderType(o);
                  if (o === "Para llevar") setTable(null);
                  // Al pasar a "Para aquí" se abre el mapa para asignar mesa de una vez.
                  else if (!table && areas.some((a) => a.tables.length > 0)) setTablePicker(true);
                  if (o !== "Aquí") setAvisoMesa(null);
                }}
                style={{
                  flex: 1,
                  padding: "13px 8px",
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 15,
                  fontFamily: "var(--ui)",
                  background: orderType === o ? "#fff" : "transparent",
                  color: orderType === o ? "var(--navy)" : "var(--muted)",
                  boxShadow: orderType === o ? "0 2px 6px rgba(58,65,88,.12)" : "none",
                  transition: "all .12s ease",
                }}
              >
                {o === "Aquí" ? "Para aquí" : "Para llevar"}
              </button>
            ))}
          </div>
          {/* Mesa asignada: solo aplica a "Para aquí"; sale en la comanda. */}
          {orderType === "Aquí" && (
            <button
              onClick={() => setTablePicker(true)}
              style={{
                marginTop: 10,
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "12px 14px",
                borderRadius: 14,
                cursor: "pointer",
                fontFamily: "var(--ui)",
                fontWeight: 700,
                fontSize: 14.5,
                border: "1px " + (table ? "solid var(--verde)" : avisoMesa ? "solid var(--aviso)" : "dashed var(--borde)"),
                background: table ? "var(--verde-suave)" : avisoMesa ? "var(--aviso-suave)" : "var(--superficie)",
                color: table ? "var(--verde-oscuro)" : avisoMesa ? "var(--aviso)" : "var(--tinta-3)",
                transition: "all .12s ease",
              }}
            >
              <Icon name="table" size={18} />
              {table ? `Mesa ${table.label} · ${table.areaName}` : "Elegir mesa…"}
            </button>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 22px" }}>
          {/* Ya enviado: solo existe cuando se trabaja sobre una cuenta de mesa. */}
          {enviadas.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0 4px" }}>
                <Icon name="check" size={15} />
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Ya enviado a preparar
                </span>
              </div>
              {enviadas.map((l) => (
                <SentLine key={l.uid} line={l} cat={catById[l.catId]} onAnular={() => setAnulando(l)} />
              ))}
            </>
          )}

          {enviadas.length > 0 && cart.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 0 2px" }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: "oklch(0.72 0.16 70)", flexShrink: 0 }} />
              <span style={{ fontSize: 11.5, fontWeight: 700, color: "oklch(0.52 0.12 70)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Por enviar
              </span>
            </div>
          )}

          {cart.length === 0 && enviadas.length === 0 ? (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--muted)", gap: 12, textAlign: "center", padding: 20 }}>
              <Mascot size={64} color="var(--line)" />
              <div style={{ fontSize: 15.5, fontWeight: 700 }}>Aún no hay productos</div>
              <div style={{ fontSize: 13.5, maxWidth: 220, lineHeight: 1.5 }}>Toca un producto del menú para empezar la orden.</div>
            </div>
          ) : (
            cart.map((l) => <CartLine key={l.uid} line={l} cat={catById[l.catId]} onQty={(q) => setLineQty(l.uid, q)} onRemove={() => removeLine(l.uid)} onEdit={() => editLine(l)} />)
          )}
        </div>

        <div style={{ borderTop: "1px solid var(--line)", padding: "18px 22px", flexShrink: 0 }}>
          {/* Faltantes: se avisa para que alguien reponga, pero la venta sigue. */}
          {shortages.length > 0 && (
            <div style={{ display: "flex", gap: 10, background: "oklch(0.95 0.06 85)", border: "1px solid oklch(0.88 0.09 85)", borderRadius: 14, padding: "10px 14px", marginBottom: 12, color: "oklch(0.42 0.09 70)" }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>
                <Icon name="alert" size={17} />
              </span>
              <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                <b>No alcanza el inventario</b> de {shortages.slice(0, 3).map((s) => s.name.toLowerCase()).join(", ")}
                {shortages.length > 3 ? ` y ${shortages.length - 3} más` : ""}. Puedes cobrar igual; el stock quedará en negativo hasta que registres la entrada.
              </div>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16, paddingTop: 14, borderTop: "1px solid var(--borde)" }}>
            <span style={{ fontSize: 16.5, fontWeight: 600, color: "var(--tinta)" }}>{account ? "Total de la cuenta" : "Total a pagar"}</span>
            <span style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 36, letterSpacing: "-.01em", color: "var(--verde-oscuro)", fontVariantNumeric: "tabular-nums" }}>
              {money(account ? totalCuenta : subtotal)}
            </span>
          </div>

          {account ? (
            /* Cuenta de mesa: enviar y cobrar son dos actos distintos. Enviar es
               lo frecuente (cada ronda de pedidos) y cobrar pasa una sola vez al
               final, por eso enviar es el botón primario mientras haya pendientes. */
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Un solo aviso arriba de los dos botones: la mesa que falta es
                  la misma para enviar y para cobrar. */}
              {faltaMesa && avisoMesa && <AvisoMesa accion={avisoMesa} />}
              <Btn
                kind={cart.length > 0 ? "primary" : "ghost"}
                size="lg"
                full
                disabled={cart.length === 0 || enviando}
                onClick={intentarEnviar}
                icon="bag"
              >
                {enviando ? "Enviando…" : `Enviar a preparar${count > 0 ? " · " + count : ""}`}
              </Btn>
              {/* Si no queda nada que cobrar (todo se anuló), cobrar Q0 no tiene
                  sentido y sin salida la mesa quedaría ocupada para siempre. La
                  acción pasa a ser descartar la cuenta. */}
              {totalCuenta > 0 ? (
                <Btn kind={cart.length > 0 ? "ghost" : "primary"} size="lg" full onClick={intentarCobrar} icon="card">
                  Cobrar · {money(totalCuenta)}
                </Btn>
              ) : (
                account.number && (
                  <Btn kind="danger" size="lg" full onClick={onDescartarCuenta} icon="trash">
                    Descartar cuenta vacía
                  </Btn>
                )
              )}
              {/* Dos salidas, porque son dos cosas distintas: atender a otro
                  cliente sin soltar el salón, o volver al mapa. Sin la primera,
                  el único camino para empezar otro pedido era el selector de
                  mesa, que edita ESTA cuenta en vez de abrir otra. */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                {account.number && onNuevaOrden && (
                  <>
                    <button onClick={empezarOtraOrden} style={enlaceBtn}>
                      Nueva orden
                    </button>
                    <span style={{ color: "var(--borde-fuerte)", fontSize: 12 }}>·</span>
                  </>
                )}
                <button onClick={onCerrarCuenta} style={enlaceBtn}>
                  Volver a las cuentas
                </button>
              </div>
              {cart.length > 0 && (
                <div style={{ textAlign: "center", fontSize: 12, color: "oklch(0.52 0.12 70)", fontWeight: 700 }}>
                  Hay {count} {count === 1 ? "producto" : "productos"} sin mandar a preparar
                </div>
              )}
            </div>
          ) : (
            <>
              {faltaMesa && avisoMesa && (
                <div style={{ marginBottom: 10 }}>
                  <AvisoMesa accion={avisoMesa} />
                </div>
              )}
              <Btn kind="primary" size="lg" full disabled={cart.length === 0} onClick={intentarCobrar} icon="card">
                Cobrar {count > 0 ? "· " + money(subtotal) : ""}
              </Btn>
              <div style={{ textAlign: "center", fontSize: 12, color: "var(--muted)", marginTop: 10 }}>El cliente paga antes de consumir · precios con impuestos incluidos</div>
            </>
          )}
        </div>
      </div>

      {tablePicker && (
        <TablePickerModal
          areas={areas}
          value={table}
          ocupadas={mesasOcupadas}
          bloquearOcupadas={!!account}
          onClose={() => setTablePicker(false)}
          onPick={pedirDestino}
        />
      )}

      {cambioDestino && (
        <CambioDestinoModal
          destino={cambioDestino.mesa}
          origen={table}
          enviadas={enviadasVivas.length}
          porEnviar={count}
          onClose={() => setCambioDestino(null)}
          onMover={() => {
            onMoverCuenta(cambioDestino.mesa);
            setCambioDestino(null);
          }}
          onNueva={() => {
            onNuevaCuentaConCarrito(cambioDestino.mesa);
            setCambioDestino(null);
          }}
        />
      )}

      {anulando && (
        <CancelLineModal
          line={anulando}
          onClose={() => setAnulando(null)}
          onConfirm={(motivo) => {
            onAnularEnviado(anulando.uid, motivo);
            setAnulando(null);
          }}
        />
      )}

      {modal && (
        <CustomizeModal
          product={modal.product}
          cat={modal.cat}
          modGroupsMap={mods}
          initialLine={modal.editLine}
          onClose={() => setModal(null)}
          onAdd={(line) => {
            if (modal.editLine) updateLine(modal.editLine.uid, line);
            else addLine(line);
            setModal(null);
          }}
        />
      )}
    </div>
  );
}
