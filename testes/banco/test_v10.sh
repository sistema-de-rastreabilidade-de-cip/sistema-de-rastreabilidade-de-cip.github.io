#!/usr/bin/env bash
# Testes de banco da v10: Adega no modo geral, CIP Alcalino, faixas dos
# parâmetros, rastreabilidade de contaminação, backup e desfazer.
# Banco LOCAL com dados fictícios — nada de produção.
source "$(dirname "$0")/../ambiente.sh"
cd "$(dirname "$0")"
P=("${PSQL_BASE[@]}" -v ON_ERROR_STOP=1 -At)
M1="$REPO_DIR/supabase/migrations/20261113120000_cip_v10_tipo_alcalino.sql"
M2="$REPO_DIR/supabase/migrations/20261113120100_cip_v10_adega_faixas_mapa.sql"
RB="$REPO_DIR/supabase/rollback/20261113120100_cip_v10_desfazer.sql"
OK=0; FAIL=0
ver() { if [ "$2" = "$3" ]; then OK=$((OK+1)); echo "ok   - $1"; else FAIL=$((FAIL+1)); echo "FAIL - $1 [$2] x [$3]"; fi; }
Q() { "${P[@]}" -d "$DB" -c "$1" 2>&1; }
# Executa numa transação e devolve "ok" ou o código do erro (SQLSTATE).
E() {
  local out
  out=$("${PSQL_BASE[@]}" -At -v ON_ERROR_STOP=1 -d "$DB" -c "\\set VERBOSITY verbose" -c "begin; $1; commit;" 2>&1)
  if [ $? -eq 0 ]; then echo ok; else echo "$out" | grep -oE "ERROR:  [0-9A-Z]{5}" | head -1 | cut -c9-; fi
}
OPE="select set_config('request.jwt.claims','{\"sub\":\"00000000-0000-0000-0000-00000000000b\"}',true); set local role authenticated;"
ADM="select set_config('request.jwt.claims','{\"sub\":\"00000000-0000-0000-0000-00000000000a\"}',true); set local role authenticated;"
ANON="select set_config('request.jwt.claims','{\"role\":\"anon\"}',true); set local role anon;"
INS="insert into cip_registros (tipo_cip, equipamento, data_cip, hora_inicial, hora_final, nome_operador, dados)"

echo "== Travas de ordem e de reaplicação =="
DB=cip_v10_guarda
bash recriar.sh $DB v8 >/dev/null || exit 1
"${P[@]}" -d $DB -f "$REPO_DIR/supabase/migrations/20261107120000_cip_v8_1_operadores_backup.sql" >/dev/null 2>&1
ver "migração 1 recusada sem a v9" "$("${P[@]}" -d $DB -f "$M1" >/dev/null 2>&1; echo $?)" "3"
ver "migração 2 recusada antes da migração 1" "$("${P[@]}" -d $DB -f "$M2" >/dev/null 2>&1; echo $?)" "3"
ver "nada aplicado" "$(Q "select count(*) from pg_class where relname in ('cip_adega_controles','cip_parametros_faixas')")" "0"

DB=cip_v10
bash recriar.sh $DB todas >/dev/null || exit 1
ver "migração 2 não pode ser aplicada duas vezes" "$("${P[@]}" -d $DB -f "$M2" >/dev/null 2>&1; echo $?)" "3"
ver "objetos do FTR intocados pela v10" "$(Q "select count(*) from pg_class where relname like 'painel_%'")" "$(DB=cip_v10_guarda Q "select count(*) from pg_class where relname like 'painel_%'")"
ver "nenhum objeto novo fora do padrão do CIP" "$(Q "select count(*) from pg_class c where c.relnamespace='public'::regnamespace and c.relname not like 'cip\_%' and c.relname not like 'vw\_cip\_%' and c.relname not like 'vw\_adega\_%' and c.relname not like 'adega\_%' and c.relname not like 'painel\_%' and c.relname not like 'perfis%' and c.relname not like 'idx\_%' and c.relname not like 'pk\_%' and c.relkind in ('r','v')")" "0"

echo "== CIP Alcalino e equipamentos =="
ver "tipo 'alcalino' existe" "$(Q "select count(*) from pg_enum where enumlabel='alcalino'")" "1"
ver "data futura vale para o CIP Alcalino" "$(Q "select 'alcalino' = any(tipos_data_futura) from cip_configuracao")" "t"
ver "operador grava CIP Alcalino na Adega D" "$(E "$OPE $INS values ('alcalino','Adega D',current_date,'08:00','09:00','Ana Lima','{\"conc_inicial_soda\":\"2%\"}')")" "ok"
ver "CIP Alcalino com data futura recusado" "$(E "$OPE $INS values ('alcalino','Adega A',current_date+1,'08:00','09:00','Ana Lima','{}')")" "23514"
ver "CIP TFM/HORAP/Trasfega/DAW (completo) aceita Adega A, B e D" "$(E "$OPE $INS values ('completo','Adega A',current_date,'08:00','09:00','Ana Lima','{}'), ('completo','Adega B',current_date,'08:00','09:00','Ana Lima','{}'), ('completo','Adega D',current_date,'08:00','09:00','Ana Lima','{}')")" "ok"
ver "OSAN continua exigindo BBT" "$(E "$OPE $INS values ('osam','X',current_date,'08:00','09:00','Ana Lima','{}')")" "23514"
ver "OSAN com BBT 05 grava e o equipamento é o BBT" "$(E "$OPE insert into cip_registros (tipo_cip, bbt, equipamento, data_cip, hora_inicial, hora_final, nome_operador, dados) values ('osam','BBT 05','x',current_date,'08:00','09:00','Ana Lima','{}')" >/dev/null; Q "select equipamento from cip_registros where tipo_cip='osam' and bbt='BBT 05'")" "BBT 05"

echo "== Controles da Adega (modo geral) =="
ver "três procedimentos, com as periodicidades informadas" "$(Q "select string_agg(tipo_cip||':'||coalesce(periodo_quantidade::text,'-')||coalesce(periodo_unidade,''), ',' order by ordem) from cip_adega_controles")" "alcalino:30dias,alcalino_clorado:6meses,osam:-"
ver "OSAN sem periodicidade inventada" "$(Q "select periodo_quantidade is null and periodo_unidade is null from cip_adega_controles where tipo_cip='osam'")" "t"
ver "carga inicial registrada na própria linha; histórico começa vazio" "$(Q "select count(*) from cip_adega_controles where atualizado_por_nome='Migração CIP v10'")-$(Q "select count(*) from cip_adega_controles_historico")" "3-0"
ver "operador lê os controles" "$(E "$OPE select count(*) from cip_adega_controles")" "ok"
ver "anônimo não lê os controles" "$(E "$ANON select count(*) from cip_adega_controles")" "42501"
ver "operador não altera periodicidade" "$(E "$OPE select definir_periodicidade_adega('osam', 30, 'dias')")" "42501"
ver "operador não grava direto na tabela" "$(E "$OPE update cip_adega_controles set periodo_quantidade = 1")" "42501"
ver "periodicidade sem unidade recusada" "$(E "$ADM select definir_periodicidade_adega('osam', 30, null)")" "22023"
ver "unidade inválida recusada" "$(E "$ADM select definir_periodicidade_adega('osam', 30, 'semanas')")" "22023"
ver "supervisor define periodicidade do OSAN" "$(E "$ADM select definir_periodicidade_adega('osam', 2, 'meses', 10)")" "ok"
ver "periodicidade e antecedência gravadas" "$(Q "select periodo_quantidade||periodo_unidade||dias_aviso||' por '||atualizado_por_nome from cip_adega_controles where tipo_cip='osam'")" "2meses10 por Administração (teste)"
ver "supervisor volta o OSAN para pendente" "$(E "$ADM select definir_periodicidade_adega('osam', null, null)" >/dev/null; Q "select coalesce(periodo_quantidade::text,'pendente') from cip_adega_controles where tipo_cip='osam'")" "pendente"
ver "toda alteração fica no histórico (imutável)" "$(Q "select count(*) from cip_adega_controles_historico")-$(E "update cip_adega_controles_historico set por_nome='x'")" "2-42501"
ver "procedimento da Adega não pode ser apagado" "$(E "delete from cip_adega_controles where tipo_cip='osam'")" "42501"

echo "== Data-base no modo geral =="
ver "data-base recusada quando já há registro do procedimento (Alcalino)" "$(E "$ADM select definir_data_base_adega_geral('alcalino', current_date-10)")" "23514"
"${P[@]}" -d $DB -c "$INS values ('alcalino_clorado','Tanque de Fermentação 08',current_date-3,'08:00','09:00','Ana Lima','{}')" >/dev/null
ver "Alcalino Clorado no tanque de fermentação não conta para a Adega" "$(E "$ADM select definir_data_base_adega_geral('alcalino_clorado', current_date-200)")" "ok"
ver "data-base atual aparece na view" "$(Q "select (current_date - data_base) from vw_cip_adega_datas_base_atual where tipo_cip='alcalino_clorado'")" "200"
ver "data-base futura recusada" "$(E "$ADM select definir_data_base_adega_geral('osam', current_date+1)")" "23514"
ver "operador não define data-base" "$(E "$OPE select definir_data_base_adega_geral('alcalino_clorado', current_date-5)")" "42501"
ver "remover data-base" "$(E "$ADM select remover_data_base_adega_geral('alcalino_clorado')" >/dev/null; Q "select count(*) from vw_cip_adega_datas_base_atual where tipo_cip='alcalino_clorado'")" "0"
ver "eventos de data-base são só inclusão" "$(E "delete from cip_adega_datas_base")" "42501"
"${P[@]}" -d $DB -c "$INS values ('alcalino_clorado','Adega B',current_date-1,'08:00','09:00','Ana Lima','{}')" >/dev/null
ver "Alcalino Clorado na Adega B conta para a Adega" "$(E "$ADM select definir_data_base_adega_geral('alcalino_clorado', current_date-200)")" "23514"
ver "regra de contagem: alcalino_clorado só em adega" "$(Q "select string_agg(cip_registro_conta_adega(t::tipo_cip_enum, e)::text, ',') from (values ('alcalino_clorado','Adega D'),('alcalino_clorado','Tanque de Fermentação 08'),('alcalino','Adega A'),('osam','BBT 01'),('completo','Adega A')) v(t,e)")" "true,false,true,true,false"

echo "== Faixas dos parâmetros =="
ver "tabela de faixas nasce vazia (nenhum limite inventado)" "$(Q "select count(*) from cip_parametros_faixas")" "0"
ver "sem faixa: registro sem verificação (comparação desligada)" "$(Q "select count(*) from cip_registros where verificacao_parametros is not null")" "0"
ver "operador não define faixa" "$(E "$OPE select definir_faixa_parametro('completo','conc_inicial_soda',2,4,'%',true)")" "42501"
ver "faixa sem limites recusada" "$(E "$ADM select definir_faixa_parametro('completo','conc_inicial_soda',null,null,'%',true)")" "22023"
ver "mínimo maior que máximo recusado" "$(E "$ADM select definir_faixa_parametro('completo','conc_inicial_soda',5,4,'%',true)")" "22023"
ver "parâmetro com nome inválido recusado" "$(E "$ADM select definir_faixa_parametro('completo','Conc Soda; drop',1,4,'%',true)")" "22023"
# Valores FICTÍCIOS só para o teste (nunca em produção).
ver "supervisor cadastra faixa fictícia de teste" "$(E "$ADM select definir_faixa_parametro('completo','conc_inicial_soda',2,4,'%',true); select definir_faixa_parametro('completo','pressao',null,3,'bar',true)")" "ok"
"${P[@]}" -d $DB >/dev/null 2>&1 <<SQL
begin; $OPE
$INS values ('completo','Tanque de Fermentação 51',current_date,'08:00','09:00','Ana Lima','{"conc_inicial_soda":"9%","pressao":"2,5 bar"}');
$INS values ('completo','Tanque de Fermentação 52',current_date,'08:00','09:00','Ana Lima','{"conc_inicial_soda":"1,5 %","pressao":""}');
$INS values ('completo','Tanque de Fermentação 53',current_date,'08:00','09:00','Ana Lima','{"conc_inicial_soda":"3","pressao":"ok"}');
insert into cip_registros (tipo_cip, equipamento, data_cip, hora_inicial, hora_final, nome_operador, dados, verificacao_parametros)
values ('completo','Tanque de Fermentação 54',current_date,'08:00','09:00','Ana Lima','{"conc_inicial_soda":"99"}','{"fora_da_faixa":0,"itens":[]}');
commit;
SQL
V() { Q "select (select string_agg(i->>'campo'||'='||(i->>'situacao'), ',' order by i->>'campo') from jsonb_array_elements(verificacao_parametros->'itens') i)||' fora='||(verificacao_parametros->>'fora_da_faixa') from cip_registros where equipamento='$1' and tipo_cip='completo'"; }
ver "acima do máximo detectado; pressão dentro" "$(V 'Tanque de Fermentação 51')" "conc_inicial_soda=acima,pressao=dentro fora=1"
ver "abaixo do mínimo; campo vazio = não preenchido" "$(V 'Tanque de Fermentação 52')" "conc_inicial_soda=abaixo,pressao=sem_valor fora=1"
ver "dentro da faixa; texto sem número não é comparado" "$(V 'Tanque de Fermentação 53')" "conc_inicial_soda=dentro,pressao=nao_numerico fora=0"
ver "operador não consegue forjar o resultado" "$(V 'Tanque de Fermentação 54')" "conc_inicial_soda=acima,pressao=sem_valor fora=1"
ver "valores digitados preservados exatamente" "$(Q "select dados->>'conc_inicial_soda' from cip_registros where equipamento='Tanque de Fermentação 52'")" "1,5 %"
ver "resultado guarda valor, número, limites e unidade" "$(Q "select i->>'valor'||'|'||(i->>'numero')||'|'||coalesce(i->>'minimo','-')||'|'||(i->>'maximo')||'|'||(i->>'unidade') from cip_registros r, jsonb_array_elements(r.verificacao_parametros->'itens') i where r.equipamento='Tanque de Fermentação 51' and i->>'campo'='conc_inicial_soda'")" "9%|9|2|4|%"
ver "faixa do formulário TFM/HORAP/Trasfega/DAW não vale para OSAN nem Alcalino" "$(E "$OPE insert into cip_registros (tipo_cip, bbt, equipamento, data_cip, hora_inicial, hora_final, nome_operador, dados) values ('osam','BBT 06','x',current_date,'08:00','09:00','Ana Lima','{\"conc_inicial_soda\":\"9%\"}'); $INS values ('alcalino','Adega A',current_date,'08:00','09:00','Ana Lima','{\"conc_inicial_soda\":\"9%\"}')" >/dev/null; Q "select count(*) from cip_registros where tipo_cip in ('osam','alcalino') and verificacao_parametros is not null")" "0"
ver "view vw_cip_registros traz a verificação" "$(Q "select verificacao_parametros->>'fora_da_faixa' from vw_cip_registros where equipamento='Tanque de Fermentação 51'")" "1"
ID1=$(Q "select id from cip_registros where equipamento='Tanque de Fermentação 51'")
ver "edição que corrige o valor recalcula a verificação" "$(E "$OPE select editar_registro_cip('$ID1','Tanque de Fermentação 51',current_date,'08:00','09:00','Ana Lima','{\"conc_inicial_soda\":\"3%\",\"pressao\":\"2,5 bar\"}'::jsonb,null,'Concentração anotada errada no papel','Ana Lima')" >/dev/null; V 'Tanque de Fermentação 51')" "conc_inicial_soda=dentro,pressao=dentro fora=0"
ver "a edição guarda o valor anterior no histórico" "$(Q "select valores_anteriores->'dados'->>'conc_inicial_soda' from cip_edicoes where registro_id='$ID1'")" "9%"
ver "faixa desativada deixa de ser comparada" "$(E "$ADM select definir_faixa_parametro('completo','pressao',null,3,'bar',false)" >/dev/null; E "$OPE $INS values ('completo','Tanque de Fermentação 55',current_date,'08:00','09:00','Ana Lima','{\"pressao\":\"9\",\"conc_inicial_soda\":\"3\"}')" >/dev/null; V 'Tanque de Fermentação 55')" "conc_inicial_soda=dentro fora=0"
ver "registros antigos não são recalculados ao mudar a faixa" "$(V 'Tanque de Fermentação 52')" "conc_inicial_soda=abaixo,pressao=sem_valor fora=1"
ver "faixas não podem ser apagadas" "$(E "delete from cip_parametros_faixas")" "42501"
ver "histórico de faixas imutável e completo" "$(Q "select count(*) from cip_parametros_faixas_historico")-$(E "delete from cip_parametros_faixas_historico")" "3-42501"
ver "operador lê faixas; anônimo não" "$(E "$OPE select count(*) from cip_parametros_faixas")-$(E "$ANON select count(*) from cip_parametros_faixas")" "ok-42501"
ver "extração do número: vírgula, ponto, unidade, negativo, sem número" "$(Q "select string_agg(coalesce(cip_extrair_numero(t)::text,'null'), ',') from unnest(array['2,5%','4500 ppm','80 °C','-1.5','abc','']) t")" "2.5,4500,80,-1.5,null,null"

echo "== Rastreabilidade de contaminação =="
R=$(Q "select id from cip_registros where equipamento='Tanque de Fermentação 53'")
R2=$(Q "select id from cip_registros where equipamento='Tanque de Fermentação 55'")
ver "avaliar como Contaminado" "$(E "$ADM select avaliar_cip('$R','contaminado','Resíduo no cone',0)")" "ok"
ver "reavaliar (contaminado → conforme → contaminado)" "$(E "$ADM select avaliar_cip('$R','conforme','Refeito, ok',1)")-$(E "$ADM select avaliar_cip('$R','contaminado','Voltou a contaminar',2)")" "ok-ok"
ver "reavaliações não duplicam a ocorrência" "$(Q "select count(*) from vw_cip_registros where situacao_avaliacao='contaminado' and id='$R'")" "1"
ver "histórico das avaliações preservado (3 eventos)" "$(Q "select count(*) from cip_avaliacoes_historico where registro_id='$R'")" "3"
E "$ADM select avaliar_cip('$R2','conforme',null,0)" >/dev/null
E "$OPE select editar_registro_cip('$R2','Tanque de Fermentação 55',current_date,'08:00','09:00','Ana Lima','{\"pressao\":\"9\",\"conc_inicial_soda\":\"3,1\"}'::jsonb,null,'Concentração anotada errada no papel','Ana Lima')" >/dev/null
ver "registro só em 'Revisão necessária' não conta como contaminação" "$(Q "select revisao_pendente||'/'||situacao_avaliacao from vw_cip_registros where id='$R2'")-$(Q "select count(*) from vw_cip_registros where situacao_avaliacao='contaminado'")" "true/conforme-1"
ver "limites do mapa nascem vazios (escala relativa)" "$(Q "select coalesce(mapa_limite_amarelo::text,'-')||coalesce(mapa_limite_vermelho::text,'-') from cip_configuracao")" "--"
ver "operador não define limites do mapa" "$(E "$OPE select definir_limites_mapa_calor(2,4)")" "42501"
ver "limites inválidos recusados (só um; amarelo ≥ vermelho)" "$(E "$ADM select definir_limites_mapa_calor(2,null)")-$(E "$ADM select definir_limites_mapa_calor(4,4)")" "22023-22023"
ver "supervisor define e limpa os limites" "$(E "$ADM select definir_limites_mapa_calor(2,4)" >/dev/null; Q "select mapa_limite_amarelo||'-'||mapa_limite_vermelho from cip_configuracao")-$(E "$ADM select definir_limites_mapa_calor(null,null)")" "2-4-ok"

echo "== Backup =="
ver "backup inclui as tabelas novas" "$(E "$ADM select cip_criar_backup()" >/dev/null; Q "select string_agg(k, ',' order by k) from cip_backup.snapshots s, jsonb_object_keys(s.conteudo->'tabelas') k where k like 'cip_adega%' or k like 'cip_parametros%'")" "cip_adega_controles,cip_adega_controles_historico,cip_adega_datas_base,cip_parametros_faixas,cip_parametros_faixas_historico"
ver "backup confere com os dados atuais (todos iguais, nenhum divergente)" "$(Q "select sum((v->>'divergentes')::int)||'/'||sum((v->>'novos')::int) from cip_backup.snapshots s, jsonb_each(cip_backup.restaurar(s.conteudo, true)->'tabelas') e(k, v)")" "0/0"
"${P[@]}" -d $DB -c "copy (select conteudo from cip_backup.snapshots order by id desc limit 1) to stdout" > "$PGTESTE_DIR/v10_backup.json"
# arquivo no formato anterior (sem as tabelas da v10), como os backups já guardados
"${P[@]}" -d $DB -c "copy (select (s.conteudo #- '{tabelas,cip_adega_controles}' #- '{tabelas,cip_adega_controles_historico}' #- '{tabelas,cip_adega_datas_base}' #- '{tabelas,cip_parametros_faixas}' #- '{tabelas,cip_parametros_faixas_historico}') - 'checksum_total' || jsonb_build_object('checksum_total', encode(sha256(convert_to((select string_agg(s.conteudo->'checksums'->>t, '' order by o) from (values (1,'perfis'),(2,'cip_configuracao'),(3,'adega_procedimentos'),(4,'cip_operadores'),(5,'cip_operadores_historico'),(6,'cip_registros'),(7,'cip_edicoes'),(8,'cip_observacoes'),(9,'cip_avaliacoes'),(10,'cip_avaliacoes_historico'),(11,'adega_datas_base')) x(o,t)), 'UTF8')), 'hex')) from cip_backup.snapshots s order by id desc limit 1) to stdout" > "$PGTESTE_DIR/v10_backup_antigo.json"
ver "backup no formato anterior continua válido" "$("${P[@]}" -d $DB -c "select (cip_backup.validar_arquivo(pg_read_file('$PGTESTE_DIR/v10_backup_antigo.json')::jsonb))->>'valido'" 2>&1)" "true"
DB2=cip_v10_dest
bash recriar.sh $DB2 todas >/dev/null || exit 1
"${P[@]}" -d $DB2 -c "select cip_backup.restaurar(pg_read_file('$PGTESTE_DIR/v10_backup.json')::jsonb, false)" >/dev/null 2>&1
ver "restauração num banco novo traz registros e verificações idênticos" "$(DB=$DB2 Q "select md5(string_agg(id::text||dados::text||coalesce(verificacao_parametros::text,''), '|' order by id)) from cip_registros")" "$(Q "select md5(string_agg(id::text||dados::text||coalesce(verificacao_parametros::text,''), '|' order by id)) from cip_registros")"
ver "restauração traz faixas e históricos" "$(DB=$DB2 Q "select (select count(*) from cip_parametros_faixas)||'/'||(select count(*) from cip_parametros_faixas_historico)||'/'||(select count(*) from cip_adega_controles_historico)")" "$(Q "select (select count(*) from cip_parametros_faixas)||'/'||(select count(*) from cip_parametros_faixas_historico)||'/'||(select count(*) from cip_adega_controles_historico)")"

echo "== Desfazer (arquiva) e reaplicar =="
ver "desfazer da v8.1 é recusado enquanto a v10 estiver aplicada (ordem: v10 antes)" "$("${P[@]}" -d $DB -f "$REPO_DIR/supabase/rollback/20261107120000_cip_v8_1_operadores_backup_desfazer.sql" 2>&1 | grep -c 'A v10 está aplicada')" "1"
ANTES=$(Q "select count(*) from cip_registros")
"${P[@]}" -d $DB -f "$RB" >/dev/null 2>&1
ver "desfazer arquiva as tabelas da v10" "$(Q "select count(*) from pg_tables where schemaname like 'cip_arquivo_v10_%'")" "5"
ver "arquivo sem acesso pela API" "$(E "$OPE select count(*) from pg_namespace")-$(Q "select has_schema_privilege('authenticated', (select nspname from pg_namespace where nspname like 'cip_arquivo_v10_%' limit 1), 'usage')")" "ok-f"
ver "nenhum registro apagado" "$(Q "select count(*) from cip_registros")" "$ANTES"
ver "view volta à definição anterior" "$(Q "select count(*) from pg_attribute where attrelid='public.vw_cip_registros'::regclass and attname='verificacao_parametros'")" "0"
ver "gatilho de verificação removido" "$(Q "select count(*) from pg_trigger where tgname='trg_cip_registros_verificar_parametros'")" "0"
ver "backup volta ao formato da v8.1 e continua funcionando" "$(E "$ADM select cip_criar_backup()")" "ok"
ver "reaplicar a v10 depois do desfazer" "$("${P[@]}" -d $DB -f "$M1" -f "$M2" >/dev/null 2>&1; echo $?)" "0"
ver "após reaplicar, controles e verificação de volta" "$(Q "select count(*) from cip_adega_controles")-$(Q "select count(*) from pg_trigger where tgname='trg_cip_registros_verificar_parametros'")" "3-1"

echo
echo "Resultado: $OK ok, $FAIL falha(s)"
[ $FAIL -eq 0 ]
