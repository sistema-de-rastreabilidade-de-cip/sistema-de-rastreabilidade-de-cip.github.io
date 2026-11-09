#!/usr/bin/env bash
# Testa os scripts de desfazer.
# v8.1: o desfazer ARQUIVA os dados da v8.1 (backups, restaurações,
# operadores, histórico, vínculos, parâmetros) em vez de apagá-los, volta a
# estrutura exata da v8 e permite reaplicar a migração sem conflito.
source "$(dirname "$0")/../ambiente.sh"
cd "$(dirname "$0")"
P=("${PSQL_BASE[@]}" -v ON_ERROR_STOP=1 -At)
MIG81="$REPO_DIR/supabase/migrations/20261107120000_cip_v8_1_operadores_backup.sql"
RB81="$REPO_DIR/supabase/rollback/20261107120000_cip_v8_1_operadores_backup_desfazer.sql"
OK=0; FAIL=0
# Impressão digital da estrutura do CIP (sem os schemas de arquivo).
IMP="select md5(string_agg(x, '|' order by x)) from (
  select 'f:'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'||md5(pg_get_functiondef(p.oid)) x from pg_proc p where p.pronamespace='public'::regnamespace
  union all select 't:'||table_name||'.'||column_name||':'||data_type from information_schema.columns where table_schema='public'
  union all select 'g:'||tgrelid::regclass||'.'||tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid where not tgisinternal and c.relnamespace='public'::regnamespace
  union all select 'p:'||tablename||'.'||policyname from pg_policies where schemaname='public'
  union all select 'n:'||nspname from pg_namespace where nspname like 'cip%' and nspname not like 'cip_arquivo%') s;"
ver() { if [ "$2" = "$3" ]; then OK=$((OK+1)); echo "ok   - $1"; else FAIL=$((FAIL+1)); echo "FAIL - $1 [$2] x [$3]"; fi; }
Q() { "${P[@]}" -d "$DB" -c "$1"; }
ADM="select set_config('request.jwt.claims','{\"sub\":\"00000000-0000-0000-0000-00000000000a\"}',true);
set local role authenticated;"
OPE="select set_config('request.jwt.claims','{\"sub\":\"00000000-0000-0000-0000-00000000000b\"}',true);
set local role authenticated;"

echo "== v8.1: aplicar, usar, desfazer (com arquivamento) =="
DB=cip_rb_v8
bash recriar.sh $DB v8 || exit 1
ANTES=$(Q "$IMP")
REG_ANTES=$(Q "select count(*) from cip_registros")
"${P[@]}" -d $DB -f "$MIG81" >/dev/null 2>&1 || { echo "FAIL - aplicar v8.1"; exit 1; }
"${P[@]}" -d $DB >/dev/null <<SQL
begin; $ADM
select cadastrar_operador('Ana Lima'); select cadastrar_operador('Bruno Reis');
select alterar_status_operador(id, false) from cip_operadores where nome='Bruno Reis';
select definir_alerta_espera(48);
commit;
begin; $OPE
insert into cip_registros (tipo_cip, equipamento, bbt, data_cip, hora_inicial, hora_final, nome_operador) values
  ('completo','Tanque de Fermentação 02',null,current_date,'08:00','09:00','Ana Lima'),
  ('osam','BBT 04','BBT 04',current_date,'10:00','11:00','Ana Lima');
commit;
begin; $ADM select cip_criar_backup(); commit;
begin; $ADM select cip_criar_backup(); commit;
select cip_backup.restaurar(conteudo, false) from cip_backup.snapshots where id = 1;
SQL
SNAP_SHA=$(Q "select string_agg(checksum_total, ',' order by id) from cip_backup.snapshots")
CONT=$(Q "select (select count(*) from cip_backup.snapshots)||'|'||(select count(*) from cip_backup.restauracoes)||'|'||(select count(*) from cip_operadores)||'|'||(select count(*) from cip_operadores_historico)||'|'||(select count(*) from cip_registros where operador_id is not null)||'|'||(select alerta_espera_horas from cip_configuracao)")
ver "dados da v8.1 criados (2 backups, 1 restauração, 2 operadores, 3 eventos, 2 vínculos, alerta 48 h)" "2|1|2|3|2|48" "$CONT"
OPS_ANTES=$(Q "select string_agg(id||nome||ativo, ',' order by id) from cip_operadores")
HIST_ANTES=$(Q "select string_agg(id::text||operador_id::text||acao, ',' order by id) from cip_operadores_historico")
VINC_ANTES=$(Q "select string_agg(id::text||operador_id::text, ',' order by id) from cip_registros where operador_id is not null")

"${P[@]}" -d $DB -f "$RB81" >/dev/null 2>&1 || { echo "FAIL - desfazer v8.1"; "${P[@]}" -d $DB -f "$RB81" 2>&1 | grep ERROR; exit 1; }
ARQ=$(Q "select nspname from pg_namespace where nspname like 'cip_arquivo_v8_1_%' order by nspname desc limit 1")
ver "desfazer cria o schema de arquivo" "1" "$(Q "select count(*) from pg_namespace where nspname like 'cip_arquivo_v8_1_%'")"
ver "estrutura volta exatamente à da v8" "$ANTES" "$(Q "$IMP")"
ver "nenhum registro de CIP apagado" "$((REG_ANTES + 2))" "$(Q "select count(*) from cip_registros")"
ver "backups guardados preservados (mesmos códigos)" "$SNAP_SHA" "$(Q "select string_agg(checksum_total, ',' order by id) from $ARQ.snapshots")"
ver "conteúdo dos backups arquivados continua íntegro" "true|true" "$(Q "select string_agg((conteudo->'checksums'->>'cip_registros' = encode(sha256(convert_to((conteudo->'tabelas'->'cip_registros')::text,'UTF8')),'hex'))::text, '|' order by id) from $ARQ.snapshots")"
ver "log de restaurações preservado" "1" "$(Q "select count(*) from $ARQ.restauracoes")"
ver "operadores preservados" "$OPS_ANTES" "$(Q "select string_agg(id||nome||ativo, ',' order by id) from $ARQ.cip_operadores")"
ver "histórico dos operadores preservado, com a relação" "$HIST_ANTES" "$(Q "select string_agg(h.id::text||h.operador_id::text||h.acao, ',' order by h.id) from $ARQ.cip_operadores_historico h join $ARQ.cip_operadores o on o.id=h.operador_id")"
ver "vínculos registro → operador arquivados" "$VINC_ANTES" "$(Q "select string_agg(registro_id::text||operador_id::text, ',' order by registro_id) from $ARQ.registros_operador")"
ver "parâmetros da v8.1 arquivados" "48" "$(Q "select alerta_espera_horas from $ARQ.configuracao_v8_1")"
ver "funções históricas preservadas no arquivo" "1" "$(Q "select count(*) from pg_proc where pronamespace='$ARQ'::regnamespace and proname='restaurar'")"
ver "arquivo sem acesso pela API (anon/authenticated)" "false|false" "$(Q "select has_schema_privilege('anon','$ARQ','USAGE')||'|'||has_schema_privilege('authenticated','$ARQ','USAGE')")"
ver "histórico arquivado continua imutável" "ERROR" "$("${P[@]}" -d $DB -c "delete from $ARQ.cip_operadores_historico" 2>&1 | grep -o '^ERROR' | head -1)"
ver "regras da v8 continuam: data futura recusada" "ERROR" "$("${P[@]}" -d $DB 2>&1 <<SQL | grep -o '^ERROR' | head -1
begin; $OPE
insert into cip_registros (tipo_cip, equipamento, data_cip, hora_inicial, hora_final, nome_operador) values ('completo','Tanque de Fermentação 01',cip_hoje()+1,'08:00','09:00','Op');
rollback;
SQL
)"
ver "site da v8: cadastro e avaliação continuam funcionando no banco" "1" "$("${P[@]}" -d $DB <<SQL | tail -1
begin; $ADM
select (avaliar_cip('10000000-0000-0000-0000-000000000003','conforme',null,0)).versao;
rollback;
SQL
)"
cp "$PGTESTE_DIR/../cipteste/pg.log" /dev/null 2>&1

echo "== Reaplicar a v8.1 depois do desfazer =="
"${P[@]}" -d $DB -f "$MIG81" > "$PGTESTE_DIR/reaplicar.txt" 2>&1 && { OK=$((OK+1)); echo "ok   - v8.1 reaplicada sem conflito de nomes"; } || { FAIL=$((FAIL+1)); echo "FAIL - reaplicar a v8.1"; grep ERROR "$PGTESTE_DIR/reaplicar.txt"; }
ver "arquivo continua intacto após reaplicar" "$SNAP_SHA" "$(Q "select string_agg(checksum_total, ',' order by id) from $ARQ.snapshots")"
ver "nova v8.1 começa vazia (operadores e backups)" "0|0" "$(Q "select (select count(*) from cip_operadores)||'|'||(select count(*) from cip_backup.snapshots)")"
ver "nova v8.1 funciona (cadastro e backup)" "Ana Lima|1" "$("${P[@]}" -d $DB <<SQL | tail -1
begin; $ADM
select cadastrar_operador('Ana Lima') \g /dev/null
select cip_criar_backup() \g /dev/null
reset role;
select string_agg(nome, ',')||'|'||(select count(*) from cip_backup.snapshots) from cip_operadores;
commit;
SQL
)"
ver "registros intactos após reaplicar" "$((REG_ANTES + 2))" "$(Q "select count(*) from cip_registros")"
sleep 1.1
"${P[@]}" -d $DB -f "$RB81" >/dev/null 2>&1 && ver "segundo desfazer cria um segundo arquivo, sem conflito" "2" "$(Q "select count(*) from pg_namespace where nspname like 'cip_arquivo_v8_1_%'")" || { FAIL=$((FAIL+1)); echo "FAIL - segundo desfazer"; }
ver "primeiro arquivo segue intacto" "$SNAP_SHA" "$(Q "select string_agg(checksum_total, ',' order by id) from $ARQ.snapshots")"
ver "estrutura volta de novo à da v8" "$ANTES" "$(Q "$IMP")"
echo "$DB" > "$PGTESTE_DIR/banco_pos_desfazer.txt"

echo "== Desfazer a v8 (estrutura anterior à v8) =="
DB=cip_rb_base
bash recriar.sh $DB || exit 1
for f in "$REPO_DIR"/supabase/migrations/2026110612*.sql; do "${P[@]}" -d $DB -1 -f "$f" >/dev/null; done
"${P[@]}" -d $DB -f "$REPO_DIR/supabase/rollback/20261106120100_cip_v8_estrutura_desfazer.sql" >/dev/null
ver "desfazer a v8 remove as funções da v8" "0" "$(Q "select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('avaliar_cip','cip_texto_valido','definir_data_base_adega')")"
ver "desfazer a v8 mantém os registros originais" "27" "$(Q 'select count(*) from cip_registros')"
ver "desfazer a v8 restaura editar_registro_cip com 10 parâmetros" "10" "$(Q "select pronargs from pg_proc where proname='editar_registro_cip'")"

echo; echo "Resultado: $OK ok, $FAIL falha(s)"
[ $FAIL -eq 0 ]
