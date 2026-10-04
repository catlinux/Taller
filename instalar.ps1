#Requires -Version 5.1
<#
  Menú de instalación de «Taller».
  Ofrece elegir el método e inicia el instalador correspondiente.
  Uso: doble clic en instalar.cmd, o  powershell -File instalar.ps1
  Prueba sin cambiar nada:            powershell -File instalar.ps1 -Simular -SinPreguntas

  Si este fichero se ejecuta suelto (descargado sin el resto del repositorio),
  actúa de arranque: instala Git si falta, clona el repositorio y relanza el menú.

  Parámetros (se reenvían al instalador elegido):
    -Carpeta -Puerto -CarpetaCopias -Repositorio
    -SinPreguntas  -Simular  -Desinstalar  -BorrarDatos
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

# ¿El usuario indicó -Carpeta de forma explícita? Sirve para no pisar la carpeta por
# defecto del instalador de Docker cuando no se ha especificado ninguna.
$carpetaFijada = $PSBoundParameters.ContainsKey('Carpeta')

function EscribirLinea {
  param([string]$Texto = '', [string]$Color = 'Gray')
  Write-Host $Texto -ForegroundColor $Color
}
function Titulo {
  param([string]$Texto)
  Write-Host ''
  Write-Host "== $Texto ==" -ForegroundColor Cyan
}

$rutaInstalador = Join-Path $PSScriptRoot 'taller-bicicletas\deploy\windows\instalar-windows.ps1'

# Argumentos que se reenvían al instalador de Windows.
function Argumentos-Reenvio {
  $lista = @('-Carpeta', $Carpeta, '-Puerto', $Puerto, '-Repositorio', $Repositorio)
  if ($CarpetaCopias) { $lista += @('-CarpetaCopias', $CarpetaCopias) }
  if ($SinPreguntas) { $lista += '-SinPreguntas' }
  if ($Simular) { $lista += '-Simular' }
  if ($Desinstalar) { $lista += '-Desinstalar' }
  if ($BorrarDatos) { $lista += '-BorrarDatos' }
  return $lista
}

# Argumentos para el instalador de Docker (no usa copias ni desinstalación).
# -Carpeta solo se reenvía si el usuario lo indicó: así el instalador de Docker aplica
# su propia carpeta por defecto (%USERPROFILE%\taller) cuando no se especifica ninguna.
function Argumentos-ReenvioDocker {
  $lista = @('-Puerto', $Puerto, '-Repositorio', $Repositorio)
  if ($carpetaFijada) { $lista = @('-Carpeta', $Carpeta) + $lista }
  if ($SinPreguntas) { $lista += '-SinPreguntas' }
  if ($Simular) { $lista += '-Simular' }
  return $lista
}

function Mostrar-Menu {
  Titulo 'Instalador de Taller'
  EscribirLinea 'Elige cómo quieres montar el servidor del taller:' DarkGray
  Write-Host ''
  Write-Host '  1) Windows — servidor en la red local (recomendado para el taller)' -ForegroundColor White
  Write-Host '  2) Docker (Windows, Linux o Mac con Docker)' -ForegroundColor White
  Write-Host '  3) Linux (servicio systemd, sin Docker)' -ForegroundColor White
  Write-Host '  0) Salir' -ForegroundColor White
  Write-Host ''
}

function Mensaje-NoDisponible {
  param([string]$Metodo)
  Titulo $Metodo
  EscribirLinea "La instalación con «$Metodo» se hace desde la propia máquina Linux, no desde este menú de Windows." Yellow
  EscribirLinea 'En esa máquina, con el repositorio a mano, ejecuta:' DarkGray
  EscribirLinea '    bash instalar.sh              (elige la opción 2: Linux con systemd)' DarkGray
  EscribirLinea 'o directamente:' DarkGray
  EscribirLinea '    bash taller-bicicletas/deploy/linux/instalar-linux.sh' DarkGray
}

# Ejecuta el instalador de Windows en un proceso nuevo (así gestiona su elevación y su código de salida).
# Deja que su salida se muestre directamente y guarda el código de salida para el final.
function Ejecutar-InstaladorWindows {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $rutaInstalador @(Argumentos-Reenvio)
  $script:codigoSalida = $LASTEXITCODE
}

# Modo arranque: este fichero se ejecutó suelto (no hay repositorio junto a él).
function Arranque-Autonomo {
  Titulo 'Primera descarga'
  EscribirLinea 'No encuentro el resto del programa; voy a descargarlo desde el repositorio.' DarkGray
  $carpetaApp = Join-Path $Carpeta 'app'

  if ($Simular) {
    EscribirLinea '[SIMULACIÓN] Comprobaría/instalaría Git con winget si falta.' DarkGray
    EscribirLinea "[SIMULACIÓN] Clonaría $Repositorio en $carpetaApp." DarkGray
    EscribirLinea "[SIMULACIÓN] Relanzaría el menú desde $carpetaApp\instalar.ps1." DarkGray
    exit 0
  }

  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
      EscribirLinea 'Falta Git y este Windows no trae winget. Instálalo desde https://git-scm.com' Red
      exit 1
    }
    EscribirLinea 'Instalando Git con winget…' White
    & winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements
    $maquina = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $usuario = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = (@($maquina, $usuario) | Where-Object { $_ }) -join ';'
  }

  if (Test-Path -LiteralPath (Join-Path $carpetaApp '.git')) {
    & git -C $carpetaApp fetch --quiet origin main
    & git -C $carpetaApp merge --ff-only origin/main
  } elseif (Test-Path -LiteralPath $carpetaApp) {
    EscribirLinea "La carpeta $carpetaApp ya existe y no es un repositorio git." Red
    exit 1
  } else {
    New-Item -ItemType Directory -Force -Path $Carpeta | Out-Null
    & git clone --branch main $Repositorio $carpetaApp
    if ($LASTEXITCODE -ne 0) { EscribirLinea 'No se pudo clonar el repositorio.' Red; exit 1 }
  }

  # Relanza el menú ya descargado (sus mensajes salen tal cual; su código de salida se propaga).
  $menuClonado = Join-Path $carpetaApp 'instalar.ps1'
  & powershell -NoProfile -ExecutionPolicy Bypass -File $menuClonado @(Argumentos-Reenvio)
  exit $LASTEXITCODE
}

# --- Punto de entrada ---
if ($Simular) {
  EscribirLinea 'MODO SIMULACIÓN: se muestra lo que se haría, pero no se cambia nada.' Yellow
}

if (-not (Test-Path -LiteralPath $rutaInstalador)) {
  Arranque-Autonomo
  exit 0
}

if ($SinPreguntas) {
  $opcion = '1'
} else {
  Mostrar-Menu
  $opcion = Read-Host 'Elige una opción (0-3)'
}

switch ($opcion) {
  '1' { Ejecutar-InstaladorWindows; exit $script:codigoSalida }
  '2' {
    $docker = Join-Path $PSScriptRoot 'taller-bicicletas\deploy\docker\instalar-docker.ps1'
    if (Test-Path -LiteralPath $docker) {
      & powershell -NoProfile -ExecutionPolicy Bypass -File $docker @(Argumentos-ReenvioDocker)
      exit $LASTEXITCODE
    } else {
      Mensaje-NoDisponible 'Docker'
      exit 2
    }
  }
  '3' { Mensaje-NoDisponible 'Linux (servicio systemd)'; exit 3 }
  '0' { exit 0 }
  default { EscribirLinea 'Opción no válida.' Yellow; exit 1 }
}

