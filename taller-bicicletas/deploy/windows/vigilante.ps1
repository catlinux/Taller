#Requires -Version 5.1
<#
  Vigilante de actualizaciones para la instalación de «Taller» en Windows.

  Lo registra el instalador (instalar-windows.ps1) como tarea programada «Taller vigilante»,
  que arranca al encender el PC y se ejecuta como SYSTEM (sin ventana). El vigilante corre
  fuera de la aplicación porque node bloquea los ficheros de la propia instalación: no puede
  reconstruir el código mientras se está ejecutando.

  Habla con la aplicación mediante una carpeta de control (la misma idea que
  deploy/docker/vigilante.sh, para no duplicar lógica ni formato):

    * La aplicación escribe:
        comprobar      pide una comprobación inmediata
        actualizar     pide aplicar la actualización
    * El vigilante escribe:
        local.log, remoto.log, cambios.log, conteo.txt, rama.txt, comprobado.txt,
        error.txt, estado.txt y actualizacion.log

  Parámetros:
    -App               carpeta del código de la aplicación (raíz del repo taller-bicicletas).
    -Control           carpeta de control compartida con la aplicación (CONTROL_DIR).
    -RutaLanzadorTarea nombre de la tarea programada que arranca el servidor (por defecto «Taller»).
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$App,
  [Parameter(Mandatory = $true)][string]$Control,
  [string]$RutaLanzadorTarea = 'Taller'
)

$ErrorActionPreference = 'Continue'

# Separadores del formato de git log. Deben ser EXACTAMENTE los mismos que
# deploy/docker/vigilante.sh y que parsearGitLog() en la aplicación (0x1f y 0x1e).
$US = [char]0x1f
$RS = [char]0x1e
$FORMATO = '%H%x1f%h%x1f%cI%x1f%s%x1e'   # git interpreta %x1f / %x1e: sin caracteres de control en la línea de comandos

# Los mensajes de git salen en UTF-8; forzamos la consola para no corromper los acentos
# al capturar la salida.
try {
  [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
  $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
} catch { }

$script:App = ([System.IO.Path]::GetFullPath($App)).TrimEnd('\')
$script:Control = ([System.IO.Path]::GetFullPath($Control)).TrimEnd('\')
$script:Carpeta = Split-Path -Parent $script:Control
$script:Logs = Join-Path $script:Carpeta 'logs'
$script:LogVigilante = Join-Path $script:Logs 'vigilante.log'
$script:LogActualizacion = Join-Path $script:Control 'actualizacion.log'
$script:RutaDetener = Join-Path $script:Carpeta 'detener.txt'
$script:Cada = 1800   # comprobación propia cada 30 minutos

function Escribir-VigilanteLog {
  param([string]$Texto)
  try {
    if (-not (Test-Path -LiteralPath $script:Logs)) { New-Item -ItemType Directory -Force -Path $script:Logs | Out-Null }
    $linea = '[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] ' + $Texto + "`r`n"
    [System.IO.File]::AppendAllText($script:LogVigilante, $linea, (New-Object System.Text.UTF8Encoding($false)))
  } catch { }
}

# Escribe un fichero de control en UTF-8 SIN BOM (para conservar los separadores 0x1f y 0x1e).
function Escribir-Control {
  param([string]$Nombre, [string]$Texto)
  [System.IO.File]::WriteAllText((Join-Path $script:Control $Nombre), $Texto, (New-Object System.Text.UTF8Encoding($false)))
}

# Añade una línea de progreso a actualizacion.log (lo que ve el usuario en la aplicación).
function Anota {
  param([string]$Texto)
  try {
    $linea = '[' + (Get-Date -Format 'HH:mm:ss') + '] ' + $Texto + "`n"
    [System.IO.File]::AppendAllText($script:LogActualizacion, $linea, (New-Object System.Text.UTF8Encoding($false)))
  } catch { }
}

function Ahora { return (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz') }

# Ejecuta git sobre el repositorio de la aplicación y devuelve código, salida y error.
function Invoke-Git {
  param([string[]]$Argumentos)
  $errFile = Join-Path $script:Control 'error.tmp'
  $salida = & git -c core.quotepath=false -C $script:App @Argumentos 2> $errFile
  $codigo = $LASTEXITCODE
  $texto = ''
  if ($null -ne $salida) { $texto = (@($salida) | ForEach-Object { [string]$_ }) -join "`n" }
  $errorTexto = ''
  if (Test-Path -LiteralPath $errFile) {
    $errorTexto = [string](Get-Content -LiteralPath $errFile -Raw -ErrorAction SilentlyContinue)
    Remove-Item -LiteralPath $errFile -Force -ErrorAction SilentlyContinue
  }
  return [pscustomobject]@{ Ok = ($codigo -eq 0); Codigo = $codigo; Salida = $texto; Error = ($errorTexto -replace "`r?`n", ' ').Trim() }
}

# Carpeta de datos (donde se guardan la base de datos y las copias), leída de .env.
function Get-DataDir {
  $dir = './data'
  $env = Join-Path $script:App '.env'
  if (Test-Path -LiteralPath $env) {
    foreach ($l in (Get-Content -LiteralPath $env -ErrorAction SilentlyContinue)) {
      if ($l -match '^\s*DATA_DIR\s*=\s*"?([^"]+?)"?\s*$') { $dir = $matches[1].Trim() }
    }
  }
  if ([System.IO.Path]::IsPathRooted($dir)) { return $dir.TrimEnd('\') }
  return ([System.IO.Path]::GetFullPath((Join-Path $script:App $dir))).TrimEnd('\')
}

function Get-Puerto {
  $p = 3001
  $env = Join-Path $script:App '.env'
  if (Test-Path -LiteralPath $env) {
    foreach ($l in (Get-Content -LiteralPath $env -ErrorAction SilentlyContinue)) {
      if ($l -match '^\s*PORT\s*=\s*(\d+)') { $p = [int]$matches[1] }
    }
  }
  return $p
}


function Puerto-Ocupado {
  param([int]$P)
  try {
    $c = Get-NetTCPConnection -LocalPort $P -State Listen -ErrorAction SilentlyContinue
    return [bool]$c
  } catch { return $false }
}

function Esperar-PuertoLibre {
  param([int]$P, [int]$Segundos = 20)
  $fin = (Get-Date).AddSeconds($Segundos)
  while ((Get-Date) -lt $fin) {
    if (-not (Puerto-Ocupado $P)) { return $true }
    Start-Sleep -Seconds 1
  }
  return (-not (Puerto-Ocupado $P))
}

# Detiene el servidor: para la tarea «Taller» (y con ella el lanzador y node) y, por si
# acaso, mata cualquier node que siga apuntando a la aplicación. Espera a que se libere el puerto.
function Detener-Servicio {
  try { [System.IO.File]::WriteAllText($script:RutaDetener, (Ahora), (New-Object System.Text.UTF8Encoding($false))) } catch { }
  $t = Get-ScheduledTask -TaskName $RutaLanzadorTarea -ErrorAction SilentlyContinue
  if ($t) { Stop-ScheduledTask -TaskName $RutaLanzadorTarea -ErrorAction SilentlyContinue }
  $patron = [regex]::Escape($script:App)
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and ($_.CommandLine -match $patron) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and ($_.CommandLine -match 'iniciar-taller\.cmd') } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  if (-not (Esperar-PuertoLibre (Get-Puerto) 20)) {
    Escribir-VigilanteLog 'Aviso: el puerto no se liberó en 20 s; se continúa con la actualización.'
  }
}

function Arrancar-Servicio {
  try { Remove-Item -LiteralPath $script:RutaDetener -Force -ErrorAction SilentlyContinue } catch { }
  $t = Get-ScheduledTask -TaskName $RutaLanzadorTarea -ErrorAction SilentlyContinue
  if ($t) { Start-ScheduledTask -TaskName $RutaLanzadorTarea -ErrorAction SilentlyContinue }
}

# Ejecuta un comando dentro de la carpeta de la aplicación y lo vuelca en actualizacion.log.
function Ejecutar-EnApp {
  param([string]$Comando)
  $salida = & cmd.exe /c ('cd /d "{0}" && {1}' -f $script:App, $Comando) 2>&1
  $codigo = $LASTEXITCODE
  if ($salida) { foreach ($l in @($salida)) { Anota ('   ' + [string]$l) } }
  if ($codigo -ne 0) { throw ("Falló «$Comando» (código $codigo).") }
}

# ¿Algún fichero cambiado afecta a las dependencias? Entonces hay que reinstalarlas.
function Cambiaron-Dependencias {
  param([string[]]$Archivos)
  foreach ($a in @($Archivos)) {
    if ($a -match '(^|[\\/])(package\.json|package-lock\.json)$') { return $true }
  }
  return $false
}


# Comprueba GitHub y publica el estado en la carpeta de control.
function Hacer-Comprobacion {
  $ramaRes = Invoke-Git @('rev-parse', '--abbrev-ref', 'HEAD')
  $rama = 'main'
  if ($ramaRes.Ok -and $ramaRes.Salida.Trim()) { $rama = $ramaRes.Salida.Trim() }
  $fetch = Invoke-Git @('fetch', '--quiet', 'origin', $rama)
  if ($fetch.Ok) {
    Escribir-Control 'rama.txt' ($rama + "`n")
    Escribir-Control 'local.log' (Invoke-Git @('log', '-1', ('--pretty=format:' + $FORMATO), 'HEAD')).Salida
    Escribir-Control 'remoto.log' (Invoke-Git @('log', '-1', ('--pretty=format:' + $FORMATO), ('origin/' + $rama))).Salida
    Escribir-Control 'cambios.log' (Invoke-Git @('log', '-50', ('--pretty=format:' + $FORMATO), ('HEAD..origin/' + $rama))).Salida
    Escribir-Control 'conteo.txt' (((Invoke-Git @('rev-list', '--left-right', '--count', ('HEAD...origin/' + $rama))).Salida.Trim()) + "`n")
    Escribir-Control 'error.txt' ''
  } else {
    Escribir-Control 'error.txt' ('git fetch falló: ' + $fetch.Error)
  }
  Escribir-Control 'comprobado.txt' ((Ahora) + "`n")
}

# Aplica la actualización completa: copia, descarga, dependencias, base de datos y compilación.
function Hacer-Actualizacion {
  Remove-Item -LiteralPath (Join-Path $script:Control 'actualizar') -Force -ErrorAction SilentlyContinue
  Escribir-Control 'estado.txt' ('ejecutando|' + (Ahora))
  [System.IO.File]::WriteAllText($script:LogActualizacion, '', (New-Object System.Text.UTF8Encoding($false)))
  $shaAntes = $null
  $mergeHecho = $false
  $archivos = @()
  try {
    $ramaRes = Invoke-Git @('rev-parse', '--abbrev-ref', 'HEAD')
    if (-not $ramaRes.Ok) { throw 'No se pudo leer la rama del repositorio.' }
    $rama = $ramaRes.Salida.Trim()
    $shaAntes = (Invoke-Git @('rev-parse', 'HEAD')).Salida.Trim()
    if (-not $shaAntes) { throw 'No se pudo leer la versión instalada.' }

    Anota '▶ Copia de seguridad de la base de datos…'
    $db = Join-Path $script:App 'prisma\dev.db'
    $dirBackup = Join-Path (Get-DataDir) 'backups'
    if (-not (Test-Path -LiteralPath $dirBackup)) { New-Item -ItemType Directory -Force -Path $dirBackup | Out-Null }
    if (Test-Path -LiteralPath $db) {
      $copia = Join-Path $dirBackup ('backup-pre-update-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.db')
      Copy-Item -LiteralPath $db -Destination $copia -Force
      Anota ('✔ Copia creada: ' + $copia)
    } else {
      Anota '⚠ No existe la base de datos; se continúa sin copia.'
    }

    Anota '▶ Deteniendo el servidor…'
    Detener-Servicio

    $sucio = (Invoke-Git @('status', '--porcelain', '--untracked-files=no')).Salida
    if ($sucio.Trim()) { throw 'Hay cambios locales sin confirmar en el repositorio; no se actualiza.' }

    if (-not (Invoke-Git @('fetch', '--quiet', 'origin', $rama)).Ok) { throw 'git fetch falló.' }

    $conteo = (Invoke-Git @('rev-list', '--left-right', '--count', ('HEAD...origin/' + $rama))).Salida
    $atras = 0
    if ($conteo -match '(\d+)\s+(\d+)') { $atras = [int]$matches[2] }
    if ($atras -eq 0) { throw 'No hay actualizaciones disponibles.' }

    $archivos = @((Invoke-Git @('diff', '--name-only', 'HEAD', ('origin/' + $rama))).Salida -split "`n" | Where-Object { $_.Trim() -ne '' })

    Anota '▶ Descargando cambios…'
    if (-not (Invoke-Git @('merge', '--ff-only', ('origin/' + $rama))).Ok) { throw 'git merge --ff-only falló.' }
    $mergeHecho = $true
    $shaNuevo = (Invoke-Git @('rev-parse', '--short', 'HEAD')).Salida.Trim()

    if (Cambiaron-Dependencias $archivos) {
      Anota '▶ Instalando dependencias (npm ci)…'
      Ejecutar-EnApp 'npm ci --include=dev'
    } else {
      Anota '✔ Sin cambios en las dependencias; se omite npm ci.'
    }

    Anota '▶ Actualizando la base de datos…'
    Ejecutar-EnApp 'node node_modules\prisma\build\index.js db push'

    Anota '▶ Compilando la aplicación…'
    Ejecutar-EnApp 'npm run build'

    Arrancar-Servicio
    Escribir-Control 'estado.txt' ('ok|' + (Ahora) + '|' + $shaNuevo)
    Anota ('✔ Actualizado a ' + $shaNuevo)
    Escribir-VigilanteLog ('Actualización correcta (' + $shaNuevo + ').')
  } catch {
    $mensaje = $_.Exception.Message
    Anota ('✖ ' + $mensaje)
    if ($mergeHecho -and $shaAntes) {
      Anota ('▶ Revirtiendo a la versión anterior (' + $shaAntes.Substring(0, 7) + ')…')
      try {
        if (-not (Invoke-Git @('reset', '--hard', $shaAntes)).Ok) { throw 'git reset --hard falló.' }
        if (Cambiaron-Dependencias $archivos) { Ejecutar-EnApp 'npm ci --include=dev' }
        Ejecutar-EnApp 'npm run build'
      } catch {
        Anota ('✖ No se pudo revertir del todo: ' + $_.Exception.Message)
      }
    }
    Arrancar-Servicio
    $seguro = ($mensaje -replace '\|', '/')
    Escribir-Control 'estado.txt' ('error|' + (Ahora) + '|' + $seguro)
    Escribir-VigilanteLog ('Actualización fallida: ' + $mensaje)
  }
  Hacer-Comprobacion
}

# --- Arranque ---
if (-not (Test-Path -LiteralPath $script:Control)) { New-Item -ItemType Directory -Force -Path $script:Control | Out-Null }
Escribir-VigilanteLog 'Vigilante iniciado.'

$epoch = Get-Date '1970-01-01'
while ($true) {
  try {
    if (Test-Path -LiteralPath (Join-Path $script:Control 'actualizar')) { Hacer-Actualizacion }
    if (Test-Path -LiteralPath (Join-Path $script:Control 'comprobar')) {
      Remove-Item -LiteralPath (Join-Path $script:Control 'comprobar') -Force -ErrorAction SilentlyContinue
      Hacer-Comprobacion
    }
    $comprobado = Join-Path $script:Control 'comprobado.txt'
    $ultima = 0
    if (Test-Path -LiteralPath $comprobado) { $ultima = [int][double](((Get-Item -LiteralPath $comprobado).LastWriteTime) - $epoch).TotalSeconds }
    $ahora = [int][double](((Get-Date) - $epoch).TotalSeconds)
    if (($ahora - $ultima) -ge $script:Cada) { Hacer-Comprobacion }
  } catch {
    Escribir-VigilanteLog ('Error en el bucle del vigilante: ' + $_.Exception.Message)
  }
  Start-Sleep -Seconds 3
}

