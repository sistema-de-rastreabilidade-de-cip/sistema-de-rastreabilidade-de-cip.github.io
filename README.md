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
  js/config.js             ← URL e chave PÚBLICA do Supabase
  js/comum.js              ← datas no fuso da fábrica, selos, navegação, alerta da Adega
  js/formConfig.js         ← campos dos formulários oficiais (+ CIP OSAM)
supabase/schema.sql        ← schema de referência anterior à v8
supabase/migrations/       ← migrações da v8 (aplicadas em ordem)
supabase/rollback/         ← scripts para desfazer cada migração
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

## Atualizar

Cada mudança no `main` que toque a pasta `docs/` é publicada sozinha em 1 a 2 minutos.
O desenvolvimento é feito em branches separadas, revisadas por pull request.

Mudanças no banco: nova migração em `supabase/migrations/` (com o script de desfazer em
`supabase/rollback/`), testada antes numa réplica local com dados fictícios.

## Reverter

- **Só o site:** reverter o merge no `main` (o banco da v8 continua compatível com o
  site anterior: as mudanças são aditivas e `editar_registro_cip` aceita a chamada
  antiga de 10 parâmetros). Ponto de retorno marcado com a tag `pre-v8`.
- **Banco:** `supabase/rollback/20261106120100_cip_v8_estrutura_desfazer.sql`, depois de
  exportar avaliações, datas-base e registros OSAM (esses dados são removidos).

Histórico anterior do código: repositório `PabloConstant/Sistema-de-Rastreabilidade-de-CIP`
(site antigo na Netlify, mantido ativo temporariamente, usando o mesmo banco).
