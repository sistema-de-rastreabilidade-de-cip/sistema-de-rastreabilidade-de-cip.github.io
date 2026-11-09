// =====================================================================
// Definição dos formulários de CIP (4 originais + OSAM na v8 + 2 de Filtração na v9)
// Campos, rótulos e ordem extraídos literalmente dos documentos originais.
// Nenhum campo, unidade, concentração, temperatura, pressão ou limite
// operacional foi inventado — os documentos de referência não trazem
// unidades fixas nesses campos, por isso eles são de texto livre (o
// operador preenche como preenchia no papel).
// =====================================================================

// tipo -> { titulo, documentoOrigem, campoEquipamento, camposDados, temHoraFinal }
const FORM_CONFIG = {
  alcalino_clorado: {
    titulo: "CIP Alcalino Clorado — TFM/HORAP/Trasfega",
    documentoOrigem: "PO-JAC-FAB-004, Anexo 2",
    // Campo de equipamento de nível superior (vai para cip_registros.equipamento)
    equipamento: {
      label: "TFM/HORAP/Linha Trasfega",
      tipoSeletor: "tfm_horap_trasfega",
    },
    temHoraFinal: true,
    // Demais campos específicos (vão para cip_registros.dados)
    campos: [
      { key: "num_utilizacao_solucao_alcalina_clorada", label: "Nº Utilização solução alcalina clorada", tipo: "texto" },
      { key: "painel_cip", label: "Painel de CIP", tipo: "texto" },
      { key: "conc_inicial", label: "Conc. Inicial", tipo: "texto" },
      { key: "conc_final", label: "Conc. Final", tipo: "texto" },
      { key: "tempo_circulacao", label: "Tempo Circul.", tipo: "texto" },
      { key: "num_utilizacao_acido", label: "Nº Utilização Ácido", tipo: "texto" },
      { key: "hora_inicial_acido", label: "Hora Inicial (Ácido)", tipo: "hora" },
      { key: "hora_final_acido", label: "Hora Final (Ácido)", tipo: "hora" },
      { key: "painel_cip_acido", label: "Painel de CIP (Ácido)", tipo: "texto" },
      { key: "conc_inicial_acido", label: "Conc. Inicial Ácido", tipo: "texto" },
      { key: "conc_final_acido", label: "Conc. Final Ácido", tipo: "texto" },
      { key: "tempo_circulacao_acido", label: "Tempo Circul. Ácido", tipo: "texto" },
      { key: "pressao", label: "Pressão", tipo: "texto" },
      { key: "ph_enxague_final", label: "pH enxague Final", tipo: "texto" },
      { key: "limpeza_cone_cupula_microbiologico", label: "Limpeza Cone, cúpula e ponto Microbiológico", tipo: "texto" },
      { key: "coordenador_lider", label: "Coordenador/Líder", tipo: "texto" },
    ],
  },

  completo: {
    titulo: "CIP Completo — TFM/HORAP/Trasfega",
    documentoOrigem: "PO-JAC-FAB-004, Anexo 3",
    equipamento: {
      label: "TFM/HORAP/Trasfega",
      tipoSeletor: "tfm_horap_trasfega",
    },
    temHoraFinal: true,
    campos: [
      { key: "num_utilizacao_soda", label: "Nº Utilização de soda", tipo: "texto" },
      { key: "painel_cip", label: "Painel de CIP", tipo: "texto" },
      { key: "conc_inicial_soda", label: "Conc. Inicial de soda", tipo: "texto" },
      { key: "conc_final_soda", label: "Conc. Final de soda", tipo: "texto" },
      { key: "tempo_circulacao_soda", label: "Tempo Circul. Soda", tipo: "texto" },
      { key: "num_utilizacao_acido", label: "Nº Utilização Ácido", tipo: "texto" },
      { key: "hora_inicial_acido", label: "Hora Inicial (Ácido)", tipo: "hora" },
      { key: "hora_final_acido", label: "Hora Final (Ácido)", tipo: "hora" },
      { key: "painel_cip_acido", label: "Painel de CIP (Ácido)", tipo: "texto" },
      { key: "conc_inicial_acido", label: "Conc. Inicial Ácido", tipo: "texto" },
      { key: "conc_final_acido", label: "Conc. Final Ácido", tipo: "texto" },
      { key: "tempo_circulacao_acido", label: "Tempo Circul. Ácido", tipo: "texto" },
      { key: "num_utilizacao_divosan", label: "Número da Utilização do Divosan Forte", tipo: "texto" },
      { key: "hora_inicial_divosan", label: "Horário Inicial Divosan Forte", tipo: "hora" },
      { key: "hora_final_divosan", label: "Horário final Divosan Forte", tipo: "hora" },
      { key: "conc_inicial_divosan", label: "Conc. Inicial Divosan Forte", tipo: "texto" },
      { key: "conc_final_divosan", label: "Conc. Final Divosan Forte", tipo: "texto" },
      { key: "tempo_circulacao_divosan", label: "Tempo Circul. Divosan Forte", tipo: "texto" },
      { key: "pressao", label: "Pressão", tipo: "texto" },
      { key: "ph_enxague_final", label: "pH enxague Final", tipo: "texto" },
      { key: "limpeza_cone_cupula_microbiologico", label: "Limpeza Cone, cúpula e ponto Microbiológico", tipo: "texto" },
      { key: "coordenador_lider", label: "Coordenador/Líder", tipo: "texto" },
    ],
  },

  tanque_levedura: {
    titulo: "CIP Tanque de Levedura",
    documentoOrigem: "PO-JAC-FAB-032, Anexo 2",
    equipamento: {
      label: "TQ",
      tipoSeletor: "tq_levedura",
    },
    temHoraFinal: false, // o formulário original só tem "Hora Inicial"
    campos: [
      { key: "painel_cip", label: "Painel de CIP", tipo: "texto" },
      { key: "num_utilizacao_solucao_alcalina_clorada", label: "Nº Utilização Solução Alcalina Clorada", tipo: "texto" },
      { key: "conc_inicial_solucao_alcalina_clorada", label: "Conc Inicial Solução Alcalina Clorada", tipo: "texto" },
      { key: "conc_final_solucao_alcalina_clorada", label: "Conc Final Solução Alcalina Clorada", tipo: "texto" },
      { key: "tempo_circulacao_solucao_alcalina_clorada", label: "Tempo Circul. Solução Alcalina Clorada", tipo: "texto" },
      { key: "num_utilizacao_soda", label: "Nº Utilização Soda", tipo: "texto" },
      { key: "conc_inicial_soda", label: "Conc Inicial Soda", tipo: "texto" },
      { key: "conc_final_soda", label: "Conc Final Soda", tipo: "texto" },
      { key: "tempo_circulacao_soda", label: "Tempo Circul. Soda", tipo: "texto" },
      { key: "temperatura_soda", label: "Temperatura Soda", tipo: "texto" },
      { key: "num_utilizacao_acido", label: "Nº Utilização Ácido", tipo: "texto" },
      { key: "conc_inicial_acido", label: "Conc Inicial Ácido", tipo: "texto" },
      { key: "conc_final_acido", label: "Conc Final Ácido", tipo: "texto" },
      { key: "tempo_circulacao_acido", label: "Tempo Circul. Ácido", tipo: "texto" },
      { key: "pressao", label: "Pressão", tipo: "texto" },
      { key: "ph_enxague_final", label: "pH Enxague Final", tipo: "texto" },
      { key: "limpeza_cone_cupula_microbiologico", label: "Limpeza do cone, cupula e ponto microbiologico", tipo: "texto" },
      { key: "validacao_coordenador_lider", label: "Validação (Coordenador/Líder)", tipo: "texto" },
    ],
  },

  linha_recuperacao_levedura: {
    titulo: "CIP Linha de Recuperação de Levedura",
    documentoOrigem: "PO-JAC-FAB-031, Anexo 2",
    // Equipamento principal é fixo: a própria linha. O campo "TFM" do
    // formulário original (tanque de fermentação relacionado) fica em
    // dados.tfm.
    equipamentoFixo: "Linha de Recuperação de Levedura",
    temHoraFinal: true,
    campos: [
      { key: "num_utilizacao_soda", label: "Nº Utilização Soda", tipo: "texto" },
      { key: "tfm", label: "TFM", tipo: "equipamento", tipoSeletor: "tfm" },
      { key: "tq_cip_quente", label: "TQ de CIP Quente (Sim ou Não)", tipo: "sim_nao" },
      { key: "conc_inicial_soda", label: "Conc Inicial Soda", tipo: "texto" },
      { key: "conc_final_soda", label: "Conc Final Soda", tipo: "texto" },
      { key: "tempo_circulacao_soda", label: "Tempo Circul. Soda", tipo: "texto" },
      { key: "temperatura_soda", label: "Temperatura Soda", tipo: "texto" },
      { key: "num_utilizacao_acido", label: "Nº Utilização Ácido", tipo: "texto" },
      { key: "conc_inicial_acido", label: "Conc Inicial Ácido", tipo: "texto" },
      { key: "conc_final_acido", label: "Conc Final Ácido", tipo: "texto" },
      { key: "tempo_circulacao_acido", label: "Tempo Circul. Ácido", tipo: "texto" },
      { key: "pressao", label: "Pressão", tipo: "texto" },
      { key: "ph_enxague_final", label: "pH Enxague Final", tipo: "texto" },
      { key: "validacao_coordenador_lider", label: "Validação (Coordenador/Líder)", tipo: "texto" },
    ],
  },
};

// CIP OSAM (v8) — decisão aprovada: mesmo padrão e mesmos campos de
// processo do CIP Completo (PO-JAC-FAB-004, Anexo 3), com hora final
// igual ao Completo e, no lugar do equipamento, a identificação do BBT
// escolhida numa lista fixa (BBT 01 a BBT 12) — sem digitação manual.
// Nenhum campo novo (ex.: temperatura) foi acrescentado.
const BBTS_OSAM = Array.from({ length: 12 }, (_, i) => `BBT ${String(i + 1).padStart(2, "0")}`);
FORM_CONFIG.osam = {
  titulo: "CIP OSAM — BBT",
  documentoOrigem: "Campos do CIP Completo (PO-JAC-FAB-004, Anexo 3) + identificação do BBT",
  bbt: { label: "BBT", opcoes: BBTS_OSAM },
  temHoraFinal: true,
  campos: FORM_CONFIG.completo.campos.map((c) => ({ ...c })),
};

// =====================================================================
// v9 — CIP de Filtração (dois procedimentos, campos SEPARADOS)
// Fonte dos campos: lista da solicitação de 09/11/2026, que transcreve
//   PO-JAC-FAB-005 rev. 2 (18/05/2018) — Anexo 2, CIP Filtração Filtro 3
//   PO-JAC-FAB-024 rev. 2 (27/07/2021) — Anexo 3, CIP Filtração BMF
// PENDENTE DE CONFERÊNCIA com as planilhas originais (Frente e Verso), que
// não foram recebidas. Campos de texto livre, como nos demais formulários:
// nenhuma unidade, faixa ou limite foi inventado. As faixas entre parênteses
// do Anexo 3 estão no próprio rótulo, só como referência (sem bloqueio).
// Chaves com prefixo próprio (f3_ / bmf_) para nunca misturar os dois
// procedimentos em relatórios e exportações.
// Campos de identificação ficam no topo do formulário (Data, Equipamento,
// Hora inicial/final, Operador) e Observações no fim, como nos demais.
// =====================================================================
FORM_CONFIG.filtracao_filtro3 = {
  titulo: "CIP Filtração — Filtro 3",
  documentoOrigem: "PO-JAC-FAB-005, Anexo 2 — Controle de CIP Filtração - Filtro 3 (rev. 2, 18/05/2018)",
  prefixoRelatorio: "Filtro 3",
  equipamento: { label: "Equipamento", tipoSeletor: "filtracao_filtro3" },
  temHoraFinal: true,
  campos: [
    { key: "f3_num_utilizacao_soda", label: "Nº Utilização de Soda", tipo: "texto", secao: "Identificação do ciclo" },
    { key: "f3_ciclo", label: "Ciclo", tipo: "texto", secao: "Identificação do ciclo" },
    { key: "f3_temperatura_solucao", label: "Temperatura da Solução", tipo: "texto", secao: "Ciclo de soda" },
    { key: "f3_conc_inicial_soda", label: "Concentração Inicial de Soda", tipo: "texto", secao: "Ciclo de soda" },
    { key: "f3_conc_final_soda", label: "Concentração Final de Soda", tipo: "texto", secao: "Ciclo de soda" },
    { key: "f3_tempo_circulacao", label: "Tempo de Circulação", tipo: "texto", secao: "Ciclo de soda" },
    { key: "f3_hora_inicial_acido", label: "Hora Inicial do ciclo de ácido", tipo: "hora", secao: "Ciclo de ácido" },
    { key: "f3_hora_final_acido", label: "Hora Final do ciclo de ácido", tipo: "hora", secao: "Ciclo de ácido" },
    { key: "f3_conc_inicial_acido", label: "Concentração Inicial de Ácido", tipo: "texto", secao: "Ciclo de ácido" },
    { key: "f3_conc_final_acido", label: "Concentração Final de Ácido", tipo: "texto", secao: "Ciclo de ácido" },
    { key: "f3_tempo_circulacao_acido", label: "Tempo de Circulação do Ácido", tipo: "texto", secao: "Ciclo de ácido" },
    { key: "f3_pressao", label: "Pressão", tipo: "texto", secao: "Verificação final" },
    { key: "f3_ph_enxague_final", label: "pH do enxágue final", tipo: "texto", secao: "Verificação final" },
    { key: "f3_limpeza_ponto_coleta", label: "Limpeza do ponto de coleta", tipo: "texto", secao: "Verificação final" },
    { key: "f3_coordenador_lider", label: "Coordenador/Líder", tipo: "texto", secao: "Verificação final" },
  ],
};

FORM_CONFIG.filtracao_bmf = {
  titulo: "CIP Filtração — BMF",
  documentoOrigem: "PO-JAC-FAB-024, Anexo 3 — Controle de CIP Filtração - BMF (rev. 2, 27/07/2021)",
  prefixoRelatorio: "BMF",
  nota: "As faixas entre parênteses reproduzem o documento PO-JAC-FAB-024 e servem só como referência: o sistema não bloqueia nem avalia valores fora delas.",
  equipamento: { label: "Equipamento", tipoSeletor: "filtracao_bmf" },
  temHoraFinal: true,
  campos: [
    { key: "bmf_ciclo", label: "Ciclo", tipo: "texto", secao: "Ciclo" },
    { key: "bmf_tempo_total_cip", label: "Tempo Total de CIP", tipo: "texto", secao: "Ciclo" },
    { key: "bmf_soaking", label: "Soaking (SIM ou NÃO)", tipo: "opcoes", opcoes: ["SIM", "NÃO"], secao: "Ciclo" },
    { key: "bmf_cip_hipoclorito", label: "CIP Hipoclorito (membranas)", tipo: "texto", secao: "Ciclo" },
    { key: "bmf_conc_inicial_soda", label: "Concentração Inicial de Soda (2% a 4%)", tipo: "texto", secao: "Concentrações" },
    { key: "bmf_conc_final_soda", label: "Concentração Final de Soda (1% a 3%)", tipo: "texto", secao: "Concentrações" },
    { key: "bmf_conc_inicial_divos", label: "Concentração Inicial de Divos X5 (4500 a 8500 ppm)", tipo: "texto", secao: "Concentrações" },
    { key: "bmf_conc_final_divos", label: "Concentração Final de Divos X5 (500 a 4500 ppm)", tipo: "texto", secao: "Concentrações" },
    { key: "bmf_conc_inicial_acido", label: "Concentração Inicial de Ácido (0,5%)", tipo: "texto", secao: "Concentrações" },
    { key: "bmf_ubt", label: "UBT", tipo: "texto", secao: "Tanques e linhas" },
    { key: "bmf_ubl", label: "UBL", tipo: "texto", secao: "Tanques e linhas" },
    { key: "bmf_fbt", label: "FBT", tipo: "texto", secao: "Tanques e linhas" },
    { key: "bmf_fbl", label: "FBL", tipo: "texto", secao: "Tanques e linhas" },
    { key: "bmf_tanque_silica", label: "Tanque Sílica", tipo: "texto", secao: "Tanques e linhas" },
    { key: "bmf_tanque_pvpp", label: "Tanque PVPP", tipo: "texto", secao: "Tanques e linhas" },
    { key: "bmf_tanque_alginato", label: "Tanque Alginato", tipo: "texto", secao: "Tanques e linhas" },
    { key: "bmf_tanque_antioxidante", label: "Tanque Antioxidante", tipo: "texto", secao: "Tanques e linhas" },
    { key: "bmf_tanque_lupulo", label: "Tanque Lúpulo", tipo: "texto", secao: "Tanques e linhas" },
    { key: "bmf_linha_maturada", label: "Linha Maturada", tipo: "texto", secao: "Tanques e linhas" },
    { key: "bmf_linha_adegas", label: "Linha Adegas", tipo: "texto", secao: "Tanques e linhas" },
    { key: "bmf_linha_agua", label: "Linha de água", tipo: "texto", secao: "Tanques e linhas" },
    { key: "bmf_condutividade", label: "Condutividade", tipo: "texto", secao: "Verificação final" },
    { key: "bmf_limpeza_pontos_coleta", label: "Limpeza pontos de coleta", tipo: "texto", secao: "Verificação final" },
    { key: "bmf_coordenador_lider", label: "Coordenador/Líder", tipo: "texto", secao: "Verificação final" },
  ],
};

const TIPO_CIP_LABELS = {
  alcalino_clorado: "CIP Alcalino Clorado",
  completo: "CIP Completo",
  tanque_levedura: "CIP Tanque de Levedura",
  linha_recuperacao_levedura: "CIP Linha de Recuperação de Levedura",
  osam: "CIP OSAM",
  filtracao_filtro3: "CIP Filtração — Filtro 3",
  filtracao_bmf: "CIP Filtração — BMF",
};
