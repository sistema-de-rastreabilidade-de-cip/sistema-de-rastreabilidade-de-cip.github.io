#!/usr/bin/env bash
# Atomicidade da migração v8.1 e do seu desfazer: uma falha em qualquer
# ponto não pode deixar nada aplicado pela metade, qualquer que seja a forma
# de aplicação (psql com ou sem ON_ERROR_STOP, psql -1, ou o arquivo inteiro
# enviado como um único comando, como faz o SQL Editor do Supabase).
source "$(dirname "$0")/../ambiente.sh"
cd "$(dirname "$0")"
MIG81="$REPO_DIR/supabase/migrations/20261107120000_cip_v8_1_operadores_backup.sql"
RB81="$REPO_DIR/supabase/rollback/20261107120000_cip_v8_1_operadores_backup_desfazer.sql"
TMP="$PGTESTE_DIR/atomicidade"; mkdir -p "$TMP"; chmod 755 "$TMP"
OK=0; FAIL=0
IMP="select md5(string_agg(x, '|' order by x)) from (
  select 'f:'||n.nspname||'.'||p.proname||md5(pg_get_functiondef(p.oid)) x from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public') or n.nspname like 'cip%'
  union all select 't:'||table_schema||'.'||table_name||'.'||column_name from information_schema.columns where table_schema='public' or table_schema like 'cip%'
  union all select 'g:'||tgrelid::regclass||'.'||tgname from pg_trigger where not tgisinternal
  union all select 'p:'||tablename||'.'||policyname from pg_policies
  union all select 'n:'||nspname from pg_namespace where nspname like 'cip%'
  union all select 'd:'||count(*)::text from public.cip_registros) s;"
P() { psql -h "$PGTESTE_DIR" -p "$PGTESTE_PORTA" -U postgres -d "$1" -X -q -At "${@:2}"; }
ver() { if [ "$2" = "$3" ]; then OK=$((OK+1)); echo "ok   - $1"; else FAIL=$((FAIL+1)); echo "FAIL - $1"; fi; }

# Cópias com falha controlada: logo depois de criar o schema de backup (meio) e antes do COMMIT (fim).
python3 - "$MIG81" "$TMP" <<'PY'
import sys
s=open(sys.argv[1],encoding='utf-8').read()
meio=s.replace("create schema cip_backup;\n","create schema cip_backup;\nselect 1/0; -- FALHA CONTROLADA\n",1)
fim=s[:s.rindex("commit;")]+"select 1/0; -- FALHA CONTROLADA\ncommit;\n"
assert meio!=s and fim!=s
open(sys.argv[2]+"/mig_falha_meio.sql","w",encoding='utf-8').write(meio)
open(sys.argv[2]+"/mig_falha_fim.sql","w",encoding='utf-8').write(fim)
PY
python3 - "$RB81" "$TMP" <<'PY'
import sys
s=open(sys.argv[1],encoding='utf-8').read()
fim=s[:s.rindex("commit;")]+"select 1/0; -- FALHA CONTROLADA\ncommit;\n"
open(sys.argv[2]+"/rb_falha_fim.sql","w",encoding='utf-8').write(fim)
PY
chmod 644 "$TMP"/*.sql

echo "== Migração v8.1 com falha controlada =="
for ARQ in mig_falha_meio mig_falha_fim; do
  for MODO in "psql sem ON_ERROR_STOP" "psql com ON_ERROR_STOP" "psql -1" "arquivo inteiro como um comando (SQL Editor)"; do
    DB=cip_atom; bash recriar.sh $DB v8 >/dev/null || exit 1
    ANTES=$(P $DB -c "$IMP")
    case "$MODO" in
      "psql sem ON_ERROR_STOP") P $DB -f "$TMP/$ARQ.sql" >/dev/null 2>&1 ;;
      "psql com ON_ERROR_STOP") P $DB -v ON_ERROR_STOP=1 -f "$TMP/$ARQ.sql" >/dev/null 2>&1 ;;
      "psql -1") P $DB -1 -v ON_ERROR_STOP=1 -f "$TMP/$ARQ.sql" >/dev/null 2>&1 ;;
      *) P $DB -c "$(cat "$TMP/$ARQ.sql")" >/dev/null 2>&1 ;;
    esac
    ver "falha no ${ARQ#mig_falha_} / $MODO: estrutura anterior intacta" "$ANTES" "$(P $DB -c "$IMP")"
  done
done

echo "== Aplicação normal e travas =="
for MODO in "psql com ON_ERROR_STOP" "arquivo inteiro como um comando (SQL Editor)" "psql -1"; do
  DB=cip_atom; bash recriar.sh $DB v8 >/dev/null || exit 1
  case "$MODO" in
    "psql com ON_ERROR_STOP") P $DB -v ON_ERROR_STOP=1 -f "$MIG81" >/dev/null 2>&1; R=$? ;;
    "psql -1") P $DB -1 -v ON_ERROR_STOP=1 -f "$MIG81" >/dev/null 2>&1; R=$? ;;
    *) P $DB -c "$(cat "$MIG81")" >/dev/null 2>&1; R=$? ;;
  esac
  ver "aplicação completa por $MODO" "0|1|1" "$R|$(P $DB -c "select count(*) from pg_namespace where nspname='cip_backup'")|$(P $DB -c "select count(*) from pg_proc where proname='cip_em_restauracao'")"
done
DEPOIS=$(P $DB -c "$IMP")
OUT=$(P $DB -v ON_ERROR_STOP=1 -f "$MIG81" 2>&1)
ver "aplicar duas vezes é recusado pela trava" "1" "$(echo "$OUT" | grep -c 'já foi aplicada')"
ver "segunda aplicação não muda nada" "$DEPOIS" "$(P $DB -c "$IMP")"
DB=cip_atom; bash recriar.sh $DB >/dev/null || exit 1
ANTES=$(P $DB -c "$IMP")
OUT=$(P $DB -v ON_ERROR_STOP=1 -f "$MIG81" 2>&1)
ver "aplicar a v8.1 sem a v8 é recusado" "1" "$(echo "$OUT" | grep -c 'precisa ser aplicada antes')"
ver "nada muda quando a v8 está ausente" "$ANTES" "$(P $DB -c "$IMP")"

echo "== Desfazer da v8.1 com falha controlada =="
for MODO in "psql sem ON_ERROR_STOP" "arquivo inteiro como um comando (SQL Editor)"; do
  DB=cip_atom; bash recriar.sh $DB v9 >/dev/null || exit 1
  ANTES=$(P $DB -c "$IMP")
  case "$MODO" in
    "psql sem ON_ERROR_STOP") P $DB -f "$TMP/rb_falha_fim.sql" >/dev/null 2>&1 ;;
    *) P $DB -c "$(cat "$TMP/rb_falha_fim.sql")" >/dev/null 2>&1 ;;
  esac
  ver "falha no desfazer / $MODO: v8.1 continua inteira, sem arquivo pela metade" "$ANTES" "$(P $DB -c "$IMP")"
done

echo; echo "Resultado: $OK ok, $FAIL falha(s)"
[ $FAIL -eq 0 ]
