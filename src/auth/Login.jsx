/* FUWA POS — pantalla de login: selección de usuario y teclado de PIN.
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
        border: "2px solid var(--line)",
        background: ghost ? "transparent" : "#fff",
        color: "var(--navy)",
        fontFamily: "var(--display)",
        fontWeight: 800,
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

  const hora = now.toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" });
  const fecha = now.toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long" });

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
          background: "var(--navy)",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 48px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", right: -80, top: -60, width: 320, height: 320, borderRadius: 999, background: "rgba(255,255,255,.04)" }} />
        <div style={{ position: "absolute", right: 40, bottom: -120, width: 260, height: 260, borderRadius: 999, background: "rgba(191,163,119,.12)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
          <Mascot size={48} color="#fff" />
          <div>
            <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 32, letterSpacing: 1 }}>FUWA</div>
            <div style={{ fontFamily: "var(--jp)", fontSize: 12, color: "var(--gold)", letterSpacing: 3 }}>日本のコーヒー</div>
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", color: "rgba(191,163,119,.9)" }}>Caja 1 · Punto de venta</div>
          <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 52, lineHeight: 1.05, letterSpacing: 0.5, marginTop: 12, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{hora}</div>
          <div style={{ color: "rgba(255,255,255,.62)", fontSize: 16.5, marginTop: 10, textTransform: "capitalize" }}>{fecha}</div>
        </div>
        <div style={{ fontFamily: "var(--jp)", fontSize: 13, color: "rgba(191,163,119,.8)", letterSpacing: 2, position: "relative" }}>ふわふわ</div>
      </div>

      {/* panel de acceso */}
      <div style={{ flex: 1, background: "var(--cream)", display: "flex", alignItems: "center", justifyContent: "center", padding: 40, minWidth: 0 }}>
        {!sel ? (
          <div style={{ width: "100%", maxWidth: 460 }}>
            <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 30, color: "var(--navy)", margin: "0 0 4px" }}>¿Quién está en caja?</h1>
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
                    border: "2px solid var(--line)",
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
                    <div style={{ fontWeight: 800, fontSize: 17, color: "var(--ink)" }}>{u.name}</div>
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
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontWeight: 800, fontSize: 14.5, fontFamily: "var(--ui)", marginBottom: 22 }}
            >
              <Icon name="back" size={20} /> Cambiar usuario
            </button>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 22 }}>
              <Avatar user={sel} size={72} ring />
              <div>
                <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 22, color: "var(--navy)" }}>{sel.name}</div>
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
            <div style={{ height: 22, color: "oklch(0.6 0.16 25)", fontWeight: 800, fontSize: 13.5, marginBottom: 14 }}>{err}</div>
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
