#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Instalador de «Taller» con Docker para Linux y macOS.
#
#   bash instalar-docker.sh [opciones]
#
# Prepara una carpeta con la aplicación, arranca el contenedor y deja el
# vigilante de actualizaciones en el crontab del usuario. Lo lanza el menú
# `instalar.sh`, pero se puede ejecutar suelto.
#
# Opciones:
#   --carpeta RUTA    carpeta de instalación      (por defecto $HOME/taller)
#   --puerto N        puerto en el anfitrión      (por defecto 3001)
#   --red             accesible desde la red local (por defecto)
#   --solo-local      solo desde este equipo (enlaza a 127.0.0.1)
#   --repositorio URL repositorio de Git a usar    (por defecto el oficial)
#   --sin-preguntas   usa los valores por defecto sin preguntar
#   --simular         no cambia nada: solo muestra lo que haría
# ---------------------------------------------------------------------------
set -euo pipefail

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"        # .../deploy/docker (las plantillas)
REPO_DEFECTO="${REPO:-https://github.com/catlinux/Taller.git}"

SIMULAR=0
SIN_PREGUNTAS=0
CARPETA=""
PUERTO=""
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

# Ejecuta un comando (con su descripción) salvo en modo simulación.
ejecutar() {
  local descripcion="$1"; shift
  if [ "$SIMULAR" -eq 1 ]; then simula "$descripcion"; else paso "$descripcion"; "$@"; fi
}

# --- Utilidades -------------------------------------------------------------
generar_secreto() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 48
  else
    LC_ALL=C tr -dc 'a-f0-9' < /dev/urandom | head -c 96 || true
  fi
}

# ¿Está libre el puerto? Solo lectura (usa ss o lsof si existen).
puerto_libre() {
  local p="$1"
  if command -v ss >/dev/null 2>&1; then
    if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${p}\$"; then return 1; fi
  elif command -v lsof >/dev/null 2>&1; then
    if lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then return 1; fi
  fi
  return 0
}

# IP de la red local (best effort, según el sistema).
ip_local() {
  local ip=""
  if command -v hostname >/dev/null 2>&1; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}') || ip=""
    [ -n "$ip" ] && { printf '%s' "$ip"; return 0; }
  fi
  if command -v ipconfig >/dev/null 2>&1; then       # macOS
    ip=$(ipconfig getifaddr en0 2>/dev/null) || ip=""
    [ -n "$ip" ] || { ip=$(ipconfig getifaddr en1 2>/dev/null) || ip=""; }
    [ -n "$ip" ] && { printf '%s' "$ip"; return 0; }
  fi
  if command -v ifconfig >/dev/null 2>&1; then
    ip=$(ifconfig 2>/dev/null | awk '/inet /{print $2}' | grep -v '^127\.' | head -n1) || ip=""
    [ -n "$ip" ] && { printf '%s' "$ip"; return 0; }
  fi
  return 0
}

so_nombre() {
  case "$(uname -s 2>/dev/null)" in
    Linux) printf 'Linux' ;;
    Darwin) printf 'macOS' ;;
    *) uname -s 2>/dev/null || printf 'desconocido' ;;
  esac
}

# Espera hasta `segundos` a que la aplicación responda.
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
      return 0   # sin curl ni wget no podemos comprobar; no bloqueamos la instalación
    fi
    sleep 3
  done
  return 1
}

# --- Punto de entrada -------------------------------------------------------
if [ "$SIMULAR" -eq 1 ]; then
  di 'MODO SIMULACIÓN: se muestra lo que se haría, pero no se cambia nada.'
fi

if [ ! -f "$SELF_DIR/docker-compose.yml" ] || [ ! -f "$SELF_DIR/Dockerfile" ]; then
  fatal "No encuentro las plantillas de Docker en $SELF_DIR (Dockerfile, docker-compose.yml…)."
fi

# --- Comprobaciones (solo lectura) -----------------------------------------
titulo 'Docker y la herramienta de composición'
di "Sistema: $(so_nombre)"

HAY_DOCKER=1
if command -v docker >/dev/null 2>&1; then
  di "  Docker: $(docker --version 2>/dev/null || printf 'detectado')"
else
  HAY_DOCKER=0; di '  Docker: no encontrado'
fi

HAY_COMPOSE=1
if [ "$HAY_DOCKER" -eq 1 ] && docker compose version >/dev/null 2>&1; then
  di "  docker compose: $(docker compose version --short 2>/dev/null || printf 'disponible')"
else
  HAY_COMPOSE=0; di '  docker compose: no encontrado'
fi

if [ "$HAY_DOCKER" -eq 0 ] || [ "$HAY_COMPOSE" -eq 0 ]; then
  if [ "$SIMULAR" -eq 1 ]; then
    simula 'Aquí comprobaría Docker y «docker compose». Como faltan, en una instalación real explicaría cómo instalarlos y terminaría sin tocar nada.'
  else
    aviso 'No encuentro Docker o «docker compose» en este equipo.'
    di '  Instala Docker y vuelve a intentarlo:'
    di '    · Linux:  https://docs.docker.com/engine/install/  (docker-ce + docker-compose-plugin)'
    di '    · Mac:    https://docs.docker.com/desktop/          (Docker Desktop)'
    fatal 'Falta Docker (o «docker compose»).'
  fi
fi

HAY_GIT=1
command -v git >/dev/null 2>&1 || HAY_GIT=0
if [ "$HAY_GIT" -eq 0 ] && [ "$SIMULAR" -eq 0 ]; then
  aviso 'No encuentro «git», necesario para descargar la aplicación.'
  di '    · Debian/Ubuntu:  sudo apt install git'
  di '    · Fedora:         sudo dnf install git'
  di '    · macOS:          xcode-select --install   (o: brew install git)'
  fatal 'Falta git.'
fi

# --- Preguntas (Enter = valor por defecto) ---------------------------------
titulo 'Cómo quieres la instalación'
[ -n "$CARPETA" ] || CARPETA="$HOME/taller"
[ -n "$PUERTO" ] || PUERTO=3001
[ -z "$RED" ] && RED=1

if [ "$SIN_PREGUNTAS" -eq 0 ]; then
  di 'Pulsa Enter para aceptar lo que aparece entre corchetes.'
  while :; do
    resp=""; read -r -p "Carpeta de instalación [$CARPETA] " resp || true
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
  resp=""; read -r -p "¿Accesible desde otros equipos de la red local? (S/n) " resp || true
  case "$resp" in [nN]*) RED=0 ;; *) RED=1 ;; esac
  if [ "$DEMO" -eq 0 ]; then
    resp=""; read -r -p "¿Cargar datos de demostración (clientes y artículos inventados)? Solo para probar. (s/N) " resp || true
    case "$resp" in [sS]*) DEMO=1 ;; esac
  fi
fi

case "$PUERTO" in
  ''|*[!0-9]*) fatal "El puerto «$PUERTO» no es válido." ;;
esac
if [ "$PUERTO" -lt 1024 ] || [ "$PUERTO" -gt 65535 ]; then
  fatal 'El puerto debe estar entre 1024 y 65535.'
fi
case "$CARPETA" in *" "*) fatal "La carpeta no puede contener espacios («$CARPETA»): usa por ejemplo $HOME/taller." ;; esac
if [ "$CARPETA" = "/" ] || [ "$CARPETA" = "$HOME" ]; then
  fatal "Elige una carpeta propia (por ejemplo $HOME/taller), no la raíz ni tu carpeta personal."
fi
if [ "$RED" -eq 1 ]; then BIND="0.0.0.0"; else BIND="127.0.0.1"; fi

di ''
di "Carpeta: $CARPETA"
di "Puerto:  $PUERTO"
if [ "$RED" -eq 1 ]; then di 'Acceso:  red local (otros equipos podrán entrar)'; else di 'Acceso:  solo este equipo (127.0.0.1)'; fi

# --- Preparación ------------------------------------------------------------
titulo 'Preparación de la carpeta'

if [ "$SIMULAR" -eq 1 ]; then simula "Crearía la carpeta $CARPETA."; else mkdir -p "$CARPETA"; fi

REPO_CLON="$CARPETA/Taller"
if [ -d "$REPO_CLON/.git" ]; then
  if [ "$SIMULAR" -eq 1 ]; then
    simula "Actualizaría el código ya clonado en $REPO_CLON (git fetch + merge --ff-only origin/main)."
  else
    paso "Actualizando el código en $REPO_CLON…"
    git -C "$REPO_CLON" fetch --quiet origin main || aviso 'No se pudo contactar con GitHub; se usa el código actual.'
    git -C "$REPO_CLON" merge --ff-only origin/main || aviso 'No se pudo avanzar automáticamente; se usa el código actual.'
  fi
else
  ejecutar "Clonando la aplicación en $REPO_CLON…" git clone --branch main "$REPO_DEFECTO" "$REPO_CLON"
fi

titulo 'Ficheros de la instalación'
for archivo in Dockerfile docker-compose.yml entrypoint.sh update.sh vigilante.sh; do
  if [ "$SIMULAR" -eq 1 ]; then
    simula "Copiaría $archivo a $CARPETA/"
  else
    cp "$SELF_DIR/$archivo" "$CARPETA/$archivo"
  fi
done
if [ "$SIMULAR" -eq 1 ]; then
  simula 'Dejaría los .sh con finales de línea LF y les daría permiso de ejecución.'
else
  for s in "$CARPETA"/*.sh; do
    tr -d '\r' < "$s" > "$s.tmp" && mv "$s.tmp" "$s"
  done
  chmod +x "$CARPETA"/*.sh
fi

RUTA_ENV="$CARPETA/.env"
if [ -f "$RUTA_ENV" ]; then
  di "  Ya existe $RUTA_ENV; se conserva (incluido su JWT_SECRET)."
elif [ "$SIMULAR" -eq 1 ]; then
  simula "Crearía $RUTA_ENV con un JWT_SECRET nuevo, PUERTO=$PUERTO, BIND=$BIND y ACTUALIZACIONES=docker$([ "$DEMO" -eq 1 ] && printf ' y CARGAR_DEMO=1'), y le pondría permisos 600."
else
  paso 'Creando el .env con un JWT_SECRET nuevo…'
  {
    printf 'JWT_SECRET=%s\n' "$(generar_secreto)"
    printf 'PUERTO=%s\n' "$PUERTO"
    printf 'BIND=%s\n' "$BIND"
    printf 'ACTUALIZACIONES=docker\n'
    if [ "$DEMO" -eq 1 ]; then printf 'CARGAR_DEMO=1\n'; fi
  } > "$RUTA_ENV"
  chmod 600 "$RUTA_ENV"
  di '  .env creado (solo lectura para su dueño).'
fi

if [ "$SIMULAR" -eq 1 ]; then
  simula "Crearía la carpeta compartida $CARPETA/control."
else
  mkdir -p "$CARPETA/control"
fi

# --- Arranque ---------------------------------------------------------------
titulo 'Construcción y arranque del contenedor'
if [ "$SIMULAR" -eq 1 ]; then
  simula "Ejecutaría, en $CARPETA:  docker compose up -d --build"
else
  paso 'Compilando y arrancando (la primera vez puede tardar unos minutos)…'
  ( cd "$CARPETA" && docker compose up -d --build )
fi

# --- Vigilante (cron) -------------------------------------------------------
titulo 'Vigilante de actualizaciones (cron)'
CRON_LINE="* * * * * $CARPETA/vigilante.sh >/dev/null 2>&1"
if [ "$SIMULAR" -eq 1 ]; then
  simula "Añadiría al crontab del usuario esta línea, sin duplicarla: $CRON_LINE"
elif command -v crontab >/dev/null 2>&1; then
  if crontab -l 2>/dev/null | grep -Fq "$CARPETA/vigilante.sh"; then
    paso 'La tarea del vigilante ya estaba en el crontab; no se duplica.'
  else
    paso 'Añadiendo el vigilante al crontab (se ejecuta cada minuto)…'
    { crontab -l 2>/dev/null || true; printf '%s\n' "$CRON_LINE"; } | crontab -
  fi
else
  aviso 'No hay «crontab» en este sistema; añade esta línea a mano cuando puedas:'
  di "    $CRON_LINE"
fi

# --- Cortafuegos (opcional, solo red local) --------------------------------
titulo 'Cortafuegos'
SUBRED=""
if [ "$BIND" = "0.0.0.0" ]; then
  IP_LOCAL="$(ip_local)"
  case "$IP_LOCAL" in
    *.*.*.*) SUBRED="$(printf '%s' "$IP_LOCAL" | cut -d. -f1-3).0/24" ;;
  esac
fi

if [ "$BIND" != "0.0.0.0" ]; then
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
  di "  Mira los registros con:  cd $CARPETA && docker compose logs -f"
fi

IP_LOCAL="$(ip_local)"
DI_NOMBRE="http://$(hostname 2>/dev/null || printf 'este-equipo'):$PUERTO"

titulo 'Resumen'
di "Entra desde este equipo:  http://localhost:$PUERTO"
if [ "$BIND" = "0.0.0.0" ]; then
  di "Desde otros equipos:       $DI_NOMBRE"
  [ -n "$IP_LOCAL" ] && di "                           http://$IP_LOCAL:$PUERTO"
fi
di ''
di 'Usuarios iniciales (¡cámbialos YA en Configuración > Usuarios!):'
di '  admin     / admin123'
di '  mecanico  / mecanico123'
di ''
di 'Datos:       volumen Docker «taller-data» (dentro del contenedor, /data).'
di 'Actualizar:  botón en Configuración > Actualizaciones (lo aplica el vigilante),'
di "             o a mano:  cd $CARPETA && ./update.sh"
di "Registros:   cd $CARPETA && docker compose logs -f"
di ''
di 'Listo.'
