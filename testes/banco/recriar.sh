#!/usr/bin/env bash
# Recria um banco de teste: $1 = nome; $2 = "v8" (só migrações v8), "v9" (até a v9) ou "todas" (todas as migrações).
source "$(dirname "$0")/../ambiente.sh"
P=("${PSQL_BASE[@]}" -v ON_ERROR_STOP=1)
"${P[@]}" -c "drop database if exists $1" -c "create database $1" >/dev/null || exit 1
"${P[@]}" -d "$1" -f "$TESTES_DIR/banco/replica_base.sql" -f "$TESTES_DIR/banco/dados_ficticios.sql" >/dev/null || exit 1
for f in "$REPO_DIR"/supabase/migrations/*.sql; do
  [ "$2" = "v8" ] && [[ "$(basename "$f")" > "20261106999999" ]] && continue
  [ "$2" = "v9" ] && [[ "$(basename "$f")" > "20261109999999" ]] && continue
  [ -z "$2" ] && continue
  "${P[@]}" -d "$1" -1 -f "$f" >/dev/null 2>"$PGTESTE_DIR/ultimo_erro.txt" || { cat "$PGTESTE_DIR/ultimo_erro.txt"; echo "FALHOU: $f"; exit 1; }
done
