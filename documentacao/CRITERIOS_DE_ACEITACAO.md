# Critérios de aceitação — v8.1, v9 e v10

Resultado da execução completa em 09/11/2026, com a revisão corretiva da v8.1 e a v9 (réplica
local, dados fictícios, `bash testes/rodar_tudo.sh`): **14 suítes, 670 verificações, nenhuma falha.**

| Suíte | Resultado |
|-------|-----------|
| `banco/test_v8.sh` (regressão v8) | 68/68 |
| `banco/test_v8_1.sh` | 61/61 |
| `banco/test_restauracao_historica.sh` | 30/30 |
| `banco/test_concorrencia.sh` | 5/5 |
| `banco/test_rollback.sh` (arquivamento e reaplicação) | 27/27 |
| `banco/test_atomicidade.sh` | 17/17 |
| `banco/test_v9.sh` (**novo**, Filtração) | 19/19 |
| `telas/test_v8_ui.js` (regressão v8, agora com 7 formulários) | 96/96 |
| `telas/test_v8_1_ui.js` (inclui os 5 formulários existentes e OSAN BBT 01–12) | 80/80 |
| `banco/test_restaurar_arquivo.sh` | 10/10 |
| `telas/test_v9_filtracao_ui.js` (**novo**) | 58/58 |
| Site v8 (`main`) num banco com v8.1 + v9 aplicadas (**novo**) | 96/96 |
| Site v8 (`main`) num banco com a v8.1 desfeita | 96/96 |
| Site legado (Netlify) contra o banco atual | 7/7 |

## v10 — em desenvolvimento (13/11/2026), não publicada

Execução completa em 13/11/2026, na branch `feature/cip-v10` (`bash testes/rodar_tudo.sh`): **17 conjuntos, 928 verificações, nenhuma falha**. Mais 11 verificações da prévia navegável.

| Suíte | Resultado |
|-------|-----------|
| `banco/test_v10.sh` (**novo**) | 82/82 |
| `telas/test_v10_ui.js` (**novo**) | 97/97 |
| Regressão: test_v8 68, test_v8_1 61, restauração histórica 30, concorrência 5, desfazer 27, atomicidade 17, test_v9 19, restaurar arquivo 10 | todas sem falha |
| Telas anteriores: test_v8_ui 79, test_v8_1_ui 80, test_v9_filtracao_ui 58 | sem falha |
| Site em produção (`main`) num banco com a v10 / com a v10 desfeita / com v10 e v8.1 desfeitas | 96/96 em cada |
| Site legado (Netlify) | 7/7 |

| Critério | Teste | Resultado |
|----------|-------|-----------|
| "CIP Completo" exibido como "CIP TFM/HORAP/Trasfega/DAW"; campos iguais | UI | ✔ |
| OSAN e CIP Alcalino fora dos cartões do Painel; acessados pela Adega | UI | ✔ |
| Adega A, B e D no formulário TFM/HORAP/Trasfega/DAW; lista anterior mantida; outros formulários inalterados; banco aceita | UI; test_v10 | ✔ |
| Adega no modo geral: Alcalino 30 dias, Alcalino Clorado 6 meses, OSAN pendente (nada inventado) | UI; test_v10 | ✔ |
| Cálculo da periodicidade (vencido, realizado, próxima data = último + período), alerta e faixa | UI (7 casos) | ✔ |
| Alcalino Clorado em tanque de fermentação não conta para a Adega | test_v10 | ✔ |
| Periodicidade, antecedência e data-base só pelo supervisor, com histórico imutável | UI; test_v10 (10 casos) | ✔ |
| Faixas: tabela começa vazia; sem faixa, sem comparação | test_v10; UI | ✔ |
| Comparação: dentro, abaixo, acima, vazio e sem número; valores preservados; resultado gravado e não forjável | test_v10 (8 casos) | ✔ |
| Faixas por tipo, sem mistura entre formulários | test_v10; UI | ✔ |
| Operador vê o resultado depois de salvar; supervisor vê na avaliação; CSV registra a condição | UI (6 casos) | ✔ |
| Edição recalcula a verificação; registros antigos não são recalculados ao mudar a faixa | test_v10 | ✔ |
| Mapa de calor: conta só "Contaminado", sem duplicar reavaliações, sem contar "Revisão necessária" sozinha | test_v10; UI | ✔ |
| Ranking, indicadores, histórico, filtros (período, tipo, equipamento) e registro de origem | UI (9 casos) | ✔ |
| Cores: escala relativa por padrão e limites fixos configuráveis, só pelo supervisor | test_v10; UI | ✔ |
| Permissões: operador sem acesso à Rastreabilidade e às configurações; anônimo sem leitura | test_v10; UI | ✔ |
| Sem rolagem horizontal em 1366, 1024, 768 e 390 px (7 telas) | UI (28 casos) | ✔ |
| Backup inclui as tabelas novas; backups antigos continuam válidos; restauração idêntica | test_v10 (5 casos) | ✔ |
| Migrações atômicas, com trava de ordem e reaplicação; desfazer arquiva e permite reaplicar | test_v10 (12 casos) | ✔ |
| Desfazer da v8.1 recusado enquanto a v10 estiver aplicada | test_v10 | ✔ |
| FTR intocado; só objetos do CIP | test_v10; consulta só de leitura em produção | ✔ |
| Nada publicado nem aplicado em produção | `main` em `7d1664f`; produção com 27 registros e 7 tipos | ✔ |

## v9 — CIP Filtração (Filtro 3 e BMF)

> Montado a partir da descrição escrita na solicitação. As planilhas dos Anexos 2 e 3 chegaram em
> 09/11/2026. Na conferência, os 21 e os 30 campos conferem, mas há diferenças de grafia nos
> equipamentos **ainda não corrigidas**, por isso os formulários seguem **pendentes de validação
> final**. Os testes abaixo valem para a versão atual, montada pela descrição escrita. Detalhes em
> `FORMULARIOS_FILTRACAO.md`, seção "Conferência com as planilhas originais".

| Critério | Teste | Resultado |
|----------|-------|-----------|
| Os dois formulários aparecem no menu do operador e abrem | UI | ✔ |
| Filtro 3: os 21 campos oficiais presentes (conferência pelo rótulo) | UI | ✔ |
| BMF: os 30 campos oficiais presentes | UI | ✔ |
| Nenhum campo de um procedimento no outro (formulário, relatório e CSV) | UI (4 casos) | ✔ |
| Equipamentos em grupos (Grupo BMF 13, Filtro 03 10, Blendagem 7) com a grafia de cada documento (BVPP × BPVPP, FBL filtrada × não filtrada) | UI (4 casos) | ✔ |
| Grafia dos equipamentos idêntica às planilhas originais | conferência de 09/11/2026 | **Pendente**: 6 diferenças a decidir (Lúpulo 1 e 2 sem "- Sol Premium"/"- Pilsen", "à Filtrar", "Degas", "BMF" × "Grupo BMF", maiúscula em "aldox") |
| Os 21 e 30 campos e a ordem conferem com as planilhas originais | conferência de 09/11/2026 | ✔ |
| Soaking só SIM/NÃO; faixas só informativas, valor fora da faixa aceito | UI; test_v9.sh | ✔ |
| Gravação de todos os campos (15 e 24 chaves, todas preenchidas) e persistência depois de recarregar | UI (5 casos) | ✔ |
| Edição com justificativa; diferença do campo no histórico | UI | ✔ |
| Avaliação, observação, revisão necessária e reavaliação | UI (5 casos); test_v9.sh | ✔ |
| Permissões: só o operador grava; só o supervisor avalia | UI (2 casos); test_v9.sh | ✔ |
| Data futura e nome inválido recusados também nos novos tipos | UI; test_v9.sh (3 casos) | ✔ |
| Filtros por tipo, equipamento e operador; gráficos e filtro do painel | UI (5 casos) | ✔ |
| Relatório, CSV de registros e de histórico, cópia para o Excel e PDF, com colunas "Filtro 3 — …"/"BMF — …" separadas | UI (7 casos) | ✔ |
| Backup com todos os campos; restauração idêntica num banco vazio | UI; test_v9.sh | ✔ |
| Sem rolagem horizontal em 1366, 1024, 768 e 390 px (formulários e detalhe) | UI (12 casos) | ✔ |
| Os 5 tipos existentes continuam gravando; OSAN com BBT 01–12 | test_v8_ui.js; test_v8_1_ui.js; test_v8.sh | ✔ |
| Migrações atômicas, com guarda de ordem, idempotentes; desfazer sem apagar registros e reaplicável | test_v9.sh (7 casos) | ✔ |
| Site atual (v8) segue funcionando com as migrações v9 aplicadas | site v8 num banco v8.1 + v9: 96/96 | ✔ |
| FTR intocado | test_v9.sh | ✔ |

## Revisão corretiva (09/11/2026)

| Critério | Teste | Resultado |
|----------|-------|-----------|
| Restaura nomes históricos vazios, numéricos, só com símbolos e com espaços **exatamente** | test_restauracao_historica.sh (8 verificações de valores e checksums) | ✔ |
| Preserva `operador_id`, `alterado_por_nome`, datas e autores originais | idem | ✔ |
| Novos registros continuam recusando nomes inválidos depois da restauração | idem (5 casos) | ✔ |
| A exceção não pode ser usada pela sessão da API (marcador ligado, função privilegiada, executar a restauração) | idem (6 casos) | ✔ |
| Recuperação continua não destrutiva | idem (4 casos) | ✔ |
| O cenário **falha** com a migração anterior (0bf7c8a) e passa com a corrigida | execução comparativa | ✔ |
| Desfazer arquiva backups, restaurações, funções, operadores, histórico, vínculos e parâmetros | test_rollback.sh (11 casos) | ✔ |
| Arquivo protegido, sem acesso pela API, e histórico arquivado imutável | test_rollback.sh | ✔ |
| Site v8 funciona depois do desfazer | site v8 (main): 96/96 | ✔ |
| Reaplicar a v8.1 sem conflito; segundo desfazer cria um segundo arquivo; nada perdido | test_rollback.sh (8 casos) | ✔ |
| Migração atômica: falha no meio ou no fim não deixa nada aplicado, em 4 formas de aplicação | test_atomicidade.sh (8 casos) | ✔ |
| Desfazer atômico | test_atomicidade.sh (2 casos) | ✔ |
| Trava contra aplicar duas vezes ou sem a v8 | test_atomicidade.sh (4 casos) | ✔ |
| Documentação: integridade × autenticidade, aditiva × integral, nomes antigos, ensaio da recuperação, desfazer com arquivamento | BACKUP_E_RECUPERACAO.md, AUDITORIA_SEGURANCA.md, OPERACAO.md, supabase/rollback/LEIAME.md | ✔ (documentado) |

## 2.1 Identificação dos operadores

| Critério | Teste | Resultado |
|----------|-------|-----------|
| Nome sempre padronizado (espaços extras removidos) | test_v8_1.sh "espaços extras removidos"; UI "outro nome gravado padronizado" | ✔ |
| Recusa nome vazio, só números, com símbolos ou de 1 letra (banco e tela) | test_v8_1.sh (4 casos); UI "outro nome inválido recusado" | ✔ |
| Aceita nomes reais com acento, hífen e apóstrofo | test_v8_1.sh "D'Ávila Silva-Neto" | ✔ |
| Lista administrada só pelo supervisor; sem gravação direta | test_v8_1.sh (operador/anon/gravação direta recusados); UI "operador chamando cadastrar_operador direto é recusado" | ✔ |
| Sem duplicidade (maiúsculas/acentos) | test_v8_1.sh; UI | ✔ |
| Operadores não são apagados; desativar/reativar ficam no histórico imutável | test_v8_1.sh (3 casos); UI | ✔ |
| Formulário mostra só operadores ativos; edição mostra o nome original | UI (3 casos) | ✔ |
| Registro vinculado ao cadastro (`operador_id`) e com a grafia oficial | test_v8_1.sh; UI | ✔ |
| Exigência da lista desligada por padrão e ligada só pelo supervisor, com operador ativo | test_v8_1.sh (6 casos); UI | ✔ |
| Registros antigos não são alterados | test_v8_1.sh "registros antigos não são alterados" | ✔ |
| Autor das edições padronizado/validado; autoria de avaliações preservada | test_v8_1.sh; test_v8.sh | ✔ |
| Contas compartilhadas mantidas, sem contas novas | — (nenhuma conta criada) | ✔ |

## 2.2 Segurança

Ver `AUDITORIA_SEGURANCA.md`. Permissões por perfil: test_v8.sh (35 casos) e test_v8_1.sh
(15 casos). Concorrência: test_concorrencia.sh. Históricos imutáveis: test_v8.sh e
test_v8_1.sh. Chave pública: varredura do repositório sem chaves secretas.

## 2.3 Backup e recuperação

| Critério | Teste | Resultado |
|----------|-------|-----------|
| Inclui registros, avaliações, históricos, edições, observações, Adega, configuração e operadores | test_v8_1.sh "listagem mostra o backup com contagens"; UI "arquivo contém registros e históricos" | ✔ |
| Exportação segura (só supervisor; schema sem acesso pela API) | test_v8_1.sh (7 casos) | ✔ |
| Valida integridade (checksum) e formato/versão | test_v8_1.sh (5 casos) | ✔ |
| Prévia/simulação antes de restaurar, sem gravar | test_v8_1.sh; test_restaurar_arquivo.sh; tela "Verificar" | ✔ |
| Ordem de dependência respeitada; restauração completa num banco vazio | test_v8_1.sh "dados restaurados idênticos ao backup"; test_restaurar_arquivo.sh (8 tabelas) | ✔ |
| Nunca sobrescreve nem apaga | test_v8_1.sh (3 casos) | ✔ |
| Preserva autores, datas e auditoria; registra a restauração | test_v8_1.sh (4 casos) | ✔ |
| Sem custos ou serviços novos | — (usa só o banco existente) | ✔ |

## 3.1 / 3.3 Filas e visão do supervisor

| Critério | Teste | Resultado |
|----------|-------|-----------|
| Tempo desde o registro e tempo aguardando avaliação/reavaliação | UI "fila mostra o tempo desde o registro", "fila começa pelo mais antigo, com o tempo de espera" | ✔ |
| Identificação do mais antigo e ordenação por espera | UI (3 casos) | ✔ |
| Filtros por período (filtros do painel) e status | UI "filtro de status mostra só a fila de revisão" | ✔ |
| Horários do banco, fuso America/Sao_Paulo | navegador de teste em outro fuso (Lisboa) | ✔ |
| Sem prazo inventado; limite de alerta configurável e opcional | test_v8_1.sh (5 casos); UI (4 casos) | ✔ |
| Quantidade aguardando, revisões, mais antigo, avaliações no período, situação geral | UI (resumo: 4 casos) | ✔ |

## 3.2 Relatórios

| Critério | Teste | Resultado |
|----------|-------|-----------|
| Filtros por período, operador, equipamento, tipo e status | UI (5 casos) | ✔ |
| Conteúdo: dados, data/hora, operador, equipamento, procedimento, avaliação, justificativa, observações, histórico | UI (relatório na tela e CSVs) | ✔ |
| PDF (impressão do navegador) e CSV para Excel (BOM, `;`) | UI "PDF do relatório gerado", "CSV com BOM UTF-8" | ✔ |
| Integridade: SHA-256 exibido confere com o arquivo; proteção contra fórmulas | UI (2 casos) | ✔ |
| Só supervisor | UI "operador não acessa relatorios.html" | ✔ |

## Regras invioláveis

| Regra | Evidência |
|-------|-----------|
| Campos oficiais, unidades, equipamentos e listas preservados | Nenhuma alteração nos 5 formulários existentes; a v9 acrescenta os dois de Filtração (7 no total) |
| Sem limites de processo inventados | Nenhum limite de concentração, temperatura, pressão ou duração no código |
| OSAN com BBT 01–12 | test_v8.sh; UI "OSAN continua com BBT da lista fixa" |
| Regras de avaliação/revisão da v8 | test_v8.sh e test_v8_ui.js sem falhas |
| Intervalos da Adega inalterados | `adega_procedimentos` não é alterado pela migração |
| Nenhum registro histórico excluído | migração só aditiva; test_rollback.sh |
| FTR (FTR Beer Production) intocado | test_v8_1.sh "tabelas do FTR inalteradas", "backup não inclui tabelas do FTR"; test_v9.sh |
| Contas compartilhadas mantidas, sem contas novas | nenhuma conta criada ou alterada |
| Lista obrigatória de operadores desligada por padrão | test_v8_1.sh |
| Limite de alerta de espera sem valor por padrão | test_v8_1.sh |
| Backup com SHA-256 de integridade, sem alegar autenticidade | BACKUP_E_RECUPERACAO.md, seção 3 |
| Recuperação aditiva, sem sobrescrever nem apagar | test_v8_1.sh; test_restauracao_historica.sh |
| Publicação só com autorização | Autorizada em 10/11/2026; antes, as funções da v8.1 aplicadas em produção foram conferidas uma a uma (20 de 20 idênticas às testadas) e os 27 registros e 2 edições continuaram intactos |
