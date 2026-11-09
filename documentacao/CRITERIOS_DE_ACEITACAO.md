# Critérios de aceitação — v8.1

Resultado da execução completa em 09/11/2026, após a revisão corretiva (réplica local, dados fictícios,
`bash testes/rodar_tudo.sh`):

| Suíte | Resultado |
|-------|-----------|
| `banco/test_v8.sh` (regressão v8) | 68/68 |
| `banco/test_v8_1.sh` | 61/61 |
| `banco/test_restauracao_historica.sh` (**novo**) | 30/30 |
| `banco/test_concorrencia.sh` | 5/5 |
| `banco/test_rollback.sh` (**ampliado**: arquivamento e reaplicação) | 27/27 |
| `banco/test_atomicidade.sh` (**novo**) | 17/17 |
| `telas/test_v8_ui.js` (regressão v8) | 96/96 |
| `telas/test_v8_1_ui.js` | 80/80 |
| `banco/test_restaurar_arquivo.sh` | 10/10 |
| Site v8 (`main`) num banco com a v8.1 desfeita (**novo**) | 96/96 |
| Site legado (Netlify) contra o banco atual | 7/7 |

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
| Campos oficiais, unidades, equipamentos e listas preservados | Nenhuma alteração em `formConfig.js`/`equipamentos.js` na v8.1 |
| Sem limites de processo inventados | Nenhum limite de concentração, temperatura, pressão ou duração no código |
| OSAM com BBT 01–12 | test_v8.sh; UI "OSAM continua com BBT da lista fixa" |
| Regras de avaliação/revisão da v8 | test_v8.sh e test_v8_ui.js sem falhas |
| Intervalos da Adega inalterados | `adega_procedimentos` não é alterado pela migração |
| Nenhum registro histórico excluído | migração só aditiva; test_rollback.sh |
| FTR intocado | test_v8_1.sh "tabelas do FTR inalteradas", "backup não inclui tabelas do FTR" |
