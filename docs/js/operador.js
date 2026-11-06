// =====================================================================
// CIPs realizados por um operador (v8) — aberto pelo gráfico "CIPs
// realizados por operador" do painel, com os mesmos filtros. "Voltar ao
// gráfico" devolve ao painel com os filtros preservados.
// =====================================================================

async function iniciarOperador() {
  const resultado = await exigirSessao();
  if (!resultado) return;
  const perfil = resultado.perfil;
  document.getElementById("info-usuario").textContent =
    `${perfil.nome} (${perfil.role === "administrador" ? "Administrador" : "Operador"})`;
  cipInicializarPagina(perfil);

  const params = new URLSearchParams(window.location.search);
  const nome = params.get("nome") || "";
  const f = { tipo: params.get("tipo") || "", equipamento: params.get("equipamento") || "", dataInicio: params.get("dataInicio") || "", dataFim: params.get("dataFim") || "" };
  const filtrosPainel = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  document.getElementById("link-voltar-grafico").href = "painel.html" + (filtrosPainel ? "?" + filtrosPainel : "") + "#secao-operadores";
  document.getElementById("titulo-operador").textContent = `CIPs realizados — ${nome}`;

  const partes = [];
  partes.push(f.dataInicio || f.dataFim ? `Período: ${f.dataInicio ? cipFmtData(f.dataInicio) : "início"} a ${f.dataFim ? cipFmtData(f.dataFim) : "hoje"}` : "Período: todos os registros");
  partes.push(`Tipo: ${f.tipo ? cipRotuloTipo(f.tipo) : "todos"}`);
  partes.push(`Equipamento: ${f.equipamento || "todos"}`);
  document.getElementById("resumo-filtros-operador").textContent = "Filtros aplicados: " + partes.join(" · ");

  if (!nome) {
    document.getElementById("mensagem").innerHTML = '<div class="mensagem-aviso">Nenhum operador informado.</div>';
    return;
  }

  let query = supabaseClient
    .from("vw_cip_registros")
    .select("id, tipo_cip, equipamento, bbt, data_cip, hora_inicial, hora_final, nome_operador, situacao_avaliacao, revisao_pendente")
    .eq("nome_operador", nome)
    .order("data_cip", { ascending: false })
    .order("hora_inicial", { ascending: false })
    .limit(2000);
  if (f.tipo) query = query.eq("tipo_cip", f.tipo);
  if (f.equipamento) query = query.ilike("equipamento", `%${f.equipamento}%`);
  if (f.dataInicio) query = query.gte("data_cip", f.dataInicio);
  if (f.dataFim) query = query.lte("data_cip", f.dataFim);

  const { data, error } = await query;
  if (error) {
    document.getElementById("mensagem").innerHTML = `<div class="mensagem-erro">${cipEsc(cipMensagemErro(error, "Não foi possível carregar os registros: "))}</div>`;
    return;
  }
  const lista = data || [];
  document.getElementById("total-operador").innerHTML = `<strong>${lista.length}</strong> CIP(s) encontrado(s) para este operador.`;
  document.getElementById("corpo-tabela-operador").innerHTML = lista.map((r) => `
    <tr>
      <td data-label="Data e horário">${cipFmtData(r.data_cip)} ${cipHora(r.hora_inicial)}${r.hora_final ? "–" + cipHora(r.hora_final) : ""}</td>
      <td data-label="Tipo de CIP" class="col-texto">${cipEsc(cipRotuloTipo(r.tipo_cip))}</td>
      <td data-label="Equipamento" class="col-texto">${cipRotuloEquipHtml(r)}</td>
      <td data-label="Avaliação" class="col-texto">${cipSelos(r)}</td>
      <td><a class="botao-link secundario" href="historico.html?registroId=${encodeURIComponent(r.id)}">Ver detalhes</a></td>
    </tr>`).join("") || '<tr><td colspan="5" class="col-texto" style="text-align:center;color:var(--cor-texto-suave);">Nenhum registro deste operador nos filtros atuais.</td></tr>';
}

iniciarOperador();
