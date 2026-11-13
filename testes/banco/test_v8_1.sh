#!/usr/bin/env bash
# Testes de banco da v8.1 — operadores, nomes, parâmetros, backup e restauração.
# Rodam SOMENTE na réplica local (bancos cip_t81_*), com dados fictícios.
source "$(dirname "$0")/../ambiente.sh"
cd "$(dirname "$0")"
ORIG=cip_t81_origem; DEST=cip_t81_destino
bash recriar.sh $ORIG todas || exit 1
bash recriar.sh $DEST todas || exit 1
ADM=00000000-0000-0000-0000-00000000000a
OPE=00000000-0000-0000-0000-00000000000b
R1=10000000-0000-0000-0000-000000000001
R2=10000000-0000-0000-0000-000000000002
OK=0; FAIL=0
P() { psql -h "$PGTESTE_DIR" -p "$PGTESTE_PORTA" -U postgres -d "$1" -X -q -At -v VERBOSITY=verbose -v ON_ERROR_STOP=1 "${@:2}"; }
como() { echo "select set_config('request.jwt.claims','{\"sub\":\"$1\",\"role\":\"authenticated\"}',true) \\g /dev/null
set local role authenticated;"; }
anon() { echo "select set_config('request.jwt.claims','{\"role\":\"anon\"}',true) \\g /dev/null
set local role anon;"; }
roda() { P "${DB:-$ORIG}" <<< "begin;
$1
${2:-rollback};" 2>&1; }
esperar_valor() { out=$(roda "$3" | grep -v -E "^(SET|BEGIN|ROLLBACK|COMMIT)$" | tail -1); if [ "$out" = "$2" ]; then OK=$((OK+1)); echo "ok   - $1"; else FAIL=$((FAIL+1)); echo "FAIL - $1: esperado [$2] obtido [$out]"; fi; }
esperar_erro() { out=$(roda "$3"); if echo "$out" | grep -q "ERROR:  $2"; then OK=$((OK+1)); echo "ok   - $1 ($2)"; else FAIL=$((FAIL+1)); echo "FAIL - $1: esperado $2"; echo "$out" | grep ERROR | head -2; fi; }
fixar() { roda "$1" commit >/dev/null; }   # grava de verdade (só na réplica)

echo "== Nomes de operador: padronização e validação =="
INS="insert into cip_registros (tipo_cip, equipamento, data_cip, hora_inicial, hora_final, nome_operador) values ('completo','Tanque de Fermentação 01',current_date,'08:00','09:00',"
esperar_valor "espaços extras removidos" "Maria Souza" "$(como $OPE) $INS '  Maria    Souza  ') returning nome_operador;"
esperar_erro  "nome vazio recusado" "23514" "$(como $OPE) $INS '   ');"
esperar_erro  "nome só com números recusado" "23514" "$(como $OPE) $INS '12345');"
esperar_erro  "nome com símbolos recusado" "23514" "$(como $OPE) $INS 'J@ão!');"
esperar_erro  "nome de 1 letra recusado" "23514" "$(como $OPE) $INS 'J');"
esperar_valor "nome com acento, hífen e apóstrofo aceito" "D'Ávila Silva-Neto" "$(como $OPE) $INS 'D''Ávila Silva-Neto') returning nome_operador;"
esperar_erro  "quem edita com nome inválido recusado" "23514" "$(como $OPE) select editar_registro_cip('$R1','Tanque de Fermentação 09',current_date-1,'08:00','08:40','Operador Fictício B','{}'::jsonb,null,'Tanque informado estava errado','1');"
esperar_valor "quem edita tem o nome padronizado" "Pessoa Teste" "$(como $OPE) select editar_registro_cip('$R1','Tanque de Fermentação 09',current_date-1,'08:00','08:40','Operador Fictício B','{}'::jsonb,null,'Tanque informado estava errado','  Pessoa   Teste '); select alterado_por_nome from cip_edicoes order by criado_em desc limit 1;"
esperar_valor "registros antigos não são alterados pela migração" "27" "select count(*) from cip_registros where operador_id is null;"

echo "== Lista de operadores =="
esperar_erro  "operador não cadastra operador" "42501" "$(como $OPE) select cadastrar_operador('Novo Nome');"
esperar_erro  "anon não cadastra operador" "42501" "$(anon) select cadastrar_operador('Novo Nome');"
esperar_erro  "ninguém grava direto em cip_operadores" "42501" "$(como $ADM) insert into cip_operadores (nome, criado_por_nome) values ('Fulano','x');"
esperar_valor "supervisor cadastra operador (nome padronizado)" "Ana Lima|true" "$(como $ADM) select (o).nome||'|'||(o).ativo from (select cadastrar_operador('  Ana   Lima ') o) s;"
esperar_erro  "nome duplicado (sem acento/maiúscula) recusado" "23505" "$(como $ADM) select cadastrar_operador('Ana Lima'); select cadastrar_operador('ANA LÍMA');"
esperar_erro  "nome inválido no cadastro recusado" "23514" "$(como $ADM) select cadastrar_operador('A1');"
esperar_erro  "operadores não podem ser apagados (nem pelo dono do banco)" "42501" "$(como $ADM) select cadastrar_operador('Ana Lima'); reset role; delete from cip_operadores;"
esperar_valor "desativar e reativar ficam no histórico" "cadastrar,desativar,reativar" "$(como $ADM) select alterar_status_operador(id, false) from (select (cadastrar_operador('Ana Lima')).id) s \\g /dev/null
select alterar_status_operador(id, true) from cip_operadores where nome='Ana Lima' \\g /dev/null
select string_agg(acao, ',' order by id) from cip_operadores_historico;"
esperar_erro  "histórico de operadores é imutável" "42501" "$(como $ADM) select cadastrar_operador('Ana Lima'); reset role; update cip_operadores_historico set nome='x';"
esperar_valor "operador vê a lista, mas não o histórico do cadastro" "1|0" "$(como $ADM) select cadastrar_operador('Ana Lima') \\g /dev/null
$(como $OPE) select (select count(*) from cip_operadores)||'|'||(select count(*) from cip_operadores_historico);"
esperar_valor "registro com nome cadastrado recebe a grafia oficial e o vínculo" "Ana Lima|t" "$(como $ADM) select cadastrar_operador('Ana Lima') \\g /dev/null
$(como $OPE) $INS 'ana  lima') returning nome_operador||'|'||(operador_id is not null)::text::char;"

echo "== Exigência de operador cadastrado (desligada por padrão) =="
esperar_valor "por padrão, nome livre continua aceito" "Nome Livre" "$(como $OPE) $INS 'Nome Livre') returning nome_operador;"
esperar_erro  "não liga a exigência sem operador ativo" "23514" "$(como $ADM) select definir_exigencia_operador(true);"
esperar_erro  "operador não liga a exigência" "42501" "$(como $OPE) select definir_exigencia_operador(true);"
LIGA="$(como $ADM) select cadastrar_operador('Ana Lima') \\g /dev/null
select definir_exigencia_operador(true) \\g /dev/null
"
esperar_erro  "com a exigência ligada, nome fora da lista é recusado" "23514" "$LIGA $(como $OPE) $INS 'Nome Livre');"
esperar_valor "com a exigência ligada, nome da lista é aceito" "Ana Lima" "$LIGA $(como $OPE) $INS 'Ana Lima') returning nome_operador;"
esperar_erro  "operador inativo é recusado com a exigência ligada" "23514" "$LIGA select alterar_status_operador(id,false) from cip_operadores \\g /dev/null
$(como $OPE) $INS 'Ana Lima');"
esperar_valor "editar outros campos de registro antigo continua possível" "ok" "$LIGA $(como $OPE) select editar_registro_cip('$R1','Tanque de Fermentação 09',current_date-1,'08:00','08:40',nome_operador,'{}'::jsonb,null,'Tanque informado estava errado','Pessoa Teste') from cip_registros where id='$R1' \\g /dev/null
select 'ok';"

echo "== Alerta de espera (sem prazo inventado) =="
esperar_valor "sem alerta por padrão" "" "select coalesce(alerta_espera_horas::text,'') from cip_configuracao;"
esperar_valor "supervisor define 48 h" "48" "$(como $ADM) select definir_alerta_espera(48); select alerta_espera_horas from cip_configuracao;"
esperar_valor "supervisor remove o alerta" "" "$(como $ADM) select definir_alerta_espera(48); select definir_alerta_espera(null); select coalesce(alerta_espera_horas::text,'') from cip_configuracao;"
esperar_erro  "fora de 1..720 recusado" "22023" "$(como $ADM) select definir_alerta_espera(0);"
esperar_erro  "operador não altera o alerta" "42501" "$(como $OPE) select definir_alerta_espera(10);"

echo "== Backup: permissões =="
esperar_erro  "operador não gera backup" "42501" "$(como $OPE) select cip_criar_backup();"
esperar_erro  "anon não gera backup" "42501" "$(anon) select cip_criar_backup();"
esperar_erro  "operador não lista backups" "42501" "$(como $OPE) select * from cip_listar_backups();"
esperar_erro  "operador não exporta backup" "42501" "$(como $OPE) select cip_obter_backup(1);"
esperar_erro  "schema cip_backup inacessível pela API (authenticated)" "42501" "$(como $ADM) select count(*) from cip_backup.snapshots;"
esperar_erro  "restauração não executável por usuário da API" "42501" "$(como $ADM) select cip_backup.restaurar('{}'::jsonb);"
esperar_erro  "backups guardados são imutáveis" "42501" "$(como $ADM) select cip_criar_backup(); reset role; delete from cip_backup.snapshots;"

echo "== Backup: geração com dados de todas as tabelas (réplica de origem) =="
fixar "$(como $ADM) select cadastrar_operador('Ana Lima') \\g /dev/null
select cadastrar_operador('Bruno Reis') \\g /dev/null
select avaliar_cip('$R2','contaminado','Resíduo no cone após enxágue',0) \\g /dev/null
select avaliar_cip('10000000-0000-0000-0000-000000000003','conforme',null,0) \\g /dev/null
insert into cip_observacoes (registro_id, texto, administrador_nome) values ('$R2','Conferir laudo microbiológico','x') \\g /dev/null
select definir_data_base_adega('Adega B','completo',current_date-100) \\g /dev/null
$(como $OPE) select editar_registro_cip('$R2','Tanque de Fermentação 22',current_date-2,'08:00','08:40','Operador Fictício C','{}'::jsonb,null,'Tanque informado estava errado','Pessoa Teste') \\g /dev/null
insert into cip_registros (tipo_cip, equipamento, bbt, data_cip, hora_inicial, hora_final, nome_operador, dados) values ('osam','BBT 03','BBT 03',current_date,'08:00','09:00','Ana Lima','{\"conc_inicial_soda\":\"1,8%\"}') \\g /dev/null"
ID=$(roda "$(como $ADM) select (cip_criar_backup())->>'id';" commit | grep -E '^[0-9]+$' | tail -1)
[ -n "$ID" ] && { OK=$((OK+1)); echo "ok   - backup gerado (id $ID)"; } || { FAIL=$((FAIL+1)); echo "FAIL - backup não gerado"; }
esperar_valor "listagem mostra o backup com contagens" "28|2|2|1|1" "$(como $ADM) select (contagens->>'cip_registros')||'|'||(contagens->>'cip_operadores')||'|'||(contagens->>'cip_avaliacoes_historico')||'|'||(contagens->>'cip_observacoes')||'|'||(contagens->>'adega_datas_base') from cip_listar_backups() where id=$ID;"
esperar_valor "verificação de integridade aprova o backup" "true" "$(como $ADM) select cip_verificar_backup($ID)->'validacao'->>'valido';"
esperar_valor "verificação compara com o banco atual (tudo igual, nada novo)" "0|28" "$(como $ADM) select (cip_verificar_backup($ID)->'comparacao'->'tabelas'->'cip_registros'->>'novos')||'|'||(cip_verificar_backup($ID)->'comparacao'->'tabelas'->'cip_registros'->>'iguais');"
P $ORIG -c "select conteudo from cip_backup.snapshots where id=$ID" > "$PGTESTE_DIR/backup_teste.json"
P $ORIG -c "select checksum_total from cip_backup.snapshots where id=$ID" > "$PGTESTE_DIR/backup_teste.sha"
chmod 644 "$PGTESTE_DIR"/backup_teste.*

echo "== Validação do arquivo =="
ARQ="$(cat "$PGTESTE_DIR/backup_teste.json")"
VAL() { P $DEST -v c="$1" <<< "select cip_backup.validar_arquivo(:'c'::jsonb)->>'valido';" 2>&1 | tail -1; }
[ "$(VAL "$ARQ")" = "true" ] && { OK=$((OK+1)); echo "ok   - arquivo íntegro é aceito"; } || { FAIL=$((FAIL+1)); echo "FAIL - arquivo íntegro recusado"; }
ADULT=$(echo "$ARQ" | sed 's/Resíduo no cone após enxágue/Texto adulterado no arquivo/')
[ "$(VAL "$ADULT")" = "false" ] && { OK=$((OK+1)); echo "ok   - arquivo adulterado é detectado (checksum)"; } || { FAIL=$((FAIL+1)); echo "FAIL - adulteração não detectada"; }
VERS=$(echo "$ARQ" | sed 's/"versao": 1/"versao": 2/')
[ "$(VAL "$VERS")" = "false" ] && { OK=$((OK+1)); echo "ok   - versão de formato incompatível é recusada"; } || { FAIL=$((FAIL+1)); echo "FAIL - versão não verificada"; }
[ "$(VAL '{"formato":"outro"}')" = "false" ] && { OK=$((OK+1)); echo "ok   - formato desconhecido é recusado"; } || { FAIL=$((FAIL+1)); echo "FAIL - formato não verificado"; }
OUT=$(P $DEST -v c="$ADULT" <<< "select cip_backup.restaurar(:'c'::jsonb, false);" 2>&1)
echo "$OUT" | grep -q "inválido" && { OK=$((OK+1)); echo "ok   - restauração recusa arquivo adulterado"; } || { FAIL=$((FAIL+1)); echo "FAIL - restauração aceitou arquivo adulterado"; }

echo "== Restauração num banco vazio (réplica de destino) =="
P $DEST -c "delete from cip_edicoes; delete from cip_observacoes; delete from cip_registros;" >/dev/null
SIM=$(P $DEST -v c="$ARQ" <<< "select cip_backup.restaurar(:'c'::jsonb) #>> '{tabelas,cip_registros,novos}';" | tail -1)
[ "$SIM" = "28" ] && { OK=$((OK+1)); echo "ok   - simulação (padrão) prevê 28 registros novos"; } || { FAIL=$((FAIL+1)); echo "FAIL - simulação: [$SIM]"; }
[ "$(P $DEST -c 'select count(*) from cip_registros' | tail -1)" = "0" ] && { OK=$((OK+1)); echo "ok   - simulação não grava nada"; } || { FAIL=$((FAIL+1)); echo "FAIL - simulação gravou dados"; }
P $DEST -v c="$ARQ" <<< "select cip_backup.restaurar(:'c'::jsonb, false);" > "$PGTESTE_DIR/restauracao.txt" 2>&1 || { FAIL=$((FAIL+1)); echo "FAIL - restauração falhou"; cat "$PGTESTE_DIR/restauracao.txt" | head -5; }
NOVO=$(P $DEST -c "select cip_backup.montar_conteudo()->'checksums'" | tail -1)
ORIGC=$(P $ORIG -c "select conteudo->'checksums' from cip_backup.snapshots where id=$ID" | tail -1)
python3 - "$ORIGC" "$NOVO" <<'PY' && OK=$((OK+1)) || FAIL=$((FAIL+1))
import json,sys
a=json.loads(sys.argv[1]); b=json.loads(sys.argv[2])
# perfis/configuração/procedimentos já existiam no destino; as demais tabelas devem ficar idênticas ao backup
# cip_adega_controles (v10) também é configuração criada pela migração no destino
dif=[t for t in a if t not in ('cip_configuracao','perfis','cip_adega_controles') and a[t]!=b[t]]
print(("ok   - dados restaurados idênticos ao backup (checksums por tabela)") if not dif else ("FAIL - tabelas diferentes após restaurar: %s" % dif))
sys.exit(1 if dif else 0)
PY
DB=$DEST esperar_valor "datas e autores originais preservados (observação)" "Administração (teste)|$ADM" "select administrador_nome||'|'||administrador_uid from cip_observacoes limit 1;"
CRIADO=$(P $ORIG -c "select criado_em||'|'||coalesce(criado_por::text,'') from cip_registros where id='$R2'" | tail -1)
DB=$DEST esperar_valor "criado_em e criado_por originais preservados" "$CRIADO" "select criado_em||'|'||coalesce(criado_por::text,'') from cip_registros where id='$R2';"
DB=$DEST esperar_valor "restauração registrada no log" "1" "select count(*) from cip_backup.restauracoes;"
DB=$DEST esperar_valor "sequência de ids continua depois do restaurado" "t" "$(como $ADM) select definir_data_base_adega('Adega A','completo',current_date-50) \\g /dev/null
select ((select max(id) from adega_datas_base) > 1)::text::char;"
DB=$DEST esperar_valor "avaliação restaurada continua funcionando (versão 2 após correção)" "2" "$(como $ADM) select (avaliar_cip('10000000-0000-0000-0000-000000000003','contaminado','Correção após laudo do laboratório',1)).versao;"

echo "== Restauração não destrutiva =="
P $DEST -c "update cip_registros set observacoes_operador='alterado depois do backup' where id='$R1';" >/dev/null
REL=$(P $DEST -v c="$ARQ" <<< "select cip_backup.restaurar(:'c'::jsonb, false);" | tail -1)
python3 - "$REL" <<'PY' && OK=$((OK+1)) || FAIL=$((FAIL+1))
import json,sys
r=json.loads(sys.argv[1])['tabelas']['cip_registros']
ok = r['novos']==0 and r['divergentes']==1 and r['iguais']==27
print(("ok   - 2ª restauração: nada novo, divergência só relatada" if ok else "FAIL - relatório inesperado: %s" % r)); sys.exit(0 if ok else 1)
PY
DB=$DEST esperar_valor "linha divergente NÃO foi sobrescrita" "alterado depois do backup" "select observacoes_operador from cip_registros where id='$R1';"
DB=$DEST esperar_valor "nenhuma linha apagada pela restauração" "28" "select count(*) from cip_registros;"

echo "== FTR intocado =="
esperar_valor "tabelas do FTR inalteradas" "1|1|1|1" "select (select count(*) from painel_months)||'|'||(select count(*) from painel_current)||'|'||(select count(*) from painel_publications)||'|'||(select count(*) from painel_publicadores);"
esperar_valor "backup não inclui tabelas do FTR" "0" "select count(*) from jsonb_object_keys(cip_backup.montar_conteudo()->'tabelas') k where k like 'painel%';"

echo
echo "Resultado: $OK ok, $FAIL falha(s)"
[ $FAIL -eq 0 ]
