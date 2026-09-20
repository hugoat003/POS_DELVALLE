/* Café del Valle POS — marca.

   Una sola fuente para la marca: el archivo del logotipo. `variant="mark"` da
   el distintivo (anillo con taza) y `variant="full"` el logotipo entero.

   Aquí vivía también `Mascot`, una versión del distintivo redibujada a mano en
   SVG que se usaba en los estados vacíos y en el ticket. Se eliminó: no era el
   logo sino un parecido, y al convivir con el archivo real garantizaba que la
   marca se viera distinta según la pantalla. Para atenuarlo en un fondo —que
   era lo que resolvía el trazo de un solo color— está `opacidad`. */

/* Logotipo completo. `variant="mark"` entrega solo el distintivo, para el riel
   colapsado de la barra lateral en tablet. */
/* `tono="claro"` usa la versión del logotipo preparada para fondos oscuros: los
   mismos trazos, con el olivo cambiado por la crema de la marca y el café
   aclarado. No es una silueta blanca —eso aplanaría el logotipo a un solo
   tono— sino el mismo logo con los dos colores llevados al otro extremo. */
export function Logo({ size = 34, variant = "full", tono = "oscuro", opacidad = 1 }) {
  const claro = tono === "claro";
  const src = variant === "mark"
    ? (claro ? "/logo-mark-claro.png" : "/logo-mark.png")
    : (claro ? "/logo-claro.png" : "/logo.png");
  return (
    <img
      src={src}
      alt="Café del Valle"
      style={{
        height: variant === "mark" ? size : "auto",
        width: variant === "mark" ? size : size * 3.9,
        display: "block",
        objectFit: "contain",
        opacity: opacidad,
      }}
    />
  );
}
