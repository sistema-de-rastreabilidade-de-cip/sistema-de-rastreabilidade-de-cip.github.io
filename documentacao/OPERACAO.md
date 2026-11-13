# Instruções de operação — Rastreabilidade de CIP (v8.1 e v9)

Endereço: https://sistema-de-rastreabilidade-de-cip.github.io/

> **Situação:** a v8.1 e a v9 foram publicadas em 10/11/2026 (site: `main` em `79d0e29`; migrações v8.1 e v9 aplicadas no banco de produção, nessa ordem).
>
> **Formulários de Filtração:** foram montados a partir da descrição escrita na solicitação.
> A conferência com as planilhas originais está registrada em `FORMULARIOS_FILTRACAO.md`, e as
> correções que ela aponta ainda não foram aplicadas aos formulários.

## Mudanças que vêm com a v10 (ainda não publicada)

Esta seção vale só depois da publicação da v10. Detalhes em `V10_ADEGA_FAIXAS_RASTREABILIDADE.md`.

- **Painel:** "CIP Completo" passa a se chamar "CIP TFM/HORAP/Trasfega/DAW", com Adega A, B e D
  na lista de equipamentos. O CIP OSAN sai dos cartões do Painel.
- **Aba Adega:** controle geral, sem separar as adegas. Três procedimentos, cada um com o botão
  "Registrar CIP":
  - CIP Alcalino, a cada 30 dias;
  - CIP Alcalino Clorado, a cada 6 meses;
  - CIP OSAN, com BBT 01 a BBT 12 e periodicidade a definir.

  O supervisor configura a periodicidade, a antecedência do aviso e a data-base em "Configurar
  este procedimento", no próprio cartão.
- **Faixas dos parâmetros:** o supervisor cadastra as faixas oficiais em Gestão. O operador vê,
  depois de salvar, quais parâmetros ficaram fora da faixa (em vermelho), e o supervisor vê o
  mesmo no detalhe do registro.
- **Rastreabilidade de Contaminação:** aba nova do supervisor, com mapa de calor, ranking e
  histórico das ocorrências, por período, tipo e equipamento.

## Configuração padrão

- **Contas:** as duas contas compartilhadas continuam as mesmas (operação e supervisão).
  Nenhuma conta nova é criada.
- **Lista obrigatória de operadores:** desligada. Quem não estiver na lista pode digitar o
  nome.
- **Limite de alerta de espera:** sem valor. Não há alerta até a coordenação definir um.
- **CIP OSAN:** BBT escolhido na lista fixa, BBT 01 a BBT 12.

## Os sete formulários

| Formulário | Documento de origem |
|---|---|
| CIP Alcalino Clorado | PO-JAC-FAB-004, Anexo 2 |
| CIP Completo | PO-JAC-FAB-004, Anexo 3 |
| CIP Tanque de Levedura | PO-JAC-FAB-032, Anexo 2 |
| CIP Linha de Recuperação de Levedura | PO-JAC-FAB-031, Anexo 2 |
| CIP OSAN | campos do CIP Completo (PO-JAC-FAB-004, Anexo 3) + BBT 01 a BBT 12 |
| CIP Filtração — Filtro 3 (v9) | PO-JAC-FAB-005, Anexo 2, rev. 2 (18/05/2018) |
| CIP Filtração — BMF (v9) | PO-JAC-FAB-024, Anexo 3, rev. 2 (27/07/2021) |

## Operador (conta da operação)

**Registrar um CIP:** Painel → escolha o cartão do formulário → preencha → **Salvar**.
- **Operador:** escolha seu nome na lista. Se o seu nome ainda não estiver cadastrado e a
  lista não for obrigatória, escolha "Outro nome (não cadastrado)…" e digite. Peça ao
  supervisor para cadastrar.
- O sistema remove espaços extras e recusa nomes vazios, com números ou símbolos.
- A data do CIP não pode ser futura. A hora final é obrigatória, exceto no Tanque de Levedura.
- **CIP OSAN:** escolha o BBT na lista (BBT 01 a BBT 12). Os campos são os do CIP Completo.

**Editar:** Histórico → Ver detalhes → Editar este registro. Informe seu nome e uma
justificativa real (respostas como "erro" ou "corrigir" são recusadas). Se o CIP já tinha
sido avaliado, ele volta para o supervisor como "Revisão necessária".

**Adega:** a faixa vermelha no topo avisa quando um procedimento venceu ou vence hoje. Use
"Registrar CIP" na aba Adega.

## CIP Filtração — Filtro 3 e BMF (v9)

São dois formulários separados. Cada um tem os campos e a lista de equipamentos do seu
documento, e os dados de um não aparecem no outro.

### Operador

1. **Abrir o formulário:** no Painel, os cartões **CIP Filtração — Filtro 3** e
   **CIP Filtração — BMF** ficam junto dos outros cinco formulários.
2. **Escolher o equipamento:** a lista vem dividida em três grupos, como no verso do
   documento: **Grupo BMF**, **Filtro 03** e **Blendagem**. Cada item mostra o nome e a sigla,
   por exemplo "Tanque de Cerveja Maturada — UBT". As grafias seguem o documento de cada
   formulário, por isso algumas diferem entre os dois. Exemplo: o Tanque de PVPP é "BVPP" no
   Filtro 3 e "BPVPP" no BMF.
3. **Preencher:** Data, Hora Inicial e Hora Final ficam em "Identificação do CIP". Os campos do
   procedimento ficam em "Detalhes do CIP", em seções:
   - Filtro 3: Identificação do ciclo, Ciclo de soda, Ciclo de ácido e Verificação final.
   - BMF: Ciclo, Concentrações, Tanques e linhas e Verificação final.

   Os campos são de texto livre, exceto as horas do ciclo de ácido (Filtro 3) e o Soaking
   (BMF), que é SIM ou NÃO. Informe a unidade junto do valor (por exemplo "80 °C" ou
   "2,5%"). No BMF, as faixas entre parênteses (por exemplo "2% a 4%") são **só referência**:
   o sistema aceita valores fora delas, sem aviso nem bloqueio.
4. **Nome do operador:** igual aos demais formulários (lista de operadores ou "Outro nome").
   O campo **Coordenador/Líder** é de texto livre e fica em "Verificação final".
5. **Observações:** campo no fim do formulário, igual ao verso do documento.
6. **Salvar.** A data não pode ser futura e a hora final é obrigatória.

**Editar:** Histórico → Ver detalhes → Editar este registro → altere → informe seu nome e a
justificativa → Salvar. O histórico mostra o campo alterado, por exemplo
"Temperatura da Solução: 80 °C → 82 °C". Se o registro já estava avaliado, ele volta ao
supervisor como "Revisão necessária".

### Supervisor

1. **Localizar:** Histórico → filtro **Tipo de CIP** = "CIP Filtração — Filtro 3" ou
   "CIP Filtração — BMF". Também dá para filtrar por equipamento (por exemplo UBT), operador
   e período. Os registros novos também entram nas filas "aguardando avaliação" do Painel.
2. **Avaliar:** na fila do Painel, botão **Avaliar CIP** (ou Histórico → Ver detalhes) →
   Conforme (observação opcional) ou Contaminado (descrição obrigatória) → **Salvar
   avaliação**. Depois de uma edição, o registro aparece em "Revisão necessária": use
   **Reavaliar CIP** para confirmar ou mudar a avaliação, sempre com justificativa.
3. **Observações:** no detalhe do registro, campo "Adicionar observação" → **Salvar observação**. O autor vem da
   conta logada.
4. **Painel:** o filtro de tipo do topo inclui os dois tipos, e os gráficos mostram cada um
   com cor própria.
5. **Relatórios:** menu Relatórios → **Tipo** = um dos dois (ou todos) → **Gerar relatório**.
   - **PDF:** "Imprimir / salvar em PDF".
   - **CSV** de registros e de histórico: abrem direto no Excel. As colunas de cada
     procedimento saem separadas e identificadas, como "Filtro 3 — Pressão" e
     "BMF — Condutividade".
   - **Excel sem baixar arquivo:** "Copiar tabela para o Excel" e colar na planilha.

### Resumo dos campos

Lista completa, com a correspondência de cada campo no sistema: `FORMULARIOS_FILTRACAO.md`.

| | Filtro 3 (21 campos) | BMF (30 campos) |
|---|---|---|
| Identificação | Data, Equipamento, Hora Inicial, Hora Final, Operador | Data, Equipamento, Hora Inicial, Hora Final, Operador |
| Procedimento | Nº Utilização de Soda, Ciclo, Temperatura da Solução, Conc. Inicial e Final de Soda, Tempo de Circulação, Hora Inicial e Final do ciclo de ácido, Conc. Inicial e Final de Ácido, Tempo de Circulação do Ácido, Pressão, pH do enxágue final, Limpeza do ponto de coleta, Coordenador/Líder | Ciclo, Tempo Total de CIP, Soaking (SIM ou NÃO), CIP Hipoclorito (membranas), Conc. Inicial Soda (2% a 4%), Conc. Final Soda (1% a 3%), Conc. Inicial Divos X5 (4500 a 8500 ppm), Conc. Final Divos X5 (500 a 4500 ppm), Conc. Inicial Ácido (0,5%), UBT, UBL, FBT, FBL, Tanques Sílica, PVPP, Alginato, Antioxidante e Lúpulo, Linha Maturada, Linha Adegas, Linha de água, Condutividade, Limpeza pontos de coleta, Coordenador/Líder |
| Verso | Observações | Observações |

### Resumo dos equipamentos

| Grupo | Itens |
|---|---|
| Grupo BMF (13) | UBT, BMF, FBT, UBL, FBL, BTA, BSÍLICA, BVPP (Filtro 3) ou BPVPP (BMF), BALGINATO, BLÚPULO, BFILTRAÇÃO, BBLENDAGEM, BADEGA |
| Filtro 03 (10) | PCM, F03, PCF, Sílica, PVPP, Alginato, TA, Lúpulo 1, Lúpulo 2, LBLEND |
| Blendagem (7) | Aldox, LALDOX, DEGAS, C, D, TQN 25 - 1, TQN 25 - 3 |

## Supervisor (conta da administração)

**Avaliar:** Painel → filas "CIPs aguardando avaliação" e "Revisão necessária".
- Cada item mostra há quanto tempo espera e quando foi registrado. O mais antigo aparece
  marcado.
- Use "Mostrar nas filas" e "Ordenar por tempo de espera". Os filtros do topo (período,
  tipo, equipamento) também valem para as filas.
- **Avaliar CIP** → Conforme (observação opcional) ou Contaminado (descrição obrigatória).
  Corrigir, confirmar ou reavaliar exige justificativa.
- O resumo no topo mostra: quantos aguardam, quantas revisões, o mais antigo, as
  avaliações registradas no período, o tempo mediano até a 1ª avaliação e a situação
  geral. Esses números são informativos: o sistema não define prazo.

**Relatórios:** menu Relatórios → filtros (período, operador, equipamento, tipo, status) →
**Gerar relatório**.
- **Imprimir / salvar em PDF:** relatório completo (procedimento, avaliação, justificativa,
  observações e históricos).
- **Baixar CSV:** "registros" (uma linha por CIP) e "histórico" (uma linha por evento).
  Abrem direto no Excel.
- **Copiar tabela para o Excel:** quando o computador não deixa baixar arquivos; cole na
  planilha.
- O código SHA-256 mostrado permite conferir depois que o arquivo não foi alterado. Ele não
  prova quem gerou o arquivo.

**Gestão:**
- **Operadores:** cadastre os nomes (há sugestões a partir dos registros existentes) e
  desative quem não deve mais aparecer. Nada é apagado.
- **Lista obrigatória:** vem desligada. Ligue só quando todos os operadores estiverem
  cadastrados. Depois disso, o banco só aceita nomes da lista.
- **Limite de alerta de espera:** opcional, em horas, e vem sem valor. Defina somente um
  valor autorizado pela coordenação. Sem valor, não há alerta.
- **Backup:** "Gerar backup agora" → "Verificar" → "Baixar arquivo" quando possível. Os
  backups incluem os registros de todos os sete tipos. Anote num registro separado o
  número, a data e o código de verificação de cada backup: o código SHA-256 detecta
  alterações acidentais, mas não prova sozinho que o arquivo é autêntico (ver
  `BACKUP_E_RECUPERACAO.md`, seção 3).
- **Recuperação de dados:** não é feita pelo site. É um procedimento técnico no SQL Editor,
  sempre ensaiado antes numa réplica local e começando por uma simulação. Ela só acrescenta
  o que falta, sem sobrescrever nem apagar registros: não volta o banco inteiro para o
  estado do backup (seção 5 do mesmo documento).
- **Registros antigos com nome fora das regras** (vazio, só números, só símbolos): continuam
  visíveis com o nome original. Ao editar um registro desses pelo site, o formulário pede
  um nome válido: escolha o nome correto e justifique. A troca fica no histórico de
  alterações.

## Primeiros passos depois da publicação

1. Supervisor: Gestão → cadastrar os operadores, usando as sugestões e conferindo a grafia.
2. Gerar o primeiro backup.
3. Decidir com a coordenação se a lista passa a ser obrigatória e se haverá limite de
   alerta (e qual).
4. v9: registrar um CIP de teste de cada formulário de Filtração só se a coordenação
   autorizar. Os registros não são apagados, então o ideal é fazer o primeiro registro com
   um CIP real.

O Painel FTR, que usa o mesmo projeto Supabase, não é alterado por nenhuma dessas etapas.
