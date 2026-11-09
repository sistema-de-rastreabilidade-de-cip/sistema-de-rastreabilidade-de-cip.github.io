// =====================================================================
// Lista de equipamentos — extraída do verso dos formulários originais
// (idêntica nos 4 anexos: PO-JAC-FAB-004 Anexo 2/3, PO-JAC-FAB-031 Anexo 2,
// PO-JAC-FAB-032 Anexo 2). Nenhum equipamento foi inventado.
// =====================================================================

// Tanques de Fermentação 01 a 65.
// Os tanques 53 a 63 também são identificados pelo código de painel HORAP
// H01 a H11 nos documentos originais (mesmo tanque físico).
const TANQUES_FERMENTACAO = (() => {
  const lista = [];
  for (let n = 1; n <= 65; n++) {
    const numero = String(n).padStart(2, "0");
    let codigoHorap = null;
    if (n >= 53 && n <= 63) {
      codigoHorap = "H" + String(n - 52).padStart(2, "0");
    }
    lista.push({
      categoria: "fermentacao",
      nome: `Tanque de Fermentação ${numero}`,
      codigoHorap,
    });
  }
  return lista;
})();

// Tanques de Levedura 01 a 13 (código TQ1 a TQ13 nos documentos originais)
const TANQUES_LEVEDURA = (() => {
  const lista = [];
  for (let n = 1; n <= 13; n++) {
    const numero = String(n).padStart(2, "0");
    lista.push({
      categoria: "levedura",
      nome: `Tanque de Levedura ${numero}`,
      codigo: `TQ${n}`,
    });
  }
  return lista;
})();

// Demais equipamentos do verso dos formulários
const OUTROS_EQUIPAMENTOS = [
  { categoria: "linha_recuperacao_fermento", nome: "Linha de Recuperação de Fermento", codigo: "LRF" },
  { categoria: "adega", nome: "Adega A", codigo: "A" },
  { categoria: "adega", nome: "Adega B", codigo: "B" },
  { categoria: "trasfega", nome: "Linha de Trasfega", codigo: "LT" },
];

// Lista completa (para o histórico/filtros)
const TODOS_EQUIPAMENTOS = [
  ...TANQUES_FERMENTACAO,
  ...TANQUES_LEVEDURA,
  ...OUTROS_EQUIPAMENTOS,
];

function nomeExibicaoEquipamento(item) {
  if (item.codigoHorap) {
    return `${item.nome} (HORAP ${item.codigoHorap})`;
  }
  return item.nome;
}

// Conjuntos usados para restringir os seletores de equipamento de cada
// campo, de acordo com o próprio nome do campo no formulário original:
//   - "TFM/HORAP/Linha Trasfega" e "TFM/HORAP/Trasfega" -> tanques de
//     fermentação (inclui HORAP) + Linha de Trasfega
//   - "TQ" (CIP Tanque de Levedura)                     -> tanques de levedura
//   - "TFM" (CIP Linha de Recuperação de Levedura)       -> tanques de fermentação
function listaEquipamentosParaCampo(tipoSeletor) {
  switch (tipoSeletor) {
    case "tfm_horap_trasfega":
      return [...TANQUES_FERMENTACAO, OUTROS_EQUIPAMENTOS.find((e) => e.codigo === "LT")];
    case "tq_levedura":
      return TANQUES_LEVEDURA;
    case "tfm":
      return TANQUES_FERMENTACAO;
    case "filtracao_filtro3":
      return EQUIP_FILTRACAO_FILTRO3; // definido abaixo (v9)
    case "filtracao_bmf":
      return EQUIP_FILTRACAO_BMF;     // definido abaixo (v9)
    default:
      return TODOS_EQUIPAMENTOS;
  }
}

// =====================================================================
// v9 — Equipamentos e referências da Filtração.
// Fonte: texto da solicitação de 09/11/2026, transcrevendo os documentos
//   PO-JAC-FAB-005 (Anexo 2 — CIP Filtração Filtro 3, rev. 2) e
//   PO-JAC-FAB-024 (Anexo 3 — CIP Filtração BMF, rev. 2).
// PENDENTE DE CONFERÊNCIA com as planilhas originais (não recebidas).
// Cada documento mantém a SUA grafia — as divergências entre os anexos
// (FBL filtrada × não filtrada; BVPP × BPVPP; "Linha de Adega" × "Linha
// até Adega"; "Membrana" × "de Membrana") NÃO foram padronizadas.
// =====================================================================
function equipFiltracao(grupo, nome, codigo) {
  return { categoria: "filtracao", grupo, nome: `${nome} — ${codigo}`, codigo };
}
const REFERENCIAS_FILTRO03 = [
  ["Tanque de Cerveja a Filtrar", "PCM"],
  ["Filtro de Cerveja por placas", "F03"],
  ["Tanque de Cerveja Filtrada", "PCF"],
  ["Tanque de Sílica", "Sílica"],
  ["Tanque de PVPP", "PVPP"],
  ["Tanque de Alginato", "Alginato"],
  ["Tanque de Antioxidante", "TA"],
  ["Tanque de Lúpulo 1", "Lúpulo 1"],
  ["Tanque de Lúpulo 2", "Lúpulo 2"],
  ["Linha de Blendagem", "LBLEND"],
];
const REFERENCIAS_BLENDAGEM = [
  ["Aldox", "Aldox"],
  ["Linha Aldox até utilidades", "LALDOX"],
  ["Degas", "DEGAS"],
  ["Adega de água de Diluição C", "C"],
  ["Adega de água de Diluição D", "D"],
  ["Tanque de água nobre sala 01", "TQN 25 - 1"],
  ["Tanque de água nobre sala 03", "TQN 25 - 3"],
];
// Anexo 2 (PO-JAC-FAB-005) — CIP Filtração Filtro 3
const EQUIP_FILTRACAO_FILTRO3 = [
  ...[
    ["Tanque de Cerveja Maturada", "UBT"],
    ["Filtro de Cerveja Membrana", "BMF"],
    ["Tanque de Cerveja Filtrada", "FBT"],
    ["Linha de Cerveja não filtrada", "UBL"],
    ["Linha de Cerveja filtrada", "FBL"],
    ["Tanque de Antioxidante", "BTA"],
    ["Tanque de Sílica", "BSÍLICA"],
    ["Tanque de PVPP", "BVPP"],
    ["Tanque de Alginato", "BALGINATO"],
    ["Tanque de Lúpulo", "BLÚPULO"],
    ["Linha de Filtração", "BFILTRAÇÃO"],
    ["Linha de Blendagem", "BBLENDAGEM"],
    ["Linha de Adega", "BADEGA"],
  ].map(([n, c]) => equipFiltracao("Grupo BMF", n, c)),
  ...REFERENCIAS_FILTRO03.map(([n, c]) => equipFiltracao("Filtro 03", n, c)),
  ...REFERENCIAS_BLENDAGEM.map(([n, c]) => equipFiltracao("Blendagem", n, c)),
];
// Anexo 3 (PO-JAC-FAB-024) — CIP Filtração BMF
const EQUIP_FILTRACAO_BMF = [
  ...[
    ["Tanque de Cerveja Maturada", "UBT"],
    ["Filtro de Cerveja de Membrana", "BMF"],
    ["Tanque de Cerveja Filtrada", "FBT"],
    ["Linha de Cerveja não filtrada", "UBL"],
    ["Linha de Cerveja não filtrada", "FBL"], // assim no Anexo 3 (o Anexo 2 diz "filtrada") — divergência registrada
    ["Tanque de Antioxidante", "BTA"],
    ["Tanque de Sílica", "BSÍLICA"],
    ["Tanque de PVPP", "BPVPP"],             // Anexo 2: BVPP — divergência registrada
    ["Tanque de Alginato", "BALGINATO"],
    ["Tanque de Lúpulo", "BLÚPULO"],
    ["Linha de Filtração", "BFILTRAÇÃO"],
    ["Linha de Blendagem", "BBLENDAGEM"],
    ["Linha até Adega", "BADEGA"],
  ].map(([n, c]) => equipFiltracao("Grupo BMF", n, c)),
  // Verso do Anexo 3: referências de Filtro 03 e Blendagem (mesma relação do Anexo 2, a conferir).
  ...REFERENCIAS_FILTRO03.map(([n, c]) => equipFiltracao("Filtro 03", n, c)),
  ...REFERENCIAS_BLENDAGEM.map(([n, c]) => equipFiltracao("Blendagem", n, c)),
];

(function incluirFiltracaoNasListas() {
  const vistos = new Set(TODOS_EQUIPAMENTOS.map((e) => e.nome));
  [...EQUIP_FILTRACAO_FILTRO3, ...EQUIP_FILTRACAO_BMF].forEach((e) => {
    if (!vistos.has(e.nome)) { vistos.add(e.nome); TODOS_EQUIPAMENTOS.push(e); }
  });
})();
