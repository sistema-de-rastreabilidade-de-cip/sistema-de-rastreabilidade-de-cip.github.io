#!/usr/bin/env bash
# Restauração de dados HISTÓRICOS fora das regras atuais (v8.1).
# Registros e edições antigos com nomes vazios, numéricos, só símbolos ou
# com espaços precisam voltar EXATAMENTE como estavam; as regras continuam
# valendo para novos registros, e a exceção não pode ser usada pela API.
source "$(dirname "$0")/../ambiente.sh"
cd "$(dirname "$0")"
ORIG=cip_hist_origem; DEST=cip_hist_destino
MIG81="${MIG81:-$REPO_DIR/supabase/migrations/20261107120000_cip_v8_1_operadores_backup.sql}"
OK=0; FAIL=0
P()  { psql -h "$PGTESTE_DIR" -p "$PGTESTE_PORTA" -U postgres -d "$1" -X -q -At -v VERBOSITY=verbose -v ON_ERROR_STOP=1 "${@:2}"; }
# Sessão igual à da API pública: conecta como "authenticator" e assume o papel.
API() { psql -h "$PGTESTE_DIR" -p "$PGTESTE_PORTA" -U authenticator -d "$1" -X -q -At -v VERBOSITY=verbose -v ON_ERROR_STOP=1 "${@:2}"; }
ver() { if [ "$2" = "$3" ]; then OK=$((OK+1)); echo "ok   - $1"; else FAIL=$((FAIL+1)); echo "FAIL - $1: esperado [$2] obtido [$3]"; fi; }
erro() { if echo "$3" | grep -q "ERROR:  $2"; then OK=$((OK+1)); echo "ok   - $1 ($2)"; else FAIL=$((FAIL+1)); echo "FAIL - $1: esperado $2"; echo "$3" | grep ERROR | head -2; [ -z "$(echo "$3" | grep ERROR)" ] && echo "  (sem erro)"; fi; }
OPE='select set_config('"'"'request.jwt.claims'"'"','"'"'{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}'"'"',true) \g /dev/null
set local role authenticated;'
ADM='select set_config('"'"'request.jwt.claims'"'"','"'"'{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}'"'"',true) \g /dev/null
set local role authenticated;'

echo "== Preparação: dados legados criados ANTES da v8.1 (banco na v8) =="
bash recriar.sh $ORIG v8 || exit 1
P $ORIG >/dev/null <<'SQL'
insert into cip_registros (id, tipo_cip, equipamento, data_cip, hora_inicial, hora_final, nome_operador) values
 ('20000000-0000-0000-0000-000000000001','completo','Tanque de Fermentação 03', current_date - 40, '08:00','09:00', ''),
 ('20000000-0000-0000-0000-000000000002','completo','Tanque de Fermentação 04', current_date - 39, '08:00','09:00', '12345'),
 ('20000000-0000-0000-0000-000000000003','completo','Tanque de Fermentação 05', current_date - 38, '08:00','09:00', '@#$%'),
 ('20000000-0000-0000-0000-000000000004','completo','Tanque de Fermentação 06', current_date - 37, '08:00','09:00', '  Nome   Com   Espaços  '),
 ('20000000-0000-0000-0000-000000000005','completo','Tanque de Fermentação 07', current_date - 36, '08:00','09:00', 'J');
insert into cip_edicoes (registro_id, valores_anteriores, valores_novos, justificativa, alterado_por_nome) values
 ('20000000-0000-0000-0000-000000000001','{}','{"a":1}','Tanque informado estava errado','1'),
 ('20000000-0000-0000-0000-000000000002','{}','{"a":2}','Horário corrigido pela operação','  x  '),
 ('20000000-0000-0000-0000-000000000003','{}','{"a":3}','Concentração digitada errada','#');
SQL
ver "dados legados inseridos na v8 (5 registros, 3 edições)" "5|5" "$(P $ORIG -c "select count(*) filter (where id::text like '20000000%') || '|' || (select count(*) from cip_edicoes) from cip_registros")"
P $ORIG -f "$MIG81" >/dev/null 2>&1 || { echo "FAIL - aplicar v8.1 na origem"; exit 1; }
ver "v8.1 aplicada sem alterar os dados legados" "|12345|@#\$%|  Nome   Com   Espaços  |J" "$(P $ORIG -c "select string_agg(nome_operador, '|' order by id) from cip_registros where id::text like '20000000%'")"
# Um registro novo vinculado a operador cadastrado (para conferir operador_id)
P $ORIG >/dev/null <<SQL
begin;
$ADM
select cadastrar_operador('Ana Lima');
$OPE
insert into cip_registros (id, tipo_cip, equipamento, data_cip, hora_inicial, hora_final, nome_operador) values ('20000000-0000-0000-0000-000000000006','completo','Tanque de Fermentação 08', current_date, '08:00','09:00','Ana Lima');
commit;
SQL
ID=$(P $ORIG <<SQL | grep -E '^[0-9]+$' | tail -1
begin;
$ADM
select (cip_criar_backup())->>'id';
commit;
SQL
)
ver "backup gerado com os dados históricos" "1" "$ID"
P $ORIG -c "select conteudo from cip_backup.snapshots where id=$ID" > "$PGTESTE_DIR/backup_historico.json"
ARQ="$(cat "$PGTESTE_DIR/backup_historico.json")"

echo "== Restauração no destino =="
bash recriar.sh $DEST v8 || exit 1
P $DEST -f "$MIG81" >/dev/null 2>&1 || { echo "FAIL - aplicar v8.1 no destino"; exit 1; }
P $DEST -c "delete from cip_edicoes; delete from cip_observacoes; delete from cip_registros;" >/dev/null
ver "simulação prevê os 33 registros (27 + 5 legados + 1)" "33" "$(P $DEST -v c="$ARQ" <<< "select cip_backup.restaurar(:'c'::jsonb) #>> '{tabelas,cip_registros,novos}';")"
OUT=$(P $DEST -v c="$ARQ" <<< "select cip_backup.restaurar(:'c'::jsonb, false) #>> '{tabelas,cip_registros,novos}';" 2>&1)
ver "restauração com nomes históricos fora das regras conclui" "33" "$(echo "$OUT" | tail -1)"
ver "nome_operador histórico preservado exatamente" "|12345|@#\$%|  Nome   Com   Espaços  |J|Ana Lima" "$(P $DEST -c "select string_agg(nome_operador, '|' order by id) from cip_registros where id::text like '20000000%'")"
ver "operador_id preservado" "$(P $ORIG -c "select operador_id from cip_registros where id='20000000-0000-0000-0000-000000000006'")" "$(P $DEST -c "select operador_id from cip_registros where id='20000000-0000-0000-0000-000000000006'")"
ver "alterado_por_nome histórico preservado exatamente (inclui espaços)" "1|  x  |#" "$(P $DEST -c "select string_agg(e.alterado_por_nome, '|' order by r.id) from cip_edicoes e join cip_registros r on r.id=e.registro_id where r.id::text like '20000000%'")"
for T in cip_registros cip_edicoes cip_operadores cip_operadores_historico; do
  ver "tabela $T idêntica ao backup (checksum)" "$(P $ORIG -c "select conteudo->'checksums'->>'$T' from cip_backup.snapshots where id=$ID")" "$(P $DEST -c "select cip_backup.montar_conteudo()->'checksums'->>'$T'")"
done
ver "datas e autores de criação preservados" "$(P $ORIG -c "select string_agg(criado_em::text||coalesce(criado_por::text,''), '|' order by id) from cip_registros")" "$(P $DEST -c "select string_agg(criado_em::text||coalesce(criado_por::text,''), '|' order by id) from cip_registros")"

echo "== As regras continuam valendo depois da restauração =="
INS="insert into cip_registros (tipo_cip, equipamento, data_cip, hora_inicial, hora_final, nome_operador) values ('completo','Tanque de Fermentação 01',current_date,'08:00','09:00',"
for NOME in "''" "'12345'" "'@#\$%'" "'J'"; do
  erro "novo registro com nome $NOME é recusado" "23514" "$(API $DEST 2>&1 <<SQL
begin;
$OPE
$INS $NOME);
rollback;
SQL
)"
done
ver "novo registro com espaços extras continua sendo padronizado" "Maria Souza" "$(API $DEST <<SQL | tail -1
begin;
$OPE
$INS '  Maria   Souza ') returning nome_operador;
rollback;
SQL
)"
ver "editar outros campos de registro histórico mantém o nome antigo" "12345" "$(API $DEST <<SQL | tail -1
begin;
$OPE
select (editar_registro_cip(id, 'Tanque de Fermentação 10', data_cip, hora_inicial, hora_final, nome_operador, dados, observacoes_operador, 'Equipamento informado estava errado', 'Pessoa Teste')).nome_operador from cip_registros where id='20000000-0000-0000-0000-000000000002';
rollback;
SQL
)"
erro "no fim da restauração o marcador é desligado (mesma transação)" "23514" "$(P $DEST -v c="$ARQ" 2>&1 <<SQL
begin;
select cip_backup.restaurar(:'c'::jsonb, false) \g /dev/null
$INS '12345');
rollback;
SQL
)"

echo "== Tentativas de contornar pela sessão da API =="
erro "operador liga o marcador e tenta gravar nome inválido" "23514" "$(API $DEST 2>&1 <<SQL
begin;
select set_config('cip.restauracao','on',true);
$OPE
$INS '12345');
rollback;
SQL
)"
erro "operador liga o marcador e tenta editar com autor inválido (função privilegiada)" "23514" "$(API $DEST 2>&1 <<SQL
begin;
select set_config('cip.restauracao','on',true);
$OPE
select editar_registro_cip('10000000-0000-0000-0000-000000000001','Tanque de Fermentação 09',current_date-1,'08:00','08:40','Operador Fictício B','{}'::jsonb,null,'Tanque informado estava errado','1');
rollback;
SQL
)"
erro "operador liga o marcador e tenta trocar o nome para inválido na edição" "23514" "$(API $DEST 2>&1 <<SQL
begin;
select set_config('cip.restauracao','on',true);
$OPE
select editar_registro_cip('10000000-0000-0000-0000-000000000001','Tanque de Fermentação 09',current_date-1,'08:00','08:40','99999','{}'::jsonb,null,'Tanque informado estava errado','Pessoa Teste');
rollback;
SQL
)"
erro "operador não executa cip_backup.restaurar" "42501" "$(API $DEST -v c="$ARQ" 2>&1 <<SQL
begin;
$OPE
select cip_backup.restaurar(:'c'::jsonb, false);
rollback;
SQL
)"
erro "supervisor não executa cip_backup.restaurar" "42501" "$(API $DEST -v c="$ARQ" 2>&1 <<SQL
begin;
$ADM
select cip_backup.restaurar(:'c'::jsonb, false);
rollback;
SQL
)"
ver "cip_em_restauracao() é falsa na sessão da API mesmo com o marcador ligado" "f" "$(API $DEST <<SQL | tail -1
begin;
select set_config('cip.restauracao','on',true) \g /dev/null
$OPE
select public.cip_em_restauracao()::text::char;
rollback;
SQL
)"

echo "== Continua não destrutiva =="
P $DEST -c "update cip_registros set observacoes_operador='alterado depois' where id='20000000-0000-0000-0000-000000000002';" >/dev/null
REL=$(P $DEST -v c="$ARQ" <<< "select cip_backup.restaurar(:'c'::jsonb, false);" | tail -1)
ver "2ª restauração: nada novo, 1 divergência só relatada" "0|1" "$(python3 -c "import json,sys; r=json.loads(sys.argv[1])['tabelas']['cip_registros']; print(r['novos'],r['divergentes'],sep='|')" "$REL")"
ver "linha divergente não foi sobrescrita" "alterado depois" "$(P $DEST -c "select observacoes_operador from cip_registros where id='20000000-0000-0000-0000-000000000002'")"
ver "nada foi apagado" "33" "$(P $DEST -c "select count(*) from cip_registros")"
ver "relatório identifica o backup de origem guardado (indicação de origem)" "null" "$(python3 -c "import json,sys; print(json.dumps(json.loads(sys.argv[1]).get('snapshot_correspondente')))" "$REL")"

echo; echo "Resultado: $OK ok, $FAIL falha(s)"
[ $FAIL -eq 0 ]
