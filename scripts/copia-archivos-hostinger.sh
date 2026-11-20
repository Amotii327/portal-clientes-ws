#!/usr/bin/env bash
# Copia diaria de los archivos del portal (buckets de Supabase Storage) al VPS de Hostinger. Decision D-015.
# DISENO, NO EJECUTADO: todavia no hay VPS. Lo corre DevOps en el VPS (cron o temporizador), nunca el portal.
# Diseno completo: docs/2026-11-20_diseno_copia-archivos-hostinger_v1.md
#
# Que hace:
#   1. Copia cada bucket al VPS con rclone (protocolo S3 de Supabase Storage), CIFRADO en el disco (rclone crypt).
#   2. Lo que cambia o desaparece del origen NO se borra: pasa a la carpeta del dia (`historico/AAAA-MM-DD`)
#      y se conserva RETENCION_DIAS (30 por defecto). Asi un archivo que el cliente borro sigue 30 dias.
#   3. Verifica que no falte ninguno (mismo tamano) y avisa si algo fallo.
#
# Secretos: SOLO variables de entorno (gestor de secretos de Coolify o archivo 0600 fuera del repositorio).
#   SUPABASE_S3_ENDPOINT        https://<ref>.supabase.co/storage/v1/s3
#   SUPABASE_S3_REGION          region del proyecto (por ejemplo us-east-1)
#   SUPABASE_S3_ACCESS_KEY_ID / SUPABASE_S3_SECRET_ACCESS_KEY   claves S3 de Storage (solo lectura si el plan lo permite)
#   RCLONE_CRYPT_PASSWORD / RCLONE_CRYPT_PASSWORD2              ya "ofuscadas" con `rclone obscure`
#   DESTINO_COPIAS              carpeta en el VPS, por ejemplo /var/backups/portal-archivos
# Opcionales: BUCKETS (por defecto los tres), RETENCION_DIAS (30), AVISO_URL (se llama al terminar bien),
#             AVISO_FALLO_URL (se llama si falla), DRY_RUN=1 (no copia nada),
#             UMBRAL_CAIDA_PCT (20: freno si el origen pierde mas de ese % de archivos o de peso de un dia al otro),
#             FORZAR_REDUCCION=1 (salta el freno UNA vez, solo con aprobacion del dueno).
set -Eeuo pipefail
umask 077

: "${SUPABASE_S3_ENDPOINT:?falta SUPABASE_S3_ENDPOINT}"
: "${SUPABASE_S3_REGION:?falta SUPABASE_S3_REGION}"
: "${SUPABASE_S3_ACCESS_KEY_ID:?falta SUPABASE_S3_ACCESS_KEY_ID}"
: "${SUPABASE_S3_SECRET_ACCESS_KEY:?falta SUPABASE_S3_SECRET_ACCESS_KEY}"
: "${RCLONE_CRYPT_PASSWORD:?falta RCLONE_CRYPT_PASSWORD}"
: "${RCLONE_CRYPT_PASSWORD2:?falta RCLONE_CRYPT_PASSWORD2}"
: "${DESTINO_COPIAS:?falta DESTINO_COPIAS}"
BUCKETS="${BUCKETS:-documentos archivos-empresa capturas-revisiones}"
RETENCION_DIAS="${RETENCION_DIAS:-30}"
UMBRAL_CAIDA_PCT="${UMBRAL_CAIDA_PCT:-20}"
HOY="$(TZ=America/Bogota date +%F)"
EXTRA=()
[ "${DRY_RUN:-0}" = "1" ] && EXTRA+=(--dry-run)

# rclone se configura SOLO con variables de entorno: nada se escribe en disco ni en el repositorio.
export RCLONE_CONFIG_SUPABASE_TYPE=s3
export RCLONE_CONFIG_SUPABASE_PROVIDER=Other
export RCLONE_CONFIG_SUPABASE_ENDPOINT="$SUPABASE_S3_ENDPOINT"
export RCLONE_CONFIG_SUPABASE_REGION="$SUPABASE_S3_REGION"
export RCLONE_CONFIG_SUPABASE_ACCESS_KEY_ID="$SUPABASE_S3_ACCESS_KEY_ID"
export RCLONE_CONFIG_SUPABASE_SECRET_ACCESS_KEY="$SUPABASE_S3_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_CIFRADO_TYPE=crypt
export RCLONE_CONFIG_CIFRADO_REMOTE="$DESTINO_COPIAS"
export RCLONE_CONFIG_CIFRADO_PASSWORD="$RCLONE_CRYPT_PASSWORD"
export RCLONE_CONFIG_CIFRADO_PASSWORD2="$RCLONE_CRYPT_PASSWORD2"

mkdir -p "$DESTINO_COPIAS"
LOG="$DESTINO_COPIAS/copia-$HOY.log"   # el registro no lleva claves: rclone no las imprime
log() { printf '%s %s\n' "$(TZ=America/Bogota date +%FT%T%z)" "$*" | tee -a "$LOG" >&2; }

fallo() {
  log "FALLO en la linea $1"
  [ -n "${AVISO_FALLO_URL:-}" ] && curl -fsS -m 10 "$AVISO_FALLO_URL" >/dev/null 2>&1 || true
  exit 1
}
trap 'fallo $LINENO' ERR

# Una sola copia a la vez.
exec 9>"$DESTINO_COPIAS/.bloqueo"
flock -n 9 || { log "ya hay una copia corriendo; salgo"; exit 0; }

# Freno (M-1/M-2): si el origen aparece vacio o se encoge de golpe, NO se sincroniza: un sync lo trataria como
# "el cliente borro todo" y moveria el espejo entero al historico. Se mide antes de tocar nada.
medir() { # $1 = ruta rclone; imprime "archivos bytes" (0 0 si no existe)
  local j; j="$(rclone size "$1" --json 2>/dev/null || echo '{"count":0,"bytes":0}')"
  printf '%s %s' "$(printf '%s' "$j" | sed -n 's/.*"count":\([0-9]*\).*/\1/p')" "$(printf '%s' "$j" | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')"
}
for b in $BUCKETS; do
  read -r n_o by_o < <(medir "SUPABASE:$b")
  read -r n_e by_e < <(medir "CIFRADO:espejo/$b")
  n_o="${n_o:-0}"; by_o="${by_o:-0}"; n_e="${n_e:-0}"; by_e="${by_e:-0}"
  if [ "$n_e" -gt 0 ] && [ "${FORZAR_REDUCCION:-0}" != "1" ]; then
    if [ "$n_o" -eq 0 ] || [ $(( (n_e - n_o) * 100 )) -gt $(( n_e * UMBRAL_CAIDA_PCT )) ] \
       || [ $(( (by_e - by_o) * 100 )) -gt $(( by_e * UMBRAL_CAIDA_PCT )) ]; then
      log "FRENO en $b: origen $n_o archivos/$by_o bytes, copia $n_e archivos/$by_e bytes. No se sincroniza. Revisar a mano."
      false
    fi
  fi
done

for b in $BUCKETS; do
  log "bucket $b: copiando"
  # sync deja el espejo igual al origen; lo que cambia o se borra va a historico/<fecha> (no se pierde).
  rclone sync "SUPABASE:$b" "CIFRADO:espejo/$b" \
    --backup-dir "CIFRADO:historico/$HOY/$b" \
    --transfers 4 --checkers 8 --retries 3 --low-level-retries 5 --fast-list \
    --log-file "$LOG" --log-level NOTICE ${EXTRA[@]+"${EXTRA[@]}"}
  # Verificacion: todo lo que hay en el origen esta en la copia con el mismo tamano.
  if [ "${DRY_RUN:-0}" != "1" ]; then
    rclone check "SUPABASE:$b" "CIFRADO:espejo/$b" --size-only --one-way --log-file "$LOG" --log-level NOTICE
  fi
  log "bucket $b: listo"
done

# Retencion: cuenta desde que el archivo ENTRA al historico (la carpeta del dia en que desaparecio o cambio),
# no desde la fecha del archivo. Se borran las carpetas historico/AAAA-MM-DD con mas de RETENCION_DIAS dias.
if [ "${DRY_RUN:-0}" != "1" ]; then
  LIMITE="$(TZ=America/Bogota date -d "-${RETENCION_DIAS} days" +%F)"
  while read -r d; do
    d="${d%/}"
    [[ "$d" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || continue
    if [[ "$d" < "$LIMITE" ]]; then
      log "retencion: se borra historico/$d"
      rclone purge "CIFRADO:historico/$d" --log-file "$LOG" --log-level NOTICE
    fi
  done < <(rclone lsf "CIFRADO:historico" --dirs-only 2>/dev/null || true)
  find "$DESTINO_COPIAS" -maxdepth 1 -name 'copia-*.log' -mtime +"$RETENCION_DIAS" -delete
fi

log "copia terminada"
[ -n "${AVISO_URL:-}" ] && curl -fsS -m 10 "$AVISO_URL" >/dev/null 2>&1 || true
