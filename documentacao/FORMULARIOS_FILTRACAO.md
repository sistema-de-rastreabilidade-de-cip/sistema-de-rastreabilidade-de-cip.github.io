# CIP Filtração — Filtro 3 e BMF (v9)

> **PENDENTE DE VALIDAÇÃO FINAL.** Os dois formulários foram montados a partir da descrição escrita
> na solicitação, antes de as planilhas originais chegarem. Os arquivos `Anexo 2 CIP Filtração - Filtro 3.xlsx`
> e `Anexo 3 CIP Filtracao BMF.xlsx` foram enviados em 09/11/2026 e a conferência está na seção
> "Conferência com as planilhas originais". Os campos e a ordem conferem. Há diferenças de grafia nos
> equipamentos que **ainda não foram corrigidas no sistema** e aguardam decisão. A v9 não está
> publicada e as migrações não foram aplicadas em produção.

## Como funciona

- São dois tipos de CIP novos e separados: `filtracao_filtro3` (CIP Filtração — Filtro 3) e
  `filtracao_bmf` (CIP Filtração — BMF). Cada um tem o seu formulário, os seus campos e a sua lista de
  equipamentos. Nenhum campo é compartilhado entre eles.
- Os campos do procedimento ficam em `cip_registros.dados`, como nos demais tipos. As chaves usam o
  prefixo `f3_` ou `bmf_`, então os dados dos dois procedimentos não se misturam.
- A identificação usa os campos comuns do sistema: Data, Equipamento, Hora Inicial, Hora Final,
  Operador (lista de operadores cadastrados da v8.1) e Observações.
- O registro é feito pelo perfil operador e a avaliação pelo supervisor, igual aos demais tipos. A
  edição exige justificativa, fica no histórico e gera "Revisão necessária" quando o registro já foi
  avaliado.
- Relatórios, CSV e cópia para o Excel mostram colunas separadas e identificadas, por exemplo
  "Filtro 3 — Pressão" e "BMF — Condutividade".
- O backup e a restauração já incluem os dois tipos, sem nenhuma alteração.
- A regra de data futura (a data não pode ser posterior a hoje) passa a valer também para os dois
  tipos. Fora isso, não existe nenhuma regra, faixa ou limite operacional novo.

## Filtro 3 — PO-JAC-FAB-005, Anexo 2 (rev. 2, 18/05/2018)

São 21 campos oficiais: 5 de identificação, 15 do procedimento e Observações.

| Campo do documento | No sistema | Seção |
|---|---|---|
| Data | Data (comum) | Identificação |
| Nº Utilização de Soda | `f3_num_utilizacao_soda` | Identificação do ciclo |
| Equipamento | Equipamento (comum, lista do Anexo 2) | Identificação |
| Ciclo | `f3_ciclo` | Identificação do ciclo |
| Hora inicial | Hora Inicial (comum) | Identificação |
| Hora final | Hora Final (comum) | Identificação |
| Temperatura da Solução | `f3_temperatura_solucao` | Ciclo de soda |
| Conc. Inicial Soda | `f3_conc_inicial_soda` ("Concentração Inicial de Soda") | Ciclo de soda |
| Conc. Final Soda | `f3_conc_final_soda` | Ciclo de soda |
| Tempo de Circulação | `f3_tempo_circulacao` | Ciclo de soda |
| Hora Inicial ciclo ácido | `f3_hora_inicial_acido` (hora) | Ciclo de ácido |
| Hora Final ciclo ácido | `f3_hora_final_acido` (hora) | Ciclo de ácido |
| Conc. Inicial Ácido | `f3_conc_inicial_acido` | Ciclo de ácido |
| Conc. Final Ácido | `f3_conc_final_acido` | Ciclo de ácido |
| Tempo Circulação Ácido | `f3_tempo_circulacao_acido` | Ciclo de ácido |
| Pressão | `f3_pressao` | Verificação final |
| pH enxágue final | `f3_ph_enxague_final` | Verificação final |
| Limpeza do ponto de coleta | `f3_limpeza_ponto_coleta` | Verificação final |
| Operador | Operador (comum, lista cadastrada) | Identificação |
| Coordenador/Líder | `f3_coordenador_lider` | Verificação final |
| Observações | Observações (comum) | — |

O Anexo 2 não traz faixas, então nenhuma faixa foi incluída.

## BMF — PO-JAC-FAB-024, Anexo 3 (rev. 2, 27/07/2021)

São 30 campos oficiais: 5 de identificação, 24 do procedimento e Observações.

| Campo do documento | No sistema | Seção |
|---|---|---|
| Data | Data (comum) | Identificação |
| Equipamento | Equipamento (comum, lista do Anexo 3) | Identificação |
| Ciclo | `bmf_ciclo` | Ciclo |
| Hora Inicial / Hora Final | comuns | Identificação |
| Tempo Total de CIP | `bmf_tempo_total_cip` | Ciclo |
| Soaking (SIM ou NÃO) | `bmf_soaking`, escolha entre SIM e NÃO | Ciclo |
| CIP Hipoclorito (membranas) | `bmf_cip_hipoclorito` | Ciclo |
| Conc. Inicial Soda (2% a 4%) | `bmf_conc_inicial_soda` | Concentrações |
| Conc. Final Soda (1% a 3%) | `bmf_conc_final_soda` | Concentrações |
| Conc. Inicial Divos X5 (4500 a 8500 ppm) | `bmf_conc_inicial_divos` | Concentrações |
| Conc. Final Divos X5 (500 a 4500 ppm) | `bmf_conc_final_divos` | Concentrações |
| Conc. Inicial Ácido (0,5%) | `bmf_conc_inicial_acido` | Concentrações |
| UBT, UBL, FBT, FBL | `bmf_ubt`, `bmf_ubl`, `bmf_fbt`, `bmf_fbl` | Tanques e linhas |
| Tanque Sílica, PVPP, Alginato, Antioxidante, Lúpulo | `bmf_tanque_*` | Tanques e linhas |
| Linha Maturada, Linha Adegas, Linha de água | `bmf_linha_maturada`, `bmf_linha_adegas`, `bmf_linha_agua` | Tanques e linhas |
| Condutividade | `bmf_condutividade` | Verificação final |
| Limpeza pontos de coleta | `bmf_limpeza_pontos_coleta` | Verificação final |
| Operador | Operador (comum) | Identificação |
| Coordenador/Líder | `bmf_coordenador_lider` | Verificação final |
| Observações | Observações (comum) | — |

As faixas entre parênteses aparecem no rótulo exatamente como no documento e servem **só como
referência**. O formulário mostra um aviso dizendo isso. O sistema não bloqueia nem avalia valores
fora delas: o teste grava "9%" de soda e "12000 ppm" de Divos X5 sem erro.

## Equipamentos

Os dois formulários mostram três grupos: **Grupo BMF**, **Filtro 03** e **Blendagem**.

| Grupo BMF — Anexo 2 (Filtro 3) | Grupo BMF — Anexo 3 (BMF) |
|---|---|
| Tanque de Cerveja Maturada — UBT | igual |
| Filtro de Cerveja Membrana — BMF | Filtro de Cerveja **de** Membrana — BMF |
| Tanque de Cerveja Filtrada — FBT | igual |
| Linha de Cerveja não filtrada — UBL | igual |
| Linha de Cerveja **filtrada** — FBL | Linha de Cerveja **não filtrada** — FBL |
| Tanque de Antioxidante — BTA | igual |
| Tanque de Sílica — BSÍLICA | igual |
| Tanque de PVPP — **BVPP** | Tanque de PVPP — **BPVPP** |
| Tanque de Alginato — BALGINATO | igual |
| Tanque de Lúpulo — BLÚPULO | igual |
| Linha de Filtração — BFILTRAÇÃO | igual |
| Linha de Blendagem — BBLENDAGEM | igual |
| Linha **de** Adega — BADEGA | Linha **até** Adega — BADEGA |

**Filtro 03** (grafia atual do sistema; ver a conferência abaixo): Tanque de Cerveja a Filtrar (PCM), Filtro de Cerveja por placas (F03), Tanque de
Cerveja Filtrada (PCF), Tanque de Sílica, Tanque de PVPP, Tanque de Alginato, Tanque de Antioxidante
(TA), Tanque de Lúpulo 1, Tanque de Lúpulo 2, Linha de Blendagem (LBLEND).

**Blendagem:** Aldox, Linha Aldox até utilidades (LALDOX), Degas (DEGAS), Adega de água de Diluição C,
Adega de água de Diluição D, Tanque de água nobre sala 01 (TQN 25 - 1), Tanque de água nobre sala 03
(TQN 25 - 3).

## Divergências entre os documentos (mantidas como estão, sem padronizar)

1. **BVPP × BPVPP**: o Anexo 2 traz "BVPP" e o Anexo 3 traz "BPVPP". Cada formulário usa a grafia do
   seu documento.
2. **FBL "filtrada" × "não filtrada"**: o Anexo 2 descreve a FBL como linha de cerveja filtrada. O
   Anexo 3 a descreve como não filtrada, a mesma descrição da UBL. Pela sigla (F = filtrada), o
   Anexo 3 parece ter um erro de digitação, mas a decisão é da área responsável.
3. **"Linha de Adega" × "Linha até Adega"** e **"Membrana" × "de Membrana"**: diferenças pequenas de
   redação, também mantidas.

## Conferência com as planilhas originais (09/11/2026)

Conferência célula a célula das duas abas (Frente e Verso) de cada planilha. As planilhas não têm
listas de validação nem marcações (✔/OK): todas as células de preenchimento são livres.

**Campos — conferem.** O Anexo 2 tem os 21 campos e o Anexo 3 tem os 30, na mesma ordem do sistema.
Nenhum campo falta e nenhum sobra. As faixas do Anexo 3 são as mesmas do sistema; o Anexo 2 não tem
faixas.

**Suposições confirmadas:**

- As listas Filtro 03 e Blendagem do verso do Anexo 3 são as mesmas do Anexo 2.
- Campos de texto livre: as planilhas não restringem formato nem unidade.
- As divergências BVPP × BPVPP, FBL filtrada × não filtrada, "Linha de Adega" × "Linha até Adega" e
  "Membrana" × "de Membrana" estão nas planilhas, exatamente como estavam na descrição.

**Diferenças entre as planilhas e o sistema (ainda não corrigidas):**

| # | Planilha | Sistema hoje | Onde | Tipo |
|---|---|---|---|---|
| 1 | Tanque de Lúpulo 1 **- Sol Premium** | Tanque de Lúpulo 1 | Filtro 03, Anexos 2 e 3 | Texto oficial omitido |
| 2 | Tanque de Lúpulo 2 **- Pilsen** | Tanque de Lúpulo 2 | Filtro 03, Anexos 2 e 3 | Texto oficial omitido |
| 3 | Tanque de Cerveja **à** Filtrar | Tanque de Cerveja **a** Filtrar | Filtro 03, Anexos 2 e 3 | Grafia |
| 4 | Sigla "Degas" | DEGAS | Blendagem, só no Anexo 3 (o Anexo 2 traz DEGAS) | Grafia da sigla |
| 5 | Título do grupo "BMF" | "Grupo BMF" | Os dois formulários | Rótulo (o sistema seguiu a descrição escrita) |
| 6 | "Linha aldox até utilidades" | "Linha Aldox até utilidades" | Blendagem | Maiúscula |

**Erros de digitação das planilhas, que o sistema escreve corrigidos** (decidir se mantém corrigido):
"Filtro de Cerceja por placas" (Anexo 2), "Tanque de cervja à Filtrar" e "Taqnue de cerveja
Filtrada" (Anexo 3), "Adega de água de Diluíção" (os dois) e "Tempo de Circulção" (Anexo 2).

**Rótulos dos campos:** o sistema escreve por extenso o que as planilhas abreviam ("Conc. Inicial
Soda" → "Concentração Inicial de Soda", "Tempo Circul. Ácido" → "Tempo de Circulação do Ácido",
"pH enxague final" → "pH do enxágue final"). No Anexo 2, a segunda dupla "Hora Inicial / Hora Final"
não diz "ciclo ácido": isso vem da descrição escrita e da posição (entre o ciclo de soda e o ciclo de
ácido). O sistema usa "Hora Inicial do ciclo de ácido" e "Hora Final do ciclo de ácido".

**Seções:** o agrupamento em seções na tela (Ciclo de soda, Tanques e linhas…) é só visual e não
existe nas planilhas.

**Para corrigir os itens 1 a 6:** basta alterar `docs/js/equipamentos.js`, sem migração. Registros
já gravados guardam o nome antigo e continuam aparecendo como "(valor registrado)" na edição. Como
ainda não há registros reais de Filtração, o momento de corrigir é antes da publicação.

## Banco de dados

- `supabase/migrations/20261109120000_cip_v9_tipos_filtracao.sql`: acrescenta os dois valores ao tipo
  de CIP. Precisa da v8.1 e é aplicada sozinha, porque o PostgreSQL não usa um valor novo de enum na
  mesma transação em que ele foi criado.
- `supabase/migrations/20261109120100_cip_v9_regras_filtracao.sql`: inclui os dois tipos na regra de
  data futura.
- Desfazer: `supabase/rollback/20261109120100_cip_v9_desfazer.sql`. Tira os dois tipos da regra e não
  apaga nenhum registro (ver `supabase/rollback/LEIAME.md`).
- Compatibilidade testada: o site v8 (`main`) continua funcionando num banco com a v8.1 e a v9
  aplicadas, então as migrações podem ser aplicadas antes da publicação do site.
