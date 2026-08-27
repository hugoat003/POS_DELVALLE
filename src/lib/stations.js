/* FUWA POS — a dónde va cada item de una orden.

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

/* Separa las líneas por destino. Devuelve siempre las dos llaves aunque vengan
   vacías, para que quien consume no tenga que defenderse de undefined. */
export function splitByStation(lines, cats) {
  const out = { barra: [], cocina: [] };
  for (const l of lines || []) out[stationOf(l.catId, cats)].push(l);
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
