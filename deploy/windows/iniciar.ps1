<#
  Café del Valle POS — arranque de la caja.

  Lo lanza la tarea programada al iniciar sesión en Windows. Hace tres cosas:
    1. levanta el servidor (que también sirve la app compilada),
    2. espera a que responda,
    3. abre la app a pantalla completa en el navegador.

  Si el servidor se cae, lo vuelve a levantar. No usa un servicio de Windows a
  propósito: un servicio corre como SYSTEM y ahí no existen ni la unidad de
  Google Drive (respaldo) ni la impresora compartida del usuario (ticket).
  Corriendo en la sesión del cajero, las dos funcionan.
#>

$ErrorActionPreference = "Stop"

# Raíz del proyecto: dos niveles arriba de este archivo (deploy\windows\).
$Raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Raiz

$LogDir = Join-Path $Raiz "server\data\logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log = Join-Path $LogDir ("cafe-del-valle-" + (Get-Date -Format "yyyy-MM-dd") + ".log")

function Escribir($msg) {
  $linea = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $msg
  Write-Host $linea
  Add-Content -Path $Log -Value $linea -Encoding UTF8
}

# Se conservan 14 días de log: si no, crecen para siempre sin que nadie mire.
Get-ChildItem $LogDir -Filter "cafe-del-valle-*.log" -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } |
  Remove-Item -Force -ErrorAction SilentlyContinue

# --- puerto: se lee del .env si está, si no el de por defecto ---
$Puerto = "5174"
$EnvFile = Join-Path $Raiz ".env"
if (Test-Path $EnvFile) {
  $m = Select-String -Path $EnvFile -Pattern '^\s*PORT\s*=\s*(\d+)' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($m) { $Puerto = $m.Matches[0].Groups[1].Value }
}
$Url = "http://localhost:$Puerto"

# Lee una clave del .env (solo para lo que necesita ESTE script: las pantallas).
function LeerEnv($clave, $defecto) {
  if (Test-Path $EnvFile) {
    $m = Select-String -Path $EnvFile -Pattern "^\s*$clave\s*=\s*(.*?)\s*(#.*)?$" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($m -and $m.Matches[0].Groups[1].Value) { return $m.Matches[0].Groups[1].Value.Trim() }
  }
  return $defecto
}

# --- node: puede no estar en el PATH de la tarea programada ---
$Node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $Node) {
  # Node instalado sin permisos de administrador (portable) vive en el perfil del usuario.
  foreach ($ruta in @("$env:ProgramFiles\nodejs\node.exe", "${env:ProgramFiles(x86)}\nodejs\node.exe", "$env:USERPROFILE\tools\node\node.exe")) {
    if (Test-Path $ruta) { $Node = $ruta; break }
  }
}
if (-not $Node) {
  Escribir "ERROR: no se encontró node.exe. Instala Node.js 22 y vuelve a correr instalar.ps1"
  Start-Sleep -Seconds 30
  exit 1
}

if (-not (Test-Path (Join-Path $Raiz "dist"))) {
  Escribir "ERROR: falta dist\. Corre: npm run build"
  Start-Sleep -Seconds 30
  exit 1
}

Escribir "iniciando Café del Valle POS · node=$Node · puerto=$Puerto"

# --- pantallas ---
<#
  La mini PC de caja tiene DOS monitores:
    · el principal (táctil)      → la caja: cobrar, cuentas, cierre
    · el secundario (LCD vertical) → la barra: tablero de comandas del barista

  Cada uno es una ventana de Chrome en kiosco con su PROPIO perfil, porque la
  sesión (el PIN con que se entró) vive en el almacenamiento del navegador: con
  un solo perfil, iniciar sesión como barista en una ventana cerraría al cajero
  en la otra. Con un solo monitor solo se abre la caja; "off" en BARRA_PANTALLA
  desactiva la ventana de barra aunque haya dos.

  El proceso se declara "consciente de DPI" antes de preguntar por los monitores:
  si no, Windows le miente con coordenadas escaladas (un monitor al 125% mide
  1536 en vez de 1920) y la ventana de barra caería en el monitor equivocado.
#>
function PantallaBarra {
  if ((LeerEnv "BARRA_PANTALLA" "auto") -eq "off") { return $null }
  try {
    Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public static class CdvDpi { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }' -ErrorAction SilentlyContinue
    [void][CdvDpi]::SetProcessDPIAware()
    Add-Type -AssemblyName System.Windows.Forms
    $otras = [System.Windows.Forms.Screen]::AllScreens | Where-Object { -not $_.Primary } | Sort-Object { $_.Bounds.X }
    if (-not $otras) { return $null }
    $b = $otras[0].Bounds
    Escribir "pantalla de barra: $($otras[0].DeviceName) $($b.Width)x$($b.Height) en ($($b.X),$($b.Y))"
    # Coordenadas a mano por si Windows y Chrome no se ponen de acuerdo: BARRA_POSICION=1920,0
    $manual = LeerEnv "BARRA_POSICION" ""
    if ($manual -match '^\s*(-?\d+)\s*,\s*(-?\d+)\s*$') { return @{ X = [int]$Matches[1]; Y = [int]$Matches[2] } }
    return @{ X = $b.X + 50; Y = $b.Y + 50 }  # +50: cae dentro del monitor aunque el borde no cuadre
  } catch {
    Escribir "no se pudieron leer los monitores ($($_.Exception.Message)); se abre solo la caja"
    return $null
  }
}

# --- navegador en modo pantalla completa ---
function AbrirVentana($nombre, $perfil, $posicion) {
  $chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1

  <#
    Perfil aparte: evita que la sesión del POS se mezcle con la navegación
    personal de quien use la máquina, y que un "restaurar pestañas" reabra otra cosa.

    Sin comillas manuales: PowerShell ya entrecomilla los elementos con espacios
    al construir la línea de comandos. Escaparlas aquí produciría comillas
    dobles y Chrome recibiría una ruta rota — y la ruta del proyecto puede
    perfectamente tener espacios.
  #>
  $comunes = @(
    "--kiosk", "--no-first-run", "--noerrdialogs", "--disable-session-crashed-bubble",
    "--disable-infobars", "--disable-features=TranslateUI", "--user-data-dir=$perfil"
  )
  # El kiosco se abre en el monitor donde cae la ventana: por eso se le da posición.
  if ($posicion) { $comunes += "--window-position=$($posicion.X),$($posicion.Y)" }
  if ($chrome) {
    Escribir "abriendo $nombre en Chrome"
    Start-Process $chrome -ArgumentList (@("--app=$Url") + $comunes)
  } else {
    $edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    if (-not (Test-Path $edge)) { $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" }
    if (Test-Path $edge) {
      Escribir "abriendo $nombre en Edge"
      Start-Process $edge -ArgumentList (@("$Url", "--edge-kiosk-type=fullscreen", "--no-first-run") + $comunes)
    } else {
      Escribir "no se encontró Chrome ni Edge; abre manualmente $Url"
    }
  }
}

function AbrirApp {
  AbrirVentana "la caja" (Join-Path $Raiz "server\data\navegador") $null
  $barra = PantallaBarra
  if ($barra) {
    # Pausa corta: dos Chrome arrancando a la vez se pelean el foco y el kiosco
    # de uno termina en el monitor del otro.
    Start-Sleep -Seconds 3
    AbrirVentana "el tablero de barra" (Join-Path $Raiz "server\data\navegador-barra") $barra
  } else {
    Escribir "un solo monitor (o BARRA_PANTALLA=off): no se abre el tablero de barra"
  }
}

# --- bucle de supervisión ---
$appAbierta = $false
while ($true) {
  $proc = Start-Process -FilePath $Node `
    -ArgumentList @("--env-file-if-exists=.env", "server\index.js") `
    -WorkingDirectory $Raiz -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $LogDir "servidor.out.log") `
    -RedirectStandardError  (Join-Path $LogDir "servidor.err.log")

  Escribir "servidor arrancado (PID $($proc.Id))"

  # Esperar a que responda antes de abrir la app: si no, el cajero ve un error
  # de conexión y cree que el sistema está roto.
  $listo = $false
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    if ($proc.HasExited) { break }
    try {
      # 127.0.0.1 y no "localhost": en esta PC "localhost" resuelve primero a IPv6
      # (::1), donde el servidor no escucha, y Windows espera ~2 s antes de caer a
      # IPv4. Con un timeout de 2 s la comprobación fallaba SIEMPRE y la app nunca abría.
      $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Puerto/api/health" -UseBasicParsing -TimeoutSec 5
      if ($r.StatusCode -eq 200) { $listo = $true; break }
    } catch { }
  }

  if ($listo) {
    Escribir "el servidor responde en $Url"
    if (-not $appAbierta) { AbrirApp; $appAbierta = $true }
  } else {
    Escribir "ADVERTENCIA: el servidor no respondió en 60 s (revisa servidor.err.log)"
  }

  $proc.WaitForExit()
  Escribir "el servidor se detuvo (código $($proc.ExitCode)); reintentando en 5 s"

  <#
    Start-Process trunca los archivos de redirección en cada arranque, así que
    en un bucle de reinicio el error que lo provocó se pierde en el siguiente
    intento. Se copia la cola al log diario, que sí es acumulativo: es la
    diferencia entre poder diagnosticar la caída y no.
  #>
  if ($proc.ExitCode -ne 0) {
    $err = Join-Path $LogDir "servidor.err.log"
    if ((Test-Path $err) -and (Get-Item $err).Length -gt 0) {
      Escribir "--- últimas líneas del error ---"
      Get-Content $err -Tail 15 -ErrorAction SilentlyContinue | ForEach-Object { Escribir "    $_" }
    }
  }

  Start-Sleep -Seconds 5
}
