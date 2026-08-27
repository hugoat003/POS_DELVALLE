/* FUWA POS — cliente de la API del servidor (SQLite + sesiones).
   - Token de sesión en localStorage; todas las llamadas van con Bearer.
   - Estado de conexión compartido (online/offline) con suscriptores.
   - Outbox: escrituras transaccionales hechas sin conexión se encolan y se
     reenvían al reconectar; como el servidor es idempotente por id, reintentar
     nunca duplica órdenes ni gastos. */
import { LS } from "./storage-core.js";

const TOKEN_KEY = "fuwa_token";
const OUTBOX_KEY = "fuwa_outbox";

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

/* Reenvía el outbox en orden. Un error de red detiene el vaciado (se reintenta
   después); una respuesta 4xx/5xx descarta esa entrada (p. ej. caja cerrada
   entretanto) para no bloquear el resto. */
export async function flushOutbox() {
  let list = getOutbox();
  while (list.length) {
    const [head, ...rest] = list;
    try {
      await apiFetch(head.path, { method: head.method, body: head.body });
    } catch (err) {
      if (err.offline) return false; // sigue sin conexión: se reintenta luego
      console.warn("FUWA outbox: entrada descartada", head.path, err.message);
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
