#Requires -Version 5.1
<#
  Instalador de «Taller» para Windows 10/11.
  Convierte este PC en el servidor de la aplicación para la red local del taller:
  instala Node.js y Git si faltan, descarga la aplicación, prepara la base de datos,
  la deja arrancando sola con Windows, abre el puerto en el firewall, programa una
  copia de seguridad diaria y crea un acceso directo en el escritorio.

  Uso normal (doble clic, se eleva solo):  instalar.ps1  (menú de la raíz)
  Directo:   powershell -NoProfile -ExecutionPolicy Bypass -File instalar-windows.ps1
  Prueba sin cambiar nada:  ... -File instalar-windows.ps1 -Simular -SinPreguntas

  Parámetros:
    -Carpeta        Carpeta de instalación (por defecto C:\Taller).
    -Puerto         Puerto de la aplicación (por defecto 3001).
    -CarpetaCopias  Carpeta de las copias diarias (por defecto <Carpeta>\copias).
    -Repositorio    Repositorio git (por defecto https://github.com/catlinux/Taller.git).
    -SinPreguntas   Usa los valores por defecto sin preguntar.
    -Simular        No cambia nada: solo muestra lo que haría.
    -Desinstalar    Quita tareas, firewall, acceso directo y código del servicio.
    -BorrarDatos    Solo con -Desinstalar: borra también la carpeta de instalación.
#>
[CmdletBinding()]
param(
  [string]$Carpeta = 'C:\Taller',
  [int]$Puerto = 3001,
  [string]$CarpetaCopias = '',
  [string]$Repositorio = 'https://github.com/catlinux/Taller.git',
  [switch]$SinPreguntas,
  [switch]$Simular,
  [switch]$Desinstalar,
  [switch]$BorrarDatos
)

$ErrorActionPreference = 'Stop'

# --- Mensajes con color, en español y sin jerga técnica. ---
function EscribirLinea {
  param([string]$Texto = '', [string]$Color = 'Gray')
  Write-Host $Texto -ForegroundColor $Color
}
function Titulo {
  param([string]$Texto)
  Write-Host ''
  Write-Host "== $Texto ==" -ForegroundColor Cyan
}
function Paso {
  param([string]$Texto)
  Write-Host "> $Texto" -ForegroundColor White
}
function Aviso {
  param([string]$Texto)
  Write-Host "AVISO: $Texto" -ForegroundColor Yellow
}
function ErrorFatal {
  param([string]$Texto)
  Write-Host ''
  Write-Host "ERROR: $Texto" -ForegroundColor Red
  exit 1
}
function Simula {
  param([string]$Texto)
  Write-Host "[SIMULACION] $Texto" -ForegroundColor DarkGray
}
function Hacer {
  param([string]$Descripcion, [scriptblock]$Accion)
  if ($Simular) {
    Simula $Descripcion
    return
  }
  Paso $Descripcion
  & $Accion
}

# Genera un secreto aleatorio de 48 bytes en hexadecimal (criptográficamente seguro).
function Generar-Secreto {
  $bytes = New-Object 'byte[]' 48
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  return (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
}

# --- Seguridad de las rutas ---
# ¿Es una ruta que nunca hay que tocar: raíz de una unidad, ruta de red o carpeta del
# sistema (C:\Windows, C:\Program Files, C:\Users y sus perfiles, etc.)? Se usa tanto
# para validar -Carpeta al instalar como para el borrado seguro al desinstalar.
function Test-RutaPeligrosa {
  param([string]$Ruta)
  if (-not $Ruta) { return $true }
  try { $completa = [System.IO.Path]::GetFullPath($Ruta).TrimEnd('\') } catch { return $true }
  if ($completa -match '^[A-Za-z]:$') { return $true }          # raíz de unidad (C:\)
  if ($completa -match '^\\\\') { return $true }                # ruta de red (\\servidor\...)
  $nombres = @($completa.Split('\') | Where-Object { $_ -ne '' -and $_ -notmatch '^[A-Za-z]:$' } |
    ForEach-Object { $_.ToLowerInvariant() })
  $prohibidas = @('windows', 'program files', 'program files (x86)', 'programdata', 'users',
    'appdata', 'system volume information', 'perflogs', 'recovery', '$recycle.bin')
  foreach ($n in $nombres) {
    if ($prohibidas -contains $n) { return $true }
  }
  $iguales = @($env:SystemRoot, $env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:ProgramData, $env:USERPROFILE, $env:PUBLIC) |
    Where-Object { $_ } | ForEach-Object { $_.TrimEnd('\').ToLowerInvariant() }
  if ($iguales -contains $completa.ToLowerInvariant()) { return $true }
  return $false
}

# Decide si una carpeta se puede borrar sin riesgo: nunca una raíz de disco ni una
# carpeta del sistema, y solo si parece una instalación de Taller (tiene el lanzador
# Y la aplicación dentro). Así, aunque -Carpeta llegue mal, no se borra de más.
function Test-CarpetaBorrable {
  param([string]$Ruta)
  if (Test-RutaPeligrosa $Ruta) { return $false }
  $completa = [System.IO.Path]::GetFullPath($Ruta).TrimEnd('\')
  $nombres = @($completa.Split('\') | Where-Object { $_ -ne '' -and $_ -notmatch '^[A-Za-z]:$' })
  # Al menos 2 niveles, o un único nivel cuyo nombre acabe en «taller» (p. ej. C:\Taller).
  if ($nombres.Count -lt 2) {
    if (-not ($nombres.Count -eq 1 -and $nombres[0] -match 'taller')) { return $false }
  }
  $lanzador = Test-Path -LiteralPath (Join-Path $completa 'iniciar-taller.cmd')
  $app = Test-Path -LiteralPath (Join-Path $completa 'app\taller-bicicletas')
  return ($lanzador -and $app)
}

# --- Bloqueos de ficheros ---
# En Windows, un node en marcha bloquea node_modules y la base de datos (el motor de
# Prisma): hay que parar la tarea, el lanzador y el servidor antes de actualizar,
# reinstalar o desinstalar. Se deja un fichero «detener» para que el bucle del
# lanzador no vuelva a arrancarlo mientras tanto.
# Espera (hasta `Segundos`) a que el puerto quede libre.
function Esperar-PuertoLibre {
  param([int]$P, [int]$Segundos = 20)
  $fin = (Get-Date).AddSeconds($Segundos)
  while ((Get-Date) -lt $fin) {
    if (-not (Puerto-Ocupado $P)) { return $true }
    Start-Sleep -Seconds 1
  }
  return (-not (Puerto-Ocupado $P))
}

function Detener-Servidor {
  if ($Simular) {
    Simula 'Pararía el servidor y el vigilante (tareas «Taller» y «Taller vigilante», lanzador y node) antes de tocar sus ficheros, y esperaría a que se libere el puerto.'
    return
  }
  [System.IO.File]::WriteAllText($script:RutaDetener, (Get-Date).ToString('s'), (New-Object System.Text.ASCIIEncoding))
  foreach ($nombre in @($script:NombreTarea, $script:NombreTareaVigilante)) {
    $t = Get-ScheduledTask -TaskName $nombre -ErrorAction SilentlyContinue
    if ($t) { Stop-ScheduledTask -TaskName $nombre -ErrorAction SilentlyContinue }
  }
  # Termina el servidor y el lanzador si siguen vivos (bloquean node_modules o dev.db).
  $patronApp = [regex]::Escape($script:RutaAppTaller)
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and ($_.CommandLine -match $patronApp) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and ($_.CommandLine -match 'iniciar-taller\.cmd') } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  if (-not (Esperar-PuertoLibre $script:Puerto 20)) {
    Aviso "El puerto $($script:Puerto) sigue ocupado; puede que otro programa lo esté usando."
  }
}

function Reanudar-Servidor {
  if ($Simular) { Simula 'Quitaría la marca de parada y arrancaría el servidor del taller.'; return }
  if (Test-Path -LiteralPath $script:RutaDetener) { Remove-Item -LiteralPath $script:RutaDetener -Force -ErrorAction SilentlyContinue }
  $t = Get-ScheduledTask -TaskName $script:NombreTarea -ErrorAction SilentlyContinue
  if ($t) { Start-ScheduledTask -TaskName $script:NombreTarea }
}

# --- Permisos del .env (contiene el JWT_SECRET) ---
# Se restringe a SYSTEM y a los administradores. Se usan los SID conocidos para no
# depender del idioma de Windows (Administradores/Sistema se llaman distinto en cada uno).
function Proteger-FicheroEnv {
  param([string]$Ruta)
  if ($Simular) { Simula "Restringiría los permisos de $Ruta (solo SYSTEM y administradores)."; return }
  # Equivale a: icacls <ruta> /inheritance:r /grant:r "SYSTEM:(F)" "Administrators:(F)"
  # (se usan los SID para no depender del idioma de Windows).
  & icacls $Ruta /inheritance:r /grant:r '*S-1-5-18:(F)' '*S-1-5-32-544:(F)' *> $null
}

# --- Pausa final ---
# Al hacer doble clic, la ventana se cerraría antes de poder leer el resumen. Se espera
# una tecla salvo en modo simulación o sin preguntas (los usos automatizados).
function Pausar-Final {
  if ($Simular -or $SinPreguntas) { return }
  if (-not [Environment]::UserInteractive) { return }
  Write-Host ''
  Read-Host 'Pulsa Enter para cerrar esta ventana' | Out-Null
}

# --- Permisos de administrador ---
function Test-Administrador {
  $identidad = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identidad)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Relanzar-Elevado {
  $partes = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $PSCommandPath),
    '-Carpeta', ('"{0}"' -f $Carpeta), '-Puerto', $Puerto, '-Repositorio', ('"{0}"' -f $Repositorio))
  if ($CarpetaCopias) { $partes += @('-CarpetaCopias', ('"{0}"' -f $CarpetaCopias)) }
  if ($SinPreguntas) { $partes += '-SinPreguntas' }
  if ($Desinstalar) { $partes += '-Desinstalar' }
  if ($BorrarDatos) { $partes += '-BorrarDatos' }
  EscribirLinea 'Se necesitan permisos de administrador; abriendo una ventana elevada…' Yellow
  Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList ($partes -join ' ') | Out-Null
  exit 0
}

# --- Comprobación de programas (Node.js y Git) ---
function Obtener-MajorNode {
  try {
    $salida = (& node --version 2>$null)
    if ($salida -match '^v(\d+)\.') { return [int]$matches[1] }
  } catch { }
  return 0
}
function Test-Git {
  return [bool](Get-Command git -ErrorAction SilentlyContinue)
}
function Refrescar-Path {
  $maquina = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $usuario = [Environment]::GetEnvironmentVariable('Path', 'User')
  $partes = @($maquina, $usuario) | Where-Object { $_ }
  $env:Path = ($partes -join ';')
}

# Asegura Node.js >= 20 y Git. Los instala con winget si faltan; si no hay winget, para con ayuda.
function Asegurar-Programas {
  $major = Obtener-MajorNode
  $hayGit = Test-Git
  if ($major -ge 20 -and $hayGit) {
    EscribirLinea ('  Node.js: ' + (& node --version) + '   ·   Git: ' + (& git --version)) DarkGray
    return
  }

  if ($Simular) {
    if ($major -lt 20) { Simula 'Instalaría Node.js LTS con winget (OpenJS.NodeJS.LTS).' }
    if (-not $hayGit) { Simula 'Instalaría Git con winget (Git.Git).' }
    if ($major -lt 20 -or -not $hayGit) { Simula 'Refrescaría el PATH de esta ventana y volvería a comprobar Node.js y Git.' }
    return
  }

  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    Aviso 'Falta Node.js o Git y este Windows no trae winget.'
    EscribirLinea '  Instálalos a mano y vuelve a ejecutar este instalador:' Red
    EscribirLinea '    · Node.js 20 o superior:  https://nodejs.org' Red
    EscribirLinea '    · Git:                    https://git-scm.com' Red
    ErrorFatal 'Faltan programas necesarios (Node.js >= 20 y Git).'
  }

  if ($major -lt 20) {
    Paso 'Instalando Node.js LTS con winget…'
    & winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { ErrorFatal 'No se pudo instalar Node.js con winget. Instálalo desde https://nodejs.org y vuelve a intentarlo.' }
    Refrescar-Path
  }
  if (-not (Test-Git)) {
    Paso 'Instalando Git con winget…'
    & winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { ErrorFatal 'No se pudo instalar Git con winget. Instálalo desde https://git-scm.com y vuelve a intentarlo.' }
    Refrescar-Path
  }

  $major = Obtener-MajorNode
  if ($major -lt 20 -or -not (Test-Git)) {
    Refrescar-Path
    $major = Obtener-MajorNode
    if ($major -lt 20 -or -not (Test-Git)) {
      ErrorFatal 'Tras instalar, Node.js o Git siguen sin detectarse. Cierra esta ventana, abre otra y vuelve a ejecutar el instalador.'
    }
  }
  EscribirLinea ('  Node.js: ' + (& node --version) + '   ·   Git: ' + (& git --version)) DarkGray
}


# --- Preguntas al usuario (Enter = valor por defecto) ---
function Puerto-Ocupado {
  param([int]$P)
  try {
    $c = Get-NetTCPConnection -LocalPort $P -State Listen -ErrorAction SilentlyContinue
    return [bool]$c
  } catch { return $false }
}

function Pedir-Datos {
  if ($SinPreguntas) { return }
  Titulo 'Configuración'
  EscribirLinea 'Pulsa Enter para aceptar lo que aparece entre corchetes.' DarkGray

  while ($true) {
    $resp = Read-Host "Carpeta de instalación [$Carpeta]"
    if ($resp) { $script:Carpeta = $resp.Trim().TrimEnd('\') }
    if (-not $script:Carpeta) { Aviso 'Escribe una carpeta válida.'; continue }
    break
  }

  while ($true) {
    $resp = Read-Host "Puerto para la aplicación (1024-65535) [$Puerto]"
    if ($resp) {
      $n = 0
      if (-not [int]::TryParse($resp.Trim(), [ref]$n) -or $n -lt 1024 -or $n -gt 65535) {
        Aviso 'Escribe un número entre 1024 y 65535.'; continue
      }
      $script:Puerto = $n
    }
    if (Puerto-Ocupado $script:Puerto) {
      Aviso ("El puerto {0} ya está ocupado por otro programa. Prueba con {1}." -f $script:Puerto, ($script:Puerto + 1))
      continue
    }
    break
  }

  $defCopias = Join-Path $script:Carpeta 'copias'
  EscribirLinea 'Se recomienda guardar las copias en OTRO disco, un USB o una carpeta de la nube.' Yellow
  $resp = Read-Host "Carpeta para las copias diarias [$defCopias]"
  if ($resp) { $script:CarpetaCopias = $resp.Trim().TrimEnd('\') } else { $script:CarpetaCopias = $defCopias }
}


# --- Rutas derivadas ---
function Definir-Rutas {
  $script:CarpetaApp = Join-Path $script:Carpeta 'app'
  $script:CarpetaLogs = Join-Path $script:Carpeta 'logs'
  $script:RutaAppTaller = Join-Path $script:CarpetaApp 'taller-bicicletas'
  $script:RutaEnv = Join-Path $script:RutaAppTaller '.env'
  $script:RutaBaseDatos = Join-Path $script:RutaAppTaller 'prisma\dev.db'
  $script:RutaLanzador = Join-Path $script:Carpeta 'iniciar-taller.cmd'
  $script:RutaCopia = Join-Path $script:Carpeta 'copia-diaria.ps1'
  $script:CarpetaControl = Join-Path $script:Carpeta 'control'
  $script:RutaVigilante = Join-Path $script:RutaAppTaller 'deploy\windows\vigilante.ps1'
  $script:RutaDetener = Join-Path $script:Carpeta 'detener.txt'
  $script:LogTaller = Join-Path $script:CarpetaLogs 'taller.log'
  $script:LogCopia = Join-Path $script:CarpetaLogs 'copia.log'
  $script:LogVigilante = Join-Path $script:CarpetaLogs 'vigilante.log'
  $script:NombreTarea = 'Taller'
  $script:NombreTareaCopia = 'Taller copia diaria'
  $script:NombreTareaVigilante = 'Taller vigilante'
  $script:NombreRegla = ("Taller (puerto {0})" -f $script:Puerto)
  $script:RutaAcceso = Join-Path $env:PUBLIC 'Desktop\Taller.url'
  $script:RutaLeeme = Join-Path $script:Carpeta 'LEEME-acceso.txt'
}

# --- Obtener el código de la aplicación ---
function Obtener-Codigo {
  if (Test-Path -LiteralPath $script:CarpetaApp) {
    if (Test-Path -LiteralPath (Join-Path $script:CarpetaApp '.git')) {
      Hacer "Actualizando el código existente en $($script:CarpetaApp) (git fetch + merge --ff-only)…" {
        & git -C $script:CarpetaApp fetch --quiet origin main
        if ($LASTEXITCODE -ne 0) { ErrorFatal 'No se pudo descargar del repositorio (git fetch).' }
        & git -C $script:CarpetaApp merge --ff-only origin/main
        if ($LASTEXITCODE -ne 0) { Aviso 'No se pudo avanzar automáticamente (git merge --ff-only); se continúa con el código actual.' }
      }
    } else {
      ErrorFatal "La carpeta $($script:CarpetaApp) ya existe y no es un repositorio git. Muévela o bórrala y vuelve a intentarlo."
    }
  } else {
    Hacer "Clonando la aplicación en $($script:CarpetaApp)…" {
      New-Item -ItemType Directory -Force -Path $script:Carpeta | Out-Null
      & git clone --branch main $Repositorio $script:CarpetaApp
      if ($LASTEXITCODE -ne 0) { ErrorFatal 'No se pudo clonar el repositorio (git clone).' }
    }
  }

  $rutaNormal = $script:CarpetaApp -replace '\\', '/'
  Hacer "Añadiendo $rutaNormal a git safe.directory (para el servicio)…" {
    & git config --system --add safe.directory $rutaNormal
  }
}

# --- Crear o actualizar el fichero .env ---
function Crear-Actualizar-Env {
  if (Test-Path -LiteralPath $script:RutaEnv) {
    EscribirLinea '  Ya existe .env; se conserva (incluido su JWT_SECRET).' DarkGray
    $lineas = Get-Content -LiteralPath $script:RutaEnv
    $encontrado = $false
    $nuevas = @(foreach ($l in $lineas) {
      if ($l -match '^\s*PORT\s*=') { $encontrado = $true; "PORT=$($script:Puerto)" } else { $l }
    })
    if (-not $encontrado) { $nuevas += "PORT=$($script:Puerto)" }
    Hacer 'Actualizando la línea PORT del .env…' {
      [System.IO.File]::WriteAllText($script:RutaEnv, (($nuevas -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))
    }
    Proteger-FicheroEnv $script:RutaEnv
    return
  }

  $secreto = Generar-Secreto
  $contenido = 'DATABASE_URL="file:./dev.db"' + "`n" + "PORT=$($script:Puerto)" + "`n" + "JWT_SECRET=$secreto" + "`n" + 'DATA_DIR="./data"' + "`n"
  if ($Simular) {
    Simula "Crearía $($script:RutaEnv) con:"
    EscribirLinea '    DATABASE_URL="file:./dev.db"' DarkGray
    EscribirLinea "    PORT=$($script:Puerto)" DarkGray
    EscribirLinea '    JWT_SECRET=<48 bytes aleatorios en hexadecimal>' DarkGray
    EscribirLinea '    DATA_DIR="./data"' DarkGray
    Simula "Y restringiría los permisos de $($script:RutaEnv) (solo SYSTEM y administradores)."
    return
  }
  Paso 'Creando el fichero .env con un JWT_SECRET nuevo…'
  [System.IO.File]::WriteAllText($script:RutaEnv, $contenido, (New-Object System.Text.UTF8Encoding($false)))
  EscribirLinea '  .env creado (UTF-8 sin BOM).' DarkGray
  Proteger-FicheroEnv $script:RutaEnv
}

# --- Ejecutar un paso de instalación de la app con registro en el log ---
function Ejecutar-EnApp {
  param([string]$Descripcion, [string]$LineaComando, [string]$Log)
  Paso $Descripcion
  $comando = 'cd /d "{0}" && {1}' -f $script:RutaAppTaller, $LineaComando
  $salida = & cmd.exe /c $comando 2>&1
  $codigo = $LASTEXITCODE
  if ($salida) { $salida | ForEach-Object { Write-Host ("   " + $_) -ForegroundColor DarkGray } }
  if ($salida) { ($salida | Out-String) | Add-Content -LiteralPath $Log -Encoding UTF8 }
  if ($codigo -ne 0) { ErrorFatal "Falló el paso «$Descripcion» (código $codigo). Revisa el registro: $Log" }
}

function Ejecutar-PasosApp {
  $marca = Get-Date -Format 'yyyyMMdd-HHmmss'
  $log = Join-Path $script:CarpetaLogs ("instalacion-$marca.log")
  if ($Simular) {
    Simula "Ejecutaría, en $($script:RutaAppTaller) (registro en $log):"
    EscribirLinea '    npm ci --include=dev' DarkGray
    EscribirLinea '    node node_modules/prisma/build/index.js db push' DarkGray
    EscribirLinea '    npm run db:seed' DarkGray
    EscribirLinea '    npm run build' DarkGray
    return
  }
  New-Item -ItemType Directory -Force -Path $script:CarpetaLogs | Out-Null
  Ejecutar-EnApp 'Instalando dependencias (npm ci)…' 'npm ci --include=dev' $log
  Ejecutar-EnApp 'Creando o actualizando la base de datos…' 'node node_modules\prisma\build\index.js db push' $log
  Ejecutar-EnApp 'Cargando usuarios y datos iniciales…' 'npm run db:seed' $log
  Ejecutar-EnApp 'Compilando la aplicación…' 'npm run build' $log
}


# --- Lanzador con bucle (se reinicia solo tras actualizar o si falla) ---
function Crear-Lanzador {
  $plantilla = @'
@echo off
setlocal
set NODE_ENV=production
set ACTUALIZACIONES=externo
set CONTROL_DIR=__CONTROL__
if not exist "__LOGS__" mkdir "__LOGS__"
cd /d "__APP__"
set INTENTOS=0
set ANTERIOR=0
:reiniciar
if exist "__DETENER__" goto salir
if exist "__LOG__" for %%A in ("__LOG__") do if %%~zA GTR 5242880 move /y "__LOG__" "__LOG__.1" >nul 2>&1
node --env-file=.env "__APP__\server\index.js" >> "__LOG__" 2>&1
rem --- Proteccion anti-bucle: si node sale mas de 5 veces seguidas en menos de 60 s, espera 60 s ---
for /f %%T in ('powershell -NoProfile -Command "[int][double](Get-Date -UFormat %%s)"') do set AHORA=%%T
if "%ANTERIOR%"=="0" set ANTERIOR=%AHORA%
set /a TRANSCURRIDO=AHORA-ANTERIOR
if %TRANSCURRIDO% LSS 60 (set /a INTENTOS+=1) else (set INTENTOS=0)
set ANTERIOR=%AHORA%
if %INTENTOS% GTR 5 (
  echo [%DATE% %TIME%] Demasiados reinicios seguidos; pausa de 60 s.>> "__LOG__"
  ping -n 61 127.0.0.1 >nul
  set INTENTOS=0
)
ping -n 4 127.0.0.1 >nul
goto reiniciar
:salir
'@
  $texto = $plantilla.Replace('__LOGS__', $script:CarpetaLogs).Replace('__APP__', $script:RutaAppTaller).Replace('__LOG__', $script:LogTaller).Replace('__CONTROL__', $script:CarpetaControl).Replace('__DETENER__', $script:RutaDetener)
  if ($Simular) {
    Simula "Crearía el lanzador $($script:RutaLanzador) (bucle que arranca la app y la reinicia al actualizar o si falla)."
    return
  }
  Paso "Creando el lanzador $($script:RutaLanzador)…"
  [System.IO.File]::WriteAllText($script:RutaLanzador, $texto, (New-Object System.Text.ASCIIEncoding))
}

# --- Tareas programadas ---
function Registrar-Tareas {
  if ($Simular) {
    Simula "Crearía la carpeta de control del vigilante $($script:CarpetaControl)."
    Simula "Registraría la tarea programada «$($script:NombreTarea)» (al encender el PC, cuenta SYSTEM, ventana oculta, reiniciar si falla) y la arrancaría ahora."
    Simula "Registraría la tarea programada «$($script:NombreTareaCopia)» (todos los días a las 03:00, cuenta SYSTEM)."
    Simula "Registraría la tarea programada «$($script:NombreTareaVigilante)» (al encender el PC, cuenta SYSTEM, oculta, sin límite de tiempo, reiniciar si falla) → powershell -File `"$($script:RutaVigilante)`", y la arrancaría ahora."
    return
  }

  # Carpeta compartida con la aplicación para las órdenes de actualización. SYSTEM
  # tiene permiso de escritura por defecto, así que no hace falta tocar los permisos.
  New-Item -ItemType Directory -Force -Path $script:CarpetaControl | Out-Null
  New-Item -ItemType Directory -Force -Path $script:CarpetaLogs | Out-Null

  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
  $ajustes.Hidden = $true

  Paso "Registrando la tarea «$($script:NombreTarea)» (arranca al encender el PC)…"
  $accion = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument ('/c "{0}"' -f $script:RutaLanzador)
  $disparador = New-ScheduledTaskTrigger -AtStartup
  Register-ScheduledTask -TaskName $script:NombreTarea -Action $accion -Trigger $disparador `
    -Principal $principal -Settings $ajustes -Force | Out-Null

  Paso "Registrando la tarea «$($script:NombreTareaCopia)» (copia diaria a las 03:00)…"
  $accionCopia = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $script:RutaCopia)
  $disparadorCopia = New-ScheduledTaskTrigger -Daily -At '03:00'
  Register-ScheduledTask -TaskName $script:NombreTareaCopia -Action $accionCopia -Trigger $disparadorCopia `
    -Principal $principal -Settings $ajustes -Force | Out-Null

  Paso "Registrando la tarea «$($script:NombreTareaVigilante)» (vigila las actualizaciones)…"
  $argumentosVig = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -App "{1}" -Control "{2}" -RutaLanzadorTarea "{3}"' -f `
    $script:RutaVigilante, $script:RutaAppTaller, $script:CarpetaControl, $script:NombreTarea
  $accionVig = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argumentosVig
  $disparadorVig = New-ScheduledTaskTrigger -AtStartup
  Register-ScheduledTask -TaskName $script:NombreTareaVigilante -Action $accionVig -Trigger $disparadorVig `
    -Principal $principal -Settings $ajustes -Force | Out-Null

  # Arranca el servidor (quitando antes la marca de parada) y el vigilante.
  Reanudar-Servidor
  Start-ScheduledTask -TaskName $script:NombreTareaVigilante
}


# --- Regla de firewall (solo red local) ---
function Registrar-Firewall {
  if ($Simular) {
    Simula "Crearía (o reemplazaría) la regla de firewall entrante «$($script:NombreRegla)»: TCP puerto $($script:Puerto), solo desde la red local."
    return
  }
  Paso "Abriendo el puerto $($script:Puerto) en el firewall (solo red local)…"
  Get-NetFirewallRule -DisplayName $script:NombreRegla -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  New-NetFirewallRule -DisplayName $script:NombreRegla -Direction Inbound -Action Allow -Protocol TCP `
    -LocalPort $script:Puerto -RemoteAddress LocalSubnet -Profile Any | Out-Null
}

# --- Copia de seguridad diaria (script + tarea) ---
function Crear-CopiaDiaria {
  $plantilla = @'
# Copia diaria de la base de datos del taller. Generado por el instalador.
$ErrorActionPreference = 'Continue'
$base = '__BASEDATOS__'
$destino = '__DESTINO__'
$log = '__LOGC__'
$dirLog = Split-Path -Parent $log
if (-not (Test-Path -LiteralPath $dirLog)) { New-Item -ItemType Directory -Force -Path $dirLog | Out-Null }
function Anota($t) { $linea = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $t; Add-Content -LiteralPath $log -Value $linea -Encoding UTF8 }
try {
  if (-not (Test-Path -LiteralPath $base)) { Anota "No existe la base de datos ($base); nada que copiar."; exit 1 }
  if (-not (Test-Path -LiteralPath $destino)) { New-Item -ItemType Directory -Force -Path $destino | Out-Null }
  $nombre = 'taller-' + (Get-Date -Format 'yyyyMMdd-HHmm') + '.db'
  $copia = Join-Path $destino $nombre
  Copy-Item -LiteralPath $base -Destination $copia -Force
  Anota "Copia creada: $copia"
  $viejas = Get-ChildItem -LiteralPath $destino -Filter 'taller-*.db' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 30
  foreach ($f in $viejas) { Remove-Item -LiteralPath $f.FullName -Force; Anota "Eliminada la copia antigua: $($f.Name)" }
  exit 0
} catch {
  Anota "ERROR en la copia diaria: $($_.Exception.Message)"
  exit 1
}
'@
  $texto = $plantilla.Replace('__BASEDATOS__', $script:RutaBaseDatos).Replace('__DESTINO__', $script:CarpetaCopias).Replace('__LOGC__', $script:LogCopia)
  if ($Simular) {
    Simula "Crearía $($script:RutaCopia): copia $($script:RutaBaseDatos) a $($script:CarpetaCopias)\taller-AAAAMMDD-HHmm.db y conserva las 30 más recientes."
    return
  }
  Paso "Creando el script de copia diaria $($script:RutaCopia)…"
  [System.IO.File]::WriteAllText($script:RutaCopia, $texto, (New-Object System.Text.UTF8Encoding($true)))
}


# --- Dirección IPv4 de la red local (la de la puerta de enlace) ---
function Obtener-IPv4Local {
  try {
    $config = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
      Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } |
      Select-Object -First 1
    if ($config -and $config.IPv4Address -and $config.IPv4Address.IPAddress) { return $config.IPv4Address.IPAddress }
  } catch { }
  try {
    $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -ne '127.0.0.1' -and $_.PrefixOrigin -ne 'WellKnown' } |
      Select-Object -First 1
    if ($ip) { return $ip.IPAddress }
  } catch { }
  return $null
}

# --- Acceso directo al escritorio público ---
function Crear-AccesoDirecto {
  $contenido = "[InternetShortcut]`r`nURL=http://localhost:$($script:Puerto)`r`n"
  if ($Simular) {
    Simula "Crearía el acceso directo $($script:RutaAcceso) a http://localhost:$($script:Puerto)."
    return
  }
  Paso 'Creando el acceso directo «Taller» en el escritorio (para todos los usuarios)…'
  [System.IO.File]::WriteAllText($script:RutaAcceso, $contenido, (New-Object System.Text.ASCIIEncoding))
}

# --- Esperar a que la aplicación responda ---
function Esperar-Servidor {
  param([int]$Segundos = 90)
  $url = "http://localhost:$($script:Puerto)/api/modo/publico"
  Paso "Esperando a que responda la aplicación ($url)…"
  $fin = (Get-Date).AddSeconds($Segundos)
  while ((Get-Date) -lt $fin) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
      if ($r.StatusCode -eq 200) { EscribirLinea '  La aplicación ya responde.' Green; return $true }
    } catch { Start-Sleep -Seconds 3 }
  }
  return $false
}

# --- Fichero LEEME con las direcciones y avisos ---
function Escribir-Leeme {
  $ip = Obtener-IPv4Local
  $nombrePc = $env:COMPUTERNAME
  $dirIp = ''
  if ($ip) { $dirIp = 'http://' + $ip + ':' + $script:Puerto }
  $plantilla = @'
TALLER - CÓMO ENTRAR DESDE OTROS EQUIPOS
========================================

Desde este mismo PC:
  __DIRLOCAL__

Desde los portátiles o tablets del taller (en la misma red wifi/cable):
  __DIRNOMBRE__
  __DIRIP__

Consejo: en el router, reserva una dirección IP fija para este PC (__IP__) para
que esas direcciones no cambien. Desde la red local la conexión es http (sin
candado); si el navegador avisa, es normal: se acepta y se continúa.

USUARIOS INICIALES (¡cámbialos YA en Configuración > Usuarios!):
  admin     / admin123
  mecanico  / mecanico123

COPIAS DE SEGURIDAD:
  __COPIAS__
Se hace una copia al día (a las 03:00) y también al arrancar la aplicación.

LOGS (por si algo va mal):
  __LOGS__\taller.log   (servidor)
  __LOGS__\copia.log    (copias)

ACTUALIZAR LA APLICACIÓN:
  Dentro de la aplicación: Configuración > Actualizaciones.
'@
  $texto = $plantilla.Replace('__DIRLOCAL__', "http://localhost:$($script:Puerto)").Replace('__DIRNOMBRE__', "http://$nombrePc`:$($script:Puerto)").Replace('__DIRIP__', $dirIp).Replace('__IP__', [string]$ip).Replace('__COPIAS__', $script:CarpetaCopias).Replace('__LOGS__', $script:CarpetaLogs)
  if ($Simular) {
    Simula "Crearía $($script:RutaLeeme) con las direcciones para otros equipos y los avisos."
    EscribirLinea ('  (La app se podrá abrir en: http://localhost:' + $script:Puerto + ')') DarkGray
    return
  }
  Paso "Creando $($script:RutaLeeme)…"
  [System.IO.File]::WriteAllText($script:RutaLeeme, $texto, (New-Object System.Text.UTF8Encoding($true)))
}


# --- Desinstalación ---
function Ejecutar-Desinstalacion {
  Titulo 'Desinstalación'
  if (-not $SinPreguntas) {
    $r = Read-Host '¿Seguro que quieres desinstalar el servidor del taller? (s/N)'
    if ($r -notmatch '^[sS]') { EscribirLinea 'Cancelado.' Yellow; Pausar-Final; return }
  }

  # Para el servidor y el vigilante (y mata node) antes de quitar sus ficheros.
  Detener-Servidor

  $rutaNormal = $script:CarpetaApp -replace '\\', '/'

  Hacer "Eliminando la tarea programada «$($script:NombreTarea)»…" {
    $t = Get-ScheduledTask -TaskName $script:NombreTarea -ErrorAction SilentlyContinue
    if ($t) { Unregister-ScheduledTask -TaskName $script:NombreTarea -Confirm:$false }
  }
  Hacer "Eliminando la tarea programada «$($script:NombreTareaCopia)»…" {
    $t = Get-ScheduledTask -TaskName $script:NombreTareaCopia -ErrorAction SilentlyContinue
    if ($t) { Unregister-ScheduledTask -TaskName $script:NombreTareaCopia -Confirm:$false }
  }
  Hacer "Eliminando la tarea programada «$($script:NombreTareaVigilante)»…" {
    $t = Get-ScheduledTask -TaskName $script:NombreTareaVigilante -ErrorAction SilentlyContinue
    if ($t) { Unregister-ScheduledTask -TaskName $script:NombreTareaVigilante -Confirm:$false }
  }
  Hacer 'Eliminando la carpeta de control del vigilante…' {
    Remove-Item -LiteralPath $script:CarpetaControl -Recurse -Force -ErrorAction SilentlyContinue
  }
  Hacer "Eliminando la regla de firewall «$($script:NombreRegla)»…" {
    Get-NetFirewallRule -DisplayName $script:NombreRegla -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  }
  Hacer 'Eliminando el acceso directo «Taller» del escritorio…' {
    Remove-Item -LiteralPath $script:RutaAcceso -Force -ErrorAction SilentlyContinue
  }
  Hacer 'Quitando la entrada safe.directory de git…' {
    & git config --system --unset-all safe.directory $rutaNormal 2>$null
  }

  if ($BorrarDatos) {
    if (-not (Test-CarpetaBorrable $script:Carpeta)) {
      Aviso "Por seguridad NO se borrará «$($script:Carpeta)»: no parece una instalación de Taller (falta iniciar-taller.cmd o app\taller-bicicletas) o es una raíz de disco o una carpeta del sistema."
      EscribirLinea '  Se desinstala el servicio, pero se conservan la carpeta y los datos.' Yellow
    } else {
      if (-not $SinPreguntas) {
        $r2 = Read-Host "Esto borrará TAMBIÉN los datos y las copias de $($script:Carpeta). ¿Continuar? (s/N)"
        if ($r2 -notmatch '^[sS]') { EscribirLinea 'No se borrarán los datos.' Yellow; Pausar-Final; return }
      }
      Hacer "Borrando la carpeta $($script:Carpeta) y todos sus datos…" {
        Remove-Item -LiteralPath $script:Carpeta -Recurse -Force -ErrorAction SilentlyContinue
      }
    }
  } else {
    EscribirLinea 'Se conservan el código y los datos (usa -BorrarDatos si quieres eliminarlos).' DarkGray
  }

  if (-not $Simular) {
    Titulo 'Desinstalación terminada'
    EscribirLinea 'El servidor del taller ya no arrancará solo. Los datos siguen donde estaban.' Green
  }
  Pausar-Final
}


# --- Instalación ---
function Ejecutar-Instalacion {
  Titulo 'Instalación de Taller'
  EscribirLinea 'Voy a preparar este PC como servidor de la aplicación del taller.' DarkGray
  EscribirLinea "Carpeta: $($script:Carpeta)" DarkGray
  EscribirLinea "Puerto:  $($script:Puerto)" DarkGray
  EscribirLinea "Copias:  $($script:CarpetaCopias)" DarkGray

  if (Test-RutaPeligrosa $script:Carpeta) {
    ErrorFatal "La carpeta de instalación «$($script:Carpeta)» no es válida: elige una carpeta propia (por ejemplo C:\Taller), no una raíz de disco ni una carpeta del sistema."
  }

  Titulo 'Parada de la instalación anterior'
  Detener-Servidor

  Titulo 'Programas necesarios'
  Asegurar-Programas

  Titulo 'Descarga del programa'
  Obtener-Codigo

  Titulo 'Preparación de la configuración'
  Crear-Actualizar-Env

  Titulo 'Instalación de la aplicación'
  Ejecutar-PasosApp

  Titulo 'Arranque automático y copias'
  Crear-Lanzador
  Crear-CopiaDiaria
  Registrar-Tareas

  Titulo 'Red y acceso'
  Registrar-Firewall
  Crear-AccesoDirecto
  Escribir-Leeme

  Titulo 'Resumen'
  if ($Simular) {
    Simula 'Terminado: NO se ha cambiado nada en este equipo.'
    return
  }
  $responde = Esperar-Servidor -Segundos 90
  if ($responde) {
    EscribirLinea 'La aplicación está en marcha.' Green
  } else {
    Aviso 'La aplicación aún no responde; en el primer arranque puede tardar un poco.'
    EscribirLinea "  Últimas líneas de $($script:LogTaller):" Yellow
    if (Test-Path -LiteralPath $script:LogTaller) {
      Get-Content -LiteralPath $script:LogTaller -Tail 20 | ForEach-Object { EscribirLinea ('   ' + $_) DarkGray }
    }
    EscribirLinea ("  Puedes verlo entero con:  notepad ""{0}""" -f $script:LogTaller) Yellow
  }
  $ip = Obtener-IPv4Local
  EscribirLinea ''
  EscribirLinea "Entra desde este PC en:  http://localhost:$($script:Puerto)" Cyan
  EscribirLinea "Desde otros equipos:     http://$($env:COMPUTERNAME):$($script:Puerto)" Cyan
  if ($ip) { EscribirLinea ("                         http://{0}:{1}" -f $ip, $script:Puerto) Cyan }
  EscribirLinea ''
  EscribirLinea 'Recuerda cambiar las contraseñas de admin y mecanico en Configuración > Usuarios.' Yellow
  EscribirLinea "Resumen y direcciones:   $($script:RutaLeeme)" DarkGray
  EscribirLinea "Registro del servidor:   $($script:LogTaller)" DarkGray
  Pausar-Final
}

# --- Punto de entrada ---
if ($Simular) {
  EscribirLinea 'MODO SIMULACIÓN: se muestra lo que se haría, pero no se cambia nada.' Yellow
}

if (-not $Simular -and -not (Test-Administrador)) {
  Relanzar-Elevado
}

Definir-Rutas

if ($Desinstalar) {
  Ejecutar-Desinstalacion
  Pausar-Final
  exit 0
}

Pedir-Datos
if (-not $CarpetaCopias) { $script:CarpetaCopias = Join-Path $script:Carpeta 'copias' }
Definir-Rutas
try {
  Ejecutar-Instalacion
}
catch {
  Write-Host ''
  Write-Host "ERROR: $_" -ForegroundColor Red
  Pausar-Final
  exit 1
}

