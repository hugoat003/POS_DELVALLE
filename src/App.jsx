/* FUWA POS — app principal: login, navegación por rol, estado y tweaks.
   El estado transaccional (turno, órdenes, gastos, empleados) vive en el
   servidor SQLite vía useServerData (con sync multi-tablet y outbox offline);
   la config (menú, opciones, categorías, apariencia) usa usePersistentState
   contra la tabla kv del servidor con caché en localStorage. */
import { useEffect, useState } from "react";
import { Icon } from "./components/Icon.jsx";
import { Logo, Mascot } from "./components/Mascot.jsx";
import { Login } from "./auth/Login.jsx";
import { ROLES } from "./auth/users.js";
import { Avatar } from "./auth/Avatar.jsx";
import { OrderScreen } from "./screens/OrderScreen.jsx";
import { PayScreen } from "./screens/PayScreen.jsx";
import { Receipt, PrintDocs, printDoc } from "./screens/Receipt.jsx";
import { MenuEditor } from "./screens/MenuEditor.jsx";
import { HistoryScreen } from "./screens/HistoryScreen.jsx";
import { SummaryScreen } from "./screens/SummaryScreen.jsx";
import { ReportsScreen } from "./screens/ReportsScreen.jsx";
import { StaffEditor } from "./screens/StaffEditor.jsx";
import { TablesEditor } from "./screens/TablesEditor.jsx";
import { InventoryScreen } from "./screens/InventoryScreen.jsx";
import { KdsScreen } from "./screens/KdsScreen.jsx";
import { AccountsScreen } from "./screens/AccountsScreen.jsx";
import { OpenRegister } from "./screens/OpenRegister.jsx";
import { ToolsScreen } from "./screens/ToolsScreen.jsx";
import { ExpensesScreen } from "./screens/ExpensesScreen.jsx";
import { CloseShiftScreen } from "./screens/CloseShiftScreen.jsx";
import { usePersistentState, reloadConfig } from "./lib/storage.js";
import { useServerData } from "./lib/serverData.js";
import { apiLogout, getToken, onAuthExpired, isOnline, onConnectionChange } from "./lib/api.js";
import { availableCashNow } from "./lib/format.js";
import { PRODUCTS, MOD_GROUPS, CATEGORIES, AREAS } from "./data.js";

/* Apariencia e impresión, antes configurables desde el panel de Tweaks.
   El cliente fijó la identidad visual (tema Mochi, tipografía Fredoka y
   redondeo de 28px), así que el tema y la fuente viven ahora en styles.css.
   Aquí quedan las tres opciones que NO eran cosméticas. */

// Ancho de papel: "80"mm / "58"mm térmica / "carta". La cafetería imprime en
// térmica de 80mm; cambiar esta constante es todo lo que hace falta si algún
// día imprimen en otro formato.
const PAPER = "80";
const PAPER_PAGE = { "80": "80mm auto", "58": "58mm auto", carta: "auto" };

// Íconos de producto en la pantalla de orden, y sugerencia de propina al cobrar.
const SHOW_EMOJI = true;
const TIP_ENABLED = true;

// Días sin respaldar tras los que se avisa del riesgo de pérdida de datos.
const BACKUP_STALE_DAYS = 2;
const daysSince = (ts) => (ts ? (Date.now() - ts) / 86400000 : Infinity);

export default function App() {
  const [view, setView] = useState("order");
  const [menu, setMenu] = usePersistentState("fuwa_menu", PRODUCTS);
  const [mods, setMods] = usePersistentState("fuwa_mods", MOD_GROUPS);
  const [cats, setCats] = usePersistentState("fuwa_cats", CATEGORIES);
  const [areas, setAreas] = usePersistentState("fuwa_areas", AREAS);
  const [user, setUser] = usePersistentState("fuwa_user", null);
  const [lastBackup, setLastBackup] = usePersistentState("fuwa_last_backup", null);
  const [cart, setCart] = useState([]);
  const [orderType, setOrderType] = useState("Aquí");
  const [table, setTable] = useState(null); // mesa asignada a la orden en curso {id, label, areaId, areaName}
  const [lastOrder, setLastOrder] = useState(null);
  const [printTarget, setPrintTarget] = useState(null); // orden a reimprimir desde Historial
  const [backupDismissed, setBackupDismissed] = useState(false);
  const [online, setOnlineUi] = useState(isOnline());

  // Estado del servidor: turno, órdenes, gastos, empleados, historial + acciones.
  const data = useServerData(user);
  const { shift, orders, openOrders, kds, expenses, shiftHistory, users, ingredients } = data;

  // Chip de conexión + si el servidor invalida la sesión (401), volver al login.
  useEffect(() => onConnectionChange(setOnlineUi), []);
  useEffect(
    () =>
      onAuthExpired(() => {
        setUser(null);
        setCart([]);
      }),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Si se edita al empleado en sesión (nombre, rol, color), refleja los cambios.
  useEffect(() => {
    if (!user) return;
    const fresh = users.find((u) => u.id === user.id);
    if (fresh && JSON.stringify(fresh) !== JSON.stringify(user)) setUser(fresh);
  }, [users]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tamaño de papel al imprimir. Se inyecta una regla @page porque las
  // variables CSS no son fiables dentro de @page.
  useEffect(() => {
    document.body.setAttribute("data-paper", PAPER);
    let el = document.getElementById("fuwa-print-page");
    if (!el) {
      el = document.createElement("style");
      el.id = "fuwa-print-page";
      document.head.appendChild(el);
    }
    const size = PAPER_PAGE[PAPER] || PAPER_PAGE["80"];
    el.textContent = `@media print { @page { size: ${size}; margin: ${PAPER === "carta" ? "12mm" : "0"}; } }`;
  }, []);

  // Reimpresión de una orden vieja: cuando se fija el objetivo y ya está montado
  // en el DOM (PrintDocs), se dispara la impresión y se limpia al terminar.
  useEffect(() => {
    if (!printTarget) return;
    const id = requestAnimationFrame(() => printDoc("receipt", () => setPrintTarget(null)));
    return () => cancelAnimationFrame(id);
  }, [printTarget]);

  /* Si la vista actual no está permitida para el rol, se rebota a su pantalla
     de inicio. No puede ser "order" fijo: el rol Barra no tiene acceso a Orden
     y quedaría rebotando contra una pantalla que nunca puede ver. */
  useEffect(() => {
    if (!user) return;
    const role = ROLES[user.role] || ROLES.cajero;
    const active = view === "pay" || view === "receipt" ? "order" : view;
    if (!role.nav.includes(active)) setView(role.nav[0]);
  }, [user, view]);

  // ---- carrito ----
  function addLine(line) {
    setCart((c) => [...c, line]);
  }
  function setLineQty(uid, q) {
    setCart((c) => (q <= 0 ? c.filter((l) => l.uid !== uid) : c.map((l) => (l.uid === uid ? { ...l, qty: q } : l))));
  }
  function updateLine(uid, newLine) {
    setCart((c) => c.map((l) => (l.uid === uid ? { ...newLine, uid } : l)));
  }
  function removeLine(uid) {
    setCart((c) => c.filter((l) => l.uid !== uid));
  }
  function clearCart() {
    setCart([]);
  }

  /* ------------------------------------------------- cuentas de mesa

     `cuentaMode` se enciende al entrar desde la pantalla de Cuentas.
     `accountId` solo aparece cuando el servidor ya creó la cuenta, que pasa en
     el primer envío. La cuenta NO se crea al tocar la mesa a propósito: si el
     mesero se arrepiente, no queda una cuenta vacía ensuciando el salón, y si
     nunca envía nada el cobro se va por el camino normal de mostrador. */
  const [cuentaMode, setCuentaMode] = useState(false);
  const [accountId, setAccountId] = useState(null);
  const [enviando, setEnviando] = useState(false);
  // Confirmación breve de "salió la comanda". No es un modal porque no exige
  // decisión: solo confirma que lo que el mesero pidió sí ocurrió.
  const [aviso, setAviso] = useState(null);
  useEffect(() => {
    if (!aviso) return;
    const id = setTimeout(() => setAviso(null), 3200);
    return () => clearTimeout(id);
  }, [aviso]);
  const account = accountId ? (openOrders || []).find((o) => o.id === accountId) || null : null;

  // Si otra tablet cobró o anuló la cuenta, esta se queda sin nada que editar.
  useEffect(() => {
    if (accountId && !account) {
      setAccountId(null);
      setCuentaMode(false);
      setCart([]);
      setTable(null);
      setView("accounts");
    }
  }, [accountId, account]);

  function salirDeCuenta() {
    setCuentaMode(false);
    setAccountId(null);
    setCart([]);
    setTable(null);
    setOrderType("Aquí");
    setView("accounts");
  }

  // Abre una cuenta existente para agregarle cosas o cobrarla.
  function abrirCuenta(order) {
    setCuentaMode(true);
    setAccountId(order.id);
    setCart([]); // lo ya enviado vive en la cuenta, no en el carrito
    setOrderType(order.orderType || "Aquí");
    setTable(order.table || null);
    setView("order");
  }

  // Empieza una cuenta nueva sobre una mesa libre (o sin mesa, para llevar).
  function nuevaCuenta(mesa) {
    setCuentaMode(true);
    setAccountId(null);
    setCart([]);
    setOrderType(mesa ? "Aquí" : "Para llevar");
    setTable(mesa || null);
    setView("order");
  }

  /* Manda a preparar. Si la cuenta aún no existe en el servidor, se crea aquí
     con las líneas del carrito; si ya existe, se le agregan. En los dos casos
     el carrito queda vacío porque lo enviado pasa a ser parte de la cuenta. */
  async function enviarAPreparar() {
    if (!cart.length || enviando) return;
    setEnviando(true);
    try {
      let id = accountId;
      if (!id) {
        const creada = await data.openAccount({ lines: cart, orderType, table: orderType === "Aquí" ? table : null });
        id = creada.id;
        setAccountId(id);
      } else {
        await data.updateAccountLines(id, { lines: [...account.lines, ...cart], table, orderType });
      }
      const res = await data.sendAccount(id);
      setCart([]);
      const r = res.ruteo || { cocina: 0, barra: 0 };
      const partes = [];
      if (r.cocina) partes.push(`${r.cocina} a cocina`);
      if (r.barra) partes.push(`${r.barra} a barra`);
      setAviso(partes.length ? `Enviado: ${partes.join(" y ")}` : "No había nada nuevo que enviar");
    } catch (e) {
      window.alert(
        e && e.offline
          ? "Sin conexión con el servidor. Las cuentas de mesa necesitan conexión porque la comanda se imprime en cocina."
          : `No se pudo enviar: ${(e && e.message) || "error desconocido"}`
      );
    } finally {
      setEnviando(false);
    }
  }

  /* Descarta una cuenta que se quedó sin nada que cobrar (se anuló todo). Sin
     esto la mesa quedaba ocupada para siempre: el botón de cobrar se deshabilita
     en Q0 y no había ninguna otra salida. Anular devuelve al inventario lo que
     siguiera consumido, así que es seguro. */
  async function descartarCuenta() {
    if (!accountId) return salirDeCuenta();
    if (!window.confirm("¿Descartar esta cuenta? No se cobrará nada y la mesa quedará libre.")) return;
    try {
      await data.discardAccount(accountId, "cuenta descartada");
      setAviso("Cuenta descartada · la mesa quedó libre");
      salirDeCuenta();
    } catch (e) {
      window.alert(`No se pudo descartar: ${(e && e.message) || "error desconocido"}`);
    }
  }

  async function anularEnviado(uid, motivo) {
    try {
      const res = await data.cancelAccountLine(accountId, uid, motivo);
      setAviso(res.devolvioStock ? "Producto quitado · el insumo volvió al inventario" : "Producto quitado");
    } catch (e) {
      window.alert(`No se pudo quitar: ${(e && e.message) || "error desconocido"}`);
    }
  }

  // Cobro: el servidor asigna el número definitivo (evita duplicados entre
  // tablets); mientras responde, el recibo muestra un número provisional.
  async function confirmPayment(payment) {
    /* Cuenta de mesa ya creada: se cobra la que existe en el servidor. Si
       quedaron items en el carrito se suben primero — el servidor los manda a
       preparar solo al cobrar, porque nadie cobra algo que no se preparó. */
    if (accountId) {
      try {
        if (cart.length) await data.updateAccountLines(accountId, { lines: [...account.lines, ...cart], table, orderType });
        const order = await data.payAccount(accountId, payment);
        setLastOrder(order);
        setCart([]);
        setTable(null);
        setAccountId(null);
        setCuentaMode(false);
        setView("receipt");
      } catch (e) {
        /* El servidor rechaza el cobro si la cuenta cambió mientras el cajero
           estaba en la pantalla de pago (otra tablet anuló un producto). Se
           explica y se vuelve a la cuenta ya actualizada en vez de dejar un
           error genérico. */
        if (e && e.data && e.data.cambio) {
          window.alert(
            `Esta cuenta cambió mientras cobrabas: otra tablet modificó los productos.\n\n` +
              `Total en pantalla: Q${e.data.recibido}\nTotal real ahora: Q${e.data.esperado}\n\nRevisa la cuenta y vuelve a cobrar.`
          );
          setView("order");
        } else {
          window.alert(`No se pudo cobrar: ${(e && e.message) || "error desconocido"}`);
        }
      }
      return;
    }
    // Mostrador (o cuenta que nunca llegó a enviarse): una sola operación.
    const order = data.createOrder({ lines: cart, payment, orderType, table: orderType === "Aquí" ? table : null }, (final) => {
      setLastOrder((prev) => (prev && prev.id === final.id ? final : prev));
    });
    setLastOrder(order);
    setCart([]);
    setTable(null);
    setCuentaMode(false);
    setView("receipt");
  }
  function newOrder() {
    setCart([]);
    setOrderType("Aquí");
    setTable(null);
    setCuentaMode(false);
    setAccountId(null);
    setView("order");
  }

  // Anula una orden ya cobrada sin borrarla: queda en el historial marcada
  // para auditoría y se excluye de las ventas del resumen y del arqueo.
  function voidOrder(number, reason) {
    data.voidOrder(number, reason);
  }

  // ---- caja (turno) ----
  async function openRegister(openingCash) {
    if (await data.openShift(openingCash)) setView("order");
  }
  async function closeShift(countedCash, opts) {
    if (!window.confirm("¿Cerrar caja? El turno se archivará en Historial junto con el arqueo de efectivo.")) return;
    if (await data.closeShift(countedCash, opts)) {
      setCart([]);
      setView("order");
    }
  }

  // Reabre un turno archivado para corregirlo (solo con la caja cerrada).
  async function reopenShift(shiftId) {
    if (shift.open) {
      window.alert("Cierra el turno actual antes de reabrir uno archivado.");
      return;
    }
    const archive = shiftHistory.find((s) => s.id === shiftId);
    if (!archive) return;
    if (archive.compacted) {
      window.alert("Este turno es muy antiguo y fue compactado (solo conserva totales y arqueo); ya no se puede reabrir.");
      return;
    }
    if (!window.confirm(`¿Reabrir el turno del ${archive.closedAtLabel}? Volverá a quedar como turno actual para corregirlo y deberás cerrarlo de nuevo.`)) return;
    if (await data.reopenShift(shiftId)) setView("order");
  }

  // Reimprime el recibo de una orden ya cobrada (turno actual o archivado).
  function reprintOrder(order) {
    setPrintTarget(order);
  }

  function login(u) {
    setUser(u);
    setView("order");
    setCart([]);
    data.refresh();
    // La config se carga antes de montar React, cuando aún no hay sesión y el
    // servidor devuelve 401; hay que volver a pedirla ya con el token, o esta
    // tablet se queda con el menú y las áreas que tuviera en localStorage.
    reloadConfig();
  }
  function logout() {
    apiLogout();
    setUser(null);
    setCart([]);
    setView("order");
  }

  function resetMenu() {
    if (window.confirm("¿Restaurar el menú, las opciones y las categorías originales de FUWA?")) {
      setMenu(PRODUCTS);
      setMods(MOD_GROUPS);
      setCats(CATEGORIES);
    }
  }
  // Borrado permanente de las órdenes del turno (no se archivan): requiere
  // escribir BORRAR para evitar pérdidas por un clic accidental.
  function clearOrders() {
    /* Se cuentan también las cuentas de mesa abiertas: el borrado se las lleva
       igual, y antes ni se nombraban. Con 3 mesas en servicio y 0 cobros la
       pantalla decía "no hay órdenes" mientras la acción sí las habría
       destruido. */
    const abiertas = (openOrders || []).length;
    if (orders.length === 0 && abiertas === 0) {
      window.alert("No hay órdenes ni cuentas abiertas en el turno actual.");
      return;
    }
    const partes = [];
    if (orders.length) partes.push(`${orders.length} ${orders.length === 1 ? "orden cobrada" : "órdenes cobradas"}`);
    if (abiertas) partes.push(`${abiertas} ${abiertas === 1 ? "CUENTA DE MESA ABIERTA" : "CUENTAS DE MESA ABIERTAS"}`);
    const aviso = abiertas
      ? "\n\n⚠ Hay mesas en servicio: sus cuentas se borrarán y el inventario que consumieron volverá al stock."
      : "";
    const word = window.prompt(`Vas a borrar ${partes.join(" y ")} del turno actual de forma PERMANENTE (no se archivan y desaparecen de los reportes).${aviso}\n\nSi solo quieres empezar un turno nuevo, usa "Cerrar caja".\n\nEscribe BORRAR para confirmar:`);
    if (word == null) return;
    if (word.trim().toUpperCase() !== "BORRAR") {
      window.alert("Confirmación incorrecta: no se borró nada.");
      return;
    }
    data.clearOrders();
  }

  /* Estado del respaldo automático. Se pide al abrir Herramientas y tras
     respaldar a mano; no entra al sondeo de 4s porque cambia una vez al día. */
  const [backupEstado, setBackupEstado] = useState(null);
  const [backupOcupado, setBackupOcupado] = useState(false);
  useEffect(() => {
    if (view !== "tools") return;
    data.backupEstado().then(setBackupEstado);
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  async function respaldarAhora() {
    setBackupOcupado(true);
    try {
      const r = await data.backupAhora();
      setLastBackup(Date.now());
      setBackupEstado(await data.backupEstado());
      setAviso(r.error ? `Respaldo guardado, pero la copia fuera falló` : "Respaldo guardado");
      if (r.error) window.alert(`El respaldo local se guardó, pero la copia fuera del equipo falló:\n\n${r.error}`);
    } catch (e) {
      window.alert(`No se pudo respaldar: ${(e && e.message) || "error desconocido"}`);
    } finally {
      setBackupOcupado(false);
    }
  }

  // ---- respaldo de datos (lo genera el servidor desde SQLite) ----
  async function exportBackup() {
    if (await data.exportBackup()) {
      setLastBackup(Date.now());
      setBackupDismissed(true);
    }
  }
  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch {
        window.alert("El archivo no es un respaldo válido de FUWA.");
        return;
      }
      if (!window.confirm("¿Importar este respaldo? Se reemplazarán las órdenes, turnos y configuración actuales del servidor.")) return;
      data.restoreBackup(parsed);
    };
    reader.readAsText(file);
  }

  const cartCount = cart.reduce((s, l) => s + l.qty, 0);
  const navActive = view === "pay" || view === "receipt" ? "order" : view;
  // Insumos por reponer: se muestra como badge en el menú lateral.
  const lowStockCount = ingredients.filter((i) => i.stock <= i.minStock).length;
  /* Comandas vivas en barra. Viene del arreglo `kds` del servidor y no de
     `orders`, porque `orders` son solo las ya cobradas: una cuenta de mesa
     enviada a preparar pero sin cobrar no aparecería ahí, que es justo la que
     el barista tiene enfrente. */
  const kdsCount = kds.length;

  /* Alta de ingrediente: el servidor nunca fija el stock directamente (todo
     cambio es un movimiento), así que la existencia inicial se registra como
     una entrada aparte una vez que ya existe el id. */
  async function saveIngredient(dataIn, inicial) {
    const created = await data.saveIngredient(dataIn);
    // `inicial` viene como {amount, unitMode}: la existencia se teclea en la
    // unidad de compra y la convierte el servidor, igual que cualquier entrada.
    if (created && inicial && inicial.amount > 0) {
      await data.adjustStock({
        ingredientId: created.id,
        reason: "compra",
        mode: "delta",
        amount: inicial.amount,
        unitMode: inicial.unitMode,
        note: "Existencia inicial",
      });
    }
    return !!created;
  }

  const ALL_NAV = [
    { id: "order", icon: "order", label: "Orden", badge: cartCount },
    { id: "accounts", icon: "table", label: "Cuentas", badge: (openOrders || []).length },
    { id: "kds", icon: "bag", label: "Barra", badge: kdsCount },
    { id: "history", icon: "clock", label: "Historial", badge: orders.length },
    { id: "expenses", icon: "note", label: "Gastos", badge: expenses.length },
    { id: "closeshift", icon: "lock", label: "Cerrar caja" },
    { id: "menu", icon: "edit", label: "Menú" },
    { id: "tables", icon: "table", label: "Mesas" },
    { id: "inventory", icon: "box", label: "Inventario", badge: lowStockCount },
    { id: "summary", icon: "chart", label: "Resumen" },
    { id: "reports", icon: "report", label: "Reportes" },
    { id: "staff", icon: "users", label: "Empleados" },
    { id: "tools", icon: "tools", label: "Herramientas" },
  ];

  // ---- Login gate (sin usuario o sin token de sesión válido) ----
  if (!user || !getToken()) {
    return <Login onLogin={login} users={users} />;
  }

  const role = ROLES[user.role] || ROLES.cajero;
  const NAV = ALL_NAV.filter((n) => role.nav.includes(n.id));
  const canManage = user.role === "admin";
  // Vista efectiva: si el rol no la permite, un efecto ya la corrige; mientras
  // tanto se renderiza su pantalla de inicio para no mostrar nada no autorizado.
  const safeView = role.nav.includes(navActive) ? view : role.nav[0];
  const backupStale = !backupDismissed && daysSince(lastBackup) >= BACKUP_STALE_DAYS && (orders.length > 0 || shiftHistory.length > 0);

  return (
    // El alto va por CSS (.fuwa-viewport), no inline: necesita el respaldo
    // vh→dvh, que un objeto de estilo no puede expresar (ver styles.css).
    <div className="fuwa-viewport" style={{ display: "flex", width: "100vw", overflow: "hidden", background: "var(--cream)" }}>
      {/* Confirmación flotante de "sí salió la comanda". Se va sola a los 3s. */}
      {aviso && (
        <div
          style={{
            position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 200,
            background: "var(--navy)", color: "#fff", borderRadius: 999, padding: "12px 24px",
            fontFamily: "var(--ui)", fontWeight: 800, fontSize: 14.5,
            boxShadow: "0 14px 34px -12px rgba(58,65,88,.6)", display: "flex", alignItems: "center", gap: 9,
          }}
        >
          <Icon name="check" size={17} />
          {aviso}
        </div>
      )}

      {/* ---- Sidebar ---- */}
      <nav style={{ width: 96, background: "#fff", borderRight: "2px solid var(--line)", display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 0 12px", flexShrink: 0, zIndex: 10 }}>
        <div style={{ marginBottom: 16, flexShrink: 0 }}>
          <Mascot size={44} />
        </div>
        {/* minHeight:0 + overflow: si hay más botones que pantalla, la lista se desliza */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minHeight: 0, overflowY: "auto", width: "100%", padding: "0 12px" }}>
          {NAV.map((n) => {
            const active = navActive === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  padding: "9px 0",
                  flexShrink: 0,
                  border: "none",
                  borderRadius: 16,
                  cursor: "pointer",
                  fontFamily: "var(--ui)",
                  fontWeight: 800,
                  fontSize: 12,
                  background: active ? "var(--primary-soft)" : "transparent",
                  color: active ? "var(--primary)" : "var(--muted)",
                  transition: "all .12s ease",
                }}
              >
                <Icon name={n.icon} size={25} stroke={active ? 2.4 : 2} />
                {n.label}
                {n.badge > 0 && (
                  <span style={{ position: "absolute", top: 6, right: 14, minWidth: 19, height: 19, padding: "0 5px", borderRadius: 999, background: "var(--gold)", color: "#fff", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {n.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div style={{ fontFamily: "var(--jp)", fontSize: 10, color: "var(--gold)", letterSpacing: 1, writingMode: "vertical-rl", marginTop: 12, opacity: 0.7 }}>ふわふわ</div>
      </nav>

      {/* ---- Topbar + contenido ---- */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header style={{ height: 64, background: "#fff", borderBottom: "2px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 26px", flexShrink: 0 }}>
          <Logo size={30} />
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* Sin conexión: la app sigue cobrando y encola; se avisa aquí. */}
            {!online && (
              <div
                title={data.pendingCount > 0 ? `${data.pendingCount} operación(es) pendientes de sincronizar` : "Sin conexión con el servidor"}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, fontWeight: 800, fontSize: 12.5, background: "oklch(0.95 0.06 85)", color: "oklch(0.45 0.1 70)" }}
              >
                <Icon name="report" size={15} /> Sin conexión{data.pendingCount > 0 ? ` · ${data.pendingCount}` : ""}
              </div>
            )}
            <div
              title={shift.open ? "Caja abierta" : "Caja cerrada"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 999,
                fontWeight: 800,
                fontSize: 12.5,
                background: shift.open ? "var(--primary-soft)" : "oklch(0.94 0.05 25)",
                color: shift.open ? "var(--primary)" : "oklch(0.5 0.16 25)",
              }}
            >
              <Icon name={shift.open ? "unlock" : "lock"} size={15} /> {shift.open ? "Caja abierta" : "Caja cerrada"}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "var(--navy)", whiteSpace: "nowrap", lineHeight: 1.25 }}>{user.name}</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", whiteSpace: "nowrap", lineHeight: 1.25 }}>{role.label} · Caja 1</div>
            </div>
            <Avatar user={user} size={42} />
            <button
              onClick={logout}
              title="Cerrar sesión"
              style={{ width: 44, height: 44, borderRadius: 12, border: "2px solid var(--line)", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}
            >
              <Icon name="logout" size={20} />
            </button>
          </div>
        </header>

        {/* Aviso de respaldo: alerta del riesgo de perder datos si hace varios días que no se respalda. */}
        {backupStale && (
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 22px", background: "oklch(0.95 0.06 85)", borderBottom: "2px solid oklch(0.85 0.1 85)", color: "oklch(0.42 0.09 70)", flexShrink: 0 }}>
            <Icon name="note" size={20} />
            <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700, lineHeight: 1.35 }}>
              {lastBackup ? `Hace ${Math.floor(daysSince(lastBackup))} días que no respaldas.` : "Aún no has respaldado los datos."} Los datos viven en el servidor (SQLite): descarga un respaldo por si falla el disco.
            </div>
            {canManage && (
              <button onClick={exportBackup} style={{ border: "none", background: "var(--navy)", color: "#fff", borderRadius: 999, padding: "8px 16px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "var(--ui)", whiteSpace: "nowrap" }}>
                Respaldar ahora
              </button>
            )}
            <button onClick={() => setBackupDismissed(true)} aria-label="Descartar" title="Descartar por ahora" style={{ border: "none", background: "transparent", color: "inherit", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: 4 }}>
              ✕
            </button>
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
          {safeView === "order" &&
            (shift.open ? (
              <OrderScreen
                cart={cart}
                menu={menu}
                mods={mods}
                cats={cats}
                areas={areas}
                ingredients={ingredients}
                table={table}
                setTable={setTable}
                addLine={addLine}
                setLineQty={setLineQty}
                updateLine={updateLine}
                removeLine={removeLine}
                clearCart={clearCart}
                onCheckout={() => setView("pay")}
                orderType={orderType}
                setOrderType={setOrderType}
                showEmoji={SHOW_EMOJI}
                account={cuentaMode ? account || { lines: [] } : null}
                onEnviar={enviarAPreparar}
                onAnularEnviado={anularEnviado}
                onCerrarCuenta={salirDeCuenta}
                onDescartarCuenta={descartarCuenta}
                enviando={enviando}
              />
            ) : (
              <OpenRegister onOpen={openRegister} lastClose={shift.closedAt} lastCloseNote={shift.lastCloseNote} lastCashLeft={shift.lastCashLeft} />
            ))}
          {safeView === "accounts" &&
            (shift.open ? (
              <AccountsScreen openOrders={openOrders || []} areas={areas} onAbrir={abrirCuenta} onNueva={nuevaCuenta} />
            ) : (
              <OpenRegister onOpen={openRegister} lastClose={shift.closedAt} lastCloseNote={shift.lastCloseNote} lastCashLeft={shift.lastCashLeft} />
            ))}
          {safeView === "kds" && <KdsScreen orders={kds} shiftOpen={shift.open} onSetPrep={data.setOrderPrep} />}
          {/* En una cuenta se cobra TODO lo vivo: lo ya enviado más lo que
              quede en el carrito. Lo anulado no entra. */}
          {safeView === "pay" && (
            <PayScreen
              cart={account ? [...account.lines.filter((l) => !l.voided), ...cart] : cart}
              orderType={orderType}
              table={table}
              tipEnabled={TIP_ENABLED}
              onBack={() => setView("order")}
              onConfirm={confirmPayment}
            />
          )}
          {safeView === "receipt" && lastOrder && <Receipt order={lastOrder} onNew={newOrder} />}
          {safeView === "history" && <HistoryScreen orders={orders} shiftHistory={shiftHistory} onVoid={voidOrder} onReprint={reprintOrder} onReopenShift={canManage ? reopenShift : null} />}
          {safeView === "closeshift" && <CloseShiftScreen shiftOpen={shift.open} openingCash={shift.openingCash} orders={orders} expenses={expenses} onCloseShift={closeShift} />}
          {safeView === "expenses" && (
            <ExpensesScreen
              expenses={expenses}
              onAdd={(concept, amount, method, kind) => data.addExpense(concept, amount, method, kind)}
              onRemove={(id) => data.removeExpense(id)}
              availableCash={availableCashNow(shift.openingCash, orders, expenses)}
            />
          )}
          {safeView === "menu" && <MenuEditor menu={menu} setMenu={setMenu} mods={mods} setMods={setMods} cats={cats} setCats={setCats} ingredients={ingredients} />}
          {safeView === "tables" && <TablesEditor areas={areas} setAreas={setAreas} />}
          {safeView === "inventory" && (
            <InventoryScreen
              ingredients={ingredients}
              canManage={canManage}
              onSaveIngredient={saveIngredient}
              onDeleteIngredient={data.deleteIngredient}
              onAdjustStock={data.adjustStock}
              fetchStockMoves={data.fetchStockMoves}
            />
          )}
          {safeView === "summary" && <SummaryScreen orders={orders} expenses={expenses} cats={cats} shiftHistory={shiftHistory} menu={menu} mods={mods} ingredients={ingredients} />}
          {safeView === "reports" && <ReportsScreen orders={orders} expenses={expenses} shiftHistory={shiftHistory} menu={menu} mods={mods} ingredients={ingredients} />}
          {safeView === "staff" && <StaffEditor users={users} onSave={data.saveUser} onDelete={data.deleteUser} currentUser={user} />}
          {safeView === "tools" && <ToolsScreen onResetMenu={resetMenu} onClearOrders={clearOrders} onExport={exportBackup} onImport={importBackup} lastBackup={lastBackup} backupEstado={backupEstado} onBackupAhora={respaldarAhora} backupOcupado={backupOcupado} />}
        </div>
      </main>

      {/* Documentos para reimprimir una orden vieja (ocultos salvo al imprimir). */}
      <PrintDocs order={printTarget} />
    </div>
  );
}
