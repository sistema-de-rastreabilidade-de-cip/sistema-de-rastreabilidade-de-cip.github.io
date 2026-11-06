// =====================================================================
// Lógica da tela de Histórico (consulta, filtros, detalhe, edição,
// avaliação do CIP e observações administrativas)
// ---------------------------------------------------------------------
// v8: a listagem lê a visão vw_cip_registros (registro + situação da
// avaliação). Toda gravação de avaliação passa pela função avaliar_cip
// no banco; a tela só confirma depois da resposta do servidor e mantém
// o texto digitado se houver erro.
// =====================================================================

let PERFIL_ATUAL = null;
let REGISTRO_ABERTO_ID = null;

const mensagemEl = document.getElementById("mensagem");

function mostrarMensagem(tipo, texto) {
  const classe = tipo === "erro" ? "mensagem-erro" : tipo === "sucesso" ? "mensagem-sucesso" : "mensagem-aviso";
  mensagemEl.innerHTML = texto ? `<div class="${classe}">${texto}</div>` : "";
}

function escaparHtml(texto) {
  return cipEsc(texto);
}

function formatarData(dataIso) {
  return cipFmtData(dataIso);
}

function formatarDataHora(iso) {
  return cipFmtDataHora(iso);
}

function preencherSelects() {
  const select = document.getElementById("f-tipo");
  Object.entries(TIPO_CIP_LABELS).forEach(([tipo, label]) => {
    const opt = document.createElement("option");
    opt.value = tipo;
    opt.textContent = label;
    select.appendChild(opt);
  });
  const selBbt = document.getElementById("f-bbt");
  BBTS_OSAM.forEach((b) => {
    const opt = document.createElement("option");
    opt.value = b;
    opt.textContent = b;
    selBbt.appendChild(opt);
  });
}

// Paginação: cada página busca PAGINA_TAMANHO + 1 linhas só para saber
// se existe uma próxima página (sem count() separado no banco).
const PAGINA_TAMANHO = 25;
let paginaAtual = 0;
let temMaisPaginas = false;

const IDS_FILTROS = ["f-tipo", "f-data-inicio", "f-data-fim", "f-operador", "f-equipamento", "f-texto", "f-avaliacao", "f-revisao", "f-bbt"];

function montarQueryFiltrada() {
  let query = supabaseClient
    .from("vw_cip_registros")
    .select("*")
    .order("data_cip", { ascending: false })
    .order("hora_inicial", { ascending: false })
    .order("id", { ascending: true });

  const v = (id) => document.getElementById(id).value.trim();
  const tipo = v("f-tipo");
  const dataInicio = v("f-data-inicio");
  const dataFim = v("f-data-fim");
  const operador = v("f-operador");
  const equipamento = v("f-equipamento");
  const texto = v("f-texto");
  const avaliacao = v("f-avaliacao");
  const revisao = v("f-revisao");
  const bbt = v("f-bbt");

  if (tipo) query = query.eq("tipo_cip", tipo);
  if (dataInicio) query = query.gte("data_cip", dataInicio);
  if (dataFim) query = query.lte("data_cip", dataFim);
  if (operador) query = query.ilike("nome_operador", `%${operador}%`);
  if (equipamento) query = query.ilike("equipamento", `%${equipamento}%`);
  if (avaliacao) query = query.eq("situacao_avaliacao", avaliacao);
  if (revisao === "pendente") query = query.eq("revisao_pendente", true);
  if (bbt) query = query.eq("bbt", bbt);
  if (texto) {
    const escapado = texto.replace(/[%,()]/g, "");
    query = query.or(`equipamento.ilike.%${escapado}%,nome_operador.ilike.%${escapado}%,observacoes_operador.ilike.%${escapado}%`);
  }

  return query;
}

async function buscarPagina(pagina) {
  mostrarMensagem(null, "");
  const inicio = pagina * PAGINA_TAMANHO;
  const fim = inicio + PAGINA_TAMANHO; // intervalo inclusivo: PAGINA_TAMANHO + 1 linhas

  const { data, error } = await montarQueryFiltrada().range(inicio, fim);

  if (error) {
    mostrarMensagem("erro", escaparHtml(cipMensagemErro(error, "Erro ao buscar o histórico: ")));
    return [];
  }

  const linhas = data || [];
  temMaisPaginas = linhas.length > PAGINA_TAMANHO;
  return temMaisPaginas ? linhas.slice(0, PAGINA_TAMANHO) : linhas;
}

function renderizarTabela(registros, acumular) {
  const corpo = document.getElementById("corpo-tabela");
  const resumo = document.getElementById("resumo-resultado");
  const botaoMais = document.getElementById("btn-carregar-mais");

  if (!acumular) corpo.innerHTML = "";

  if (!acumular && registros.length === 0) {
    corpo.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--cor-texto-suave);">Nenhum registro encontrado com os filtros aplicados.</td></tr>`;
    resumo.textContent = "0 registro(s) encontrado(s).";
    botaoMais.classList.add("oculto");
    return;
  }

  corpo.insertAdjacentHTML(
    "beforeend",
    registros
      .map(
        (r) => `
      <tr>
        <td data-label="Data">${formatarData(r.data_cip)}</td>
        <td data-label="Tipo de CIP"><span class="badge">${escaparHtml(cipRotuloTipo(r.tipo_cip))}</span></td>
        <td data-label="Equipamento" class="col-texto">${cipRotuloEquipHtml(r)}</td>
        <td data-label="Operador" class="col-texto">${escaparHtml(r.nome_operador)}</td>
        <td data-label="Hora Inicial">${cipHora(r.hora_inicial)}</td>
        <td data-label="Avaliação" class="col-texto">${cipSelos(r)}</td>
        <td><button type="button" class="secundario" data-id="${escaparHtml(r.id)}" onclick="abrirDetalhe('${escaparHtml(r.id)}')">Ver detalhes</button></td>
      </tr>
    `
      )
      .join("")
  );

  const totalNaTela = corpo.querySelectorAll("tr").length;
  resumo.textContent = temMaisPaginas
    ? `Mostrando os ${totalNaTela} primeiros registros — há mais resultados.`
    : `${totalNaTela} registro(s) encontrado(s).`;
  botaoMais.classList.toggle("oculto", !temMaisPaginas);
}

async function carregarPrimeiraPagina() {
  paginaAtual = 0;
  const registros = await buscarPagina(paginaAtual);
  renderizarTabela(registros, false);
}

async function carregarProximaPagina() {
  const botao = document.getElementById("btn-carregar-mais");
  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Carregando...";
  paginaAtual += 1;
  const registros = await buscarPagina(paginaAtual);
  renderizarTabela(registros, true);
  botao.disabled = false;
  botao.textContent = textoOriginal;
}

function renderizarCamposDados(tipoCip, dados) {
  const config = FORM_CONFIG[tipoCip];
  if (!config) return "";
  return config.campos
    .map((campo) => {
      const valor = dados && dados[campo.key] ? dados[campo.key] : "—";
      return `<div class="campo-dado"><span>${escaparHtml(campo.label)}</span><span class="valor">${escaparHtml(valor)}</span></div>`;
    })
    .join("");
}

// ---- Diferenças de uma edição (valores_anteriores x valores_novos) ----
function diferencasEdicao(e, tipoCip) {
  return cipDiferencasEdicao(e, tipoCip);
}

// ---- Avaliação do CIP ----
function textoAvaliacaoObrigatorio(anterior, nova) {
  return anterior !== "aguardando" || nova === "contaminado";
}

function htmlAvaliacao(r) {
  const sit = cipSituacao(r);
  const rev = cipTemRevisao(r);
  const avisoRev = rev
    ? `<div class="aviso-revisao" id="aviso-revisao">
        <strong>Revisão necessária:</strong> este registro foi alterado depois da última avaliação
        (edição em ${formatarDataHora(r.revisao_desde)} por ${escaparHtml(r.revisao_por)}${r.revisao_qtd_edicoes > 1 ? `; última em ${formatarDataHora(r.revisao_ultima_em)} por ${escaparHtml(r.revisao_ultimo_por)}` : ""}).
        A classificação abaixo foi dada antes dessas alterações — confira os dados atualizados e o histórico de alterações antes de reavaliar.
      </div>`
    : "";
  const atual = `
    ${avisoRev}
    <div class="bloco-avaliacao av-${sit}">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;">
        <div>Situação atual: ${cipSelos(r)}</div>
        ${r.avaliador_nome ? `<span class="texto-suave">Avaliado por ${escaparHtml(r.avaliador_nome)} em ${formatarDataHora(r.avaliado_em)}</span>` : '<span class="texto-suave">Ainda não avaliado pelo supervisor.</span>'}
      </div>
      ${r.avaliacao_observacao ? `<div style="margin-top:8px;font-size:0.86rem;"><strong>${sit === "contaminado" ? "Descrição da ocorrência" : "Observação"}:</strong> ${escaparHtml(r.avaliacao_observacao)}</div>` : ""}
    </div>`;

  let instrucao;
  if (sit === "aguardando") instrucao = "Registrar a primeira avaliação deste CIP. Para Conforme a observação é opcional; para Contaminado a descrição da ocorrência é obrigatória.";
  else if (rev) instrucao = `Reavaliar após a alteração: confirme ${CIP_ROTULO_AVALIACAO[sit]} (mantendo a avaliação anterior) ou mude a classificação. Justificativa obrigatória.`;
  else instrucao = "Corrigir a avaliação — só é possível mudar a classificação, com justificativa obrigatória (fica no histórico de auditoria).";
  const rotuloOpcao = (v) => (rev && v === sit ? `Manter ${CIP_ROTULO_AVALIACAO[v]} (confirmar)` : CIP_ROTULO_AVALIACAO[v]);

  const form =
    PERFIL_ATUAL.role === "administrador"
      ? `
    <div style="margin-top:12px;" id="form-avaliacao">
      <div class="texto-suave">${instrucao}</div>
      <div class="opcoes-avaliacao">
        <label class="opcao-avaliacao op-conforme"><input type="radio" name="av-situacao" value="conforme"${sit === "conforme" ? " checked" : ""} /> ${rotuloOpcao("conforme")}</label>
        <label class="opcao-avaliacao op-contaminado"><input type="radio" name="av-situacao" value="contaminado"${sit === "contaminado" ? " checked" : ""} /> ${rotuloOpcao("contaminado")}</label>
      </div>
      <label for="av-observacao" id="rotulo-av-observacao">Observação da avaliação</label>
      <textarea id="av-observacao" maxlength="300" placeholder="Explique a decisão. Não use respostas genéricas (ex.: 'ok', 'erro')."></textarea>
      <div id="erro-avaliacao"></div>
      <div class="botoes"><button type="button" class="primario" id="btn-salvar-avaliacao">${rev ? "Salvar reavaliação" : "Salvar avaliação"}</button></div>
    </div>`
      : '<p class="texto-suave" style="margin-top:8px;">Somente o supervisor/administrador pode registrar ou alterar a avaliação.</p>';

  return `${atual}${form}
    <div style="margin-top:14px;"><div style="font-weight:600;font-size:0.86rem;margin-bottom:6px;">Histórico de avaliações</div><div id="lista-hist-avaliacao"><p class="texto-suave">Carregando...</p></div></div>`;
}

function ligarFormularioAvaliacao(r) {
  const btn = document.getElementById("btn-salvar-avaliacao");
  if (!btn) return;
  const anterior = cipSituacao(r);
  const atualizarRotulo = () => {
    const sel = document.querySelector('input[name="av-situacao"]:checked');
    const nova = sel ? sel.value : "";
    const obrig = nova && textoAvaliacaoObrigatorio(anterior, nova);
    const nome = anterior === "aguardando" ? (nova === "contaminado" ? "Descrição da ocorrência" : "Observação da avaliação (opcional)") : "Justificativa";
    document.getElementById("rotulo-av-observacao").innerHTML = obrig ? `${nome} <span class="marca-obrigatorio">*</span>` : nome;
  };
  document.querySelectorAll('input[name="av-situacao"]').forEach((i) => i.addEventListener("change", atualizarRotulo));
  atualizarRotulo();

  btn.addEventListener("click", async () => {
    const erroEl = document.getElementById("erro-avaliacao");
    erroEl.innerHTML = "";
    const sel = document.querySelector('input[name="av-situacao"]:checked');
    const nova = sel ? sel.value : "";
    const texto = document.getElementById("av-observacao").value.trim();
    const mostrarErro = (m) => { erroEl.innerHTML = `<div class="mensagem-erro">${escaparHtml(m)}</div>`; };

    // Mesmas regras do banco, verificadas antes só para responder rápido.
    if (nova !== "conforme" && nova !== "contaminado") return mostrarErro("Selecione Conforme ou Contaminado.");
    if (anterior === nova && !cipTemRevisao(r)) return mostrarErro(`O registro já está como ${CIP_ROTULO_AVALIACAO[anterior]}. Para corrigir, selecione outra classificação.`);
    if (textoAvaliacaoObrigatorio(anterior, nova) || texto) {
      const v = validarJustificativa(texto);
      if (!v.valido) {
        const contexto = anterior === "aguardando" && nova === "contaminado" ? "Descrição da ocorrência: " : anterior === "aguardando" ? "Observação: " : "Justificativa: ";
        return mostrarErro(contexto + v.motivo);
      }
    }

    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Salvando...";
    const { error } = await supabaseClient.rpc("avaliar_cip", {
      p_registro_id: r.id,
      p_situacao: nova,
      p_observacao: texto || null,
      p_versao_esperada: r.avaliacao_versao || 0,
    });
    if (error) {
      btn.disabled = false;
      btn.textContent = textoOriginal;
      if (error.code === "PT409") {
        mostrarErro(error.message);
        const botaoRecarregar = document.createElement("button");
        botaoRecarregar.type = "button";
        botaoRecarregar.className = "secundario";
        botaoRecarregar.textContent = "Recarregar avaliação atual";
        botaoRecarregar.addEventListener("click", () => abrirDetalhe(r.id, { foco: "avaliacao" }));
        erroEl.appendChild(botaoRecarregar);
      } else {
        mostrarErro(cipMensagemErro(error, "Não foi possível salvar a avaliação: "));
      }
      return; // o texto digitado continua na tela
    }
    await abrirDetalhe(r.id, { foco: "avaliacao", avaliacaoSalva: true });
  });
}

async function carregarHistoricoAvaliacao(id) {
  const el = document.getElementById("lista-hist-avaliacao");
  const { data, error } = await supabaseClient
    .from("cip_avaliacoes_historico")
    .select("*")
    .eq("registro_id", id)
    .order("criado_em", { ascending: false })
    .order("id", { ascending: false });
  if (error) {
    el.innerHTML = `<div class="mensagem-erro">${escaparHtml(cipMensagemErro(error, "Não foi possível carregar o histórico de avaliações: "))}</div>`;
    return;
  }
  el.innerHTML = (data || []).length
    ? `<ul class="lista-edicoes">${data
        .map(
          (h) => `
        <li>
          <div class="meta">${formatarDataHora(h.criado_em)} — por ${escaparHtml(h.avaliador_nome)} · ${escaparHtml(CIP_ROTULO_EVENTO_AV[h.tipo_evento] || h.tipo_evento)}</div>
          <div>${h.situacao_anterior === h.situacao_nova
            ? `${CIP_ROTULO_AVALIACAO[h.situacao_anterior]} mantido — <strong>${CIP_ROTULO_AVALIACAO[h.situacao_nova]}</strong>`
            : `${CIP_ROTULO_AVALIACAO[h.situacao_anterior]} → <strong>${CIP_ROTULO_AVALIACAO[h.situacao_nova]}</strong>`}</div>
          ${h.observacao ? `<div style="margin-top:4px;"><strong>Justificativa/observação:</strong> ${escaparHtml(h.observacao)}</div>` : ""}
        </li>`
        )
        .join("")}</ul>`
    : '<p class="texto-suave">Nenhuma avaliação registrada.</p>';
}

async function abrirDetalhe(id, opcoes) {
  opcoes = opcoes || {};
  REGISTRO_ABERTO_ID = id;
  const area = document.getElementById("area-detalhe");
  area.innerHTML = `<div class="cartao">Carregando detalhes...</div>`;

  const [{ data: registro, error: errReg }, { data: edicoes, error: errEd }, { data: observacoes, error: errObs }] =
    await Promise.all([
      supabaseClient.from("vw_cip_registros").select("*").eq("id", id).single(),
      // Coluna real do banco: criado_em (o código anterior usava
      // "alterado_em", inexistente — por isso o histórico não aparecia).
      supabaseClient.from("cip_edicoes").select("*").eq("registro_id", id).order("criado_em", { ascending: false }),
      supabaseClient.from("cip_observacoes").select("*").eq("registro_id", id).order("criado_em", { ascending: false }),
    ]);

  if (errReg || !registro) {
    area.innerHTML = `<div class="cartao mensagem-erro">Não foi possível carregar este registro.</div>`;
    return;
  }

  const config = FORM_CONFIG[registro.tipo_cip];
  const podeEditar = PERFIL_ATUAL.role === "operador";
  const podeComentar = PERFIL_ATUAL.role === "administrador";

  let htmlEdicoes = "<p class='texto-suave'>Nenhuma alteração registrada.</p>";
  if (errEd) {
    htmlEdicoes = `<div class="mensagem-erro">${escaparHtml(cipMensagemErro(errEd, "Não foi possível carregar o histórico de alterações: "))}</div>`;
  } else if (edicoes && edicoes.length > 0) {
    htmlEdicoes = `<ul class="lista-edicoes">${edicoes
      .map((e) => {
        const diffs = diferencasEdicao(e, registro.tipo_cip);
        return `
        <li>
          <div class="meta">${formatarDataHora(e.criado_em)} — por ${escaparHtml(e.alterado_por_nome)}</div>
          ${diffs.length
            ? `<ul class="diff-edicao">${diffs.map((d) => `<li>${escaparHtml(d.rotulo)}: <em>${escaparHtml(d.de)}</em> → <strong>${escaparHtml(d.para)}</strong></li>`).join("")}</ul>`
            : ""}
          <div><strong>Justificativa:</strong> ${escaparHtml(e.justificativa)}</div>
        </li>`;
      })
      .join("")}</ul>`;
  }

  let htmlObservacoes = "<p class='texto-suave'>Nenhuma observação administrativa.</p>";
  if (!errObs && observacoes && observacoes.length > 0) {
    htmlObservacoes = `<ul class="lista-observacoes">${observacoes
      .map(
        (o) => `
        <li>
          <div class="meta">${formatarDataHora(o.criado_em)} — ${escaparHtml(o.administrador_nome)}</div>
          <div>${escaparHtml(o.texto)}</div>
        </li>
      `
      )
      .join("")}</ul>`;
  }

  area.innerHTML = `
    <div class="cartao detalhe-registro">
      ${opcoes.avaliacaoSalva ? '<div class="mensagem-sucesso">Avaliação salva.</div>' : ""}
      <h3>${escaparHtml(config ? config.titulo : registro.tipo_cip)}</h3>
      <div style="margin:-4px 0 10px;">${cipSelos(registro)}</div>
      <div class="campo-dado"><span>Data</span><span class="valor">${formatarData(registro.data_cip)}</span></div>
      <div class="campo-dado"><span>${registro.tipo_cip === "osam" ? "BBT" : "Equipamento"}</span><span class="valor">${escaparHtml(registro.tipo_cip === "osam" ? registro.bbt : registro.equipamento)}</span></div>
      <div class="campo-dado"><span>Hora Inicial</span><span class="valor">${cipHora(registro.hora_inicial)}</span></div>
      ${config && config.temHoraFinal ? `<div class="campo-dado"><span>Hora Final</span><span class="valor">${cipHora(registro.hora_final)}</span></div>` : ""}
      <div class="campo-dado"><span>Operador</span><span class="valor">${escaparHtml(registro.nome_operador)}</span></div>
      ${renderizarCamposDados(registro.tipo_cip, registro.dados)}
      <div class="campo-dado"><span>Observações</span><span class="valor">${escaparHtml(registro.observacoes_operador || "—")}</span></div>
      <p class="rodape-doc">Criado em ${formatarDataHora(registro.criado_em)} · Última atualização em ${formatarDataHora(registro.atualizado_em)}</p>

      <div class="botoes">
        ${podeEditar ? `<a class="botao-link secundario" href="registro.html?tipo=${encodeURIComponent(registro.tipo_cip)}&id=${encodeURIComponent(registro.id)}">Editar este registro</a>` : ""}
        <button type="button" class="secundario" onclick="document.getElementById('area-detalhe').innerHTML=''">Fechar</button>
      </div>

      <fieldset id="secao-avaliacao">
        <legend>Avaliação do CIP</legend>
        ${htmlAvaliacao(registro)}
      </fieldset>

      <fieldset>
        <legend>Histórico de alterações</legend>
        ${htmlEdicoes}
      </fieldset>

      <fieldset>
        <legend>Observações administrativas</legend>
        ${htmlObservacoes}
        ${
          podeComentar
            ? `
          <div style="margin-top:10px;">
            <label for="nova-observacao">Adicionar observação</label>
            <textarea id="nova-observacao" placeholder="Descreva o problema ou observação encontrada"></textarea>
            <div id="erro-observacao"></div>
            <div class="botoes">
              <button type="button" class="primario" id="btn-salvar-observacao">Salvar observação</button>
            </div>
          </div>
        `
            : ""
        }
      </fieldset>
    </div>
  `;

  ligarFormularioAvaliacao(registro);
  carregarHistoricoAvaliacao(id);
  const btnObs = document.getElementById("btn-salvar-observacao");
  if (btnObs) btnObs.addEventListener("click", () => salvarObservacao(registro.id));

  const alvo = opcoes.foco === "avaliacao" ? document.getElementById("secao-avaliacao") : area;
  if (alvo) alvo.scrollIntoView({ block: "start" });
  if (opcoes.foco === "avaliacao") {
    const f = document.querySelector('input[name="av-situacao"]');
    if (f) f.focus({ preventScroll: true });
  }
}

async function salvarObservacao(registroId) {
  const textarea = document.getElementById("nova-observacao");
  const texto = textarea.value.trim();
  const erroEl = document.getElementById("erro-observacao");
  erroEl.innerHTML = "";

  if (texto.length < 3) {
    erroEl.innerHTML = '<div class="mensagem-erro">Escreva uma observação com pelo menos 3 caracteres.</div>';
    return;
  }

  const botao = document.getElementById("btn-salvar-observacao");
  botao.disabled = true;
  // Autor (nome e uid) é preenchido pelo banco a partir da conta logada.
  const { error } = await supabaseClient.from("cip_observacoes").insert({
    registro_id: registroId,
    texto,
    administrador_nome: PERFIL_ATUAL.nome,
  });

  if (error) {
    botao.disabled = false;
    erroEl.innerHTML = `<div class="mensagem-erro">${escaparHtml(cipMensagemErro(error, "Erro ao salvar a observação: "))}</div>`;
    return;
  }

  await abrirDetalhe(registroId);
}

async function init() {
  const resultado = await exigirSessao();
  if (!resultado) return;
  PERFIL_ATUAL = resultado.perfil;

  document.getElementById("info-usuario").textContent =
    `${PERFIL_ATUAL.nome} (${PERFIL_ATUAL.role === "administrador" ? "Administrador" : "Operador"})`;

  cipInicializarPagina(PERFIL_ATUAL);
  preencherSelects();

  // Pré-preenche os filtros a partir da URL (links do painel).
  const params = new URLSearchParams(window.location.search);
  const mapa = { tipo: "f-tipo", equipamento: "f-equipamento", dataInicio: "f-data-inicio", dataFim: "f-data-fim", operador: "f-operador", avaliacao: "f-avaliacao", revisao: "f-revisao", bbt: "f-bbt" };
  Object.entries(mapa).forEach(([param, id]) => {
    if (params.get(param)) document.getElementById(id).value = params.get(param);
  });

  document.getElementById("btn-filtrar").addEventListener("click", async () => {
    const botao = document.getElementById("btn-filtrar");
    const textoOriginal = botao.textContent;
    botao.disabled = true;
    botao.textContent = "Filtrando...";
    await carregarPrimeiraPagina();
    botao.disabled = false;
    botao.textContent = textoOriginal;
  });

  document.getElementById("btn-limpar").addEventListener("click", async () => {
    IDS_FILTROS.forEach((id) => (document.getElementById(id).value = ""));
    await carregarPrimeiraPagina();
  });

  document.getElementById("btn-carregar-mais").addEventListener("click", carregarProximaPagina);

  await carregarPrimeiraPagina();

  if (params.get("registroId")) {
    abrirDetalhe(params.get("registroId"), { foco: params.get("foco") });
  }
}

init();
