# CIP v10 — Adega no modo geral, faixas dos parâmetros e rastreabilidade de contaminação

> **Situação:** em desenvolvimento na branch `feature/cip-v10`. **Não publicada.** As migrações
> foram preparadas e testadas só numa cópia local do banco; nada foi executado no Supabase de
> produção. A publicação depende de autorização expressa.

## O que muda

| Área | Versão atual (produção) | v10 |
|---|---|---|
| Painel do operador | 7 cartões, incluindo "CIP Completo" e "CIP OSAN" | 6 cartões. "CIP Completo" passa a se chamar **CIP TFM/HORAP/Trasfega/DAW**. OSAN e o novo CIP Alcalino ficam só na aba Adega |
| Formulário TFM/HORAP/Trasfega/DAW | Tanques de fermentação + Linha de Trasfega | Mesma lista, mais **Adega A, Adega B e Adega D**. Campos iguais |
| Aba Adega | Adega A e Adega B separadas; Alcalino Clorado a cada 6 meses e Completo a cada 12 meses | **Controle geral** (sem separar adegas): **CIP Alcalino** a cada 30 dias, **CIP Alcalino Clorado** a cada 6 meses e **CIP OSAN** (BBT 01 a 12) com **periodicidade pendente de definição** |
| CIP Alcalino | não existia | Tipo novo; campos iguais aos do CIP TFM/HORAP/Trasfega/DAW (decisão do usuário); equipamento Adega A, B ou D |
| Faixas dos parâmetros | não existiam | Estrutura pronta, **tabela vazia**: a comparação só liga para os parâmetros que receberem faixa oficial |
| Contaminações | lista "CIPs contaminados" | Aba nova **Rastreabilidade de Contaminação**: mapa de calor, ranking, indicadores, histórico e filtros |

## Aba Adega (modo geral)

- Cada procedimento é controlado pelo último registro válido do seu tipo.
  - CIP Alcalino e OSAN: todos os registros do tipo contam.
  - CIP Alcalino Clorado: contam só os registros feitos numa adega (A, B ou D). O mesmo tipo
    também é usado nos tanques de fermentação, e esses registros não entram aqui.
- A periodicidade fica em `cip_adega_controles`, em dias ou meses, e o supervisor pode alterá-la.
  Sem periodicidade, o procedimento aparece como "Periodicidade pendente": sem data prevista e sem
  alerta. É o caso do OSAN, porque não havia regra aprovada.
- O aviso "Próximo do vencimento" usa a antecedência geral da Adega ou uma antecedência própria
  do procedimento, definida pelo supervisor. Em períodos curtos, quando as duas situações valem
  ao mesmo tempo, aparece a mais próxima: "Realizado" na primeira metade do prazo e "Próximo do
  vencimento" na segunda.
- Registros antigos não mudam. Os registros de "CIP Completo" feitos nas adegas continuam no
  histórico geral, mas deixam de contar na aba Adega, porque o Completo de 12 meses saiu de lá.
- As tabelas antigas (`adega_procedimentos`, `adega_datas_base`) continuam intactas, para que o
  site atual siga funcionando até a publicação.
- Decisão pendente: a antecedência do CIP Alcalino. Com a antecedência geral de 30 dias e um ciclo
  de 30 dias, o aviso aparece já na segunda metade do prazo. O supervisor pode definir uma
  antecedência própria, por exemplo 7 dias, quando a coordenação decidir.

## Faixas aceitáveis dos parâmetros

- `cip_parametros_faixas` guarda, para cada tipo de CIP e parâmetro, o mínimo e/ou o máximo, a
  unidade e se a comparação está ativa. **A tabela começa vazia**: nenhum valor foi inventado.
- O cadastro fica em Gestão → "Faixas aceitáveis dos parâmetros" e é feito só pelo supervisor.
  Cada alteração vai para o histórico, que não pode ser alterado. Faixas não são apagadas: para
  parar de comparar, basta desmarcar "Comparar".
- Cada tipo tem as suas faixas. O OSAN e o CIP Alcalino usam os mesmos campos do
  TFM/HORAP/Trasfega/DAW, mas as faixas de um não valem para os outros.
- Ao gravar ou editar um registro, um gatilho no banco compara os valores e grava o resultado em
  `cip_registros.verificacao_parametros`. O resultado guarda o parâmetro, o valor como foi
  digitado, o número usado, o mínimo, o máximo, a unidade, a situação e a data. O usuário não
  consegue forjar esse resultado. Os valores digitados (`dados`) nunca são alterados.
  - Situações possíveis: dentro da faixa, abaixo do mínimo, acima do máximo, não preenchido ou
    sem número para comparar.
  - O número é o primeiro do texto, com vírgula ou ponto como decimal: "2,5%" vira 2,5. Separador
    de milhar não é reconhecido ("1.200" vira 1,2).
- **Operador:** depois de salvar, vê a tabela de verificação, com os parâmetros fora da faixa em
  vermelho. Se o tipo de CIP não tem faixa, o fluxo continua como antes.
- **Supervisor:** vê a mesma tabela no detalhe do registro, junto da avaliação.
- **Relatórios:** o CSV de registros ganha a coluna "Verificação dos parâmetros".
- Registros gravados antes de existir faixa ficam sem verificação. Os resultados antigos não são
  recalculados quando uma faixa muda.

## Rastreabilidade de Contaminação

- Fonte: `vw_cip_registros` com a situação atual igual a "contaminado".
  - Cada CIP conta uma vez, porque `cip_avaliacoes` guarda só a situação atual. As reavaliações
    ficam no histórico e não duplicam a contagem.
  - "Revisão necessária" sozinha não conta. Um CIP classificado como contaminado que depois foi
    editado continua contando e aparece marcado "em revisão".
  - A data da ocorrência é a data do CIP.
- Conteúdo da aba:
  - indicadores: total, equipamentos, maior recorrência e última ocorrência;
  - mapa de calor por equipamento e mês (por trimestre quando o período passa de 24 meses);
  - ranking;
  - histórico com link para cada registro;
  - filtros por período, tipo de CIP e equipamento;
  - clique no equipamento para ver só os registros dele.
- Cores do mapa: sem limites definidos, vale a **escala relativa**, em que cada célula é
  comparada com o maior total do período (verde abaixo de 1/3, amarelo a partir de 1/3, vermelho
  a partir de 2/3). O supervisor pode definir limites fixos para o amarelo e o vermelho, guardados
  em `cip_configuracao.mapa_limite_amarelo` e `mapa_limite_vermelho`. Nenhum limite operacional
  foi inventado.
- Acesso só para o supervisor. A página "CIPs contaminados" continua existindo e abre a partir do
  Painel.

## Banco de dados

| Arquivo | O que faz |
|---|---|
| `supabase/migrations/20261113120000_cip_v10_tipo_alcalino.sql` | Acrescenta o tipo `alcalino`. Aplicado sozinho, porque o PostgreSQL não usa um valor novo de enum na mesma transação |
| `supabase/migrations/20261113120100_cip_v10_adega_faixas_mapa.sql` | Controles e datas-base da Adega, faixas, verificação, limites do mapa, data futura do Alcalino, coluna nova na `vw_cip_registros`, backup com as tabelas novas |
| `supabase/rollback/20261113120100_cip_v10_desfazer.sql` | Arquiva as tabelas da v10 num schema `cip_arquivo_v10_<data>`, sem apagar dados, e devolve view e funções de backup à v9 |

**Análise feita antes de preparar as migrações** (cópia local e consultas só de leitura em
produção, em 13/11/2026):
- Produção está na v9: 27 registros e sete tipos de CIP.
- Nenhum nome da v10 já existe no banco.
- Nenhum objeto do FTR (`painel_*`) depende de tabelas, views ou funções do CIP.
- As migrações só criam ou alteram objetos `cip_` / `vw_cip_` e o schema `cip_backup`.
- Todas as alterações são aditivas: nenhuma linha existente é apagada ou modificada, exceto a
  inclusão de `alcalino` na regra de data futura.

**Compatibilidade testada:**
- O site atual de produção (`main`) funciona num banco com a v10 aplicada, então as migrações
  podem ir antes do site.
- O site legado da Netlify também continua funcionando.
- Backups antigos, sem as tabelas novas, continuam válidos.
- A restauração conta como "iguais" as linhas que só diferem em colunas criadas depois do backup.

**Ordem para desfazer:** da mais nova para a mais antiga (v10, depois v8.1). O desfazer da v8.1
agora recusa a execução enquanto a v10 estiver aplicada, porque a v10 usa uma função da v8.1.

**Publicação, quando autorizada:**
1. Aplicar as duas migrações em produção, nessa ordem e em execuções separadas, conferindo as
   funções contra a cópia testada.
2. Fazer o merge de `feature/cip-v10` no `main`.

## Pendências

- **Faixas oficiais** de cada parâmetro e tipo de CIP. Até lá a comparação fica desligada.
- **Periodicidade do OSAN** (hoje pendente).
- **Antecedência do aviso do CIP Alcalino** (ver acima).
- **Limites do mapa de calor**, se a coordenação quiser critério fixo.
- **"ADEGA A/B/D"**: o pedido escreve em maiúsculas, mas o sistema usa "Adega A/B/D", o mesmo
  padrão dos equipamentos que já existem, para os registros novos e antigos da mesma adega
  coincidirem.
