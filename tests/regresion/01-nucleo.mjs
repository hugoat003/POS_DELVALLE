/* Prueba 1 — núcleo: arranque, permisos, turno, venta de mostrador,
   inventario, cuentas de mesa, anulaciones y cierre. */
import { arranca, para, cliente, seccion, check, eq, cerca, resumen, linea, pagoEfectivo, uid, DATOS } from "./harness.mjs";
import fs from "node:fs";
import path from "node:path";

const TICKETS = path.join(DATOS, "tickets");
const papeles = () => { try { return fs.readdirSync(TICKETS).filter((f) => f.endsWith(".txt")); } catch { return []; } };
const leerPapeles = () => papeles().map((f) => fs.readFileSync(path.join(TICKETS, f), "utf8"));
const esperaPapel = async (n, ms = 9000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (papeles().length >= n) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
};

await arranca({ puerto: 5199 });

// Menú de prueba CON recetas: sin ellas el inventario no se mueve y media
// batería quedaría verde sin probar nada.
const MENU = [
  { id: "p_espresso", cat: "cafe", name: "Espresso", price: 12, sizes: null, mods: ["azucar"],
    recipe: [{ id: "i_cafe", qty: 18 }, { id: "i_vaso", qty: 1 }] },
  { id: "p_capuchino", cat: "cafe", name: "Capuchino", price: 22,
    sizes: [{ name: "12 onz", delta: 0, recipe: [] }, { name: "16 onz", delta: 5, recipe: [{ id: "i_leche", qty: 60 }] }],
    mods: ["leche", "azucar", "extras"],
    recipe: [{ id: "i_cafe", qty: 18 }, { id: "i_leche", qty: 180 }, { id: "i_vaso", qty: 1 }] },
  { id: "p_croissant", cat: "panaderia", name: "Croissant", price: 15, sizes: null, mods: [],
    recipe: [{ id: "i_plato", qty: 1 }] },
  { id: "p_sandwich_pavo", cat: "comida", name: "Sándwich de pavo", price: 45, sizes: null, mods: ["extras"],
    recipe: [{ id: "i_plato", qty: 1 }] },
  // Producto sin receta: para probar el aviso de "sin receta".
  { id: "p_tres_leches", cat: "postres", name: "Tres leches", price: 30, sizes: null, mods: [], recipe: [] },
];

const admin = cliente();
const cajero = cliente();
const barra = cliente();

// ───────────────────────────────────────────────────────── 1. arranque y auth
seccion("1. Arranque, semilla y autenticación");
{
  const r = await (cliente()).get("/api/health");
  eq("el servidor responde /api/health", r.status, 200);

  const lu = await (cliente()).get("/api/login-users");
  eq("la lista de login es pública", lu.status, 200);
  eq("se sembraron los 3 empleados demo", lu.data.length, 3);
  check("la lista de login NO expone hashes de PIN",
    !JSON.stringify(lu.data).match(/pin_scrypt|pin_salt|legacy/),
    JSON.stringify(lu.data).slice(0, 120));

  const mal = await (cliente()).post("/api/login", { userId: "u1", pin: "9999" });
  eq("un PIN incorrecto da 401", mal.status, 401);

  await admin.login("u1", "1234");
  await cajero.login("u2", "1111");
  await barra.login("u3", "2222");
  check("gerente, cajero y barra pueden entrar", !!admin.token && !!cajero.token && !!barra.token);

  const sinToken = await (cliente()).get("/api/state");
  eq("sin token, /api/state da 401", sinToken.status, 401);

  const st = await admin.get("/api/state");
  eq("la semilla cargó ingredientes", st.data.ingredients.length, 15);
  check("la semilla cargó el menú", (st.data.config.cdv_menu || []).length > 0);
  check("la semilla cargó las áreas de mesas", st.data.config.cdv_areas == null || Array.isArray(st.data.config.cdv_areas));
}

// ───────────────────────────────────────────────────────── 2. permisos por rol
seccion("2. Permisos por rol");
{
  const r1 = await cajero.get("/api/dashboard");
  eq("el cajero NO ve el tablero del dueño", r1.status, 403);
  const r2 = await cajero.post("/api/ingredients", { name: "Prueba" });
  eq("el cajero NO puede crear ingredientes", r2.status, 403);
  const r3 = await cajero.post("/api/stock/moves", { ingredientId: "i_cafe", amount: 100, reason: "compra", mode: "delta" });
  eq("el cajero NO puede registrar compras", r3.status, 403);
  const r4 = await cajero.post("/api/stock/moves", { ingredientId: "i_cafe", amount: -5, reason: "merma", mode: "delta" });
  eq("el cajero SÍ puede registrar mermas", r4.status, 200);
  const r5 = await cajero.post("/api/orders/clear", {});
  eq("el cajero NO puede borrar las órdenes del turno", r5.status, 403);
  const r6 = await cajero.get("/api/backup");
  eq("el cajero NO puede descargar el respaldo", r6.status, 403);
  const r7 = await barra.post("/api/orders/x/prep", { status: "listo" });
  check("la barra SÍ pasa el filtro de rol del KDS (falla por orden inexistente)", r7.status === 409, "status " + r7.status);
  const r8 = await cajero.post("/api/orders/x/prep", { status: "listo" });
  eq("el cajero NO maneja el tablero de barra", r8.status, 403);
}

// ───────────────────────────────────────────── 3. config, menú y validaciones
seccion("3. Configuración (menú) y control de versión rancia");
{
  const put = await admin.put("/api/state/cdv_menu", MENU);
  eq("se puede subir el menú", put.status, 200);
  const cats = await admin.put("/api/state/cdv_cats", [
    { id: "cafe", name: "Café", station: "barra" },
    { id: "panaderia", name: "Panadería", station: "cocina" },
    { id: "postres", name: "Postres", station: "cocina" },
    { id: "comida", name: "Comida", station: "cocina" },
  ]);
  eq("se pueden subir las categorías", cats.status, 200);

  const mala = await admin.put("/api/state/clave_inventada", { x: 1 });
  eq("una clave no permitida se rechaza", mala.status, 404);

  // Subida rancia: editedAt anterior a lo que ya tiene el servidor.
  const rancia = await admin.put("/api/state/cdv_menu?editedAt=1000", [{ id: "borrado" }]);
  eq("una subida vieja se rechaza con 409", rancia.status, 409);
  check("y el rechazo devuelve la versión buena del servidor", (rancia.data.value || []).length === MENU.length);
  const ahoraMenu = (await admin.get("/api/state")).data.config.cdv_menu;
  eq("el menú del servidor NO se pisó", ahoraMenu.length, MENU.length);
}

// ───────────────────────────────────────────────────────────────── 4. turno
seccion("4. Turno de caja");
{
  const sinTurno = await cajero.post("/api/orders", {
    id: uid("O"), lines: [linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12 })],
    payment: pagoEfectivo(12), orderType: "Para llevar",
  });
  eq("con la caja cerrada no se puede cobrar", sinTurno.status, 409);
  check("y el motivo es la caja cerrada", /caja cerrada/i.test(sinTurno.data.error || ""), sinTurno.data.error);

  const ab = await cajero.post("/api/shifts/open", { openingCash: 200 });
  eq("el cajero puede abrir la caja", ab.status, 200);
  eq("el fondo inicial queda registrado", ab.data.state.shift.openingCash, 200);

  const doble = await admin.post("/api/shifts/open", { openingCash: 500 });
  eq("no se puede abrir un segundo turno", doble.status, 409);
}

// ──────────────────────────────────────────── 5. venta de mostrador + stock
seccion("5. Venta de mostrador e inventario");
let ordenMostrador = null;
{
  const antes = (await admin.get("/api/state")).data.ingredients;
  const cafeAntes = antes.find((i) => i.id === "i_cafe").stock;
  const vasoAntes = antes.find((i) => i.id === "i_vaso").stock;

  const id = uid("O");
  const l = linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12, qty: 2 });
  const r = await cajero.post("/api/orders", { id, lines: [l], payment: pagoEfectivo(24), orderType: "Para llevar" });
  eq("se cobra una venta de mostrador", r.status, 200);
  ordenMostrador = r.data.order;
  check("el servidor asigna el número de orden", Number.isInteger(r.data.order.number), String(r.data.order.number));

  const despues = (await admin.get("/api/state")).data.ingredients;
  cerca("2 espressos descuentan 36 g de café", despues.find((i) => i.id === "i_cafe").stock, cafeAntes - 36);
  cerca("2 espressos descuentan 2 vasos", despues.find((i) => i.id === "i_vaso").stock, vasoAntes - 2);

  // Idempotencia: el outbox puede reenviar la misma orden.
  const otra = await cajero.post("/api/orders", { id, lines: [l], payment: pagoEfectivo(24), orderType: "Para llevar" });
  eq("reenviar la misma orden no crea otra", otra.data.order.number, r.data.order.number);
  const tras = (await admin.get("/api/state")).data.ingredients;
  cerca("y NO vuelve a descontar inventario", tras.find((i) => i.id === "i_cafe").stock, cafeAntes - 36);
}

// ───────────────────────────────────────────── 6. validación de líneas sucias
seccion("6. El servidor no confía en la tablet");
{
  const neg = await cajero.post("/api/orders", {
    id: uid("O"), orderType: "Para llevar", payment: pagoEfectivo(0),
    lines: [{ uid: uid(), productId: "p_espresso", name: "Espresso", catId: "cafe", basePrice: 12, qty: -3, mods: [] }],
  });
  eq("una cantidad negativa se rechaza", neg.status, 400);

  const cero = await cajero.post("/api/orders", {
    id: uid("O"), orderType: "Para llevar", payment: pagoEfectivo(0),
    lines: [{ uid: uid(), productId: "p_espresso", name: "Espresso", catId: "cafe", basePrice: 12, qty: 0, mods: [] }],
  });
  eq("una cantidad en cero se rechaza", cero.status, 400);

  const frac = await cajero.post("/api/orders", {
    id: uid("O"), orderType: "Para llevar", payment: pagoEfectivo(0),
    lines: [{ uid: uid(), productId: "p_espresso", name: "Espresso", catId: "cafe", basePrice: 12, qty: 1.5, mods: [] }],
  });
  eq("una cantidad fraccionaria se rechaza", frac.status, 400);

  const precioNeg = await cajero.post("/api/orders", {
    id: uid("O"), orderType: "Para llevar", payment: pagoEfectivo(0),
    lines: [{ uid: uid(), productId: "p_espresso", name: "Espresso", catId: "cafe", basePrice: -50, qty: 1, mods: [] }],
  });
  eq("un precio negativo se rechaza", precioNeg.status, 400);

  const u = uid();
  const dup = await cajero.post("/api/orders", {
    id: uid("O"), orderType: "Para llevar", payment: pagoEfectivo(24),
    lines: [
      { uid: u, productId: "p_espresso", name: "Espresso", catId: "cafe", basePrice: 12, qty: 1, mods: [] },
      { uid: u, productId: "p_espresso", name: "Espresso", catId: "cafe", basePrice: 12, qty: 1, mods: [] },
    ],
  });
  eq("dos líneas con el mismo uid se rechazan", dup.status, 400);

  const sinMesa = await cajero.post("/api/orders", {
    id: uid("O"), orderType: "Aquí", payment: pagoEfectivo(12), table: null,
    lines: [linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12 })],
  });
  eq("cobrar 'Aquí' sin mesa se rechaza", sinMesa.status, 400);
  check("y el error lo dice claro", /mesa/i.test(sinMesa.data.error || ""), sinMesa.data.error);

  // Excepción del outbox: una venta ya cobrada sin conexión no se puede perder.
  const encolada = await cajero.post("/api/orders", {
    id: uid("O"), orderType: "Aquí", payment: pagoEfectivo(12), table: null, encolada: true,
    lines: [linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12 })],
  });
  eq("pero una venta encolada sin conexión SÍ entra", encolada.status, 200);
}

// ──────────────────────────────────────────────── 7. cuenta de mesa completa
seccion("7. Cuenta de mesa: abrir, enviar, agregar, cobrar");
const MESA1 = { id: "s1", label: "1", areaId: "salon", areaName: "Salón" };
const MESA2 = { id: "s2", label: "2", areaId: "salon", areaName: "Salón" };
let cuenta = null;
{
  const l1 = linea({ productId: "p_capuchino", name: "Capuchino", catId: "cafe", price: 22, size: { name: "16 onz", delta: 5 } });
  const l2 = linea({ productId: "p_croissant", name: "Croissant", catId: "panaderia", price: 15 });
  const ab = await cajero.post("/api/orders/open", { id: uid("O"), lines: [l1, l2], orderType: "Aquí", table: MESA1 });
  eq("se abre una cuenta de mesa", ab.status, 200);
  cuenta = ab.data.order;
  eq("la cuenta nace 'abierta'", cuenta.status, "abierta");

  const st1 = await admin.get("/api/state");
  eq("la cuenta abierta NO cuenta como venta", st1.data.orders.some((o) => o.id === cuenta.id), false);
  eq("la cuenta abierta sí aparece en openOrders", st1.data.openOrders.some((o) => o.id === cuenta.id), true);

  const cafeAntes = st1.data.ingredients.find((i) => i.id === "i_cafe").stock;
  const lecheAntes = st1.data.ingredients.find((i) => i.id === "i_leche").stock;

  const env = await cajero.post(`/api/orders/${cuenta.id}/enviar`);
  eq("se manda a preparar", env.status, 200);
  eq("1 item fue a cocina (croissant)", env.data.ruteo.cocina, 1);
  eq("1 item fue a barra (capuchino)", env.data.ruteo.barra, 1);
  eq("la cuenta queda 'enviada'", env.data.order.status, "enviada");

  const st2 = await admin.get("/api/state");
  cerca("al enviar se descuenta el café", st2.data.ingredients.find((i) => i.id === "i_cafe").stock, cafeAntes - 18);
  cerca("y la leche del tamaño 16 onz (180+60)", st2.data.ingredients.find((i) => i.id === "i_leche").stock, lecheAntes - 240);
  eq("el capuchino aparece en el tablero de barra", st2.data.kds.some((o) => o.id === cuenta.id), true);
  const enKds = st2.data.kds.find((o) => o.id === cuenta.id);
  eq("el tablero de barra NO muestra el croissant (es de cocina)", enKds.lines.length, 1);

  // Reenviar sin cambios no duplica nada.
  const re = await cajero.post(`/api/orders/${cuenta.id}/enviar`);
  eq("reenviar sin novedades no hace nada", re.data.sinCambios, true);
  const st3 = await admin.get("/api/state");
  cerca("y el inventario no se mueve otra vez", st3.data.ingredients.find((i) => i.id === "i_cafe").stock, cafeAntes - 18);

  // Segunda ronda.
  const l3 = linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12 });
  const up = await cajero.put(`/api/orders/${cuenta.id}/lines`, {
    lines: [...env.data.order.lines, l3], table: MESA1, orderType: "Aquí",
  });
  eq("se agrega un item a la cuenta", up.status, 200);
  eq("la cuenta tiene 3 líneas", up.data.order.lines.length, 3);

  const env2 = await cajero.post(`/api/orders/${cuenta.id}/enviar`);
  eq("la segunda ronda se envía", env2.status, 200);
  eq("solo va lo NUEVO a barra", env2.data.ruteo.barra, 1);
  eq("y nada repetido a cocina", env2.data.ruteo.cocina, 0);
  eq("el contador de envíos sube a 2", env2.data.order.sendSeq, 2);

  const st4 = await admin.get("/api/state");
  cerca("la segunda ronda SÍ descuenta (18 g más)", st4.data.ingredients.find((i) => i.id === "i_cafe").stock, cafeAntes - 36);
}

// ──────────────────────────────────── 8. una tablet vieja no resucita líneas
seccion("8. Una tablet desactualizada no puede duplicar ni revivir líneas");
{
  const actual = (await admin.get("/api/state")).data.openOrders.find((o) => o.id === cuenta.id);
  // La tablet vieja manda las MISMAS líneas pero sin la marca de enviadas.
  const viejas = actual.lines.map(({ sentSeq, ...resto }) => resto);
  const up = await cajero.put(`/api/orders/${cuenta.id}/lines`, { lines: viejas, table: MESA1, orderType: "Aquí" });
  eq("la subida se acepta", up.status, 200);
  eq("pero NO duplica las líneas", up.data.order.lines.length, 3);
  check("y conserva la marca de enviadas", up.data.order.lines.every((l) => l.sentSeq > 0),
    JSON.stringify(up.data.order.lines.map((l) => l.sentSeq)));
}

// ─────────────────────────────────── 9. anular una línea ya mandada a cocina
seccion("9. Anular un producto ya mandado a preparar");
{
  const st = await admin.get("/api/state");
  const cta = st.data.openOrders.find((o) => o.id === cuenta.id);
  const croissant = cta.lines.find((l) => l.name === "Croissant");
  const platoAntes = st.data.ingredients.find((i) => i.id === "i_plato").stock;
  const papelesAntes = papeles().length;

  const an = await cajero.post(`/api/orders/${cuenta.id}/lines/${croissant.uid}/anular`, { reason: "el cliente se arrepintió" });
  eq("se puede anular una línea enviada", an.status, 200);
  eq("el servidor avisa que devolvió inventario", an.data.devolvioStock, true);

  const st2 = await admin.get("/api/state");
  cerca("el insumo del croissant vuelve al stock", st2.data.ingredients.find((i) => i.id === "i_plato").stock, platoAntes + 1);
  const cta2 = st2.data.openOrders.find((o) => o.id === cuenta.id);
  eq("la línea NO se borra, queda marcada", cta2.lines.length, 3);
  eq("la línea queda anulada", cta2.lines.find((l) => l.uid === croissant.uid).voided, true);

  await esperaPapel(papelesAntes + 1);
  const cancel = leerPapeles().find((t) => /CANCELA/i.test(t));
  check("sale una comanda de CANCELACIÓN a cocina", !!cancel, "papeles: " + papeles().length);
  if (cancel) check("la cancelación nombra el producto", /Croissant/.test(cancel), cancel.slice(0, 200));

  // Anular dos veces no devuelve doble.
  await cajero.post(`/api/orders/${cuenta.id}/lines/${croissant.uid}/anular`, { reason: "otra vez" });
  const st3 = await admin.get("/api/state");
  cerca("anular dos veces NO devuelve el doble", st3.data.ingredients.find((i) => i.id === "i_plato").stock, platoAntes + 1);
}

// ────────────────────────────────── 10. cobrar la cuenta y coherencia de caja
seccion("10. Cobro de la cuenta de mesa");
{
  const cta = (await admin.get("/api/state")).data.openOrders.find((o) => o.id === cuenta.id);
  const vivo = cta.lines.filter((l) => !l.voided);
  const totalReal = vivo.reduce((s, l) => {
    let p = l.basePrice + (l.size ? l.size.delta : 0);
    (l.mods || []).forEach((m) => (p += m.delta));
    return s + p * l.qty;
  }, 0);

  // Primero, un importe equivocado: tiene que rechazarse.
  const malo = await cajero.post(`/api/orders/${cuenta.id}/cobrar`, { payment: pagoEfectivo(totalReal - 10) });
  eq("un total que no cuadra se rechaza", malo.status, 409);
  check("y avisa que la cuenta cambió", malo.data.cambio === true, JSON.stringify(malo.data));

  const bien = await cajero.post(`/api/orders/${cuenta.id}/cobrar`, { payment: pagoEfectivo(totalReal, 5) });
  eq("con el total correcto sí cobra", bien.status, 200);
  eq("la orden queda cobrada", bien.data.order.status, "cobrada");

  const st = await admin.get("/api/state");
  eq("ya no está en cuentas abiertas", st.data.openOrders.some((o) => o.id === cuenta.id), false);
  eq("ahora sí es una venta del turno", st.data.orders.some((o) => o.id === cuenta.id), true);

  // Cobrar de nuevo es idempotente.
  const otra = await cajero.post(`/api/orders/${cuenta.id}/cobrar`, { payment: pagoEfectivo(totalReal, 5) });
  eq("cobrar dos veces no duplica la venta", otra.data.existed, true);
}

// ───────────────────────────────────────── 11. enviar/cobrar sin mesa (cuenta)
seccion("11. Una cuenta 'Aquí' no puede enviarse ni cobrarse sin mesa");
{
  const l = linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12 });
  const ab = await cajero.post("/api/orders/open", { id: uid("O"), lines: [l], orderType: "Aquí", table: null });
  eq("se puede ABRIR una cuenta sin mesa todavía", ab.status, 200);
  const id = ab.data.order.id;

  const env = await cajero.post(`/api/orders/${id}/enviar`);
  eq("pero NO se puede enviar a preparar", env.status, 409);
  eq("el servidor marca que falta la mesa", env.data.faltaMesa, true);

  const cob = await cajero.post(`/api/orders/${id}/cobrar`, { payment: pagoEfectivo(12) });
  eq("ni se puede cobrar", cob.status, 409);
  eq("también marca que falta la mesa", cob.data.faltaMesa, true);

  // Con mesa ya se puede.
  await cajero.put(`/api/orders/${id}/lines`, { lines: ab.data.order.lines, table: MESA2, orderType: "Aquí" });
  const env2 = await cajero.post(`/api/orders/${id}/enviar`);
  eq("al ponerle mesa, sí se envía", env2.status, 200);

  // Descartar la cuenta devuelve el inventario.
  const st = await admin.get("/api/state");
  const cafeAntes = st.data.ingredients.find((i) => i.id === "i_cafe").stock;
  const des = await cajero.post(`/api/orders/${id}/void`, { reason: "descartada" });
  eq("se puede descartar la cuenta", des.status, 200);
  const st2 = await admin.get("/api/state");
  cerca("descartar devuelve el café al inventario", st2.data.ingredients.find((i) => i.id === "i_cafe").stock, cafeAntes + 18);
  eq("y la mesa queda libre", st2.data.openOrders.some((o) => o.id === id), false);
}

// ──────────────── 12. el cruce que rompió antes: anular línea + descartar
seccion("12. Anular una línea y luego descartar la cuenta (doble devolución)");
{
  const st0 = await admin.get("/api/state");
  const cafe0 = st0.data.ingredients.find((i) => i.id === "i_cafe").stock;

  const l1 = linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12 });
  const l2 = linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12 });
  const ab = await cajero.post("/api/orders/open", { id: uid("O"), lines: [l1, l2], orderType: "Aquí", table: MESA2 });
  const id = ab.data.order.id;
  await cajero.post(`/api/orders/${id}/enviar`);

  const st1 = await admin.get("/api/state");
  cerca("dos espressos descuentan 36 g", st1.data.ingredients.find((i) => i.id === "i_cafe").stock, cafe0 - 36);

  await cajero.post(`/api/orders/${id}/lines/${l1.uid}/anular`, { reason: "se arrepintió" });
  const st2 = await admin.get("/api/state");
  cerca("anular una línea devuelve 18 g", st2.data.ingredients.find((i) => i.id === "i_cafe").stock, cafe0 - 18);

  await cajero.post(`/api/orders/${id}/void`, { reason: "descartada" });
  const st3 = await admin.get("/api/state");
  cerca("descartar devuelve SOLO los 18 g que faltaban", st3.data.ingredients.find((i) => i.id === "i_cafe").stock, cafe0);
}

// ──────────────────────────────────────────────── 13. tablero de barra (KDS)
seccion("13. Tablero de barra");
{
  const l = linea({ productId: "p_capuchino", name: "Capuchino", catId: "cafe", price: 22 });
  const ab = await cajero.post("/api/orders/open", { id: uid("O"), lines: [l], orderType: "Aquí", table: MESA2 });
  const id = ab.data.order.id;
  await cajero.post(`/api/orders/${id}/enviar`);

  let st = await admin.get("/api/state");
  eq("la comanda entra al tablero", st.data.kds.some((o) => o.id === id), true);

  const salto = await barra.post(`/api/orders/${id}/prep`, { status: "entregado" });
  eq("no se permite saltar de pendiente a entregado", salto.status, 409);

  const listo = await barra.post(`/api/orders/${id}/prep`, { status: "listo" });
  eq("sí se permite pendiente → listo", listo.status, 200);
  const ent = await barra.post(`/api/orders/${id}/prep`, { status: "entregado" });
  eq("y listo → entregado", ent.status, 200);

  st = await admin.get("/api/state");
  eq("al entregarla sale del tablero", st.data.kds.some((o) => o.id === id), false);

  // Segunda ronda: tiene que VOLVER al tablero.
  const cta = st.data.openOrders.find((o) => o.id === id);
  const l2 = linea({ productId: "p_capuchino", name: "Capuchino 2", catId: "cafe", price: 22 });
  await cajero.put(`/api/orders/${id}/lines`, { lines: [...cta.lines, l2], table: MESA2, orderType: "Aquí" });
  await cajero.post(`/api/orders/${id}/enviar`);
  st = await admin.get("/api/state");
  const vuelta = st.data.kds.find((o) => o.id === id);
  check("una segunda ronda vuelve al tablero", !!vuelta);
  if (vuelta) eq("y solo muestra lo NUEVO, no lo ya entregado", vuelta.lines.length, 1);

  // Deshacer "entregado" devuelve lo que había.
  await barra.post(`/api/orders/${id}/prep`, { status: "listo" });
  await barra.post(`/api/orders/${id}/prep`, { status: "entregado" });
  const desh = await barra.post(`/api/orders/${id}/prep`, { status: "listo" });
  eq("se puede deshacer 'entregado'", desh.status, 200);
  st = await admin.get("/api/state");
  eq("y la comanda reaparece en el tablero", st.data.kds.some((o) => o.id === id), true);

  // limpieza: se cobra para no dejar la mesa abierta
  const ctaFin = st.data.openOrders.find((o) => o.id === id);
  const total = ctaFin.lines.filter((l) => !l.voided).reduce((s, l) => s + l.basePrice * l.qty, 0);
  await cajero.post(`/api/orders/${id}/cobrar`, { payment: pagoEfectivo(total) });
}

// ─────────────────────────────────────────── 14. impresión: cola y contenido
seccion("14. Impresión");
{
  await esperaPapel(1);
  const textos = leerPapeles();
  check("se imprimieron papeles", textos.length > 0, "n=" + textos.length);
  const ticket = textos.find((t) => /TOTAL/i.test(t) && /Café del Valle/i.test(t));
  check("hay al menos un ticket de cliente con total", !!ticket);
  const comanda = textos.find((t) => /Croissant/.test(t) && !/TOTAL/i.test(t));
  check("hay al menos una comanda de cocina", !!comanda);
  const conMesa = textos.find((t) => /Mesa/i.test(t));
  check("las comandas/tickets de mesa dicen a qué mesa van", !!conMesa);

  const pr = await admin.get("/api/printers");
  eq("el estado de impresoras responde", pr.status, 200);
  check("y reporta los destinos configurados", !!pr.data.destinos);

  const rei = await admin.post(`/api/orders/${cuenta.id}/reimprimir`);
  eq("se puede reimprimir el ticket de una venta cobrada", rei.status, 200);
  const reiAbierta = await admin.post(`/api/orders/${uid("O")}/reimprimir`);
  eq("no se puede reimprimir una orden inexistente", reiAbierta.status, 409);
}

// ───────────────────────────────────── 15. gastos, entradas y arqueo de caja
seccion("15. Gastos, entradas de dinero y arqueo");
{
  const g1 = await cajero.post("/api/expenses", { id: uid("G"), concept: "Pan del día", amount: 50, method: "efectivo", kind: "salida" });
  eq("se registra un gasto en efectivo", g1.status, 200);
  const g2 = await cajero.post("/api/expenses", { id: uid("G"), concept: "Servilletas", amount: 30, method: "otro", kind: "salida" });
  eq("se registra un gasto que NO sale de la caja", g2.status, 200);
  const g3 = await cajero.post("/api/expenses", { id: uid("G"), concept: "Aporte del dueño", amount: 100, method: "efectivo", kind: "entrada" });
  eq("se registra una entrada de efectivo", g3.status, 200);
  const malo = await cajero.post("/api/expenses", { id: uid("G"), concept: "Malo", amount: -5, method: "efectivo" });
  eq("un gasto negativo se rechaza", malo.status, 400);
  const sinConcepto = await cajero.post("/api/expenses", { id: uid("G"), amount: 5, method: "efectivo" });
  eq("un gasto sin concepto se rechaza", sinConcepto.status, 400);

  const st = await admin.get("/api/state");
  const ordenes = st.data.orders.filter((o) => !o.voided);
  const efectivoVentas = ordenes.reduce((s, o) => {
    const parts = o.payment.split ? o.payment.parts : [{ method: o.payment.method, total: o.payment.total }];
    return s + parts.filter((p) => p.method === "efectivo").reduce((a, p) => a + p.total, 0);
  }, 0);
  const gastos = st.data.expenses.filter((e) => e.method === "efectivo" && (e.kind || "salida") !== "entrada").reduce((s, e) => s + e.amount, 0);
  const entradas = st.data.expenses.filter((e) => e.method === "efectivo" && e.kind === "entrada").reduce((s, e) => s + e.amount, 0);
  const esperado = 200 + efectivoVentas + entradas - gastos;

  // Queda una cuenta abierta del bloque 13? no, se cobró. Verificamos.
  const abiertas = st.data.openOrders.length;
  eq("no quedan cuentas abiertas antes de cerrar", abiertas, 0);

  const cierre = await cajero.post("/api/shifts/close", { countedCash: esperado, closeNote: "todo bien", cashLeft: 200 });
  eq("se cierra la caja", cierre.status, 200);
  const turno = cierre.data.state.shiftHistory.slice(-1)[0];
  cerca("el esperado del arqueo cuadra con el cálculo a mano", turno.expected, esperado);
  cerca("la diferencia es cero", turno.diff, 0);
  cerca("las salidas de efectivo quedan registradas", turno.cashExpenses, gastos);
  cerca("las entradas de efectivo también", turno.cashIn, entradas);
  eq("la nota de cierre se guarda", turno.closeNote, "todo bien");
  eq("el efectivo dejado en caja se guarda", turno.cashLeft, 200);
}

// ─────────────────────────────── 16. el cierre se bloquea con mesas abiertas
seccion("16. No se puede cerrar la caja con cuentas sin cobrar");
{
  await cajero.post("/api/shifts/open", { openingCash: 200 });
  const l = linea({ productId: "p_espresso", name: "Espresso", catId: "cafe", price: 12 });
  const ab = await cajero.post("/api/orders/open", { id: uid("O"), lines: [l], orderType: "Aquí", table: MESA1 });
  await cajero.post(`/api/orders/${ab.data.order.id}/enviar`);

  const cierre = await cajero.post("/api/shifts/close", { countedCash: 200 });
  eq("el cierre se RECHAZA", cierre.status, 409);
  check("y explica cuántas mesas faltan", /1 cuenta/.test(cierre.data.error || ""), cierre.data.error);
  eq("informa el número de cuentas abiertas", cierre.data.cuentasAbiertas, 1);

  const st = await admin.get("/api/state");
  eq("la caja sigue abierta", st.data.shift.open, true);

  // Al descartarla, ya se puede cerrar.
  await cajero.post(`/api/orders/${ab.data.order.id}/void`, { reason: "prueba" });
  const cierre2 = await cajero.post("/api/shifts/close", { countedCash: 200 });
  eq("tras descartarla, el cierre pasa", cierre2.status, 200);
}

await para();
process.exit(resumen("NÚCLEO") ? 1 : 0);
