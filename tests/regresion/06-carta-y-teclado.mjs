/* Prueba 6 — la carta real y el teclado numérico del tablero de barra.

   A) La carta de deploy/menu carga y respeta el ruteo: un combo (cocina) trae
      su bebida como extra con el nombre del platillo y destino barra, y esa
      bebida llega al tablero del barista sin duplicarse en la comanda de cocina.
   B) En el navegador, con el rol Barra: Enter marca Listo y otro Enter marca
      Entregado, en orden de llegada, sin tocar la pantalla. */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { arranca, para, cliente, base, seccion, check, eq, resumen, linea, uid, DATOS } from "./harness.mjs";
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

await nav.close();
await para();
process.exit(resumen("CARTA Y TECLADO") ? 1 : 0);
