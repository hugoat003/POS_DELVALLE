/* FUWA POS — servidor de datos: SQLite (better-sqlite3) + auth por sesión.
   - Los datos viven en server/data/fuwa.db (WAL); la primera vez importa los
     JSON legacy de server/data/*.json y los archiva en json-importado/.
   - Login server-side con PIN (scrypt); el cliente nunca ve hashes.
   - Órdenes/gastos/turnos son filas con inserciones individuales idempotentes:
     dos tablets a la vez no se pisan y el número de orden lo asigna el server.
   - GET /api/sync?since=rev permite a las tablets refrescarse entre sí.
   En desarrollo corre junto a Vite (proxy /api); si existe dist/ también
   sirve la app compilada en el mismo puerto (uso diario / VPS: npm start). */
import express from "express";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrapDb, getFullState, getRev, KV_KEYS, kvGet, kvSet, kvUpdatedAt,
  insertOrder, voidOrderTx, setOrderPrepTx, insertExpense, deleteExpenseTx,
  openShiftTx, closeShiftTx, reopenShiftTx, clearOpenShiftOrdersTx,
  listUsers, upsertUser, deleteUserTx, publicUser,
  hashPin, verifyPinScrypt, verifyPinLegacy, setUserPinScrypt,
  createSession, getSession, destroySession,
  exportBackupData, importLegacyData, db, DATA_DIR,
  listStockMoves, upsertIngredientTx, archiveIngredientTx, adjustStockTx,
  openOrderTx, updateOrderLinesTx, sendOrderTx, payOrderTx, reprintTicketTx, cancelOrderLineTx,
  testPrintTx, getDashboard,
  dueJobs, markJobDone, markJobRetry, markJobDiscarded, pendingJobCount, pruneOldJobs, recentJobs,
} from "./db.js";
import { createPrinterService } from "./printer.service.js";
import { createBackupService } from "./backup.service.js";
import { ROLE_IDS } from "../src/auth/users.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, "..", "dist");
const PORT = process.env.PORT || 5174;
const PROD = process.env.NODE_ENV === "production";

// ---------------------------------------------------------------- arranque
const boot = bootstrapDb();
if (boot.migrated) console.log(`FUWA POS · datos JSON importados a SQLite (${boot.shifts} turnos, ${boot.users} usuarios)`);

// Instalación desde cero (sin JSON legacy): siembra los empleados demo para
// poder entrar la primera vez (mismos PINs que documenta el README).
if (listUsers().length === 0) {
  const { DEFAULT_USERS } = await import("../src/auth/users.js");
  for (const u of DEFAULT_USERS) upsertUser(u);
  console.log("FUWA POS · usuarios demo sembrados (PINs 1234/1111/2222) — cámbialos en Empleados");
}

/* Worker de impresión. Se le pasan solo las funciones que necesita en vez del
   módulo entero, para que quede explícito que no toca órdenes ni dinero. */
const printer = createPrinterService({
  db: { dueJobs, markJobDone, markJobRetry, markJobDiscarded, pendingJobCount, pruneOldJobs },
});
printer.start();

/* Respaldo automático diario. Se le pasa solo la función que genera los datos:
   no toca la base ni sabe de órdenes, únicamente serializa y guarda. */
const backup = createBackupService({ exportData: exportBackupData, dataDir: DATA_DIR });
backup.start();

const app = express();
app.disable("x-powered-by");
// type "*/*": el flush de cierre de pestaña (fetch keepalive) puede llegar sin
// Content-Type estándar. 2mb alcanza de sobra: ya no viaja el historial entero.
app.use(express.json({ limit: "2mb", type: () => true, strict: false }));

// --------------------------------------------------------------- rate limit
// En memoria y sin dependencias. Un PIN de 4 dígitos (10.000 combinaciones)
// exige frenar la fuerza bruta: 5 fallos → bloqueo exponencial por IP+usuario.
const loginFails = new Map(); // "ip|userId" -> { fails, until }
function loginBlocked(key) {
  const e = loginFails.get(key);
  return e && e.until > Date.now() ? Math.ceil((e.until - Date.now()) / 1000) : 0;
}
function loginFailed(key) {
  const e = loginFails.get(key) || { fails: 0, until: 0 };
  e.fails += 1;
  if (e.fails >= 5) e.until = Date.now() + Math.min(15 * 60_000, 60_000 * 2 ** (e.fails - 5));
  loginFails.set(key, e);
}
const loginOk = (key) => loginFails.delete(key);

// ------------------------------------------------------------ auth pública
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Lista para la pantalla de login: SOLO campos públicos, nunca hashes.
app.get("/api/login-users", (_req, res) => res.json(listUsers().map(publicUser)));

app.post("/api/login", (req, res) => {
  const { userId, pin } = req.body || {};
  if (!userId || !pin) return res.status(400).json({ error: "faltan credenciales" });
  const key = `${req.ip}|${userId}`;
  const wait = loginBlocked(key);
  if (wait) return res.status(429).json({ error: `demasiados intentos, espera ${wait}s`, wait });

  const u = listUsers().find((x) => x.id === userId);
  let ok = false;
  if (u && u.pin_scrypt && u.pin_salt) {
    ok = verifyPinScrypt(pin, u.pin_salt, u.pin_scrypt);
  } else if (u && u.legacy_sha256 && u.legacy_salt) {
    // Hash SHA-256 heredado de la versión anterior: se verifica una última vez
    // y se re-hashea a scrypt, sin que nadie tenga que resetear su PIN.
    ok = verifyPinLegacy(pin, u.legacy_salt, u.legacy_sha256);
    if (ok) setUserPinScrypt(u.id, pin);
  }
  if (!ok) {
    loginFailed(key);
    return res.status(401).json({ error: "PIN incorrecto" });
  }
  loginOk(key);
  const token = createSession(u.id);
  res.json({ token, user: publicUser(u) });
});

// ------------------------------------------------------------- middleware
app.use("/api", (req, res, next) => {
  if (req.path === "/health" || req.path === "/login" || req.path === "/login-users") return next();
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const session = getSession(token);
  if (!session) return res.status(401).json({ error: "sesión inválida o expirada" });
  req.user = session.user;
  req.token = token;
  next();
});

const adminOnly = (req, res, next) => (req.user.role === "admin" ? next() : res.status(403).json({ error: "solo gerente" }));
// El tablero de barra lo maneja la barra; el gerente también entra para cubrir.
const roleAny = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: "sin permiso para esta acción" });

app.post("/api/logout", (req, res) => {
  destroySession(req.token);
  res.json({ ok: true });
});

// ------------------------------------------------------------------ estado
app.get("/api/state", (_req, res) => res.json(getFullState()));

// Sync multi-tablet: barato si no hay cambios ({rev}), completo si los hay.
app.get("/api/sync", (req, res) => {
  const since = Number(req.query.since) || 0;
  const rev = getRev();
  if (rev === since) return res.json({ rev });
  res.json(getFullState());
});

/* Tablero del dueño. Pensado para consultarse desde el celular por Tailscale:
   una sola petición, números ya calculados, sin descargar el turno. */
app.get("/api/dashboard", adminOnly, (_req, res) => res.json(getDashboard()));

// Config kv (menú, modificadores, categorías, tweaks): last-write-wins.
app.put("/api/state/:key", (req, res) => {
  const { key } = req.params;
  if (!KV_KEYS.includes(key)) return res.status(404).json({ error: "clave no permitida" });

  /* `editedAt` es cuándo se hizo la edición en la tablet. Solo lo manda la
     re-subida de una clave que quedó pendiente por falta de conexión.

     Sin esta comprobación, una tablet con una marca de "pendiente" de hace días
     sube su copia vieja y BORRA lo que se cambió después desde otra parte —
     así desapareció un menú completo recién cargado. Con ella, el servidor
     rechaza la subida rancia y devuelve su versión para que la tablet se
     alinee. Una edición normal no manda editedAt y se escribe sin más. */
  const editedAt = Number(req.query.editedAt);
  if (Number.isFinite(editedAt) && editedAt > 0) {
    const enServidor = kvUpdatedAt(key);
    if (enServidor > editedAt) {
      return res.status(409).json({
        error: "el servidor tiene una versión más reciente de esta configuración",
        rancio: true, value: kvGet(key), updatedAt: enServidor, editedAt,
      });
    }
  }
  kvSet(key, req.body);
  res.json({ ok: true, rev: getRev() });
});

// ------------------------------------------------------------------ órdenes
app.post("/api/orders", (req, res) => {
  const b = req.body || {};
  if (!b.id || !Array.isArray(b.lines) || !b.lines.length || !b.payment) {
    return res.status(400).json({ error: "orden inválida" });
  }
  const out = insertOrder(b, req.user.name);
  if (out.error) return res.status(out.invalido ? 400 : 409).json(out);
  res.json({ order: out.order, rev: getRev() });
});

app.post("/api/orders/:id/void", (req, res) => {
  const out = voidOrderTx(req.params.id, (req.body || {}).reason, req.user.name);
  if (out.error) return res.status(404).json(out);
  res.json({ ok: true, rev: getRev() });
});

/* --------------------------------------------------- cuenta abierta

   Flujo de mesa: abrir → (agregar items) → enviar → cobrar.
   El mostrador sigue usando POST /api/orders, que hace las cuatro de un golpe. */

app.post("/api/orders/open", (req, res) => {
  const b = req.body || {};
  if (!b.id) return res.status(400).json({ error: "falta el id de la orden" });
  const out = openOrderTx(b, req.user.name);
  if (out.error) return res.status(out.invalido ? 400 : 409).json(out);
  res.json({ order: out.order, rev: getRev() });
});

app.put("/api/orders/:id/lines", (req, res) => {
  const b = req.body || {};
  if (!Array.isArray(b.lines)) return res.status(400).json({ error: "faltan las líneas" });
  const out = updateOrderLinesTx(req.params.id, b);
  if (out.error) return res.status(out.invalido ? 400 : 409).json(out);
  res.json({ order: out.order, rev: getRev() });
});

/* Quita un item de la cuenta. Si ya se había mandado a preparar, devuelve el
   insumo e imprime la cancelación en cocina. Se pide motivo porque queda en el
   historial de la orden: es la trazabilidad de por qué se fue ese producto. */
app.post("/api/orders/:id/lines/:uid/anular", (req, res) => {
  const out = cancelOrderLineTx(req.params.id, req.params.uid, (req.body || {}).reason, req.user.name);
  if (out.error) return res.status(409).json(out);
  res.json({ ok: true, devolvioStock: !!out.devolvioStock, order: out.order, rev: getRev() });
});

/* Manda a preparar. La respuesta dice a dónde fue cada cosa para que el mesero
   pueda confirmar en pantalla que la comanda salió a cocina. */
app.post("/api/orders/:id/enviar", (req, res) => {
  const out = sendOrderTx(req.params.id, req.user.name);
  if (out.error) return res.status(409).json(out);
  res.json({ ok: true, ruteo: out.ruteo, sinCambios: out.sinCambios, order: out.order, rev: getRev() });
});

app.post("/api/orders/:id/cobrar", (req, res) => {
  const b = req.body || {};
  if (!b.payment) return res.status(400).json({ error: "falta el pago" });
  const out = payOrderTx(req.params.id, b.payment, req.user.name);
  if (out.error) return res.status(409).json(out);
  // `existed` le dice al outbox que este cobro ya se había registrado, para que
  // no lo cuente como una venta nueva al reconectar.
  res.json({ order: out.order, existed: !!out.existed, rev: getRev() });
});

// Reimpresión del ticket del cliente (se atascó el papel, piden copia).
app.post("/api/orders/:id/reimprimir", (req, res) => {
  const out = reprintTicketTx(req.params.id);
  if (out.error) return res.status(409).json(out);
  res.json({ ok: true, rev: getRev() });
});

// ------------------------------------------------------------- impresión
app.get("/api/printers", (req, res) => {
  res.json({ ...printer.status(), recientes: req.user.role === "admin" ? recentJobs(30) : undefined });
});

/* Prueba de impresora desde Ajustes: sin esto, la única forma de saber si la IP
   de cocina está bien es cobrar una orden de verdad. */
app.post("/api/printers/:target/test", adminOnly, (req, res) => {
  const target = req.params.target;
  if (!["caja", "cocina"].includes(target)) return res.status(400).json({ error: "destino inválido" });
  testPrintTx(target, req.user.name);
  printer.flush();
  res.json({ ok: true });
});

// KDS de barra: avanza o retrocede el estado de preparación de una comanda.
app.post("/api/orders/:id/prep", roleAny("admin", "barra"), (req, res) => {
  const out = setOrderPrepTx(req.params.id, (req.body || {}).status);
  if (out.error) return res.status(409).json(out);
  res.json({ ok: true, order: out.order, rev: getRev() });
});

// Borrado permanente de las órdenes del turno (Herramientas, con confirmación).
app.post("/api/orders/clear", adminOnly, (req, res) => {
  const out = clearOpenShiftOrdersTx(req.user.name);
  if (out.error) return res.status(409).json(out);
  // Se devuelve el desglose para que la pantalla pueda decir cuántas cuentas de
  // mesa en servicio se destruyeron, no solo cuántos cobros.
  res.json({ ok: true, cobradas: out.cobradas, abiertas: out.abiertas, rev: getRev() });
});

// -------------------------------------------------------------- inventario
// Las existencias viajan en /api/state y /api/sync; aquí solo el kardex y las
// mutaciones. Editar ingredientes es cosa del gerente; registrar entradas y
// mermas lo hace cualquier cajero (es parte de la operación diaria).
app.get("/api/stock/moves", (req, res) => {
  res.json(listStockMoves(Math.min(Number(req.query.limit) || 300, 2000)));
});

app.post("/api/ingredients", adminOnly, (req, res) => {
  const b = req.body || {};
  if (!String(b.name || "").trim()) return res.status(400).json({ error: "falta el nombre" });
  // El contenido del empaque divide al precio para sacar el costo por unidad
  // base: un 0 o un texto darían Infinity o NaN en `cost`.
  if (b.purchaseFactor !== undefined && !(Number(b.purchaseFactor) > 0)) {
    return res.status(400).json({ error: "el contenido del empaque debe ser mayor que cero" });
  }
  const out = upsertIngredientTx(b);
  if (out.error) return res.status(400).json(out);
  res.json({ ingredient: out.ingredient, rev: getRev() });
});

app.delete("/api/ingredients/:id", adminOnly, (req, res) => {
  const out = archiveIngredientTx(req.params.id);
  if (out.error) return res.status(404).json(out);
  res.json({ ok: true, rev: getRev() });
});

app.post("/api/stock/moves", (req, res) => {
  const b = req.body || {};
  if (!b.ingredientId) return res.status(400).json({ error: "falta el ingrediente" });
  // Compras y ajustes cambian el valor del inventario: solo el gerente. Al
  // cajero se le deja la merma, que es lo que necesita durante su turno.
  if (req.user.role !== "admin" && b.reason !== "merma") {
    return res.status(403).json({ error: "solo el gerente registra compras y ajustes" });
  }
  const out = adjustStockTx(b, req.user.name);
  if (out.error) return res.status(400).json(out);
  res.json({ ok: true, ingredient: out.ingredient, rev: getRev() });
});

// ------------------------------------------------------------------- gastos
app.post("/api/expenses", (req, res) => {
  const b = req.body || {};
  if (!b.id || !b.concept || !(Number(b.amount) > 0)) return res.status(400).json({ error: "gasto inválido" });
  const out = insertExpense(b, req.user.name);
  if (out.error) return res.status(409).json(out);
  res.json({ expense: out.expense, rev: getRev() });
});

app.delete("/api/expenses/:id", (req, res) => {
  deleteExpenseTx(req.params.id);
  res.json({ ok: true, rev: getRev() });
});

// ------------------------------------------------------------------- turnos
app.post("/api/shifts/open", (req, res) => {
  const out = openShiftTx((req.body || {}).openingCash);
  if (out.error) return res.status(409).json(out); // otra tablet ya abrió
  res.json({ state: getFullState() });
});

app.post("/api/shifts/close", (req, res) => {
  const b = req.body || {};
  const out = closeShiftTx(b.countedCash, { closeNote: b.closeNote, cashLeft: b.cashLeft });
  if (out.error) return res.status(409).json(out);
  // `cuentasAbiertas`: mesas que quedaron sin cobrar. No impiden cerrar (su
  // dinero entra al turno siguiente), pero la pantalla debe avisarlo.
  res.json({ state: getFullState(), cuentasAbiertas: out.cuentasAbiertas });
});

app.post("/api/shifts/:id/reopen", adminOnly, (req, res) => {
  const out = reopenShiftTx(req.params.id);
  if (out.error) return res.status(409).json(out);
  res.json({ state: getFullState() });
});

// ---------------------------------------------------------------- empleados
app.post("/api/users", adminOnly, (req, res) => {
  const b = req.body || {};
  if (!b.id || !b.name) return res.status(400).json({ error: "usuario inválido" });
  if (b.pin != null && !/^\d{4}$/.test(String(b.pin))) return res.status(400).json({ error: "el PIN debe ser de 4 dígitos" });
  // Un rol desconocido dejaba al usuario sin permisos coherentes y rompía la
  // insignia de rol en el login.
  if (b.role != null && !ROLE_IDS.includes(b.role)) return res.status(400).json({ error: "rol desconocido" });
  res.json({ user: upsertUser(b), rev: getRev() });
});

app.delete("/api/users/:id", adminOnly, (req, res) => {
  const users = listUsers();
  const target = users.find((u) => u.id === req.params.id);
  if (!target) return res.status(404).json({ error: "no existe" });
  if (target.id === req.user.id) return res.status(409).json({ error: "no puedes eliminarte a ti" });
  if (target.role === "admin" && users.filter((u) => u.role === "admin").length <= 1) {
    return res.status(409).json({ error: "debe quedar al menos un gerente" });
  }
  deleteUserTx(req.params.id);
  res.json({ ok: true, rev: getRev() });
});

// ---------------------------------------------------------------- respaldos
app.get("/api/backup", adminOnly, (_req, res) => {
  kvSet("fuwa_last_backup", Date.now());
  res.json(exportBackupData());
});

/* Estado del respaldo automático: última copia, destino y las 10 más recientes.
   Es lo que permite al gerente comprobar que sí se está respaldando. */
app.get("/api/backup/estado", adminOnly, (_req, res) => res.json(backup.estado()));

// Disparo manual (Herramientas). Sirve antes de un cambio grande o para probar
// que la copia a la nube funciona sin esperar al día siguiente.
app.post("/api/backup/ahora", adminOnly, async (_req, res) => {
  const out = await backup.ejecutar({ forzado: true });
  if (!out.ok) return res.status(500).json(out);
  kvSet("fuwa_last_backup", Date.now());
  res.json(out);
});

app.post("/api/restore", adminOnly, (req, res) => {
  const data = req.body;
  if (!data || typeof data !== "object" || (!data.menu && !data.shiftHistory && !data.orders)) {
    return res.status(400).json({ error: "respaldo inválido" });
  }
  importLegacyData(data, { wipe: true });
  res.json({ state: getFullState() });
});

// ------------------------------------------------- app compilada (producción)
if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

/* Interfaz de escucha, explícita y no derivada de NODE_ENV.

   El default conserva el comportamiento anterior: en un VPS `production`
   escucha solo en loopback porque quien da la cara a Internet es el reverse
   proxy con HTTPS. Pero en la mini PC de la cafetería el servidor ES el
   servidor de la red local: ahí hay que poner HOST=0.0.0.0 o las tablets no lo
   alcanzan, y el síntoma —"todo funciona en la caja pero ninguna tablet
   conecta"— no apunta a NODE_ENV por ningún lado. */
const HOST = process.env.HOST || (PROD ? "127.0.0.1" : "0.0.0.0");
app.listen(PORT, HOST, () => {
  console.log(`FUWA POS · servidor de datos en http://${HOST}:${PORT} (rev ${getRev()})`);
  if (existsSync(DIST_DIR)) console.log("  sirviendo la app compilada (dist/)");
  else console.warn("  OJO: no existe dist/ — corre `npm run build` o las tablets verán un 404");

  // Direcciones de la LAN, para configurar las tablets sin adivinar.
  if (HOST === "0.0.0.0") {
    for (const [, addrs] of Object.entries(networkInterfaces())) {
      for (const a of addrs || []) {
        if (a.family === "IPv4" && !a.internal) console.log(`  desde las tablets: http://${a.address}:${PORT}`);
      }
    }
  } else if (PROD) {
    console.log("  solo localhost (NODE_ENV=production). Si las tablets deben conectarse, pon HOST=0.0.0.0");
  }
});

process.on("exit", () => db.close());
