/* FUWA POS — capa de datos SQLite (better-sqlite3).
   Sustituye a los archivos JSON clave-valor: lo transaccional (órdenes, gastos,
   turnos, usuarios, sesiones) vive en tablas; la config de baja concurrencia
   (menú, modificadores, categorías, tweaks) sigue como JSON en la tabla `kv`
   con last-write-wins, que para config es correcto.

   `meta.rev` es la revisión global: se incrementa en CADA escritura y permite
   a las tablets preguntar "¿hay algo nuevo?" con GET /api/sync?since=rev. */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { orderConsumption, lineConsumption, round3 } from "../src/lib/recipe.js";
import { orderCost, byId } from "../src/lib/profit.js";
import { costPerBase } from "../src/lib/units.js";
import { splitByStation, pendingLines, stampSent, stationOf, activeLines } from "../src/lib/stations.js";
import { lineTotal } from "../src/lib/format.js";
import { INGREDIENTS, PRODUCTS, MOD_GROUPS, CATEGORIES } from "../src/data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "fuwa.db");

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL"); // lecturas concurrentes + escrituras atómicas
db.pragma("foreign_keys = ON");

// ---------------------------------------------------------------- esquema
db.exec(`
CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  -- Cuándo se escribió. Permite rechazar la subida de una tablet cuya copia
  -- local es más vieja que lo que ya hay aquí (ver PUT /api/state/:key).
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS meta (
  id        INTEGER PRIMARY KEY CHECK (id = 1),
  rev       INTEGER NOT NULL,
  order_seq INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'cajero',
  hue           INTEGER,
  pin_scrypt    TEXT,
  pin_salt      TEXT,
  legacy_sha256 TEXT,
  legacy_salt   TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS shifts (
  id            TEXT PRIMARY KEY,
  status        TEXT NOT NULL CHECK (status IN ('open','closed')),
  opened_at     INTEGER,
  closed_at     INTEGER,
  closed_label  TEXT,
  opening_cash  REAL NOT NULL DEFAULT 0,
  cash_sales    REAL,
  cash_expenses REAL,
  cash_in       REAL,                      -- entradas de dinero en efectivo del turno
  card_sales    REAL,                      -- cobros con tarjeta (informativo: no entra al arqueo)
  expected      REAL,
  counted       REAL,
  diff          REAL,
  close_note    TEXT,                      -- nota del cierre para quien abra el siguiente turno
  cash_left     REAL,                      -- efectivo que se dejó en caja (prellena el fondo siguiente)
  compacted     INTEGER NOT NULL DEFAULT 0,
  compact_json  TEXT
);
CREATE TABLE IF NOT EXISTS orders (
  id          TEXT PRIMARY KEY,          -- id generado por el cliente (idempotencia)
  shift_id    TEXT NOT NULL REFERENCES shifts(id),
  number      INTEGER NOT NULL UNIQUE,
  ts          INTEGER NOT NULL,
  time_label  TEXT,
  order_type  TEXT,
  cashier     TEXT,
  lines       TEXT NOT NULL,             -- JSON (no se sobre-normaliza)
  payment     TEXT NOT NULL,             -- JSON
  table_json  TEXT,                      -- JSON {label, areaName} si es "Para aquí" con mesa
  voided      INTEGER NOT NULL DEFAULT 0,
  void_reason TEXT,
  voided_at   INTEGER,
  -- KDS de barra: pendiente -> listo (lo marca barra) -> entregado (lo marca el
  -- mesero al recoger). El ticket sale del tablero al quedar en 'entregado'.
  prep_status TEXT NOT NULL DEFAULT 'pendiente',
  ready_at    INTEGER,
  served_at   INTEGER,
  -- Cuenta abierta: abierta -> enviada (fue a cocina/barra) -> cobrada.
  -- El default es 'cobrada' a propósito: toda fila que existía antes de esta
  -- columna es, por definición, una venta ya cobrada.
  status      TEXT NOT NULL DEFAULT 'cobrada',
  opened_at   INTEGER,
  sent_at     INTEGER,
  paid_at     INTEGER,
  -- Cuántas veces se mandó a preparar. Sube al agregar items y volver a enviar;
  -- solo se imprime/descuenta lo que aún no se había enviado.
  send_seq    INTEGER NOT NULL DEFAULT 0,
  /* Hasta qué ronda se entregó. Es lo que permite que una mesa que ya recibió
     su primera ronda vuelva al tablero al pedir más: mientras send_seq sea
     mayor que served_seq hay trabajo sin entregar. Un solo prep_status por
     orden no alcanza cuando la misma cuenta se prepara en varias tandas. */
  served_seq  INTEGER NOT NULL DEFAULT 0,
  -- Valor anterior de served_seq, para que "deshacer entregado" en el tablero
  -- devuelva exactamente las líneas que estaban.
  served_prev INTEGER NOT NULL DEFAULT 0,
  opened_by   TEXT
);
/* Cola de impresión. Un trabajo se encola en la MISMA transacción que el envío
   de la orden: si el commit pasa, el ticket está garantizado aunque la
   impresora esté apagada, porque el worker reintenta indefinidamente. Es lo que
   cumple el requisito de "sin perder la orden". */
CREATE TABLE IF NOT EXISTS print_jobs (
  id          TEXT PRIMARY KEY,
  target      TEXT NOT NULL,                     -- cocina | caja
  kind        TEXT NOT NULL,                     -- comanda | ticket
  order_id    TEXT,
  payload     TEXT NOT NULL,                     -- JSON ya listo para renderizar
  status      TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | impreso | fallido
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  created_at  INTEGER NOT NULL,
  next_try_at INTEGER NOT NULL DEFAULT 0,
  printed_at  INTEGER
);
CREATE TABLE IF NOT EXISTS expenses (
  id            TEXT PRIMARY KEY,
  shift_id      TEXT NOT NULL REFERENCES shifts(id),
  ts            INTEGER NOT NULL,
  concept       TEXT NOT NULL,
  amount        REAL NOT NULL,            -- SIEMPRE positivo; el signo lo da la columna kind
  method        TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'salida',  -- salida | entrada (entrada = dinero que ingresa a caja)
  registered_by TEXT
);
CREATE TABLE IF NOT EXISTS ingredients (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  unit      TEXT NOT NULL DEFAULT 'g',   -- unidad BASE: la que usan las recetas y el stock
  stock     REAL NOT NULL DEFAULT 0,
  min_stock REAL NOT NULL DEFAULT 0,
  cost      REAL NOT NULL DEFAULT 0,   -- costo por unidad base (Q). DERIVADO de la compra.
  archived  INTEGER NOT NULL DEFAULT 0,
  -- Cómo se compra: "1 libra trae 453.59 g y cuesta Q90". El costo por gramo
  -- sale de aquí, para que nadie tenga que dividir a mano.
  purchase_unit   TEXT,
  purchase_factor REAL NOT NULL DEFAULT 1,
  purchase_price  REAL
);
-- Kardex: toda variación de existencias queda registrada aquí. El id es
-- determinista para los movimientos de venta ("Mv:<orden>:<ingrediente>"),
-- así una orden reenviada por el outbox no puede descontar dos veces.
CREATE TABLE IF NOT EXISTS stock_moves (
  id            TEXT PRIMARY KEY,
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  delta         REAL NOT NULL,          -- SIEMPRE en unidad base: la única fuente de verdad
  reason        TEXT NOT NULL,          -- venta|anulacion|compra|merma|ajuste
  order_id      TEXT,
  note          TEXT,
  ts            INTEGER NOT NULL,
  user_name     TEXT,
  -- Lo que tecleó la persona ("2 lb"), como metadato de presentación. Nunca
  -- entra en aritmética: sirve para cuadrar contra la factura del proveedor y
  -- para poder responder "¿qué escribió?" si un factor resultó equivocado.
  entered_qty   REAL,
  entered_unit  TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_shift   ON orders(shift_id);
CREATE INDEX IF NOT EXISTS idx_expenses_shift ON expenses(shift_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status  ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_moves_ing      ON stock_moves(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_moves_ts       ON stock_moves(ts);
CREATE INDEX IF NOT EXISTS idx_moves_order    ON stock_moves(order_id);
CREATE INDEX IF NOT EXISTS idx_jobs_pending   ON print_jobs(status, next_try_at);
`);
/* idx_orders_status NO va aquí: en una base que ya existía, la columna `status`
   la crea el ALTER de más abajo, y este bloque corre antes. El índice se crea
   junto a su migración. */

// Migración: bases creadas antes de las mesas no tienen la columna table_json.
try {
  db.exec("ALTER TABLE orders ADD COLUMN table_json TEXT");
} catch {
  /* la columna ya existe */
}

/* Migraciones incrementales. Cada ALTER va en su propio try: una columna que ya
   existe lanza y se ignora, sin frenar a las siguientes.

   `addColumn` devuelve true solo cuando la columna se creó de verdad, que es lo
   que permite disparar un backfill una única vez. */
function addColumn(sql) {
  try {
    db.exec(sql);
    return true;
  } catch {
    return false;
  }
}

// KDS de barra.
if (addColumn("ALTER TABLE orders ADD COLUMN prep_status TEXT NOT NULL DEFAULT 'pendiente'")) {
  // Las órdenes que ya existían fueron servidas hace rato. Sin este backfill,
  // al reabrir un turno viejo el tablero de barra se llenaría de comandas
  // fantasma que nadie tiene que preparar.
  db.exec("UPDATE orders SET prep_status = 'entregado'");
}
addColumn("ALTER TABLE orders ADD COLUMN ready_at INTEGER");
addColumn("ALTER TABLE orders ADD COLUMN served_at INTEGER");

// Entradas de dinero a caja (los gastos previos son todos salidas).
addColumn("ALTER TABLE expenses ADD COLUMN kind TEXT NOT NULL DEFAULT 'salida'");

// Cierre de caja: tarjeta, entradas, nota y efectivo dejado.
addColumn("ALTER TABLE shifts ADD COLUMN cash_in REAL");
addColumn("ALTER TABLE shifts ADD COLUMN card_sales REAL");
addColumn("ALTER TABLE shifts ADD COLUMN close_note TEXT");
addColumn("ALTER TABLE shifts ADD COLUMN cash_left REAL");

// El tablero de barra consulta por estado en cada sync.
db.exec("CREATE INDEX IF NOT EXISTS idx_orders_prep ON orders(prep_status)");

/* Cuenta abierta. El default 'cobrada' hace que las filas previas queden
   correctas sin backfill: antes de esto una orden solo existía al cobrarse. */
addColumn("ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'cobrada'");
addColumn("ALTER TABLE orders ADD COLUMN opened_at INTEGER");
addColumn("ALTER TABLE orders ADD COLUMN sent_at INTEGER");
addColumn("ALTER TABLE orders ADD COLUMN paid_at INTEGER");
addColumn("ALTER TABLE orders ADD COLUMN send_seq INTEGER NOT NULL DEFAULT 0");
addColumn("ALTER TABLE orders ADD COLUMN opened_by TEXT");
db.exec("CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)");
addColumn("ALTER TABLE kv ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0");

/* Rondas de preparación. Una orden ya entregada tiene servido todo lo que se le
   envió; una que sigue en el tablero no ha servido nada todavía. */
if (addColumn("ALTER TABLE orders ADD COLUMN served_seq INTEGER NOT NULL DEFAULT 0")) {
  db.exec("UPDATE orders SET served_seq = send_seq WHERE prep_status = 'entregado'");
}
addColumn("ALTER TABLE orders ADD COLUMN served_prev INTEGER NOT NULL DEFAULT 0");

/* Las ventas históricas se tomaron, se prepararon y se cobraron en el mismo
   acto. Sin estas marcas el tablero de barra (que ahora filtra por sent_at) las
   dejaría de ver, y `send_seq = 0` haría que un envío las tratara como nunca
   enviadas y volviera a descontar inventario. Idempotente por el WHERE. */
db.exec(`UPDATE orders
         SET opened_at = COALESCE(opened_at, ts),
             sent_at   = COALESCE(sent_at, ts),
             paid_at   = COALESCE(paid_at, ts),
             send_seq  = 1
         WHERE status = 'cobrada' AND sent_at IS NULL`);

db.exec(`
CREATE TABLE IF NOT EXISTS print_jobs (
  id          TEXT PRIMARY KEY,
  target      TEXT NOT NULL,
  kind        TEXT NOT NULL,
  order_id    TEXT,
  payload     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pendiente',
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  created_at  INTEGER NOT NULL,
  next_try_at INTEGER NOT NULL DEFAULT 0,
  printed_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_jobs_pending ON print_jobs(status, next_try_at);
`);

// Unidad de compra: se registra tal como se compra (libras, galones, cajas) y
// el servidor convierte a la unidad base.
addColumn("ALTER TABLE ingredients ADD COLUMN purchase_unit TEXT");
addColumn("ALTER TABLE ingredients ADD COLUMN purchase_factor REAL NOT NULL DEFAULT 1");
addColumn("ALTER TABLE ingredients ADD COLUMN purchase_price REAL");
addColumn("ALTER TABLE stock_moves ADD COLUMN entered_qty REAL");
addColumn("ALTER TABLE stock_moves ADD COLUMN entered_unit TEXT");

/* Backfill idempotente, NO condicionado a que el ALTER acabe de correr: si el
   proceso muere entre un ALTER y el siguiente, al reiniciar `addColumn`
   devuelve false y un backfill gateado no correría nunca. Con el WHERE es a
   prueba de caídas. Los ingredientes existentes quedan comprando en su misma
   unidad base con factor 1, o sea comportándose exactamente igual que antes. */
db.exec(`UPDATE ingredients
         SET purchase_unit = unit, purchase_factor = 1, purchase_price = cost
         WHERE purchase_unit IS NULL`);

// ------------------------------------------------------------ PIN hashing
// scrypt (node:crypto): KDF con coste, a diferencia del SHA-256 legacy que un
// atacante puede fuerza-brutear en milisegundos con un PIN de 4 dígitos.
export function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(pin), salt, 64).toString("hex");
  return { salt, hash };
}
export function verifyPinScrypt(pin, salt, hash) {
  const test = crypto.scryptSync(String(pin), salt, 64);
  const ref = Buffer.from(hash, "hex");
  return test.length === ref.length && crypto.timingSafeEqual(test, ref);
}
export function verifyPinLegacy(pin, salt, hash) {
  const test = crypto.createHash("sha256").update(salt + ":" + pin).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(test), Buffer.from(hash));
}

// ------------------------------------------------------------ statements
const S = {
  getMeta: db.prepare("SELECT rev, order_seq FROM meta WHERE id = 1"),
  bumpRev: db.prepare("UPDATE meta SET rev = rev + 1 WHERE id = 1"),
  bumpSeq: db.prepare("UPDATE meta SET order_seq = order_seq + 1 WHERE id = 1"),

  kvGet: db.prepare("SELECT value FROM kv WHERE key = ?"),
  kvSet: db.prepare(`INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`),
  kvUpdatedAt: db.prepare("SELECT updated_at FROM kv WHERE key = ?"),

  userAll: db.prepare("SELECT * FROM users"),
  userGet: db.prepare("SELECT * FROM users WHERE id = ?"),
  userInsert: db.prepare(`INSERT INTO users (id, name, role, hue, pin_scrypt, pin_salt) VALUES (@id, @name, @role, @hue, @pin_scrypt, @pin_salt)`),
  userUpdate: db.prepare(`UPDATE users SET name=@name, role=@role, hue=@hue WHERE id=@id`),
  userSetPin: db.prepare(`UPDATE users SET pin_scrypt=@hash, pin_salt=@salt, legacy_sha256=NULL, legacy_salt=NULL WHERE id=@id`),
  userDelete: db.prepare("DELETE FROM users WHERE id = ?"),

  sessionInsert: db.prepare("INSERT INTO sessions (token, user_id, created_at, last_seen) VALUES (?, ?, ?, ?)"),
  sessionGet: db.prepare("SELECT s.*, u.name, u.role, u.hue FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?"),
  sessionTouch: db.prepare("UPDATE sessions SET last_seen = ? WHERE token = ?"),
  sessionDelete: db.prepare("DELETE FROM sessions WHERE token = ?"),
  sessionPrune: db.prepare("DELETE FROM sessions WHERE last_seen < ?"),

  openShift: db.prepare("SELECT * FROM shifts WHERE status = 'open' LIMIT 1"),
  closedShifts: db.prepare("SELECT * FROM shifts WHERE status = 'closed' ORDER BY closed_at ASC"),
  lastClosedShift: db.prepare("SELECT * FROM shifts WHERE status = 'closed' ORDER BY closed_at DESC LIMIT 1"),
  shiftGet: db.prepare("SELECT * FROM shifts WHERE id = ?"),
  shiftInsert: db.prepare(`INSERT INTO shifts (id, status, opened_at, opening_cash) VALUES (@id, 'open', @opened_at, @opening_cash)`),
  shiftClose: db.prepare(`UPDATE shifts SET status='closed', closed_at=@closed_at, closed_label=@closed_label,
    cash_sales=@cash_sales, cash_expenses=@cash_expenses, cash_in=@cash_in, card_sales=@card_sales,
    expected=@expected, counted=@counted, diff=@diff, close_note=@close_note, cash_left=@cash_left WHERE id=@id`),
  shiftReopen: db.prepare(`UPDATE shifts SET status='open', closed_at=NULL, closed_label=NULL,
    cash_sales=NULL, cash_expenses=NULL, cash_in=NULL, card_sales=NULL,
    expected=NULL, counted=NULL, diff=NULL, close_note=NULL, cash_left=NULL WHERE id=?`),
  shiftCompact: db.prepare("UPDATE shifts SET compacted = 1, compact_json = ? WHERE id = ?"),
  shiftDeleteData: db.prepare("DELETE FROM orders WHERE shift_id = ?"),
  // TODAS las órdenes del turno, cobradas o no. `ordersByShift` filtra a las
  // cobradas para proteger el arqueo, así que borrar necesita su propia lectura:
  // si no, se eliminan cuentas abiertas cuyo inventario nadie devolvió.
  ordersByShiftAll: db.prepare("SELECT * FROM orders WHERE shift_id = ? ORDER BY number ASC"),
  shiftDeleteExpenses: db.prepare("DELETE FROM expenses WHERE shift_id = ?"),

  orderGet: db.prepare("SELECT * FROM orders WHERE id = ?"),
  orderGetByNumber: db.prepare("SELECT * FROM orders WHERE number = ? AND shift_id = ?"),
  /* SOLO órdenes cobradas. Es la consulta de la que cuelgan el arqueo, el
     historial, los reportes y la ganancia neta — tanto aquí como en el cliente
     (reportStats.js, profit.js). El filtro de status es lo que impide que una
     cuenta abierta se cuente como venta: mientras esta consulta signifique
     "dinero que entró", ninguno de esos cálculos necesita enterarse de que
     existen las cuentas abiertas. NO quitar el filtro. */
  ordersByShift: db.prepare("SELECT * FROM orders WHERE shift_id = ? AND status = 'cobrada' ORDER BY number ASC"),
  // Cuentas abiertas: las que aún no se cobran, de cualquier turno.
  openOrders: db.prepare("SELECT * FROM orders WHERE status IN ('abierta','enviada') AND voided = 0 ORDER BY number ASC"),
  /* Fuente del KDS: todo lo que ya se mandó a preparar y no se ha entregado,
     esté cobrado o no. Una orden para llevar se cobra de una vez pero su bebida
     igual tiene que aparecer en barra. */
  /* Hay trabajo pendiente mientras se haya enviado más de lo que se entregó.
     Antes el filtro era prep_status != 'entregado', y eso dejaba fuera para
     siempre a una mesa que pidiera una segunda ronda después de recibir la
     primera: el barista nunca veía lo nuevo. */
  kdsOrders: db.prepare(`SELECT * FROM orders WHERE sent_at IS NOT NULL
                         AND send_seq > served_seq AND voided = 0 ORDER BY sent_at ASC`),
  orderInsert: db.prepare(`INSERT INTO orders (id, shift_id, number, ts, time_label, order_type, cashier, lines, payment, table_json,
      status, opened_at, sent_at, paid_at, send_seq, served_seq, opened_by, prep_status)
    VALUES (@id, @shift_id, @number, @ts, @time_label, @order_type, @cashier, @lines, @payment, @table_json,
      @status, @opened_at, @sent_at, @paid_at, @send_seq, @served_seq, @opened_by, @prep_status)`),
  orderSetLines: db.prepare("UPDATE orders SET lines = @lines, table_json = @table_json, order_type = @order_type WHERE id = @id"),
  /* Un envío nuevo devuelve la orden a 'pendiente': hay trabajo que hacer otra
     vez. Y `sent_at` pasa a ser el del ÚLTIMO envío, no el del primero: el
     cronómetro del tablero mide desde que llegó la comanda, y con la hora de
     apertura una mesa de dos horas mostraba en rojo una bebida recién pedida. */
  orderMarkSent: db.prepare(`UPDATE orders SET status = 'enviada', sent_at = @now, send_seq = @send_seq,
    prep_status = 'pendiente', ready_at = NULL, served_at = NULL WHERE id = @id`),
  orderMarkPaid: db.prepare(`UPDATE orders SET status = 'cobrada', paid_at = @now, payment = @payment,
    shift_id = @shift_id, cashier = @cashier, ts = @ts, time_label = @time_label WHERE id = @id`),
  orderDelete: db.prepare("DELETE FROM orders WHERE id = ?"),
  orderVoid: db.prepare("UPDATE orders SET voided = 1, void_reason = ?, voided_at = ? WHERE id = ?"),
  orderVoidByNumber: db.prepare("UPDATE orders SET voided = 1, void_reason = ?, voided_at = ? WHERE number = ? AND shift_id = ?"),
  orderSetPrep: db.prepare("UPDATE orders SET prep_status = @status, ready_at = @ready_at, served_at = @served_at WHERE id = @id"),
  orderSetServed: db.prepare("UPDATE orders SET served_seq = @served_seq, served_prev = @served_prev WHERE id = @id"),

  jobInsert: db.prepare(`INSERT INTO print_jobs (id, target, kind, order_id, payload, created_at, next_try_at)
    VALUES (@id, @target, @kind, @order_id, @payload, @created_at, @next_try_at)`),
  jobsDue: db.prepare("SELECT * FROM print_jobs WHERE status = 'pendiente' AND next_try_at <= ? ORDER BY created_at ASC LIMIT 20"),
  jobDone: db.prepare("UPDATE print_jobs SET status = 'impreso', printed_at = ?, last_error = NULL WHERE id = ?"),
  jobRetry: db.prepare("UPDATE print_jobs SET attempts = attempts + 1, last_error = @err, next_try_at = @next WHERE id = @id"),
  jobDiscard: db.prepare("UPDATE print_jobs SET status = 'descartado', last_error = @err WHERE id = @id"),
  jobsPendingCount: db.prepare("SELECT COUNT(*) n FROM print_jobs WHERE status = 'pendiente'"),
  jobsRecent: db.prepare("SELECT * FROM print_jobs ORDER BY created_at DESC LIMIT ?"),
  jobsPruneOld: db.prepare("DELETE FROM print_jobs WHERE status = 'impreso' AND printed_at < ?"),

  expensesByShift: db.prepare("SELECT * FROM expenses WHERE shift_id = ? ORDER BY ts ASC"),
  expenseGet: db.prepare("SELECT * FROM expenses WHERE id = ?"),
  expenseInsert: db.prepare(`INSERT INTO expenses (id, shift_id, ts, concept, amount, method, kind, registered_by)
    VALUES (@id, @shift_id, @ts, @concept, @amount, @method, @kind, @registered_by)`),
  expenseDelete: db.prepare("DELETE FROM expenses WHERE id = ?"),

  ingAll: db.prepare("SELECT * FROM ingredients WHERE archived = 0 ORDER BY name COLLATE NOCASE"),
  ingGet: db.prepare("SELECT * FROM ingredients WHERE id = ?"),
  ingUpsert: db.prepare(`INSERT INTO ingredients
      (id, name, unit, stock, min_stock, cost, archived, purchase_unit, purchase_factor, purchase_price)
    VALUES (@id, @name, @unit, @stock, @min_stock, @cost, 0, @purchase_unit, @purchase_factor, @purchase_price)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, unit=excluded.unit,
      min_stock=excluded.min_stock, cost=excluded.cost, archived=0,
      purchase_unit=excluded.purchase_unit, purchase_factor=excluded.purchase_factor,
      purchase_price=excluded.purchase_price`),
  ingSetStock: db.prepare("UPDATE ingredients SET stock = stock + ? WHERE id = ?"),
  ingArchive: db.prepare("UPDATE ingredients SET archived = 1 WHERE id = ?"),

  moveGet: db.prepare("SELECT * FROM stock_moves WHERE id = ?"),
  moveInsert: db.prepare(`INSERT INTO stock_moves
      (id, ingredient_id, delta, reason, order_id, note, ts, user_name, entered_qty, entered_unit)
    VALUES (@id, @ingredient_id, @delta, @reason, @order_id, @note, @ts, @user_name, @entered_qty, @entered_unit)`),
  movesRecent: db.prepare("SELECT * FROM stock_moves ORDER BY ts DESC, rowid DESC LIMIT ?"),
  movesByOrder: db.prepare("SELECT * FROM stock_moves WHERE order_id = ? AND reason = 'venta'"),
  movesByIngredient: db.prepare("SELECT id FROM stock_moves WHERE ingredient_id = ? LIMIT 1"),
};

export const bumpRev = () => S.bumpRev.run();
export const getRev = () => S.getMeta.get().rev;

/* Envoltura de moveInsert. better-sqlite3 exige TODOS los parámetros con
   nombre y lanza "Missing named parameter" si falta uno, así que cada campo
   opcional que se añada al statement rompería los cinco callsites. Con los
   defaults aquí, añadir columnas al kardex deja de ser un campo minado. */
const insertMove = (p) =>
  S.moveInsert.run({ order_id: null, note: null, user_name: null, entered_qty: null, entered_unit: null, ...p });

// Misma envoltura, misma razón: orderInsert se llama desde la venta directa y
// desde el restore de un respaldo, y ganó seis columnas con la cuenta abierta.
const insertOrderRow = (p) =>
  S.orderInsert.run({
    table_json: null, status: "cobrada", opened_at: null, sent_at: null,
    paid_at: null, send_seq: 1, served_seq: 0, opened_by: null, prep_status: "pendiente", ...p,
  });

// ---------------------------------------------------- mapeo filas → shapes
// El frontend (Receipt, Historial, Resumen, Reportes) espera exactamente los
// shapes que hoy viajan en los JSON; se reconstruyen aquí.
export function rowToOrder(r) {
  const o = {
    id: r.id,
    number: r.number,
    time: r.time_label,
    orderType: r.order_type,
    lines: JSON.parse(r.lines),
    payment: JSON.parse(r.payment),
    ts: r.ts,
    cashier: r.cashier,
    prepStatus: r.prep_status || "pendiente",
    status: r.status || "cobrada",
    sendSeq: r.send_seq || 0,
    servedSeq: r.served_seq || 0,
  };
  if (r.opened_at) o.openedAt = r.opened_at;
  if (r.sent_at) o.sentAt = r.sent_at;
  if (r.paid_at) o.paidAt = r.paid_at;
  if (r.opened_by) o.openedBy = r.opened_by;
  if (r.ready_at) o.readyAt = r.ready_at;
  if (r.served_at) o.servedAt = r.served_at;
  if (r.table_json) o.table = JSON.parse(r.table_json);
  if (r.voided) {
    o.voided = true;
    o.voidReason = r.void_reason || "";
    o.voidedAt = r.voided_at;
  }
  return o;
}
export function rowToExpense(r) {
  return {
    id: r.id, ts: r.ts, concept: r.concept, amount: r.amount,
    method: r.method, kind: r.kind || "salida", registeredBy: r.registered_by,
  };
}
export function rowToArchivedShift(r) {
  const base = {
    id: r.id,
    openedAt: r.opened_at,
    closedAt: r.closed_at,
    closedAtLabel: r.closed_label,
    openingCash: r.opening_cash,
    cashSales: r.cash_sales,
    cashExpenses: r.cash_expenses,
    cashIn: r.cash_in || 0,
    cardSales: r.card_sales || 0,
    expected: r.expected,
    counted: r.counted,
    diff: r.diff,
    closeNote: r.close_note || "",
    cashLeft: r.cash_left,
  };
  if (r.compacted) {
    return { ...base, compacted: true, totals: JSON.parse(r.compact_json || "{}"), orders: [], expenses: [] };
  }
  return {
    ...base,
    orders: S.ordersByShift.all(r.id).map(rowToOrder),
    expenses: S.expensesByShift.all(r.id).map(rowToExpense),
  };
}
export const publicUser = (u) => ({ id: u.id, name: u.name, role: u.role, hue: u.hue });
export const rowToIngredient = (r) => ({
  id: r.id, name: r.name, unit: r.unit, stock: r.stock, minStock: r.min_stock, cost: r.cost,
  purchaseUnit: r.purchase_unit || r.unit,
  purchaseFactor: r.purchase_factor || 1,
  purchasePrice: r.purchase_price != null ? r.purchase_price : r.cost,
});
export const rowToMove = (r) => ({
  id: r.id, ingredientId: r.ingredient_id, delta: r.delta, reason: r.reason,
  orderId: r.order_id, note: r.note || "", ts: r.ts, user: r.user_name || "",
  // null = se registró en unidad base (todo el histórico y las ventas automáticas).
  enteredQty: r.entered_qty != null ? r.entered_qty : null,
  enteredUnit: r.entered_unit || null,
});

// ------------------------------------------------------------- inventario
/* Aplica el consumo de una orden al stock. Se llama DENTRO de la transacción
   que inserta la orden, así el descuento y la venta son atómicos.

   El consumo se calcula con el menú que tiene el SERVIDOR (kv), no con lo que
   mande la tablet: una tablet con el menú viejo no puede torcer el inventario.

   Los ids de movimiento son deterministas ("Mv:<orden>:<ingrediente>"): si el
   outbox reenvía la misma orden, el INSERT choca con la clave primaria y no
   se descuenta dos veces. */
/* Descuenta lo que consume un envío.

   El id lleva el número de envío (`seq`) porque una cuenta abierta descuenta
   varias veces: si la mesa pide otro asai y se reenvía, ese segundo consumo es
   un movimiento distinto del primero. Sin el `seq` en el id, el guard de
   idempotencia lo confundiría con el envío anterior y NO descontaría.

   Dentro de un mismo envío el id sigue siendo determinista, que es lo que hace
   que un doble tap o un reintento del outbox no descuenten dos veces. */
function applyStockForOrder(orderId, lines, userName, ts, seq = 1) {
  const menu = kvGet("fuwa_menu") || [];
  const mods = kvGet("fuwa_mods") || {};
  for (const { id, qty } of orderConsumption(lines, menu, mods)) {
    if (!S.ingGet.get(id)) continue; // ingrediente borrado: se ignora
    // seq 1 conserva el id histórico, para no re-descontar lo ya vendido.
    const moveId = seq > 1 ? `Mv:${orderId}:${seq}:${id}` : `Mv:${orderId}:${id}`;
    if (S.moveGet.get(moveId)) continue;
    insertMove({
      id: moveId, ingredient_id: id, delta: -qty, reason: "venta",
      order_id: orderId, note: null, ts, user_name: userName || null,
    });
    S.ingSetStock.run(-qty, id);
  }
}

/* Devuelve al stock lo que consumió una orden (al anularla o borrarla).

   El reverso se indexa por el id del movimiento de origen, no por el
   ingrediente: una orden con dos envíos tiene dos movimientos del mismo
   ingrediente, y una clave por ingrediente solo habría devuelto el primero. */
function restoreStockForOrder(orderId, userName, reason = "anulacion") {
  const ts = Date.now();
  for (const m of S.movesByOrder.all(orderId)) {
    if (m.delta > 0) continue; // ya es un reverso: no se revierte el reverso
    const moveId = `Ma:${m.id}`;
    if (S.moveGet.get(moveId)) continue;
    insertMove({
      id: moveId, ingredient_id: m.ingredient_id, delta: -m.delta, reason,
      order_id: orderId, note: null, ts, user_name: userName || null,
    });
    S.ingSetStock.run(-m.delta, m.ingredient_id);
  }
}

export const listIngredients = () => S.ingAll.all().map(rowToIngredient);
export const listStockMoves = (limit = 300) => S.movesRecent.all(limit).map(rowToMove);

export const upsertIngredientTx = db.transaction((data) => {
  const id = data.id || "i_" + Date.now().toString(36) + crypto.randomBytes(2).toString("hex");
  const existing = S.ingGet.get(id);
  const unit = String(data.unit || (existing && existing.unit) || "g").trim() || "g";

  /* Cambiar la unidad base de un ingrediente con historia es destructivo y
     silencioso: el stock y las cantidades de receta conservan su número, así
     que "1451 g" pasaría a leerse "1451 pza" y "18 g de café" a "18 pza".
     Se rechaza en vez de avisar, porque no hay forma de deshacerlo. */
  if (existing && unit !== existing.unit) {
    const tieneHistoria = existing.stock !== 0 || S.movesByIngredient.get(id);
    if (tieneHistoria) {
      return { error: "no se puede cambiar la unidad de un ingrediente con existencia o movimientos: crea otro ingrediente" };
    }
  }

  /* Un cliente con el build viejo no manda los campos de compra. Si los
     pisáramos con defaults, editar solo el nombre dejaría el factor en 1 y el
     costo multiplicado por 453. Se preservan los que ya estaban. */
  const prev = existing || {};
  const hasPurchase = data.purchaseFactor !== undefined || data.purchasePrice !== undefined;
  const rawFactor = hasPurchase ? Number(data.purchaseFactor) : Number(prev.purchase_factor);
  const factor = isFinite(rawFactor) && rawFactor > 0 ? rawFactor : 1; // `|| 1`, nunca `|| 0`
  const price = hasPurchase ? Number(data.purchasePrice) || 0 : prev.purchase_price != null ? prev.purchase_price : Number(data.cost) || 0;
  const purchaseUnit = (hasPurchase ? data.purchaseUnit : prev.purchase_unit) || unit;

  S.ingUpsert.run({
    id,
    name: String(data.name || prev.name || "").trim() || "Ingrediente",
    unit,
    stock: existing ? existing.stock : Number(data.stock) || 0, // el stock solo cambia con movimientos
    min_stock: data.minStock !== undefined ? Number(data.minStock) || 0 : Number(prev.min_stock) || 0,
    // cost ya no se teclea: se deriva del precio de compra. Es lo que consumen
    // las recetas, el margen del menú y la ganancia neta.
    cost: costPerBase(price, factor),
    purchase_unit: String(purchaseUnit).trim().slice(0, 16),
    purchase_factor: factor,
    purchase_price: price,
  });
  S.bumpRev.run();
  return { ingredient: rowToIngredient(S.ingGet.get(id)) };
});

export const archiveIngredientTx = db.transaction((id) => {
  if (!S.ingGet.get(id)) return { error: "ingrediente no encontrado" };
  S.ingArchive.run(id); // se archiva, no se borra: el kardex conserva su historia
  S.bumpRev.run();
  return { ok: true };
});

/* Movimiento manual: compra (entrada), merma o ajuste por conteo físico.
   `mode: "delta"` suma/resta; `mode: "set"` deja el stock en el valor dado
   (conteo físico) calculando la diferencia necesaria. */
export const adjustStockTx = db.transaction((data, userName) => {
  const ing = S.ingGet.get(data.ingredientId);
  if (!ing) return { error: "ingrediente no encontrado" };
  const amount = Number(data.amount);
  if (!isFinite(amount)) return { error: "cantidad inválida" };

  /* La conversión la hace el SERVIDOR con su propio factor: el cliente dice en
     qué unidad tecleó, no el resultado. Una tablet con el modal abierto desde
     hace rato podría tener un factor viejo, y un delta mal convertido ya no se
     distingue de uno correcto. `unitMode` ausente = unidad base, así que los
     clientes anteriores a este cambio siguen funcionando igual. */
  const enPresentacion = data.unitMode === "purchase";
  const factor = enPresentacion ? ing.purchase_factor || 1 : 1;
  const enBase = Math.round(amount * factor * 1000) / 1000;
  // El guard de arriba mira la entrada; multiplicar puede producir Infinity.
  if (!isFinite(enBase)) return { error: "cantidad inválida" };

  const delta = data.mode === "set" ? Math.round((enBase - ing.stock) * 1000) / 1000 : enBase;
  if (!delta) return { ok: true, ingredient: rowToIngredient(ing) }; // nada que registrar
  const id = data.id || "M" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
  if (S.moveGet.get(id)) return { ok: true, ingredient: rowToIngredient(ing) }; // idempotente
  insertMove({
    id, ingredient_id: ing.id, delta,
    reason: data.reason || "ajuste",
    order_id: null, note: data.note || null,
    ts: Date.now(), user_name: userName || null,
    // Rastro de lo tecleado, para poder cuadrar contra la factura del proveedor.
    entered_qty: enPresentacion ? amount : null,
    entered_unit: enPresentacion ? ing.purchase_unit : null,
  });
  S.ingSetStock.run(delta, ing.id);
  S.bumpRev.run();
  return { ok: true, ingredient: rowToIngredient(S.ingGet.get(ing.id)) };
});

// Estado del turno con el shape del cliente ({open, openingCash, openedAt, closedAt}).
// closedAt con caja cerrada es la ETIQUETA del último cierre (así lo usa OpenRegister).
export function currentShiftState() {
  const open = S.openShift.get();
  if (open) return { row: open, shape: { open: true, openingCash: open.opening_cash, openedAt: open.opened_at, closedAt: null } };
  const last = S.lastClosedShift.get();
  return {
    row: null,
    shape: {
      open: false,
      openingCash: 0,
      openedAt: null,
      closedAt: last ? last.closed_label : null,
      // Traspaso de turno: lo que dejó escrito quien cerró, y cuánto efectivo
      // dijo haber dejado en la caja (el resto se va al banco).
      lastCloseNote: last ? last.close_note || "" : "",
      lastCashLeft: last && last.cash_left !== null ? last.cash_left : null,
    },
  };
}

// ------------------------------------------------------------- kv (config)
// fuwa_tweaks quedó huérfana al quitar el panel de apariencia (la identidad
// visual ahora es fija en styles.css). Se conserva la clave para que los
// respaldos hechos antes del cambio sigan importándose sin error.
// fuwa_negocio: nombre, NIT, dirección y pie que salen impresos en el ticket.
export const KV_KEYS = ["fuwa_menu", "fuwa_mods", "fuwa_cats", "fuwa_areas", "fuwa_tweaks", "fuwa_last_backup", "fuwa_negocio"];
export function kvGet(key) {
  const row = S.kvGet.get(key);
  return row ? JSON.parse(row.value) : null;
}
export const kvSet = db.transaction((key, value) => {
  S.kvSet.run(key, JSON.stringify(value), Date.now());
  S.bumpRev.run();
});

// Cuándo se escribió esta clave por última vez (0 si nunca).
export const kvUpdatedAt = (key) => (S.kvUpdatedAt.get(key) || {}).updated_at || 0;

// ------------------------------------------------------------ estado total
/* Tablero de barra: órdenes enviadas y no entregadas, con SOLO sus items de
   bebida ya enviados.

   El filtrado es del servidor y no de la pantalla a propósito. Si viajaran
   todos los items y el cliente escondiera los de cocina, un bug de render o una
   versión vieja de la tablet le mostraría al barista comida que él no prepara.
   Además, una orden cuya comida ya salió pero cuya bebida sigue pendiente no
   tiene por qué mandarle al barista lo que no le toca.

   Las órdenes que se quedan sin items de bebida no entran al tablero: son
   órdenes de pura comida y su camino es la impresora de cocina. */
function kdsBoard() {
  const cats = kvGet("fuwa_cats") || [];
  const out = [];
  for (const r of S.kdsOrders.all()) {
    const o = rowToOrder(r);
    /* Solo las rondas que aún no se entregaron. Si la mesa ya recibió su primera
       tanda y pidió más, el barista debe ver lo NUEVO y no volver a preparar lo
       que ya salió. activeLines quita además lo que el cliente canceló. */
    const servido = r.served_seq || 0;
    const pendientes = activeLines(o.lines).filter((l) => l.sentSeq && l.sentSeq > servido);
    const bebidas = splitByStation(pendientes, cats).barra;
    if (bebidas.length) out.push({ ...o, lines: bebidas });
  }
  return out;
}

export function getFullState() {
  const { shape: shift, row } = currentShiftState();
  return {
    rev: getRev(),
    config: Object.fromEntries(KV_KEYS.map((k) => [k, kvGet(k)])),
    users: S.userAll.all().map(publicUser),
    shift,
    // `orders` son SOLO las cobradas: es lo que consumen el arqueo, el
    // historial y los reportes. Las cuentas abiertas viajan aparte justamente
    // para que ningún cálculo de dinero las pueda confundir con una venta.
    orders: row ? S.ordersByShift.all(row.id).map(rowToOrder) : [],
    openOrders: S.openOrders.all().map(rowToOrder),
    kds: kdsBoard(),
    expenses: row ? S.expensesByShift.all(row.id).map(rowToExpense) : [],
    shiftHistory: S.closedShifts.all().map(rowToArchivedShift),
    // Las existencias viajan en cada sync (son pocas filas y las tablets las
    // necesitan para avisar de faltantes). El kardex NO: se pide aparte desde
    // la pantalla de Inventario para no engordar el polling de 4s.
    ingredients: listIngredients(),
  };
}

/* Métricas para el celular del dueño (vía Tailscale). Se calculan en el
   servidor y no en el cliente a propósito: el dueño consulta desde afuera y no
   tiene por qué descargarse el turno entero para ver cuatro números. */
export function getDashboard() {
  const { row } = currentShiftState();
  const inicioDia = new Date(); inicioDia.setHours(0, 0, 0, 0);
  const desde = inicioDia.getTime();

  const delDia = db.prepare(
    "SELECT * FROM orders WHERE status = 'cobrada' AND voided = 0 AND paid_at >= ?"
  ).all(desde);

  let ventas = 0, propinas = 0, efectivo = 0, tarjeta = 0;
  for (const r of delDia) {
    const p = JSON.parse(r.payment);
    ventas += p.subtotal || 0;
    propinas += p.tip || 0;
    const parts = p.split ? p.parts || [] : [{ method: p.method, total: p.total }];
    for (const x of parts) {
      if (x.method === "efectivo") efectivo += x.total;
      else tarjeta += x.total;
    }
  }

  const cogs = delDia.reduce((s, r) => {
    const { cost } = orderCost(rowToOrder(r), kvGet("fuwa_menu") || [], kvGet("fuwa_mods") || {}, byId(listIngredients()));
    return s + cost;
  }, 0);

  const abiertas = S.openOrders.all().map(rowToOrder);
  const bajoMinimo = listIngredients().filter((i) => !i.archived && i.stock <= i.minStock);

  return {
    ts: Date.now(),
    caja: row ? { abierta: true, desde: row.opened_at, fondo: row.opening_cash } : { abierta: false },
    hoy: {
      ordenes: delDia.length,
      ventas: Math.round(ventas * 100) / 100,
      propinas: Math.round(propinas * 100) / 100,
      efectivo: Math.round(efectivo * 100) / 100,
      tarjeta: Math.round(tarjeta * 100) / 100,
      costoInsumos: Math.round(cogs * 100) / 100,
      gananciaNeta: Math.round((ventas - cogs) * 100) / 100,
      ticketPromedio: delDia.length ? Math.round((ventas / delDia.length) * 100) / 100 : 0,
    },
    cuentasAbiertas: {
      total: abiertas.length,
      // activeLines: lo anulado no se le va a cobrar a nadie.
      montoEstimado: Math.round(abiertas.reduce((s, o) => s + activeLines(o.lines).reduce((t, l) => t + lineTotal(l), 0), 0) * 100) / 100,
      // Lo que ya se mandó a preparar y sigue sin cobrarse: es el número que
      // avisa de una mesa olvidada.
      enviadas: abiertas.filter((o) => o.status === "enviada").length,
    },
    preparacion: {
      pendientes: S.kdsOrders.all().length,
    },
    alertas: {
      insumosBajoMinimo: bajoMinimo.map((i) => ({ name: i.name, stock: i.stock, unit: i.unit, minStock: i.minStock })),
      impresionesPendientes: pendingJobCount(),
    },
  };
}

// -------------------------------------------------------------- mutadores
// (transacciones better-sqlite3: síncronas, un solo proceso → sin carreras)

// Suma el efectivo de las órdenes válidas (réplica de cashFromOrders del cliente:
// el servidor calcula el arqueo sobre SUS filas, no confía en el cliente).
function sumByMethod(rows, keep) {
  return rows
    .filter((r) => !r.voided)
    .reduce((s, r) => {
      const p = JSON.parse(r.payment);
      const parts = p.split ? p.parts : [{ method: p.method, total: p.total }];
      return s + parts.filter((x) => keep(x.method)).reduce((s2, x) => s2 + x.total, 0);
    }, 0);
}
export const cashFromOrderRows = (rows) => sumByMethod(rows, (m) => m === "efectivo");
// Todo lo que no es efectivo cuenta como tarjeta, igual que en el cliente.
export const cardFromOrderRows = (rows) => sumByMethod(rows, (m) => m !== "efectivo");

// Reparte los gastos del turno en salidas y entradas de efectivo. Las entradas
// son dinero que ingresa a la caja aparte de las ventas (aportes, reembolsos).
export function cashMovesFromExpenseRows(rows) {
  let out = 0;
  let cashIn = 0;
  for (const e of rows) {
    if (e.method !== "efectivo") continue;
    if ((e.kind || "salida") === "entrada") cashIn += e.amount;
    else out += e.amount;
  }
  return { cashExpenses: out, cashIn };
}

/* ------------------------------------------------ cuenta abierta y ruteo */

const jobId = () => "J" + Date.now().toString(36) + crypto.randomBytes(4).toString("hex");

const round2 = (n) => Math.round(n * 100) / 100;

/* Valida las líneas que entran por la API.

   La cantidad tiene que ser un entero positivo. Sin esto, una línea con
   `qty: -3` pasaba entera: `lineConsumption` multiplica la receta por la
   cantidad, así que al enviarla el "consumo" salía negativo y el stock SUBÍA.
   Era una forma de inventar existencias desde el cliente, y además dejaba
   totales negativos en la cuenta. El servidor no puede confiar en que la tablet
   mande cantidades sanas. */
function validarLineas(lines) {
  if (!Array.isArray(lines)) return "las líneas deben ser una lista";
  for (const l of lines) {
    if (!l || typeof l !== "object") return "línea inválida";
    if (!l.uid) return "cada línea necesita un uid";
    const q = Number(l.qty);
    if (!Number.isFinite(q) || q <= 0 || Math.floor(q) !== q) return `cantidad inválida en "${l.name || l.uid}"`;
    const p = Number(l.basePrice);
    if (!Number.isFinite(p) || p < 0) return `precio inválido en "${l.name || l.uid}"`;
  }
  const uids = lines.map((l) => l.uid);
  if (new Set(uids).size !== uids.length) return "hay líneas con el mismo uid";
  return null;
}

/* Encola un papel. Se llama SIEMPRE dentro de la transacción que provoca la
   impresión, nunca después: si el commit pasa, el ticket está garantizado
   aunque el proceso muera en la línea siguiente, porque el worker lo encuentra
   pendiente al arrancar. */
function enqueuePrint(target, kind, orderId, payload) {
  S.jobInsert.run({
    id: jobId(), target, kind, order_id: orderId || null,
    payload: JSON.stringify(payload), created_at: Date.now(), next_try_at: 0,
  });
}

export const dueJobs = (now) => S.jobsDue.all(now);
export const markJobDone = (id) => S.jobDone.run(Date.now(), id);
export const markJobRetry = (id, err, next) => S.jobRetry.run({ id, err, next });
/* Descarte definitivo. Solo para el caso en que el destino no existe: reintentar
   contra una impresora configurada como `off` no la va a encender nunca, y
   dejarlo pendiente ensucia para siempre el contador de "papeles atorados", que
   es la señal que sí necesita atención. La orden no se pierde: sigue en la base
   y se puede reimprimir. */
export const markJobDiscarded = (id, err) => S.jobDiscard.run({ id, err });
export const pendingJobCount = () => S.jobsPendingCount.get().n;
export const pruneOldJobs = (before) => S.jobsPruneOld.run(before);
export const recentJobs = (n = 30) =>
  S.jobsRecent.all(n).map((j) => ({
    id: j.id, target: j.target, kind: j.kind, orderId: j.order_id, status: j.status,
    attempts: j.attempts, lastError: j.last_error, createdAt: j.created_at, printedAt: j.printed_at,
  }));

/* Manda a preparar lo que aún no se ha mandado.

   Es la regla del cliente, implementada del lado que manda: la comida SOLO se
   imprime en cocina y la bebida SOLO aparece en el tablero de barra. Un item
   nunca viaja por los dos caminos.

   Devuelve qué se hizo, para que el endpoint pueda contestar "salieron 3 a
   cocina, 2 quedaron en barra" y el mesero lo vea. */
function routeOrderTx(row, seq) {
  const cats = kvGet("fuwa_cats") || [];
  const lines = JSON.parse(row.lines);
  const nuevas = pendingLines(lines);
  if (!nuevas.length) return { cocina: 0, barra: 0 };

  const { cocina, barra } = splitByStation(nuevas, cats);

  if (cocina.length) {
    enqueuePrint("cocina", "comanda", row.id, {
      number: row.number,
      time: row.time_label,
      orderType: row.order_type,
      table: row.table_json ? JSON.parse(row.table_json) : null,
      cashier: row.cashier,
      // Un envío posterior al primero es un agregado, no la orden completa.
      agregado: seq > 1,
      lines: cocina.map((l) => ({ qty: l.qty, name: l.name, size: l.size, mods: l.mods, note: l.note })),
    });
  }

  // Las de barra no imprimen nada: entran al KDS por la consulta kdsOrders,
  // que lee las órdenes con sent_at. No hay que hacer nada más aquí.

  // Se marcan como enviadas TODAS las nuevas, incluidas las de barra: es lo que
  // impide que el siguiente envío las vuelva a mandar.
  S.orderSetLines.run({
    id: row.id,
    lines: JSON.stringify(stampSent(lines, seq)),
    table_json: row.table_json,
    order_type: row.order_type,
  });

  return { cocina: cocina.length, barra: barra.length };
}

/* Abre una cuenta. La orden ya existe en la base y ya tiene número, pero
   todavía no es una venta: `status='abierta'` la mantiene fuera de
   `ordersByShift` y por lo tanto fuera del arqueo y de los reportes. */
export const openOrderTx = db.transaction((data, user) => {
  const existing = S.orderGet.get(data.id);
  if (existing) return { order: rowToOrder(existing), existed: true }; // idempotente
  const malas = validarLineas(data.lines || []);
  if (malas) return { error: malas, invalido: true };
  const open = S.openShift.get();
  if (!open) return { error: "caja cerrada" };
  const now = data.ts || Date.now();
  const number = S.getMeta.get().order_seq;
  insertOrderRow({
    id: data.id,
    shift_id: open.id,
    number,
    ts: now,
    time_label: data.time || "",
    order_type: data.orderType || "Aquí",
    cashier: user || data.cashier || "Barista",
    lines: JSON.stringify(data.lines || []),
    payment: JSON.stringify({}),
    table_json: data.table ? JSON.stringify(data.table) : null,
    status: "abierta",
    opened_at: now,
    send_seq: 0,
    opened_by: user || null,
  });
  S.bumpSeq.run();
  S.bumpRev.run();
  return { order: rowToOrder(S.orderGet.get(data.id)), existed: false };
});

/* Reemplaza las líneas de una cuenta abierta (agregar, quitar, cambiar mesa).

   Las líneas ya enviadas NO se pueden tocar: ya se están preparando y quitar
   una de la pantalla no la despepara. Para eso está anular la orden. */
export const updateOrderLinesTx = db.transaction((id, data) => {
  const row = S.orderGet.get(id);
  if (!row) return { error: "orden no encontrada" };
  if (row.status === "cobrada") return { error: "la orden ya se cobró" };
  if (row.voided) return { error: "la orden está anulada" };
  const malas = validarLineas(data.lines || []);
  if (malas) return { error: malas, invalido: true };

  /* Se conservan las enviadas y las anuladas tal cual, y solo se aceptan del
     cliente las líneas nuevas. Así una tablet desactualizada no puede resucitar
     un item que otra acaba de cancelar ni borrar el rastro de la anulación.

     El descarte por uid es imprescindible, no una optimización: una tablet con
     la cuenta vieja en pantalla reenvía la línea SIN la marca de enviada ni de
     anulada, y sin esto entraría como línea nueva junto a la que ya existe. El
     resultado sería cobrarle dos veces el mismo producto al cliente y descontar
     el insumo dos veces. El uid lo genera el cliente y es único por línea. */
  const previas = JSON.parse(row.lines).filter((l) => l.sentSeq || l.voided);
  const yaEstan = new Set(previas.map((l) => l.uid));
  const entrantes = (data.lines || []).filter((l) => !l.sentSeq && !l.voided && !yaEstan.has(l.uid));
  const merged = [...previas, ...entrantes];

  S.orderSetLines.run({
    id,
    lines: JSON.stringify(merged),
    table_json: data.table !== undefined ? (data.table ? JSON.stringify(data.table) : null) : row.table_json,
    order_type: data.orderType || row.order_type,
  });
  S.bumpRev.run();
  return { order: rowToOrder(S.orderGet.get(id)) };
});

/* Manda la cuenta a preparar. Es idempotente por construcción: lo que ya lleva
   `sentSeq` no se vuelve a imprimir ni a descontar, así que un doble tap del
   mesero o un reintento del outbox no duplican nada. */
export const sendOrderTx = db.transaction((id, user) => {
  const row = S.orderGet.get(id);
  if (!row) return { error: "orden no encontrada" };
  if (row.voided) return { error: "la orden está anulada" };
  const lines = JSON.parse(row.lines);
  if (!pendingLines(lines).length) return { ok: true, sinCambios: true, order: rowToOrder(row) };

  const seq = (row.send_seq || 0) + 1;
  /* El inventario se descuenta AQUÍ, no al cobrar: es cuando el producto se
     prepara de verdad. Si el cliente se va sin pagar, el insumo igual se gastó
     y el inventario tiene que reflejarlo. Los ids de movimiento llevan el uid de
     la línea, así que un reenvío no puede descontar dos veces. */
  applyStockForOrder(row.id, pendingLines(lines), user || row.cashier, Date.now(), seq);
  const ruteo = routeOrderTx(row, seq);
  S.orderMarkSent.run({ id, now: Date.now(), send_seq: seq });
  S.bumpRev.run();
  return { ok: true, ruteo, order: rowToOrder(S.orderGet.get(id)) };
});

/* Quita un item de una cuenta, incluso si ya se mandó a preparar.

   Es el caso real: el cliente se arrepiente después de que la comanda salió.
   Tres cosas tienen que pasar juntas o ninguna:

     1. La línea se marca anulada (no se borra: ver activeLines).
     2. El insumo vuelve al inventario, calculado SOLO de esa línea.
     3. Si había ido a cocina, sale una comanda de CANCELACIÓN — sin esto el
        cocinero lo prepara igual, que es el error que el sistema debe evitar.

   Si la línea aún no se había enviado no hay nada que devolver ni que avisar:
   se marca y ya. */
export const cancelOrderLineTx = db.transaction((orderId, uid, reason, user) => {
  const row = S.orderGet.get(orderId);
  if (!row) return { error: "orden no encontrada" };
  if (row.voided) return { error: "la orden está anulada" };
  if (row.status === "cobrada") return { error: "la orden ya se cobró" };

  const lines = JSON.parse(row.lines);
  const idx = lines.findIndex((l) => l.uid === uid);
  if (idx < 0) return { error: "item no encontrado" };
  if (lines[idx].voided) return { ok: true, order: rowToOrder(row) }; // idempotente

  const linea = lines[idx];
  const enviada = !!linea.sentSeq;

  if (enviada) {
    /* Devolución por línea. Los movimientos de venta se guardan agregados por
       ingrediente para todo el envío, así que no se puede "revertir el
       movimiento": hay que recalcular lo que consumía ESTA línea. El id lleva
       el uid, con lo que anular dos veces no devuelve doble. */
    const menu = kvGet("fuwa_menu") || [];
    const mods = kvGet("fuwa_mods") || {};
    const ts = Date.now();
    for (const [ingId, qty] of lineConsumption(linea, menu, mods)) {
      if (!S.ingGet.get(ingId)) continue;
      const moveId = `Mx:${orderId}:${uid}:${ingId}`;
      if (S.moveGet.get(moveId)) continue;
      const delta = round3(qty);
      insertMove({
        id: moveId, ingredient_id: ingId, delta, reason: "anulacion",
        order_id: orderId, note: `anulado: ${linea.name}`, ts, user_name: user || null,
      });
      S.ingSetStock.run(delta, ingId);
    }

    // Aviso a la cocina. La barra no lo necesita: la línea desaparece del
    // tablero en el siguiente sync, que llega en 4 segundos.
    const cats = kvGet("fuwa_cats") || [];
    if (stationOf(linea.catId, cats) === "cocina") {
      enqueuePrint("cocina", "comanda", orderId, {
        number: row.number,
        time: row.time_label,
        orderType: row.order_type,
        table: row.table_json ? JSON.parse(row.table_json) : null,
        cashier: user || row.cashier,
        cancelacion: true,
        motivo: reason || "",
        lines: [{ qty: linea.qty, name: linea.name, size: linea.size, mods: linea.mods, note: linea.note }],
      });
    }
  }

  lines[idx] = {
    ...linea,
    voided: true,
    voidReason: reason || "",
    voidedAt: Date.now(),
    voidedBy: user || null,
  };
  S.orderSetLines.run({
    id: orderId,
    lines: JSON.stringify(lines),
    table_json: row.table_json,
    order_type: row.order_type,
  });
  S.bumpRev.run();
  return { ok: true, devolvioStock: enviada, order: rowToOrder(S.orderGet.get(orderId)) };
});

/* Cobra una cuenta abierta. Aquí es donde se vuelve una venta.

   El turno se reasigna al que está abierto AHORA: una cuenta abierta a las
   11 pm y cobrada a las 12:15, después del cierre, es dinero que entró en el
   turno nuevo y ahí tiene que cuadrar. */
export const payOrderTx = db.transaction((id, payment, cashier) => {
  const row = S.orderGet.get(id);
  if (!row) return { error: "orden no encontrada" };
  if (row.voided) return { error: "la orden está anulada" };
  if (row.status === "cobrada") return { order: rowToOrder(row), existed: true }; // idempotente
  const open = S.openShift.get();
  if (!open) return { error: "caja cerrada" };

  const lines = JSON.parse(row.lines);

  /* El importe se contrasta contra las líneas VIVAS del servidor.

     Sin esto, dos tablets sobre la misma mesa se pisan de la peor forma: la
     primera anula un producto, la segunda —que tenía la cuenta en pantalla—
     cobra el total viejo, y al cliente se le cobra algo que se canceló. La
     ventana es de minutos u horas, no de segundos como en el mostrador.

     No se corrige el monto en silencio: se rechaza para que el cajero vea la
     cuenta actualizada y vuelva a cobrar. Un cobro que cambia solo de importe
     es peor que un error visible. */
  const esperado = round2(activeLines(lines).reduce((s, l) => s + lineTotal(l), 0));
  const recibido = round2(Number(payment && payment.subtotal) || 0);
  if (Math.abs(esperado - recibido) > 0.01) {
    return { error: "la cuenta cambió mientras cobrabas", esperado, recibido, cambio: true };
  }

  // Cobrar implica mandar lo que quedara pendiente: nadie cobra algo que no se
  // preparó, y si el mesero olvidó enviar, esto lo salva.
  if (pendingLines(lines).length) {
    const seq = (row.send_seq || 0) + 1;
    applyStockForOrder(row.id, pendingLines(lines), cashier, Date.now(), seq);
    routeOrderTx(S.orderGet.get(id), seq);
    S.orderMarkSent.run({ id, now: Date.now(), send_seq: seq });
  }

  const now = Date.now();
  S.orderMarkPaid.run({
    id, now,
    payment: JSON.stringify(payment || {}),
    shift_id: open.id,
    cashier: cashier || row.cashier,
    // `ts` pasa a ser la hora del cobro: es la que usan los reportes por hora y
    // el arqueo, que hablan de cuándo entró el dinero.
    ts: now,
    /* La hora del ticket es la del COBRO, no la de apertura. `ts` ya se mueve a
       ahora (los reportes por hora hablan de cuándo entró el dinero) y dejar la
       etiqueta con la hora de apertura hacía que el papel dijera "9:05 a. m."
       en una venta cobrada a las 15:40. Mismo formato que usa el cliente. */
    time_label: (payment && payment.time) || new Date(now).toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" }),
  });
  enqueueTicketFor(S.orderGet.get(id));
  S.bumpRev.run();
  return { order: rowToOrder(S.orderGet.get(id)), existed: false };
});

/* El ticket del cliente lleva TODOS los items, los de cocina y los de barra:
   el ruteo de preparación no tiene nada que ver con lo que se cobra. */
function enqueueTicketFor(row) {
  // Lo anulado no se cobra: no aparece en la cuenta del cliente.
  const lines = activeLines(JSON.parse(row.lines));
  const pay = JSON.parse(row.payment || "{}");
  const cfg = kvGet("fuwa_negocio") || {};
  enqueuePrint("caja", "ticket", row.id, {
    business: cfg.nombre || "FUWA",
    tagline: cfg.lema || "",
    address: cfg.direccion || "",
    nit: cfg.nit || "",
    footer: cfg.pie || "",
    number: row.number,
    time: row.time_label,
    orderType: row.order_type,
    table: row.table_json ? JSON.parse(row.table_json) : null,
    cashier: row.cashier,
    lines: lines.map((l) => ({
      qty: l.qty, name: l.name, size: l.size, mods: l.mods, note: l.note,
      lineTotal: lineTotal(l),
    })),
    subtotal: pay.subtotal || 0,
    tip: pay.tip || 0,
    total: pay.total || 0,
    method: pay.method || "efectivo",
    received: pay.received,
    change: pay.change,
  });
}

/* Página de prueba. Usa el mismo camino que un papel real (cola + worker +
   driver), así que si esto sale, sale todo: no es una ruta paralela que pueda
   funcionar mientras la de verdad está rota. */
export const testPrintTx = db.transaction((target, userName) => {
  const now = new Date();
  const hora = now.toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" });
  if (target === "cocina") {
    enqueuePrint("cocina", "comanda", null, {
      number: "TEST", time: hora, orderType: "Prueba de impresión", table: null,
      cashier: userName || "", agregado: false,
      lines: [{ qty: 1, name: "Prueba de comanda", size: null, mods: [], note: "Si lees esto, la impresora de cocina está bien configurada" }],
    });
  } else {
    enqueuePrint("caja", "ticket", null, {
      business: "FUWA", tagline: "Prueba de impresión", number: "TEST", time: hora,
      orderType: "Prueba", table: null, cashier: userName || "",
      lines: [{ qty: 1, name: "Prueba de ticket", size: null, mods: [], note: "", lineTotal: 0 }],
      subtotal: 0, tip: 0, total: 0, method: "prueba",
      footer: "Si lees esto, la impresora de caja está bien configurada",
    });
  }
  S.bumpRev.run();
  return { ok: true };
});

// Reimpresión manual del ticket (se rompió el papel, el cliente quiere otra).
export const reprintTicketTx = db.transaction((id) => {
  const row = S.orderGet.get(id);
  if (!row) return { error: "orden no encontrada" };
  if (row.status !== "cobrada") return { error: "la orden aún no se cobra" };
  enqueueTicketFor(row);
  S.bumpRev.run();
  return { ok: true };
});

export const insertOrder = db.transaction((data, cashier) => {
  const existing = S.orderGet.get(data.id);
  if (existing) return { order: rowToOrder(existing), existed: true }; // idempotente
  const malas = validarLineas(data.lines || []);
  if (malas) return { error: malas, invalido: true };
  const open = S.openShift.get();
  if (!open) return { error: "caja cerrada" };
  const number = S.getMeta.get().order_seq;
  const now = data.ts || Date.now();
  insertOrderRow({
    id: data.id,
    shift_id: open.id,
    number,
    ts: now,
    time_label: data.time || "",
    order_type: data.orderType || "Aquí",
    cashier: cashier || data.cashier || "Barista",
    lines: JSON.stringify(data.lines || []),
    payment: JSON.stringify(data.payment || {}),
    table_json: data.table ? JSON.stringify(data.table) : null,
    // Venta de mostrador: se toma, se manda a preparar y se cobra en un acto.
    status: "cobrada",
    opened_at: now,
    sent_at: now,
    paid_at: now,
    send_seq: 1,
    opened_by: cashier || data.cashier || null,
  });
  S.bumpSeq.run();
  // Descuenta los ingredientes en la MISMA transacción que la venta: o se
  // registran las dos cosas, o ninguna.
  applyStockForOrder(data.id, data.lines || [], cashier || data.cashier, now);
  // Aunque se cobre de una vez, los items siguen teniendo que llegar a quien
  // los prepara: la comida se imprime en cocina y la bebida entra al tablero.
  routeOrderTx(S.orderGet.get(data.id), 1);
  enqueueTicketFor(S.orderGet.get(data.id));
  S.bumpRev.run();
  return { order: rowToOrder(S.orderGet.get(data.id)), existed: false };
});

export const voidOrderTx = db.transaction((idOrNumber, reason, userName) => {
  const open = S.openShift.get();
  let row = S.orderGet.get(String(idOrNumber));
  if (!row && open) row = S.orderGetByNumber.get(Number(idOrNumber), open.id);
  if (!row) return { error: "orden no encontrada" };
  if (row.voided) return { ok: true }; // ya anulada: no devolver stock dos veces
  S.orderVoid.run(reason || "", Date.now(), row.id);
  restoreStockForOrder(row.id, userName); // lo consumido vuelve al inventario
  S.bumpRev.run();
  return { ok: true };
});

export const insertExpense = db.transaction((data, registeredBy) => {
  const existing = S.expenseGet.get(data.id);
  if (existing) return { expense: rowToExpense(existing), existed: true };
  const open = S.openShift.get();
  if (!open) return { error: "caja cerrada" };
  S.expenseInsert.run({
    id: data.id,
    shift_id: open.id,
    ts: data.ts || Date.now(),
    concept: data.concept,
    amount: data.amount,
    method: data.method,
    kind: data.kind === "entrada" ? "entrada" : "salida",
    registered_by: registeredBy || data.registeredBy || "Barista",
  });
  S.bumpRev.run();
  return { expense: rowToExpense(S.expenseGet.get(data.id)), existed: false };
});

export const deleteExpenseTx = db.transaction((id) => {
  S.expenseDelete.run(id);
  S.bumpRev.run();
  return { ok: true };
});

export const openShiftTx = db.transaction((openingCash) => {
  if (S.openShift.get()) return { error: "ya hay un turno abierto" };
  const id = "S" + Date.now().toString(36);
  S.shiftInsert.run({ id, opened_at: Date.now(), opening_cash: Number(openingCash) || 0 });
  S.bumpRev.run();
  return { ok: true };
});

export const closeShiftTx = db.transaction((countedCash, opts = {}) => {
  const open = S.openShift.get();
  if (!open) return { error: "no hay turno abierto" };
  const orderRows = S.ordersByShift.all(open.id);
  // Cuentas de mesa que quedan sin cobrar. NO bloquean el cierre —su dinero
  // entrará en el turno siguiente, que es lo correcto— pero el cajero tiene que
  // saber que hay mesas vivas antes de contar el efectivo y irse.
  const cuentasAbiertas = S.openOrders.all().length;
  const cashSales = cashFromOrderRows(orderRows);
  const cardSales = cardFromOrderRows(orderRows);
  const { cashExpenses, cashIn } = cashMovesFromExpenseRows(S.expensesByShift.all(open.id));
  // La tarjeta NO entra al arqueo: no hay billetes que contar por ella.
  const expected = open.opening_cash + cashSales + cashIn - cashExpenses;
  const counted = Number(countedCash) || 0;
  const cashLeft = opts.cashLeft === null || opts.cashLeft === undefined ? null : Number(opts.cashLeft) || 0;
  const label = new Date().toLocaleString("es-GT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  S.shiftClose.run({
    id: open.id,
    closed_at: Date.now(),
    closed_label: label,
    cash_sales: cashSales,
    cash_expenses: cashExpenses,
    cash_in: cashIn,
    card_sales: cardSales,
    expected,
    counted,
    diff: Math.round((counted - expected) * 100) / 100,
    close_note: String(opts.closeNote || "").slice(0, 500).trim() || null,
    cash_left: cashLeft,
  });
  S.bumpRev.run();
  return { ok: true, cuentasAbiertas };
});

/* KDS de barra. Solo se permiten saltos de un paso, hacia adelante o hacia
   atrás: así el "deshacer" del tablero no puede inventar estados imposibles
   ni resucitar una orden entregada hace media hora. */
export const PREP_FLOW = ["pendiente", "listo", "entregado"];
export const setOrderPrepTx = db.transaction((idOrNumber, status) => {
  const next = PREP_FLOW.indexOf(status);
  if (next < 0) return { error: "estado inválido" };
  const open = S.openShift.get();
  let row = S.orderGet.get(String(idOrNumber));
  if (!row && open) row = S.orderGetByNumber.get(Number(idOrNumber), open.id);
  if (!row) return { error: "orden no encontrada" };
  if (row.voided) return { error: "la orden está anulada" };
  const current = PREP_FLOW.indexOf(row.prep_status || "pendiente");
  if (Math.abs(next - current) > 1) return { error: "transición no permitida" };
  if (next === current) return { ok: true, order: rowToOrder(row) }; // idempotente
  const now = Date.now();
  S.orderSetPrep.run({
    id: row.id,
    status,
    // Al retroceder se limpia el sello del paso que se deshizo.
    ready_at: next >= 1 ? row.ready_at || now : null,
    served_at: next >= 2 ? row.served_at || now : null,
  });

  /* Entregar cierra las rondas enviadas hasta ahora; deshacer las reabre.
     `served_prev` guarda el valor anterior porque el tablero permite deshacer:
     sin él, deshacer tendría que adivinar hasta dónde se había entregado antes
     y reaparecerían tandas que ya salieron. */
  if (status === "entregado") {
    S.orderSetServed.run({ id: row.id, served_seq: row.send_seq || 0, served_prev: row.served_seq || 0 });
  } else if ((row.prep_status || "pendiente") === "entregado") {
    S.orderSetServed.run({ id: row.id, served_seq: row.served_prev || 0, served_prev: 0 });
  }
  S.bumpRev.run();
  return { ok: true, order: rowToOrder(S.orderGet.get(row.id)) };
});

export const reopenShiftTx = db.transaction((shiftId) => {
  if (S.openShift.get()) return { error: "ya hay un turno abierto" };
  const row = S.shiftGet.get(shiftId);
  if (!row || row.status !== "closed") return { error: "turno no encontrado" };
  if (row.compacted) return { error: "turno compactado: ya no se puede reabrir" };
  S.shiftReopen.run(shiftId);
  S.bumpRev.run();
  return { ok: true };
});

// Borrado permanente de las órdenes del turno abierto (Herramientas → admin).
export const clearOpenShiftOrdersTx = db.transaction((userName) => {
  const open = S.openShift.get();
  if (!open) return { error: "no hay turno abierto" };
  /* Devuelve al inventario lo consumido antes de borrar: si no, el stock
     quedaría descontado por ventas que ya no existen en ningún reporte.

     Se recorren TODAS las órdenes del turno, no solo las cobradas. Una cuenta de
     mesa abierta ya descontó inventario al enviarse a preparar, y el DELETE de
     abajo se la lleva igual: leer solo las cobradas dejaba ese consumo huérfano
     para siempre y hacía desaparecer mesas vivas sin dejar rastro. */
  const todas = S.ordersByShiftAll.all(open.id);
  for (const row of todas) {
    if (!row.voided) restoreStockForOrder(row.id, userName, "ajuste");
  }
  S.shiftDeleteData.run(open.id);
  S.bumpRev.run();
  // Se informa el desglose para que la pantalla pueda advertir que también se
  // borraron cuentas que estaban en servicio.
  return {
    ok: true,
    cobradas: todas.filter((r) => r.status === "cobrada").length,
    abiertas: todas.filter((r) => r.status !== "cobrada").length,
  };
});

// Compacta turnos cerrados hace más de `days` (antes lo hacía el cliente).
// Réplica de compactShift de src/lib/reportStats.js sobre las filas del server.
export const compactOldShifts = db.transaction((days = 180) => {
  const cutoff = Date.now() - days * 86400000;
  const olds = S.closedShifts.all().filter((r) => !r.compacted && r.closed_at < cutoff);
  // El costo se calcula ANTES de tirar las órdenes: después ya no hay líneas
  // que costear y la ganancia neta de ese turno sería irrecuperable.
  const menu = kvGet("fuwa_menu") || [];
  const mods = kvGet("fuwa_mods") || {};
  const ingById = byId(listIngredients());
  for (const r of olds) {
    const all = S.ordersByShift.all(r.id).map(rowToOrder);
    const valid = all.filter((o) => !o.voided);
    let sales = 0, tips = 0, cash = 0, card = 0, items = 0, cogs = 0;
    valid.forEach((o) => {
      cogs += orderCost(o, menu, mods, ingById).cost;
      sales += o.payment.subtotal;
      tips += o.payment.tip || 0;
      const parts = o.payment.split ? o.payment.parts : [{ method: o.payment.method, total: o.payment.total }];
      parts.forEach((p) => (p.method === "efectivo" ? (cash += p.total) : (card += p.total)));
      (o.lines || []).forEach((l) => { if (!l.voided) items += l.qty; });
    });
    const total = valid.reduce((acc, o) => acc + o.payment.total, 0);
    const expRows = S.expensesByShift.all(r.id);
    const expensesTotal = expRows.filter((e) => (e.kind || "salida") !== "entrada").reduce((acc, e) => acc + e.amount, 0);
    const cashInTotal = expRows.filter((e) => (e.kind || "salida") === "entrada").reduce((acc, e) => acc + e.amount, 0);
    S.shiftCompact.run(
      JSON.stringify({
        total, sales, count: valid.length, tips, cash, card, items, expensesTotal, cashInTotal,
        cogs: Math.round(cogs * 100) / 100,
        voided: all.length - valid.length,
      }),
      r.id
    );
    S.shiftDeleteData.run(r.id);
    S.shiftDeleteExpenses.run(r.id);
  }
  if (olds.length) S.bumpRev.run();
  return olds.length;
});

// ------------------------------------------------------------------ users
export function listUsers() {
  return S.userAll.all();
}
export const upsertUser = db.transaction((u) => {
  const existing = S.userGet.get(u.id);
  if (existing) {
    S.userUpdate.run({ id: u.id, name: u.name, role: u.role, hue: u.hue ?? existing.hue });
  } else {
    const cred = u.pin ? hashPin(u.pin) : { hash: null, salt: null };
    S.userInsert.run({ id: u.id, name: u.name, role: u.role || "cajero", hue: u.hue ?? 200, pin_scrypt: cred.hash, pin_salt: cred.salt });
  }
  if (existing && u.pin) {
    const cred = hashPin(u.pin);
    S.userSetPin.run({ id: u.id, hash: cred.hash, salt: cred.salt });
  }
  S.bumpRev.run();
  return publicUser(S.userGet.get(u.id));
});
export const deleteUserTx = db.transaction((id) => {
  S.userDelete.run(id);
  S.bumpRev.run();
  return { ok: true };
});
export const setUserPinScrypt = (id, pin) => {
  const cred = hashPin(pin);
  S.userSetPin.run({ id, hash: cred.hash, salt: cred.salt });
};

// --------------------------------------------------------------- sesiones
const SESSION_TTL = 12 * 3600 * 1000; // 12 h de inactividad
export function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  S.sessionInsert.run(token, userId, now, now);
  return token;
}
export function getSession(token) {
  if (!token) return null;
  S.sessionPrune.run(Date.now() - SESSION_TTL);
  const row = S.sessionGet.get(token);
  if (!row) return null;
  S.sessionTouch.run(Date.now(), token);
  return { token: row.token, user: { id: row.user_id, name: row.name, role: row.role, hue: row.hue } };
}
export const destroySession = (token) => S.sessionDelete.run(token);

// ------------------------------------------------- respaldo (export/import)
export function exportBackupData() {
  const st = getFullState();
  return {
    version: 4, // 4 = incluye las cuentas de mesa abiertas
    exportedAt: new Date().toISOString(),
    menu: st.config.fuwa_menu,
    mods: st.config.fuwa_mods,
    cats: st.config.fuwa_cats,
    areas: st.config.fuwa_areas,
    tweaks: st.config.fuwa_tweaks,
    users: listUsers().map(({ id, name, role, hue }) => ({ id, name, role, hue })),
    shift: st.shift,
    orders: st.orders,
    expenses: st.expenses,
    shiftHistory: st.shiftHistory,
    ingredients: st.ingredients,
    /* Las cuentas de mesa sin cobrar van aparte de `orders` (que son solo las
       cobradas). Sin esto, restaurar a media tarde borraba las mesas vivas: el
       respaldo es la red de seguridad principal y no puede perder el servicio
       en curso. */
    openOrders: st.openOrders,
    stockMoves: listStockMoves(5000),
    counter: S.getMeta.get().order_seq,
  };
}

// ------------------------------------------- migración inicial desde JSON
const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

// Importa un objeto con el shape del respaldo/JSON legacy dentro de una
// transacción. Reutilizada por la migración inicial y por POST /api/restore.
export const importLegacyData = db.transaction((data, { wipe = false } = {}) => {
  if (wipe) {
    db.exec("DELETE FROM stock_moves; DELETE FROM ingredients; DELETE FROM orders; DELETE FROM expenses; DELETE FROM shifts;");
  }

  // Inventario: ingredientes con su stock tal cual venía, y el kardex si lo trae.
  for (const ing of data.ingredients || []) {
    if (!ing || !ing.id) continue;
    /* Los respaldos anteriores a la unidad de compra no traen esos campos: se
       rellenan con la unidad base y factor 1, que reproduce exactamente el
       comportamiento que tenían. Aquí NO se re-deriva el costo — se copia tal
       cual del respaldo, que es el dato histórico; con estos fallbacks el
       resultado numérico es idéntico de todos modos. */
    const factor = Number(ing.purchaseFactor) > 0 ? Number(ing.purchaseFactor) : 1;
    db.prepare(`INSERT INTO ingredients
        (id, name, unit, stock, min_stock, cost, archived, purchase_unit, purchase_factor, purchase_price)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, unit=excluded.unit, stock=excluded.stock,
      min_stock=excluded.min_stock, cost=excluded.cost,
      purchase_unit=excluded.purchase_unit, purchase_factor=excluded.purchase_factor,
      purchase_price=excluded.purchase_price`).run(
      ing.id, ing.name || "Ingrediente", ing.unit || "g",
      Number(ing.stock) || 0, Number(ing.minStock) || 0, Number(ing.cost) || 0,
      ing.purchaseUnit || ing.unit || "g", factor,
      ing.purchasePrice != null ? Number(ing.purchasePrice) : Number(ing.cost) || 0
    );
  }
  for (const m of data.stockMoves || []) {
    if (!m || !m.id || !S.ingGet.get(m.ingredientId)) continue;
    if (S.moveGet.get(m.id)) continue;
    insertMove({
      id: m.id, ingredient_id: m.ingredientId, delta: Number(m.delta) || 0,
      reason: m.reason || "ajuste", order_id: m.orderId || null,
      note: m.note || null, ts: m.ts || Date.now(), user_name: m.user || null,
      entered_qty: m.enteredQty != null ? Number(m.enteredQty) : null,
      entered_unit: m.enteredUnit || null,
    });
  }
  // config
  if (data.menu) S.kvSet.run("fuwa_menu", JSON.stringify(data.menu), Date.now());
  if (data.mods) S.kvSet.run("fuwa_mods", JSON.stringify(data.mods), Date.now());
  if (data.cats) S.kvSet.run("fuwa_cats", JSON.stringify(data.cats), Date.now());
  if (data.areas) S.kvSet.run("fuwa_areas", JSON.stringify(data.areas), Date.now());
  if (data.tweaks) S.kvSet.run("fuwa_tweaks", JSON.stringify(data.tweaks), Date.now());
  if (data.lastBackup !== undefined) S.kvSet.run("fuwa_last_backup", JSON.stringify(data.lastBackup), Date.now());

  // usuarios: hashes legacy se conservan y se re-hashean a scrypt al primer login
  for (const u of data.users || []) {
    if (S.userGet.get(u.id)) continue;
    if (u.pin != null) {
      const cred = hashPin(u.pin);
      S.userInsert.run({ id: u.id, name: u.name, role: u.role || "cajero", hue: u.hue ?? 200, pin_scrypt: cred.hash, pin_salt: cred.salt });
    } else {
      S.userInsert.run({ id: u.id, name: u.name, role: u.role || "cajero", hue: u.hue ?? 200, pin_scrypt: null, pin_salt: null });
      if (u.pinHash && u.pinSalt) {
        db.prepare("UPDATE users SET legacy_sha256 = ?, legacy_salt = ? WHERE id = ?").run(u.pinHash, u.pinSalt, u.id);
      }
    }
  }

  const newId = (p) => p + Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
  let maxNumber = 100;
  /* Las cuentas abiertas se restauran con su estado real, no como ventas: si
     entraran como cobradas aparecerían en el arqueo un dinero que nadie pagó. */
  const insertOpenAccounts = (shiftId, cuentas) => {
    for (const o of cuentas || []) {
      const id = o.id || newId("O");
      if (S.orderGet.get(id)) continue;
      insertOrderRow({
        id,
        shift_id: shiftId,
        number: o.number,
        ts: o.ts || 0,
        time_label: o.time || "",
        order_type: o.orderType || "Aquí",
        cashier: o.cashier || "Barista",
        lines: JSON.stringify(o.lines || []),
        payment: JSON.stringify({}),
        table_json: o.table ? JSON.stringify(o.table) : null,
        status: o.status === "enviada" ? "enviada" : "abierta",
        opened_at: o.openedAt || o.ts || 0,
        sent_at: o.sentAt || null,
        send_seq: o.sendSeq || 0,
        opened_by: o.openedBy || null,
        prep_status: o.prepStatus || "pendiente",
      });
      if (o.number > maxNumber) maxNumber = o.number;
    }
  };

  const insertShiftData = (shiftId, orders, expenses) => {
    for (const o of orders || []) {
      const id = o.id || newId("O");
      if (S.orderGet.get(id)) continue;
      insertOrderRow({
        id,
        shift_id: shiftId,
        number: o.number,
        ts: o.ts || 0,
        time_label: o.time || "",
        order_type: o.orderType || "Aquí",
        cashier: o.cashier || "Barista",
        lines: JSON.stringify(o.lines || []),
        payment: JSON.stringify(o.payment || {}),
        table_json: o.table ? JSON.stringify(o.table) : null,
        // Un respaldo solo contiene ventas cerradas; se restauran ya cobradas
        // y entregadas para que no reaparezcan en el tablero de barra.
        status: "cobrada",
        opened_at: o.ts || 0,
        sent_at: o.ts || 0,
        paid_at: o.ts || 0,
        prep_status: "entregado",
      });
      if (o.voided) S.orderVoid.run(o.voidReason || "", o.voidedAt || 0, id);
      if (o.number > maxNumber) maxNumber = o.number;
    }
    for (const e of expenses || []) {
      const id = e.id || newId("G");
      if (S.expenseGet.get(id)) continue;
      S.expenseInsert.run({ id, shift_id: shiftId, ts: e.ts || 0, concept: e.concept, amount: e.amount, method: e.method, registered_by: e.registeredBy || "" });
    }
  };

  // turnos archivados
  for (const s of data.shiftHistory || []) {
    const id = s.id || newId("S");
    if (S.shiftGet.get(id)) continue;
    db.prepare(
      `INSERT INTO shifts (id, status, opened_at, closed_at, closed_label, opening_cash, cash_sales, cash_expenses, expected, counted, diff, compacted, compact_json)
       VALUES (?, 'closed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, s.openedAt, s.closedAt, s.closedAtLabel || "", s.openingCash || 0,
      s.cashSales ?? null, s.cashExpenses ?? null, s.expected ?? null, s.counted ?? null, s.diff ?? null,
      s.compacted ? 1 : 0, s.compacted ? JSON.stringify(s.totals || {}) : null
    );
    if (!s.compacted) insertShiftData(id, s.orders, s.expenses);
  }

  // turno actual (abierto) + sus órdenes/gastos
  const sh = data.shift;
  if (sh && sh.open) {
    const id = newId("S");
    S.shiftInsert.run({ id, opened_at: sh.openedAt || Date.now(), opening_cash: sh.openingCash || 0 });
    insertShiftData(id, data.orders, data.expenses);
    insertOpenAccounts(id, data.openOrders);
  } else if ((data.orders || []).length) {
    // órdenes sueltas sin turno abierto: turno "recuperado" cerrado sin arqueo
    const id = newId("S");
    db.prepare("INSERT INTO shifts (id, status, opened_at, closed_at, closed_label, opening_cash) VALUES (?, 'closed', ?, ?, ?, 0)").run(
      id, data.orders[0]?.ts || Date.now(), Date.now(), "recuperado"
    );
    insertShiftData(id, data.orders, data.expenses);
  }

  const seq = Math.max(Number(data.counter) || 101, maxNumber + 1);
  const meta = S.getMeta.get();
  if (meta) {
    db.prepare("UPDATE meta SET order_seq = ? , rev = rev + 1 WHERE id = 1").run(Math.max(seq, meta.order_seq));
  } else {
    db.prepare("INSERT INTO meta (id, rev, order_seq) VALUES (1, 1, ?)").run(seq);
  }
});

/* Siembra el inventario y rellena las recetas que falten.

   Corre en CADA arranque porque una instalación anterior a esta función ya
   tiene meta (no pasa por la migración inicial) pero no tiene ingredientes, y
   su menú guardado en kv viene sin `recipe`: sin este relleno las ventas no
   descontarían nada. Solo toca lo que falta, nunca pisa lo que el usuario
   haya editado. */
export const seedInventoryDefaults = db.transaction(() => {
  let seeded = 0;
  if (!S.ingAll.all().length) {
    const ts = Date.now();
    for (const ing of INGREDIENTS) {
      // El costo se deriva de la compra igual que en el formulario, para que
      // la semilla no sea un camino paralelo que pueda desincronizarse.
      const factor = Number(ing.purchaseFactor) > 0 ? Number(ing.purchaseFactor) : 1;
      const price = ing.purchasePrice != null ? Number(ing.purchasePrice) : Number(ing.cost) || 0;
      S.ingUpsert.run({
        id: ing.id, name: ing.name, unit: ing.unit, stock: 0,
        min_stock: ing.minStock, cost: costPerBase(price, factor),
        purchase_unit: ing.purchaseUnit || ing.unit,
        purchase_factor: factor,
        purchase_price: price,
      });
      if (ing.stock) {
        // La existencia inicial entra como movimiento, así el kardex cuadra
        // con el stock desde el primer día.
        insertMove({
          id: `Mi:${ing.id}`, ingredient_id: ing.id, delta: ing.stock, reason: "ajuste",
          order_id: null, note: "Existencia inicial", ts, user_name: "Sistema",
        });
        S.ingSetStock.run(ing.stock, ing.id);
      }
      seeded++;
    }
  }

  /* Menú, categorías y modificadores en una instalación nueva.

     El cliente cae a los defaults de src/data.js y la app SE VE bien, pero
     nunca los sube al servidor hasta que alguien edita algo. El problema es
     que el descuento de inventario lo calcula el servidor con SU copia del
     menú: sin ella, cobrar no descontaría ningún ingrediente. */
  if (!kvGet("fuwa_menu")) S.kvSet.run("fuwa_menu", JSON.stringify(PRODUCTS), Date.now());
  if (!kvGet("fuwa_cats")) S.kvSet.run("fuwa_cats", JSON.stringify(CATEGORIES), Date.now());
  if (!kvGet("fuwa_mods")) S.kvSet.run("fuwa_mods", JSON.stringify(MOD_GROUPS), Date.now());

  /* Destino de preparación en las categorías que ya existían. Se toma el de
     data.js cuando el id coincide y "barra" para las que creó el cliente: en un
     café la mayoría son bebidas, y equivocarse hacia barra se ve en pantalla
     mientras que equivocarse hacia cocina imprime en un cuarto vacío.
     Solo rellena lo que falta; nunca pisa lo que el gerente haya configurado. */
  const cats = kvGet("fuwa_cats");
  if (Array.isArray(cats)) {
    const defCats = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.station]));
    let touched = false;
    const next = cats.map((c) => {
      if (c.station) return c;
      touched = true;
      return { ...c, station: defCats[c.id] || "barra" };
    });
    if (touched) S.kvSet.run("fuwa_cats", JSON.stringify(next), Date.now());
  }

  // Recetas del menú: solo para productos que aún no tienen ninguna.
  const menu = kvGet("fuwa_menu");
  if (Array.isArray(menu)) {
    const defaults = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
    let touched = false;
    const next = menu.map((p) => {
      const def = defaults[p.id];
      if (!def || (p.recipe && p.recipe.length)) return p;
      touched = true;
      // Los tamaños del default traen el ajuste de líquido; se copian solo si
      // el producto sigue teniendo tamaños con la misma forma.
      const sizes = p.sizes && def.sizes && p.sizes.length === def.sizes.length ? def.sizes : p.sizes;
      return { ...p, recipe: def.recipe, sizes };
    });
    if (touched) S.kvSet.run("fuwa_menu", JSON.stringify(next), Date.now());
  }

  // Opciones (leche/azúcar/extras): rellena recipe y swap si faltan.
  const mods = kvGet("fuwa_mods");
  if (mods && typeof mods === "object") {
    let touched = false;
    const next = { ...mods };
    for (const [gid, defGroup] of Object.entries(MOD_GROUPS)) {
      const group = next[gid];
      if (!group || !Array.isArray(group.options)) continue;
      next[gid] = {
        ...group,
        options: group.options.map((o) => {
          if (o.recipe || o.swap) return o;
          const def = defGroup.options.find((d) => d.name === o.name);
          if (!def || (!def.recipe && !def.swap)) return o;
          touched = true;
          return { ...o, ...(def.recipe ? { recipe: def.recipe } : {}), ...(def.swap ? { swap: def.swap } : {}) };
        }),
      };
    }
    if (touched) S.kvSet.run("fuwa_mods", JSON.stringify(next), Date.now());
  }

  S.bumpRev.run();
  return seeded;
});

export function bootstrapDb() {
  if (S.getMeta.get()) {
    compactOldShifts(180);
    seedInventoryDefaults();
    return { migrated: false };
  }
  // Primera vez: importar los JSON legacy si existen.
  const legacy = {};
  const j = (name) => readJson(path.join(DATA_DIR, name + ".json"));
  legacy.menu = j("fuwa_menu");
  legacy.mods = j("fuwa_mods");
  legacy.cats = j("fuwa_cats");
  legacy.tweaks = j("fuwa_tweaks");
  legacy.lastBackup = j("fuwa_last_backup");
  legacy.users = j("fuwa_users") || [];
  legacy.orders = j("fuwa_orders") || [];
  legacy.expenses = j("fuwa_expenses") || [];
  legacy.shift = j("fuwa_shift");
  legacy.shiftHistory = j("fuwa_shift_history") || [];
  legacy.counter = j("fuwa_counter");

  importLegacyData(legacy);
  seedInventoryDefaults();

  // Archiva los JSON importados (no se borran: quedan como respaldo).
  const archive = path.join(DATA_DIR, "json-importado");
  try {
    fs.mkdirSync(archive, { recursive: true });
    for (const f of fs.readdirSync(DATA_DIR)) {
      if (f.endsWith(".json")) fs.renameSync(path.join(DATA_DIR, f), path.join(archive, f));
    }
  } catch {
    /* archivar es best-effort */
  }
  const st = getFullState();
  return { migrated: true, shifts: st.shiftHistory.length, users: st.users.length };
}
