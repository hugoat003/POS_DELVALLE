<#
  Café del Valle POS — lo que solo se puede hacer como ADMINISTRADOR (una vez).

  Deja resueltas las dos cosas que instalar.ps1 no puede hacer sin permisos:

    1. FIREWALL: abre el puerto del POS para que las tablets conecten. La regla
       solo vale en redes "Privadas", y Windows marca como "Pública" toda red
       nueva; por eso también se pasa la red actual a Privada. Sin esto, la caja
       funciona pero ninguna tablet entra.
    2. INICIO DE SESIÓN AUTOMÁTICO: al encender la PC entra sola a la cuenta y
       la tarea del POS arranca sin que nadie toque nada.

  Cómo ejecutarlo: menú Inicio > escribe "PowerShell" > clic derecho >
  "Ejecutar como administrador", y luego:

    powershell -ExecutionPolicy Bypass -File C:\POS\POS_DELVALLE\deploy\windows\permisos-admin.ps1

  Para quitar el inicio automático de sesión:  ... -QuitarAutoLogin
#>

param(
  [int]$Puerto = 5174,
  [switch]$SoloRed,          # solo firewall y tipo de red; no toca el inicio de sesión
  [switch]$QuitarAutoLogin
)

$ErrorActionPreference = "Stop"
function Paso($t) { Write-Host "`n$t" -ForegroundColor Cyan }
function Ok($t)   { Write-Host "    OK  $t" -ForegroundColor Green }
function Aviso($t){ Write-Host "    !   $t" -ForegroundColor Yellow }

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Write-Host "Abre PowerShell como administrador y repite." -ForegroundColor Red; exit 1 }

$winlogon = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"

if ($QuitarAutoLogin) {
  Set-ItemProperty $winlogon -Name AutoAdminLogon -Value "0"
  Ok "inicio de sesión automático desactivado"
  exit 0
}

# ------------------------------------------------------------- 1. firewall
Paso "[1] Firewall y tipo de red"
$regla = "Café del Valle POS ($Puerto)"
Get-NetFirewallRule -DisplayName $regla -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName $regla -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Puerto -Profile Private,Domain | Out-Null
Ok "regla creada: puerto $Puerto entrante, redes privadas y de dominio"

$publicas = @(Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -eq "Public" })
foreach ($c in $publicas) {
  Set-NetConnectionProfile -InterfaceIndex $c.InterfaceIndex -NetworkCategory Private
  Ok "la red '$($c.Name)' pasó de Pública a Privada (si no, la regla no aplicaría)"
}
if (-not $publicas) { Ok "las redes ya son privadas" }
Aviso "Al llevar la PC al local, Windows preguntará el tipo de la red nueva: elige PRIVADA."

if ($SoloRed) { Write-Host "`nListo (solo firewall y red; el inicio de sesión no se tocó)." -ForegroundColor Green; exit 0 }

# ------------------------------------------------------ 2. inicio automático
Paso "[2] Inicio de sesión automático"
# La cuenta que está usando la PC (no la del administrador que ejecuta esto, si es otra).
$usuario = (Get-CimInstance Win32_ComputerSystem).UserName
$usuario = if ($usuario) { $usuario.Split("\")[-1] } else { $env:USERNAME }
$cuenta = Get-LocalUser -Name $usuario -ErrorAction SilentlyContinue

if ($cuenta -and $cuenta.PasswordRequired) {
  <#
    Con contraseña, guardarla en el registro la deja en texto plano: eso no se
    hace desde un script. netplwiz la guarda cifrada (como secreto de LSA).
  #>
  Aviso "la cuenta '$usuario' TIENE contraseña: hazlo con netplwiz, que la guarda cifrada."
  Aviso "Ejecuta netplwiz, selecciona '$usuario', desmarca 'Los usuarios deben escribir su nombre...' y Aceptar."
  Aviso "(Si esa casilla no aparece: Configuración > Cuentas > Opciones de inicio de sesión > apaga 'Requerir Windows Hello...')"
} else {
  Set-ItemProperty $winlogon -Name AutoAdminLogon -Value "1"
  Set-ItemProperty $winlogon -Name DefaultUserName -Value $usuario
  Set-ItemProperty $winlogon -Name DefaultDomainName -Value $env:COMPUTERNAME
  Set-ItemProperty $winlogon -Name DefaultPassword -Value ""
  Ok "la cuenta '$usuario' (sin contraseña) entrará sola al encender"
  Aviso "Para desactivarlo: ... permisos-admin.ps1 -QuitarAutoLogin"
}

Write-Host "`nListo. Reinicia la PC para probar: debe entrar sola y abrir caja y barra." -ForegroundColor Green
