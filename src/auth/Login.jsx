/* Café del Valle POS — pantalla de login: selección de usuario y teclado de PIN.
   El PIN se verifica en el SERVIDOR (POST /api/login con scrypt + rate limit);
   el navegador nunca ve hashes. Requiere conexión para iniciar sesión nueva. */
import { useEffect, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { Mascot } from "../components/Mascot.jsx";
import { Avatar, RoleBadge } from "./Avatar.jsx";
import { apiLogin, apiFetch } from "../lib/api.js";

function KeyBtn({ children, onClick, ghost }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 64,
        borderRadius: 18,
        cursor: "pointer",
        border: "1px solid var(--line)",
        background: ghost ? "transparent" : "#fff",
        color: "var(--navy)",
        fontFamily: "var(--display)",
        fontWeight: 700,
        fontSize: 26,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "transform .07s ease, background .1s ease",
      }}
      /* Pointer y no mouse: en táctil los eventos de ratón son sintéticos y
         llegan hasta después del touchend, así que el hundido se veía tarde. */
      onPointerDown={(e) => (e.currentTarget.style.transform = "scale(0.94)")}
      onPointerUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onPointerCancel={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onPointerLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {children}
    </button>
  );
}

export function Login({ onLogin, users: usersProp }) {
  const [sel, setSel] = useState(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(""); // mensaje de error ("" = sin error)
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [users, setUsers] = useState(usersProp || []);

  // Reloj en vivo del panel de marca: se actualiza cada segundo.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Lista de usuarios para el login: endpoint público (solo id/nombre/rol/color).
  // El prop puede venir vacío si este navegador nunca ha iniciado sesión.
  useEffect(() => {
    apiFetch("/api/login-users")
      .then((list) => setUsers(list))
      .catch(() => {
        /* sin conexión: se queda con el caché del prop */
      });
  }, []);
  useEffect(() => {
    if (usersProp && usersProp.length) setUsers((u) => (u.length ? u : usersProp));
  }, [usersProp]);

  // 24h: es lo que espera el personal de caja y evita el "p. m." de es-GT.
  const hora = now.toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit", hour12: false });
  // Solo la inicial en mayúscula: `capitalize` de CSS ponía "27 De Agosto".
  const fecha = (() => {
    const t = now.toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long" });
    return t.charAt(0).toUpperCase() + t.slice(1);
  })();

  function press(d) {
    if (busy) return;
    if (err) setErr("");
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      setBusy(true);
      setTimeout(async () => {
        try {
          const user = await apiLogin(sel.id, next);
          onLogin(user);
        } catch (e) {
          setErr(e.offline ? "Sin conexión con el servidor" : e.message || "PIN incorrecto, intenta de nuevo");
          setPin("");
        } finally {
          setBusy(false);
        }
      }, 120);
    }
  }
  function back() {
    setPin((p) => p.slice(0, -1));
  }

  // Permite escribir el PIN con el teclado físico (dígitos, Backspace, Escape).
  useEffect(() => {
    if (!sel) return;
    function onKey(e) {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        press(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        back();
      } else if (e.key === "Escape") {
        setSel(null);
        setPin("");
        setErr("");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, pin, err]);

  return (
    <div className="fuwa-viewport" style={{ width: "100vw", display: "flex", overflow: "hidden" }}>
      {/* panel de marca */}
      <div
        className="fuwa-brand-panel"
        style={{
          width: 420,
          flexShrink: 0,
          background: "var(--verde)",
          color: "var(--verde-claro)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 48px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Textura de fondo: dos discos muy tenues en el verde de la marca. */}
        <div style={{ position: "absolute", right: -90, top: -70, width: 340, height: 340, borderRadius: 999, background: "rgba(255,255,255,.045)" }} />
        <div style={{ position: "absolute", right: 30, bottom: -130, width: 280, height: 280, borderRadius: 999, background: "rgba(139,90,43,.16)" }} />

        <div style={{ position: "relative" }}>
          <Mascot size={54} color="rgba(255,255,255,.95)" />
          <div style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 40, lineHeight: 1.05, marginTop: 16, letterSpacing: "-.01em" }}>
            Café del Valle
          </div>
          <div style={{ fontSize: 12.5, color: "rgba(244,248,230,.62)", letterSpacing: 3, textTransform: "uppercase", marginTop: 6 }}>
            Cafetería
          </div>
        </div>

        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: "rgba(244,248,230,.55)" }}>Caja 1 · Punto de venta</div>
          <div style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 60, lineHeight: 1.02, letterSpacing: "-.02em", marginTop: 12, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{hora}</div>
          <div style={{ color: "rgba(255,255,255,.6)", fontSize: 16.5, marginTop: 8 }}>{fecha}</div>
        </div>

        <div style={{ fontSize: 12.5, color: "rgba(244,248,230,.45)", letterSpacing: 1.5, position: "relative" }}>Barillas, Huehuetenango</div>
      </div>

      {/* panel de acceso */}
      <div style={{ flex: 1, background: "var(--cream)", display: "flex", alignItems: "center", justifyContent: "center", padding: 40, minWidth: 0 }}>
        {!sel ? (
          <div style={{ width: "100%", maxWidth: 460 }}>
            <h1 style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 34, letterSpacing: "-.01em", color: "var(--tinta)", margin: "0 0 4px" }}>¿Quién está en caja?</h1>
            <p style={{ color: "var(--muted)", margin: "0 0 26px", fontSize: 15.5 }}>Selecciona tu usuario para continuar.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    setSel(u);
                    setPin("");
                    setErr("");
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    background: "#fff",
                    border: "1px solid var(--line)",
                    borderRadius: "var(--r)",
                    padding: "14px 18px",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "border-color .12s ease, transform .1s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--navy)";
                    e.currentTarget.style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--line)";
                    e.currentTarget.style.transform = "none";
                  }}
                >
                  <Avatar user={u} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 17, color: "var(--ink)" }}>{u.name}</div>
                    <div style={{ marginTop: 4 }}>
                      <RoleBadge role={u.role} small />
                    </div>
                  </div>
                  <Icon name="back" size={22} color="var(--muted)" style={{ transform: "scaleX(-1)" }} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ width: "100%", maxWidth: 360, textAlign: "center" }}>
            <button
              onClick={() => {
                setSel(null);
                setPin("");
                setErr("");
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontWeight: 700, fontSize: 14.5, fontFamily: "var(--ui)", marginBottom: 22 }}
            >
              <Icon name="back" size={20} /> Cambiar usuario
            </button>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 22 }}>
              <Avatar user={sel} size={72} ring />
              <div>
                <div style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 25, letterSpacing: "-.01em", color: "var(--tinta)"}}>{sel.name}</div>
                <div style={{ marginTop: 4 }}>
                  <RoleBadge role={sel.role} />
                </div>
              </div>
            </div>
            {/* puntos del PIN */}
            <div className={err ? "fuwa-shake" : ""} style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 8 }}>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 999,
                    background: i < pin.length ? (err ? "oklch(0.6 0.16 25)" : "var(--navy)") : "transparent",
                    border: "2.5px solid " + (err ? "oklch(0.6 0.16 25)" : i < pin.length ? "var(--navy)" : "var(--line)"),
                    transition: "all .1s ease",
                  }}
                />
              ))}
            </div>
            <div style={{ height: 22, color: "oklch(0.6 0.16 25)", fontWeight: 700, fontSize: 13.5, marginBottom: 14 }}>{err}</div>
            {/* teclado */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, maxWidth: 280, margin: "0 auto" }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <KeyBtn key={n} onClick={() => press(String(n))}>
                  {n}
                </KeyBtn>
              ))}
              <div />
              <KeyBtn onClick={() => press("0")}>0</KeyBtn>
              <KeyBtn onClick={back} ghost>
                <Icon name="back" size={22} />
              </KeyBtn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
