// =====================================================================
// Aba Adega (v8): situação de cada procedimento periódico por adega,
// data-base (administrador), antecedência do aviso e histórico da Adega.
// Toda gravação passa pelas funções do banco (definir_data_base_adega,
// remover_data_base_adega, definir_dias_aviso_adega), que conferem o
// perfil e as regras no servidor.
// =====================================================================

let ADEGA_PERFIL = null;

function adegaMensagem(tipo, texto) {
  const classe = tipo === "erro" ? "mensagem-erro" : "mensagem-sucesso";
  document.getElementById("mensagem").innerHTML = texto ? `<div class="${classe}">${cipEsc(texto)}</div>` : "";
}

function adegaBloco(s) {
  const ehAdmin = ADEGA_PERFIL.role === "administrador";
  const idBase = `base-${s.adega}-${s.tipo}`.replace(/[^a-z0-9]/gi, "-");
  let ultimoTexto = "—";
  if (s.fonte === "registro") ultimoTexto = `${cipFmtData(s.ultimo)} <a href="historico.html?registroId=${encodeURIComponent(s.registro.id)}" style="font-size:0.78rem;">(ver registro)</a>`;
  else if (s.fonte === "base") ultimoTexto = `${cipFmtData(s.ultimo)} <span class="sem-dado">(data-base definida por ${cipEsc(s.base.definido_por_nome)})</span>`;
  const acoesOperador = `<a class="botao-link primario" href="${cipLinkFormularioAdega(s.tipo, s.adega)}">Registrar CIP</a>`;
  const acoesAdmin = s.fonte === "registro"
    ? `<span class="sem-dado" style="font-size:0.76rem;">Há registro deste procedimento — a periodicidade segue o último registro, não uma data-base.</span>`
    : `<div class="campo-filtro"><label for="${idBase}">Data-base do último CIP</label><input type="date" class="input-base-adega" id="${idBase}" max="${cipHoje()}" value="${s.base ? s.base.data_base : ""}" /></div>
       <button type="button" class="secundario btn-salvar-base" data-adega="${cipEsc(s.adega)}" data-tipo="${s.tipo}" data-input="${idBase}">Salvar data-base</button>
       ${s.base ? `<button type="button" class="secundario btn-remover-base" data-adega="${cipEsc(s.adega)}" data-tipo="${s.tipo}">Remover</button>` : ""}`;
  return `
    <div class="proc-adega st-${s.status}" data-adega="${cipEsc(s.adega)}" data-tipo="${s.tipo}">
      <div class="proc-topo">
        <div><div class="proc-nome">${cipEsc(cipRotuloTipo(s.tipo))}</div><div class="proc-periodo">Periodicidade: a cada ${s.meses} meses · ${s.totalRegistros} registro(s) nesta adega</div></div>
        ${cipSeloStatus(s)}
      </div>
      <div class="proc-datas">
        <div class="campo-dado"><span>Último CIP</span><span class="valor">${ultimoTexto}</span></div>
        <div class="campo-dado"><span>Próxima data prevista</span><span class="valor proxima-prevista">${s.proxima ? cipFmtData(s.proxima) : "—"}</span><span class="sem-dado" style="font-size:0.74rem;">${cipTextoPrazo(s)}</span></div>
      </div>
      <div class="proc-acoes">${ehAdmin ? acoesAdmin : acoesOperador}</div>
      <div class="erro-base"></div>
    </div>`;
}

function adegaRenderizar(dados) {
  const periodos = [...new Set(dados.procedimentos.map((p) => `${cipRotuloTipo(p.tipo_cip)} a cada ${p.meses} meses`))];
  document.getElementById("adega-descricao").textContent =
    `${periodos.join(" e ")}, controlados separadamente para a Adega A e a Adega B. A próxima data é calculada a partir do último registro válido; abrir esta tela não conta como execução.`;
  document.getElementById("grid-adegas").innerHTML = CIP_NOMES_ADEGAS.map((adega) => `
    <div class="cartao-adega" id="cartao-${adega.replace(" ", "-")}">
      <h3>${adega}</h3>
      ${dados.situacoes.filter((s) => s.adega === adega).map(adegaBloco).join("") || '<p class="sem-dado">Nenhum procedimento cadastrado.</p>'}
    </div>`).join("");
  document.getElementById("legenda-status").innerHTML = ["vencido", "hoje", "proximo", "realizado", "emdia", "semhistorico"]
    .map((st) => `<span class="selo-status st-${st}">${CIP_ROTULO_STATUS[st]}</span>`).join("");
  document.getElementById("nota-status").textContent =
    `"Próximo do vencimento": faltam até ${dados.diasAviso} dia(s) para a data prevista. "Realizado": último registro feito há até ${dados.diasAviso} dia(s).`;

  const regs = [...dados.registros].sort((a, b) => b.data_cip.localeCompare(a.data_cip) || String(b.criado_em).localeCompare(String(a.criado_em)));
  document.getElementById("lista-historico-adega").innerHTML = regs.map((r) => `
    <div class="item-registro">
      <span class="tipo-marca" style="background:${CIP_CORES_TIPO[r.tipo_cip] || "#888"}"></span>
      <div class="dados"><div class="linha-principal">${cipEsc(cipRotuloTipo(r.tipo_cip))} — ${cipEsc(r.equipamento)}</div><div class="linha-secundaria">Operador: ${cipEsc(r.nome_operador)}</div></div>
      ${cipSelos(r)}
      <div class="hora">${cipFmtData(r.data_cip)} ${cipHora(r.hora_inicial)}</div>
      <a class="ver" href="historico.html?registroId=${encodeURIComponent(r.id)}">Ver detalhes</a>
    </div>`).join("") || '<p class="sem-dado">Nenhum CIP da Adega registrado ainda.</p>';

  if (ADEGA_PERFIL.role === "administrador") {
    document.getElementById("secao-config-adega").classList.remove("oculto");
    document.getElementById("cfg-dias-aviso").value = dados.diasAviso;
    ligarAcoesAdmin();
  }
}

async function adegaRecarregar(mensagemSucesso) {
  const dados = await cipInicializarPagina(ADEGA_PERFIL);
  if (!dados) {
    adegaMensagem("erro", "Não foi possível carregar a situação da Adega. Verifique a conexão e tente novamente.");
    return;
  }
  adegaRenderizar(dados);
  adegaMensagem("sucesso", mensagemSucesso || "");
}

function ligarAcoesAdmin() {
  document.querySelectorAll(".btn-salvar-base").forEach((b) => b.addEventListener("click", async () => {
    const erroEl = b.closest(".proc-adega").querySelector(".erro-base");
    const valor = document.getElementById(b.dataset.input).value;
    const erro = (m) => { erroEl.innerHTML = `<div class="mensagem-erro" style="margin-top:8px;">${cipEsc(m)}</div>`; };
    erroEl.innerHTML = "";
    if (!valor) return erro("Informe a data do último CIP realizado.");
    if (valor > cipHoje()) return erro("A data-base não pode ser futura — use a data em que o último CIP foi de fato realizado.");
    b.disabled = true;
    const { error } = await supabaseClient.rpc("definir_data_base_adega", { p_adega: b.dataset.adega, p_tipo_cip: b.dataset.tipo, p_data_base: valor });
    b.disabled = false;
    if (error) return erro(cipMensagemErro(error, ""));
    adegaRecarregar("Data-base salva.");
  }));
  document.querySelectorAll(".btn-remover-base").forEach((b) => b.addEventListener("click", async () => {
    const erroEl = b.closest(".proc-adega").querySelector(".erro-base");
    b.disabled = true;
    const { error } = await supabaseClient.rpc("remover_data_base_adega", { p_adega: b.dataset.adega, p_tipo_cip: b.dataset.tipo });
    b.disabled = false;
    if (error) { erroEl.innerHTML = `<div class="mensagem-erro" style="margin-top:8px;">${cipEsc(cipMensagemErro(error, ""))}</div>`; return; }
    adegaRecarregar("Data-base removida.");
  }));
}

async function iniciarAdega() {
  const resultado = await exigirSessao();
  if (!resultado) return;
  ADEGA_PERFIL = resultado.perfil;
  document.getElementById("info-usuario").textContent =
    `${ADEGA_PERFIL.nome} (${ADEGA_PERFIL.role === "administrador" ? "Administrador" : "Operador"})`;

  document.getElementById("btn-salvar-dias-aviso").addEventListener("click", async () => {
    const erroEl = document.getElementById("erro-config-adega");
    erroEl.innerHTML = "";
    const n = Number(document.getElementById("cfg-dias-aviso").value);
    if (!Number.isInteger(n) || n < 1 || n > 120) {
      erroEl.innerHTML = '<div class="mensagem-erro" style="margin-top:8px;">Informe um número inteiro de dias entre 1 e 120.</div>';
      return;
    }
    const { error } = await supabaseClient.rpc("definir_dias_aviso_adega", { p_dias: n });
    if (error) {
      erroEl.innerHTML = `<div class="mensagem-erro" style="margin-top:8px;">${cipEsc(cipMensagemErro(error, ""))}</div>`;
      return;
    }
    adegaRecarregar("Antecedência do aviso salva.");
  });

  adegaRecarregar();
}

iniciarAdega();
