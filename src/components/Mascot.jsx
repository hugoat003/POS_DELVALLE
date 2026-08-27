/* Café del Valle POS — marca.

   `Mascot` conserva el nombre por compatibilidad (lo importan 9 pantallas como
   ilustración de estado vacío y en el ticket impreso). Es el distintivo del
   logo —anillo abierto con taza— dibujado en SVG de un solo color, para que
   siga aceptando `color` y se pueda teñir o imprimir en negro.

   `Logo` es el logotipo completo en sus dos tintas: se usa donde hay espacio y
   la marca debe leerse entera (barra lateral, login). */

export function Mascot({ size = 40, color = "var(--verde)" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ display: "block" }} aria-hidden="true">
      {/* Anillo abierto: la "C" de Café */}
      <path
        d="M78 25A37 37 0 1 0 78 75"
        fill="none"
        stroke={color}
        strokeWidth="9.5"
        strokeLinecap="round"
      />
      {/* Vapor */}
      <path
        d="M42 30c-3.5 3.5-3.5 6.5 0 10s3.5 6.5 0 10M56 30c-3.5 3.5-3.5 6.5 0 10s3.5 6.5 0 10"
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* Taza */}
      <path
        d="M30 57h32v5a16 16 0 0 1-16 16h0a16 16 0 0 1-16-16z"
        fill="none"
        stroke={color}
        strokeWidth="5.5"
        strokeLinejoin="round"
      />
      {/* Asa */}
      <path d="M63 60h3.5a8 8 0 0 1 0 16H64" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" />
      {/* Plato */}
      <path d="M25 82h44" stroke={color} strokeWidth="5.5" strokeLinecap="round" />
    </svg>
  );
}

/* Logotipo completo. `variant="mark"` entrega solo el distintivo, para el riel
   colapsado de la barra lateral en tablet. */
export function Logo({ size = 34, variant = "full" }) {
  const src = variant === "mark" ? "/logo-mark.png" : "/logo.png";
  return (
    <img
      src={src}
      alt="Café del Valle"
      style={{
        height: variant === "mark" ? size : "auto",
        width: variant === "mark" ? size : size * 3.9,
        display: "block",
        objectFit: "contain",
      }}
    />
  );
}
