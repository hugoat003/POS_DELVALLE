/* FUWA POS — inventario: existencias, entradas/mermas/conteos y kardex.

   Las existencias NO se editan como un campo de texto: todo cambio pasa por un
   movimiento (compra, merma o conteo físico) para que el kardex explique
   siempre por qué el stock es el que es. Las ventas descuentan solas desde el
   servidor al cobrar. */
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { Btn, Pill, overlay, sheet, iconBtn } from "../components/ui.jsx";
import { money } from "../lib/format.js";
import { BASE_UNITS, presetsFor, CHULETA, costPerBase, fromBase, purchaseLabel, hasPurchaseUnit } from "../lib/units.js";

const inp = {
  width: "100%",
  padding: "11px 14px",
  border: "2px solid var(--line)",
  borderRadius: 12,
  fontFamily: "var(--ui)",
  fontSize: 15,
  color: "var(--ink)",
  outline: "none",
  boxSizing: "border-box",
};

// Cantidades: hasta 2 decimales pero sin ceros de relleno (180, 2.5, 0.75).
export const qty = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return v.toLocaleString("es-GT", { maximumFractionDigits: 2 });
};

/* Costo por unidad: un ml de leche cuesta Q0.012, que con el formato normal de
   moneda se vería como "Q0.00". Para valores por debajo del centavo se muestran
   más decimales en vez de un cero que parece un error. */
const unitCost = (n) => {
  const v = Number(n) || 0;
  return v > 0 && v < 0.01 ? "Q" + v.toFixed(4).replace(/0+$/, "") : money(v);
};

const REASONS = {
  compra: { label: "Entrada / compra", color: "oklch(0.55 0.10 150)", sign: 1 },
  merma: { label: "Merma", color: "oklch(0.55 0.16 25)", sign: -1 },
  ajuste: { label: "Ajuste / conteo", color: "oklch(0.55 0.10 235)", sign: 0 },
  venta: { label: "Venta", color: "var(--muted)", sign: -1 },
  anulacion: { label: "Orden anulada", color: "oklch(0.55 0.12 85)", sign: 1 },
};

function Field({ label, children, hint }) {
  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}

// ---------- Modal: alta / edición de ingrediente ----------
function IngredientForm({ initial, onCancel, onSave, onDelete }) {
  const isNew = !initial.id;
  const [name, setName] = useState(initial.name || "");
  const [unit, setUnit] = useState(initial.unit || "g");
  const [minStock, setMinStock] = useState(initial.minStock != null ? String(initial.minStock) : "0");
  const [stock, setStock] = useState("0"); // solo al crear: existencia inicial

  // Cómo se compra. El costo por unidad base ya no se teclea: se deriva.
  const [pUnit, setPUnit] = useState(initial.purchaseUnit || initial.unit || "g");
  const [pFactor, setPFactor] = useState(initial.purchaseFactor != null ? String(initial.purchaseFactor) : "1");
  const [pPrice, setPPrice] = useState(initial.purchasePrice != null ? String(initial.purchasePrice) : "0");

  const presets = presetsFor(unit);
  const preset = presets.find((p) => p.unit === pUnit);
  const esPersonalizado = !preset;

  // La unidad base de un ingrediente con historia no se puede cambiar: el
  // stock y las cantidades de receta conservarían su número y pasarían a
  // significar otra cosa. El servidor también lo rechaza.
  const tieneHistoria = !isNew && (initial.stock !== 0 || initial.purchaseFactor !== 1);

  function elegirBase(u) {
    if (tieneHistoria) return;
    setUnit(u);
    // La unidad de compra que había puede no tener sentido con la nueva base
    // (base ml comprando en libras), así que se reinicia.
    const p = presetsFor(u)[0];
    setPUnit(p.unit);
    setPFactor(String(p.factor));
  }

  function elegirCompra(p) {
    setPUnit(p.unit);
    setPFactor(String(p.factor));
  }

  const factorNum = parseFloat(pFactor);
  const factorOk = isFinite(factorNum) && factorNum > 0;
  const precioNum = parseFloat(pPrice) || 0;
  const costoBase = factorOk ? costPerBase(precioNum, factorNum) : 0;
  const puedeGuardar = name.trim().length > 0 && factorOk && String(pUnit).trim().length > 0;

  return (
    <div style={overlay} onClick={onCancel}>
      <div className="fuwa-sheet-tall" style={{ ...sheet, maxWidth: 460, display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ background: "var(--primary-soft)", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 21, color: "var(--navy)" }}>{isNew ? "Nuevo ingrediente" : "Editar ingrediente"}</div>
          <button onClick={onCancel} style={iconBtn} aria-label="Cerrar">
            <Icon name="x" size={20} />
          </button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18, overflowY: "auto" }}>
          <Field label="Nombre">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Leche entera" style={inp} autoFocus />
          </Field>
          <Field
            label="Cómo lo gastas"
            hint={tieneHistoria ? "No se puede cambiar: el ingrediente ya tiene existencia o movimientos, y las recetas pasarían a significar otra cosa." : "La receta de cada producto se escribe en esta unidad."}
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", opacity: tieneHistoria ? 0.5 : 1 }}>
              {BASE_UNITS.map((u) => (
                <Pill key={u} active={unit === u} onClick={() => elegirBase(u)} style={{ fontSize: 14, padding: "8px 16px" }}>
                  {u}
                </Pill>
              ))}
            </div>
          </Field>

          {/* Cómo se compra: aquí está el precio real de la factura, y de aquí
              sale el costo por unidad base sin que nadie divida a mano. */}
          <div style={{ background: "var(--cream)", border: "2px solid var(--line)", borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Cómo lo compras" hint="Elige el empaque tal como te lo vende el proveedor.">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {presets.map((p) => (
                  <Pill key={p.unit} active={pUnit === p.unit} onClick={() => elegirCompra(p)} style={{ fontSize: 14, padding: "8px 14px" }}>
                    {p.label}
                  </Pill>
                ))}
                <Pill active={esPersonalizado} onClick={() => { setPUnit(""); setPFactor(""); }} style={{ fontSize: 14, padding: "8px 14px" }}>
                  Otro…
                </Pill>
              </div>
            </Field>

            {esPersonalizado && (
              <Field label="Nombre del empaque" hint="Corto y en singular: caja, bolsa, saco, garrafón.">
                <input value={pUnit} onChange={(e) => setPUnit(e.target.value.slice(0, 16))} placeholder="Ej. caja" style={inp} />
              </Field>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label={`Contenido (${unit})`} hint={esPersonalizado ? CHULETA[unit] : `Cuántos ${unit} trae 1 ${pUnit || "empaque"}.`}>
                <input
                  value={pFactor}
                  onChange={(e) => setPFactor(e.target.value.replace(/[^0-9.]/g, ""))}
                  inputMode="decimal"
                  readOnly={!esPersonalizado}
                  style={{ ...inp, fontFamily: "var(--display)", fontWeight: 800, background: esPersonalizado ? "#fff" : "var(--line)", cursor: esPersonalizado ? "text" : "not-allowed" }}
                />
              </Field>
              <Field label={`Precio por ${pUnit || "empaque"} (Q)`} hint="Lo que pagas por uno, tal como viene en la factura.">
                <input value={pPrice} onChange={(e) => setPPrice(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" style={{ ...inp, fontFamily: "var(--display)", fontWeight: 800 }} />
              </Field>
            </div>

            {/* El reemplazo directo de la división mental. Si un dedo sobra, se
                nota aquí antes de guardar. */}
            <div style={{ background: factorOk ? "var(--primary-soft)" : "oklch(0.94 0.05 25)", borderRadius: 12, padding: "11px 14px", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              {factorOk ? (
                <>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--primary)" }}>
                    {money(precioNum)} por {pUnit || "empaque"} =
                  </span>
                  <span style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 17, color: "var(--primary)" }}>
                    {unitCost(costoBase)} por {unit}
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 13, fontWeight: 800, color: "oklch(0.5 0.16 25)" }}>El contenido debe ser mayor que cero.</span>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isNew ? "1fr 1fr" : "1fr", gap: 14 }}>
            <Field
              label={`Alerta bajo (${unit})`}
              hint={factorOk && pUnit !== unit ? `Avisa cuando baje de aquí · ≈ ${qty(fromBase(parseFloat(minStock) || 0, { purchaseFactor: factorNum }))} ${pUnit}` : "Avisa cuando el stock baje de aquí."}
            >
              <input value={minStock} onChange={(e) => setMinStock(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" style={{ ...inp, fontFamily: "var(--display)", fontWeight: 800 }} />
            </Field>
            {isNew && (
              <Field
                label={`Existencia inicial (${pUnit || unit})`}
                hint={factorOk && pUnit !== unit ? `= ${qty((parseFloat(stock) || 0) * factorNum)} ${unit}. Queda como primer movimiento del kardex.` : "Queda registrada como primer movimiento del kardex."}
              >
                <input value={stock} onChange={(e) => setStock(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" style={{ ...inp, fontFamily: "var(--display)", fontWeight: 800 }} />
              </Field>
            )}
          </div>
          {!isNew && (
            <div style={{ background: "var(--cream)", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "var(--muted)", lineHeight: 1.45 }}>
              Existencia actual: <b style={{ color: "var(--navy)" }}>{qty(initial.stock)} {initial.unit}</b>. Para cambiarla usa <b>Entrada</b>, <b>Merma</b> o <b>Conteo</b>, así queda el motivo registrado.
            </div>
          )}
        </div>
        <div style={{ borderTop: "2px solid var(--line)", padding: "16px 24px", display: "flex", gap: 12, alignItems: "center" }}>
          {!isNew && (
            <Btn kind="danger" size="md" icon="trash" onClick={() => onDelete(initial.id)}>
              Eliminar
            </Btn>
          )}
          <div style={{ flex: 1 }} />
          <Btn kind="ghost" size="md" onClick={onCancel}>
            Cancelar
          </Btn>
          <Btn
            kind="primary"
            size="md"
            icon="check"
            disabled={!puedeGuardar}
            onClick={() =>
              onSave(
                {
                  id: initial.id,
                  name: name.trim(),
                  unit,
                  minStock: parseFloat(minStock) || 0,
                  // `cost` no se manda: lo deriva el servidor de estos tres.
                  purchaseUnit: String(pUnit).trim() || unit,
                  purchaseFactor: factorNum,
                  purchasePrice: precioNum,
                },
                // La existencia inicial se teclea en unidad de compra.
                isNew ? { amount: parseFloat(stock) || 0, unitMode: pUnit !== unit ? "purchase" : "base" } : null
              )
            }
          >
            Guardar
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ---------- Modal: movimiento de stock ----------
function MoveForm({ ingredient, canManage, onCancel, onSave }) {
  // Compra y ajuste cambian el valor del inventario: son cosa del gerente. Al
  // cajero se le deja la merma, que es lo que pasa durante su turno.
  const tipos = canManage ? ["compra", "merma", "ajuste"] : ["merma"];
  const dual = hasPurchaseUnit(ingredient); // ¿compra y uso son unidades distintas?
  const factor = ingredient.purchaseFactor || 1;

  /* La unidad por defecto va donde cae el uso real: la compra llega en libras
     (la factura), pero nadie derrama "0.05 galones" de leche. El conteo físico
     se hace sobre empaques, así que también arranca en unidad de compra. */
  const unidadPorMotivo = (r) => (dual && r !== "merma" ? "purchase" : "base");

  const [reason, setReason] = useState(tipos[0]);
  const [unitMode, setUnitMode] = useState(() => unidadPorMotivo(tipos[0]));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  function elegirMotivo(r) {
    setReason(r);
    setUnitMode(unidadPorMotivo(r));
  }

  const enCompra = unitMode === "purchase";
  const etiqueta = enCompra ? ingredient.purchaseUnit : ingredient.unit;
  const n = parseFloat(amount);
  const valid = isFinite(n) && (reason === "ajuste" ? n >= 0 : n > 0);

  // Todo se razona en unidad base, que es donde vive el stock.
  const enBase = valid ? Math.round(n * (enCompra ? factor : 1) * 1000) / 1000 : 0;
  // El conteo físico fija el stock; compra y merma lo suman o restan.
  const preview = reason === "ajuste" ? enBase : ingredient.stock + (reason === "merma" ? -enBase : enBase);
  const deltaConteo = reason === "ajuste" ? Math.round((enBase - ingredient.stock) * 1000) / 1000 : 0;

  return (
    <div style={overlay} onClick={onCancel}>
      <div className="fuwa-sheet-tall" style={{ ...sheet, maxWidth: 440, display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ background: "var(--primary-soft)", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 20, color: "var(--navy)" }}>{ingredient.name}</div>
            <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 700 }}>
              Existencia actual: {qty(ingredient.stock)} {ingredient.unit}
            </div>
          </div>
          <button onClick={onCancel} style={iconBtn} aria-label="Cerrar">
            <Icon name="x" size={20} />
          </button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18, overflowY: "auto" }}>
          <Field label="Tipo de movimiento">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {tipos.map((r) => (
                <Pill key={r} active={reason === r} color={REASONS[r].color} onClick={() => elegirMotivo(r)} style={{ fontSize: 14, padding: "9px 16px" }}>
                  {REASONS[r].label}
                </Pill>
              ))}
            </div>
          </Field>

          {/* Solo dos opciones a propósito: la unidad base y la de compra. Con
              la lista completa de presets aparecería el error "elegí kg cuando
              quería lb". Si el ingrediente no tiene unidad de compra, no hay
              nada que elegir y el selector no se pinta. */}
          {dual && (
            <Field label="¿En qué unidad lo estás contando?">
              <div style={{ display: "flex", gap: 8 }}>
                <Pill active={enCompra} onClick={() => setUnitMode("purchase")} style={{ fontSize: 14, padding: "9px 16px" }}>
                  {ingredient.purchaseUnit}
                </Pill>
                <Pill active={!enCompra} onClick={() => setUnitMode("base")} style={{ fontSize: 14, padding: "9px 16px" }}>
                  {ingredient.unit}
                </Pill>
              </div>
            </Field>
          )}

          <Field
            label={reason === "ajuste" ? `Existencia contada (${etiqueta})` : `Cantidad (${etiqueta})`}
            hint={reason === "ajuste" ? "Escribe lo que contaste físicamente; la app calcula la diferencia." : reason === "compra" ? "Lo que entró de bodega o proveedor." : "Lo que se perdió, derramó o venció."}
          >
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder="0"
              autoFocus
              style={{ ...inp, fontFamily: "var(--display)", fontWeight: 800, fontSize: 22 }}
            />
          </Field>
          <Field label="Nota (opcional)">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. factura 1234, proveedor" style={inp} />
          </Field>

          {valid && (
            <div style={{ background: "var(--cream)", borderRadius: 12, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              {/* La conversión, antes de confirmar: es donde se ve si el factor
                  del empaque estaba bien puesto. */}
              {enCompra && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 14 }}>
                  <span style={{ fontWeight: 700, color: "var(--muted)" }}>
                    {qty(n)} {ingredient.purchaseUnit} =
                  </span>
                  <span style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 17, color: "var(--primary)" }}>
                    {qty(enBase)} {ingredient.unit}
                  </span>
                </div>
              )}
              {/* En conteo con unidad gruesa (0.1 lb son 45 g) hay que ver el
                  movimiento real, no solo el resultado. */}
              {reason === "ajuste" && enCompra && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                  <span style={{ fontWeight: 700, color: "var(--muted)" }}>Ajuste que se registrará</span>
                  <span style={{ fontWeight: 800, color: deltaConteo < 0 ? "oklch(0.55 0.16 25)" : "oklch(0.5 0.11 150)" }}>
                    {deltaConteo > 0 ? "+" : ""}{qty(deltaConteo)} {ingredient.unit}
                  </span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: enCompra ? "1px dashed var(--line)" : "none", paddingTop: enCompra ? 8 : 0 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)" }}>Existencia resultante</span>
                <span style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 20, color: preview < 0 ? "oklch(0.55 0.16 25)" : "var(--navy)" }}>
                  {qty(preview)} {ingredient.unit}
                  {dual && <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 700 }}> · ≈ {purchaseLabel(preview, ingredient)}</span>}
                </span>
              </div>
            </div>
          )}
        </div>
        <div style={{ borderTop: "2px solid var(--line)", padding: "16px 24px", display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <Btn kind="ghost" size="md" onClick={onCancel}>
            Cancelar
          </Btn>
          <Btn
            kind="primary"
            size="md"
            icon="check"
            disabled={!valid}
            onClick={() =>
              onSave({
                ingredientId: ingredient.id,
                reason,
                mode: reason === "ajuste" ? "set" : "delta",
                // Se manda la cantidad TAL COMO se tecleó y en qué unidad; la
                // conversión la hace el servidor con su propio factor.
                amount: reason === "merma" ? -n : n,
                unitMode,
                note: note.trim(),
              })
            }
          >
            Registrar
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ---------- Fila de ingrediente ----------
function IngredientRow({ ing, canManage, onMove, onEdit }) {
  const dual = hasPurchaseUnit(ing);
  const low = ing.stock <= ing.minStock;
  const negative = ing.stock < 0;
  // Barra: el mínimo es la referencia, así se ve de un vistazo cuánto colchón queda.
  const pct = Math.max(0, Math.min(100, ing.minStock > 0 ? (ing.stock / (ing.minStock * 3)) * 100 : ing.stock > 0 ? 100 : 0));
  const tone = negative ? "oklch(0.55 0.16 25)" : low ? "oklch(0.62 0.13 70)" : "oklch(0.55 0.10 150)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, background: "#fff", border: "2px solid " + (negative ? "oklch(0.85 0.08 25)" : "var(--line)"), borderRadius: "var(--r)", padding: "13px 18px" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 15.5, color: "var(--ink)" }}>{ing.name}</span>
          {low && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 800, color: tone, background: negative ? "oklch(0.94 0.05 25)" : "oklch(0.95 0.06 85)", padding: "2px 9px", borderRadius: 999 }}>
              <Icon name="alert" size={12} /> {negative ? "En negativo" : "Bajo"}
            </span>
          )}
        </div>
        <div style={{ height: 6, background: "var(--cream)", borderRadius: 999, marginTop: 7, overflow: "hidden" }}>
          <div style={{ width: pct + "%", height: "100%", background: tone, borderRadius: 999, transition: "width .2s ease" }} />
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 5 }}>
          Mínimo {qty(ing.minStock)} {ing.unit}
          {/* El precio de compra es el número que el gerente reconoce de la
              factura; el costo por unidad base va en segundo plano. */}
          {canManage && dual && ` · ${money(ing.purchasePrice)}/${ing.purchaseUnit} (${unitCost(ing.cost)}/${ing.unit})`}
          {canManage && !dual && ` · ${unitCost(ing.cost)}/${ing.unit}`}
          {canManage && ` · valor ${money(ing.stock * ing.cost)}`}
        </div>
      </div>
      <div style={{ textAlign: "right", width: 130, flexShrink: 0 }}>
        <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 21, color: negative ? "oklch(0.5 0.16 25)" : "var(--navy)", lineHeight: 1.1 }}>{qty(ing.stock)}</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 700 }}>{ing.unit}</div>
        {/* Lo que se cuenta físicamente son empaques, no gramos. */}
        {dual && <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 700, marginTop: 2 }}>≈ {purchaseLabel(ing.stock, ing)}</div>}
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <Btn kind="soft" size="sm" icon={canManage ? "plus" : "minus"} onClick={() => onMove(ing)}>
          {canManage ? "Movimiento" : "Merma"}
        </Btn>
        {canManage && (
          <button onClick={() => onEdit(ing)} title="Editar ingrediente" style={{ width: 40, height: 40, borderRadius: 12, border: "2px solid var(--line)", background: "#fff", cursor: "pointer", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="edit" size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Pantalla ----------
export function InventoryScreen({ ingredients, canManage, onSaveIngredient, onDeleteIngredient, onAdjustStock, fetchStockMoves }) {
  const [tab, setTab] = useState("stock");
  const [query, setQuery] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [moving, setMoving] = useState(null);
  const [moves, setMoves] = useState([]);
  const [loadingMoves, setLoadingMoves] = useState(false);

  const ingById = useMemo(() => Object.fromEntries(ingredients.map((i) => [i.id, i])), [ingredients]);
  const lowCount = ingredients.filter((i) => i.stock <= i.minStock).length;
  const totalValue = ingredients.reduce((s, i) => s + i.stock * i.cost, 0);

  // El kardex se pide al abrir la pestaña y tras cada movimiento.
  async function loadMoves() {
    setLoadingMoves(true);
    setMoves(await fetchStockMoves(300));
    setLoadingMoves(false);
  }
  useEffect(() => {
    if (tab === "moves") loadMoves();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = ingredients.filter((i) => {
    if (onlyLow && i.stock > i.minStock) return false;
    if (query && !i.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  async function saveMove(move) {
    const ok = await onAdjustStock(move);
    if (ok) {
      setMoving(null);
      if (tab === "moves") loadMoves();
    }
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: "22px 32px 12px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 6 }}>
          <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 28, color: "var(--navy)", margin: 0 }}>Inventario</h1>
          {canManage && tab === "stock" && (
            <Btn kind="primary" size="md" icon="plus" onClick={() => setEditing({})}>
              Nuevo ingrediente
            </Btn>
          )}
        </div>
        <p style={{ color: "var(--muted)", margin: "0 0 14px", fontSize: 15 }}>
          {canManage
            ? "Las ventas descuentan los ingredientes solas, según la receta de cada producto. Aquí registras compras, mermas y conteos."
            : "Las ventas descuentan los ingredientes solas. Aquí registras lo que se derramó, se venció o se perdió durante tu turno."}
        </p>

        {/* Resumen */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          {/* El valor del inventario es información de gestión: solo gerente. */}
          {canManage && (
            <div style={{ background: "#fff", border: "2px solid var(--line)", borderRadius: "var(--r)", padding: "12px 20px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.6 }}>Valor del inventario</div>
              <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 24, color: "var(--navy)" }}>{money(totalValue)}</div>
            </div>
          )}
          <div style={{ background: lowCount ? "oklch(0.95 0.06 85)" : "#fff", border: "2px solid " + (lowCount ? "oklch(0.85 0.1 85)" : "var(--line)"), borderRadius: "var(--r)", padding: "12px 20px" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: lowCount ? "oklch(0.45 0.1 70)" : "var(--muted)", textTransform: "uppercase", letterSpacing: 0.6 }}>Por reponer</div>
            <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 24, color: lowCount ? "oklch(0.45 0.1 70)" : "var(--navy)" }}>
              {lowCount} {lowCount === 1 ? "ingrediente" : "ingredientes"}
            </div>
          </div>
          <div style={{ background: "#fff", border: "2px solid var(--line)", borderRadius: "var(--r)", padding: "12px 20px" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.6 }}>Ingredientes</div>
            <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 24, color: "var(--navy)" }}>{ingredients.length}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, background: "var(--cream)", padding: 5, borderRadius: 999, width: "fit-content", marginBottom: 14 }}>
          {[
            ["stock", "Existencias"],
            ["moves", "Movimientos"],
          ].map(([id, lbl]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                padding: "9px 20px",
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--ui)",
                fontWeight: 800,
                fontSize: 14,
                background: tab === id ? "#fff" : "transparent",
                color: tab === id ? "var(--navy)" : "var(--muted)",
                boxShadow: tab === id ? "0 2px 6px rgba(58,65,88,.12)" : "none",
              }}
            >
              {lbl}
            </button>
          ))}
        </div>

        {tab === "stock" && (
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ position: "relative", width: 260 }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}>
                <Icon name="search" size={18} />
              </span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar ingrediente…" style={{ ...inp, paddingLeft: 40, borderRadius: 999 }} />
            </div>
            <Pill active={onlyLow} onClick={() => setOnlyLow((v) => !v)} color="oklch(0.62 0.13 70)">
              Solo por reponer
            </Pill>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 32px 32px" }}>
        {tab === "stock" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 980 }}>
            {list.map((ing) => (
              <IngredientRow key={ing.id} ing={ing} canManage={canManage} onMove={setMoving} onEdit={setEditing} />
            ))}
            {list.length === 0 && (
              <div style={{ textAlign: "center", color: "var(--muted)", padding: 60, fontSize: 15.5 }}>
                {ingredients.length === 0 ? "Aún no hay ingredientes. Crea el primero para empezar a controlar el inventario." : "Ningún ingrediente coincide con el filtro."}
              </div>
            )}
          </div>
        ) : (
          <div style={{ maxWidth: 980 }}>
            {loadingMoves ? (
              <div style={{ textAlign: "center", color: "var(--muted)", padding: 40 }}>Cargando movimientos…</div>
            ) : moves.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--muted)", padding: 60, fontSize: 15.5 }}>Todavía no hay movimientos registrados.</div>
            ) : (
              <div style={{ background: "#fff", border: "2px solid var(--line)", borderRadius: "var(--r)", overflow: "hidden" }}>
                {moves.map((m) => {
                  const ing = ingById[m.ingredientId];
                  const meta = REASONS[m.reason] || REASONS.ajuste;
                  const positive = m.delta > 0;
                  return (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", borderBottom: "1.5px dashed var(--line)" }}>
                      <div style={{ width: 96, flexShrink: 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: meta.color, background: "var(--cream)", padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap" }}>{meta.label}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 14.5, color: "var(--ink)" }}>{ing ? ing.name : "(ingrediente eliminado)"}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>
                          {new Date(m.ts).toLocaleString("es-GT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          {m.user ? " · " + m.user : ""}
                          {m.note ? " · " + m.note : ""}
                        </div>
                      </div>
                      {/* Si se registró en unidad de compra se muestra tal como
                          se tecleó ("+2 lb") con el equivalente debajo, para
                          poder cuadrar contra la factura del proveedor. Sin
                          `enteredUnit` (histórico y ventas) se ve como siempre. */}
                      <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 16, color: positive ? "oklch(0.5 0.11 150)" : "oklch(0.5 0.14 25)" }}>
                          {positive ? "+" : "−"}
                          {m.enteredUnit ? `${qty(Math.abs(m.enteredQty))} ${m.enteredUnit}` : `${qty(Math.abs(m.delta))} ${ing ? ing.unit : ""}`}
                        </div>
                        {m.enteredUnit && (
                          <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 700 }}>
                            {qty(Math.abs(m.delta))} {ing ? ing.unit : ""}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {editing && (
        <IngredientForm
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={async (data, initialStock) => {
            const created = await onSaveIngredient(data, initialStock);
            if (created) setEditing(null);
          }}
          onDelete={async (id) => {
            if (!window.confirm("¿Eliminar este ingrediente? Dejará de aparecer en el inventario; su historial de movimientos se conserva.")) return;
            if (await onDeleteIngredient(id)) setEditing(null);
          }}
        />
      )}
      {moving && <MoveForm ingredient={moving} canManage={canManage} onCancel={() => setMoving(null)} onSave={saveMove} />}
    </div>
  );
}
