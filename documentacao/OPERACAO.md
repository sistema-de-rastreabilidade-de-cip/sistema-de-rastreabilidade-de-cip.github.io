# Instruções de operação — Rastreabilidade de CIP (v8.1)

Endereço: https://sistema-de-rastreabilidade-de-cip.github.io/

## Operador (conta da operação)

**Registrar um CIP:** Painel → escolha o formulário (Alcalino Clorado, Completo, Tanque de
Levedura, Linha de Recuperação de Levedura ou OSAM) → preencha → **Salvar**.
- **Operador:** escolha seu nome na lista. Se o seu nome ainda não estiver cadastrado e a
  lista não for obrigatória, escolha "Outro nome (não cadastrado)…" e digite. Peça ao
  supervisor para cadastrar.
- O sistema remove espaços extras e recusa nomes vazios, com números ou símbolos.
- A data do CIP não pode ser futura. A hora final é obrigatória, exceto no Tanque de Levedura.
- **CIP OSAM:** escolha o BBT na lista (BBT 01 a BBT 12). Os campos são os do CIP Completo.

**Editar:** Histórico → Ver detalhes → Editar este registro. Informe seu nome e uma
justificativa real (respostas como "erro" ou "corrigir" são recusadas). Se o CIP já tinha
sido avaliado, ele volta para o supervisor como "Revisão necessária".

**Adega:** a faixa vermelha no topo avisa quando um procedimento venceu ou vence hoje. Use
"Registrar CIP" na aba Adega.

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
- O código SHA-256 mostrado permite conferir depois que o arquivo não foi alterado.

**Gestão:**
- **Operadores:** cadastre os nomes (há sugestões a partir dos registros existentes) e
  desative quem não deve mais aparecer. Nada é apagado.
- **Lista obrigatória:** ligue só quando todos os operadores estiverem cadastrados. Depois
  disso, o banco só aceita nomes da lista.
- **Limite de alerta de espera:** opcional, em horas. Defina somente um valor autorizado
  pela coordenação. Sem valor, não há alerta.
- **Backup:** "Gerar backup agora" → "Verificar" → "Baixar arquivo" quando possível (ver
  `BACKUP_E_RECUPERACAO.md`).

## Primeiros passos depois de publicar a v8.1

1. Supervisor: Gestão → cadastrar os operadores, usando as sugestões e conferindo a grafia.
2. Gerar o primeiro backup.
3. Decidir com a coordenação se a lista passa a ser obrigatória e se haverá limite de
   alerta (e qual).
