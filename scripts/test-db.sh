#!/usr/bin/env bash
# Pruebas de base de datos del portal (pgTAP) sobre un PostgreSQL local temporal.
#
# Que hace:
#   1. Crea un cluster PostgreSQL nuevo y desechable (no toca ninguna otra base).
#   2. Carga supabase/tests/local/mock_supabase.sql: roles + esquema auth minimo + pgTAP.
#      (Este archivo NO es una migracion y NO se despliega; imita lo que Supabase ya trae.)
#   3. Aplica supabase/migrations/*.sql en orden.
#   4. Corre supabase/tests/database/*.test.sql con pg_prove.
#   4b. Corre supabase/tests/concurrencia/*.test.sql (dos sesiones con dblink) en una copia de la base.
#   5. Prueba que las migraciones son reversibles: aplica supabase/rollback/*.down.sql en
#      orden inverso, comprueba que quedo vacio y vuelve a aplicar todo.
#
# Uso:  scripts/test-db.sh            (requiere postgresql-16, pgtap y pg_prove)
# Con Docker y la CLI de Supabase, el equivalente oficial es:  supabase db reset && supabase test db
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PUERTO="${PGTEST_PORT:-54329}"
DIR="$(mktemp -d)"
USUARIO_PG="postgres"

# initdb/postgres no corren como root: se ejecutan como el usuario "postgres" del sistema.
if [ "$(id -u)" = "0" ]; then
  chown "$USUARIO_PG" "$DIR"
  chmod 755 "$(dirname "$DIR")" 2>/dev/null || true
  comoPg() { runuser -u "$USUARIO_PG" -- "$@"; }
else
  USUARIO_PG="$(id -un)"
  comoPg() { "$@"; }
fi

limpiar() { comoPg "$PGBIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap limpiar EXIT

comoPg "$PGBIN/initdb" -D "$DIR/data" -U postgres --auth=trust -E UTF8 >/dev/null
comoPg "$PGBIN/pg_ctl" -D "$DIR/data" -w -l "$DIR/pg.log" \
  -o "-p $PUERTO -k $DIR -c listen_addresses=''" start >/dev/null

export PGHOST="$DIR" PGPORT="$PUERTO" PGUSER=postgres PGDATABASE=postgres
export PGOPTIONS="-c search_path=public,extensions"
psql_() { comoPg env PGHOST="$PGHOST" PGPORT="$PGPORT" PGUSER=postgres PGDATABASE="${1}" PGOPTIONS="$PGOPTIONS" psql -X -q -v ON_ERROR_STOP=1 "${@:2}"; }

aplicar_todo() {
  for f in "$RAIZ"/supabase/migrations/*.sql; do
    echo "  migracion: $(basename "$f")"
    psql_ prueba -f "$f" >/dev/null
  done
}

psql_ postgres -c "create database prueba" >/dev/null
psql_ prueba -f "$RAIZ/supabase/tests/local/mock_supabase.sql" >/dev/null
# Mocks adicionales (p. ej. esquema storage). Se cargan despues del mock base y tampoco se despliegan.
for f in "$RAIZ"/supabase/tests/local/mock_extra_*.sql; do
  [ -e "$f" ] && psql_ prueba -f "$f" >/dev/null
done
echo "== Aplicando migraciones"
aplicar_todo

echo "== Pruebas pgTAP"
# pg_prove no necesita permisos de escritura en el repositorio
comoPg env PGHOST="$PGHOST" PGPORT="$PGPORT" PGUSER=postgres PGDATABASE=prueba PGOPTIONS="$PGOPTIONS" \
  pg_prove --verbose --failures "$RAIZ"/supabase/tests/database/*.test.sql

echo "== Concurrencia: dos sesiones reales (dblink) sobre una copia desechable de la base"
psql_ postgres -c "create database concurrencia template prueba" >/dev/null
comoPg env PGHOST="$PGHOST" PGPORT="$PGPORT" PGUSER=postgres PGDATABASE=concurrencia PGOPTIONS="$PGOPTIONS" \
  pg_prove --verbose --failures "$RAIZ"/supabase/tests/concurrencia/*.test.sql

echo "== Reversibilidad: bajar todas las migraciones y volver a subirlas"
for f in $(ls "$RAIZ"/supabase/rollback/*.down.sql | sort -r); do
  echo "  rollback: $(basename "$f")"
  psql_ prueba -f "$f" >/dev/null
done
restos=$(psql_ prueba -At -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','v','m','S')")
funciones=$(psql_ prueba -At -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')")
if [ "$restos" != "0" ] || [ "$funciones" != "0" ]; then
  echo "ERROR: despues del rollback quedaron $restos tablas/vistas y $funciones funciones en public/private" >&2
  exit 1
fi
echo "  rollback completo: public y private quedaron vacios"
aplicar_todo
echo "  migraciones aplicadas otra vez sin errores"
echo "== TODO BIEN"
