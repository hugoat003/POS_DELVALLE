<#
  Café del Valle POS — prueba de las impresoras, paso a paso.

  Sirve para montar las impresoras EN EL LOCAL sin tener que cobrar una orden de
  verdad para saber si salen. Hace dos cosas, en este orden:

    1. DIAGNÓSTICO de lo que configuraste en el .env (PRINTER_CAJA / PRINTER_COCINA):
       ¿la impresora USB está instalada y compartida con ese nombre? ¿la de cocina
       responde en su IP y en el puerto 9100? Si algo falla, dice qué y cómo arreglarlo.
    2. PRUEBA REAL: manda una página de prueba por el MISMO camino que un ticket
       de verdad (la cola del servidor), y muestra si salió o por qué no.

    powershell -ExecutionPolicy Bypass -File deploy\windows\probar-impresoras.ps1
    ... -Solo caja        (o: cocina)
    ... -Usuario u1 -Pin 1234   (el gerente; por defecto el de demostración)

  El servidor tiene que estar corriendo (arranca solo al iniciar sesión).
#>

param(
  [ValidateSet("todas", "caja", "cocina")][string]$Solo = "todas",
  [string]$Usuario = "u1",
  [string]$Pin = "1234"
)

$Raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$EnvFile = Join-Path $Raiz ".env"
function Ok($t)   { Write-Host "    OK  $t" -ForegroundColor Green }
function Mal($t)  { Write-Host "    X   $t" -ForegroundColor Red }
function Aviso($t){ Write-Host "    !   $t" -ForegroundColor Yellow }
function Dato($t) { Write-Host "        $t" -ForegroundColor Gray }

function LeerEnv($clave, $defecto) {
  if (Test-Path $EnvFile) {
    $m = Select-String -Path $EnvFile -Pattern "^\s*$clave\s*=\s*(.*?)\s*(#.*)?$" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($m -and $m.Matches[0].Groups[1].Value) { return $m.Matches[0].Groups[1].Value.Trim() }
  }
  return $defecto
}

$Puerto = LeerEnv "PORT" "5174"
$Url = "http://127.0.0.1:$Puerto"  # no "localhost": tarda ~2 s en caer de IPv6 a IPv4
$destinos = if ($Solo -eq "todas") { @("caja", "cocina") } else { @($Solo) }

Write-Host "`n=== Prueba de impresoras ===" -ForegroundColor White
if (-not (Test-Path $EnvFile)) { Mal "no existe .env en $Raiz (copia deploy\env-local.example)"; exit 1 }

# ------------------------------------------------------------ 1. diagnóstico
$listos = @()
foreach ($d in $destinos) {
  $clave = "PRINTER_" + $d.ToUpper()
  $valor = LeerEnv $clave "off"
  Write-Host "`n[$d]  $clave=$valor" -ForegroundColor Cyan

  if ($valor -eq "off") { Aviso "desactivada: los trabajos de $d se descartan. Ponle un destino en el .env."; continue }
  if ($valor -like "file://*") { Aviso "es una SIMULACIÓN: el papel se escribe a disco ($($valor.Substring(7))), no sale por ninguna impresora."; $listos += $d; continue }

  if ($valor -match '^windows://(.+)$') {
    $partes = @($Matches[1].Split("/") | Where-Object { $_ })
    $equipo = if ($partes.Count -gt 1) { $partes[0] } else { "localhost" }
    $recurso = $partes[-1]
    Dato "recurso compartido: \\$equipo\$recurso"
    if ($equipo -in @("localhost", "127.0.0.1", $env:COMPUTERNAME)) {
      $todas = @(Get-Printer -ErrorAction SilentlyContinue)
      $real = $todas | Where-Object { $_.ShareName -eq $recurso -or $_.Name -eq $recurso } | Select-Object -First 1
      if (-not $real) {
        Mal "no hay ninguna impresora instalada llamada '$recurso'."
        Dato ("Instaladas: " + $(if ($todas) { ($todas | ForEach-Object { $_.Name }) -join ", " } else { "(ninguna: conecta la impresora USB y enciéndela)" }))
        Dato "Arreglo: instálala (Configuración > Impresoras y escáneres) con el driver 'Generic / Text Only'."
        continue
      }
      Ok "impresora instalada: '$($real.Name)' en el puerto $($real.PortName)"
      if (-not $real.Shared -or $real.ShareName -ne $recurso) {
        Mal "no está COMPARTIDA como '$recurso' (compartida=$($real.Shared), nombre=$($real.ShareName))."
        Dato "Arreglo: Propiedades de la impresora > Compartir > Nombre del recurso: $recurso"
        Dato "         (o ajusta PRINTER_CAJA en el .env al nombre que ya tiene)"
        continue
      }
      Ok "compartida como '$recurso'"
      if ($real.DriverName -notmatch "Generic|Text Only|Genérico|Solo texto") {
        Aviso "el driver es '$($real.DriverName)'. Con un driver propio el spooler intenta rasterizar el ESC/POS y sale basura."
        Dato "Arreglo: cambia el driver a 'Generic / Text Only' (Propiedades > Opciones avanzadas > Controlador)."
      } else { Ok "driver: $($real.DriverName)" }
      if ($real.PrinterStatus -and $real.PrinterStatus -ne "Normal") { Aviso "estado de la cola: $($real.PrinterStatus) (¿apagada, sin papel o en pausa?)" }
    } else {
      Aviso "impresora en otra PC ($equipo): no se puede revisar desde aquí; la prueba real dirá si llega."
    }
    $listos += $d
    continue
  }

  if ($valor -match '^tcp://([^:/]+)(?::(\d+))?$') {
    $ip = $Matches[1]
    $pto = if ($Matches[2]) { [int]$Matches[2] } else { 9100 }
    if ($ip -like "*XXX*") { Mal "el .env todavía tiene la IP de plantilla ($ip). Pon la IP real de la impresora."; continue }
    Dato "impresora de red: ${ip}:$pto"
    # ¿Es la misma red que esta PC? Es el error de configuración más común al cambiar de sitio.
    $mias = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | ForEach-Object { $_.IPAddress })
    $red = { param($x) ($x.Split(".")[0..2]) -join "." }
    if ($mias.Count -and -not ($mias | Where-Object { (& $red $_) -eq (& $red $ip) })) {
      Aviso "esta PC está en $($mias -join ', ') y la impresora en ${ip}: son REDES DISTINTAS."
      Dato "Si estás probando fuera del local, es normal. En el local, revisa la IP del .env."
    }
    $r = Test-NetConnection -ComputerName $ip -Port $pto -WarningAction SilentlyContinue -InformationLevel Quiet
    if ($r) { Ok "responde en el puerto $pto"; $listos += $d }
    else {
      $ping = Test-Connection -ComputerName $ip -Count 1 -Quiet -ErrorAction SilentlyContinue
      if ($ping) { Mal "la IP responde pero el puerto $pto está cerrado: revisa el modo RAW/9100 de la impresora, o que otro aparato no se haya quedado esa IP." }
      else { Mal "nadie responde en ${ip}: apagada, cable/WiFi desconectado, IP mal escrita o en otra red." }
    }
    continue
  }
  Mal "no entiendo el valor '$valor' (usa tcp://IP:9100, windows://RECURSO, file://RUTA u off)"
}

# ----------------------------------------------------------- 2. prueba real
Write-Host "`n[prueba real]  página de prueba por la cola del servidor" -ForegroundColor Cyan
if (-not $listos.Count) { Aviso "ningún destino pasó el diagnóstico; arregla lo de arriba y repite."; exit 1 }

try { Invoke-RestMethod "$Url/api/health" -TimeoutSec 4 | Out-Null }
catch { Mal "el servidor no responde en $Url. Arráncalo:  Start-ScheduledTask -TaskName 'Café del Valle POS'"; exit 1 }
Ok "servidor arriba en $Url"

try {
  $login = Invoke-RestMethod "$Url/api/login" -Method Post -ContentType "application/json" -Body (@{ userId = $Usuario; pin = $Pin } | ConvertTo-Json)
} catch { Mal "no se pudo entrar como '$Usuario' (¿PIN cambiado? usa -Pin)."; exit 1 }
$h = @{ Authorization = "Bearer " + $login.token }
if ($login.user.role -ne "admin") { Mal "'$Usuario' no es gerente; la prueba de impresora es solo del gerente."; exit 1 }

$desde = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - 2000
foreach ($d in $listos) {
  Invoke-RestMethod "$Url/api/printers/$d/test" -Method Post -Headers $h | Out-Null
  Ok "página de prueba en cola: $d"
}

# El worker reintenta con espera creciente; aquí se espera lo suficiente para ver el primer intento.
Start-Sleep -Seconds 7
$est = Invoke-RestMethod "$Url/api/printers" -Headers $h
foreach ($d in $listos) {
  # `recientes` viene del más nuevo al más viejo: el primero de este destino es la prueba.
  $j = $est.recientes | Where-Object { $_.target -eq $d -and $_.createdAt -ge $desde } | Select-Object -First 1
  if (-not $j) { Aviso "[$d] no aparece el trabajo en la cola (¿otra sesión lo borró?)"; continue }
  switch ($j.status) {
    "impreso"    { Ok "[$d] ENVIADA a la impresora. Si no ves papel: revisa que tenga rollo y la tapa cerrada." }
    "descartado" { Mal "[$d] descartada: $($j.lastError)" }
    default      { Mal "[$d] NO salió (intentos: $($j.attempts)). Motivo: $($j.lastError)"; Dato "Sigue en cola y reintentará sola; en cuanto arregles la causa, sale." }
  }
}
Write-Host ""
