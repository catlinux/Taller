#Requires -Version 5.1
<#
  Instalador de «Taller» con Docker para Windows 10/11.
  Se usa cuando el PC Windows ya tiene Docker Desktop: prepara una carpeta con la
  aplicación, arranca el contenedor y deja un actualizador (actualizar.cmd) y una
  regla de firewall para la red local. No instala Node.js (la imagen lo lleva dentro).

  Uso normal (doble clic, se eleva solo):  instalar-docker.ps1
  Directo:   powershell -NoProfile -ExecutionPolicy Bypass -File instalar-docker.ps1
  Prueba sin cambiar nada:  ... -File instalar-docker.ps1 -Simular -SinPreguntas

  Parámetros:
    -Carpeta        Carpeta de instalación (por defecto %USERPROFILE%\taller).
    -Puerto         Puerto en el equipo (por defecto 3001).
    -Repositorio    Repositorio git (por defecto https://github.com/catlinux/Taller.git).
    -SoloLocal      Solo accesible desde este equipo (enlaza a 127.0.0.1).
    -SinPreguntas   Usa los valores por defecto sin preguntar.
    -Simular        No cambia nada: solo muestra lo que haría.
#>
[CmdletBinding()]
param(
  [string]$Carpeta = "$env:USERPROFILE\taller",
  [int]$Puerto = 3001,
  [string]$Repositorio = 'https://github.com/catlinux/Taller.git',
  [switch]$SoloLocal,
  [switch]$Demo,
  [switch]$SinPreguntas,
  [switch]$Simular
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
  if ($Simular) { Simula $Descripcion; return }
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

# --- Permisos de administrador (hacen falta para abrir el firewall) ---
function Test-Administrador {
  $identidad = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identidad)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Relanzar-Elevado {
  $partes = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $PSCommandPath),
    '-Carpeta', ('"{0}"' -f $Carpeta), '-Puerto', $Puerto, '-Repositorio', ('"{0}"' -f $Repositorio))
  if ($SoloLocal) { $partes += '-SoloLocal' }
  if ($SinPreguntas) { $partes += '-SinPreguntas' }
  if ($Simular) { $partes += '-Simular' }
  EscribirLinea 'Se necesitan permisos de administrador; abriendo una ventana elevada…' Yellow
  Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList ($partes -join ' ') | Out-Null
  exit 0
}

# --- Comprobación de puerto y preguntas ---
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
    $resp = Read-Host "Puerto en el equipo (1024-65535) [$Puerto]"
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

  $resp = Read-Host '¿Permitir el acceso desde otros equipos de la red local? (S/n)'
  if ($resp -match '^[nN]') { $script:SoloLocal = $true }
  if (-not $Demo) {
    $resp = Read-Host '¿Cargar datos de demostración (clientes y artículos inventados)? Solo para probar. (s/N)'
    if ($resp -match '^[sS]') { $script:Demo = $true }
  }
}

# --- Comprobación de programas (Docker Desktop y Git) ---
function Test-Git {
  return [bool](Get-Command git -ErrorAction SilentlyContinue)
}
function Refrescar-Path {
  $maquina = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $usuario = [Environment]::GetEnvironmentVariable('Path', 'User')
  $partes = @($maquina, $usuario) | Where-Object { $_ }
  $env:Path = ($partes -join ';')
}

# Docker y «docker compose» son imprescindibles. No los instalamos en silencio
# (Docker Desktop es una aplicación de escritorio): si faltan, se explica cómo.
function Asegurar-Docker {
  Titulo 'Docker'
  $hayDocker = Get-Command docker -ErrorAction SilentlyContinue
  $ok = $false
  if ($hayDocker) {
    try {
      $v = (& docker version --format '{{.Server.Version}}' 2>$null)
      EscribirLinea ("  Docker: {0}" -f (& docker --version 2>$null)) DarkGray
      & docker compose version *> $null
      if ($LASTEXITCODE -eq 0) { $ok = $true; EscribirLinea '  docker compose: disponible' DarkGray }
    } catch { $ok = $false }
  }

  if ($ok) { return }

  if ($Simular) {
    Simula 'Aquí comprobaría Docker y «docker compose». Como faltan, en una instalación real explicaría cómo instalar Docker Desktop y terminaría sin tocar nada.'
    return
  }
  Aviso 'No encuentro Docker Desktop con «docker compose» funcionando.'
  EscribirLinea '  Instálalo y vuelve a intentarlo:' Red
  EscribirLinea '    · Docker Desktop:  https://www.docker.com/products/docker-desktop/' Red
  EscribirLinea '    · Tras instalarlo, ábrelo una vez y comprueba:  docker --version' Red
  ErrorFatal 'Falta Docker Desktop (o «docker compose»).'
}

# Git hace falta para descargar y actualizar la aplicación. Se instala con winget si falta.
function Asegurar-Git {
  if (Test-Git) {
    EscribirLinea ('  Git: ' + (& git --version)) DarkGray
    return
  }
  if ($Simular) { Simula 'Instalaría Git con winget (Git.Git).'; return }

  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    Aviso 'Este Windows no trae winget para instalar Git.'
    EscribirLinea '  Instálalo a mano desde https://git-scm.com y vuelve a intentarlo.' Red
    ErrorFatal 'Falta Git.'
  }
  Paso 'Instalando Git con winget…'
  & winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements
  Refrescar-Path
  if (-not (Test-Git)) {
    Refrescar-Path
    if (-not (Test-Git)) { ErrorFatal 'Tras instalar, Git sigue sin detectarse. Cierra esta ventana, abre otra y vuelve a intentarlo.' }
  }
  EscribirLinea ('  Git: ' + (& git --version)) DarkGray
}

# --- Dirección IPv4 de la red local (para el nombre/atajo de acceso) ---
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

# --- Esperar a que la aplicación responda ---
function Esperar-Servidor {
  param([int]$Segundos = 120)
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

# --- Pausa final (al hacer doble clic, para poder leer el resumen) ---
function Pausar-Final {
  if ($Simular -or $SinPreguntas) { return }
  if (-not [Environment]::UserInteractive) { return }
  Write-Host ''
  Read-Host 'Pulsa Enter para cerrar esta ventana' | Out-Null
}

# --- Rutas derivadas ---
function Definir-Rutas {
  $script:CarpetaRepoTaller = Join-Path $script:Carpeta 'Taller'
  $script:RutaEnv = Join-Path $script:Carpeta '.env'
  $script:CarpetaControl = Join-Path $script:Carpeta 'control'
  $script:RutaActualizarCmd = Join-Path $script:Carpeta 'actualizar.cmd'
  $script:RutaLeeme = Join-Path $script:Carpeta 'LEEME.txt'
  $script:NombreRegla = 'Taller'
  if ($script:SoloLocal) { $script:Bind = '127.0.0.1' } else { $script:Bind = '0.0.0.0' }
}

# --- Descargar/actualizar el código ---
function Obtener-Codigo {
  if (Test-Path -LiteralPath $script:CarpetaRepoTaller) {
    if (Test-Path -LiteralPath (Join-Path $script:CarpetaRepoTaller '.git')) {
      Hacer "Actualizando el código existente en $($script:CarpetaRepoTaller) (git fetch + merge --ff-only)…" {
        & git -C $script:CarpetaRepoTaller fetch --quiet origin main
        if ($LASTEXITCODE -ne 0) {
          Aviso 'No se pudo contactar con GitHub; se usa el código actual.'
        } else {
          & git -C $script:CarpetaRepoTaller merge --ff-only origin/main
          if ($LASTEXITCODE -ne 0) { Aviso 'No se pudo avanzar automáticamente (git merge --ff-only); se usa el código actual.' }
        }
      }
    } else {
      ErrorFatal "La carpeta $($script:CarpetaRepoTaller) ya existe y no es un repositorio git. Muévela o bórrala y vuelve a intentarlo."
    }
  } else {
    Hacer "Clonando la aplicación en $($script:CarpetaRepoTaller)…" {
      New-Item -ItemType Directory -Force -Path $script:Carpeta | Out-Null
      & git clone --branch main $Repositorio $script:CarpetaRepoTaller
      if ($LASTEXITCODE -ne 0) { ErrorFatal 'No se pudo clonar el repositorio (git clone).' }
    }
  }
}

# --- Copiar las plantillas de Docker a la carpeta de instalación ---
function Copiar-Plantillas {
  Titulo 'Ficheros de la instalación'
  foreach ($a in @('Dockerfile', 'docker-compose.yml', 'entrypoint.sh', 'update.sh', 'vigilante.sh')) {
    $origen = Join-Path $PSScriptRoot $a
    if (-not (Test-Path -LiteralPath $origen)) { ErrorFatal "No encuentro la plantilla $origen." }
    Hacer "Copiando $a a $($script:Carpeta)…" {
      Copy-Item -LiteralPath $origen -Destination (Join-Path $script:Carpeta $a) -Force
    }
  }
  Hacer 'Dejando los ficheros .sh con finales de línea LF…' {
    Get-ChildItem -LiteralPath $script:Carpeta -Filter '*.sh' | ForEach-Object {
      $texto = [System.IO.File]::ReadAllText($_.FullName) -replace "`r`n", "`n" -replace "`r", "`n"
      [System.IO.File]::WriteAllText($_.FullName, $texto, (New-Object System.Text.UTF8Encoding($false)))
    }
  }
}

# --- Crear el fichero .env ---
# En Windows las actualizaciones se aplican con actualizar.cmd, así que ACTUALIZACIONES
# queda vacío (el vigilante por cron solo tiene sentido en Linux/macOS).
function Crear-Actualizar-Env {
  if (Test-Path -LiteralPath $script:RutaEnv) {
    EscribirLinea "  Ya existe $($script:RutaEnv); se conserva (incluido su JWT_SECRET)." DarkGray
    return
  }
  $secreto = Generar-Secreto
  $contenido = "JWT_SECRET=$secreto`nPUERTO=$($script:Puerto)`nBIND=$($script:Bind)`nACTUALIZACIONES=`n"
  if ($Demo) { $contenido += "CARGAR_DEMO=1`n" }
  if ($Simular) {
    Simula "Crearía $($script:RutaEnv) con un JWT_SECRET nuevo, PUERTO=$($script:Puerto), BIND=$($script:Bind) y ACTUALIZACIONES vacío (se actualiza con actualizar.cmd)."
    return
  }
  Paso 'Creando el .env con un JWT_SECRET nuevo…'
  [System.IO.File]::WriteAllText($script:RutaEnv, $contenido, (New-Object System.Text.UTF8Encoding($false)))
  EscribirLinea '  .env creado (UTF-8 sin BOM).' DarkGray
}

# --- Compilar y arrancar el contenedor ---
function Levantar-Contenedor {
  if ($Simular) { Simula "Ejecutaría, en $($script:Carpeta):  docker compose up -d --build"; return }
  Titulo 'Construcción y arranque del contenedor'
  Paso 'Compilando y arrancando (la primera vez puede tardar unos minutos)…'
  Push-Location $script:Carpeta
  try {
    & docker compose up -d --build 2>&1 | ForEach-Object { Write-Host ("   " + $_) -ForegroundColor DarkGray }
    if ($LASTEXITCODE -ne 0) { ErrorFatal 'No se pudo compilar o arrancar el contenedor (docker compose up).' }
  } finally { Pop-Location }
}

# --- Cortafuegos (solo red local) ---
function Registrar-Firewall {
  if ($script:SoloLocal) {
    EscribirLinea 'El acceso es solo desde este equipo; no hace falta abrir nada en el cortafuegos.' DarkGray
    return
  }
  if ($Simular) {
    Simula "Crearía (o reemplazaría) la regla de firewall entrante «$($script:NombreRegla)»: TCP puerto $($script:Puerto), solo desde la red local."
    return
  }
  Paso "Abriendo el puerto $($script:Puerto) en el firewall (solo red local)…"
  Get-NetFirewallRule -DisplayName $script:NombreRegla -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  New-NetFirewallRule -DisplayName $script:NombreRegla -Direction Inbound -Action Allow -Protocol TCP `
    -LocalPort $script:Puerto -RemoteAddress LocalSubnet -Profile Any | Out-Null
}

# --- Actualizador manual (actualizar.cmd) ---
function Crear-ActualizarCmd {
  $contenido = @"
@echo off
rem Actualiza «Taller» (Docker) desde GitHub y reconstruye el contenedor.
rem Los datos se conservan en el volumen Docker.
cd /d "%~dp0"
echo Descargando cambios...
git -C Taller fetch origin
git -C Taller reset --hard origin/main
echo Reconstruyendo y reiniciando el contenedor...
docker compose up -d --build
echo.
echo Listo. La aplicacion se reinicia con los cambios.
pause
"@
  Hacer "Creando el actualizador $($script:RutaActualizarCmd)…" {
    [System.IO.File]::WriteAllText($script:RutaActualizarCmd, ($contenido -replace "`r?`n", "`r`n"), (New-Object System.Text.ASCIIEncoding))
  }
}

# --- Fichero LEEME con las direcciones y avisos ---
function Escribir-Leeme {
  $ip = Obtener-IPv4Local
  $lineas = @(
    'TALLER - servidor instalado con Docker',
    '',
    "Carpeta de instalación: $($script:Carpeta)",
    "Entra desde este equipo:  http://localhost:$($script:Puerto)"
  )
  if (-not $script:SoloLocal) {
    $lineas += 'Desde otros equipos de la red local:'
    $lineas += "  http://$env:COMPUTERNAME`:$($script:Puerto)"
    if ($ip) { $lineas += "  http://$ip`:$($script:Puerto)" }
  }
  $lineas += @(
    '',
    'Usuarios iniciales (¡cámbialos YA en Configuración > Usuarios!):',
    '  admin     / admin123',
    '  mecanico  / mecanico123',
    '',
    'Actualizar a una versión nueva:',
    "  haz doble clic en $($script:RutaActualizarCmd)",
    '',
    'Comandos útiles (abre PowerShell en la carpeta de instalación):',
    '  docker compose logs -f      ver los mensajes de la aplicación',
    '  docker compose restart      reiniciar la aplicación',
    '  docker compose down         parar la aplicación',
    '',
    'Los datos (base de datos y copias) viven en el volumen Docker «taller-data»:',
    'se conservan al actualizar y al parar el contenedor.'
  )
  $texto = ($lineas -join "`r`n") + "`r`n"
  Hacer "Escribiendo las instrucciones en $($script:RutaLeeme)…" {
    [System.IO.File]::WriteAllText($script:RutaLeeme, $texto, (New-Object System.Text.UTF8Encoding($false)))
  }
}

# --- Punto de entrada -------------------------------------------------------
Titulo 'Instalador de Taller con Docker (Windows)'
if ($Simular) { EscribirLinea 'MODO SIMULACION: se muestra lo que se haría, pero no se cambia nada.' DarkGray }

if (-not (Test-Administrador)) {
  if ($Simular) {
    Simula 'Necesitaría permisos de administrador (para abrir el puerto en el firewall); en simulación se continúa sin elevarlos.'
  } else {
    Relanzar-Elevado
  }
}

Asegurar-Docker
Asegurar-Git
Pedir-Datos
Definir-Rutas

Titulo 'Cómo quieres la instalación'
EscribirLinea ''
EscribirLinea "Carpeta: $($script:Carpeta)"
EscribirLinea "Puerto:  $($script:Puerto)"
if ($script:SoloLocal) { EscribirLinea 'Acceso:  solo este equipo (127.0.0.1)' }
else { EscribirLinea 'Acceso:  red local (otros equipos podrán entrar)' }

Titulo 'Preparación de la carpeta'
if ($Simular) {
  Simula "Crearía la carpeta $($script:Carpeta)."
} else {
  Paso "Creando la carpeta $($script:Carpeta)…"
  New-Item -ItemType Directory -Force -Path $script:Carpeta | Out-Null
}
Obtener-Codigo
Copiar-Plantillas
Crear-Actualizar-Env
if ($Simular) {
  Simula "Crearía la carpeta compartida $($script:CarpetaControl)."
} else {
  Hacer "Creando la carpeta compartida $($script:CarpetaControl)…" { New-Item -ItemType Directory -Force -Path $script:CarpetaControl | Out-Null }
}

Levantar-Contenedor
Registrar-Firewall
Crear-ActualizarCmd
Escribir-Leeme

if ($Simular) {
  Simula "Esperaría hasta 120 s a que responda http://127.0.0.1:$($script:Puerto)/api/modo/publico."
  Titulo 'Fin de la simulación'
  EscribirLinea 'NO se ha cambiado nada en este equipo.'
  exit 0
}

Titulo 'Esperando a la aplicación'
if (-not (Esperar-Servidor 120)) {
  Aviso 'La aplicación aún no responde; en el primer arranque puede tardar un poco.'
  EscribirLinea "  Mira los registros con:  cd $($script:Carpeta); docker compose logs -f" DarkGray
}

# --- Resumen ----------------------------------------------------------------
$ipLocal = Obtener-IPv4Local
Titulo 'Resumen'
EscribirLinea "Entra desde este equipo:  http://localhost:$($script:Puerto)"
if (-not $script:SoloLocal) {
  EscribirLinea "Desde otros equipos:       http://$env:COMPUTERNAME`:$($script:Puerto)"
  if ($ipLocal) { EscribirLinea "                           http://$ipLocal`:$($script:Puerto)" }
}
EscribirLinea ''
EscribirLinea 'Usuarios iniciales (¡cámbialos YA en Configuración > Usuarios!):'
EscribirLinea '  admin     / admin123'
EscribirLinea '  mecanico  / mecanico123'
EscribirLinea ''
EscribirLinea 'Datos:         volumen Docker «taller-data» (dentro del contenedor, /data).'
EscribirLinea "Actualizar:    doble clic en $($script:RutaActualizarCmd)"
EscribirLinea "Registros:     cd $($script:Carpeta); docker compose logs -f"
EscribirLinea "Instrucciones: $($script:RutaLeeme)"
EscribirLinea ''
EscribirLinea 'Listo.' Green
Pausar-Final
