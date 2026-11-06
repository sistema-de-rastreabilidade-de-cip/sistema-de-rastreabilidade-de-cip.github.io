// =====================================================================
// Lógica da tela de novo registro / edição de registro de CIP
// =====================================================================

const params = new URLSearchParams(window.location.search);
const TIPO = params.get("tipo");
const ID_REGISTRO = params.get("id"); // presente apenas em modo edição
// v8: formulário aberto pela aba Adega (Adega A ou Adega B como equipamento)
const ADEGA_PARAM = CIP_NOMES_ADEGAS.includes(params.get("adega")) ? params.get("adega") : null;

let CONFIG = null;
let REGISTRO_ATUAL = null; // carregado do banco, quando em modo edição
let PERFIL_ATUAL = null;

const mensagemEl = document.getElementById("mensagem");

function mostrarMensagem(tipo, texto) {
  const classe = tipo === "erro" ? "mensagem-erro" : tipo === "sucesso" ? "mensagem-sucesso" : "mensagem-aviso";
  mensagemEl.innerHTML = `<div class="${classe}">${texto}</div>`;
}

function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = String(texto ?? "");
  return div.innerHTML;
}

function criarInputTopo(idCampo, label, tipoInput, valor, extraAttrs = "") {
  const obrigatorio = /\brequired\b/.test(extraAttrs);
  return `
    <div class="campo">
      <label for="${idCampo}">${escaparHtml(label)}${obrigatorio ? ' <span class="marca-obrigatorio" title="Campo obrigatório">*</span>' : ""}</label>
      <input type="${tipoInput}" id="${idCampo}" value="${escaparHtml(valor ?? "")}" ${extraAttrs} />
    </div>
  `;
}

function criarSelectBbt(valorAtual) {
  const opcoes = CONFIG.bbt.opcoes
    .map((b) => `<option value="${escaparHtml(b)}" ${b === valorAtual ? "selected" : ""}>${escaparHtml(b)}</option>`)
    .join("");
  return `
    <div class="campo">
      <label for="equipamento">${escaparHtml(CONFIG.bbt.label)} <span class="marca-obrigatorio" title="Campo obrigatório">*</span></label>
      <select id="equipamento">
        <option value="">— selecione —</option>
        ${opcoes}
      </select>
    </div>
  `;
}

// Lista do seletor principal: as Adegas quando o formulário veio da aba
// Adega (ou quando o registro editado é de uma Adega); senão, a lista
// oficial do formulário.
function listaParaSeletorPrincipal(tipoSeletor, valorAtual) {
  if (ADEGA_PARAM || CIP_NOMES_ADEGAS.includes(valorAtual)) {
    return OUTROS_EQUIPAMENTOS.filter((e) => e.categoria === "adega");
  }
  return listaEquipamentosParaCampo(tipoSeletor);
}

function criarSelectEquipamento(idCampo, label, tipoSeletor, valorAtual, lista) {
  const opcoes = (lista || listaEquipamentosParaCampo(tipoSeletor))
    .filter(Boolean)
    .map((item) => {
      const nome = nomeExibicaoEquipamento(item);
      const selecionado = nome === valorAtual ? "selected" : "";
      return `<option value="${escaparHtml(nome)}" ${selecionado}>${escaparHtml(nome)}</option>`;
    })
    .join("");
  return `
    <div class="campo">
      <label for="${idCampo}">${escaparHtml(label)} <span class="marca-obrigatorio" title="Campo obrigatório">*</span></label>
      <select id="${idCampo}">
        <option value="">— selecione —</option>
        ${opcoes}
      </select>
    </div>
  `;
}

function renderizarCamposTopo(valoresIniciais = {}) {
  const container = document.getElementById("campos-topo");
  let html = "";

  const max = cipDataMaxima(TIPO);
  html += criarInputTopo("data_cip", "Data", "date", valoresIniciais.data_cip, `required${max ? ` max="${max}"` : ""}`);

  if (CONFIG.bbt) {
    html += criarSelectBbt(valoresIniciais.bbt || valoresIniciais.equipamento);
  } else if (CONFIG.equipamento) {
    const valorEquip = valoresIniciais.equipamento || ADEGA_PARAM || "";
    const ehAdega = ADEGA_PARAM || CIP_NOMES_ADEGAS.includes(valorEquip);
    html += criarSelectEquipamento(
      "equipamento",
      ehAdega ? "Adega" : CONFIG.equipamento.label,
      CONFIG.equipamento.tipoSeletor,
      valorEquip,
      listaParaSeletorPrincipal(CONFIG.equipamento.tipoSeletor, valorEquip)
    );
  } else if (CONFIG.equipamentoFixo) {
    html += `
      <div class="campo">
        <label>Equipamento</label>
        <input type="text" value="${escaparHtml(CONFIG.equipamentoFixo)}" disabled />
      </div>
    `;
  }

  html += criarInputTopo("hora_inicial", "Hora Inicial", "time", valoresIniciais.hora_inicial, "required");

  if (CONFIG.temHoraFinal) {
    html += criarInputTopo("hora_final", "Hora Final", "time", valoresIniciais.hora_final, "required");
  }

  html += criarInputTopo("nome_operador", "Operador", "text", valoresIniciais.nome_operador, "required");

  container.innerHTML = html;
}

function renderizarCamposDados(dadosIniciais = {}) {
  const container = document.getElementById("campos-dados");
  let html = "";

  CONFIG.campos.forEach((campo) => {
    const idCampo = `campo_${campo.key}`;
    const valor = dadosIniciais[campo.key];

    if (campo.tipo === "hora") {
      html += criarInputTopo(idCampo, campo.label, "time", valor);
    } else if (campo.tipo === "equipamento") {
      html += criarSelectEquipamento(idCampo, campo.label, campo.tipoSeletor, valor);
    } else if (campo.tipo === "sim_nao") {
      const simSel = valor === "Sim" ? "selected" : "";
      const naoSel = valor === "Não" ? "selected" : "";
      html += `
        <div class="campo">
          <label for="${idCampo}">${escaparHtml(campo.label)}</label>
          <select id="${idCampo}">
            <option value="">— selecione —</option>
            <option value="Sim" ${simSel}>Sim</option>
            <option value="Não" ${naoSel}>Não</option>
          </select>
        </div>
      `;
    } else {
      html += criarInputTopo(idCampo, campo.label, "text", valor);
    }
  });

  container.innerHTML = html;
}

function lerValoresDoFormulario() {
  const topo = {
    data_cip: document.getElementById("data_cip").value,
    hora_inicial: document.getElementById("hora_inicial").value || null,
    hora_final: CONFIG.temHoraFinal ? (document.getElementById("hora_final").value || null) : null,
    nome_operador: document.getElementById("nome_operador").value.trim(),
    equipamento: CONFIG.equipamento || CONFIG.bbt
      ? document.getElementById("equipamento").value
      : CONFIG.equipamentoFixo,
  };
  topo.bbt = CONFIG.bbt ? topo.equipamento : null;

  const dados = {};
  CONFIG.campos.forEach((campo) => {
    const el = document.getElementById(`campo_${campo.key}`);
    dados[campo.key] = el.value.trim();
  });

  const observacoes_operador = document.getElementById("observacoes").value.trim() || null;

  return { ...topo, dados, observacoes_operador };
}

function preencherObservacoes(texto) {
  document.getElementById("observacoes").value = texto || "";
}

function validarCamposObrigatorios(valores) {
  if (!valores.data_cip) return "Informe a Data.";
  const erroData = cipValidarDataCip(TIPO, valores.data_cip);
  if (erroData) return erroData;
  if (CONFIG.bbt && !valores.equipamento) return "Selecione o BBT.";
  if (CONFIG.equipamento && !valores.equipamento) return `Selecione o campo "${CONFIG.equipamento.label}".`;
  if (!valores.hora_inicial) return "Informe a Hora Inicial.";
  if (CONFIG.temHoraFinal && !valores.hora_final) return "Informe a Hora Final.";
  if (!valores.nome_operador) return "Informe o nome do Operador.";
  return null;
}

async function carregarRegistroParaEdicao() {
  const { data, error } = await supabaseClient
    .from("cip_registros")
    .select("*")
    .eq("id", ID_REGISTRO)
    .single();

  if (error || !data) {
    mostrarMensagem("erro", "Não foi possível carregar o registro para edição.");
    return null;
  }
  return data;
}

function montarSnapshot(valores) {
  // snapshot completo e comparável do registro (para o histórico de edições)
  const snap = {
    tipo_cip: TIPO,
    equipamento: valores.equipamento,
    data_cip: valores.data_cip,
    hora_inicial: valores.hora_inicial,
    hora_final: valores.hora_final,
    nome_operador: valores.nome_operador,
    observacoes_operador: valores.observacoes_operador,
    dados: valores.dados,
  };
  if (TIPO === "osam") snap.bbt = valores.bbt;
  return snap;
}

async function init() {
  const resultado = await exigirSessao();
  if (!resultado) return;
  const { perfil } = resultado;
  PERFIL_ATUAL = perfil;

  document.getElementById("info-usuario").textContent =
    `${perfil.nome} (${perfil.role === "administrador" ? "Administrador" : "Operador"})`;

  await cipCarregarConfiguracao();
  await cipInicializarPagina(perfil);

  if (perfil.role !== "operador") {
    document.body.innerHTML = `
      <div class="tela-erro">
        <h1>Acesso restrito</h1>
        <p>Somente operadores podem preencher ou editar registros de CIP.</p>
        <a href="painel.html">Voltar ao painel</a>
      </div>
    `;
    return;
  }

  if (!TIPO || !FORM_CONFIG[TIPO]) {
    mostrarMensagem("erro", "Tipo de CIP inválido.");
    document.getElementById("form-cip").classList.add("oculto");
    return;
  }

  CONFIG = FORM_CONFIG[TIPO];
  document.getElementById("titulo-formulario").textContent = CONFIG.titulo;
  document.getElementById("doc-origem").textContent = `Baseado em: ${CONFIG.documentoOrigem}`;
  if (ADEGA_PARAM && !ID_REGISTRO) {
    const proc = CIP_ADEGA_ATUAL && CIP_ADEGA_ATUAL.procedimentos.find((p) => p.adega === ADEGA_PARAM && p.tipo_cip === TIPO);
    document.getElementById("aviso-adega").innerHTML =
      `<div class="aviso-formulario">Procedimento periódico da ${escaparHtml(ADEGA_PARAM)}${proc ? ` (a cada ${proc.meses} meses)` : ""}: ao salvar, a próxima data prevista é recalculada a partir deste registro.</div>`;
    document.querySelectorAll('a[href="painel.html"].link-voltar, #link-cancelar').forEach((a) => { a.href = "adega.html"; });
    const voltar = document.querySelector(".link-voltar");
    if (voltar) voltar.innerHTML = "&larr; Voltar à Adega";
  }

  if (ID_REGISTRO) {
    // Modo edição
    REGISTRO_ATUAL = await carregarRegistroParaEdicao();
    if (!REGISTRO_ATUAL) return;

    renderizarCamposTopo(REGISTRO_ATUAL);
    renderizarCamposDados(REGISTRO_ATUAL.dados || {});
    preencherObservacoes(REGISTRO_ATUAL.observacoes_operador);

    document.getElementById("area-justificativa").classList.remove("oculto");
    document.getElementById("btn-salvar").textContent = "Salvar alteração";
  } else {
    // Modo criação
    renderizarCamposTopo({});
    renderizarCamposDados({});
  }

  document.getElementById("form-cip").addEventListener("submit", onSubmit);
}

async function onSubmit(e) {
  e.preventDefault();
  mensagemEl.innerHTML = "";

  const valores = lerValoresDoFormulario();
  const erroValidacao = validarCamposObrigatorios(valores);
  if (erroValidacao) {
    mostrarMensagem("erro", erroValidacao);
    return;
  }

  const botao = document.getElementById("btn-salvar");
  const textoOriginalBotao = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Salvando...";
  // Evita duplo clique/duplo envio: o botão só volta ao normal se algo
  // impedir o salvamento; em caso de sucesso, a tela muda antes disso.
  function pararCarregamento() {
    botao.disabled = false;
    botao.textContent = textoOriginalBotao;
  }

  // Observação: não buscamos mais o uid da sessão aqui para preenchê-lo
  // manualmente em campos de auditoria (criado_por/atualizado_por). Esses
  // campos são definidos pelo próprio banco (trigger em cip_registros, ou
  // dentro da função editar_registro_cip) a partir de auth.uid() do lado
  // do servidor — nunca a partir de um valor enviado pelo cliente.

  if (ID_REGISTRO) {
    // ----- Edição: exige autoria + justificativa, e grava histórico -----
    const nomeQuemEdita = document.getElementById("nome_quem_edita").value.trim();
    if (!nomeQuemEdita) {
      mostrarMensagem(
        "erro",
        'Informe o nome de quem está fazendo esta alteração (campo "Nome de quem está fazendo esta alteração").'
      );
      pararCarregamento();
      return;
    }

    const justificativaTexto = document.getElementById("justificativa").value;
    const validacao = validarJustificativa(justificativaTexto);
    if (!validacao.valido) {
      mostrarMensagem("erro", validacao.motivo);
      pararCarregamento();
      return;
    }

    const snapshotAnterior = montarSnapshot({
      equipamento: REGISTRO_ATUAL.equipamento,
      data_cip: REGISTRO_ATUAL.data_cip,
      hora_inicial: REGISTRO_ATUAL.hora_inicial,
      hora_final: REGISTRO_ATUAL.hora_final,
      nome_operador: REGISTRO_ATUAL.nome_operador,
      observacoes_operador: REGISTRO_ATUAL.observacoes_operador,
      dados: REGISTRO_ATUAL.dados,
      bbt: REGISTRO_ATUAL.bbt,
    });
    const snapshotNovo = montarSnapshot(valores);

    if (JSON.stringify(snapshotAnterior) === JSON.stringify(snapshotNovo)) {
      mostrarMensagem("aviso", "Nenhum campo foi alterado — nada para salvar.");
      pararCarregamento();
      return;
    }

    // A atualização do registro e a gravação do histórico acontecem
    // dentro de uma ÚNICA transação no banco (função RPC
    // editar_registro_cip, em supabase/schema.sql). Se qualquer etapa
    // falhar (ex.: justificativa rejeitada, perda de conexão no meio do
    // caminho), nada é salvo — nem o registro, nem o histórico.
    const { error: errRpc } = await supabaseClient.rpc("editar_registro_cip", {
      p_registro_id: ID_REGISTRO,
      p_equipamento: valores.equipamento,
      p_data_cip: valores.data_cip,
      p_hora_inicial: valores.hora_inicial,
      p_hora_final: valores.hora_final,
      p_nome_operador: valores.nome_operador,
      p_dados: valores.dados,
      p_observacoes_operador: valores.observacoes_operador,
      p_justificativa: justificativaTexto.trim(),
      p_alterado_por_nome: nomeQuemEdita,
      ...(TIPO === "osam" ? { p_bbt: valores.bbt } : {}),
    });

    if (errRpc) {
      mostrarMensagem("erro", "Não foi possível salvar a alteração: " + errRpc.message);
      pararCarregamento();
      return;
    }

    mostrarMensagem("sucesso", "Alteração salva com sucesso (registro e histórico atualizados juntos).");
    setTimeout(() => (window.location.href = `historico.html?registroId=${encodeURIComponent(ID_REGISTRO)}`), 900);
  } else {
    // ----- Criação de novo registro -----
    // Propositalmente NÃO enviamos criado_por, atualizado_por, criado_em
    // ou atualizado_em: esses campos são de auditoria e o banco os
    // preenche sozinho (trigger "cip_registros_set_auditoria_insert" em
    // supabase/schema.sql), ignorando qualquer valor que o cliente envie
    // para eles — mesmo que alguém chame a API diretamente.
    const { error } = await supabaseClient.from("cip_registros").insert({
      tipo_cip: TIPO,
      equipamento: valores.equipamento,
      ...(TIPO === "osam" ? { bbt: valores.bbt } : {}),
      data_cip: valores.data_cip,
      hora_inicial: valores.hora_inicial,
      hora_final: valores.hora_final,
      nome_operador: valores.nome_operador,
      dados: valores.dados,
      observacoes_operador: valores.observacoes_operador,
    });

    if (error) {
      mostrarMensagem("erro", "Erro ao salvar o registro: " + error.message);
      pararCarregamento();
      return;
    }

    mostrarMensagem("sucesso", "Registro de CIP salvo com sucesso.");
    const destino = ADEGA_PARAM || CIP_NOMES_ADEGAS.includes(valores.equipamento) ? "adega.html" : "painel.html";
    setTimeout(() => (window.location.href = destino), 900);
  }
}

init();
