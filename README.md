# FUWA · Punto de Venta

POS para la cafetería **FUWA** (café estilo asiático: matcha, boba, postres).
Estética suave/kawaii — azul marino + crema + dorado, tomada del logo (mascota mochi,
日本のコーヒー). Moneda: **Quetzal (Q)**. El cliente **paga antes de consumir**.

Implementado con **React + Vite** a partir del prototipo de diseño de FUWA.

## Cómo correrlo

```bash
npm install
npm run dev      # desarrollo: Vite + servidor de datos (abre el navegador)
npm run build    # build de producción en dist/
npm start        # uso diario: compila y sirve app + datos en http://localhost:5174
```

Los datos (menú, órdenes, turnos, empleados…) se guardan en **SQLite**
(`server/data/fuwa.db`, modo WAL) a través del servidor Express local. La
primera vez que arranca, el servidor **importa automáticamente** los archivos
JSON antiguos de `server/data/*.json` y los archiva en
`server/data/json-importado/`.

El navegador mantiene una copia en `localStorage` como caché: si el servidor
se cae, la app sigue cobrando (las órdenes se encolan con número provisional
`#·P` y se sincronizan al reconectar). Abrir/cerrar caja sí requiere conexión.

### Seguridad y multi-tablet

- **Login en el servidor** — el PIN se verifica con `POST /api/login`
  (hash **scrypt** + rate limit: 5 fallos → bloqueo exponencial). El navegador
  nunca ve hashes; toda la API exige un token de sesión (expira a las 12 h de
  inactividad). Los PIN antiguos (SHA-256) se re-hashean solos al primer login.
- **Varias tablets a la vez** — las órdenes y gastos se insertan de forma
  individual e idempotente y **el número de orden lo asigna el servidor** en
  una transacción: dos tablets no pueden pisarse los datos ni duplicar números.
  Cada tablet sondea `GET /api/sync` cada 4 s y ve lo que cobran las demás;
  si una tablet intenta abrir un turno ya abierto recibe el estado actual.
- El arqueo del cierre de caja lo **calcula el servidor** con sus propias
  filas (no confía en el cliente).

## Desplegarlo en un VPS

El servidor Node no debe dar la cara a Internet: se pone detrás de un reverse
proxy con HTTPS. Receta con **Caddy** (certificados Let's Encrypt automáticos):

```bash
# 1. En el VPS (Ubuntu/Debian): Node 20+, y compilar el módulo nativo allí
git clone <repo> /opt/fuwa && cd /opt/fuwa
npm install && npm run build       # nunca subas node_modules desde tu Mac

# 2. Servicio systemd — /etc/systemd/system/fuwa.service
[Unit]
Description=FUWA POS
After=network.target
[Service]
User=fuwa
WorkingDirectory=/opt/fuwa
Environment=NODE_ENV=production PORT=5174
ExecStart=/usr/bin/node server/index.js
Restart=always
[Install]
WantedBy=multi-user.target
# systemctl enable --now fuwa

# 3. Caddy — /etc/caddy/Caddyfile   (HTTPS automático)
pos.tudominio.com {
    reverse_proxy 127.0.0.1:5174
}

# 4. Firewall: solo 80/443/SSH
ufw allow 80,443/tcp && ufw allow OpenSSH && ufw enable
```

Con `NODE_ENV=production` el servidor **solo escucha en 127.0.0.1** (nadie
puede saltarse el proxy). Las tablets entran a `https://pos.tudominio.com`.

**Respaldos** — ya no hace falta cron: el servidor hace una copia diaria por su
cuenta (ver *Respaldos* más abajo). En un VPS que está siempre encendido se puede
añadir además una copia binaria de SQLite, que es consistente con WAL:

```bash
# crontab -e   (opcional, complementa al respaldo JSON de la app)
0 4 * * * sqlite3 /opt/fuwa/server/data/fuwa.db ".backup /var/backups/fuwa-$(date +\%F).db" && find /var/backups -name 'fuwa-*.db' -mtime +30 -delete
```

## Funcionalidad

- **Login con roles** — empleados con PIN (también se escribe con el teclado físico:
  dígitos, Backspace, Escape). La navegación se filtra por rol. Demo:
  - **Mariko Tanaka** — Gerente · PIN `1234` → acceso total.
  - **Sofía Gómez** — Cajero/Barista · PIN `1111` → orden, historial, gastos, cierre
    de caja e inventario (solo para registrar mermas).
  - **Diego Ramírez** — Cajero/Barista · PIN `2222` → igual que Sofía.
  - **Barra** — rol para el tablero de comandas: **solo** ve la pantalla Barra.
    No se siembra por defecto; se crea desde Empleados.
  - El panel azul muestra un **reloj en vivo** y la fecha.
- **Tablero de barra (KDS)** — sustituye a la comandera impresa. Cada orden cobrada
  entra como ticket y pasa por dos firmas: la barra marca **Listo** y quien recoge
  marca **Entregado** (hasta entonces el ticket sigue mostrando la mesa en grande).
  Cualquier toque se puede **deshacer**. Lo ven los roles Barra y Gerente.
- **Apertura y cierre de caja** — la caja inicia **cerrada**; hay que abrirla con un
  **fondo de apertura** antes de poder tomar órdenes. Con la caja cerrada no se pueden
  crear órdenes. Al cerrar caja se hace el arqueo de efectivo
  (fondo + ventas en efectivo + entradas − gastos en efectivo); los **cobros con
  tarjeta** se muestran aparte para cuadrar contra el datáfono, sin entrar al arqueo.
  Se puede dejar una **nota y el efectivo que queda en caja**, que aparecen a quien
  abra el siguiente turno (útil cuando los billetes grandes se van al banco).
- **Tomar orden** — menú por categorías, búsqueda, carrito en vivo y Para aquí / Para llevar.
- **Personalización** — tamaño, leche, nivel de azúcar, extras y nota libre para barra/cocina.
- **Cobro** — una cuenta **o pago dividido por productos** (asignas cada producto a la
  persona 1 o 2 y cada quien paga con su propio método: efectivo y/o tarjeta, con cambio).
  Efectivo con montos rápidos y cálculo de cambio; propina opcional.
- **Cuenta abierta (mesas)** — la orden se guarda al tomarla, se manda a preparar y se
  cobra al final. Mientras está abierta **no es una venta**: no entra al arqueo ni a los
  reportes. Se pueden agregar items y volver a enviar; lo ya enviado no se reimprime ni
  se vuelve a descontar del inventario. El mostrador puede seguir cobrando de una vez.
- **Ruteo por categoría** — cada categoría tiene un destino de preparación:
  - **cocina** → imprime **comanda física sin precios**. No hay pantalla ni usuario de
    cocina: se trabaja con el papel.
  - **barra** → aparece en el **tablero (KDS)** del barista. No imprime nada.
  - El **ticket del cliente** es aparte y lleva **todos** los items, porque es la cuenta.
- **Impresión ESC/POS directa** — el servidor manda los bytes a la impresora; no hay
  diálogo de impresión del navegador ni PDF de por medio. Ver *Impresoras* abajo.
- **Recibo** imprimible con la mascota.
- **Editor de menú** — tres pestañas:
  - **Productos** — agregar / editar / eliminar; **precio por tamaño editable por producto**;
    **icono (emoji) o imagen** por producto.
  - **Leche, azúcar y extras** — recargos editables de cada opción.
  - **Categorías** — agregar / editar / eliminar categorías (nombre, emoji y color/tono).
- **Empleados** — administrar el equipo: agregar / editar / eliminar, rol, PIN y color.
- **Historial del día** — órdenes cobradas, expandibles (incluye pagos divididos).
- **Resumen / cierre de caja** — dashboard con KPIs, ventas por hora, top productos,
  dona de métodos de pago, ventas por categoría y arqueo de efectivo.
- **Reportes en PDF** (solo gerente) — reportes diario / semanal / mensual o por
  rango de fechas personalizado, con KPIs (ventas, órdenes, ticket promedio,
  propinas, gastos, efectivo vs tarjeta) y los arqueos de caja del período.
  Vista previa en pantalla y descarga directa del PDF.
- **Ganancia neta** (Resumen y Reportes) — ingresos − costo de ingredientes − gastos,
  con margen y gráfica por día. El costo sale de las **recetas del menú** valoradas
  con el precio de ingrediente cargado en Inventario, así que el número solo vale lo
  que valgan esas recetas: si hay líneas vendidas sin receta, la pantalla lo avisa.
  La propina no cuenta como ingreso y las entradas de dinero a caja tampoco.
- **Gastos y movimientos** — salidas (compras, pagos) y también **entradas** de dinero
  a caja aparte de las ventas (aportes, reembolsos). Ambas afectan el arqueo; solo
  las salidas cuentan como gasto en los reportes.

- **Tablero del dueño** — `GET /api/dashboard` devuelve en una sola petición las ventas
  del día, la ganancia neta, las cuentas abiertas, lo pendiente en barra y las alertas
  (insumos bajo mínimo, papeles atorados). Pensado para consultarlo desde el celular
  por Tailscale sin descargar el turno entero.

## Impresoras

Dos 3nstar RPT009 con caminos distintos a propósito:

| Destino | Conexión | Qué imprime | Por qué así |
|---|---|---|---|
| **caja** | USB en la mini PC | ticket del cliente | No depende de la red: si se cae el switch o el WiFi, en caja se sigue cobrando e imprimiendo. |
| **cocina** | LAN, IP fija | comandas | La cocina está lejos de la caja. |

Se configuran en `.env` (ver [`.env.example`](.env.example)):

```bash
PRINTER_CAJA=windows://RPT009            # recurso compartido local (USB)
PRINTER_COCINA=tcp://192.168.1.50:9100   # RAW/JetDirect
# file://./server/data/tickets           # simulación: escribe el papel a disco
# off                                    # desactivada
```

En Windows, la impresora de caja se instala con el driver **"Generic / Text Only"**
(con el driver propio el spooler intenta rasterizar el ESC/POS) y se comparte con ese
nombre. A la de cocina conviene reservarle la IP en el router.

**Nada se pierde si una impresora falla.** El trabajo se encola en la misma transacción
que la orden, así que si el cobro se guardó, el papel está garantizado: el worker
reintenta con espera creciente (5 s → 5 min, sin abandonar) y saca el ticket solo en
cuanto la impresora vuelve. Un destino puesto en `off` descarta el trabajo en vez de
acumularlo, para que el contador de pendientes siga significando "algo necesita
atención". Desde *Ajustes* hay una **página de prueba** por impresora que usa
exactamente el mismo camino que un papel real.

El codificador ESC/POS es propio (`server/escpos.js`, sin dependencias) en vez de
`node-thermal-printer`: esa librería necesita el módulo nativo `printer` para USB en
Windows, que hay que compilar con node-gyp y las Build Tools de Visual Studio — justo
en la impresora que tiene que funcionar cuando todo lo demás falla. Incluye página de
códigos CP858 (acentos y ñ) y un decodificador para previsualizar el papel sin hardware.

## Instalarlo en la mini PC de caja

Que al encender el equipo arranque todo solo —servidor, impresión, respaldo y la
app a pantalla completa— está resuelto en [`deploy/windows/`](deploy/windows/):

```powershell
powershell -ExecutionPolicy Bypass -File deploy\windows\instalar.ps1
```

Instrucciones completas y solución de problemas en
[deploy/windows/LEEME.md](deploy/windows/LEEME.md). Para Linux hay una unidad
systemd en [deploy/linux/fuwa.service](deploy/linux/fuwa.service).

**El arranque va atado al inicio de sesión, no al arranque de Windows**, y es a
propósito: un servicio correría como SYSTEM, donde no existen ni la unidad de
Google Drive (respaldo) ni la impresora compartida del usuario (ticket de caja).

⚠ En el local hay que poner **`HOST=0.0.0.0`** en el `.env`. Con
`NODE_ENV=production` y sin esa línea el servidor escucha solo en `localhost`:
en la caja se ve todo perfecto y **ninguna tablet conecta**.

## Respaldos

Se guarda **una copia completa al día** en `server/data/backups/` (`fuwa-aaaa-mm-dd.json`)
y se conservan las últimas 30. El archivo es el mismo formato que exporta el botón manual,
así que se puede restaurar desde *Herramientas → Restaurar respaldo* sin ninguna herramienta
extra.

**No hay cron a las 3 a. m.**, y es a propósito: la mini PC de una cafetería se apaga al
cerrar, así que un disparo por hora exacta no ocurriría nunca. En vez de eso, cada 15 minutos
se pregunta *"¿ya existe la copia de hoy?"*; si no existe y la hora programada ya pasó, se
hace. Encender el equipo a las 7 a. m. dispara el respaldo que se habría perdido de
madrugada. La escritura es a un temporal + `rename`, para que un corte de luz a media copia
no deje un archivo truncado que parezca válido.

### Sacarlo de la computadora

Un respaldo en el mismo disco que la base no sirve el día que falla ese disco, que es
justamente el día que se necesita. Hay dos caminos:

**Opción A — carpeta sincronizada (recomendada).** Instalar *Google Drive para escritorio*
(o usar OneDrive, que ya viene en Windows), iniciar sesión con la cuenta del negocio y
apuntar `BACKUP_COPIA` a una carpeta dentro de la unidad sincronizada:

```bash
BACKUP_COPIA=G:\Mi unidad\Respaldos FUWA
```

El sistema solo copia un archivo; de subirlo se encarga Drive. Sin credenciales, sin tokens
que caduquen, sin cuota de API, y funciona igual con Dropbox, OneDrive o una unidad de red.

**Opción B — API de Google Drive.** Con cuenta de servicio, sin dependencias (el JWT se firma
con `node:crypto`):

```bash
BACKUP_DRIVE_CREDENCIALES=C:\fuwa\credenciales-drive.json
BACKUP_DRIVE_CARPETA=<id de la carpeta>
```

⚠ **Solo funciona con Google Workspace y una unidad compartida.** Una cuenta de servicio no
tiene almacenamiento propio, así que contra una cuenta personal de Gmail la subida falla con
`storageQuotaExceeded`. El sistema detecta ese error y lo traduce en vez de mostrar el JSON
crudo de Google.

Las dos opciones pueden convivir. Si la copia externa falla, **el respaldo local igual se
guarda** y el error queda visible en *Herramientas* y en `/api/backup/estado`.

La apariencia es fija (tema Mochi, tipografía Fredoka, redondeo 28px) y vive en
`src/styles.css`. El panel de Tweaks que permitía cambiarla en vivo se eliminó.

Todo se guarda en el servidor local (`server/data/*.json`) con `localStorage`
como caché: el menú editado, las órdenes, los turnos y las preferencias de
apariencia persisten al recargar e incluso si se limpia el navegador.

## Estructura

```
src/
  main.jsx            arranque de React (precarga estado del servidor)
  App.jsx             shell: login, navegación por rol, estado y persistencia
  data.js             menú, categorías, tamaños y modificadores
  styles.css          identidad visual fija, estilos globales y media query tablet
  lib/                format.js (moneda, cálculo de líneas), api.js (token,
                      outbox offline), serverData.js (turno/órdenes/gastos +
                      sync multi-tablet), storage.js (config kv con caché),
                      recipe.js (recetas y consumo), profit.js (costo de ventas
                      y ganancia neta), reportStats.js, reportPdf.js
  components/          Icon, Mascot/Logo, ui (botón, pill, estilos de modal,
                      Kpi/DashCard/MiniBars), ProfitCard
  auth/               users (roles), Avatar, Login (PIN contra el servidor)
  screens/            OrderScreen, CustomizeModal, PayScreen (con pago dividido),
                      Receipt (+ comanda de cocina), MenuEditor (productos/opciones/
                      categorías), StaffEditor, OpenRegister, HistoryScreen,
                      SummaryScreen, ReportsScreen (PDF)
server/
  index.js            API Express: login/sesiones, órdenes/gastos/turnos, sync
  db.js               capa SQLite (better-sqlite3): esquema, transacciones,
                      migración desde los JSON antiguos
  data/fuwa.db        la base de datos (WAL); respáldala con sqlite3 .backup
```

La config (menú, opciones, categorías, apariencia) viaja como JSON a la tabla
`kv`; lo transaccional (órdenes, gastos, turnos, empleados, sesiones) son
tablas SQL con número de orden asignado por el servidor.
