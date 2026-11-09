# CIP Filtração — Filtro 3 e BMF (v9)

> **PENDENTE DE CONFERÊNCIA com as planilhas.** Os arquivos `Anexo 2 CIP Filtração - Filtro 3.xlsx`
> e `Anexo 3 CIP Filtracao BMF.xlsx` não foram recebidos. Os dois formulários foram montados a partir
> da lista de campos e equipamentos escrita na solicitação. Antes de publicar, os campos, a grafia e
> as listas abaixo precisam ser conferidos com as planilhas.

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

**Filtro 03:** Tanque de Cerveja a Filtrar (PCM), Filtro de Cerveja por placas (F03), Tanque de
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

## Suposições a confirmar com as planilhas

- **Filtro 03 e Blendagem no BMF:** foi usada a mesma relação do Anexo 2.
- **Tipo dos campos:** todos os campos do procedimento são de texto livre, porque os documentos não
  fixam formato nem unidade. A exceção é a hora do ciclo de ácido, que é um campo de hora. Isso vale
  também para Ciclo, CIP Hipoclorito, os campos de tanques e linhas (UBT … Linha de água) e
  Limpeza do ponto de coleta. Se as planilhas mostrarem marcação (por exemplo ✔/✘ ou OK), dá para
  trocar por uma lista de opções sem perder os registros.
- **Rótulos por extenso:** as abreviações viraram palavras inteiras ("Conc. Inicial Soda" ficou
  "Concentração Inicial de Soda"; "pH enxágue final" ficou "pH do enxágue final"), seguindo o padrão
  dos outros formulários. As faixas foram mantidas sem alteração.
- **Seções:** o agrupamento em seções (Ciclo de soda, Ciclo de ácido, Tanques e linhas…) é só
  visual, para organizar a tela. Não existe nos documentos.

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
