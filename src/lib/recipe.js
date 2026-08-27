/* FUWA POS — recetas: cuánto ingrediente consume cada línea de una orden.

   Este módulo lo importan el cliente (avisos de faltantes, costo y margen) y
   el SERVIDOR (descuento real al cobrar). El servidor calcula el consumo sobre
   SU propia copia del menú: nunca confía en cantidades enviadas por la tablet,
   igual que ya hace con el arqueo de efectivo.

   Dónde vive cada receta:
   - producto.recipe            → consumo base de una unidad
   - producto.sizes[i].recipe   → lo que SUMA ese tamaño (Grande: +60ml leche)
   - mods[grupo].options[i].recipe → lo que suma esa opción (Shot extra: +18g café)
   - mods[grupo].options[i].swap   → { from, to }: reemplazo total

   El `swap` existe porque un reemplazo con cantidades fijas se equivoca: si
   "Leche de almendra" restara 180ml fijos, un producto que lleva 120ml dejaría
   la leche entera en negativo. El swap mueve TODO lo acumulado de un
   ingrediente a otro, ya contando el ajuste del tamaño. */

// Acumula una receta en un Map, multiplicada por las unidades vendidas.
function addRecipe(acc, recipe, times) {
  for (const item of recipe || []) {
    if (!item || !item.id) continue;
    const qty = Number(item.qty) || 0;
    if (!qty) continue;
    acc.set(item.id, (acc.get(item.id) || 0) + qty * times);
  }
}

/* Consumo de UNA línea del carrito (ya multiplicado por line.qty).
   Devuelve un Map(ingredienteId → cantidad). */
export function lineConsumption(line, menu, modGroups) {
  const acc = new Map();
  if (!line) return acc;
  const product = (menu || []).find((p) => p.id === line.productId);
  if (!product) return acc; // producto borrado del menú: no se puede calcular
  const times = Number(line.qty) || 0;
  if (!times) return acc;

  addRecipe(acc, product.recipe, times);

  // Tamaño elegido: se busca por nombre porque la línea guarda {name, delta}.
  if (line.size && product.sizes) {
    const size = product.sizes.find((s) => s.name === line.size.name);
    if (size) addRecipe(acc, size.recipe, times);
  }

  // Opciones elegidas (leche, azúcar, extras). Los reemplazos se aplican al
  // final, cuando ya está contado el ajuste del tamaño.
  const swaps = [];
  for (const m of line.mods || []) {
    const group = (modGroups || {})[m.group];
    if (!group) continue;
    const opt = (group.options || []).find((o) => o.name === m.name);
    if (!opt) continue;
    addRecipe(acc, opt.recipe, times);
    if (opt.swap && opt.swap.from && opt.swap.to) swaps.push(opt.swap);
  }
  for (const { from, to } of swaps) {
    const amount = acc.get(from);
    if (!amount) continue;
    acc.delete(from);
    acc.set(to, (acc.get(to) || 0) + amount);
  }
  return acc;
}

/* Consumo total de una orden. Devuelve un array [{id, qty}] con las cantidades
   netas, ya sin los ingredientes cuyo saldo quedó en cero. */
export function orderConsumption(lines, menu, modGroups) {
  const acc = new Map();
  for (const line of lines || []) {
    for (const [id, qty] of lineConsumption(line, menu, modGroups)) {
      acc.set(id, (acc.get(id) || 0) + qty);
    }
  }
  return [...acc.entries()].filter(([, qty]) => Math.abs(qty) > 1e-9).map(([id, qty]) => ({ id, qty: round3(qty) }));
}

// Las cantidades son gramos/ml: 3 decimales evitan que la suma de flotantes
// deje residuos como 179.99999999 en el stock.
export const round3 = (n) => Math.round(n * 1000) / 1000;

/* Costo de producir una línea, según el costo unitario de cada ingrediente.
   ingredientsById: { id: {cost, ...} }. Devuelve un número en Q. */
export function lineCost(line, menu, modGroups, ingredientsById) {
  let total = 0;
  for (const [id, qty] of lineConsumption(line, menu, modGroups)) {
    const ing = ingredientsById[id];
    if (ing) total += qty * (Number(ing.cost) || 0);
  }
  return Math.round(total * 100) / 100;
}

/* Costo de UNA unidad del producto con sus opciones por defecto (sin tamaño ni
   modificadores). Sirve para mostrar costo y margen en el editor de menú. */
export function productCost(product, ingredientsById) {
  let total = 0;
  for (const item of product.recipe || []) {
    const ing = ingredientsById[item.id];
    if (ing) total += (Number(item.qty) || 0) * (Number(ing.cost) || 0);
  }
  return Math.round(total * 100) / 100;
}

/* Cuántas unidades de un producto se pueden preparar con el stock actual.
   Devuelve Infinity si el producto no tiene receta (no se puede saber), y el
   entero de unidades disponibles si sí la tiene. */
export function producibleUnits(product, ingredientsById) {
  const recipe = (product.recipe || []).filter((r) => r && r.id && Number(r.qty) > 0);
  if (!recipe.length) return Infinity;
  let min = Infinity;
  for (const item of recipe) {
    const ing = ingredientsById[item.id];
    if (!ing) continue; // ingrediente borrado: no bloquea
    min = Math.min(min, Math.floor((Number(ing.stock) || 0) / Number(item.qty)));
  }
  return min;
}

/* Faltantes de una orden completa: ingredientes cuyo stock no alcanza.
   Devuelve [{id, name, unit, need, have}] para avisar antes de cobrar. */
export function shortagesFor(lines, menu, modGroups, ingredientsById) {
  const out = [];
  for (const { id, qty } of orderConsumption(lines, menu, modGroups)) {
    if (qty <= 0) continue; // devoluciones/reemplazos no faltan
    const ing = ingredientsById[id];
    if (!ing) continue;
    const have = Number(ing.stock) || 0;
    if (have < qty) out.push({ id, name: ing.name, unit: ing.unit, need: round3(qty), have: round3(have) });
  }
  return out;
}
