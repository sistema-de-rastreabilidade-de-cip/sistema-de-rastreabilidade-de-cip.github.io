// =====================================================================
// CIPs contaminados (v8, visão do supervisor/administrador).
// Uma única fonte: vw_cip_registros com última classificação
// "contaminado" (inclui os que estão com revisão pendente). O modo
// filtrado (aberto pelo painel) só aplica, por cima, os mesmos filtros
// do painel; o modo geral mostra todos.
// =====================================================================

function contDescricaoFiltros(f) {
  const partes = [];
  if (f.dataInicio || f.dataFim) partes.push(`Período: ${f.dataInicio ? cipFmtData(f.dataInicio) : "início"} a ${f.dataFim ? cipFmtData(f.dataFim) : "hoje"}`);
  else partes.push("Período: todos os registros");
  partes.push(`Tipo: ${f.tipo ? cipRotuloTipo(f.tipo) : "todos"}`);
  partes.push(`Equipamento: ${f.equipamento || "todos"}`);
  return partes.join(" · ");
}

async function iniciarContaminados() {
  const resultado = await exigirSessao();
  if (!resultado) return;
  const perfil = resultado.perfil;
  document.getElementById("info-usuario").textContent =
    `${perfil.nome} (${perfil.role === "administrador" ? "Administrador" : "Operador"})`;
  cipInicializarPagina(perfil);

  const corpo = document.getElementById("corpo-contaminados");
  if (perfil.role !== "administrador") {
    document.querySelector("main.conteudo").innerHTML = '<div class="tela-erro"><h1>Acesso restrito</h1><p>Visualização disponível apenas para o supervisor/administrador.</p><a href="painel.html">Voltar ao painel</a></div>';
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const filtrado = params.get("filtrado") === "1";
  const f = { tipo: params.get("tipo") || "", equipamento: params.get("equipamento") || "", dataInicio: params.get("dataInicio") || "", dataFim: params.get("dataFim") || "" };

  const voltarPainel = "painel.html?" + new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  document.getElementById("faixa-consulta").innerHTML = filtrado
    ? `<div class="faixa-consulta" data-modo="filtrado">
         <span><strong>Consulta filtrada (originada do painel)</strong> — ${cipEsc(contDescricaoFiltros(f))}</span>
         <span style="display:flex;gap:8px;flex-wrap:wrap;">
           <a class="botao-link secundario" href="${cipEsc(voltarPainel)}">&larr; Voltar ao painel</a>
           <a class="botao-link primario" href="contaminados.html">Ver todos os contaminados</a>
         </span>
       </div>`
    : `<div class="faixa-consulta" data-modo="geral"><span><strong>Consulta geral</strong> — todos os registros classificados como contaminados, sem filtros.</span></div>`;

  let query = supabaseClient
    .from("vw_cip_registros")
    .select("id, tipo_cip, equipamento, bbt, data_cip, hora_inicial, hora_final, nome_operador, situacao_avaliacao, revisao_pendente, avaliacao_observacao, avaliador_nome, avaliado_em")
    .eq("situacao_avaliacao", "contaminado")
    .order("avaliado_em", { ascending: false })
    .limit(2000);
  if (filtrado) {
    if (f.tipo) query = query.eq("tipo_cip", f.tipo);
    if (f.equipamento) query = query.ilike("equipamento", `%${f.equipamento}%`);
    if (f.dataInicio) query = query.gte("data_cip", f.dataInicio);
    if (f.dataFim) query = query.lte("data_cip", f.dataFim);
  }
  const { data, error } = await query;
  if (error) {
    document.getElementById("mensagem").innerHTML = `<div class="mensagem-erro">${cipEsc(cipMensagemErro(error, "Não foi possível carregar os CIPs contaminados: "))}</div>`;
    return;
  }
  const lista = data || [];
  document.getElementById("resumo-contaminados").innerHTML =
    `<strong id="total-contaminados">${lista.length}</strong> registro(s) ${filtrado ? "no filtro" : "no total"} com última classificação Contaminado.`;
  corpo.innerHTML = lista.map((r) => `
    <tr>
      <td data-label="Data e horário do CIP">${cipFmtData(r.data_cip)} ${cipHora(r.hora_inicial)}${r.hora_final ? "–" + cipHora(r.hora_final) : ""}</td>
      <td data-label="Tipo de CIP" class="col-texto">${cipEsc(cipRotuloTipo(r.tipo_cip))}</td>
      <td data-label="Equipamento / BBT" class="col-texto">${cipRotuloEquipHtml(r)}</td>
      <td data-label="Operador" class="col-texto">${cipEsc(r.nome_operador)}</td>
      <td data-label="Data da avaliação">${cipFmtDataHora(r.avaliado_em)}</td>
      <td data-label="Supervisor" class="col-texto">${cipEsc(r.avaliador_nome)}</td>
      <td data-label="Descrição / justificativa" class="col-texto">${cipEsc(r.avaliacao_observacao)}${cipTemRevisao(r) ? `<div style="margin-top:4px;">${cipSeloRevisao(r)}</div>` : ""}</td>
      <td><a class="botao-link secundario" href="historico.html?registroId=${encodeURIComponent(r.id)}">Ver detalhes</a></td>
    </tr>`).join("") || `<tr><td colspan="8" class="col-texto" style="text-align:center;color:var(--cor-texto-suave);">Nenhum CIP contaminado ${filtrado ? "nos filtros selecionados" : "registrado"}.</td></tr>`;
}

iniciarContaminados();
