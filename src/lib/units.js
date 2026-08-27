/* FUWA POS — unidad de uso vs. unidad de compra.

   Un ingrediente vive internamente en su UNIDAD BASE (g, ml o pza): así lo
   escriben las recetas, así se descuenta al vender y así se guarda la
   existencia. Pero nadie compra en gramos: se compra por libra, por galón o
   por caja de 100 vasos.

   Este módulo es la única fuente de conversión, y lo importan tanto el
   servidor (server/db.js) como las pantallas. La regla que no se rompe:

     el stock en unidad base es el ÚNICO número autoritativo.
     Todo valor en unidad de compra es derivado: se muestra y se descarta,
     nunca se persiste ni se realimenta.

   Si se persistiera la lectura en libras y luego alguien la recontara, cada
   ciclo perdería precisión. Guardando siempre gramos, la conversión ocurre en
   los bordes (al capturar y al mostrar) y el número de adentro no se degrada. */

import { round3 } from "./recipe.js";

// Unidades en las que puede vivir un ingrediente. kg, L y oz NO están aquí a
// propósito: son formas de comprar, no de gastar, y ahora tienen su propio
// lugar como unidad de compra.
export const BASE_UNITS = ["g", "ml", "pza"];

/* Presets de compra por unidad base.

   Los factores van con precisión completa y NO se redondean. Es el único punto
   donde el redondeo sí acumula: usar 453.592 en vez de 453.59237 mete un sesgo
   multiplicativo que se suma compra tras compra. El redondeo del resultado sí
   es inofensivo, porque es de media cero.

   La ambigüedad de la onza se resuelve por construcción: la onza de peso solo
   aparece bajo `g` y la líquida solo bajo `ml`, así que nunca conviven en la
   misma lista y el usuario jamás tiene que saber que existen dos. */
export const PURCHASE_PRESETS = {
  g: [
    { unit: "g", label: "gramo", factor: 1 },
    { unit: "lb", label: "libra", factor: 453.59237 },
    { unit: "kg", label: "kilo", factor: 1000 },
    { unit: "oz", label: "onza", factor: 28.349523125 },
  ],
  ml: [
    { unit: "ml", label: "mililitro", factor: 1 },
    { unit: "L", label: "litro", factor: 1000 },
    // Galón estadounidense (el que se usa en Guatemala), no el imperial de 4546.09 ml.
    { unit: "gal", label: "galón", factor: 3785.411784 },
    { unit: "fl oz", label: "onza líquida", factor: 29.5735295625 },
  ],
  pza: [
    { unit: "pza", label: "pieza", factor: 1 },
    { unit: "docena", label: "docena", factor: 12 },
  ],
};

// Chuleta que se muestra junto al campo de contenido personalizado, para no
// obligar a nadie a recordar las equivalencias de memoria.
export const CHULETA = {
  g: "1 lb = 453.59 g · 1 kg = 1000 g · 1 oz = 28.35 g",
  ml: "1 L = 1000 ml · 1 galón = 3785.41 ml · 1 fl oz = 29.57 ml",
  pza: "El contenido es cuántas piezas trae el empaque",
};

export const presetsFor = (baseUnit) => PURCHASE_PRESETS[baseUnit] || PURCHASE_PRESETS.g;

/* Factor efectivo de un ingrediente: cuántas unidades base trae una de compra.
   Cae a 1 ante cualquier valor inservible — un factor 0 sería una división por
   cero al derivar el costo, y NaN envenenaría el stock. */
export function factorOf(ing) {
  const f = Number(ing && ing.purchaseFactor);
  return isFinite(f) && f > 0 ? f : 1;
}

// ¿Este ingrediente se compra en una unidad distinta de la que gasta?
export const hasPurchaseUnit = (ing) => !!ing && !!ing.purchaseUnit && ing.purchaseUnit !== ing.unit && factorOf(ing) !== 1;

/* Cantidad tecleada en unidad de compra → unidad base.
   round3 es la precisión del proyecto (ver recipe.js): milésimas de gramo. */
export const toBase = (qty, ing) => round3((Number(qty) || 0) * factorOf(ing));

/* Unidad base → unidad de compra, SOLO para mostrar. Nunca se guarda. */
export const fromBase = (qty, ing) => (Number(qty) || 0) / factorOf(ing);

/* Costo por unidad base a partir del precio de compra.
   Seis decimales, no tres: Q35 la libra son 0.0771624 Q/g, y a 3 decimales
   quedaría 0.077 (0.2% de error). Peor aún con los baratos — el agua a
   0.001 y el hielo a 0.002 perderían cifras enteras. Los 6 decimales solo
   existen para que el JSON no arrastre 0.07716239999999; 1e-6 Q/g sobre un
   kilo entero es una milésima de quetzal. NO "arreglar" esto a round3. */
export const costPerBase = (price, factor) => {
  const f = isFinite(Number(factor)) && Number(factor) > 0 ? Number(factor) : 1;
  return Math.round(((Number(price) || 0) / f) * 1e6) / 1e6;
};

// Etiqueta corta para la existencia en unidad de compra: "≈ 5 lb".
export function purchaseLabel(qtyBase, ing) {
  if (!hasPurchaseUnit(ing)) return "";
  const v = fromBase(qtyBase, ing);
  const n = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
  return `${n.toLocaleString("es-GT")} ${ing.purchaseUnit}`;
}
