# Sistema de Rastreabilidade de CIP

Registro, avaliação e consulta das limpezas CIP (Cleaning in Place) da fermentação,
publicado pelo GitHub Pages em **https://sistema-de-rastreabilidade-de-cip.github.io/**

## Estrutura

```
docs/                      ← o sistema (o GitHub Pages publica a pasta /docs do main)
  index.html               ← login
  painel.html              ← painel do operador / painel gerencial do supervisor
  registro.html            ← novo registro e edição com justificativa (5 tipos de CIP)
  historico.html           ← histórico, detalhe, avaliação do CIP e observações
  adega.html               ← procedimentos periódicos da Adega A e B
  contaminados.html        ← CIPs contaminados (supervisor)
  operador.html            ← CIPs de um operador (aberto pelo gráfico do painel)
  relatorios.html          ← relatórios de rastreabilidade: PDF, CSV, cópia para o Excel (supervisor)
  gestao.html              ← operadores, parâmetros e backup (supervisor)
  js/config.js             ← URL e chave PÚBLICA do Supabase
  js/comum.js              ← datas no fuso da fábrica, selos, navegação, alerta da Adega
  js/formConfig.js         ← campos dos formulários oficiais (+ CIP OSAM)
supabase/schema.sql        ← schema de referência anterior à v8
supabase/migrations/       ← migrações da v8 (aplicadas em ordem)
supabase/rollback/         ← scripts para desfazer cada migração
documentacao/              ← segurança, backup/recuperação, operação, critérios de aceitação
testes/                    ← testes automatizados (réplica local com dados fictícios)
```

O sistema não tem funções de servidor próprias: o navegador conversa direto com o
Supabase (projeto `krscjbdphymgzjteclif`), e as permissões ficam no banco (RLS,
privilégios e funções `SECURITY DEFINER` que conferem o perfil). A chave em
`js/config.js` é a pública (`sb_publishable_`), a mesma que qualquer navegador recebe.

**Projeto compartilhado:** o mesmo projeto Supabase guarda as tabelas do Painel FTR
(`painel_*`). Nenhuma migração do CIP referencia esses objetos; toda mudança do CIP usa
só objetos `cip_*`, `adega_*`, `vw_cip_*`/`vw_adega_*` e as funções do CIP.

## Funcionalidades da v8

- **Avaliação do CIP** (supervisor): Conforme ou Contaminado, com descrição obrigatória
  para Contaminado e justificativa obrigatória para qualquer correção. Gravação só pela
  função `avaliar_cip`, com trava de concorrência (`versao`): se outra pessoa salvou
  antes, a tela avisa e não sobrescreve. Histórico imutável em `cip_avaliacoes_historico`.
- **Revisão necessária:** quando um registro já avaliado é editado (com dado de fato
  alterado), o sinal é ligado sem mudar a classificação; o supervisor confirma ou
  reavalia, sempre com justificativa.
- **Painel do supervisor:** gráfico "CIPs realizados por operador" (clique abre os
  registros do operador), cartões de avaliação e filas "aguardando" e "revisão
  necessária", seguidos dos indicadores e gráficos anteriores.
- **CIPs contaminados:** consulta geral ou filtrada pelos filtros do painel.
- **Adega:** CIP Alcalino Clorado a cada 6 meses e CIP Completo a cada 12 meses, por
  adega (`adega_procedimentos`). Data-base definida pelo supervisor quando não há
  registro; aviso de "próximo do vencimento" com antecedência configurável (padrão 30
  dias). Alerta ao operador ao entrar e faixa em todas as telas enquanto houver
  procedimento vencido ou vencendo hoje.
- **CIP OSAM:** mesmos campos de processo do CIP Completo, com o BBT escolhido numa
  lista fixa (BBT 01 a BBT 12). O banco recusa BBT fora da lista.
- **Data futura:** a data do CIP não pode ser posterior a hoje (fuso America/Sao_Paulo),
  na tela e no banco (`cip_configuracao`). Regra ainda pendente de validação operacional.
- **Histórico de alterações** corrigido (coluna `criado_em`), agora com os campos que
  mudaram em cada edição.
- **Observações administrativas:** o autor vem da conta logada, não do navegador.

## Novidades da v8.1

- **Operadores:** lista cadastrada pelo supervisor (Gestão), sem exclusão. O formulário
  mostra a lista. Os nomes são padronizados e validados no banco. A lista pode se tornar
  obrigatória (desligada por padrão).
- **Filas do supervisor:** tempo desde o registro, tempo aguardando avaliação ou
  reavaliação, destaque do mais antigo, ordenação e filtro de status. Limite de alerta
  opcional, só com valor definido pela coordenação.
- **Resumo do supervisor:** aguardando, revisões, mais antigo, avaliações no período,
  tempo mediano até a 1ª avaliação e situação geral.
- **Relatórios:** filtros por período, operador, equipamento, tipo e status. Saem em PDF
  (impressão), CSV de registros e de histórico, ou cópia para colar no Excel, com código
  SHA-256 de conferência.
- **Backup:** cópia protegida dentro do banco, com verificação de integridade, arquivo para
  download e recuperação não destrutiva, sempre com simulação antes
  (`documentacao/BACKUP_E_RECUPERACAO.md`).
- **Segurança:** ver `documentacao/AUDITORIA_SEGURANCA.md`.

Migração: `supabase/migrations/20261107120000_cip_v8_1_operadores_backup.sql`, com
desfazer em `supabase/rollback/`. Testes e critérios: `testes/README.md` e
`documentacao/CRITERIOS_DE_ACEITACAO.md`.

## Atualizar

Cada mudança no `main` que toque a pasta `docs/` é publicada sozinha em 1 a 2 minutos.
O desenvolvimento é feito em branches separadas, revisadas por pull request.

Mudanças no banco: nova migração em `supabase/migrations/` (com o script de desfazer em
`supabase/rollback/`), testada antes numa réplica local com dados fictícios.

## Reverter

- **Só o site:** reverter o merge no `main` (o banco da v8 continua compatível com o
  site anterior: as mudanças são aditivas e `editar_registro_cip` aceita a chamada
  antiga de 10 parâmetros). Ponto de retorno: branch `retorno/pre-v8` (commit `321313d`).
- **Banco:** `supabase/rollback/20261106120100_cip_v8_estrutura_desfazer.sql`, depois de
  exportar avaliações, datas-base e registros OSAM (esses dados são removidos).

Histórico anterior do código: repositório `PabloConstant/Sistema-de-Rastreabilidade-de-CIP`
(site antigo na Netlify, mantido ativo temporariamente, usando o mesmo banco).
