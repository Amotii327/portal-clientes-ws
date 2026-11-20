#!/usr/bin/env bash
# Traslado de archivos viejos al ARCHIVO EXTERNO: el disco del VPS de Hostinger (D-021, solicitud de cambio 5).
# DISENO, NO EJECUTADO: todavia no hay VPS. Lo corre DevOps en el VPS (cron), nunca el portal. Hermano de
# scripts/copia-archivos-hostinger.sh (copia diaria, D-015) y reutiliza su diseno: rclone solo con variables de entorno,
# destino cifrado (crypt), una corrida a la vez (flock), FRENOS antes de borrar y RETENCION por carpeta.
#
# Que hace (la lista la lleva la base: public.archivos_por_trasladar, la llena public.marcar_para_archivar con los
# archivos de proyectos cerrados hace mas de 30 dias):
#   archivar : copia el archivo de Supabase al VPS (archivo/<empresa>/<bucket>/<ruta>), compara su huella SHA-256 en
#              origen y destino y recien entonces lo anota (archivo_trasladado).
#   borrar   : SOLO con BORRAR_DE_SUPABASE=1: quita el objeto de Supabase y lo anota (archivo_borrado_de_supabase),
#              que es lo que libera espacio. Es irreversible en Supabase: requiere aprobacion escrita del dueno.
#              Aun asi, la copia diaria lo conserva 30 dias en historico/ y el archivo queda en el VPS.
#   recuperar: si alguien pidio un archivo de vuelta, lo copia del VPS a su misma ruta en Supabase (archivo_recuperado).
#
# Secretos: SOLO variables de entorno (gestor de secretos de Coolify o archivo 0600 fuera del repositorio):
#   SUPABASE_URL                    https://<ref>.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY       llave de sistema; solo llama a las funciones archivo_* (no se imprime nunca)
#   SUPABASE_S3_ENDPOINT / SUPABASE_S3_REGION / SUPABASE_S3_ACCESS_KEY_ID / SUPABASE_S3_SECRET_ACCESS_KEY
#   RCLONE_CRYPT_PASSWORD / RCLONE_CRYPT_PASSWORD2   (las mismas de la copia diaria, ya "ofuscadas")
#   DESTINO_ARCHIVO                 carpeta en el VPS, por ejemplo /var/backups/portal-archivo
# Opcionales: LIMITE_POR_CORRIDA (50), BORRAR_DE_SUPABASE (0), UMBRAL_CAIDA_PCT (20), RETENCION_DIAS (30),
#             AVISO_URL / AVISO_FALLO_URL, DRY_RUN=1 (solo lista, no mueve nada).
set -Eeuo pipefail
umask 077

: "${SUPABASE_URL:?falta SUPABASE_URL}"
: "${SUPABASE_SERVICE_ROLE_KEY:?falta SUPABASE_SERVICE_ROLE_KEY}"
: "${SUPABASE_S3_ENDPOINT:?falta SUPABASE_S3_ENDPOINT}"
: "${SUPABASE_S3_REGION:?falta SUPABASE_S3_REGION}"
: "${SUPABASE_S3_ACCESS_KEY_ID:?falta SUPABASE_S3_ACCESS_KEY_ID}"
: "${SUPABASE_S3_SECRET_ACCESS_KEY:?falta SUPABASE_S3_SECRET_ACCESS_KEY}"
: "${RCLONE_CRYPT_PASSWORD:?falta RCLONE_CRYPT_PASSWORD}"
: "${RCLONE_CRYPT_PASSWORD2:?falta RCLONE_CRYPT_PASSWORD2}"
: "${DESTINO_ARCHIVO:?falta DESTINO_ARCHIVO}"
command -v jq >/dev/null || { echo "falta jq" >&2; exit 1; }
command -v rclone >/dev/null || { echo "falta rclone" >&2; exit 1; }
LIMITE_POR_CORRIDA="${LIMITE_POR_CORRIDA:-50}"
BORRAR_DE_SUPABASE="${BORRAR_DE_SUPABASE:-0}"
UMBRAL_CAIDA_PCT="${UMBRAL_CAIDA_PCT:-20}"
RETENCION_DIAS="${RETENCION_DIAS:-30}"
HOY="$(TZ=America/Bogota date +%F)"

export RCLONE_CONFIG_SUPABASE_TYPE=s3
export RCLONE_CONFIG_SUPABASE_PROVIDER=Other
export RCLONE_CONFIG_SUPABASE_ENDPOINT="$SUPABASE_S3_ENDPOINT"
export RCLONE_CONFIG_SUPABASE_REGION="$SUPABASE_S3_REGION"
export RCLONE_CONFIG_SUPABASE_ACCESS_KEY_ID="$SUPABASE_S3_ACCESS_KEY_ID"
export RCLONE_CONFIG_SUPABASE_SECRET_ACCESS_KEY="$SUPABASE_S3_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_CIFRADO_TYPE=crypt
export RCLONE_CONFIG_CIFRADO_REMOTE="$DESTINO_ARCHIVO"
export RCLONE_CONFIG_CIFRADO_PASSWORD="$RCLONE_CRYPT_PASSWORD"
export RCLONE_CONFIG_CIFRADO_PASSWORD2="$RCLONE_CRYPT_PASSWORD2"

mkdir -p "$DESTINO_ARCHIVO"
LOG="$DESTINO_ARCHIVO/archivo-$HOY.log"     # sin claves ni rutas de clientes en claro: solo ids
log() { printf '%s %s\n' "$(TZ=America/Bogota date +%FT%T%z)" "$*" | tee -a "$LOG" >&2; }
fallo() {
  log "FALLO en la linea $1"
  [ -n "${AVISO_FALLO_URL:-}" ] && curl -fsS -m 10 "$AVISO_FALLO_URL" >/dev/null 2>&1 || true
  exit 1
}
trap 'fallo $LINENO' ERR
exec 9>"$DESTINO_ARCHIVO/.bloqueo"
flock -n 9 || { log "ya hay un traslado corriendo; salgo"; exit 0; }

# Llamada a una funcion de la base con la llave de sistema (la llave va en un archivo de encabezados temporal, no en la linea de comandos).
ENC="$(mktemp)"; trap 'rm -f "$ENC"' EXIT
printf 'apikey: %s\nAuthorization: Bearer %s\nContent-Type: application/json\n' "$SUPABASE_SERVICE_ROLE_KEY" "$SUPABASE_SERVICE_ROLE_KEY" > "$ENC"
rpc() { # $1 = funcion, $2 = cuerpo json
  curl -fsS -m 30 -X POST -H @"$ENC" -d "$2" "$SUPABASE_URL/rest/v1/rpc/$1"
}

LISTA="$(rpc archivos_por_trasladar "{\"p_limite\": $LIMITE_POR_CORRIDA}")"
TOTAL="$(printf '%s' "$LISTA" | jq 'length')"
log "pendientes en esta corrida: $TOTAL"
if [ "${DRY_RUN:-0}" = "1" ]; then printf '%s' "$LISTA" | jq -r '.[] | "\(.accion) \(.id) \(.bucket) \(.tamano_bytes) bytes"'; exit 0; fi

huella() { rclone cat "$1" 2>/dev/null | sha256sum | cut -d' ' -f1; }
TRASLADADOS=()   # ids ya verificados, candidatos a borrar de Supabase

printf '%s' "$LISTA" | jq -c '.[]' | while read -r f; do
  id="$(jq -r .id <<<"$f")"; accion="$(jq -r .accion <<<"$f")"; bucket="$(jq -r .bucket <<<"$f")"
  ruta="$(jq -r .ruta <<<"$f")"; emp="$(jq -r .empresa_id <<<"$f")"
  destino="archivo/$emp/$bucket/$ruta"
  if [ "$accion" = "archivar" ]; then
    if rclone copyto "SUPABASE:$bucket/$ruta" "CIFRADO:$destino" --retries 3 --log-file "$LOG" --log-level NOTICE; then
      h_o="$(huella "SUPABASE:$bucket/$ruta")"; h_d="$(huella "CIFRADO:$destino")"
      if [ -n "$h_o" ] && [ "$h_o" = "$h_d" ]; then
        rpc archivo_trasladado "{\"p_id\": \"$id\", \"p_ubicacion\": \"$destino\", \"p_huella\": \"$h_d\"}" >/dev/null
        log "archivado $id"
      else
        rpc archivo_con_error "{\"p_id\": \"$id\", \"p_error\": \"huella_distinta\"}" >/dev/null; log "ERROR $id: la huella no coincide"
      fi
    else
      rpc archivo_con_error "{\"p_id\": \"$id\", \"p_error\": \"copia_fallida\"}" >/dev/null; log "ERROR $id: no se pudo copiar"
    fi
  else
    ubic="$(jq -r .ubicacion_externa <<<"$f")"; h="$(jq -r .huella_sha256 <<<"$f")"
    if rclone copyto "CIFRADO:$ubic" "SUPABASE:$bucket/$ruta" --retries 3 --log-file "$LOG" --log-level NOTICE \
       && [ "$(huella "SUPABASE:$bucket/$ruta")" = "$h" ]; then
      rpc archivo_recuperado "{\"p_id\": \"$id\"}" >/dev/null; log "recuperado $id"
    else
      rpc archivo_con_error "{\"p_id\": \"$id\", \"p_error\": \"recuperacion_fallida\"}" >/dev/null; log "ERROR $id: recuperacion fallida"
    fi
  fi
done

# Borrado de Supabase (lo que libera el espacio). APAGADO por defecto. FRENO como en la copia diaria: si el lote quitaria mas
# de UMBRAL_CAIDA_PCT % de los archivos de un bucket, no se borra nada (algo anda mal: se revisa a mano).
if [ "$BORRAR_DE_SUPABASE" = "1" ]; then
  PEND="$(rpc archivos_por_borrar "{\"p_limite\": $LIMITE_POR_CORRIDA}" 2>/dev/null || echo '[]')"
  printf '%s' "$PEND" | jq -c '.[]' | while read -r f; do
    id="$(jq -r .id <<<"$f")"; bucket="$(jq -r .bucket <<<"$f")"; ruta="$(jq -r .ruta <<<"$f")"
    n_b="$(rclone size "SUPABASE:$bucket" --json | jq .count)"
    n_lote="$(jq --arg b "$bucket" '[.[] | select(.bucket == $b)] | length' <<<"$PEND")"
    if [ "$n_b" -gt 0 ] && [ "${FORZAR_REDUCCION:-0}" != "1" ] && [ $(( n_lote * 100 )) -gt $(( n_b * UMBRAL_CAIDA_PCT )) ]; then
      log "FRENO en $bucket: el lote ($n_lote) quita mas de $UMBRAL_CAIDA_PCT % de sus $n_b archivos. No se borra. Revisar a mano (FORZAR_REDUCCION=1 solo con aprobacion del dueno)."
      continue
    fi
    rclone deletefile "SUPABASE:$bucket/$ruta" --log-file "$LOG" --log-level NOTICE
    rpc archivo_borrado_de_supabase "{\"p_id\": \"$id\"}" >/dev/null; log "borrado de Supabase $id"
  done
fi

# Retencion por carpeta (igual que la copia diaria): lo recuperado se deja en recuperados/AAAA-MM-DD y se purga a los
# RETENCION_DIAS; archivo/ NO se purga nunca (es el archivo). Los registros .log se rotan igual.
LIMITE="$(TZ=America/Bogota date -d "-${RETENCION_DIAS} days" +%F)"
while read -r d; do
  d="${d%/}"; [[ "$d" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || continue
  if [[ "$d" < "$LIMITE" ]]; then log "retencion: se borra recuperados/$d"; rclone purge "CIFRADO:recuperados/$d" --log-file "$LOG" --log-level NOTICE; fi
done < <(rclone lsf "CIFRADO:recuperados" --dirs-only 2>/dev/null || true)
find "$DESTINO_ARCHIVO" -maxdepth 1 -name 'archivo-*.log' -mtime +"$RETENCION_DIAS" -delete

log "traslado terminado"
[ -n "${AVISO_URL:-}" ] && curl -fsS -m 10 "$AVISO_URL" >/dev/null 2>&1 || true
