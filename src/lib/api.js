/* Café del Valle POS — cliente de la API del servidor (SQLite + sesiones).
   - Token de sesión en localStorage; todas las llamadas van con Bearer.
   - Estado de conexión compartido (online/offline) con suscriptores.
   - Outbox: escrituras transaccionales hechas sin conexión se encolan y se
     reenvían al reconectar; como el servidor es idempotente por id, reintentar
     nunca duplica órdenes ni gastos. */
import { LS } from "./storage-core.js";

/* Igual que en el servidor: lo guardado en la tablet vivía bajo `fuwa_*`. Sin
   esta migración, al actualizar la app cada tablet perdería su sesión, su caché
   y —lo grave— el OUTBOX con las ventas cobradas sin conexión que todavía no
   habían llegado al servidor. Se copia una sola vez, al cargar. */
(function migrarClavesLocales() {
  try {
    for (const vieja of Object.keys(localStorage)) {
      if (!vieja.startsWith("fuwa_")) continue;
      const nueva = "cdv_" + vieja.slice("fuwa_".length);
      if (localStorage.getItem(nueva) === null) localStorage.setItem(nueva, localStorage.getItem(vieja));
      localStorage.removeItem(vieja);
    }
  } catch {
    /* Sin localStorage (modo privado) no hay nada que migrar. */
  }
})();

const TOKEN_KEY = "cdv_token";
const OUTBOX_KEY = "cdv_outbox";
/* Escrituras que el servidor rechazó. NO es lo mismo que la cola: de aquí no
   sale nada solo, porque cada entrada es una venta o un gasto que ocurrió de
   verdad y que alguien tiene que mirar. Ver flushOutbox. */
const REJECTED_KEY = "cdv_outbox_rechazado";

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
};
export const setToken = (t) => {
  try {
    t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* sin almacenamiento */
  }
};

// ---- estado de conexión (pub/sub) ----
let online = false;
const connListeners = new Set();
export const isOnline = () => online;
export function onConnectionChange(fn) {
  connListeners.add(fn);
  return () => connListeners.delete(fn);
}
export function setOnline(v) {
  if (online === v) return;
  online = v;
  connListeners.forEach((fn) => fn(v));
}

// ---- expiración de sesión (el server devolvió 401) ----
const authListeners = new Set();
export function onAuthExpired(fn) {
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}

export class ApiError extends Error {
  constructor(status, data) {
    super((data && data.error) || "error " + status);
    this.status = status;
    this.data = data;
  }
}
export class OfflineError extends Error {
  constructor() {
    super("sin conexión");
    this.offline = true;
  }
}

async function fetchWithTimeout(url, opts = {}, ms = 4000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/* Llamada autenticada. Lanza:
   - OfflineError si no hay red / el servidor no responde (y marca offline)
   - ApiError con status/data si el servidor respondió un error.
   Un 401 además limpia el token y avisa (la app vuelve al login). */
export async function apiFetch(path, { method = "GET", body, timeout } = {}) {
  let res;
  try {
    res = await fetchWithTimeout(
      path,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(getToken() ? { Authorization: "Bearer " + getToken() } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      },
      timeout
    );
  } catch {
    setOnline(false);
    throw new OfflineError();
  }
  setOnline(true);
  const data = await res.json().catch(() => null);
  if (res.status === 401) {
    setToken(null);
    authListeners.forEach((fn) => fn());
    throw new ApiError(401, data);
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

// ---- login / logout (sin token previo) ----
export async function apiLogin(userId, pin) {
  const data = await apiFetch("/api/login", { method: "POST", body: { userId, pin } });
  setToken(data.token);
  return data.user;
}
export async function apiLogout() {
  try {
    await apiFetch("/api/logout", { method: "POST" });
  } catch {
    /* da igual: el token local se borra siempre */
  }
  setToken(null);
}

// ---- outbox: escrituras encoladas sin conexión ----
const getOutbox = () => LS.get(OUTBOX_KEY, []);
const setOutbox = (list) => LS.set(OUTBOX_KEY, list);

export function enqueue(method, path, body) {
  setOutbox([...getOutbox(), { method, path, body, ts: Date.now() }]);
}
export const outboxSize = () => getOutbox().length;
export const outboxEntries = () => getOutbox();

// Órdenes/gastos pendientes en el outbox (para pintarlos aunque aún no estén
// en el servidor). Devuelve los bodies de los POST a la ruta dada.
export function outboxBodies(path) {
  return getOutbox()
    .filter((e) => e.method === "POST" && e.path === path)
    .map((e) => e.body);
}

// ---- rechazadas: lo que el servidor no aceptó y NO se puede tirar ----
export const rejectedEntries = () => LS.get(REJECTED_KEY, []);
const setRejected = (list) => LS.set(REJECTED_KEY, list);
export const rejectedSize = () => rejectedEntries().length;
export const clearRejected = () => setRejected([]);

/* Devuelve las rechazadas a la cola para volver a intentarlas. Se usa cuando la
   causa ya se corrigió: se abrió la caja, se eligió mesa, volvió la sesión. */
export async function retryRejected() {
  const list = rejectedEntries();
  if (!list.length) return true;
  setRejected([]);
  for (const e of list) enqueue(e.method, e.path, e.body);
  return flushOutbox();
}

/* Reenvía el outbox en orden.

   Aquí viven las ventas que se cobraron SIN CONEXIÓN: el dinero ya entró al
   cajón y esta cola es el único sitio donde existe el registro. Por eso ninguna
   entrada se tira en silencio.

   Tres desenlaces, y el que faltaba era el tercero:

     sin red      → se corta el vaciado y se reintenta luego, con la cola intacta.
     401          → la sesión caducó (12 h de inactividad). NO es un rechazo del
                    contenido: la venta sigue siendo válida y solo hace falta
                    volver a entrar. Antes esto vaciaba la cola entera, una
                    entrada tras otra, y una tablet que pasaba la noche sin red
                    perdía el turno completo al reconectar por la mañana.
     otro 4xx/5xx → el servidor rechazó ESTA entrada (la caja se cerró
                    entretanto, por ejemplo). Se aparta a `rechazadas` con su
                    motivo y se sigue con el resto, pero queda a la vista para
                    que alguien decida: reintentarla o darla por perdida a
                    sabiendas. Antes se escribía un console.warn que nadie lee
                    en una tablet, y la venta desaparecía sin dejar rastro
                    mientras el efectivo seguía en la caja. */
export async function flushOutbox() {
  let list = getOutbox();
  while (list.length) {
    const [head, ...rest] = list;
    try {
      await apiFetch(head.path, { method: head.method, body: head.body });
    } catch (err) {
      if (err.offline) return false; // sigue sin conexión: se reintenta luego
      if (err.status === 401) return false; // sesión vencida: la cola se conserva
      setRejected([
        ...rejectedEntries(),
        { ...head, motivo: err.message || `rechazo ${err.status}`, status: err.status || 0, rechazadoEn: Date.now() },
      ]);
      console.warn("Café del Valle outbox: entrada apartada para revisión", head.path, err.message);
    }
    list = rest;
    setOutbox(list);
  }
  return true;
}

// ---- reintento de conexión en segundo plano ----
let retryStarted = false;
const reconnectListeners = new Set();
export function onReconnect(fn) {
  reconnectListeners.add(fn);
  return () => reconnectListeners.delete(fn);
}
export function startRetryLoop() {
  if (retryStarted) return;
  retryStarted = true;
  setInterval(async () => {
    if (online) return;
    try {
      const res = await fetchWithTimeout("/api/health", {}, 1500);
      if (!res.ok) return;
      setOnline(true);
      await flushOutbox();
      reconnectListeners.forEach((fn) => fn());
    } catch {
      /* sigue caído */
    }
  }, 15000);
}
