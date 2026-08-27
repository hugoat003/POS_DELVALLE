# Instalar Café del Valle POS en la mini PC de caja

Deja el equipo de forma que **al encenderlo arranque solo**: servidor, impresión,
respaldo automático y la app a pantalla completa. Nadie tiene que abrir nada.

## Antes de empezar

- **Node.js 22 LTS** instalado — [nodejs.org](https://nodejs.org)
- El proyecto copiado en el equipo, por ejemplo `C:\fuwa`
- Las dos impresoras conectadas (la de caja por USB, la de cocina en la red)

## 1. Instalar

PowerShell **como administrador**, en la carpeta del proyecto:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\windows\instalar.ps1
```

Instala dependencias, compila la app, crea el `.env`, abre el puerto en el
firewall y registra el arranque automático.

## 2. El `.env`

Hay dos configuraciones listas para copiar, según dónde se esté probando:

```powershell
copy deploy\env-local.example .env     # el local: impresoras reales, Drive
copy deploy\env-prueba.example .env    # oficina o casa: sin hardware
```

**`env-local.example`** ya trae los datos medidos en la red del local:
impresora de caja `Receipt` por USB, cocina en `192.168.1.XXX:9100` y el
respaldo a la carpeta de Drive. Solo hay que ajustar el nombre de usuario de
Windows en la ruta del respaldo.

**`env-prueba.example`** no menciona ninguna IP a propósito: funciona igual en
cualquier red. Las impresoras escriben a `server\data\tickets\` como texto
legible, así se revisa el formato exacto de comandas y tickets sin tener el
hardware conectado, y una tablet en la misma WiFi entra normalmente.

`instalar.ps1` crea un `.env` genérico si no existe; copiar uno de estos dos lo
reemplaza. Los tres valores que importan:

```ini
PRINTER_CAJA=windows://Receipt              # nombre del recurso compartido
PRINTER_COCINA=tcp://192.168.1.XXX:9100     # IP fija de la de cocina
BACKUP_COPIA=C:\Users\Caja\Mi unidad\Respaldos Cafe del Valle
```

`instalar.ps1` ya añadió `NODE_ENV=production`, `HOST=0.0.0.0` y `PORT=5174`.

⚠ **No quites `HOST=0.0.0.0`.** Sin esa línea el servidor escucha solo en
`localhost` y **ninguna tablet puede conectarse**, aunque en la caja todo se vea
perfecto. Es el fallo más confuso de todo el montaje.

## Cambiar de sitio (oficina ⇄ local)

El equipo se prueba en una red y se instala en otra. Lo único que cambia es una
línea, pero equivocarse deja el sistema mudo sin decir por qué. El procedimiento
completo:

| | Oficina | Local |
|---|---|---|
| Red | 192.168.1.0/24 | 192.168.1.0/24 |
| Router | 192.168.1.1 | 192.168.1.1 |
| Mini PC | **DHCP** (no fijar) | 192.168.1.YYY |
| Impresora cocina | 192.168.1.XXX | 192.168.1.XXX |
| Plantilla | `env-oficina.example` | `env-local.example` |

**No le pongas IP estática a la mini PC mientras pruebas.** Si le fijas
192.168.1.YYY aquí y la llevas al local (192.168.1.x), el equipo queda aislado:
una estática de otro segmento no alcanza al router. No falla la app — falla la
red, y eso se diagnostica mal porque parece que el POS se rompió. Para probar no
hace falta IP fija: el servidor escucha en todas las interfaces y al arrancar
dice él mismo dónde lo ven las tablets.

**Qué se puede adelantar y qué no.** El `.env` es un archivo de texto: se puede
cambiar en cualquier momento y desde cualquier sitio. Lo único que obliga a estar
en el local son las IP de los dos aparatos.

| | Se puede adelantar | Por qué |
|---|---|---|
| Cambiar el `.env` | **Sí** | Es texto; solo hay que reiniciar para que lo lea |
| IP de la impresora | Sí, pero deja de imprimir aquí | Apunta a una red que no existe en la oficina |
| IP fija de la mini PC | **No** | Una estática de otro segmento la deja sin red |

Si adelantas el `.env`, en la oficina verás el aviso de subred y las comandas se
quedarán en cola. No se pierde ninguna: salen solas al llegar al local.

El cambio, en la mini PC:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\windows\detener.ps1
copy deploy\env-local.example .env
Start-ScheduledTask -TaskName "Café del Valle POS"
```

`detener` y `Start-ScheduledTask` están porque el servidor lee el `.env` **una
sola vez, al arrancar**: cambiar el archivo con el sistema corriendo no hace
nada hasta reiniciarlo. Reiniciar la mini PC consigue lo mismo.

Y en la impresora de cocina, cambiar su IP a 192.168.1.XXX.

Las plantillas de `deploy\` **no se renombran ni se borran**: son moldes. El
archivo que el sistema lee es siempre `.env` en la raíz; copiar encima de él es
lo que cambia de sitio, y tener las tres permite volver atrás sin reescribir
nada.

Si te equivocas de plantilla, el servidor lo dice al arrancar:

```
[impresora] OJO: la impresora de cocina (192.168.1.XXX) está en otra red que
este equipo (192.168.1.14). Revisa PRINTER_COCINA en el .env
```

## 3. Las impresoras

Las dos son el mismo modelo pero se instalan **de forma completamente distinta**.

### Cocina (red) — no se instala nada

Windows no necesita saber que existe. El servidor le manda los bytes ESC/POS
directo al puerto 9100 por TCP, sin driver, sin cola de impresión, sin agregarla
en el panel de control. Lo único que hay que hacer es **darle su IP fija a la
impresora** (desde su propia configuración) y ponerla en `PRINTER_COCINA`.

Si aparece en «Impresoras y escáneres», da igual: el sistema no la usa por ahí.

### Caja (USB) — sí se instala, y el driver importa

El ticket del cliente sale por el recurso compartido de Windows
(`\\localhost\Receipt`), así que la impresora tiene que estar instalada y
compartida.

**1. Instalarla con el driver correcto**

*Configuración → Bluetooth y dispositivos → Impresoras y escáneres → Agregar
dispositivo.* Si no la detecta: *Agregar manualmente → Agregar impresora local →
puerto USB001 → Fabricante: **Genérico** → Impresora: **Generic / Text Only***.

⚠ **No uses el driver de 3nstar.** El driver propio trata la impresora como un
dispositivo gráfico y rasteriza lo que recibe; nuestros comandos ESC/POS son
bytes de control, así que salen jeroglíficos o no sale nada. «Generic / Text
Only» pasa los bytes tal cual, que es justo lo que hace falta.

Si Windows ya instaló el driver de 3nstar solo: *clic derecho → Propiedades de
impresora → Avanzadas → Nuevo controlador → Genérico → Generic / Text Only*.

**2. Compartirla**

*Propiedades de impresora → Compartir → marcar «Compartir esta impresora» →
Nombre del recurso compartido: `Receipt`* (el mismo que está en el `.env`).

**3. Habilitar el uso compartido — en Windows 11 no viene activo**

Sin estos dos, el recurso `\\localhost\Receipt` no existe aunque la impresora
diga «Compartida»:

- *Red e Internet → (tu red) → Propiedades* → tipo de red **Privada**
- *Red e Internet → Configuración de red avanzada → Configuración de uso
  compartido avanzado* → activar **«Uso compartido de archivos e impresoras»**

**4. Comprobar**

*Ajustes → Impresoras → Probar caja* en la app. Usa exactamente el mismo camino
que un ticket real, así que si sale la página de prueba, sale todo.

## 4. Inicio de sesión automático (opcional)

El arranque va atado a la **sesión del usuario**, no al arranque de Windows: tanto
la unidad de Google Drive (respaldo) como la impresora compartida (ticket de caja)
solo existen dentro de una sesión iniciada. Un servicio de Windows correría como
SYSTEM y no vería ninguna de las dos.

Eso significa que el sistema arranca **cuando alguien inicia sesión**. Hay dos
formas de resolverlo, y las dos son válidas:

**A) Alguien teclea la contraseña cada mañana.** No hay que configurar nada. Es
lo más seguro y añade cinco segundos a la apertura.

**B) Inicio de sesión automático**, para que al encender no haya que teclear nada:

```
netplwiz  →  desmarcar "Los usuarios deben escribir su nombre y contraseña"
```

Windows pide la contraseña una vez y la guarda para escribirla sola al arrancar.
**La cuenta sigue teniendo contraseña**; lo que cambia es que Windows la teclea
por ti. Quien encienda el equipo entra directo al escritorio.

Si eliges (B), dos precauciones que valen la pena:

- Que la cuenta de la caja sea **usuario estándar, no administrador**, y que la
  cuenta de administrador sea otra, con su propia contraseña. Así, quien encienda
  el equipo no puede instalar nada ni tocar la configuración.
- El **PIN de Café del Valle es independiente** de Windows: entrar al escritorio no da
  acceso a las ventas. Con un matiz: la sesión de Café del Valle dura **12 h de
  inactividad**, así que si el equipo se reinicia dentro de ese plazo la app
  vuelve con la sesión del último empleado ya abierta. Al día siguiente
  (más de 12 h cerrados) sí pide PIN. Si prefieres que lo pida **siempre** al
  arrancar, se puede bajar ese plazo o cerrar sesión al apagar: dímelo.

Lo que el inicio automático no protege es el archivo de la base
(`server\data\fuwa.db`) frente a alguien con acceso físico al equipo. Para una
mini PC detrás del mostrador es un riesgo razonable; si el equipo va a estar a la
vista del público, mejor la opción (A).

## 5. IP fija a la mini PC

Las tablets se conectan a ella por IP. Si el router se la cambia, **todas pierden
el servidor a la vez** y no se puede cobrar. Lo más simple es una reserva por
DHCP en el router.

Al arrancar, el servidor imprime en el log las direcciones donde lo ven las
tablets:

```
Café del Valle POS · servidor de datos en http://0.0.0.0:5174
  desde las tablets: http://192.168.1.20:5174
```

## Probar sin reiniciar

```powershell
Start-ScheduledTask -TaskName "Café del Valle POS"
```

## Ver qué está pasando

Hay tres archivos en `server\data\logs\` y **cada uno sirve para algo distinto**:

| Archivo | Qué contiene | Cuándo mirarlo |
|---|---|---|
| `fuwa-AAAA-MM-DD.log` | Arranque, reintentos, caídas | No abre la app al encender |
| `servidor.out.log` | Impresoras, respaldos, IP de las tablets | Las comandas o el respaldo fallan |
| `servidor.err.log` | Errores del servidor | Se cae o no levanta |

El comando útil es este — es el equivalente a quedarse mirando el archivo mientras
pasan cosas:

```powershell
Get-Content "server\data\logs\servidor.out.log" -Tail 30 -Wait
```

`-Tail 30` muestra las últimas 30 líneas y `-Wait` deja la ventana abierta
escribiendo las nuevas según ocurren. Se sale con **Ctrl+C**.

Sirve para, en otra ventana, hacer algo en la app y ver el efecto al instante:
mandar una comanda a cocina, o darle *Respaldar ahora*. Si no aparece nada, el
problema es que la acción nunca llegó al servidor.

## Detener para mantenimiento

```powershell
powershell -ExecutionPolicy Bypass -File deploy\windows\detener.ps1
```

Vuelve solo al reiniciar, o con `Start-ScheduledTask`.

## Actualizar a una versión nueva

```powershell
powershell -ExecutionPolicy Bypass -File deploy\windows\detener.ps1
git pull                 # o copiar los archivos nuevos
npm ci
npm run build
Start-ScheduledTask -TaskName "Café del Valle POS"
```

El `.env` y `server\data\` (base, respaldos) no se tocan.

## Quitar el arranque automático

```powershell
powershell -ExecutionPolicy Bypass -File deploy\windows\desinstalar.ps1
```

No borra datos.

---

## Si algo no arranca

| Síntoma | Causa habitual |
|---|---|
| La app abre pero dice "sin conexión" | Falta `dist\`. Corre `npm run build`. |
| En la caja funciona, las tablets no | Falta `HOST=0.0.0.0` en `.env`, o el firewall. |
| No sale la comanda de cocina | IP equivocada. *Ajustes → Impresoras → Probar cocina* dice si la IP existe o si no hay nadie ahí. Las comandas **no se pierden**: quedan en cola y salen al corregirla. |
| El ticket de caja sale con símbolos raros | La impresora no está con el driver "Generic / Text Only". |
| El respaldo no llega a Drive | La carpeta no es accesible. *Herramientas → Respaldo automático* lo dice al arrancar. |
| No arranca nada al encender | No hay inicio de sesión automático (paso 4), o la tarea está deshabilitada: `Get-ScheduledTask -TaskName "Café del Valle POS"`. |

Nada de esto pone en riesgo los datos: la base está en `server\data\fuwa.db` y
hay una copia diaria en `server\data\backups\`.
