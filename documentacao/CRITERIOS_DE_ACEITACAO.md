# Critérios de aceitação — v8.1

Resultado da execução completa em 06/11/2026 (réplica local, dados fictícios):

| Suíte | Resultado |
|-------|-----------|
| `testes/banco/test_v8.sh` (regressão v8) | 68/68 |
| `testes/banco/test_v8_1.sh` | 61/61 |
| `testes/banco/test_concorrencia.sh` | 5/5 |
| `testes/banco/test_rollback.sh` | 7/7 |
| `testes/telas/test_v8_ui.js` (regressão v8) | 96/96 |
| `testes/telas/test_v8_1_ui.js` | 80/80 |
| `testes/banco/test_restaurar_arquivo.sh` | 10/10 |
| Site antigo (Netlify) contra o banco v8.1 | 7/7 |

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
