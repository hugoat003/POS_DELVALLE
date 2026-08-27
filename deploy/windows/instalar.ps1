<#
  FUWA POS — instalación en la mini PC de caja.

  Deja el equipo listo para que, al encenderlo, arranque solo el sistema
  completo: servidor, respaldo automático, impresión y la app en pantalla.

  Se ejecuta UNA vez, como administrador:
    powershell -ExecutionPolicy Bypass -File deploy\windows\instalar.ps1

  Lo que hace:
    1. comprueba Node.js
    2. instala dependencias y compila la app
    3. crea el .env a partir de .env.example si no existe
    4. abre el puerto en el firewall para que entren las tablets
    5. registra una tarea programada que arranca todo al iniciar sesión
#>

param(
  [int]$Puerto = 5174,
  [switch]$SinCompilar
)

$ErrorActionPreference = "Stop"
$Raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Tarea = "FUWA POS"

function Paso($n, $t) { Write-Host "`n[$n] $t" -ForegroundColor Cyan }
function Ok($t)   { Write-Host "    OK  $t" -ForegroundColor Green }
function Aviso($t){ Write-Host "    !   $t" -ForegroundColor Yellow }
function Alto($t) { Write-Host "    X   $t" -ForegroundColor Red; exit 1 }

Write-Host "`n=== FUWA POS · instalación de la caja ===" -ForegroundColor White
Write-Host "Proyecto: $Raiz"

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Alto "Abre PowerShell como administrador y vuelve a intentarlo." }

# ---------------------------------------------------------------- 1. Node
Paso 1 "Comprobando Node.js"
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Alto "Node.js no está instalado. Descárgalo de https://nodejs.org (versión 22 LTS) y repite." }
$version = (& node -v)
Ok "Node $version en $($node.Source)"
if ([int]($version -replace 'v(\d+)\..*', '$1') -lt 20) { Alto "Se necesita Node 20 o superior (better-sqlite3 no compila en versiones viejas)." }

# ------------------------------------------------------- 2. dependencias
Paso 2 "Instalando dependencias y compilando"
Set-Location $Raiz
if ($SinCompilar) {
  Aviso "omitido por -SinCompilar"
} else {
  # `npm ci` respeta el package-lock; si no hay lock, se cae a `npm install`.
  if (Test-Path (Join-Path $Raiz "package-lock.json")) { & npm ci } else { & npm install }
  if ($LASTEXITCODE -ne 0) { Alto "falló la instalación de dependencias" }
  & npm run build
  if ($LASTEXITCODE -ne 0) { Alto "falló la compilación (npm run build)" }
  Ok "dist\ generado"
}

# --------------------------------------------------------------- 3. .env
Paso 3 "Configuración (.env)"
$envFile = Join-Path $Raiz ".env"
if (Test-Path $envFile) {
  Ok ".env ya existe (no se toca)"
} else {
  Copy-Item (Join-Path $Raiz ".env.example") $envFile
  # HOST=0.0.0.0 es imprescindible aquí: con NODE_ENV=production el servidor
  # escucharía solo en localhost y NINGUNA tablet podría conectarse.
  Add-Content $envFile "`r`n# --- puesto por instalar.ps1 ---`r`nNODE_ENV=production`r`nHOST=0.0.0.0`r`nPORT=$Puerto`r`n"
  Ok ".env creado desde .env.example"
  Aviso "EDITA .env antes de operar: IP de la impresora de cocina, nombre de la impresora de caja y carpeta de respaldo."
}

# ----------------------------------------------------------- 4. firewall
Paso 4 "Abriendo el puerto $Puerto para las tablets"
$reglaNombre = "FUWA POS ($Puerto)"
Get-NetFirewallRule -DisplayName $reglaNombre -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName $reglaNombre -Direction Inbound -Action Allow `
  -Protocol TCP -LocalPort $Puerto -Profile Private,Domain | Out-Null
Ok "regla de firewall creada (solo redes privadas/dominio)"

# ------------------------------------------------------- 5. tarea al inicio
Paso 5 "Registrando el arranque automático"
$script = Join-Path $PSScriptRoot "iniciar.ps1"
if (-not (Test-Path $script)) { Alto "no se encontró $script" }

Unregister-ScheduledTask -TaskName $Tarea -Confirm:$false -ErrorAction SilentlyContinue

$accion = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`"" `
  -WorkingDirectory $Raiz

# Al INICIAR SESIÓN, no al arrancar Windows: se necesita la sesión del usuario
# para la unidad de Google Drive y para la impresora compartida.
$disparador = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Seconds 0)

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $Tarea -Action $accion -Trigger $disparador `
  -Settings $ajustes -Principal $principal `
  -Description "Levanta el servidor de FUWA POS y abre la app al iniciar sesion." | Out-Null
Ok "tarea '$Tarea' registrada para el usuario $env:USERNAME"

# ------------------------------------------------------------------ final
Write-Host "`n=== Listo ===" -ForegroundColor Green
Write-Host @"

Falta hacer a mano (una vez):

  1. EDITAR .env  ->  $envFile
       PRINTER_CAJA=windows://RPT009          nombre del recurso compartido
       PRINTER_COCINA=tcp://192.168.1.50:9100 IP fija de la impresora de cocina
       BACKUP_COPIA=C:\Users\$env:USERNAME\Mi unidad\Respaldos FUWA

  2. IMPRESORA DE CAJA (USB): instalarla con el driver "Generic / Text Only"
     y compartirla con el mismo nombre que pusiste en PRINTER_CAJA.

  3. INICIO DE SESION AUTOMATICO, para que al encender no haya que teclear nada:
       netplwiz  ->  desmarcar "Los usuarios deben escribir su nombre y contrasena"
     (sin esto, el sistema arranca hasta que alguien inicie sesion)

  4. IP FIJA para esta mini PC: las tablets se conectan a ella por IP.
     Reserva por DHCP en el router es lo mas sencillo.

Para probar sin reiniciar:
    Start-ScheduledTask -TaskName "$Tarea"

Para ver que esta pasando:
    Get-Content "$Raiz\server\data\logs\fuwa-$(Get-Date -Format yyyy-MM-dd).log" -Tail 30 -Wait

Para detener:
    powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\detener.ps1"

"@ -ForegroundColor Gray
