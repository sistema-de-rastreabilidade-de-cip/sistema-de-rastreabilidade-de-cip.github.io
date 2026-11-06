// =====================================================================
// Relatórios de rastreabilidade (v8.1, supervisor).
// Lê os mesmos dados que o histórico (respeitando a RLS do banco) e gera:
//   * relatório na tela, pronto para imprimir ou salvar em PDF;
//   * CSV de registros e CSV de histórico (padrão do Excel em português);
//   * cópia da tabela para colar no Excel (quando não é possível baixar).
// Cada exportação mostra um código SHA-256 do conteúdo, para conferência.
// =====================================================================

let REL_DADOS = null;

function relMensagem(tipo, texto) {
  const classe = tipo === "erro" ? "mensagem-erro" : tipo === "aviso" ? "mensagem-aviso" : "mensagem-sucesso";
  document.getElementById("mensagem").innerHTML = texto ? `<div class="${classe}">${texto}</div>` : "";
}
function relFiltros() {
  const v = (id) => document.getElementById(id).value.trim();
  return { dataInicio: v("r-data-inicio"), dataFim: v("r-data-fim"), operador: v("r-operador"), equipamento: v("r-equipamento"), tipo: v("r-tipo"), status: v("r-status") };
}
function relDescricaoFiltros(f) {
  const st = { aguardando: "Aguardando avaliação", conforme: "Conforme", contaminado: "Contaminado", revisao: "Revisão necessária" };
  return [
    `Período (data do CIP): ${f.dataInicio ? cipFmtData(f.dataInicio) : "início"} a ${f.dataFim ? cipFmtData(f.dataFim) : "hoje"}`,
    `Operador: ${f.operador || "todos"}`,
    `Equipamento: ${f.equipamento || "todos"}`,
    `Tipo: ${f.tipo ? cipRotuloTipo(f.tipo) : "todos"}`,
    `Status: ${f.status ? st[f.status] : "todos"}`,
  ].join(" · ");
}

async function relGerar() {
  const f = relFiltros();
  if (f.dataInicio && f.dataFim && f.dataInicio > f.dataFim) { relMensagem("erro", "A data inicial é posterior à data final."); return; }
  const btn = document.getElementById("btn-gerar-relatorio");
  btn.disabled = true; btn.textContent = "Gerando...";
  relMensagem(null, "");
  try {
    let q = supabaseClient.from("vw_cip_registros").select("*")
      .order("data_cip", { ascending: true }).order("hora_inicial", { ascending: true }).order("id", { ascending: true }).limit(5001);
    if (f.dataInicio) q = q.gte("data_cip", f.dataInicio);
    if (f.dataFim) q = q.lte("data_cip", f.dataFim);
    if (f.operador) q = q.eq("nome_operador", f.operador);
    if (f.equipamento) q = q.ilike("equipamento", `%${f.equipamento.replace(/[%,()]/g, "")}%`);
    if (f.tipo) q = q.eq("tipo_cip", f.tipo);
    if (f.status === "revisao") q = q.eq("revisao_pendente", true);
    else if (f.status) q = q.eq("situacao_avaliacao", f.status);
    const { data, error } = await q;
    if (error) throw error;
    let registros = data || [];
    let truncado = false;
    if (registros.length > 5000) { registros = registros.slice(0, 5000); truncado = true; }
    const ids = registros.map((r) => r.id);
    const [observacoes, edicoes, avaliacoes] = ids.length ? await Promise.all([
      cipBuscarPorIds("cip_observacoes", "registro_id, texto, administrador_nome, criado_em", "registro_id", ids, "criado_em"),
      cipBuscarPorIds("cip_edicoes", "registro_id, valores_anteriores, valores_novos, justificativa, alterado_por_nome, criado_em", "registro_id", ids, "criado_em"),
      cipBuscarPorIds("cip_avaliacoes_historico", "registro_id, situacao_anterior, situacao_nova, tipo_evento, observacao, avaliador_nome, criado_em", "registro_id", ids, "criado_em"),
    ]) : [[], [], []];
    const agrupar = (lista) => lista.reduce((m, x) => { (m[x.registro_id] = m[x.registro_id] || []).push(x); return m; }, {});
    REL_DADOS = { filtros: f, registros, obs: agrupar(observacoes), edicoes: agrupar(edicoes), avaliacoes: agrupar(avaliacoes), geradoEm: new Date().toISOString(), truncado };
    REL_DADOS.csvRegistros = relCsvRegistros();
    REL_DADOS.csvHistorico = relCsvHistorico();
    REL_DADOS.shaRegistros = await cipSha256(REL_DADOS.csvRegistros.texto);
    REL_DADOS.shaHistorico = await cipSha256(REL_DADOS.csvHistorico.texto);
    relRenderizar();
    ["btn-csv-registros", "btn-csv-historico", "btn-copiar-tabela", "btn-imprimir"].forEach((id) => (document.getElementById(id).disabled = registros.length === 0));
    if (truncado) relMensagem("aviso", "O filtro trouxe mais de 5.000 registros; o relatório mostra os 5.000 primeiros. Refine o período.");
  } catch (e) {
    relMensagem("erro", cipEsc(cipMensagemErro(e, "Não foi possível gerar o relatório: ")));
  } finally {
    btn.disabled = false; btn.textContent = "Gerar relatório";
  }
}

// ---- Montagem do CSV ----
function relCamposProcedimento(registros) {
  // União dos campos oficiais dos tipos presentes, na ordem do formulário.
  const vistos = new Map();
  Object.keys(FORM_CONFIG).forEach((tipo) => {
    if (!registros.some((r) => r.tipo_cip === tipo)) return;
    FORM_CONFIG[tipo].campos.forEach((c) => { if (!vistos.has(c.key)) vistos.set(c.key, c.label); });
  });
  return [...vistos.entries()];
}
function relTextoObs(lista) {
  return (lista || []).map((o) => `${cipFmtDataHora(o.criado_em)} — ${o.administrador_nome}: ${o.texto}`).join(" | ");
}
function relCsvRegistros() {
  const d = REL_DADOS;
  const campos = relCamposProcedimento(d.registros);
  const cab = ["ID do registro", "Data do CIP", "Hora inicial", "Hora final", "Tipo de CIP", "Equipamento", "BBT", "Operador",
    "Situação da avaliação", "Revisão necessária", "Avaliado por", "Avaliado em", "Descrição/justificativa da avaliação",
    "Observações do operador", "Observações administrativas", "Nº de alterações", "Nº de eventos de avaliação", "Criado em", "Última atualização",
    ...campos.map(([, label]) => label)];
  const linhas = d.registros.map((r) => [
    r.id, cipFmtData(r.data_cip), cipHora(r.hora_inicial), r.hora_final ? cipHora(r.hora_final) : "", cipRotuloTipo(r.tipo_cip),
    r.equipamento, r.bbt || "", r.nome_operador, CIP_ROTULO_AVALIACAO[cipSituacao(r)], cipTemRevisao(r) ? "Sim" : "Não",
    r.avaliador_nome || "", r.avaliado_em ? cipFmtDataHora(r.avaliado_em) : "", r.avaliacao_observacao || "",
    r.observacoes_operador || "", relTextoObs(d.obs[r.id]), (d.edicoes[r.id] || []).length, (d.avaliacoes[r.id] || []).length,
    cipFmtDataHora(r.criado_em), r.atualizado_em ? cipFmtDataHora(r.atualizado_em) : "",
    ...campos.map(([key]) => (r.dados && r.dados[key]) || ""),
  ]);
  return { cab, linhas, texto: cipMontarCsv(cab, linhas) };
}
function relCsvHistorico() {
  const d = REL_DADOS;
  const cab = ["ID do registro", "Data do CIP", "Tipo de CIP", "Equipamento", "Evento", "Data/hora do evento", "Autor", "Detalhe", "Justificativa/texto"];
  const linhas = [];
  d.registros.forEach((r) => {
    const base = [r.id, cipFmtData(r.data_cip), cipRotuloTipo(r.tipo_cip), r.equipamento];
    const eventos = [];
    (d.edicoes[r.id] || []).forEach((e) => eventos.push({ em: e.criado_em, linha: [...base, "Alteração do registro", cipFmtDataHora(e.criado_em), e.alterado_por_nome,
      cipDiferencasEdicao(e, r.tipo_cip).map((x) => `${x.rotulo}: ${x.de} → ${x.para}`).join("; "), e.justificativa] }));
    (d.avaliacoes[r.id] || []).forEach((a) => eventos.push({ em: a.criado_em, linha: [...base, CIP_ROTULO_EVENTO_AV[a.tipo_evento] || a.tipo_evento, cipFmtDataHora(a.criado_em), a.avaliador_nome,
      `${CIP_ROTULO_AVALIACAO[a.situacao_anterior]} → ${CIP_ROTULO_AVALIACAO[a.situacao_nova]}`, a.observacao || ""] }));
    (d.obs[r.id] || []).forEach((o) => eventos.push({ em: o.criado_em, linha: [...base, "Observação administrativa", cipFmtDataHora(o.criado_em), o.administrador_nome, "", o.texto] }));
    eventos.sort((a, b) => String(a.em).localeCompare(String(b.em))).forEach((x) => linhas.push(x.linha));
  });
  return { cab, linhas, texto: cipMontarCsv(cab, linhas) };
}

// ---- Relatório na tela / impressão ----
function relRenderizar() {
  const d = REL_DADOS;
  const cont = { aguardando: 0, conforme: 0, contaminado: 0 };
  let revisoes = 0;
  d.registros.forEach((r) => { cont[cipSituacao(r)]++; if (cipTemRevisao(r)) revisoes++; });
  const blocos = d.registros.map((r) => {
    const cfg = FORM_CONFIG[r.tipo_cip] || { campos: [] };
    const dados = cfg.campos.map((c) => `<div><span>${cipEsc(c.label)}:</span> ${cipEsc((r.dados && r.dados[c.key]) || "—")}</div>`).join("");
    const eds = (d.edicoes[r.id] || []).map((e) => `<li>${cipFmtDataHora(e.criado_em)} — ${cipEsc(e.alterado_por_nome)}: ${cipDiferencasEdicao(e, r.tipo_cip).map((x) => `${cipEsc(x.rotulo)}: <em>${cipEsc(x.de)}</em> → <strong>${cipEsc(x.para)}</strong>`).join("; ") || "—"} · Justificativa: ${cipEsc(e.justificativa)}</li>`).join("");
    const avs = (d.avaliacoes[r.id] || []).map((a) => `<li>${cipFmtDataHora(a.criado_em)} — ${cipEsc(a.avaliador_nome)} · ${cipEsc(CIP_ROTULO_EVENTO_AV[a.tipo_evento] || a.tipo_evento)}: ${CIP_ROTULO_AVALIACAO[a.situacao_anterior]} → <strong>${CIP_ROTULO_AVALIACAO[a.situacao_nova]}</strong>${a.observacao ? ` · ${cipEsc(a.observacao)}` : ""}</li>`).join("");
    const obs = (d.obs[r.id] || []).map((o) => `<li>${cipFmtDataHora(o.criado_em)} — ${cipEsc(o.administrador_nome)}: ${cipEsc(o.texto)}</li>`).join("");
    return `
      <article class="relatorio-registro" data-registro="${cipEsc(r.id)}">
        <h3>${cipEsc(cipRotuloTipo(r.tipo_cip))} — ${cipRotuloEquipHtml(r)} · ${cipFmtData(r.data_cip)} ${cipHora(r.hora_inicial)}${r.hora_final ? "–" + cipHora(r.hora_final) : ""}</h3>
        <div style="margin-bottom:6px;">${cipSelos(r)} <span class="sem-dado">Operador: ${cipEsc(r.nome_operador)} · Registrado em ${cipFmtDataHora(r.criado_em)}</span></div>
        <h4>Informações do procedimento</h4>
        <div class="grade-dados">${dados}<div><span>Observações do operador:</span> ${cipEsc(r.observacoes_operador || "—")}</div></div>
        <h4>Avaliação do supervisor</h4>
        <div class="grade-dados"><div><span>Situação:</span> ${CIP_ROTULO_AVALIACAO[cipSituacao(r)]}${cipTemRevisao(r) ? " (revisão necessária)" : ""}</div>
          <div><span>Avaliado por:</span> ${cipEsc(r.avaliador_nome || "—")}</div><div><span>Avaliado em:</span> ${r.avaliado_em ? cipFmtDataHora(r.avaliado_em) : "—"}</div>
          <div><span>${cipSituacao(r) === "contaminado" ? "Justificativa de contaminação" : "Observação da avaliação"}:</span> ${cipEsc(r.avaliacao_observacao || "—")}</div></div>
        ${avs ? `<h4>Histórico de avaliações</h4><ul>${avs}</ul>` : ""}
        ${obs ? `<h4>Observações administrativas</h4><ul>${obs}</ul>` : ""}
        ${eds ? `<h4>Histórico de alterações</h4><ul>${eds}</ul>` : ""}
      </article>`;
  }).join("");
  document.getElementById("area-relatorio").innerHTML = `
    <div class="relatorio-cabecalho">
      <h2>Relatório de rastreabilidade de CIP</h2>
      <div class="texto-suave">${cipEsc(relDescricaoFiltros(d.filtros))}</div>
      <div class="texto-suave">Gerado em ${cipFmtDataHora(d.geradoEm)} · <strong id="rel-total">${d.registros.length}</strong> registro(s) · Aguardando ${cont.aguardando} · Conforme ${cont.conforme} · Contaminado ${cont.contaminado} · Revisão necessária ${revisoes}</div>
      <div class="sem-dado" style="margin-top:4px;">SHA-256 do CSV de registros: <span class="caixa-codigo" id="rel-sha-registros">${cipEsc(d.shaRegistros || "indisponível")}</span></div>
      <div class="sem-dado">SHA-256 do CSV de histórico: <span class="caixa-codigo" id="rel-sha-historico">${cipEsc(d.shaHistorico || "indisponível")}</span></div>
    </div>
    ${blocos || '<p class="sem-dado">Nenhum registro encontrado com os filtros selecionados.</p>'}`;
}

async function iniciarRelatorios() {
  const resultado = await exigirSessao();
  if (!resultado) return;
  const perfil = resultado.perfil;
  document.getElementById("info-usuario").textContent =
    `${perfil.nome} (${perfil.role === "administrador" ? "Administrador" : "Operador"})`;
  cipInicializarPagina(perfil);
  if (perfil.role !== "administrador") {
    document.querySelector("main.conteudo").innerHTML = '<div class="tela-erro"><h1>Acesso restrito</h1><p>Relatórios disponíveis apenas para o supervisor/administrador.</p><a href="painel.html">Voltar ao painel</a></div>';
    return;
  }
  const selTipo = document.getElementById("r-tipo");
  Object.entries(TIPO_CIP_LABELS).forEach(([t, l]) => selTipo.insertAdjacentHTML("beforeend", `<option value="${t}">${cipEsc(l)}</option>`));
  // Operadores: lista cadastrada + nomes já usados nos registros.
  const [ops, regs] = await Promise.all([cipCarregarOperadores(), supabaseClient.from("cip_registros").select("nome_operador").limit(10000)]);
  const nomes = [...new Set([...(ops || []).map((o) => o.nome), ...((regs.data || []).map((r) => r.nome_operador))])].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const selOp = document.getElementById("r-operador");
  nomes.forEach((n) => selOp.insertAdjacentHTML("beforeend", `<option value="${cipEsc(n)}">${cipEsc(n)}</option>`));

  document.getElementById("btn-gerar-relatorio").addEventListener("click", relGerar);
  document.getElementById("btn-csv-registros").addEventListener("click", () => {
    cipBaixarArquivo(`relatorio-cip-registros_${cipCarimboArquivo()}.csv`, REL_DADOS.csvRegistros.texto, "text/csv;charset=utf-8");
    relMensagem("sucesso", `CSV de registros preparado (${REL_DADOS.registros.length} linhas). SHA-256: <span class="caixa-codigo">${cipEsc(REL_DADOS.shaRegistros || "")}</span>`);
  });
  document.getElementById("btn-csv-historico").addEventListener("click", () => {
    cipBaixarArquivo(`relatorio-cip-historico_${cipCarimboArquivo()}.csv`, REL_DADOS.csvHistorico.texto, "text/csv;charset=utf-8");
    relMensagem("sucesso", `CSV de histórico preparado (${REL_DADOS.csvHistorico.linhas.length} eventos). SHA-256: <span class="caixa-codigo">${cipEsc(REL_DADOS.shaHistorico || "")}</span>`);
  });
  document.getElementById("btn-copiar-tabela").addEventListener("click", async () => {
    const ok = await cipCopiarTexto(cipMontarTsv(REL_DADOS.csvRegistros.cab, REL_DADOS.csvRegistros.linhas));
    relMensagem(ok ? "sucesso" : "erro", ok ? "Tabela de registros copiada. Abra o Excel e cole (Ctrl+V)." : "Não foi possível copiar automaticamente neste navegador.");
  });
  document.getElementById("btn-imprimir").addEventListener("click", () => window.print());
}

iniciarRelatorios();
