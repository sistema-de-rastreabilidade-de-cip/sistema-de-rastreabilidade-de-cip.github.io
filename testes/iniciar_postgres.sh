#!/usr/bin/env bash
# Cria (se preciso) e inicia o PostgreSQL local de teste.
source "$(dirname "$0")/ambiente.sh"
BIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}"
mkdir -p "$PGTESTE_DIR" && chown postgres "$PGTESTE_DIR" 2>/dev/null
if [ ! -f "$PGTESTE_DIR/data/PG_VERSION" ]; then
  su postgres -c "$BIN/initdb -D $PGTESTE_DIR/data -U postgres --auth=trust -E UTF8 --locale=C.UTF-8" >/dev/null
fi
"${PSQL_BASE[@]}" -Atc "select 1" >/dev/null 2>&1 || \
  su postgres -c "$BIN/pg_ctl -D $PGTESTE_DIR/data -o '-p $PGTESTE_PORTA -k $PGTESTE_DIR' -l $PGTESTE_DIR/pg.log start" >/dev/null
"${PSQL_BASE[@]}" -Atc "select 'PostgreSQL local pronto: ' || version()"
