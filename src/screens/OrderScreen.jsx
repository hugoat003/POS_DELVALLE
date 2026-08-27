/* FUWA POS — pantalla de orden: menú con búsqueda, carrito en vivo y modal. */
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
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        textAlign: "left",
        background: "#fff",
        border: "2px solid var(--line)",
        borderRadius: "var(--r)",
        padding: 0,
        cursor: "pointer",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transition: "transform .12s ease, box-shadow .12s ease, border-color .12s ease",
        transform: hover ? "translateY(-3px)" : "none",
        boxShadow: hover ? "0 12px 26px -12px rgba(58,65,88,.35)" : "0 2px 0 rgba(58,65,88,.04)",
        borderColor: out ? "oklch(0.8 0.1 25)" : hover ? cat.ink : "var(--line)",
      }}
    >
      <div style={{ height: 104, background: cat.tint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44, position: "relative", overflow: "hidden", opacity: out ? 0.45 : 1 }}>
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
              fontWeight: 800,
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
          <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 26, color: cat.ink, opacity: 0.9 }}>
            {product.name
              .split(" ")
              .map((w) => w[0])
              .slice(0, 2)
              .join("")}
          </div>
        )}
      </div>
      {/* Sin descripción en la tarjeta: en tablet a distancia de brazo no se lee
          y roba altura. El texto sigue en el dato y en el editor de menú. */}
      <div style={{ padding: "12px 14px 12px", display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: "var(--ink)", lineHeight: 1.15, flex: 1 }}>{product.name}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
          <span style={{ fontWeight: 800, fontSize: 17, color: "var(--navy)", fontFamily: "var(--display)" }}>{money(product.price)}</span>
          {(product.sizes || (product.mods && product.mods.length > 0)) && (
            <span style={{ fontSize: 11, fontWeight: 800, color: cat.ink, background: cat.tint, padding: "3px 9px", borderRadius: 999 }}>opciones</span>
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
          <span style={{ fontWeight: 800, fontSize: 15.5, color: "var(--ink)" }}>{line.name}</span>
          <span style={{ fontWeight: 800, fontSize: 15.5, color: "var(--navy)" }}>{money(lineTotal(line))}</span>
        </div>
        {subtitle && <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>{subtitle}</div>}
        {line.note && <div style={{ fontSize: 12.5, color: cat ? cat.ink : "var(--gold)", marginTop: 3, fontStyle: "italic" }}>“{line.note}”</div>}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          {/* Targets táctiles: qtyBtn hereda 44×44 del átomo; editar/eliminar a 40×40. */}
          <div style={{ display: "flex", alignItems: "center", gap: 2, border: "2px solid var(--line)", borderRadius: 999, padding: 2 }}>
            <button onClick={() => onQty(line.qty - 1)} style={qtyBtn}>
              <Icon name="minus" size={17} />
            </button>
            <span style={{ width: 32, textAlign: "center", fontWeight: 800, fontSize: 16 }}>{line.qty}</span>
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
          <span style={{ fontWeight: 800, fontSize: 14.5, color: "var(--ink)", textDecoration: line.voided ? "line-through" : "none" }}>
            {line.qty} · {line.name}
          </span>
          <span style={{ fontWeight: 800, fontSize: 14.5, color: "var(--navy)", textDecoration: line.voided ? "line-through" : "none" }}>
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
                fontFamily: "var(--ui)", fontWeight: 800, fontSize: 12,
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
          <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 20, color: "var(--navy)" }}>¿Quitar este producto?</div>
          <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>
            <b style={{ color: "var(--ink)" }}>{line.qty} · {line.name}</b> ya se mandó a preparar. Se avisará a quien lo esté
            haciendo y el ingrediente volverá al inventario.
          </div>
        </div>
        <div style={{ padding: "16px 24px" }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Motivo</div>
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
              width: "100%", border: "2px solid var(--line)", borderRadius: 14, padding: "11px 14px",
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

// ---------- Pantalla de Orden ----------
export function OrderScreen({ cart, menu, mods, cats, areas, ingredients = [], table, setTable, addLine, setLineQty, updateLine, removeLine, clearCart, onCheckout, orderType, setOrderType, showEmoji, account, onEnviar, onAnularEnviado, onCerrarCuenta, onDescartarCuenta, enviando }) {
  const [activeCat, setActiveCat] = useState("all");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null);
  const [tablePicker, setTablePicker] = useState(false);
  const [anulando, setAnulando] = useState(null);
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

  return (
    <div className="fuwa-split" style={{ display: "grid", gridTemplateColumns: "1fr 376px", height: "100%", minHeight: 0 }}>
      {/* ---- Menú ---- */}
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0, borderRight: "2px solid var(--line)" }}>
        <div style={{ padding: "20px 26px 14px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
            <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 26, color: "var(--navy)", margin: 0 }}>Tomar orden</h1>
            <div style={{ position: "relative", width: 260 }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}>
                <Icon name="search" size={18} />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar producto…"
                style={{ width: "100%", padding: "12px 14px 12px 40px", border: "2px solid var(--line)", borderRadius: 999, fontFamily: "var(--ui)", fontSize: 15, outline: "none", color: "var(--ink)", background: "#fff" }}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
            <Pill active={activeCat === "all"} onClick={() => setActiveCat("all")}>
              Todo
            </Pill>
            {cats.map((c) => (
              <Pill key={c.id} active={activeCat === c.id} color={c.ink} onClick={() => setActiveCat(c.id)}>
                <span style={{ marginRight: 6 }}>{c.icon}</span>
                {c.name}
              </Pill>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 26px 26px" }}>
          {/* Tarjetas amplias para tablet: menos columnas, targets más grandes. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(195px, 1fr))", gap: 16 }}>
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} cat={catById[p.cat]} showEmoji={showEmoji} stockLeft={stockByProduct[p.id]} onClick={() => pick(p)} />
            ))}
          </div>
          {filtered.length === 0 && <div style={{ textAlign: "center", color: "var(--muted)", padding: 50, fontSize: 16 }}>Sin resultados</div>}
        </div>
      </div>

      {/* ---- Carrito / Ticket ---- */}
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0, background: "#fff" }}>
        <div style={{ padding: "20px 22px 14px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 20, color: "var(--navy)", display: "flex", alignItems: "center", gap: 9 }}>
              <Icon name="bag" size={22} /> Orden{" "}
              {count > 0 && <span style={{ fontSize: 13, background: "var(--primary-soft)", color: "var(--primary)", padding: "2px 10px", borderRadius: 999 }}>{count}</span>}
            </div>
            {cart.length > 0 && (
              <button onClick={clearCart} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontWeight: 800, fontSize: 14, fontFamily: "var(--ui)", padding: "10px 12px", minHeight: 44 }}>
                Vaciar
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, background: "var(--cream)", padding: 5, borderRadius: 999 }}>
            {["Aquí", "Para llevar"].map((o) => (
              <button
                key={o}
                onClick={() => {
                  setOrderType(o);
                  if (o === "Para llevar") setTable(null);
                  // Al pasar a "Para aquí" se abre el mapa para asignar mesa de una vez.
                  else if (!table && areas.some((a) => a.tables.length > 0)) setTablePicker(true);
                }}
                style={{
                  flex: 1,
                  padding: "13px 8px",
                  borderRadius: 999,
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 800,
                  fontSize: 15,
                  fontFamily: "var(--ui)",
                  background: orderType === o ? "#fff" : "transparent",
                  color: orderType === o ? "var(--navy)" : "var(--muted)",
                  boxShadow: orderType === o ? "0 2px 6px rgba(58,65,88,.12)" : "none",
                  transition: "all .12s ease",
                }}
              >
                {o === "Aquí" ? "🍽️ Para aquí" : "🥡 Para llevar"}
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
                fontWeight: 800,
                fontSize: 14.5,
                border: "2px " + (table ? "solid var(--primary)" : "dashed var(--line)"),
                background: table ? "var(--primary-soft)" : "#fff",
                color: table ? "var(--primary)" : "var(--muted)",
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
                <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
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
              <span style={{ fontSize: 11.5, fontWeight: 800, color: "oklch(0.52 0.12 70)", textTransform: "uppercase", letterSpacing: 0.5 }}>
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

        <div style={{ borderTop: "2px solid var(--line)", padding: "18px 22px", flexShrink: 0 }}>
          {/* Faltantes: se avisa para que alguien reponga, pero la venta sigue. */}
          {shortages.length > 0 && (
            <div style={{ display: "flex", gap: 10, background: "oklch(0.95 0.06 85)", border: "2px solid oklch(0.88 0.09 85)", borderRadius: 14, padding: "10px 14px", marginBottom: 12, color: "oklch(0.42 0.09 70)" }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>
                <Icon name="alert" size={17} />
              </span>
              <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                <b>No alcanza el inventario</b> de {shortages.slice(0, 3).map((s) => s.name.toLowerCase()).join(", ")}
                {shortages.length > 3 ? ` y ${shortages.length - 3} más` : ""}. Puedes cobrar igual; el stock quedará en negativo hasta que registres la entrada.
              </div>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "var(--muted)" }}>{account ? "Total de la cuenta" : "Total a pagar"}</span>
            <span style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 26, color: "var(--navy)" }}>
              {money(account ? totalCuenta : subtotal)}
            </span>
          </div>

          {account ? (
            /* Cuenta de mesa: enviar y cobrar son dos actos distintos. Enviar es
               lo frecuente (cada ronda de pedidos) y cobrar pasa una sola vez al
               final, por eso enviar es el botón primario mientras haya pendientes. */
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Btn
                kind={cart.length > 0 ? "primary" : "ghost"}
                size="lg"
                full
                disabled={cart.length === 0 || enviando}
                onClick={onEnviar}
                icon="bag"
              >
                {enviando ? "Enviando…" : `Enviar a preparar${count > 0 ? " · " + count : ""}`}
              </Btn>
              {/* Si no queda nada que cobrar (todo se anuló), cobrar Q0 no tiene
                  sentido y sin salida la mesa quedaría ocupada para siempre. La
                  acción pasa a ser descartar la cuenta. */}
              {totalCuenta > 0 ? (
                <Btn kind={cart.length > 0 ? "ghost" : "primary"} size="lg" full onClick={onCheckout} icon="card">
                  Cobrar · {money(totalCuenta)}
                </Btn>
              ) : (
                account.number && (
                  <Btn kind="danger" size="lg" full onClick={onDescartarCuenta} icon="trash">
                    Descartar cuenta vacía
                  </Btn>
                )
              )}
              <button
                onClick={onCerrarCuenta}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontFamily: "var(--ui)", fontWeight: 800, fontSize: 12.5, padding: "6px 0" }}
              >
                Volver a las cuentas
              </button>
              {cart.length > 0 && (
                <div style={{ textAlign: "center", fontSize: 12, color: "oklch(0.52 0.12 70)", fontWeight: 700 }}>
                  Hay {count} {count === 1 ? "producto" : "productos"} sin mandar a preparar
                </div>
              )}
            </div>
          ) : (
            <>
              <Btn kind="primary" size="lg" full disabled={cart.length === 0} onClick={onCheckout} icon="card">
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
          onClose={() => setTablePicker(false)}
          onPick={(t) => {
            setTable(t);
            setTablePicker(false);
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
