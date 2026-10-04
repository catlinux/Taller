#!/usr/bin/env bash
# Vigilante de actualizaciones para la instalación con Docker.
# Lo lanza cron cada minuto desde el crontab del usuario que gestiona Docker:
#   * * * * * $HOME/taller-deploy/vigilante.sh >/dev/null 2>&1
# Durante ~55 s revisa cada 3 s la carpeta control/ (montada en el contenedor como
# /control). Atiende las órdenes de la aplicación («comprobar» y «actualizar») y,
# además, comprueba GitHub por su cuenta cada 30 minutos. El contenedor nunca
# toca Docker ni git: solo lee y escribe ficheros en control/.
set -u
cd "$(dirname "$0")"
DIR=$(pwd); C="$DIR/control"; REPO="$DIR/Taller"
mkdir -p "$C"
exec 9>"$C/.vigilante.lock"
flock -n 9 || exit 0                         # ya hay otro vigilante en marcha

FMT='%H%x1f%h%x1f%cI%x1f%s%x1e'              # mismo formato que parsearGitLog
CADA=$((30 * 60))

comprobar() {
  local rama
  rama=$(git -C "$REPO" rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)
  if git -C "$REPO" fetch --quiet origin "$rama" 2>"$C/error.tmp"; then
    echo "$rama" > "$C/rama.txt"
    git -C "$REPO" log -1 --pretty=format:"$FMT" HEAD > "$C/local.log"
    git -C "$REPO" log -1 --pretty=format:"$FMT" "origin/$rama" > "$C/remoto.log"
    git -C "$REPO" log -50 --pretty=format:"$FMT" "HEAD..origin/$rama" > "$C/cambios.log"
    git -C "$REPO" rev-list --left-right --count "HEAD...origin/$rama" > "$C/conteo.txt"
    : > "$C/error.txt"
  else
    { printf 'git fetch falló: '; tr '\n' ' ' < "$C/error.tmp"; } > "$C/error.txt"
  fi
  rm -f "$C/error.tmp"
  date -Iseconds > "$C/comprobado.txt"
}

actualizar() {
  rm -f "$C/actualizar"
  echo "ejecutando|$(date -Iseconds)" > "$C/estado.txt"
  if "$DIR/update.sh" > "$C/actualizacion.log" 2>&1; then
    echo "ok|$(date -Iseconds)|$(git -C "$REPO" rev-parse --short HEAD)" > "$C/estado.txt"
  else
    echo "error|$(date -Iseconds)|$(tail -n 1 "$C/actualizacion.log" | tr '|' '/')" > "$C/estado.txt"
  fi
  comprobar
}

FIN=$((SECONDS + 55))
while [ "$SECONDS" -lt "$FIN" ]; do
  [ -f "$C/actualizar" ] && actualizar
  if [ -f "$C/comprobar" ]; then rm -f "$C/comprobar"; comprobar; fi
  ULTIMA=$(stat -c %Y "$C/comprobado.txt" 2>/dev/null || echo 0)
  [ $(( $(date +%s) - ULTIMA )) -ge "$CADA" ] && comprobar
  sleep 3
done
