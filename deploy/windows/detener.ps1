<#
  FUWA POS — detiene el sistema (servidor + app en pantalla).

  Para mantenimiento: actualizar el menú desde código, cambiar el .env,
  restaurar un respaldo a mano. No desinstala nada: al reiniciar o con
  Start-ScheduledTask vuelve a levantar.

    powershell -ExecutionPolicy Bypass -File deploy\windows\detener.ps1
#>

$Raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Tarea = "FUWA POS"

Write-Host "Deteniendo FUWA POS..." -ForegroundColor Cyan

# 1. La tarea, para que el bucle de supervisión no lo vuelva a levantar.
$t = Get-ScheduledTask -TaskName $Tarea -ErrorAction SilentlyContinue
if ($t) {
  Stop-ScheduledTask -TaskName $Tarea -ErrorAction SilentlyContinue
  Write-Host "  tarea detenida" -ForegroundColor Green
}

# 2. El PowerShell supervisor (el que corre iniciar.ps1), antes que node: si se
#    matara node primero, el bucle lo relanzaría de inmediato.
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*iniciar.ps1*" } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Host "  supervisor detenido (PID $($_.ProcessId))" -ForegroundColor Green
  }

# 3. El servidor. Se filtra por la ruta del proyecto para no matar otros Node
#    que el equipo pudiera tener corriendo.
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*server\index.js*" } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Host "  servidor detenido (PID $($_.ProcessId))" -ForegroundColor Green
  }

# 4. El navegador del POS: se reconoce por su perfil propio, así no se cierra
#    el Chrome personal de quien esté usando la máquina.
$perfil = Join-Path $Raiz "server\data\navegador"
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { ($_.Name -eq "chrome.exe" -or $_.Name -eq "msedge.exe") -and $_.CommandLine -like "*$perfil*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Write-Host "  app cerrada" -ForegroundColor Green

Write-Host "`nListo. Para volver a levantarlo:  Start-ScheduledTask -TaskName `"$Tarea`"" -ForegroundColor Gray
