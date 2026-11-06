// =====================================================================
// Dashboard gerencial do administrador (painel.html).
// Todos os números e gráficos vêm de consultas reais a cip_registros no
// Supabase — nada aqui é fixo, demonstrativo ou inventado. Quando não
// há dados suficientes (ou uma regra real para calcular algo), a tela
// mostra isso explicitamente em vez de inventar um valor.
//
// "Registros que necessitam de revisão": o formulário pedia este
// cartão apenas se existir uma regra real para identificá-los. A
// tabela cip_registros (ver supabase/schema.sql) não tem nenhuma
// coluna de status/revisão/conformidade — por isso este cartão foi
// deliberadamente OMITIDO, em vez de inventado.
// =====================================================================

const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function dashFormatarMes(aaaaMm) {
  const [ano, mes] = aaaaMm.split("-");
  return `${MESES_ABREV[Number(mes) - 1]}/${ano.slice(2)}`;
}

function dashChaveMes(dataIso) {
  return dataIso.slice(0, 7); // "AAAA-MM"
}

function dashEscaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = String(texto ?? "");
  return div.innerHTML;
}

// ---------------------------------------------------------------------
// Busca (uma única consulta, reaproveitada para KPIs e os 4 gráficos —
// evita múltiplas consultas pesadas separadas ao banco)
// ---------------------------------------------------------------------
const DASH_LIMITE_REGISTROS = 2000;

async function dashBuscarRegistros(filtros) {
  let query = supabaseClient
    .from("vw_cip_registros")
    .select("id, tipo_cip, equipamento, bbt, data_cip, hora_inicial, hora_final, nome_operador, criado_em, situacao_avaliacao, revisao_pendente, revisao_desde")
    .order("data_cip", { ascending: false })
    .limit(DASH_LIMITE_REGISTROS);

  if (filtros.tipo) query = query.eq("tipo_cip", filtros.tipo);
  if (filtros.equipamento) query = query.ilike("equipamento", `%${filtros.equipamento}%`);
  if (filtros.dataInicio) query = query.gte("data_cip", filtros.dataInicio);
  if (filtros.dataFim) query = query.lte("data_cip", filtros.dataFim);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------------------
// Agregações (tudo client-side, sobre o resultado já buscado)
// ---------------------------------------------------------------------

function dashCalcularKPIs(registros) {
  const hoje = new Date();
  const mesAtualChave = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  const porTipo = {};
  Object.keys(TIPO_CIP_LABELS).forEach((t) => (porTipo[t] = 0));
  const equipamentos = new Set();
  let noMesAtual = 0;

  registros.forEach((r) => {
    if (porTipo[r.tipo_cip] !== undefined) porTipo[r.tipo_cip]++;
    if (r.equipamento) equipamentos.add(r.equipamento);
    if (dashChaveMes(r.data_cip) === mesAtualChave) noMesAtual++;
  });

  return {
    total: registros.length,
    noMesAtual,
    porTipo,
    equipamentosDistintos: equipamentos.size,
  };
}

function dashAgruparPorMes(registros) {
  if (registros.length === 0) return [];
  const contagem = {};
  registros.forEach((r) => {
    const chave = dashChaveMes(r.data_cip);
    contagem[chave] = (contagem[chave] || 0) + 1;
  });
  const chaves = Object.keys(contagem).sort();
  // Preenche meses sem registro entre o primeiro e o último, para a
  // evolução mensal não parecer um intervalo aleatório de barras.
  const [anoIni, mesIni] = chaves[0].split("-").map(Number);
  const [anoFim, mesFim] = chaves[chaves.length - 1].split("-").map(Number);
  const serie = [];
  let ano = anoIni;
  let mes = mesIni;
  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    const chave = `${ano}-${String(mes).padStart(2, "0")}`;
    serie.push({ mes: chave, total: contagem[chave] || 0 });
    mes++;
    if (mes > 12) {
      mes = 1;
      ano++;
    }
  }
  return serie;
}

function dashAgruparPorTipo(registros) {
  const porTipo = {};
  Object.keys(TIPO_CIP_LABELS).forEach((t) => (porTipo[t] = 0));
  registros.forEach((r) => {
    if (porTipo[r.tipo_cip] !== undefined) porTipo[r.tipo_cip]++;
  });
  return Object.keys(porTipo).map((tipo) => ({ tipo, label: TIPO_CIP_LABELS[tipo], total: porTipo[tipo] }));
}

function dashAgruparPorEquipamento(registros, topN) {
  const contagem = {};
  registros.forEach((r) => {
    if (!r.equipamento) return;
    contagem[r.equipamento] = (contagem[r.equipamento] || 0) + 1;
  });
  return Object.entries(contagem)
    .map(([equipamento, total]) => ({ equipamento, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, topN || 10);
}

// Diferença em minutos entre hora_inicial e hora_final (formato "HH:MM:SS"
// ou "HH:MM"), tratando corretamente um CIP que atravessa a meia-noite.
function dashDuracaoMinutos(horaInicial, horaFinal) {
  const paraMinutos = (h) => {
    const [hh, mm] = h.split(":").map(Number);
    return hh * 60 + mm;
  };
  const ini = paraMinutos(horaInicial);
  const fim = paraMinutos(horaFinal);
  let diff = fim - ini;
  if (diff < 0) diff += 24 * 60; // atravessou a meia-noite
  return diff;
}

// Só considera um registro para duração se o TIPO realmente tem campo de
// hora final no formulário original (FORM_CONFIG[...].temHoraFinal) e se
// ambos os horários estão de fato preenchidos — nunca estima um valor.
function dashCalcularDuracoes(registros) {
  const porTipo = {};
  const porMes = {};

  registros.forEach((r) => {
    const config = FORM_CONFIG[r.tipo_cip];
    if (!config || !config.temHoraFinal) return;
    if (!r.hora_inicial || !r.hora_final) return;
    const minutos = dashDuracaoMinutos(r.hora_inicial, r.hora_final);
    if (!Number.isFinite(minutos) || minutos <= 0 || minutos > 20 * 60) return; // descarta valores implausíveis (>20h), provável erro de digitação, sem tentar "corrigir"

    if (!porTipo[r.tipo_cip]) porTipo[r.tipo_cip] = [];
    porTipo[r.tipo_cip].push(minutos);

    const chaveMes = dashChaveMes(r.data_cip);
    if (!porMes[chaveMes]) porMes[chaveMes] = [];
    porMes[chaveMes].push(minutos);
  });

  const media = (lista) => lista.reduce((a, b) => a + b, 0) / lista.length;

  const porTipoResultado = Object.keys(TIPO_CIP_LABELS)
    .map((tipo) => ({
      tipo,
      label: TIPO_CIP_LABELS[tipo],
      temCampoHoraFinal: !!(FORM_CONFIG[tipo] && FORM_CONFIG[tipo].temHoraFinal),
      amostras: porTipo[tipo] ? porTipo[tipo].length : 0,
      mediaMinutos: porTipo[tipo] && porTipo[tipo].length ? media(porTipo[tipo]) : null,
    }));

  const porMesResultado = Object.keys(porMes)
    .sort()
    .map((chave) => ({ mes: chave, amostras: porMes[chave].length, mediaMinutos: media(porMes[chave]) }));

  return { porTipo: porTipoResultado, porMes: porMesResultado };
}

function dashFormatarMinutos(min) {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
}

// ---------------------------------------------------------------------
// Navegação para o histórico já filtrado (drill-down ao clicar em uma
// coluna/segmento/equipamento de um gráfico)
// ---------------------------------------------------------------------
function dashIrParaHistorico(filtrosExtra, filtrosAtuais) {
  const params = new URLSearchParams();
  const tipo = (filtrosExtra && filtrosExtra.tipo) || filtrosAtuais.tipo;
  const equipamento = (filtrosExtra && filtrosExtra.equipamento) || filtrosAtuais.equipamento;
  let dataInicio = filtrosAtuais.dataInicio;
  let dataFim = filtrosAtuais.dataFim;
  if (filtrosExtra && filtrosExtra.mes) {
    dataInicio = `${filtrosExtra.mes}-01`;
    const [ano, mes] = filtrosExtra.mes.split("-").map(Number);
    const proximo = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
    const fimDate = new Date(proximo);
    fimDate.setDate(fimDate.getDate() - 1);
    dataFim = fimDate.toISOString().slice(0, 10);
  }
  if (tipo) params.set("tipo", tipo);
  if (equipamento) params.set("equipamento", equipamento);
  if (dataInicio) params.set("dataInicio", dataInicio);
  if (dataFim) params.set("dataFim", dataFim);
  window.location.href = "historico.html" + (params.toString() ? "?" + params.toString() : "");
}

// ---------------------------------------------------------------------
// Paleta dos gráficos (mesma identidade do sistema — não usa cores
// aleatórias do Chart.js)
// ---------------------------------------------------------------------
const DASH_CORES = {
  primaria: "#1f4d3a",
  primariaClara: "#3c7a5c",
  admin: "#2a4b57",
  adminClara: "#4a7a8c",
  aviso: "#b8752b",
  erro: "#a23b3b",
  grade: "#d7ded3",
  texto: "#4b5750",
};
const DASH_CORES_TIPO = ["#1f4d3a", "#3c7a5c", "#2a4b57", "#4a7a8c", "#5b5796"];

function dashOpcoesBase() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: DASH_CORES.texto, font: { family: "IBM Plex Sans" } } },
      tooltip: { titleFont: { family: "IBM Plex Sans" }, bodyFont: { family: "IBM Plex Sans" } },
    },
    scales: {
      x: { ticks: { color: DASH_CORES.texto, font: { family: "IBM Plex Mono", size: 11 } }, grid: { color: DASH_CORES.grade } },
      y: { ticks: { color: DASH_CORES.texto, font: { family: "IBM Plex Mono", size: 11 } }, grid: { color: DASH_CORES.grade }, beginAtZero: true },
    },
  };
}

// =======================================================================
// Orquestração do dashboard (chamada por painel.html quando perfil é
// "administrador"). Mantém os filtros e as instâncias dos 4 gráficos.
// =======================================================================

let dashFiltrosAtuais = { tipo: "", equipamento: "", dataInicio: "", dataFim: "" };
let dashRegistrosAtuais = [];
let dashGraficos = { a: null, b: null, c: null, d: null };

function dashLerFiltros() {
  return {
    tipo: document.getElementById("dash-filtro-tipo").value,
    equipamento: document.getElementById("dash-filtro-equipamento").value.trim(),
    dataInicio: document.getElementById("dash-filtro-data-inicio").value,
    dataFim: document.getElementById("dash-filtro-data-fim").value,
  };
}

function dashMostrarMensagem(tipo, texto) {
  const el = document.getElementById("dash-mensagem");
  if (!texto) {
    el.innerHTML = "";
    return;
  }
  const classe = tipo === "erro" ? "mensagem-erro" : tipo === "aviso" ? "mensagem-aviso" : "mensagem-sucesso";
  el.innerHTML = `<div class="${classe}">${dashEscaparHtml(texto)}</div>`;
}

function dashRenderizarKPIs(kpis, filtros) {
  document.getElementById("kpi-total").textContent = String(kpis.total);
  document.getElementById("kpi-mes-atual").textContent = String(kpis.noMesAtual);
  document.getElementById("kpi-equipamentos").textContent = String(kpis.equipamentosDistintos);

  const container = document.getElementById("kpi-por-tipo-badges");
  const entradas = Object.keys(TIPO_CIP_LABELS).map((tipo) => ({ tipo, total: kpis.porTipo[tipo] || 0 }));
  container.innerHTML = entradas
    .map((e) => `<span class="badge" title="${dashEscaparHtml(TIPO_CIP_LABELS[e.tipo])}">${dashEscaparHtml(TIPO_CIP_LABELS[e.tipo])}: ${e.total}</span>`)
    .join("");

  const avisoLimite = document.getElementById("dash-aviso-limite");
  avisoLimite.textContent =
    kpis.total === DASH_LIMITE_REGISTROS
      ? `Mostrando os ${DASH_LIMITE_REGISTROS} registros mais recentes que combinam com o filtro — use o período para refinar se houver mais.`
      : "";
}

function dashDestruirGrafico(chave) {
  if (dashGraficos[chave]) {
    dashGraficos[chave].destroy();
    dashGraficos[chave] = null;
  }
}

function dashMostrarEstadoGrafico(idEstado, tipo, texto) {
  const el = document.getElementById(idEstado);
  if (!texto) {
    el.className = "oculto";
    el.innerHTML = "";
    return;
  }
  el.className = tipo === "erro" ? "estado-erro" : tipo === "carregando" ? "estado-carregando" : "estado-vazio";
  el.textContent = texto;
}

function dashRenderizarGraficoA(registros, filtros, comparar) {
  dashDestruirGrafico("a");
  const serieAtual = dashAgruparPorMes(registros);
  if (serieAtual.length === 0) {
    dashMostrarEstadoGrafico("grafico-a-estado", "vazio", "Sem dados disponíveis para o período selecionado.");
    return;
  }
  dashMostrarEstadoGrafico("grafico-a-estado", null, null);

  const datasets = [
    {
      label: "Registros",
      data: serieAtual.map((p) => p.total),
      backgroundColor: DASH_CORES.primariaClara,
      borderColor: DASH_CORES.primaria,
      borderRadius: 3,
    },
  ];

  if (comparar && filtros.dataInicio && filtros.dataFim) {
    const inicio = new Date(filtros.dataInicio);
    const fim = new Date(filtros.dataFim);
    const spanDias = Math.max(1, Math.round((fim - inicio) / 86400000) + 1);
    const fimAnterior = new Date(inicio);
    fimAnterior.setDate(fimAnterior.getDate() - 1);
    const inicioAnterior = new Date(fimAnterior);
    inicioAnterior.setDate(inicioAnterior.getDate() - (spanDias - 1));

    dashBuscarRegistros({
      tipo: filtros.tipo,
      equipamento: filtros.equipamento,
      dataInicio: inicioAnterior.toISOString().slice(0, 10),
      dataFim: fimAnterior.toISOString().slice(0, 10),
    }).then((registrosAnteriores) => {
      const serieAnterior = dashAgruparPorMes(registrosAnteriores);
      const totalAnterior = serieAnterior.reduce((a, p) => a + p.total, 0);
      // Alinhado por posição (mês 1 do período anterior vs. mês 1 do
      // período atual) — os rótulos do eixo continuam sendo os meses do
      // período ATUAL, então a série anterior é só um comparativo visual.
      const valoresAnteriores = serieAtual.map((_, i) => (serieAnterior[i] ? serieAnterior[i].total : 0));
      dashGraficos.a.data.datasets.push({
        label: `Período anterior (${totalAnterior} no total)`,
        data: valoresAnteriores,
        backgroundColor: "rgba(0,0,0,0)",
        borderColor: DASH_CORES.aviso,
        borderDash: [5, 4],
        type: "line",
        tension: 0.25,
      });
      dashGraficos.a.update();
    }).catch(() => {
      // Comparação é um extra opcional — se falhar, mantém o gráfico
      // principal (já renderizado) sem o comparativo, sem travar a tela.
    });
  }

  const ctx = document.getElementById("grafico-a").getContext("2d");
  dashGraficos.a = new Chart(ctx, {
    type: "bar",
    data: { labels: serieAtual.map((p) => dashFormatarMes(p.mes)), datasets },
    options: {
      ...dashOpcoesBase(),
      onClick: (evt, elementos) => {
        if (!elementos.length) return;
        const idx = elementos[0].index;
        dashIrParaHistorico({ mes: serieAtual[idx].mes }, filtros);
      },
    },
  });
}

function dashRenderizarGraficoB(registros, filtros) {
  dashDestruirGrafico("b");
  const dadosTipo = dashAgruparPorTipo(registros);
  const total = dadosTipo.reduce((a, d) => a + d.total, 0);
  if (total === 0) {
    dashMostrarEstadoGrafico("grafico-b-estado", "vazio", "Sem dados disponíveis para o período selecionado.");
    return;
  }
  dashMostrarEstadoGrafico("grafico-b-estado", null, null);

  const ctx = document.getElementById("grafico-b").getContext("2d");
  dashGraficos.b = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: dadosTipo.map((d) => d.label),
      datasets: [{ data: dadosTipo.map((d) => d.total), backgroundColor: DASH_CORES_TIPO, borderColor: "#fff", borderWidth: 2 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { color: DASH_CORES.texto, font: { family: "IBM Plex Sans", size: 11 } } } },
      onClick: (evt, elementos) => {
        if (!elementos.length) return;
        const idx = elementos[0].index;
        dashIrParaHistorico({ tipo: dadosTipo[idx].tipo }, filtros);
      },
    },
  });
}

function dashRenderizarGraficoC(registros, filtros) {
  dashDestruirGrafico("c");
  const dadosEquip = dashAgruparPorEquipamento(registros, 10);
  if (dadosEquip.length === 0) {
    dashMostrarEstadoGrafico("grafico-c-estado", "vazio", "Sem dados disponíveis para o período selecionado.");
    return;
  }
  dashMostrarEstadoGrafico("grafico-c-estado", null, null);

  const ctx = document.getElementById("grafico-c").getContext("2d");
  dashGraficos.c = new Chart(ctx, {
    type: "bar",
    data: {
      labels: dadosEquip.map((d) => d.equipamento),
      datasets: [{ label: "Registros", data: dadosEquip.map((d) => d.total), backgroundColor: DASH_CORES.adminClara, borderColor: DASH_CORES.admin, borderRadius: 3 }],
    },
    options: {
      ...dashOpcoesBase(),
      indexAxis: "y",
      plugins: { ...dashOpcoesBase().plugins, legend: { display: false } },
      onClick: (evt, elementos) => {
        if (!elementos.length) return;
        const idx = elementos[0].index;
        dashIrParaHistorico({ equipamento: dadosEquip[idx].equipamento }, filtros);
      },
    },
  });
}

function dashRenderizarGraficoD(registros, filtros, modo) {
  dashDestruirGrafico("d");
  const duracoes = dashCalcularDuracoes(registros);
  const algumaAmostra = duracoes.porTipo.some((t) => t.amostras > 0);

  if (!algumaAmostra) {
    dashMostrarEstadoGrafico(
      "grafico-d-estado",
      "vazio",
      "Sem registros com hora inicial e final válidas no período selecionado para calcular duração."
    );
    return;
  }
  dashMostrarEstadoGrafico("grafico-d-estado", null, null);

  const ctx = document.getElementById("grafico-d").getContext("2d");

  if (modo === "tempo") {
    if (duracoes.porMes.length === 0) {
      dashMostrarEstadoGrafico("grafico-d-estado", "vazio", "Sem dados suficientes para a evolução ao longo do tempo.");
      return;
    }
    dashGraficos.d = new Chart(ctx, {
      type: "line",
      data: {
        labels: duracoes.porMes.map((p) => dashFormatarMes(p.mes)),
        datasets: [
          {
            label: "Duração média (todos os tipos com hora final)",
            data: duracoes.porMes.map((p) => Math.round(p.mediaMinutos)),
            borderColor: DASH_CORES.primaria,
            backgroundColor: DASH_CORES.primariaClara,
            tension: 0.25,
          },
        ],
      },
      options: {
        ...dashOpcoesBase(),
        plugins: {
          ...dashOpcoesBase().plugins,
          tooltip: { callbacks: { label: (c) => dashFormatarMinutos(c.parsed.y) } },
        },
      },
    });
  } else {
    const comDados = duracoes.porTipo.filter((t) => t.temCampoHoraFinal);
    dashGraficos.d = new Chart(ctx, {
      type: "bar",
      data: {
        labels: comDados.map((t) => t.label + (t.amostras === 0 ? " (sem dados)" : "")),
        datasets: [
          {
            label: "Duração média",
            data: comDados.map((t) => (t.mediaMinutos != null ? Math.round(t.mediaMinutos) : 0)),
            backgroundColor: DASH_CORES_TIPO,
            borderRadius: 3,
          },
        ],
      },
      options: {
        ...dashOpcoesBase(),
        plugins: {
          ...dashOpcoesBase().plugins,
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => (comDados[c.dataIndex].amostras ? dashFormatarMinutos(c.parsed.y) + ` (${comDados[c.dataIndex].amostras} registro(s))` : "Sem dados") } },
        },
      },
    });
  }

  const nota = document.getElementById("grafico-d-nota");
  const tiposSemCampo = Object.keys(TIPO_CIP_LABELS).filter((t) => !(FORM_CONFIG[t] && FORM_CONFIG[t].temHoraFinal));
  nota.textContent =
    tiposSemCampo.length > 0
      ? `${tiposSemCampo.map((t) => TIPO_CIP_LABELS[t]).join(", ")} não tem campo de hora final no formulário original, por isso não entra neste cálculo.`
      : "";
}

async function dashCarregar() {
  dashFiltrosAtuais = dashLerFiltros();
  dashMostrarMensagem(null, "");
  ["a", "b", "c", "d"].forEach((c) => dashMostrarEstadoGrafico(`grafico-${c}-estado`, "carregando", "Carregando..."));

  try {
    dashRegistrosAtuais = await dashBuscarRegistros(dashFiltrosAtuais);
  } catch (error) {
    const classificado = typeof classificarErroSupabase === "function" ? classificarErroSupabase(error) : null;
    dashMostrarMensagem("erro", classificado ? classificado.mensagem : "Não foi possível carregar os dados do painel: " + error.message);
    ["a", "b", "c", "d"].forEach((c) => dashMostrarEstadoGrafico(`grafico-${c}-estado`, "erro", "Não foi possível carregar."));
    document.getElementById("kpi-total").textContent = "—";
    document.getElementById("kpi-mes-atual").textContent = "—";
    document.getElementById("kpi-equipamentos").textContent = "—";
    document.getElementById("kpi-por-tipo-badges").innerHTML = "";
    return;
  }

  dashRenderizarOperadores(dashRegistrosAtuais, dashFiltrosAtuais);
  dashAtualizarAvaliacao(dashRegistrosAtuais);

  const kpis = dashCalcularKPIs(dashRegistrosAtuais);
  dashRenderizarKPIs(kpis, dashFiltrosAtuais);

  const comparar = document.getElementById("grafico-a-comparar").checked;
  dashRenderizarGraficoA(dashRegistrosAtuais, dashFiltrosAtuais, comparar);
  dashRenderizarGraficoB(dashRegistrosAtuais, dashFiltrosAtuais);
  dashRenderizarGraficoC(dashRegistrosAtuais, dashFiltrosAtuais);
  dashRenderizarGraficoD(dashRegistrosAtuais, dashFiltrosAtuais, document.getElementById("grafico-d-modo").value);
}

function iniciarDashboard() {
  const selectTipo = document.getElementById("dash-filtro-tipo");
  Object.entries(TIPO_CIP_LABELS).forEach(([tipo, label]) => {
    const opt = document.createElement("option");
    opt.value = tipo;
    opt.textContent = label;
    selectTipo.appendChild(opt);
  });

  // Filtros vindos da URL (ex.: "Voltar ao gráfico" na tela de um operador).
  const paramsUrl = new URLSearchParams(window.location.search);
  [["tipo", "dash-filtro-tipo"], ["equipamento", "dash-filtro-equipamento"], ["dataInicio", "dash-filtro-data-inicio"], ["dataFim", "dash-filtro-data-fim"]].forEach(([p, id]) => {
    if (paramsUrl.get(p)) document.getElementById(id).value = paramsUrl.get(p);
  });

  document.getElementById("card-aguardando").addEventListener("click", () => dashAbrirHistoricoAvaliacao({ avaliacao: "aguardando" }));
  document.getElementById("card-conforme").addEventListener("click", () => dashAbrirHistoricoAvaliacao({ avaliacao: "conforme" }));
  document.getElementById("card-revisao").addEventListener("click", () => dashAbrirHistoricoAvaliacao({ revisao: "pendente" }));
  document.getElementById("card-contaminado").addEventListener("click", () => {
    window.location.href = "contaminados.html?" + dashParamsFiltros(dashFiltrosAtuais, { filtrado: "1" }).toString();
  });

  document.getElementById("dash-btn-filtrar").addEventListener("click", dashCarregar);
  document.getElementById("dash-btn-limpar").addEventListener("click", () => {
    document.getElementById("dash-filtro-tipo").value = "";
    document.getElementById("dash-filtro-equipamento").value = "";
    document.getElementById("dash-filtro-data-inicio").value = "";
    document.getElementById("dash-filtro-data-fim").value = "";
    document.getElementById("grafico-a-comparar").checked = false;
    dashCarregar();
  });
  document.getElementById("grafico-a-comparar").addEventListener("change", dashCarregar);
  document.getElementById("grafico-d-modo").addEventListener("change", () => {
    dashRenderizarGraficoD(dashRegistrosAtuais, dashFiltrosAtuais, document.getElementById("grafico-d-modo").value);
  });

  const atualizarEstadoComparar = () => {
    const temPeriodo = document.getElementById("dash-filtro-data-inicio").value && document.getElementById("dash-filtro-data-fim").value;
    const checkbox = document.getElementById("grafico-a-comparar");
    checkbox.disabled = !temPeriodo;
    checkbox.closest("label").title = temPeriodo ? "" : "Selecione um período (de/até) para comparar com o intervalo equivalente anterior.";
  };
  document.getElementById("dash-filtro-data-inicio").addEventListener("change", atualizarEstadoComparar);
  document.getElementById("dash-filtro-data-fim").addEventListener("change", atualizarEstadoComparar);
  atualizarEstadoComparar();

  dashCarregar().then(() => {
    if (window.location.hash === "#secao-operadores") {
      const alvo = document.getElementById("secao-operadores");
      if (alvo) alvo.scrollIntoView({ block: "start" });
    }
  });
}

// =======================================================================
// v8 — CIPs realizados por operador, avaliação dos CIPs e resumo da Adega
// =======================================================================
function dashParamsFiltros(filtros, extra) {
  const params = new URLSearchParams();
  if (filtros.tipo) params.set("tipo", filtros.tipo);
  if (filtros.equipamento) params.set("equipamento", filtros.equipamento);
  if (filtros.dataInicio) params.set("dataInicio", filtros.dataInicio);
  if (filtros.dataFim) params.set("dataFim", filtros.dataFim);
  Object.entries(extra || {}).forEach(([k, v]) => params.set(k, v));
  return params;
}
function dashAbrirHistoricoAvaliacao(extra) {
  window.location.href = "historico.html?" + dashParamsFiltros(dashFiltrosAtuais, extra).toString();
}

function dashContagemPorOperador(registros) {
  const contagem = {};
  registros.forEach((r) => { contagem[r.nome_operador] = (contagem[r.nome_operador] || 0) + 1; });
  return Object.entries(contagem).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
}
function dashQuebrarNome(nome, max) {
  if (nome.length <= max) return nome;
  const partes = nome.split(" "); const linhas = []; let atual = "";
  partes.forEach((p) => { if ((atual + " " + p).trim().length > max && atual) { linhas.push(atual); atual = p; } else { atual = (atual + " " + p).trim(); } });
  if (atual) linhas.push(atual);
  return linhas;
}
// Escreve a quantidade na ponta de cada barra (dentro quando cabe).
const dashPluginRotulosBarras = {
  id: "rotulosBarras",
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx; const meta = chart.getDatasetMeta(0); if (!meta || !meta.data) return;
    ctx.save(); ctx.font = "600 12px 'IBM Plex Mono', Consolas, monospace"; ctx.textBaseline = "middle";
    meta.data.forEach((barra, i) => {
      const texto = String(chart.data.datasets[0].data[i]);
      const largura = ctx.measureText(texto).width; const larguraBarra = barra.x - barra.base;
      if (larguraBarra > largura + 14) { ctx.fillStyle = "#ffffff"; ctx.textAlign = "right"; ctx.fillText(texto, barra.x - 7, barra.y); }
      else { ctx.fillStyle = "#1c2621"; ctx.textAlign = "left"; ctx.fillText(texto, barra.x + 6, barra.y); }
    });
    ctx.restore();
  },
};
let dashGraficoOperadores = null;
function dashAbrirOperador(nome) {
  window.location.href = "operador.html?" + dashParamsFiltros(dashFiltrosAtuais, { nome }).toString();
}
function dashRenderizarOperadores(registros) {
  if (dashGraficoOperadores) { dashGraficoOperadores.destroy(); dashGraficoOperadores = null; }
  const dados = dashContagemPorOperador(registros);
  const caixa = document.getElementById("caixa-operadores");
  const lista = document.getElementById("lista-operadores");
  caixa.style.height = Math.max(220, dados.length * 34 + 44) + "px";
  lista.innerHTML = dados.length
    ? `<span class="rotulo-lista">Abrir registros de um operador:</span>` + dados.map(([nome, qtd]) => `<button type="button" class="chip-operador" data-operador="${dashEscaparHtml(nome)}">${dashEscaparHtml(nome)}<strong>${qtd}</strong></button>`).join("")
    : "";
  lista.querySelectorAll(".chip-operador").forEach((b) => b.addEventListener("click", () => dashAbrirOperador(b.dataset.operador)));
  caixa.innerHTML = '<canvas id="grafico-operadores"></canvas>';
  if (!dados.length) {
    caixa.style.height = "auto";
    caixa.innerHTML = '<div class="estado-vazio">Sem dados disponíveis para o período/filtro selecionado.</div>';
    return;
  }
  if (typeof Chart === "undefined") {
    caixa.innerHTML = '<div class="estado-erro">Biblioteca de gráficos indisponível (verifique a conexão).</div>';
    return;
  }
  dashGraficoOperadores = new Chart(document.getElementById("grafico-operadores"), {
    type: "bar",
    data: { labels: dados.map(([nome]) => dashQuebrarNome(nome, 22)), datasets: [{ label: "CIPs registrados", data: dados.map(([, q]) => q), backgroundColor: "#1f4d3a", hoverBackgroundColor: "#3c7a5c", borderRadius: 4, barThickness: 20 }] },
    options: {
      indexAxis: "y", maintainAspectRatio: false,
      layout: { padding: { right: 28 } },
      onHover: (evt, els) => { evt.native.target.style.cursor = els.length ? "pointer" : "default"; },
      onClick: (evt, els) => { if (els.length) dashAbrirOperador(dados[els[0].index][0]); },
      plugins: { legend: { display: false },
        tooltip: { callbacks: { title: (items) => dados[items[0].dataIndex][0], label: (ctx) => `${ctx.parsed.x} registro(s) de CIP` } } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: "Quantidade de registros de CIP" } }, y: { ticks: { font: { size: 12 }, color: "#1c2621", autoSkip: false } } },
    },
    plugins: [dashPluginRotulosBarras],
  });
}

function dashItemFila(r) {
  return `
    <div class="item-fila">
      <div class="info">
        <div class="t1">${dashEscaparHtml(cipRotuloTipo(r.tipo_cip))}</div>
        <div class="t2">${cipFmtData(r.data_cip)} ${cipHora(r.hora_inicial)}${r.hora_final ? "–" + cipHora(r.hora_final) : ""} · ${cipRotuloEquipHtml(r)} · Operador: ${dashEscaparHtml(r.nome_operador)}</div>
        <div style="margin-top:6px;">${cipSelos(r)}</div>
      </div>
      <a class="botao-link primario" href="historico.html?registroId=${encodeURIComponent(r.id)}&foco=avaliacao">${cipTemRevisao(r) ? "Reavaliar CIP" : "Avaliar CIP"}</a>
    </div>`;
}
function dashRenderizarFila(containerId, contadorId, registros, vazio) {
  const LIMITE = 5;
  document.getElementById(contadorId).textContent = registros.length;
  const el = document.getElementById(containerId);
  if (!registros.length) { el.innerHTML = `<p class="sem-dado">${vazio}</p>`; return; }
  el.innerHTML = registros.map((r, i) => dashItemFila(r).replace('class="item-fila"', `class="item-fila${i >= LIMITE ? " oculto" : ""}"`)).join("")
    + (registros.length > LIMITE ? `<button type="button" class="botao-ver-mais" data-ver-mais="1">Ver mais ${registros.length - LIMITE}</button>` : "");
  const btn = el.querySelector("[data-ver-mais]");
  if (btn) btn.addEventListener("click", () => { el.querySelectorAll(".item-fila.oculto").forEach((x) => x.classList.remove("oculto")); btn.remove(); });
}
function dashAtualizarAvaliacao(registros) {
  const ag = registros.filter((r) => cipSituacao(r) === "aguardando");
  const co = registros.filter((r) => cipSituacao(r) === "conforme");
  const ct = registros.filter((r) => cipSituacao(r) === "contaminado");
  const rev = registros.filter((r) => cipTemRevisao(r));
  const revCo = rev.filter((r) => cipSituacao(r) === "conforme").length;
  const revCt = rev.filter((r) => cipSituacao(r) === "contaminado").length;
  document.getElementById("akpi-aguardando").textContent = ag.length;
  document.getElementById("akpi-conforme").textContent = co.length;
  document.getElementById("akpi-contaminado").textContent = ct.length;
  document.getElementById("akpi-revisao").textContent = rev.length;
  document.getElementById("akpi-conforme-rev").innerHTML = revCo ? `dos quais <strong>${revCo}</strong> com revisão pendente` : "nenhum com revisão pendente";
  document.getElementById("akpi-contaminado-rev").innerHTML = revCt ? `dos quais <strong>${revCt}</strong> com revisão pendente` : "nenhum com revisão pendente";
  document.getElementById("akpi-revisao-detalhe").innerHTML = `Conforme: <strong id="akpi-revisao-conforme">${revCo}</strong> · Contaminado: <strong id="akpi-revisao-contaminado">${revCt}</strong>`;
  const porData = (a, b) => (a.data_cip + a.hora_inicial).localeCompare(b.data_cip + b.hora_inicial);
  dashRenderizarFila("fila-aguardando", "contador-fila-aguardando", [...ag].sort(porData), "Nenhum CIP aguardando avaliação nos filtros atuais.");
  dashRenderizarFila("fila-revisao", "contador-fila-revisao", [...rev].sort((a, b) => String(a.revisao_desde).localeCompare(String(b.revisao_desde))), "Nenhum CIP com revisão necessária nos filtros atuais.");
}

// Resumo da Adega no painel do administrador.
function montarResumoAdegaAdmin(situacoes) {
  const el = document.getElementById("secao-adega-admin");
  if (!el) return;
  const ordem = { vencido: 0, hoje: 1, proximo: 2, semhistorico: 3, realizado: 4, emdia: 5 };
  const sit = [...situacoes].sort((a, b) => ordem[a.status] - ordem[b.status]);
  el.innerHTML = `
    <div class="painel-grafico">
      <div class="cabecalho-grafico">
        <div><h3>Adega — vencimentos dos procedimentos periódicos</h3><p>Situação atual de cada procedimento por adega, calculada a partir dos registros.</p></div>
        <a class="botao-link secundario" href="adega.html">Abrir aba Adega</a>
      </div>
      <div class="lista-equip">
        ${sit.map((s) => `
          <div class="item-equip">
            <span class="marca-tipo" style="background:${CIP_CORES_TIPO[s.tipo]}"></span>
            <div class="info"><div class="nome">${dashEscaparHtml(cipRotuloTipo(s.tipo))} — ${dashEscaparHtml(s.adega)}</div><div class="tipo">Próxima data prevista: ${s.proxima ? cipFmtData(s.proxima) : "—"} · ${cipTextoPrazo(s)}</div></div>
            <div class="quando">${cipSeloStatus(s)}</div>
          </div>`).join("")}
      </div>
    </div>`;
}
