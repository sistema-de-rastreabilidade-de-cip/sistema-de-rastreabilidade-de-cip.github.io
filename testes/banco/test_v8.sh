#!/usr/bin/env bash
# Testes de banco da v8 — rodam SOMENTE na réplica local (cip_teste).
source "$(dirname "$0")/../ambiente.sh"; S="$PGTESTE_DIR"
DB="${DB:-cip_t8}"; [ -n "$NAO_RECRIAR" ] || bash "$(dirname "$0")/recriar.sh" "$DB" todas || exit 1
PSQL=(psql -h "$S" -p "$PGTESTE_PORTA" -U postgres -d "$DB" -X -q -At -v VERBOSITY=verbose)
ADM=00000000-0000-0000-0000-00000000000a
OPE=00000000-0000-0000-0000-00000000000b
SEMP=00000000-0000-0000-0000-00000000000c
R1=10000000-0000-0000-0000-000000000001
R2=10000000-0000-0000-0000-000000000002
R3=10000000-0000-0000-0000-000000000003
R5=10000000-0000-0000-0000-000000000005
OK=0; FAIL=0

como() { # uid role
  if [ "$2" = "anon" ]; then echo "select set_config('request.jwt.claims','{\"role\":\"anon\"}',true); set local role anon;"
  else echo "select set_config('request.jwt.claims','{\"sub\":\"$1\",\"role\":\"authenticated\"}',true); set local role authenticated;"; fi
}
esperar_ok() { # nome, sql
  out=$("${PSQL[@]}" -v ON_ERROR_STOP=1 -c "begin;" -c "$2" -c "rollback;" 2>&1)
  if [ $? -eq 0 ]; then OK=$((OK+1)); echo "ok   - $1"; else FAIL=$((FAIL+1)); echo "FAIL - $1"; echo "$out" | grep -E "ERROR" | head -2; fi
}
esperar_erro() { # nome, sqlstate, sql
  out=$("${PSQL[@]}" -v ON_ERROR_STOP=1 -c "begin;" -c "$3" -c "rollback;" 2>&1)
  if echo "$out" | grep -q "ERROR:  $2"; then OK=$((OK+1)); echo "ok   - $1 ($2)"; else FAIL=$((FAIL+1)); echo "FAIL - $1: esperado $2"; echo "$out" | grep -E "ERROR" | head -2; [ -z "$(echo "$out" | grep ERROR)" ] && echo "  (sem erro)"; fi
}
esperar_valor() { # nome, esperado, sql (último resultado)
  out=$("${PSQL[@]}" -v ON_ERROR_STOP=1 -c "begin;" -c "$3" -c "rollback;" 2>&1 | grep -v -E "^(BEGIN|ROLLBACK|SET)$" | tail -1)
  if [ "$out" = "$2" ]; then OK=$((OK+1)); echo "ok   - $1"; else FAIL=$((FAIL+1)); echo "FAIL - $1: esperado [$2] obtido [$out]"; fi
}
P10="'Tanque de Fermentação 02', current_date - 1, '08:00', '09:00', 'Operador X', '{}'::jsonb, null"
EDITAR="select (editar_registro_cip('$R1', 'Tanque de Fermentação 09', current_date - 1, '08:00', '08:40', 'Operador Fictício B', '{\"pressao\":\"\"}'::jsonb, null, 'Troquei o tanque informado', 'Pessoa Teste')).id"

echo "== Permissões: leitura =="
esperar_erro "anon sem acesso à visão de registros" "42501" "$(como x anon) select count(*) from vw_cip_registros;"
esperar_erro  "anon sem privilégio em cip_registros" "42501" "$(como x anon) select count(*) from cip_registros;"
esperar_valor "usuário sem perfil não lê" "0" "$(como $SEMP auth) select count(*) from vw_cip_registros;"
esperar_valor "operador lê os 27" "27" "$(como $OPE auth) select count(*) from vw_cip_registros;"
esperar_valor "admin lê os 27" "27" "$(como $ADM auth) select count(*) from vw_cip_registros;"
esperar_valor "todos começam aguardando" "27" "$(como $ADM auth) select count(*) from vw_cip_registros where situacao_avaliacao='aguardando';"
esperar_valor "operador lê procedimentos da Adega" "4" "$(como $OPE auth) select count(*) from adega_procedimentos;"
esperar_valor "operador lê configuração (30 dias)" "30" "$(como $OPE auth) select dias_aviso_adega from cip_configuracao;"

echo "== Criação de registro =="
esperar_ok   "operador cria registro dos 4 tipos originais" "$(como $OPE auth) insert into cip_registros (tipo_cip, equipamento, data_cip, hora_inicial, hora_final, nome_operador, dados) values ('completo','Tanque de Fermentação 01',current_date,'08:00','09:00','Op','{}'),('alcalino_clorado','Tanque de Fermentação 02',current_date,'08:00','09:00','Op','{}'),('tanque_levedura','Tanque de Levedura 01',current_date,'08:00',null,'Op','{}'),('linha_recuperacao_levedura','Linha de Recuperação de Levedura',current_date,'08:00','09:00','Op','{}');"
esperar_erro "admin não cria registro" "42501" "$(como $ADM auth) insert into cip_registros (tipo_cip, equipamento, data_cip, hora_inicial, hora_final, nome_operador) values ('completo','Tanque de Fermentação 01',current_date,'08:00','09:00','Op');"
esperar_erro "data futura recusada na criação" "23514" "$(como $OPE auth) insert into cip_registros (tipo_cip, equipamento, data_cip, hora_inicial, hora_final, nome_operador) values ('completo','Tanque de Fermentação 01',cip_hoje()+1,'08:00','09:00','Op');"
esperar_valor "OSAM com BBT: equipamento = BBT" "BBT 05|BBT 05" "$(como $OPE auth) insert into cip_registros (tipo_cip, equipamento, bbt, data_cip, hora_inicial, hora_final, nome_operador, dados) values ('osam','qualquer','BBT 05',current_date,'08:00','09:00','Op','{}') returning equipamento||'|'||bbt;"
esperar_erro "OSAM sem BBT recusado" "23514" "$(como $OPE auth) insert into cip_registros (tipo_cip, equipamento, data_cip, hora_inicial, hora_final, nome_operador) values ('osam','BBT 05',current_date,'08:00','09:00','Op');"
esperar_erro "OSAM com BBT fora da lista recusado" "23514" "$(como $OPE auth) insert into cip_registros (tipo_cip, equipamento, bbt, data_cip, hora_inicial, hora_final, nome_operador) values ('osam','BBT 13','BBT 13',current_date,'08:00','09:00','Op');"
esperar_erro "BBT em tipo não-OSAM recusado" "23514" "$(como $OPE auth) insert into cip_registros (tipo_cip, equipamento, bbt, data_cip, hora_inicial, hora_final, nome_operador) values ('completo','Tanque de Fermentação 01','BBT 01',current_date,'08:00','09:00','Op');"
esperar_valor "auditoria vem do banco (criado_por = operador)" "$OPE" "$(como $OPE auth) insert into cip_registros (tipo_cip, equipamento, data_cip, hora_inicial, hora_final, nome_operador, criado_por) values ('completo','Tanque de Fermentação 01',current_date,'08:00','09:00','Op','$ADM') returning criado_por;"

echo "== Edição (editar_registro_cip) =="
esperar_ok   "chamada antiga com 10 parâmetros nomeados continua válida" "$(como $OPE auth) select editar_registro_cip(p_registro_id=>'$R1', p_equipamento=>'Tanque de Fermentação 09', p_data_cip=>current_date-1, p_hora_inicial=>'08:00', p_hora_final=>'08:40', p_nome_operador=>'Operador Fictício B', p_dados=>'{\"pressao\":\"\"}'::jsonb, p_observacoes_operador=>null, p_justificativa=>'Troquei o tanque informado', p_alterado_por_nome=>'Pessoa');"
esperar_erro "admin não edita" "42501" "$(como $ADM auth) $EDITAR;"
esperar_erro "justificativa genérica recusada" "23514" "$(como $OPE auth) select editar_registro_cip('$R1','Tanque de Fermentação 09',current_date-1,'08:00','08:40','Op','{}'::jsonb,null,'corrigir erro','P');"
esperar_erro "justificativa 'pq sim' recusada" "23514" "$(como $OPE auth) select editar_registro_cip('$R1','Tanque de Fermentação 09',current_date-1,'08:00','08:40','Op','{}'::jsonb,null,'pq sim','P');"
esperar_erro "justificativa > 300 caracteres recusada" "23514" "$(como $OPE auth) select editar_registro_cip('$R1','Tanque de Fermentação 09',current_date-1,'08:00','08:40','Op','{}'::jsonb,null,repeat('Texto valido ',30),'P');"
esperar_erro "edição sem diferença recusada" "22023" "$(como $OPE auth) select editar_registro_cip('$R1', equipamento, data_cip, hora_inicial, hora_final, nome_operador, dados, observacoes_operador, 'Conferi os dados do registro', 'P') from cip_registros where id='$R1';"
esperar_erro "edição com data futura recusada" "23514" "$(como $OPE auth) select editar_registro_cip('$R1','Tanque de Fermentação 09',cip_hoje()+1,'08:00','08:40','Op','{}'::jsonb,null,'Data informada errada','P');"
esperar_valor "edição grava histórico (3 edições no R1)" "3" "$(como $OPE auth) $EDITAR; select count(*) from cip_edicoes where registro_id='$R1';"
esperar_valor "edição de registro aguardando NÃO cria revisão" "0" "$(como $OPE auth) $EDITAR; select count(*) from cip_avaliacoes;"

echo "== Avaliação (avaliar_cip) =="
AV1="select (avaliar_cip('$R2','conforme',null,0)).versao"
esperar_erro "operador não avalia (chamando a função direto)" "42501" "$(como $OPE auth) $AV1;"
esperar_erro "anon não executa avaliar_cip" "42501" "$(como x anon) $AV1;"
esperar_erro "operador não grava em cip_avaliacoes direto" "42501" "$(como $OPE auth) insert into cip_avaliacoes (registro_id, situacao, avaliador_nome) values ('$R2','conforme','x');"
esperar_erro "admin não grava em cip_avaliacoes direto" "42501" "$(como $ADM auth) update cip_avaliacoes set situacao='conforme';"
esperar_valor "primeira avaliação Conforme sem observação (versão 1)" "1" "$(como $ADM auth) $AV1;"
esperar_erro "Contaminado sem descrição recusado" "23514" "$(como $ADM auth) select avaliar_cip('$R2','contaminado','',0);"
esperar_erro "Contaminado com descrição genérica recusado" "23514" "$(como $ADM auth) select avaliar_cip('$R2','contaminado','ok',0);"
esperar_erro "situação inválida recusada" "22023" "$(como $ADM auth) select avaliar_cip('$R2','aguardando','Texto qualquer aqui',0);"
esperar_erro "versão desatualizada recusada (concorrência)" "PT409" "$(como $ADM auth) $AV1; select avaliar_cip('$R2','contaminado','Presença de resíduo no cone',0);"
esperar_erro "repetir a mesma classificação sem revisão recusado" "22023" "$(como $ADM auth) $AV1; select avaliar_cip('$R2','conforme','Confirmando o resultado da análise',1);"
esperar_erro "correção sem justificativa recusada" "23514" "$(como $ADM auth) $AV1; select avaliar_cip('$R2','contaminado','',1);"
esperar_valor "correção com justificativa: evento 'correcao', versão 2" "correcao|2" "$(como $ADM auth) $AV1; select avaliar_cip('$R2','contaminado','Laudo indicou contaminação no cone',1); select tipo_evento||'|'||versao from cip_avaliacoes_historico where registro_id='$R2' order by id desc limit 1;"
esperar_valor "avaliador vem do perfil, não do navegador" "Administração (teste)" "$(como $ADM auth) $AV1; select avaliador_nome from cip_avaliacoes where registro_id='$R2';"

echo "== Revisão necessária =="
EDR2="select editar_registro_cip('$R2','Tanque de Fermentação 20',current_date-2,'08:00','08:40','Operador Fictício C','{}'::jsonb,null,'Tanque informado estava errado','Pessoa A')"
esperar_valor "edição de registro avaliado liga revisão e mantém classificação" "conforme|true" "$(como $ADM auth) $AV1; $(como $OPE auth) $EDR2; select situacao||'|'||revisao_pendente from cip_avaliacoes where registro_id='$R2';"
esperar_valor "segunda edição mantém 'desde' e acumula edições" "2|Pessoa A|Pessoa B" "$(como $ADM auth) $AV1; $(como $OPE auth) $EDR2; select editar_registro_cip('$R2','Tanque de Fermentação 21',current_date-2,'08:00','08:40','Operador Fictício C','{}'::jsonb,null,'Outro tanque correto agora','Pessoa B'); select cardinality(revisao_edicoes)||'|'||revisao_por||'|'||revisao_ultimo_por from cip_avaliacoes where registro_id='$R2';"
esperar_valor "confirmação após revisão (mesma classificação) desliga o sinal" "confirmacao_revisao|false|2" "$(como $ADM auth) $AV1; $(como $OPE auth) $EDR2; $(como $ADM auth) select avaliar_cip('$R2','conforme','Conferi os dados alterados e mantenho',1); select h.tipo_evento||'|'||a.revisao_pendente||'|'||a.versao from cip_avaliacoes a join cip_avaliacoes_historico h on h.registro_id=a.registro_id and h.versao=a.versao where a.registro_id='$R2';"
esperar_erro "confirmação após revisão exige justificativa" "23514" "$(como $ADM auth) $AV1; $(como $OPE auth) $EDR2; $(como $ADM auth) select avaliar_cip('$R2','conforme','',1);"
esperar_valor "reavaliação após revisão com mudança" "reavaliacao_revisao|contaminado" "$(como $ADM auth) $AV1; $(como $OPE auth) $EDR2; $(como $ADM auth) select avaliar_cip('$R2','contaminado','Novo laudo com contaminação',1); select h.tipo_evento||'|'||a.situacao from cip_avaliacoes a join cip_avaliacoes_historico h on h.registro_id=a.registro_id and h.versao=a.versao where a.registro_id='$R2';"
esperar_valor "histórico preserva todos os eventos (2)" "2" "$(como $ADM auth) $AV1; $(como $OPE auth) $EDR2; $(como $ADM auth) select avaliar_cip('$R2','contaminado','Novo laudo com contaminação',1); select count(*) from cip_avaliacoes_historico where registro_id='$R2';"
esperar_valor "visão mostra revisão pendente" "conforme|true" "$(como $ADM auth) $AV1; $(como $OPE auth) $EDR2; select situacao_avaliacao||'|'||revisao_pendente from vw_cip_registros where id='$R2';"

echo "== Integridade do histórico =="
esperar_erro "admin não altera histórico de avaliações" "42501" "$(como $ADM auth) update cip_avaliacoes_historico set observacao='x';"
esperar_erro "operador não apaga histórico de avaliações" "42501" "$(como $OPE auth) delete from cip_avaliacoes_historico;"
esperar_erro "nem o dono do banco altera o histórico" "42501" "$AV1; update cip_avaliacoes_historico set observacao='x';"
esperar_erro "operador não apaga edições" "42501" "$(como $OPE auth) delete from cip_edicoes;"
esperar_erro "operador não altera edições" "42501" "$(como $OPE auth) update cip_edicoes set justificativa='Texto alterado';"
esperar_erro "operador não apaga registros" "42501" "$(como $OPE auth) delete from cip_registros;"
esperar_erro "authenticated sem TRUNCATE em registros" "42501" "$(como $OPE auth) truncate cip_registros cascade;"
esperar_erro "usuário não altera o próprio perfil" "42501" "$(como $OPE auth) update perfis set perfil='administrador';"
esperar_erro "usuário não cria perfil" "42501" "$(como $SEMP auth) insert into perfis values ('$SEMP','administrador','x');"

echo "== Observações administrativas =="
esperar_valor "autor da observação vem da conta logada" "Administração (teste)|$ADM" "$(como $ADM auth) insert into cip_observacoes (registro_id, texto, administrador_nome, administrador_uid) values ('$R1','Verificar pressão registrada','Nome falso','$OPE') returning administrador_nome||'|'||administrador_uid;"
esperar_erro "operador não grava observação administrativa" "42501" "$(como $OPE auth) insert into cip_observacoes (registro_id, texto, administrador_nome) values ('$R1','Texto','x');"

echo "== Adega =="
esperar_erro "operador não define data-base" "42501" "$(como $OPE auth) select definir_data_base_adega('Adega A','completo',current_date-10);"
esperar_erro "data-base futura recusada" "23514" "$(como $ADM auth) select definir_data_base_adega('Adega A','completo',cip_hoje()+1);"
esperar_valor "admin define data-base" "Adega A|completo" "$(como $ADM auth) select definir_data_base_adega('Adega A','completo',current_date-200); select adega||'|'||tipo_cip from vw_adega_datas_base_atual;"
esperar_valor "remover data-base" "0" "$(como $ADM auth) select definir_data_base_adega('Adega A','completo',current_date-200); select remover_data_base_adega('Adega A','completo'); select count(*) from vw_adega_datas_base_atual;"
esperar_erro "data-base recusada quando já há registro" "23514" "$(como $OPE auth) insert into cip_registros (tipo_cip, equipamento, data_cip, hora_inicial, hora_final, nome_operador) values ('completo','Adega B',current_date-5,'08:00','09:00','Op'); $(como $ADM auth) select definir_data_base_adega('Adega B','completo',current_date-200);"
esperar_erro "procedimento inexistente recusado" "22023" "$(como $ADM auth) select definir_data_base_adega('Adega C','completo',current_date-10);"
esperar_erro "eventos da data-base são imutáveis" "42501" "$(como $ADM auth) select definir_data_base_adega('Adega A','completo',current_date-200); reset role; delete from adega_datas_base;"
esperar_valor "admin altera antecedência do aviso" "45" "$(como $ADM auth) select definir_dias_aviso_adega(45); select dias_aviso_adega from cip_configuracao;"
esperar_erro "antecedência fora de 1..120 recusada" "22023" "$(como $ADM auth) select definir_dias_aviso_adega(0);"
esperar_erro "operador não altera antecedência" "42501" "$(como $OPE auth) select definir_dias_aviso_adega(10);"

echo "== FTR intocado =="
esperar_valor "tabelas do FTR continuam com os mesmos dados" "1|1|1|1" "select (select count(*) from painel_months)||'|'||(select count(*) from painel_current)||'|'||(select count(*) from painel_publications)||'|'||(select count(*) from painel_publicadores);"
esperar_valor "leitura pública do FTR continua (anon)" "1" "$(como x anon) select count(*) from painel_months;"

echo
echo "Resultado: $OK ok, $FAIL falha(s)"
[ $FAIL -eq 0 ]
