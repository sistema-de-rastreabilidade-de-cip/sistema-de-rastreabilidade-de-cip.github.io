// =====================================================================
// Rastreabilidade de Contaminação (v10, supervisor/administrador)
// Fonte única: vw_cip_registros com situação atual = "contaminado".
//   * cada CIP aparece uma única vez (cip_avaliacoes guarda só a situação
//     atual; reavaliações ficam no histórico e não duplicam a contagem);
//   * "Revisão necessária" sozinha não conta — só a classificação atual;
//   * a data da ocorrência é a data do CIP (data_cip).
// Cores do mapa: limites definidos pelo supervisor (cip_configuracao) ou,
// sem limites, escala relativa ao maior valor mostrado (nada inventado).
// =====================================================================

let RT_PERFIL = null;
let RT_TODOS = [];          // ocorrências carregadas (já sem duplicidade)
let RT_EQUIP_SELECIONADO = "";
const RT_MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function rtMensagem(tipo, texto) {
  const classe = tipo === "erro" ? "mensagem-erro" : "mensagem-sucesso";
  document.getElementById("mensagem").innerHTML = texto ? `<div class="${classe}">${cipEsc(texto)}</div>` : "";
}

function rtPeriodo() {
  const v = document.getElementById("rt-periodo").value;
  const hoje = cipHoje();
  if (v === "todos") return { inicio: "", fim: hoje };
  if (v === "personalizado") return { inicio: document.getElementById("rt-inicio").value, fim: document.getElementById("rt-fim").value || hoje };
  if (v === "ano") return { inicio: `${hoje.slice(0, 4)}-01-01`, fim: hoje };
  const d = cipDataDeChave(hoje);
  const ini = cipSomarMeses(new Date(d.getFullYear(), d.getMonth(), 1), -(Number(v) - 1));
  return { inicio: cipChaveData(ini), fim: hoje };
}

// Ocorrências que passam pelos filtros (período, tipo, equipamento digitado).
function rtFiltradas() {
  const { inicio, fim } = rtPeriodo();
  const tipo = document.getElementById("rt-tipo").value;
  const busca = cipChaveNome(document.getElementById("rt-equip").value);
  return RT_TODOS.filter((r) =>
    (!inicio || r.data_cip >= inicio) && (!fim || r.data_cip <= fim) &&
    (!tipo || r.tipo_cip === tipo) &&
    (!busca || cipChaveNome(r.equipamento).includes(busca)));
}

// Colunas do mapa: meses do período (trimestres quando passar de 24 meses).
function rtColunas(ocorrencias) {
  const { inicio, fim } = rtPeriodo();
  let ini = inicio || (ocorrencias.length ? ocorrencias.reduce((m, r) => (r.data_cip < m ? r.data_cip : m), fim) : fim);
  const a = cipDataDeChave(ini.slice(0, 7) + "-01");
  const b = cipDataDeChave(fim.slice(0, 7) + "-01");
  const meses = [];
  for (let d = new Date(a.getTime()); d <= b; d = cipSomarMeses(d, 1)) meses.push(cipChaveData(d).slice(0, 7));
  if (meses.length <= 24) return meses.map((m) => ({ chave: m, rotulo: `${RT_MESES[Number(m.slice(5)) - 1]}/${m.slice(2, 4)}`, contem: (dc) => dc.slice(0, 7) === m }));
  const tri = [...new Set(meses.map((m) => `${m.slice(0, 4)}-T${Math.floor((Number(m.slice(5)) - 1) / 3) + 1}`))];
  return tri.map((t) => ({ chave: t, rotulo: `${t.slice(5)}/${t.slice(2, 4)}`, contem: (dc) => `${dc.slice(0, 4)}-T${Math.floor((Number(dc.slice(5, 7)) - 1) / 3) + 1}` === t }));
}

// Nível de cor: 0 = sem ocorrência; "verde" | "amarelo" | "vermelho".
function rtNivel(n, maximo) {
  if (!n) return "zero";
  const am = CIP_CONFIG.mapa_limite_amarelo, ve = CIP_CONFIG.mapa_limite_vermelho;
  if (am && ve) return n >= ve ? "vermelho" : n >= am ? "amarelo" : "verde";
  if (!maximo) return "verde";
  return n >= (2 * maximo) / 3 ? "vermelho" : n >= maximo / 3 ? "amarelo" : "verde";
}

function rtAgrupar(ocorrencias) {
  const mapa = new Map();
  ocorrencias.forEach((r) => {
    const e = mapa.get(r.equipamento) || { equipamento: r.equipamento, tipos: new Set(), lista: [] };
    e.tipos.add(r.tipo_cip);
    e.lista.push(r);
    mapa.set(r.equipamento, e);
  });
  return [...mapa.values()]
    .map((e) => ({ ...e, total: e.lista.length, ultima: e.lista.reduce((m, r) => (r.data_cip > m ? r.data_cip : m), "") }))
    .sort((a, b) => b.total - a.total || b.ultima.localeCompare(a.ultima) || a.equipamento.localeCompare(b.equipamento));
}

function rtRenderIndicadores(oc, grupos) {
  const topo = grupos[0];
  const ultima = oc.reduce((m, r) => (!m || r.data_cip > m.data_cip ? r : m), null);
  const emRevisao = oc.filter((r) => r.revisao_pendente).length;
  document.getElementById("rt-indicadores").innerHTML = `
    <div class="indicador"><span class="ind-valor">${oc.length}</span><span class="ind-rotulo">contaminações no período</span></div>
    <div class="indicador"><span class="ind-valor">${grupos.length}</span><span class="ind-rotulo">equipamentos com ocorrência</span></div>
    <div class="indicador destaque-indicador"><span class="ind-valor ind-texto">${topo ? cipEsc(topo.equipamento) : "—"}</span><span class="ind-rotulo">${topo ? `maior recorrência · ${topo.total} ocorrência(s)` : "maior recorrência"}</span></div>
    <div class="indicador"><span class="ind-valor ind-texto">${ultima ? cipFmtData(ultima.data_cip) : "—"}</span><span class="ind-rotulo">${ultima ? `última ocorrência · ${cipEsc(ultima.equipamento)}` : "última ocorrência"}${emRevisao ? ` · ${emRevisao} em revisão` : ""}</span></div>`;
}

function rtRenderMapa(oc, grupos) {
  const tabela = document.getElementById("rt-mapa");
  if (!grupos.length) {
    tabela.innerHTML = '<tbody><tr><td class="sem-dado mapa-vazio">Nenhuma contaminação no período e filtros escolhidos.</td></tr></tbody>';
    document.getElementById("rt-legenda").innerHTML = "";
    document.getElementById("rt-criterio").textContent = "";
    return;
  }
  const cols = rtColunas(oc);
  const celulas = grupos.map((g) => cols.map((c) => g.lista.filter((r) => c.contem(r.data_cip)).length));
  const maxTot = Math.max(0, ...grupos.map((g) => g.total));
  const totCol = cols.map((c, i) => celulas.reduce((s, linha) => s + linha[i], 0));
  tabela.innerHTML = `
    <thead><tr><th class="col-equip" scope="col">Equipamento</th>${cols.map((c) => `<th scope="col">${c.rotulo}</th>`).join("")}<th scope="col" class="col-total">Total</th></tr></thead>
    <tbody>${grupos.map((g, gi) => `
      <tr class="${RT_EQUIP_SELECIONADO === g.equipamento ? "linha-selecionada" : ""}">
        <th scope="row" class="col-equip"><button type="button" class="btn-equip" data-equip="${cipEsc(g.equipamento)}" title="Ver as ocorrências deste equipamento">${cipEsc(g.equipamento)}</button></th>
        ${celulas[gi].map((n, ci) => `<td class="cel-calor nivel-${rtNivel(n, maxTot)}" title="${cipEsc(g.equipamento)} — ${cols[ci].rotulo}: ${n} contaminação(ões)">${n || ""}</td>`).join("")}
        <td class="cel-calor col-total nivel-${rtNivel(g.total, maxTot)}"><strong>${g.total}</strong></td>
      </tr>`).join("")}
    </tbody>
    <tfoot><tr><th scope="row" class="col-equip">Total do mês</th>${totCol.map((n) => `<td>${n || ""}</td>`).join("")}<td class="col-total"><strong>${oc.length}</strong></td></tr></tfoot>`;
  const fixos = CIP_CONFIG.mapa_limite_amarelo && CIP_CONFIG.mapa_limite_vermelho;
  document.getElementById("rt-legenda").innerHTML = fixos
    ? `<span class="leg nivel-verde">1 a ${CIP_CONFIG.mapa_limite_amarelo - 1}</span><span class="leg nivel-amarelo">${CIP_CONFIG.mapa_limite_amarelo} a ${CIP_CONFIG.mapa_limite_vermelho - 1}</span><span class="leg nivel-vermelho">${CIP_CONFIG.mapa_limite_vermelho} ou mais</span>`
    : `<span class="leg nivel-verde">baixa</span><span class="leg nivel-amarelo">intermediária</span><span class="leg nivel-vermelho">alta</span>`;
  document.getElementById("rt-criterio").textContent = fixos
    ? `Critério: limites fixos definidos pelo supervisor (amarelo a partir de ${CIP_CONFIG.mapa_limite_amarelo}, vermelho a partir de ${CIP_CONFIG.mapa_limite_vermelho} contaminações), por célula e por total.`
    : `Critério: escala relativa — cada célula é comparada com o maior total do período (${maxTot}, ${cipEsc(grupos[0].equipamento)}). Nenhum limite operacional foi definido ainda.`;
  tabela.querySelectorAll(".btn-equip").forEach((b) => b.addEventListener("click", () => {
    RT_EQUIP_SELECIONADO = RT_EQUIP_SELECIONADO === b.dataset.equip ? "" : b.dataset.equip;
    rtRenderizar();
    if (RT_EQUIP_SELECIONADO) document.getElementById("rt-ocorrencias").scrollIntoView({ block: "nearest" });
  }));
}

function rtRenderRanking(grupos) {
  const max = grupos.length ? grupos[0].total : 0;
  const total = grupos.reduce((s, g) => s + g.total, 0);
  document.getElementById("rt-ranking").innerHTML = grupos.slice(0, 15).map((g) => `
    <li class="${RT_EQUIP_SELECIONADO === g.equipamento ? "selecionado" : ""}">
      <button type="button" class="item-ranking" data-equip="${cipEsc(g.equipamento)}">
        <span class="rk-nome">${cipEsc(g.equipamento)}</span>
        <span class="rk-barra"><span class="rk-preench nivel-${rtNivel(g.total, max)}" style="width:${max ? Math.max(6, (100 * g.total) / max) : 0}%"></span></span>
        <span class="rk-num">${g.total}</span>
        <span class="rk-meta">${Math.round((100 * g.total) / total)}% · última ${cipFmtData(g.ultima)} · ${[...g.tipos].map(cipRotuloTipo).join(", ")}</span>
      </button>
    </li>`).join("") || '<li class="sem-dado">Sem ocorrências.</li>';
  document.querySelectorAll(".item-ranking").forEach((b) => b.addEventListener("click", () => {
    RT_EQUIP_SELECIONADO = RT_EQUIP_SELECIONADO === b.dataset.equip ? "" : b.dataset.equip;
    rtRenderizar();
  }));
}

function rtRenderOcorrencias(oc) {
  const lista = (RT_EQUIP_SELECIONADO ? oc.filter((r) => r.equipamento === RT_EQUIP_SELECIONADO) : oc)
    .sort((a, b) => b.data_cip.localeCompare(a.data_cip) || String(b.avaliado_em).localeCompare(String(a.avaliado_em)));
  document.getElementById("rt-filtro-ativo").innerHTML = RT_EQUIP_SELECIONADO
    ? `<button type="button" class="chip-filtro" id="rt-limpar-equip">${cipEsc(RT_EQUIP_SELECIONADO)} ✕</button>` : `<span class="sem-dado nota-pequena">${lista.length} ocorrência(s)</span>`;
  const limpar = document.getElementById("rt-limpar-equip");
  if (limpar) limpar.addEventListener("click", () => { RT_EQUIP_SELECIONADO = ""; rtRenderizar(); });
  document.getElementById("rt-ocorrencias").innerHTML = lista.slice(0, 300).map((r) => `
    <article class="ocorrencia">
      <div class="oc-data"><span class="oc-dia">${cipFmtData(r.data_cip)}</span><span class="oc-hora">${cipHora(r.hora_inicial)}</span></div>
      <div class="oc-corpo">
        <div class="oc-titulo">${cipRotuloEquipHtml(r)} <span class="oc-tipo">${cipEsc(cipRotuloTipo(r.tipo_cip))}</span>${r.revisao_pendente ? ' <span class="selo-revisao">Revisão necessária</span>' : ""}</div>
        <div class="oc-just">${cipEsc(r.avaliacao_observacao || "—")}</div>
        <div class="oc-meta">Avaliado por ${cipEsc(r.avaliador_nome || "—")} em ${r.avaliado_em ? cipFmtDataHora(r.avaliado_em) : "—"} · Operador: ${cipEsc(r.nome_operador)}</div>
      </div>
      <a class="botao-link secundario oc-ver" href="historico.html?registroId=${encodeURIComponent(r.id)}">Ver registro</a>
    </article>`).join("") || '<p class="sem-dado">Nenhuma ocorrência.</p>';
}

function rtRenderizar() {
  const oc = rtFiltradas();
  const grupos = rtAgrupar(oc);
  if (RT_EQUIP_SELECIONADO && !grupos.some((g) => g.equipamento === RT_EQUIP_SELECIONADO)) RT_EQUIP_SELECIONADO = "";
  rtRenderIndicadores(oc, grupos);
  rtRenderMapa(oc, grupos);
  rtRenderRanking(grupos);
  rtRenderOcorrencias(oc);
}

async function rtCarregar() {
  const { data, error } = await supabaseClient
    .from("vw_cip_registros")
    .select("id, tipo_cip, equipamento, bbt, data_cip, hora_inicial, nome_operador, situacao_avaliacao, revisao_pendente, avaliacao_observacao, avaliador_nome, avaliado_em")
    .eq("situacao_avaliacao", "contaminado")
    .order("data_cip", { ascending: false })
    .limit(5000);
  if (error) { rtMensagem("erro", cipMensagemErro(error, "Não foi possível carregar as contaminações")); return; }
  // Defesa extra contra duplicidade: um CIP = uma ocorrência.
  const vistos = new Set();
  RT_TODOS = (data || []).filter((r) => (vistos.has(r.id) ? false : vistos.add(r.id)));
  rtRenderizar();
}

async function rtSalvarLimites(limpar) {
  const erroEl = document.getElementById("rt-erro-config");
  erroEl.innerHTML = "";
  const am = limpar ? null : Number(document.getElementById("rt-lim-amarelo").value);
  const ve = limpar ? null : Number(document.getElementById("rt-lim-vermelho").value);
  if (!limpar && (!Number.isInteger(am) || !Number.isInteger(ve) || am < 1 || ve > 1000 || am >= ve)) {
    erroEl.innerHTML = '<div class="mensagem-erro" style="margin-top:8px;">Use números inteiros de 1 a 1000, com o amarelo menor que o vermelho.</div>';
    return;
  }
  const { error } = await supabaseClient.rpc("definir_limites_mapa_calor", { p_amarelo: am, p_vermelho: ve });
  if (error) { erroEl.innerHTML = `<div class="mensagem-erro" style="margin-top:8px;">${cipEsc(cipMensagemErro(error, ""))}</div>`; return; }
  await cipCarregarConfiguracao();
  rtPreencherLimites();
  rtRenderizar();
  rtMensagem("sucesso", limpar ? "O mapa voltou a usar a escala relativa." : "Critério de cores salvo.");
}
function rtPreencherLimites() {
  document.getElementById("rt-lim-amarelo").value = CIP_CONFIG.mapa_limite_amarelo || "";
  document.getElementById("rt-lim-vermelho").value = CIP_CONFIG.mapa_limite_vermelho || "";
}

async function iniciarRastreabilidade() {
  const resultado = await exigirSessao();
  if (!resultado) return;
  RT_PERFIL = resultado.perfil;
  document.getElementById("info-usuario").textContent =
    `${RT_PERFIL.nome} (${RT_PERFIL.role === "administrador" ? "Administrador" : "Operador"})`;
  cipInicializarPagina(RT_PERFIL);
  if (RT_PERFIL.role !== "administrador") {
    document.querySelector("main.conteudo").innerHTML = '<div class="tela-erro"><h1>Acesso restrito</h1><p>Visualização disponível apenas para o supervisor/administrador.</p><a href="painel.html">Voltar ao painel</a></div>';
    return;
  }
  document.getElementById("rt-tipo").innerHTML += Object.keys(TIPO_CIP_LABELS).map((t) => `<option value="${t}">${cipEsc(TIPO_CIP_LABELS[t])}</option>`).join("");
  const periodo = document.getElementById("rt-periodo");
  periodo.addEventListener("change", () => {
    document.querySelectorAll(".rt-datas").forEach((el) => el.classList.toggle("oculto", periodo.value !== "personalizado"));
    rtRenderizar();
  });
  ["rt-inicio", "rt-fim", "rt-tipo"].forEach((id) => document.getElementById(id).addEventListener("change", rtRenderizar));
  document.getElementById("rt-equip").addEventListener("input", rtRenderizar);
  document.getElementById("rt-salvar-limites").addEventListener("click", () => rtSalvarLimites(false));
  document.getElementById("rt-limpar-limites").addEventListener("click", () => rtSalvarLimites(true));
  await cipCarregarConfiguracao();
  rtPreencherLimites();
  rtCarregar();
}

iniciarRastreabilidade();
