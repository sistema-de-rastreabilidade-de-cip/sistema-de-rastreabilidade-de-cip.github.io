#!/usr/bin/env bash
# Testa os scripts de desfazer: aplica as migrações, desfaz e confere que a
# estrutura volta exatamente ao estado anterior (impressão digital dos objetos
# do CIP) sem perder registros. Também confere que dá para reaplicar.
source "$(dirname "$0")/../ambiente.sh"
cd "$(dirname "$0")"
P=("${PSQL_BASE[@]}" -v ON_ERROR_STOP=1 -At)
OK=0; FAIL=0
IMP="select md5(string_agg(x, '|' order by x)) from (
  select 'f:'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'||md5(pg_get_functiondef(p.oid)) x from pg_proc p where p.pronamespace='public'::regnamespace
  union all select 't:'||table_name||'.'||column_name||':'||data_type from information_schema.columns where table_schema='public'
  union all select 'g:'||tgrelid::regclass||'.'||tgname from pg_trigger where not tgisinternal
  union all select 'p:'||tablename||'.'||policyname from pg_policies where schemaname='public'
  union all select 'n:'||nspname from pg_namespace where nspname like 'cip%') s;"
ver() { if [ "$2" = "$3" ]; then OK=$((OK+1)); echo "ok   - $1"; else FAIL=$((FAIL+1)); echo "FAIL - $1 [$2] x [$3]"; fi; }

bash recriar.sh cip_rb_v8 v8 || exit 1
ANTES=$("${P[@]}" -d cip_rb_v8 -c "$IMP")
"${P[@]}" -d cip_rb_v8 -1 -f "$REPO_DIR/supabase/migrations/20261107120000_cip_v8_1_operadores_backup.sql" >/dev/null
"${P[@]}" -d cip_rb_v8 >/dev/null <<'SQL'
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a"}',false);
set role authenticated;
select cadastrar_operador('Ana Lima');
select cip_criar_backup();
SQL
ver "dados da v8.1 criados antes de desfazer" "1" "$("${P[@]}" -d cip_rb_v8 -c 'select count(*) from cip_operadores')"
"${P[@]}" -d cip_rb_v8 -f "$REPO_DIR/supabase/rollback/20261107120000_cip_v8_1_operadores_backup_desfazer.sql" >/dev/null
DEPOIS=$("${P[@]}" -d cip_rb_v8 -c "$IMP")
ver "desfazer a v8.1 devolve a estrutura exata da v8" "$ANTES" "$DEPOIS"
ver "desfazer a v8.1 não apaga registros" "27" "$("${P[@]}" -d cip_rb_v8 -c 'select count(*) from cip_registros')"
"${P[@]}" -d cip_rb_v8 -1 -f "$REPO_DIR/supabase/migrations/20261107120000_cip_v8_1_operadores_backup.sql" >/dev/null && { OK=$((OK+1)); echo "ok   - v8.1 pode ser reaplicada depois de desfeita"; } || { FAIL=$((FAIL+1)); echo "FAIL - reaplicar a v8.1"; }

bash recriar.sh cip_rb_base || exit 1
ANTES=$("${P[@]}" -d cip_rb_base -c "$IMP")
for f in "$REPO_DIR"/supabase/migrations/2026110612*.sql; do "${P[@]}" -d cip_rb_base -1 -f "$f" >/dev/null; done
"${P[@]}" -d cip_rb_base -f "$REPO_DIR/supabase/rollback/20261106120100_cip_v8_estrutura_desfazer.sql" >/dev/null
DEPOIS_FN=$("${P[@]}" -d cip_rb_base -c "select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('avaliar_cip','cip_texto_valido','definir_data_base_adega')")
ver "desfazer a v8 remove as funções da v8" "0" "$DEPOIS_FN"
ver "desfazer a v8 mantém os registros originais" "27" "$("${P[@]}" -d cip_rb_base -c 'select count(*) from cip_registros')"
ver "desfazer a v8 restaura editar_registro_cip com 10 parâmetros" "10" "$("${P[@]}" -d cip_rb_base -c "select pronargs from pg_proc where proname='editar_registro_cip'")"

echo; echo "Resultado: $OK ok, $FAIL falha(s)"
[ $FAIL -eq 0 ]
