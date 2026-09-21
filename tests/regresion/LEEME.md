# Pruebas de regresión

306 comprobaciones que cubren el camino del dinero de punta a punta. Cada una
existe porque algo falló de verdad: si una se pone en rojo, lo que se rompió ya
costó caro una vez.

```bash
npm test          # todas
npm test -- 02    # solo la suite 02
npm run test:humo # la prueba de humo de siempre (necesita el servidor en 5174)
```

**No tocan la base del negocio.** Cada suite levanta su propio servidor contra
una carpeta desechable del temporal del sistema (`CDV_DATA_DIR`). La base de
`server/data/` no se abre ni se lee.

## Qué cubre cada suite

| Suite | Qué vigila |
|---|---|
| `01-nucleo` | Arranque y semilla, permisos por rol, turno de caja, venta de mostrador, descuento de inventario, cuentas de mesa (abrir → enviar → agregar → cobrar), validación de líneas que llegan de la tablet, anulación de un producto ya mandado a cocina, tablero de barra, impresión y arqueo. |
| `02-dinero` | Costo derivado de la unidad de compra, comida de empleado, coherencia entre Resumen / Reportes / ganancia neta / tablero del dueño, respaldo y restauración, borrado de gastos, reabrir turno, anular una venta cobrada, pago dividido, sesiones y permisos de configuración. |
| `03-offline` | La cola de ventas cobradas sin conexión: qué pasa con la caja cerrada, con la sesión vencida y al reintentar. Semilla de mesas en una instalación nueva. Ticket promedio. Compactación de turnos viejos. |
| `04-cruces` | Funciones que se pisan entre sí: anular un consumo de empleado, dos cuentas en la misma mesa, una cuenta abierta cruzando el cierre de turno, numeración de órdenes, dos tablets cobrando la misma cuenta. |
| `05-interfaz` | Navegador real sobre la app compilada: que ninguna pantalla se rompa, el candado de la mesa, el aviso de ventas sin registrar y su reintento. |
| `06-carta-y-teclado` | La carta real de `deploy/menu` (86 productos, ruteo a cocina/barra), el combo que manda su bebida al barista sin repetirla en cocina, y el teclado numérico del tablero de barra en un navegador vertical (Enter = Listo → Entregado, `+`/`−`, `.` deshacer). |

## Al escribir una prueba nueva

Dos reglas que salieron de equivocarme aquí mismo:

**No repliques la lógica del proyecto dentro de la prueba.** Importa la función
de verdad. Dos de estas pruebas copiaban el criterio de "qué cuenta como venta"
y siguieron en verde después de arreglarlo, porque comprobaban la copia vieja.

**Afirma algo que solo sea cierto si la función sirve.** "No se ve el login"
también es cierto en una pantalla en blanco; "el botón de Orden está visible"
no. Un error de JavaScript en consola se trata como fallo por lo mismo.
