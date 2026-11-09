#!/usr/bin/env bash
# Testes de banco da v9 (CIP Filtração — Filtro 3 e BMF). Banco LOCAL, dados fictícios.
source "$(dirname "$0")/../ambiente.sh"
cd "$(dirname "$0")"
P=("${PSQL_BASE[@]}" -v ON_ERROR_STOP=1 -At)
M1="$REPO_DIR/supabase/migrations/20261109120000_cip_v9_tipos_filtracao.sql"
M2="$REPO_DIR/supabase/migrations/20261109120100_cip_v9_regras_filtracao.sql"
RB="$REPO_DIR/supabase/rollback/20261109120100_cip_v9_desfazer.sql"
OK=0; FAIL=0
ver() { if [ "$2" = "$3" ]; then OK=$((OK+1)); echo "ok   - $1"; else FAIL=$((FAIL+1)); echo "FAIL - $1 [$2] x [$3]"; fi; }
Q() { "${P[@]}" -d "$DB" -c "$1" 2>&1; }
OPE="select set_config('request.jwt.claims','{\"sub\":\"00000000-0000-0000-0000-00000000000b\"}',true); set local role authenticated;"
ADM="select set_config('request.jwt.claims','{\"sub\":\"00000000-0000-0000-0000-00000000000a\"}',true); set local role authenticated;"
INS="insert into cip_registros (tipo_cip, equipamento, data_cip, hora_inicial, hora_final, nome_operador, dados)"

echo "== Guarda: v9 exige a v8.1 =="
DB=cip_v9_guarda
bash recriar.sh $DB v8 >/dev/null || exit 1
ver "migração 1 recusada sem a v8.1" "$("${P[@]}" -d $DB -f "$M1" >/dev/null 2>&1; echo $?)" "3"
ver "nada aplicado (enum sem filtracao)" "$(Q "select count(*) from pg_enum where enumlabel like 'filtracao%'")" "0"
DB=cip_v9_ordem
bash recriar.sh $DB v8 >/dev/null || exit 1
"${P[@]}" -d $DB -f "$REPO_DIR/supabase/migrations/20261107120000_cip_v8_1_operadores_backup.sql" >/dev/null 2>&1
ver "migração 2 recusada antes da migração 1" "$("${P[@]}" -d $DB -f "$M2" >/dev/null 2>&1; echo $?)" "3"

echo "== Banco com todas as migrações =="
DB=cip_v9
bash recriar.sh $DB todas >/dev/null || exit 1
ver "enum tem os 2 tipos novos" "$(Q "select string_agg(enumlabel, ',' order by enumlabel) from pg_enum where enumlabel like 'filtracao%'")" "filtracao_bmf,filtracao_filtro3"
ver "7 valores no tipo de CIP" "$(Q "select count(*) from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='tipo_cip_enum'")" "7"
ver "regra de data futura inclui os 5 antigos e os 2 novos" "$(Q "select cardinality(tipos_data_futura) from cip_configuracao")" "7"
ver "migrações reaplicadas não mudam nada (idempotentes)" "$("${P[@]}" -d $DB -f "$M1" -f "$M2" >/dev/null 2>&1; Q "select cardinality(tipos_data_futura) from cip_configuracao")" "7"

R=$("${P[@]}" -d $DB 2>&1 <<SQL
begin; $OPE
$INS values ('filtracao_filtro3','Tanque de Cerveja Maturada — UBT',current_date,'08:00','09:00','Ana Lima','{"f3_ciclo":"1","f3_temperatura_solucao":"80 °C"}');
$INS values ('filtracao_bmf','Filtro de Cerveja de Membrana — BMF',current_date,'10:00','11:00','Ana Lima','{"bmf_soaking":"NÃO","bmf_conc_inicial_soda":"9%"}');
commit;
SQL
)
ver "operador grava Filtro 3 e BMF (valor fora da faixa de referência aceito)" "$(Q "select count(*) from cip_registros where tipo_cip::text like 'filtracao%'")" "2"
ver "data futura recusada no Filtro 3" "$("${P[@]}" -d $DB -c "begin; $OPE $INS values ('filtracao_filtro3','UBT',current_date+1,'08:00','09:00','Ana Lima','{}'); commit;" >/dev/null 2>&1; echo $?)" "1"
ver "data futura recusada no BMF" "$("${P[@]}" -d $DB -c "begin; $OPE $INS values ('filtracao_bmf','UBT',current_date+1,'08:00','09:00','Ana Lima','{}'); commit;" >/dev/null 2>&1; echo $?)" "1"
ver "nome de operador inválido recusado também na Filtração" "$("${P[@]}" -d $DB -c "begin; $OPE $INS values ('filtracao_bmf','UBT',current_date,'08:00','09:00','123','{}'); commit;" >/dev/null 2>&1; echo $?)" "1"
ver "supervisor não grava registro de Filtração" "$("${P[@]}" -d $DB -c "begin; $ADM $INS values ('filtracao_bmf','UBT',current_date,'08:00','09:00','Ana Lima','{}'); commit;" >/dev/null 2>&1; echo $?)" "1"
ID=$(Q "select id from cip_registros where tipo_cip='filtracao_bmf'")
"${P[@]}" -d $DB >/dev/null 2>&1 <<SQL
begin; $ADM select avaliar_cip('$ID'::uuid, 'conforme', null, 0); commit;
SQL
ver "supervisor avalia registro de Filtração" "$(Q "select situacao_avaliacao from vw_cip_registros where id='$ID'")" "conforme"
"${P[@]}" -d $DB >/dev/null 2>&1 <<SQL
begin; $ADM select cip_criar_backup(); commit;
SQL
ver "backup inclui os dados da Filtração" "$(Q "select count(*) from cip_backup.snapshots s, jsonb_array_elements(s.conteudo->'tabelas'->'cip_registros') r where r->>'tipo_cip' like 'filtracao%' and r->'dados' ? case when r->>'tipo_cip'='filtracao_bmf' then 'bmf_soaking' else 'f3_ciclo' end")" "2"
DB2=cip_v9_dest
bash recriar.sh $DB2 todas >/dev/null || exit 1
"${P[@]}" -d $DB -c "copy (select conteudo from cip_backup.snapshots order by id desc limit 1) to stdout" > "$PGTESTE_DIR/v9_backup.json"
"${P[@]}" -d $DB2 >/dev/null 2>&1 <<SQL
\set c \`cat $PGTESTE_DIR/v9_backup.json\`
select cip_backup.restaurar(:'c'::jsonb, false);
SQL
ver "restauração leva os registros de Filtração com os dados idênticos" \
  "$(DB=$DB2 Q "select md5(string_agg(id::text||dados::text, '|' order by id)) from cip_registros where tipo_cip::text like 'filtracao%'")" \
  "$(Q "select md5(string_agg(id::text||dados::text, '|' order by id)) from cip_registros where tipo_cip::text like 'filtracao%'")"

echo "== Desfazer v9 =="
"${P[@]}" -d $DB -f "$RB" >/dev/null 2>&1
ver "desfazer tira os 2 tipos da regra e mantém os 5 antigos" "$(Q "select string_agg(t::text, ',' order by t::text) from cip_configuracao, unnest(tipos_data_futura) t")" \
  "alcalino_clorado,completo,linha_recuperacao_levedura,osam,tanque_levedura"
ver "desfazer não apaga registros de Filtração" "$(Q "select count(*) from cip_registros where tipo_cip::text like 'filtracao%'")" "2"
ver "reaplicar a migração 2 depois do desfazer" "$("${P[@]}" -d $DB -f "$M2" >/dev/null 2>&1; Q "select cardinality(tipos_data_futura) from cip_configuracao")" "7"
ver "tabelas do FTR intocadas" "$(Q "select count(*) from pg_class where relname like 'painel_%' and relnamespace='public'::regnamespace")" "$(DB=cip_v9_guarda Q "select count(*) from pg_class where relname like 'painel_%' and relnamespace='public'::regnamespace")"
echo
echo "Resultado: $OK ok, $FAIL falha(s)"
[ $FAIL -eq 0 ]
