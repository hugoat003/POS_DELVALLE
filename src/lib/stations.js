/* Café del Valle POS — a dónde va cada item de una orden.

   Hay dos destinos de preparación y se comportan de forma DISTINTA a propósito:

     cocina → sale una comanda por la impresora térmica de la cocina.
              No hay pantalla ni usuario: el cocinero trabaja con el papel.
     barra  → aparece en el tablero (KDS) del barista.
              No se imprime nada: el papel ahí sobra y se acumula.

   El ticket del cliente es un tercer camino que NO usa esta división: lleva
   todos los items, porque es la cuenta que se cobra.

   Importado por el cliente y por el servidor. El servidor es quien decide de
   verdad (una tablet con el menú viejo no puede desviar un item), pero el
   cliente usa las mismas funciones para poder mostrar "esto va a cocina" antes
   de enviar. */

export const STATIONS = ["barra", "cocina"];

/* Un café vende sobre todo bebidas, así que una categoría sin destino asignado
   cae en barra. Es la opción segura: un item que va a barra por error se ve en
   pantalla y alguien reacciona; uno que va a cocina por error se imprime en un
   cuarto donde quizá no hay nadie mirando. */
export const DEFAULT_STATION = "barra";

export function stationOf(catId, cats) {
  const cat = (cats || []).find((c) => c.id === catId);
  const s = cat && cat.station;
  return STATIONS.includes(s) ? s : DEFAULT_STATION;
}

/* Destino de una opción de modificador, si tiene uno propio. Sin `station` (lo
   normal) devuelve null y la opción viaja con su producto. */
export function stationOfMod(mod) {
  const s = mod && mod.station;
  return STATIONS.includes(s) ? s : null;
}

/* Separa las líneas por destino. Devuelve siempre las dos llaves aunque vengan
   vacías, para que quien consume no tenga que defenderse de undefined.

   Un extra puede tener destino propio y salirse del de su producto. El caso que
   lo motiva: un desayuno va a cocina, pero el café que trae incluido lo prepara
   la barra — mientras el aguacate o el frijol del mismo desayuno se quedan en
   cocina. Cuando eso pasa se emite una LÍNEA DERIVADA en la otra estación:

     cocina  →  1× Desayuno chapín   (aguacate, frijol)
     barra   →  1× Café              · del Desayuno chapín

   La derivada lleva `derivada: true` y `desdeLinea` con el producto del que
   salió, para que el barista sepa a qué plato pertenece. Y el extra se quita de
   la línea base: si la cocina siguiera viendo "café" en el desayuno, lo
   prepararía también y saldrían dos.

   Esto es SOLO ruteo de preparación. Estas listas alimentan el tablero de barra
   y la comanda impresa, nada más: el total, el ticket del cliente y el descuento
   de inventario se calculan aparte, sobre las líneas reales. Una derivada nunca
   suma dinero ni consume existencias dos veces. */
export function splitByStation(lines, cats) {
  const out = { barra: [], cocina: [] };
  for (const l of lines || []) {
    const base = stationOf(l.catId, cats);
    const propios = [];
    const desviados = [];
    for (const m of l.mods || []) {
      const st = stationOfMod(m);
      if (st && st !== base) desviados.push([st, m]);
      else propios.push(m);
    }
    // Sin desvíos la línea pasa tal cual, sin copiarla.
    out[base].push(desviados.length ? { ...l, mods: propios } : l);
    for (const [st, m] of desviados) {
      out[st].push({
        ...l,
        uid: `${l.uid}+${m.name}`,
        name: m.name,
        size: null,
        mods: [],
        desdeLinea: l.name,
        derivada: true,
      });
    }
  }
  return out;
}

/* Líneas vivas: las que siguen contando para el KDS, el ticket y el total.

   Una línea anulada NO se borra del arreglo. Se marca y se queda, porque es la
   prueba de que existió: se imprimió una comanda por ella, se descontó
   inventario y luego se devolvió. Borrarla dejaría un hueco inexplicable entre
   el papel que salió de la cocina y lo que registra el sistema. */
export const activeLines = (lines) => (lines || []).filter((l) => !l.voided);

/* Líneas que todavía no se han mandado a preparar.

   Al enviar se le estampa `sentSeq` a cada línea. Así, cuando la mesa pide dos
   postres más y se vuelve a enviar, la cocina recibe una comanda que dice
   "AGREGADO" con solo esos dos, en vez de reimprimir la orden completa y que
   alguien prepare de nuevo lo que ya salió.

   Una línea anulada nunca está pendiente: ya se envió y ya se canceló. */
export const pendingLines = (lines) => (lines || []).filter((l) => !l.sentSeq && !l.voided);

export const stampSent = (lines, seq) =>
  (lines || []).map((l) => (l.sentSeq || l.voided ? l : { ...l, sentSeq: seq }));
