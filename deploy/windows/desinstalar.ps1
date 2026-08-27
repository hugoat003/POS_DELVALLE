<#
  FUWA POS — quita el arranque automático y la regla de firewall.

  NO borra la base de datos, ni los respaldos, ni el .env: solo deja de
  levantarse solo. Ejecutar como administrador.

    powershell -ExecutionPolicy Bypass -File deploy\windows\desinstalar.ps1
#>

param([int]$Puerto = 5174)

$Tarea = "FUWA POS"
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Write-Host "Abre PowerShell como administrador." -ForegroundColor Red; exit 1 }

& (Join-Path $PSScriptRoot "detener.ps1")

Unregister-ScheduledTask -TaskName $Tarea -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "  tarea programada eliminada" -ForegroundColor Green

Get-NetFirewallRule -DisplayName "FUWA POS ($Puerto)" -ErrorAction SilentlyContinue |
  Remove-NetFirewallRule -ErrorAction SilentlyContinue
Write-Host "  regla de firewall eliminada" -ForegroundColor Green

Write-Host "`nLos datos siguen intactos en server\data\ (base, respaldos y .env)." -ForegroundColor Gray
