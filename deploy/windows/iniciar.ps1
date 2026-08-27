<#
  FUWA POS — arranque de la caja.

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
$Log = Join-Path $LogDir ("fuwa-" + (Get-Date -Format "yyyy-MM-dd") + ".log")

function Escribir($msg) {
  $linea = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $msg
  Write-Host $linea
  Add-Content -Path $Log -Value $linea -Encoding UTF8
}

# Se conservan 14 días de log: si no, crecen para siempre sin que nadie mire.
Get-ChildItem $LogDir -Filter "fuwa-*.log" -ErrorAction SilentlyContinue |
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

# --- node: puede no estar en el PATH de la tarea programada ---
$Node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $Node) {
  foreach ($ruta in @("$env:ProgramFiles\nodejs\node.exe", "${env:ProgramFiles(x86)}\nodejs\node.exe")) {
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

Escribir "iniciando FUWA POS · node=$Node · puerto=$Puerto"

# --- navegador en modo pantalla completa ---
function AbrirApp {
  $chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1

  # Perfil aparte: evita que la sesión del POS se mezcle con la navegación
  # personal de quien use la máquina, y que un "restaurar pestañas" reabra otra cosa.
  $perfil = Join-Path $Raiz "server\data\navegador"
  <#
    Sin comillas manuales: PowerShell ya entrecomilla los elementos con espacios
    al construir la línea de comandos. Escaparlas aquí produciría comillas
    dobles y Chrome recibiría una ruta rota — y la ruta del proyecto puede
    perfectamente tener espacios.
  #>
  $comunes = @(
    "--kiosk", "--no-first-run", "--noerrdialogs", "--disable-session-crashed-bubble",
    "--disable-infobars", "--disable-features=TranslateUI", "--user-data-dir=$perfil"
  )
  if ($chrome) {
    Escribir "abriendo la app en Chrome"
    Start-Process $chrome -ArgumentList (@("--app=$Url") + $comunes)
  } else {
    $edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    if (-not (Test-Path $edge)) { $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" }
    if (Test-Path $edge) {
      Escribir "abriendo la app en Edge"
      Start-Process $edge -ArgumentList (@("$Url", "--edge-kiosk-type=fullscreen", "--no-first-run") + $comunes)
    } else {
      Escribir "no se encontró Chrome ni Edge; abre manualmente $Url"
    }
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
      $r = Invoke-WebRequest -Uri "$Url/api/health" -UseBasicParsing -TimeoutSec 2
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
