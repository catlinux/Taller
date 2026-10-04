#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Instalador de «Taller» para Linux y macOS.
#
#   bash instalar.sh [opciones]
#
# Muestra un menú para elegir el método (Docker o Linux con systemd) y lanza el
# instalador correspondiente. Si este fichero se ejecuta suelto (descargado sin
# el resto del repositorio), funciona como arranque: instala «git» si falta,
# descarga el repositorio y continúa con la instalación.
#
# Opciones:
#   --metodo docker|linux  elige el método sin mostrar el menú
#   --carpeta RUTA         carpeta de instalación
#   --puerto N             puerto de la aplicación
#   --red                  accesible desde la red local (por defecto)
#   --solo-local           solo desde este equipo
#   --sin-preguntas        usa los valores por defecto sin preguntar
#   --simular              no cambia nada: solo muestra lo que haría
#   --repositorio URL      repositorio de Git a usar (por defecto el oficial)
#   -h, --help             muestra esta ayuda
#
# En Windows no se usa este menú: se instala con «instalar.cmd» (opción 3).
# ---------------------------------------------------------------------------
set -euo pipefail

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DEFECTO="${REPO:-https://github.com/catlinux/Taller.git}"
RUTA_DOCKER="taller-bicicletas/deploy/docker/instalar-docker.sh"
RUTA_LINUX="taller-bicicletas/deploy/linux/instalar-linux.sh"

ORIG=("$@")          # argumentos originales (para el arranque autónomo)

SIMULAR=0
SIN_PREGUNTAS=0
METODO=""
CARPETA=""
PUERTO=""
RED=""
DEMO=0

# --- Mensajes ---------------------------------------------------------------
di()     { printf '%s\n' "$*"; }
paso()   { printf '> %s\n' "$*"; }
aviso()  { printf 'AVISO: %s\n' "$*" >&2; }
fatal()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
simula() { printf '[SIMULACIÓN] %s\n' "$*"; }
titulo() { printf '\n== %s ==\n' "$*"; }

# --- Opciones ---------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --simular) SIMULAR=1; shift ;;
    --sin-preguntas) SIN_PREGUNTAS=1; shift ;;
    --metodo) METODO="${2:-}"; shift 2 || shift ;;
    --metodo=*) METODO="${1#*=}"; shift ;;
    --carpeta) CARPETA="${2:-}"; shift 2 || shift ;;
    --carpeta=*) CARPETA="${1#*=}"; shift ;;
    --puerto) PUERTO="${2:-}"; shift 2 || shift ;;
    --puerto=*) PUERTO="${1#*=}"; shift ;;
    --repositorio) REPO_DEFECTO="${2:-}"; shift 2 || shift ;;
    --repositorio=*) REPO_DEFECTO="${1#*=}"; shift ;;
    --demo) DEMO=1; shift ;;
    --red) RED=1; shift ;;
    --solo-local|--local) RED=0; shift ;;
    -h|--help)
      sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) aviso "opción no reconocida «$1»"; shift ;;
  esac
done

# Argumentos que se reenvían al instalador elegido (sin el propio --metodo).
FORWARD=()
if [ "$SIMULAR" -eq 1 ]; then FORWARD+=(--simular); fi
if [ "$SIN_PREGUNTAS" -eq 1 ]; then FORWARD+=(--sin-preguntas); fi
if [ "$DEMO" -eq 1 ]; then FORWARD+=(--demo); fi
if [ -n "$PUERTO" ]; then FORWARD+=(--puerto "$PUERTO"); fi
if [ -n "$CARPETA" ]; then FORWARD+=(--carpeta "$CARPETA"); fi
if [ -n "$RED" ]; then
  if [ "$RED" -eq 1 ]; then FORWARD+=(--red); else FORWARD+=(--solo-local); fi
fi
if [ "$REPO_DEFECTO" != "https://github.com/catlinux/Taller.git" ]; then
  FORWARD+=(--repositorio "$REPO_DEFECTO")
fi

# --- Utilidades -------------------------------------------------------------
dentro_del_repo() {
  [ -f "$SELF_DIR/$RUTA_DOCKER" ] || [ -f "$SELF_DIR/$RUTA_LINUX" ]
}

ejecutar() {
  local descripcion="$1"; shift
  if [ "$SIMULAR" -eq 1 ]; then simula "$descripcion"; else paso "$descripcion"; "$@"; fi
}

asegurar_git() {
  if command -v git >/dev/null 2>&1; then
    di "  git: $(git --version 2>/dev/null || printf 'detectado')"
    return 0
  fi
  aviso 'No encuentro «git», necesario para descargar la aplicación.'
  GESTOR=""
  for c in apt-get dnf yum zypper pacman brew; do
    if command -v "$c" >/dev/null 2>&1; then GESTOR="$c"; break; fi
  done
  case "$GESTOR" in
    apt-get) ejecutar 'Instalando git (apt)…' sudo apt-get install -y git ;;
    dnf)     ejecutar 'Instalando git (dnf)…' sudo dnf install -y git ;;
    yum)     ejecutar 'Instalando git (yum)…' sudo yum install -y git ;;
    zypper)  ejecutar 'Instalando git (zypper)…' sudo zypper --non-interactive install git ;;
    pacman)  ejecutar 'Instalando git (pacman)…' sudo pacman -Sy --noconfirm git ;;
    brew)    ejecutar 'Instalando git (brew)…' brew install git ;;
    *)       aviso 'No sé instalar git en este sistema.' ;;
  esac
  command -v git >/dev/null 2>&1 \
    || fatal 'Instala «git» a mano (https://git-scm.com/downloads) y vuelve a intentarlo.'
}

# --- Arranque autónomo ------------------------------------------------------
bootstrap() {
  titulo 'Primera descarga'
  di 'No encuentro el resto del programa; voy a descargarlo desde el repositorio.'
  [ -n "$CARPETA" ] || CARPETA="$HOME/taller"
  CLON="$CARPETA/Taller"

  if [ "$SIMULAR" -eq 1 ]; then
    simula 'Comprobaría/instalaría «git» si faltara.'
    simula "Clonaría $REPO_DEFECTO en $CLON."
    simula "Continuaría con la instalación (método «${METODO:-docker}»)."
    titulo 'Fin de la simulación'
    di 'NO se ha cambiado nada en este equipo.'
    exit 0
  fi

  asegurar_git
  if [ -d "$CLON/.git" ]; then
    paso "Actualizando el código en $CLON…"
    git -C "$CLON" fetch --quiet origin main || aviso 'No se pudo contactar con GitHub; se usa el código actual.'
    git -C "$CLON" merge --ff-only origin/main || aviso 'No se pudo avanzar automáticamente; se usa el código actual.'
  else
    mkdir -p "$CARPETA"
    paso "Clonando el repositorio en $CLON…"
    git clone --branch main "$REPO_DEFECTO" "$CLON"
  fi
  paso 'Continuando con el menú ya descargado…'
  exec bash "$CLON/instalar.sh" "${ORIG[@]}"
}

# --- Menú -------------------------------------------------------------------
mostrar_menu() {
  titulo 'Instalador de Taller'
  di 'Elige cómo quieres montar el servidor del taller:'
  di ''
  di '  1) Docker (Linux o Mac con Docker)'
  di '  2) Linux (servicio systemd, sin Docker)'
  di '  3) Windows (se instala desde un PC Windows con instalar.cmd)'
  di '  0) Salir'
  di ''
}

mensaje_windows() {
  titulo 'Instalación en Windows'
  di 'En Windows no se usa este menú: se instala desde el propio PC Windows.'
  di 'Copia (o clona) este repositorio en ese PC y haz doble clic en «instalar.cmd»,'
  di 'o ejecuta:'
  di '    powershell -ExecutionPolicy Bypass -File instalar.ps1'
  di 'El menú de Windows se encarga de todo (Node, Git, servicio, firewall, copias).'
}

lanzar_docker() {
  di 'Método: Docker.'
  exec bash "$SELF_DIR/$RUTA_DOCKER" ${FORWARD[@]+"${FORWARD[@]}"}
}

lanzar_linux() {
  di 'Método: Linux (servicio systemd).'
  exec bash "$SELF_DIR/$RUTA_LINUX" ${FORWARD[@]+"${FORWARD[@]}"}
}

# --- Punto de entrada -------------------------------------------------------
if [ "$SIMULAR" -eq 1 ]; then
  di 'MODO SIMULACIÓN: se muestra lo que se haría, pero no se cambia nada.'
fi

if ! dentro_del_repo; then
  bootstrap
fi

case "$METODO" in
  docker|linux|"") : ;;
  windows|win|windows.ps1) mensaje_windows; exit 0 ;;
  *) fatal "Método no válido: «$METODO» (usa docker o linux)." ;;
esac

if [ -z "$METODO" ]; then
  if [ "$SIN_PREGUNTAS" -eq 1 ]; then
    METODO=docker
  else
    mostrar_menu
    opcion=""
    read -r -p 'Elige una opción (0-3) ' opcion || opcion=""
    case "$opcion" in
      1) METODO=docker ;;
      2) METODO=linux ;;
      3) mensaje_windows; exit 0 ;;
      0|"") di 'Nada que hacer.'; exit 0 ;;
      *) fatal "Opción no válida: «$opcion»." ;;
    esac
  fi
fi

case "$METODO" in
  docker) lanzar_docker ;;
  linux) lanzar_linux ;;
esac
exit 0
