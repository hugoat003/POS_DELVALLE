/* Prueba 6 — la carta real y el teclado numérico del tablero de barra.

   A) La carta de deploy/menu carga y respeta el ruteo: un combo (cocina) trae
      su bebida como extra con el nombre del platillo y destino barra, y esa
      bebida llega al tablero del barista sin duplicarse en la comanda de cocina.
   B) En el navegador, con el rol Barra: Enter marca Listo y otro Enter marca
      Entregado, en orden de llegada, sin tocar la pantalla. */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { arranca, para, cliente, base, seccion, check, eq, resumen, linea, pagoEfectivo, uid, DATOS } from "./harness.mjs";
import { CATEGORIES, MODS, PRODUCTS } from "../../deploy/menu/cafe-del-valle.mjs";

await arranca({ puerto: 5216 });
const admin = cliente();
const cajero = cliente();
await admin.login("u1", "1234");
await cajero.login("u2", "1111");

const producto = (nombre) => PRODUCTS.find((p) => p.name === nombre);
const linePara = (nombre, extra = {}) => {
  const p = producto(nombre);
  return linea({ productId: p.id, name: p.name, catId: p.cat, price: p.price, ...extra });
};
// Lo que el modal de opciones añade al elegir un grupo de una sola opción.
const modDe = (grupo) => {
  const o = MODS[grupo].options[0];
  return { group: grupo, name: o.name, delta: o.delta, ...(o.station ? { station: o.station } : {}) };
};

seccion("50. La carta se carga completa");
{
  eq("PUT categorías", (await admin.put("/api/state/cdv_cats", CATEGORIES)).status, 200);
  eq("PUT opciones", (await admin.put("/api/state/cdv_mods", MODS)).status, 200);
  eq("PUT productos", (await admin.put("/api/state/cdv_menu", PRODUCTS)).status, 200);
  const st = await admin.get("/api/state");
  eq("el servidor guarda los 86 productos", st.data.config.cdv_menu.length, 86);
  eq("y las 13 categorías", st.data.config.cdv_cats.length, 13);
  check("las categorías de comida van a cocina y las de bebida a barra",
    st.data.config.cdv_cats.filter((c) => c.station === "cocina").length === 8 &&
    st.data.config.cdv_cats.filter((c) => c.station === "barra").length === 5);
  check("los tres combos y los dos afogatto llevan su bebida a barra",
    ["Combo N.1", "Combo N.2", "Combo N.3", "Afogatto", "Afogatto Black"].every((n) => {
      const g = MODS[producto(n).mods.find((m) => m.startsWith("bebida_"))];
      return g && g.options.length === 1 && g.options[0].name === n && g.options[0].station === "barra";
    }));
  eq("Flaming Hot cuesta Q5 más que el resto de las alitas",
    producto("Alitas Flaming Hot").price - producto("Alitas Buffalo").price, 5);
}

seccion("51. Un combo manda su bebida al barista y no a cocina");
{
  eq("abre caja", (await cajero.post("/api/shifts/open", { openingCash: 200 })).status, 200);
  const combo = linePara("Combo N.1", { mods: [modDe("bebida_combo1")] });
  const ab = await cajero.post("/api/orders/open", { id: uid("O"), lines: [combo], orderType: "Para llevar", table: null });
  eq("se abre la cuenta", ab.status, 200);
  const env = await cajero.post(`/api/orders/${ab.data.order.id}/enviar`);
  eq("se envía a preparar", env.status, 200);

  const st = await admin.get("/api/state");
  const enTablero = st.data.kds.find((o) => o.id === ab.data.order.id);
  check("la orden aparece en el tablero de barra", !!enTablero);
  eq("el tablero solo trae la bebida (1 línea)", enTablero && enTablero.lines.length, 1);
  const l = enTablero.lines[0];
  eq("con el nombre del platillo", l.name, "Combo N.1");
  eq("marcada como derivada de ese platillo", l.desdeLinea, "Combo N.1");
  eq("y sin precio propio que duplique la venta", (st.data.openOrders.find((o) => o.id === ab.data.order.id).lines[0].basePrice), 140);

  // La comanda de cocina lleva el platillo; la bebida ya no viaja con él.
  const TICKETS = path.join(DATOS, "tickets");
  const leerComandas = () =>
    (fs.existsSync(TICKETS) ? fs.readdirSync(TICKETS).filter((f) => f.startsWith("comanda") && f.endsWith(".txt")) : [])
      .map((f) => fs.readFileSync(path.join(TICKETS, f), "utf8")).join("\n");
  // El worker de impresión corre por intervalos: se espera a que salga el papel.
  for (let i = 0; i < 45 && !leerComandas(); i++) await new Promise((r) => setTimeout(r, 200));
  const texto = leerComandas();
  check("cocina recibe una comanda con el combo", /Combo N\.1/.test(texto), texto.slice(0, 200));
  check("y esa comanda NO repite la bebida como extra", (texto.match(/Combo N\.1/g) || []).length === 1,
    `apariciones: ${(texto.match(/Combo N\.1/g) || []).length}`);

  await cajero.post(`/api/orders/${ab.data.order.id}/void`, { reason: "prueba" });
}

// ---------------------------------------------------------------- navegador
seccion("52. Teclado numérico: Enter = Listo, otro Enter = Entregado");
const nav = await chromium.launch({ channel: "chrome", headless: true });
const p = await (await nav.newContext({ viewport: { width: 1080, height: 1920 } })).newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(String(e)));

async function tablero() {
  return (await admin.get("/api/state")).data.kds.map((o) => ({ n: o.number, estado: o.prepStatus || "pendiente" }));
}
const estadoDe = async (n) => (await tablero()).find((o) => o.n === n);

{
  // Dos órdenes de barra, A antes que B.
  const crear = async (nombre) => {
    const ab = await cajero.post("/api/orders/open", { id: uid("O"), lines: [linePara(nombre)], orderType: "Para llevar", table: null });
    await cajero.post(`/api/orders/${ab.data.order.id}/enviar`);
    return ab.data.order;
  };
  const A = await crear("Café Negro");
  await new Promise((r) => setTimeout(r, 30));
  const B = await crear("Capuccino Clásico");
  const nA = (await admin.get("/api/state")).data.kds.find((o) => o.id === A.id).number;
  const nB = (await admin.get("/api/state")).data.kds.find((o) => o.id === B.id).number;

  await p.goto(base(), { waitUntil: "networkidle" });
  await p.getByText("Ana Lucía", { exact: false }).first().click();
  for (const d of "2222") await p.getByRole("button", { name: d, exact: true }).first().click();
  await p.waitForTimeout(1500);
  check("el barista entra directo al tablero", await p.getByRole("heading", { name: "Barra" }).isVisible().catch(() => false));
  eq("el barista NO ve la barra lateral", await p.locator("nav.cdv-sidebar").count(), 0);
  const salir = p.getByRole("button", { name: "Cerrar sesión" });
  check("pero 'Cerrar sesión' sigue a la vista, abajo a la izquierda", await salir.isVisible().catch(() => false));
  const caja = await salir.boundingBox();
  check("y queda en la esquina inferior izquierda", caja && caja.x < 100 && caja.y > 1700, JSON.stringify(caja));
  check("la leyenda del teclado está a la vista", await p.getByText("Listo → Entregado").isVisible().catch(() => false));
  check("la comanda más antigua está resaltada", (await p.locator('[data-kds-foco="1"]').innerText()).includes("#" + nA));

  const antes = await tablero();
  eq("ambas empiezan pendientes", antes.every((o) => o.estado === "pendiente"), true);

  await p.keyboard.press("NumpadEnter");
  await p.waitForTimeout(700);
  eq("Enter: la más antigua queda LISTA", (await estadoDe(nA)).estado, "listo");
  eq("y la otra sigue pendiente", (await estadoDe(nB)).estado, "pendiente");
  check("el resaltado se queda en la comanda lista (siguiente Enter = Entregado)",
    (await p.locator('[data-kds-foco="1"]').innerText()).includes("#" + nA));

  await p.keyboard.press("NumpadEnter");
  await p.waitForTimeout(700);
  eq("otro Enter: la primera sale del tablero, ENTREGADA", await estadoDe(nA), undefined);
  check("el resaltado salta a la siguiente comanda",
    (await p.locator('[data-kds-foco="1"]').innerText()).includes("#" + nB));

  await p.keyboard.press("NumpadDecimal");
  await p.waitForTimeout(700);
  eq("'.' deshace: la primera vuelve al tablero como lista", (await estadoDe(nA) || {}).estado, "listo");

  // Deshacer una ENTREGA devuelve el ticket al tablero en el siguiente sync
  // (cada 4 s): la comanda entregada ya no estaba en pantalla.
  await p.getByText("#" + nA).first().waitFor({ timeout: 8000 });
  await p.waitForTimeout(300);
  // Tras deshacer, el resaltado está en la más antigua (A, lista); '+' pasa a B.
  const foco = async () => (await p.locator('[data-kds-foco="1"]').innerText());
  check("antes de '+' el resaltado está en A", (await foco()).includes("#" + nA));
  await p.keyboard.press("NumpadAdd");
  await p.waitForTimeout(300);
  check("'+' mueve el resaltado a B", (await foco()).includes("#" + nB));
  await p.keyboard.press("NumpadSubtract");
  await p.waitForTimeout(300);
  check("'−' lo devuelve a A", (await foco()).includes("#" + nA));

  // Un toque en el botón deja ese botón con el foco del navegador; el Enter
  // siguiente no debe pulsarlo ADEMÁS de avanzar la comanda resaltada.
  const rango = { pendiente: 0, listo: 1 };
  await p.keyboard.press("NumpadAdd"); // resaltado en B (pendiente)
  await p.getByRole("button", { name: "Listo", exact: true }).first().click(); // toca B → listo
  await p.waitForTimeout(700);
  const tras = await tablero();
  await p.keyboard.press("NumpadEnter");
  await p.waitForTimeout(700);
  const despues = await tablero();
  const pasos = tras.reduce((s, o) => s + ((despues.find((d) => d.n === o.n) ? rango[despues.find((d) => d.n === o.n).estado] : 2) - rango[o.estado]), 0);
  check("tras tocar un botón, un Enter avanza un solo paso (no dos)", pasos === 1, `pasos: ${pasos}`);

  check("sin errores de JavaScript", errores.length === 0, errores.slice(0, 2).join(" | "));

  await salir.click();
  await p.waitForTimeout(800);
  check("'Cerrar sesión' devuelve al acceso por PIN", await p.getByText("Ana Lucía", { exact: false }).first().isVisible().catch(() => false));
}

seccion("53. Tomar orden: carrusel de categorías y envío con mesa");
{
  const c = await (await nav.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const erroresC = [];
  c.on("pageerror", (e) => erroresC.push(String(e)));
  await c.goto(base(), { waitUntil: "networkidle" });
  await c.getByText("Luis", { exact: false }).first().click();
  for (const d of "1111") await c.getByRole("button", { name: d, exact: true }).first().click();
  await c.waitForTimeout(1500);

  // --- carrusel
  const cats = c.locator(".cdv-cats");
  const medidas = await cats.evaluate((el) => ({
    ancho: el.clientWidth, total: el.scrollWidth,
    tops: [...new Set([...el.children].map((b) => b.offsetTop))].length,
    n: el.children.length,
  }));
  check("las 14 categorías (Todo + 13) están en el carrusel", medidas.n === 14, JSON.stringify(medidas));
  eq("van en UNA sola fila (no se envuelven)", medidas.tops, 1);
  check("hay más categorías de las que caben: se puede deslizar", medidas.total > medidas.ancho, JSON.stringify(medidas));

  const tarjetasAntes = await c.locator(".cdv-card").count();
  const cajaChip = await cats.locator("button").nth(2).boundingBox();
  await c.mouse.move(cajaChip.x + 20, cajaChip.y + 15);
  await c.mouse.down();
  await c.mouse.move(cajaChip.x - 250, cajaChip.y + 15, { steps: 8 });
  await c.mouse.up();
  await c.waitForTimeout(300);
  const despues = await cats.evaluate((el) => el.scrollLeft);
  check("arrastrar con el mouse hacia la izquierda muestra las demás categorías", despues > 100, `scrollLeft=${despues}`);
  eq("y el arrastre NO cuenta como clic en una categoría", await c.locator(".cdv-card").count(), tarjetasAntes);

  await cats.locator("button", { hasText: "Alitas" }).click();
  await c.waitForTimeout(400);
  check("tocar una categoría la selecciona (solo se ven sus productos)", (await c.locator(".cdv-card").count()) === 5, `tarjetas: ${await c.locator(".cdv-card").count()}`);

  // --- enviar con mesa desde la pestaña Orden
  await cats.locator("button", { hasText: "Calientes" }).scrollIntoViewIfNeeded();
  await cats.locator("button", { hasText: "Calientes" }).click();
  await c.getByText("Café Negro", { exact: false }).first().click();
  await c.waitForTimeout(400);
  check("con 'Para aquí' aparece 'Enviar a preparar'", await c.getByRole("button", { name: /Enviar a preparar/ }).isVisible().catch(() => false));

  await c.getByRole("button", { name: /Enviar a preparar/ }).click();
  await c.waitForTimeout(500);
  check("sin mesa pide elegirla (no envía)", await c.getByText("¿En qué mesa va la orden?").isVisible().catch(() => false));
  await c.getByRole("button", { name: /^Mesa\s*3$/ }).click();
  await c.waitForTimeout(400);
  check("la mesa queda elegida", await c.getByText(/Mesa 3/).first().isVisible().catch(() => false));

  await c.getByRole("button", { name: /Enviar a preparar/ }).click();
  await c.waitForTimeout(1500);
  check("confirma que salió a preparar", await c.getByText(/Enviado:/).first().isVisible().catch(() => false));
  check("la pantalla pasa a la cuenta de esa mesa", await c.getByText(/Cuenta · Mesa 3/).first().isVisible().catch(() => false));
  check("lo enviado se ve como 'Ya enviado a preparar'", await c.getByText("Ya enviado a preparar").isVisible().catch(() => false));
  const est = (await admin.get("/api/state")).data;
  check("el servidor tiene la cuenta abierta en la mesa 3", est.openOrders.some((o) => o.table && o.table.label === "3"));
  check("y su bebida llegó al tablero de barra", est.kds.some((o) => o.table && o.table.label === "3"));
  check("sin errores de JavaScript", erroresC.length === 0, erroresC.slice(0, 2).join(" | "));
}

seccion("54. Editor de menú: los 16 grupos de opciones son editables");
{
  const g = await (await nav.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const erroresG = [];
  g.on("pageerror", (e) => erroresG.push(String(e)));
  await g.goto(base(), { waitUntil: "networkidle" });
  await g.getByText("María José", { exact: false }).first().click();
  for (const d of "1234") await g.getByRole("button", { name: d, exact: true }).first().click();
  await g.waitForTimeout(1200);
  await g.getByRole("button", { name: /^Menú/ }).click();
  await g.waitForTimeout(400);
  await g.getByRole("button", { name: "Leche, azúcar y extras" }).click();
  await g.waitForTimeout(400);

  // Antes solo se veían 3 grupos (Leche, Azúcar, Extras); la carta trae 16.
  const chips = g.locator("button[title='Borrar este grupo de opciones']");
  eq("los 13 grupos que no son de fábrica tienen su botón de borrar", await chips.count(), 13);
  check("un grupo de sabor de la carta aparece (Sidras Italianas)", await g.getByText("Sabor", { exact: false }).count() > 0);
  check("y uno de bebida incluida en combo aparece", await g.getByText("Bebida incluida").first().isVisible().catch(() => false));

  // Con 16 grupos cargados el botón de crear uno nuevo quedaba hasta el fondo
  // de una página de miles de píxeles: en la práctica, invisible. Tiene que
  // estar arriba de todo, sin desplazarse.
  const botonNuevo = g.getByRole("button", { name: "Nuevo grupo de opciones" });
  const posBoton = await botonNuevo.boundingBox();
  check("'Nuevo grupo de opciones' está a la vista sin hacer scroll", posBoton && posBoton.y < 500, JSON.stringify(posBoton));

  // Crear un grupo nuevo desde la UI.
  await botonNuevo.click();
  await g.getByPlaceholder(/Temperatura, Sabor/).fill("Punto de la carne");
  await g.getByRole("button", { name: "Puede elegir varias" }).click();
  await g.getByRole("button", { name: "Crear grupo" }).click();
  await g.waitForTimeout(500);
  check("el grupo nuevo aparece en la lista", await g.getByText("Punto de la carne").isVisible().catch(() => false));

  // El producto "Combo N.1" ya trae su extra de bebida incluida en los datos:
  // el checklist del producto tiene que mostrarlo marcado, no solo existir.
  await g.getByRole("button", { name: "Productos" }).click();
  await g.waitForTimeout(300);
  await g.getByText("Combo N.1", { exact: true }).click();
  await g.waitForTimeout(400);
  const filaExtra = g.getByRole("button", { name: "Bebida incluida" });
  check("Combo N.1 muestra su grupo de bebida ya marcado", (await filaExtra.locator("svg").count()) > 0);

  // El caso real que falló: crear un grupo SIN salir del producto que se
  // estaba editando (antes solo existía esa posibilidad desde la pestaña
  // separada de Opciones), y que quede marcado ahí mismo sin tocar nada más.
  await g.mouse.click(10, 10); // cierra Combo N.1 sin guardar (clic fuera de la hoja)
  await g.waitForTimeout(300);
  await g.getByText("Hamburguesa Crispy", { exact: true }).click();
  await g.waitForTimeout(400);
  await g.getByRole("button", { name: "Nuevo grupo de opciones" }).scrollIntoViewIfNeeded();
  await g.getByRole("button", { name: "Nuevo grupo de opciones" }).click();
  await g.getByPlaceholder(/Temperatura, Sabor/).fill("Término de la carne");
  await g.getByRole("button", { name: "Crear y marcar" }).click();
  await g.waitForTimeout(400);
  const filaNueva = g.getByRole("button", { name: "Término de la carne" });
  check("el grupo creado desde el producto aparece YA marcado, sin tocarlo", (await filaNueva.locator("svg").count()) > 0);
  await g.getByRole("button", { name: "Guardar" }).click();
  // La config se sube con 500 ms de retardo (ver scheduleServerWrite): leer
  // antes devuelve el valor viejo y la prueba falla sin que nada esté roto.
  await g.waitForTimeout(2000);
  const estG = await admin.get("/api/state");
  const hc = estG.data.config.cdv_menu.find((x) => x.name === "Hamburguesa Crispy");
  check("y quedó guardado en el servidor", hc && hc.mods.includes("termino_de_la_carne"), JSON.stringify(hc && hc.mods));
  check("sin errores de JavaScript", erroresG.length === 0, erroresG.slice(0, 2).join(" | "));
}

seccion("55. Agregar a una mesa en curso NO la manda al final del tablero");
{
  /* El caso que reportó el dueño con el local lleno: estaba preparando una
     comanda, a esa mesa se le agregó algo más, y el ticket que tenía en las
     manos se le fue hasta el final del tablero. */
  const mesa = (id, label) => ({ id, label, areaId: "salon", areaName: "Salón" });
  const abrirYEnviar = async (nombre, m) => {
    const a = await cajero.post("/api/orders/open", { id: uid("O"), lines: [linePara(nombre)], orderType: "Aquí", table: m });
    await cajero.post(`/api/orders/${a.data.order.id}/enviar`);
    return a.data.order.id;
  };
  const tablero = async () => (await admin.get("/api/state")).data.kds.map((o) => o.id);

  // Tres mesas en cola, en orden de llegada.
  const A = await abrirYEnviar("Café Negro", mesa("s4", "4"));
  await new Promise((r) => setTimeout(r, 1100));
  const B = await abrirYEnviar("Frappe Clásico", mesa("s5", "5"));
  await new Promise((r) => setTimeout(r, 1100));
  const C = await abrirYEnviar("Chai Clásico", mesa("s6", "6"));

  // Posiciones relativas: el tablero puede traer comandas de otras pruebas.
  const antes = await tablero();
  const posA = antes.indexOf(A);
  check("las tres mesas entran al tablero en orden de llegada",
    posA >= 0 && antes.indexOf(B) === posA + 1 && antes.indexOf(C) === posA + 2,
    `A=${posA} B=${antes.indexOf(B)} C=${antes.indexOf(C)}`);

  // A la mesa que el barista está preparando (la primera) se le agrega algo.
  await new Promise((r) => setTimeout(r, 1100));
  const cta = (await admin.get("/api/state")).data.openOrders.find((o) => o.id === A);
  const agregada = await cajero.put(`/api/orders/${A}/lines`, {
    lines: [...cta.lines, linePara("Capuccino Clásico")],
    table: mesa("s4", "4"),
    orderType: "Aquí",
  });
  eq("se le puede agregar un producto a la cuenta", agregada.status, 200);
  const env = await cajero.post(`/api/orders/${A}/enviar`);
  eq("y se manda a preparar", env.status, 200);

  const despues = await tablero();
  eq("la mesa en curso NO se mueve de su lugar", despues.indexOf(A), posA);
  check("sigue por delante de las que llegaron después",
    despues.indexOf(A) < despues.indexOf(B) && despues.indexOf(B) < despues.indexOf(C),
    `A=${despues.indexOf(A)} B=${despues.indexOf(B)} C=${despues.indexOf(C)}`);
  check("y NO se fue al final del tablero", despues.indexOf(A) !== despues.length - 1);

  const enTablero = (await admin.get("/api/state")).data.kds.find((o) => o.id === A);
  eq("el barista ve los dos productos de esa mesa", enTablero.lines.length, 2);
  check("el cronómetro sí se actualiza al último envío (no marca en rojo de más)",
    enTablero.sentAt > enTablero.pendingSince, `sentAt=${enTablero.sentAt} pendingSince=${enTablero.pendingSince}`);

  // El caso contrario tiene que seguir funcionando: una mesa que ya recibió
  // TODO y vuelve a pedir es trabajo nuevo, y ahí sí va al final.
  await admin.post(`/api/orders/${B}/prep`, { status: "listo" });
  await admin.post(`/api/orders/${B}/prep`, { status: "entregado" });
  check("la mesa entregada sale del tablero", !(await tablero()).includes(B));
  await new Promise((r) => setTimeout(r, 1100));
  const ctaB = (await admin.get("/api/state")).data.openOrders.find((o) => o.id === B);
  await cajero.put(`/api/orders/${B}/lines`, { lines: [...ctaB.lines, linePara("Café Negro")], table: mesa("s5", "5"), orderType: "Aquí" });
  await cajero.post(`/api/orders/${B}/enviar`);
  const final = await tablero();
  eq("si vuelve a pedir después de recibir todo, entra al final", final.indexOf(B), final.length - 1);
}

seccion("56. Al abrir caja, el tablero no arrastra lo que quedó sin marcar");
{
  /* En el local se acumularon 46 comandas en trece días: ventas cobradas a las
     que nadie les marcó Listo ni Entregado. El tablero no las soltaba nunca, y
     al abrir caja el barista las encontraba por delante de las del día. */
  const p = producto("Café Negro");
  const venta = await cajero.post("/api/orders", {
    id: uid("O"),
    orderType: "Para llevar",
    table: null,
    lines: [linea({ productId: p.id, name: p.name, catId: p.cat, price: p.price })],
    payment: pagoEfectivo(p.price),
  });
  eq("se cobra una venta de mostrador con bebida", venta.status, 200);
  const olvidada = venta.data.order.id;
  check("entra al tablero de barra", (await admin.get("/api/state")).data.kds.some((o) => o.id === olvidada));

  // Fin del día: se descartan las cuentas de mesa que quedaron de las pruebas
  // anteriores (el cierre se bloquea con cuentas sin cobrar) y se cierra caja.
  for (const o of (await admin.get("/api/state")).data.openOrders) {
    await cajero.post(`/api/orders/${o.id}/void`, { reason: "fin de pruebas" });
  }
  const cierre = await cajero.post("/api/shifts/close", { countedCash: 200 });
  eq("se cierra la caja", cierre.status, 200);
  eq("con la caja cerrada el tablero queda vacío", (await admin.get("/api/state")).data.kds.length, 0);

  // Día siguiente.
  eq("se abre caja de nuevo", (await cajero.post("/api/shifts/open", { openingCash: 200 })).status, 200);
  const alAbrir = (await admin.get("/api/state")).data.kds;
  eq("el tablero arranca LIMPIO, sin lo de ayer", alAbrir.length, 0);
  check("y la comanda olvidada ya no reaparece", !alAbrir.some((o) => o.id === olvidada));

  // Lo del día nuevo sí entra con normalidad.
  const hoy = await cajero.post("/api/orders", {
    id: uid("O"),
    orderType: "Para llevar",
    table: null,
    lines: [linea({ productId: p.id, name: p.name, catId: p.cat, price: p.price })],
    payment: pagoEfectivo(p.price),
  });
  const tablero = (await admin.get("/api/state")).data.kds;
  eq("una comanda del turno nuevo sí aparece", tablero.length, 1);
  eq("y es la de hoy", tablero[0].id, hoy.data.order.id);

  // El tablero del dueño cuenta lo mismo que la pantalla, no lo acumulado.
  const dash = await admin.get("/api/dashboard");
  eq("el tablero del dueño cuenta solo lo del turno", dash.data.preparacion.pendientes, 1);
}

await nav.close();
await para();
process.exit(resumen("CARTA Y TECLADO") ? 1 : 0);
