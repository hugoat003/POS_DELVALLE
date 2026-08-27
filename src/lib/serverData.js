/* FUWA POS — estado transaccional del servidor (turno, órdenes, gastos,
   usuarios, historial) y sus acciones.

   Multi-tablet: cada escritura del servidor incrementa una revisión global;
   este hook sondea GET /api/sync?since=rev cada 4s (barato: {rev} si no hay
   cambios) y aplica el estado nuevo cuando otra tablet cobró/gastó/cerró.

   Offline: las órdenes y gastos se encolan en el outbox (idempotentes por id,
   con número provisional) y se pintan como pendientes; abrir/cerrar/reabrir
   caja exigen conexión — son operaciones de arqueo entre tablets y permitirlas
   offline invita a corromper el corte. */
import { useCallback, useEffect, useRef, useState } from "react";
import { LS } from "./storage-core.js";
import { apiFetch, enqueue, outboxEntries, isOnline, getToken, onReconnect, setOnline } from "./api.js";
import { applyServerConfig } from "./storage.js";

const CACHE_KEY = "fuwa_server_cache";
const SHIFT_CLOSED = { open: false, openingCash: 0, openedAt: null, closedAt: null };
/* `orders` son SOLO las cobradas (es de donde salen arqueo y reportes).
   `openOrders` son las cuentas de mesa sin cobrar y `kds` el tablero de barra,
   que el servidor manda ya filtrado a items de bebida. Van separados a
   propósito: así ningún cálculo de dinero puede tropezarse con una venta que
   todavía no ocurrió. */
const EMPTY = { rev: 0, users: [], shift: SHIFT_CLOSED, orders: [], openOrders: [], kds: [], expenses: [], shiftHistory: [], ingredients: [] };
const POLL_MS = 4000;

const strip = (st) => ({
  rev: st.rev, users: st.users, shift: st.shift, orders: st.orders,
  openOrders: st.openOrders || [], kds: st.kds || [],
  expenses: st.expenses, shiftHistory: st.shiftHistory, ingredients: st.ingredients || [],
});

let initialState = null;

/* Carga inicial (main.jsx, antes de montar React). Devuelve el estado completo
   del servidor (con config, para bootstrapStorage) o null si offline/sin
   sesión; en ese caso el hook arranca con el caché local. */
export async function bootstrapServerState() {
  if (!getToken()) {
    initialState = LS.get(CACHE_KEY, null);
    return null;
  }
  try {
    const st = await apiFetch("/api/state");
    initialState = strip(st);
    LS.set(CACHE_KEY, initialState);
    setOnline(true);
    return st;
  } catch {
    initialState = LS.get(CACHE_KEY, null);
    return null;
  }
}

const nowLabels = () => {
  const now = new Date();
  return { ts: now.getTime(), time: now.toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" }) };
};
const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function useServerData(currentUser) {
  const [state, setState] = useState(() => initialState || EMPTY);
  const [tick, setTick] = useState(0); // fuerza re-render cuando cambia el outbox
  const stateRef = useRef(state);
  stateRef.current = state;

  const applyState = useCallback((st) => {
    // El estado completo trae también la config (menú, áreas, categorías): se
    // propaga a usePersistentState para que lo que edite el gerente en otra
    // tablet aparezca aquí sin recargar la página.
    if (st.config) applyServerConfig(st.config);
    const s = strip(st);
    setState(s);
    LS.set(CACHE_KEY, s);
  }, []);

  const bumpOutbox = () => setTick((t) => t + 1);

  // ---- vista combinada: estado del servidor + pendientes del outbox ----
  const pendingOrders = outboxEntries()
    .filter((e) => e.method === "POST" && e.path === "/api/orders")
    .map((e) => ({ ...e.body, pending: true }))
    .filter((o) => !state.orders.some((x) => x.id === o.id));
  const pendingExpenses = outboxEntries()
    .filter((e) => e.method === "POST" && e.path === "/api/expenses")
    .map((e) => ({ ...e.body, pending: true }))
    .filter((g) => !state.expenses.some((x) => x.id === g.id));
  const deletedExpenseIds = outboxEntries()
    .filter((e) => e.method === "DELETE" && e.path.startsWith("/api/expenses/"))
    .map((e) => decodeURIComponent(e.path.split("/").pop()));

  const orders = [...state.orders, ...pendingOrders];
  const expenses = [...state.expenses, ...pendingExpenses].filter((g) => !deletedExpenseIds.includes(g.id));

  // ---- refresco (sync multi-tablet) ----
  const refresh = useCallback(async () => {
    if (!getToken()) return;
    try {
      const res = await apiFetch(`/api/sync?since=${stateRef.current.rev}`, { timeout: 3000 });
      if (res.config !== undefined) applyState(res); // hubo cambios: estado completo
      else if (res.rev !== stateRef.current.rev) setState((s) => ({ ...s, rev: res.rev }));
    } catch {
      /* offline o 401: lo maneja api.js */
    }
  }, [applyState]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden || !isOnline()) return;
      refresh();
    }, POLL_MS);
    const onVisible = () => !document.hidden && refresh();
    document.addEventListener("visibilitychange", onVisible);
    const offReconnect = onReconnect(() => {
      bumpOutbox(); // el outbox ya se vació: quita los "pendiente"
      refresh();
    });
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      offReconnect();
    };
  }, [refresh]);

  // ---------------------------------------------------------- acciones
  /* Cobro. Devuelve la orden al instante (número provisional si el servidor
     tarda o no hay conexión) y llama onFinal(order) cuando el servidor asigna
     el número definitivo. */
  const createOrder = useCallback(
    ({ lines, payment, orderType, table }, onFinal) => {
      const { ts, time } = nowLabels();
      const provisional = Math.max(101, ...orders.map((o) => o.number + 1));
      const order = {
        id: newId("O"),
        number: provisional,
        time,
        orderType,
        table: table || null,
        lines,
        payment,
        ts,
        cashier: currentUser ? currentUser.name : "Barista",
      };
      apiFetch("/api/orders", { method: "POST", body: order })
        .then((res) => {
          setState((s) => {
            const next = { ...s, rev: res.rev, orders: [...s.orders.filter((o) => o.id !== order.id), res.order] };
            LS.set(CACHE_KEY, next);
            return next;
          });
          if (onFinal) onFinal(res.order);
        })
        .catch((err) => {
          if (err.offline) {
            enqueue("POST", "/api/orders", order);
            bumpOutbox();
          } else if (err.status === 409 || err.status === 400) {
            /* Se muestra el motivo real del servidor. Antes se asumía siempre
               "caja cerrada", así que un rechazo por datos inválidos mentía
               sobre la causa y el cajero iba a revisar el turno sin necesidad. */
            window.alert((err.message || "El servidor rechazó la orden") + "\nLa orden no se cobró.");
            refresh();
          }
        });
      return { ...order, pending: true };
    },
    [orders, currentUser, refresh]
  );

  /* ------------------------------------------------- cuentas de mesa

     A diferencia del cobro de mostrador, estas acciones NO van al outbox: una
     cuenta abierta necesita que el servidor le asigne el número, decida el
     ruteo e imprima. Encolarlas a ciegas dejaría al mesero creyendo que la
     comanda salió mientras la cocina no recibió nada, que es peor que un error
     honesto. Además, si la tablet no ve el servidor tampoco ve la impresora de
     cocina: no hay nada que la cola pudiera salvar.

     Todas devuelven la orden del servidor y refrescan el estado; el `kds` lo
     arma el servidor, así que hay que volver a pedirlo. */
  const aplicarOrden = useCallback((res) => {
    setState((s) => {
      const next = {
        ...s,
        rev: res.rev,
        openOrders: [...(s.openOrders || []).filter((o) => o.id !== res.order.id), ...(res.order.status === "cobrada" ? [] : [res.order])]
          .sort((a, b) => a.number - b.number),
      };
      LS.set(CACHE_KEY, next);
      return next;
    });
    refresh(); // el tablero de barra lo recalcula el servidor
    return res.order;
  }, [refresh]);

  const openAccount = useCallback(
    async ({ lines, orderType, table }) => {
      const { ts, time } = nowLabels();
      const res = await apiFetch("/api/orders/open", { method: "POST", body: {
        id: newId("O"), ts, time, orderType, table: table || null, lines,
      } });
      return aplicarOrden(res);
    },
    [aplicarOrden]
  );

  const updateAccountLines = useCallback(
    async (orderId, { lines, table, orderType }) => {
      const res = await apiFetch(`/api/orders/${encodeURIComponent(orderId)}/lines`, {
        method: "PUT", body: { lines, table, orderType },
      });
      return aplicarOrden(res);
    },
    [aplicarOrden]
  );

  // Devuelve { ruteo: {cocina, barra}, sinCambios } para poder confirmarle al
  // mesero a dónde fue cada cosa.
  const sendAccount = useCallback(
    async (orderId) => {
      const res = await apiFetch(`/api/orders/${encodeURIComponent(orderId)}/enviar`, { method: "POST" });
      aplicarOrden(res);
      return res;
    },
    [aplicarOrden]
  );

  const cancelAccountLine = useCallback(
    async (orderId, uid, reason) => {
      const res = await apiFetch(`/api/orders/${encodeURIComponent(orderId)}/lines/${encodeURIComponent(uid)}/anular`, {
        method: "POST", body: { reason },
      });
      aplicarOrden(res);
      return res;
    },
    [aplicarOrden]
  );

  const payAccount = useCallback(
    async (orderId, payment) => {
      const res = await apiFetch(`/api/orders/${encodeURIComponent(orderId)}/cobrar`, { method: "POST", body: { payment } });
      setState((s) => {
        const next = {
          ...s,
          rev: res.rev,
          openOrders: (s.openOrders || []).filter((o) => o.id !== orderId),
          orders: [...s.orders.filter((o) => o.id !== orderId), res.order],
        };
        LS.set(CACHE_KEY, next);
        return next;
      });
      refresh();
      return res.order;
    },
    [refresh]
  );

  /* Descarta una cuenta abierta (se anuló todo lo que tenía y no hay nada que
     cobrar). Va por id y no por número como `voidOrder`, porque ese busca en
     `orders` —solo las cobradas— y una cuenta abierta nunca está ahí. */
  // Estado del respaldo automático (solo gerente). Se pide al entrar a
  // Herramientas, no en el sondeo: no cambia cada 4 segundos.
  const backupEstado = useCallback(async () => {
    try { return await apiFetch("/api/backup/estado"); } catch { return null; }
  }, []);

  const backupAhora = useCallback(async () => {
    return apiFetch("/api/backup/ahora", { method: "POST" });
  }, []);

  const discardAccount = useCallback(
    async (orderId, reason) => {
      await apiFetch(`/api/orders/${encodeURIComponent(orderId)}/void`, { method: "POST", body: { reason } });
      setState((s) => {
        const next = { ...s, openOrders: (s.openOrders || []).filter((o) => o.id !== orderId) };
        LS.set(CACHE_KEY, next);
        return next;
      });
      refresh();
    },
    [refresh]
  );

  const voidOrder = useCallback(
    (number, reason) => {
      const target = orders.find((o) => o.number === number);
      if (!target) return;
      // Optimista: se marca ya; el servidor confirma en el siguiente sync.
      setState((s) => ({ ...s, orders: s.orders.map((o) => (o.number === number ? { ...o, voided: true, voidReason: reason || "", voidedAt: Date.now() } : o)) }));
      apiFetch(`/api/orders/${encodeURIComponent(target.id)}/void`, { method: "POST", body: { reason } }).catch((err) => {
        if (err.offline) {
          enqueue("POST", `/api/orders/${encodeURIComponent(target.id)}/void`, { reason });
          bumpOutbox();
        }
      });
    },
    [orders]
  );

  /* KDS de barra: mueve una comanda entre pendiente / listo / entregado.
     Optimista, porque en la barra el toque tiene que responder al instante;
     el servidor valida la transición y el siguiente sync manda la verdad. */
  const setOrderPrep = useCallback(
    (orderId, status) => {
      // Se actualizan los dos: `kds` es lo que pinta el tablero, y `orders`
      // guarda el mismo estado para las que ya están cobradas.
      const marcar = (o) => (o.id === orderId ? { ...o, prepStatus: status } : o);
      setState((s) => ({
        ...s,
        orders: s.orders.map(marcar),
        // Al entregarla sale del tablero, igual que hará el próximo sync.
        kds: status === "entregado" ? s.kds.filter((o) => o.id !== orderId) : s.kds.map(marcar),
      }));
      apiFetch(`/api/orders/${encodeURIComponent(orderId)}/prep`, { method: "POST", body: { status } }).catch((err) => {
        if (err.offline) {
          enqueue("POST", `/api/orders/${encodeURIComponent(orderId)}/prep`, { status });
          bumpOutbox();
        } else {
          refresh(); // el servidor rechazó la transición: volver a la verdad
        }
      });
    },
    [refresh]
  );

  const addExpense = useCallback(
    (concept, amount, method, kind = "salida") => {
      const expense = { id: newId("G"), ts: Date.now(), concept, amount, method, kind, registeredBy: currentUser ? currentUser.name : "Barista" };
      apiFetch("/api/expenses", { method: "POST", body: expense })
        .then((res) => {
          setState((s) => {
            const next = { ...s, rev: res.rev, expenses: [...s.expenses.filter((g) => g.id !== expense.id), res.expense] };
            LS.set(CACHE_KEY, next);
            return next;
          });
        })
        .catch((err) => {
          if (err.offline) {
            enqueue("POST", "/api/expenses", expense);
            bumpOutbox();
          } else if (err.status === 409) {
            window.alert("La caja está cerrada: no se registró el gasto.");
            refresh();
          }
        });
    },
    [currentUser, refresh]
  );

  const removeExpense = useCallback((id) => {
    setState((s) => ({ ...s, expenses: s.expenses.filter((g) => g.id !== id) }));
    apiFetch(`/api/expenses/${encodeURIComponent(id)}`, { method: "DELETE" }).catch((err) => {
      if (err.offline) {
        enqueue("DELETE", `/api/expenses/${encodeURIComponent(id)}`, null);
        bumpOutbox();
      }
    });
  }, []);

  // Operaciones de caja: SOLO con conexión (arqueo compartido entre tablets).
  const requireOnline = () => {
    if (isOnline() && getToken()) return true;
    window.alert("Esta operación necesita conexión con el servidor (abrir/cerrar caja se comparte entre tablets).");
    return false;
  };

  const openShift = useCallback(async (openingCash) => {
    if (!requireOnline()) return false;
    try {
      const res = await apiFetch("/api/shifts/open", { method: "POST", body: { openingCash } });
      applyState(res.state);
      return true;
    } catch (err) {
      window.alert(err.status === 409 ? "Otra tablet ya abrió el turno; se actualizará la pantalla." : "No se pudo abrir la caja: " + err.message);
      refresh();
      return false;
    }
  }, [applyState, refresh]);

  const closeShift = useCallback(async (countedCash, opts = {}) => {
    if (!requireOnline()) return false;
    try {
      const res = await apiFetch("/api/shifts/close", {
        method: "POST",
        body: { countedCash, closeNote: opts.closeNote || "", cashLeft: opts.cashLeft ?? null },
      });
      applyState(res.state);
      /* Aviso, no bloqueo: el dinero de esas mesas entrará en el turno nuevo, lo
         cual es correcto, pero el cajero acaba de contar efectivo y se va — tiene
         que saber que quedaron cuentas vivas antes de entregar la caja. */
      if (res.cuentasAbiertas > 0) {
        window.alert(
          `Caja cerrada.\n\nOJO: quedaron ${res.cuentasAbiertas} ${res.cuentasAbiertas === 1 ? "cuenta de mesa sin cobrar" : "cuentas de mesa sin cobrar"}. ` +
            "Siguen abiertas y su cobro entrará en el turno siguiente."
        );
      }
      return true;
    } catch (err) {
      window.alert("No se pudo cerrar la caja: " + err.message);
      refresh();
      return false;
    }
  }, [applyState, refresh]);

  const reopenShift = useCallback(async (shiftId) => {
    if (!requireOnline()) return false;
    try {
      const res = await apiFetch(`/api/shifts/${encodeURIComponent(shiftId)}/reopen`, { method: "POST" });
      applyState(res.state);
      return true;
    } catch (err) {
      window.alert("No se pudo reabrir el turno: " + err.message);
      refresh();
      return false;
    }
  }, [applyState, refresh]);

  const clearOrders = useCallback(async () => {
    if (!requireOnline()) return false;
    try {
      await apiFetch("/api/orders/clear", { method: "POST" });
      await refresh();
      return true;
    } catch (err) {
      window.alert("No se pudieron borrar las órdenes: " + err.message);
      return false;
    }
  }, [refresh]);

  // ---- empleados (el PIN viaja plano al server, que lo hashea con scrypt;
  //      en producción SIEMPRE detrás de HTTPS) ----
  const saveUser = useCallback(async (u) => {
    if (!requireOnline()) return false;
    try {
      const res = await apiFetch("/api/users", { method: "POST", body: u });
      setState((s) => {
        const i = s.users.findIndex((x) => x.id === res.user.id);
        const users = i === -1 ? [...s.users, res.user] : s.users.map((x) => (x.id === res.user.id ? res.user : x));
        const next = { ...s, rev: res.rev, users };
        LS.set(CACHE_KEY, next);
        return next;
      });
      return true;
    } catch (err) {
      window.alert("No se pudo guardar el empleado: " + err.message);
      return false;
    }
  }, []);

  const deleteUser = useCallback(async (id) => {
    if (!requireOnline()) return false;
    try {
      const res = await apiFetch(`/api/users/${encodeURIComponent(id)}`, { method: "DELETE" });
      setState((s) => {
        const next = { ...s, rev: res.rev, users: s.users.filter((x) => x.id !== id) };
        LS.set(CACHE_KEY, next);
        return next;
      });
      return true;
    } catch (err) {
      window.alert("No se pudo eliminar: " + err.message);
      return false;
    }
  }, []);

  // ---- inventario ----
  // Todas exigen conexión: el stock es un contador compartido entre tablets y
  // dejar que se edite offline invita a que dos ajustes se pisen al reconectar.
  const saveIngredient = useCallback(async (ing) => {
    if (!requireOnline()) return false;
    try {
      const res = await apiFetch("/api/ingredients", { method: "POST", body: ing });
      setState((s) => {
        const i = s.ingredients.findIndex((x) => x.id === res.ingredient.id);
        const ingredients = i === -1 ? [...s.ingredients, res.ingredient] : s.ingredients.map((x) => (x.id === res.ingredient.id ? res.ingredient : x));
        const next = { ...s, rev: res.rev, ingredients };
        LS.set(CACHE_KEY, next);
        return next;
      });
      return res.ingredient; // el id lo asigna el servidor al crear
    } catch (err) {
      window.alert("No se pudo guardar el ingrediente: " + err.message);
      return null;
    }
  }, []);

  const deleteIngredient = useCallback(async (id) => {
    if (!requireOnline()) return false;
    try {
      const res = await apiFetch(`/api/ingredients/${encodeURIComponent(id)}`, { method: "DELETE" });
      setState((s) => {
        const next = { ...s, rev: res.rev, ingredients: s.ingredients.filter((x) => x.id !== id) };
        LS.set(CACHE_KEY, next);
        return next;
      });
      return true;
    } catch (err) {
      window.alert("No se pudo eliminar: " + err.message);
      return false;
    }
  }, []);

  /* Movimiento de stock: compra, merma o conteo físico.
     mode "delta" suma/resta, mode "set" deja el stock en el valor indicado. */
  const adjustStock = useCallback(async (move) => {
    if (!requireOnline()) return false;
    try {
      const res = await apiFetch("/api/stock/moves", { method: "POST", body: move });
      setState((s) => {
        const next = { ...s, rev: res.rev, ingredients: s.ingredients.map((x) => (x.id === res.ingredient.id ? res.ingredient : x)) };
        LS.set(CACHE_KEY, next);
        return next;
      });
      return true;
    } catch (err) {
      window.alert("No se pudo registrar el movimiento: " + err.message);
      return false;
    }
  }, []);

  // Kardex bajo demanda: no viaja en el sync de 4s para no engordarlo.
  const fetchStockMoves = useCallback(async (limit = 300) => {
    try {
      return await apiFetch(`/api/stock/moves?limit=${limit}`);
    } catch {
      return [];
    }
  }, []);

  // ---- respaldos ----
  const exportBackup = useCallback(async () => {
    if (!requireOnline()) return false;
    try {
      const data = await apiFetch("/api/backup");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fuwa-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return true;
    } catch (err) {
      window.alert("No se pudo descargar el respaldo: " + err.message);
      return false;
    }
  }, []);

  const restoreBackup = useCallback(async (data) => {
    if (!requireOnline()) return false;
    try {
      await apiFetch("/api/restore", { method: "POST", body: data, timeout: 15000 });
      window.alert("Respaldo importado correctamente. La app se recargará.");
      window.location.reload(); // recarga: el menú/config también cambió
      return true;
    } catch (err) {
      window.alert("No se pudo importar el respaldo: " + err.message);
      return false;
    }
  }, []);

  return {
    users: state.users,
    shift: state.shift,
    orders,
    openOrders: state.openOrders || [],
    kds: state.kds || [],
    expenses,
    shiftHistory: state.shiftHistory,
    ingredients: state.ingredients || [],
    rev: state.rev,
    pendingCount: pendingOrders.length + pendingExpenses.length,
    refresh,
    createOrder,
    openAccount,
    updateAccountLines,
    sendAccount,
    cancelAccountLine,
    payAccount,
    discardAccount,
    backupEstado,
    backupAhora,
    voidOrder,
    setOrderPrep,
    addExpense,
    removeExpense,
    openShift,
    closeShift,
    reopenShift,
    clearOrders,
    saveUser,
    deleteUser,
    saveIngredient,
    deleteIngredient,
    adjustStock,
    fetchStockMoves,
    exportBackup,
    restoreBackup,
  };
}
