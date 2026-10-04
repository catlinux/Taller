#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Instalador de «Taller» para Linux SIN Docker (servicio systemd).
#
#   bash instalar-linux.sh [opciones]
#
# Reutiliza deploy/install.sh (descarga de dependencias, base de datos y
# compilación) y deploy/instalar-servicio.sh (servicio systemd «taller»).
# NO escribe NODE_ENV ni ACTUALIZACIONES en el .env: los define el servicio.
#
# Opciones:
#   --carpeta RUTA    carpeta de la aplicación    (por defecto la actual)
#   --puerto N        puerto de la aplicación      (por defecto 3001)
#   --usuario NOMBRE  usuario que ejecuta el servicio (por defecto el actual)
#   --red             accesible desde la red local (por defecto, solo informa)
#   --solo-local      solo desde este equipo       (solo informa)
#   --demo            carga datos de demostración
#   --sin-preguntas   usa los valores por defecto sin preguntar
#   --simular         no cambia nada: solo muestra lo que haría
# ---------------------------------------------------------------------------
set -euo pipefail

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"            # .../deploy/linux
APP_LOCAL="$(cd "$SELF_DIR/../.." && pwd)"           # .../taller-bicicletas
REPO_DEFECTO="${REPO:-https://github.com/catlinux/Taller.git}"

SIMULAR=0
SIN_PREGUNTAS=0
CARPETA=""
PUERTO=""
USUARIO=""
RED=""
DEMO=0

while [ $# -gt 0 ]; do
  case "$1" in
    --simular) SIMULAR=1; shift ;;
    --sin-preguntas) SIN_PREGUNTAS=1; shift ;;
    --puerto) PUERTO="${2:-}"; shift 2 || shift ;;
    --puerto=*) PUERTO="${1#*=}"; shift ;;
    --carpeta) CARPETA="${2:-}"; shift 2 || shift ;;
    --carpeta=*) CARPETA="${1#*=}"; shift ;;
    --usuario) USUARIO="${2:-}"; shift 2 || shift ;;
    --usuario=*) USUARIO="${1#*=}"; shift ;;
    --repositorio) REPO_DEFECTO="${2:-}"; shift 2 || shift ;;
    --repositorio=*) REPO_DEFECTO="${1#*=}"; shift ;;
    --demo) DEMO=1; shift ;;
    --red) RED=1; shift ;;
    --solo-local|--local) RED=0; shift ;;
    *) printf 'Aviso: opción no reconocida «%s»\n' "$1" >&2; shift ;;
  esac
done

# --- Mensajes ---------------------------------------------------------------
di()     { printf '%s\n' "$*"; }
paso()   { printf '> %s\n' "$*"; }
aviso()  { printf 'AVISO: %s\n' "$*" >&2; }
fatal()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
simula() { printf '[SIMULACIÓN] %s\n' "$*"; }
titulo() { printf '\n== %s ==\n' "$*"; }
ejecutar() {
  local descripcion="$1"; shift
  if [ "$SIMULAR" -eq 1 ]; then simula "$descripcion"; else paso "$descripcion"; "$@"; fi
}

# --- Utilidades -------------------------------------------------------------
puerto_libre() {
  local p="$1"
  if command -v ss >/dev/null 2>&1; then
    if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${p}\$"; then return 1; fi
  elif command -v lsof >/dev/null 2>&1; then
    if lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then return 1; fi
  fi
  return 0
}

ip_local() {
  local ip=""
  if command -v hostname >/dev/null 2>&1; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}') || ip=""
    [ -n "$ip" ] && { printf '%s' "$ip"; return 0; }
  fi
  if command -v ifconfig >/dev/null 2>&1; then
    ip=$(ifconfig 2>/dev/null | awk '/inet /{print $2}' | grep -v '^127\.' | head -n1) || ip=""
    [ -n "$ip" ] && { printf '%s' "$ip"; return 0; }
  fi
  return 0
}

mayor_node() {
  local v
  v=$(node --version 2>/dev/null) || return 1
  case "$v" in v*) v="${v#v}" ;; esac
  printf '%s' "${v%%.*}"
}

esperar_servidor() {
  local puerto="$1" segundos="${2:-120}"
  local url="http://127.0.0.1:${puerto}/api/modo/publico"
  local fin=$(( $(date +%s) + segundos ))
  while [ "$(date +%s)" -lt "$fin" ]; do
    if command -v curl >/dev/null 2>&1; then
      curl -fsS -m 5 "$url" >/dev/null 2>&1 && return 0
    elif command -v wget >/dev/null 2>&1; then
      wget -q -T 5 -O /dev/null "$url" >/dev/null 2>&1 && return 0
    else
      return 0
    fi
    sleep 3
  done
  return 1
}

# --- Punto de entrada -------------------------------------------------------
if [ "$SIMULAR" -eq 1 ]; then
  di 'MODO SIMULACIÓN: se muestra lo que se haría, pero no se cambia nada.'
fi

if [ "$(uname -s 2>/dev/null)" != "Linux" ] && [ "$SIMULAR" -eq 0 ]; then
  fatal 'Este instalador es solo para Linux (sin Docker). En Windows usa instalar.ps1.'
fi

for plantilla in install.sh instalar-servicio.sh; do
  [ -f "$APP_LOCAL/deploy/$plantilla" ] || fatal "Falta deploy/$plantilla junto a este instalador."
done

# --- Comprobaciones (solo lectura) -----------------------------------------
titulo 'Requisitos del sistema'

NODE_OK=1
if command -v node >/dev/null 2>&1; then
  MAJOR="$(mayor_node || printf '0')"
  if [ "${MAJOR:-0}" -ge 20 ] 2>/dev/null; then
    di "  Node: $(node --version) (ok, hace falta 20 o superior)"
  else
    NODE_OK=0; di "  Node: $(node --version) (demasiado antiguo, hace falta 20 o superior)"
  fi
else
  NODE_OK=0; di '  Node: no encontrado (hace falta 20 o superior)'
fi

HAY_GIT=1; command -v git >/dev/null 2>&1 || HAY_GIT=0
di "  git:  $( [ "$HAY_GIT" -eq 1 ] && (git --version 2>/dev/null || printf 'detectado') || printf 'no encontrado' )"

HAY_SYSTEMD=0
if command -v systemctl >/dev/null 2>&1 && { [ -d /run/systemd/system ] || systemctl --version >/dev/null 2>&1; }; then
  HAY_SYSTEMD=1
fi
di "  systemd: $( [ "$HAY_SYSTEMD" -eq 1 ] && printf 'disponible' || printf 'no detectado' )"

if [ "$SIMULAR" -eq 0 ]; then
  if [ "$NODE_OK" -eq 0 ]; then
    aviso 'Falta Node 20 o superior.'
    di '  Opciones para instalarlo:'
    di '    · nvm:          https://github.com/nvm-sh/nvm   (nvm install 20)'
    di '    · Debian/Ubuntu: sudo apt install nodejs npm     (o NodeSource)'
    di '    · Fedora:        sudo dnf install nodejs'
    di '    · macOS:         brew install node'
    fatal 'Instala Node 20 o superior y vuelve a intentarlo.'
  fi
  if [ -z "$PUERTO" ] || [ "$PUERTO" -lt 1024 ] || [ "$PUERTO" -gt 65535 ]; then
    fatal 'El puerto debe estar entre 1024 y 65535 (usa --puerto N).'
  fi
fi

# --- Preguntas (Enter = valor por defecto) ---------------------------------
titulo 'Cómo quieres la instalación'
if [ -z "$CARPETA" ]; then
  if [ -d "$APP_LOCAL/../.git" ]; then CARPETA="$APP_LOCAL"; else CARPETA="$HOME/taller"; fi
fi
[ -n "$PUERTO" ] || PUERTO=3001
[ -z "$USUARIO" ] && USUARIO="$(id -un 2>/dev/null || printf '')"
[ -z "$RED" ] && RED=1

if [ "$SIN_PREGUNTAS" -eq 0 ]; then
  di 'Pulsa Enter para aceptar lo que aparece entre corchetes.'
  while :; do
    resp=""; read -r -p "Carpeta de la aplicación [$CARPETA] " resp || true
    [ -n "$resp" ] && CARPETA="$resp"
    CARPETA="${CARPETA%/}"
    [ -n "$CARPETA" ] && break
    aviso 'Escribe una carpeta válida.'
  done
  while :; do
    resp=""; read -r -p "Puerto para la aplicación (1024-65535) [$PUERTO] " resp || true
    [ -n "$resp" ] && PUERTO="$resp"
    case "$PUERTO" in ''|*[!0-9]*) aviso 'Escribe un número.'; continue ;; esac
    if [ "$PUERTO" -lt 1024 ] || [ "$PUERTO" -gt 65535 ]; then
      aviso 'El puerto debe estar entre 1024 y 65535.'; continue
    fi
    if [ "$SIMULAR" -eq 0 ] && ! puerto_libre "$PUERTO"; then
      aviso "El puerto $PUERTO ya está ocupado. Prueba con $((PUERTO + 1))."; continue
    fi
    break
  done
  resp=""; read -r -p "Usuario que ejecutará el servicio [$USUARIO] " resp || true
  [ -n "$resp" ] && USUARIO="$resp"
  resp=""; read -r -p "¿Accesible desde otros equipos de la red local? (S/n) " resp || true
  case "$resp" in [nN]*) RED=0 ;; *) RED=1 ;; esac
fi

case "$PUERTO" in
  ''|*[!0-9]*) fatal "El puerto «$PUERTO» no es válido." ;;
esac
if [ "$PUERTO" -lt 1024 ] || [ "$PUERTO" -gt 65535 ]; then
  fatal 'El puerto debe estar entre 1024 y 65535.'
fi
[ -n "$USUARIO" ] || fatal 'No he podido determinar el usuario del servicio (usa --usuario NOMBRE).'

# --- Preparación ------------------------------------------------------------
titulo 'Preparación de la carpeta'

if [ -d "$CARPETA/deploy" ]; then
  APP="$CARPETA"
elif [ -d "$CARPETA/taller-bicicletas/deploy" ]; then
  APP="$CARPETA/taller-bicicletas"
else
  case "$CARPETA" in
    ""|"/"|"$HOME") fatal "Elige una carpeta propia (por ejemplo $HOME/taller), no la raíz ni tu carpeta personal." ;;
  esac
  if [ -d "$CARPETA/.git" ]; then
    if [ "$SIMULAR" -eq 1 ]; then
      simula "Actualizaría el código ya clonado en $CARPETA (git fetch + merge --ff-only origin/main)."
    else
      paso "Actualizando el código en $CARPETA…"
      git -C "$CARPETA" fetch --quiet origin main || aviso 'No se pudo contactar con GitHub; se usa el código actual.'
      git -C "$CARPETA" merge --ff-only origin/main || aviso 'No se pudo avanzar automáticamente; se usa el código actual.'
    fi
  else
    ejecutar "Clonando la aplicación en $CARPETA…" git clone --branch main "$REPO_DEFECTO" "$CARPETA"
  fi
  APP="$CARPETA/taller-bicicletas"
fi

if [ "$SIMULAR" -eq 0 ] && [ ! -f "$APP/deploy/install.sh" ]; then
  fatal "No encuentro la aplicación en $APP (falta deploy/install.sh)."
fi
di "Aplicación: $APP"
di "Servicio:   taller (systemd, usuario $USUARIO)"
di "Puerto:     $PUERTO"
di 'La aplicación escucha en todas las interfaces de red (así la definen el servicio y la app).'
if [ "$RED" -eq 1 ]; then
  di 'Se avisará de las direcciones para entrar desde otros equipos de la red local.'
else
  di 'Se tratará como uso solo desde este equipo (no se abrirá el cortafuegos).'
fi

# --- Instalación de la aplicación -------------------------------------------
titulo 'Dependencias, base de datos y compilación'
INSTALL_ARGS=(--puerto "$PUERTO")
[ "$DEMO" -eq 1 ] && INSTALL_ARGS+=(--demo)
if [ "$SIMULAR" -eq 1 ]; then
  simula "Ejecutaría:  bash $APP/deploy/install.sh ${INSTALL_ARGS[*]}"
else
  paso 'Instalando dependencias (npm ci) y compilando (puede tardar unos minutos)…'
  ( cd "$APP" && bash "$APP/deploy/install.sh" "${INSTALL_ARGS[@]}" )
fi

# --- Servicio systemd -------------------------------------------------------
titulo 'Servicio systemd'
if [ "$SIMULAR" -eq 1 ]; then
  simula "Ejecutaría:  bash $APP/deploy/instalar-servicio.sh $USUARIO"
  simula "El servicio «taller» arrancaría solo al encender el equipo."
else
  if [ "$HAY_SYSTEMD" -eq 1 ]; then
    paso 'Instalando y arrancando el servicio…'
    ( cd "$APP" && bash "$APP/deploy/instalar-servicio.sh" "$USUARIO" )
  else
    aviso 'No hay systemd en este sistema; no puedo instalar el servicio automático.'
    di "  Arranca la aplicación a mano con:  cd $APP && npm start"
  fi
fi

# --- Cortafuegos (opcional) -------------------------------------------------
titulo 'Cortafuegos'
SUBRED=""
if [ "$RED" -eq 1 ]; then
  IP_LOCAL="$(ip_local)"
  case "$IP_LOCAL" in
    *.*.*.*) SUBRED="$(printf '%s' "$IP_LOCAL" | cut -d. -f1-3).0/24" ;;
  esac
fi

if [ "$RED" -eq 0 ]; then
  di 'El acceso es solo desde este equipo; no hace falta abrir nada en el cortafuegos.'
elif [ -z "$SUBRED" ]; then
  di 'No he podido determinar la red local; si otros equipos no entran, abre el puerto a mano.'
elif command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -qi 'Status: active'; then
  di "ufw activo. Se puede permitir el puerto $PUERTO solo para la red local ($SUBRED)."
  ABRIR=1
  if [ "$SIN_PREGUNTAS" -eq 0 ]; then
    resp=""; read -r -p "¿Abrir el puerto en ufw para $SUBRED? (S/n) " resp || true
    case "$resp" in [nN]*) ABRIR=0 ;; esac
  fi
  if [ "$ABRIR" -eq 1 ]; then
    SUDO=""; [ "$(id -u)" -eq 0 ] || SUDO="sudo"
    ejecutar "Permitiendo el puerto $PUERTO desde $SUBRED (ufw)…" \
      $SUDO ufw allow from "$SUBRED" to any port "$PUERTO" proto tcp
  else
    di 'No se toca el cortafuegos.'
  fi
elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  di "firewalld activo. Se puede permitir el puerto $PUERTO solo para la red local ($SUBRED)."
  ABRIR=1
  if [ "$SIN_PREGUNTAS" -eq 0 ]; then
    resp=""; read -r -p "¿Abrir el puerto en firewalld para $SUBRED? (S/n) " resp || true
    case "$resp" in [nN]*) ABRIR=0 ;; esac
  fi
  if [ "$ABRIR" -eq 1 ]; then
    SUDO=""; [ "$(id -u)" -eq 0 ] || SUDO="sudo"
    ejecutar 'Permitiendo el puerto solo para la red local (firewalld)…' \
      $SUDO firewall-cmd --permanent --add-rich-rule="rule family=\"ipv4\" source address=\"$SUBRED\" port port=\"$PUERTO\" protocol=\"tcp\" accept"
    ejecutar 'Recargando firewalld…' $SUDO firewall-cmd --reload
  else
    di 'No se toca el cortafuegos.'
  fi
else
  di 'No se ha detectado ufw ni firewalld activos; no hay nada que abrir.'
fi

# --- Espera y resumen -------------------------------------------------------
if [ "$SIMULAR" -eq 1 ]; then
  simula "Esperaría hasta 120 s a que responda http://127.0.0.1:$PUERTO/api/modo/publico."
  titulo 'Fin de la simulación'
  di 'NO se ha cambiado nada en este equipo.'
  exit 0
fi

titulo 'Esperando a la aplicación'
if esperar_servidor "$PUERTO" 120; then
  di 'La aplicación ya responde.'
else
  aviso 'La aplicación aún no responde; en el primer arranque puede tardar un poco.'
  di '  Mira los registros con:  journalctl -u taller -f'
fi

IP_LOCAL="$(ip_local)"
DI_NOMBRE="http://$(hostname 2>/dev/null || printf 'este-equipo'):$PUERTO"

titulo 'Resumen'
di "Entra desde este equipo:  http://localhost:$PUERTO"
if [ "$RED" -eq 1 ]; then
  di "Desde otros equipos:       $DI_NOMBRE"
  [ -n "$IP_LOCAL" ] && di "                           http://$IP_LOCAL:$PUERTO"
fi
di ''
di 'Usuarios iniciales (¡cámbialos YA en Configuración > Usuarios!):'
di '  admin     / admin123'
di '  mecanico  / mecanico123'
di ''
di 'El servicio «taller» arranca solo al encender el equipo.'
di "Estado:      sudo systemctl status taller"
di "Parar:       sudo systemctl stop taller"
di "Arrancar:    sudo systemctl start taller"
di "Registros:   journalctl -u taller -f"
di "Actualizar:  botón en Configuración > Actualizaciones, o:  cd $APP && ./deploy/update.sh"
di ''
di 'Listo.'
