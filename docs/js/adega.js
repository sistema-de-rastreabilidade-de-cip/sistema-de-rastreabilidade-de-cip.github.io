// =====================================================================
// Aba Adega (v10, modo geral): três procedimentos periódicos, sem separar
// Adega A, B e D — CIP Alcalino (30 dias), CIP Alcalino Clorado (6 meses)
// e CIP OSAN (BBT 01–12, periodicidade pendente de definição).
// Toda gravação passa pelas funções do banco (definir_periodicidade_adega,
// definir_data_base_adega_geral, remover_data_base_adega_geral,
// definir_dias_aviso_adega), que conferem o perfil e as regras no servidor.
// =====================================================================

let ADEGA_PERFIL = null;

const ADEGA_DESCRICAO = {
  alcalino: "Adega A, B ou D. Campos iguais aos do CIP TFM/HORAP/Trasfega/DAW.",
  alcalino_clorado: "Conta só o CIP Alcalino Clorado feito numa adega (A, B ou D); o mesmo tipo nos tanques de fermentação não entra aqui.",
  osam: "BBT escolhido na lista fixa BBT 01 a BBT 12.",
};

function adegaMensagem(tipo, texto) {
  const classe = tipo === "erro" ? "mensagem-erro" : "mensagem-sucesso";
  document.getElementById("mensagem").innerHTML = texto ? `<div class="${classe}">${cipEsc(texto)}</div>` : "";
}

function adegaUltimoTexto(s) {
  if (s.fonte === "registro") {
    const r = s.registro;
    const onde = r.tipo_cip === "osam" ? cipEsc(r.bbt || r.equipamento) : cipEsc(r.equipamento);
    return `${cipFmtData(s.ultimo)} · ${onde} <a href="historico.html?registroId=${encodeURIComponent(r.id)}" class="link-discreto">(ver registro)</a>`;
  }
  if (s.fonte === "base") return `${cipFmtData(s.ultimo)} <span class="sem-dado">(data-base definida por ${cipEsc(s.base.definido_por_nome)})</span>`;
  return "—";
}

function adegaBlocoAdmin(s) {
  const id = `ctl-${s.tipo}`;
  const p = s.proc;
  const base = s.fonte === "registro"
    ? `<p class="sem-dado nota-pequena">Há registro deste procedimento — a periodicidade segue o último registro, não uma data-base.</p>`
    : `<div class="linha-config">
         <div class="campo-filtro"><label for="${id}-base">Data-base do último CIP</label><input type="date" id="${id}-base" max="${cipHoje()}" value="${s.base ? s.base.data_base : ""}" /></div>
         <button type="button" class="secundario btn-salvar-base" data-tipo="${s.tipo}">Salvar data-base</button>
         ${s.base ? `<button type="button" class="secundario btn-remover-base" data-tipo="${s.tipo}">Remover</button>` : ""}
       </div>`;
  return `
    <details class="config-procedimento">
      <summary>Configurar este procedimento</summary>
      <div class="linha-config">
        <div class="campo-filtro"><label for="${id}-qtd">Periodicidade</label><input type="number" id="${id}-qtd" min="1" max="3650" value="${p.periodo_quantidade || ""}" placeholder="pendente" /></div>
        <div class="campo-filtro"><label for="${id}-un">Unidade</label>
          <select id="${id}-un"><option value="">—</option><option value="dias" ${p.periodo_unidade === "dias" ? "selected" : ""}>dias</option><option value="meses" ${p.periodo_unidade === "meses" ? "selected" : ""}>meses</option></select></div>
        <div class="campo-filtro"><label for="${id}-aviso">Aviso com antecedência (dias)</label><input type="number" id="${id}-aviso" min="1" max="120" value="${p.dias_aviso || ""}" placeholder="geral" /></div>
        <button type="button" class="secundario btn-salvar-periodo" data-tipo="${s.tipo}">Salvar</button>
      </div>
      <p class="sem-dado nota-pequena">Deixe a periodicidade em branco para "pendente de definição" (sem data prevista nem alerta). Aviso em branco usa a antecedência geral da Adega. Última alteração: ${cipEsc(p.atualizado_por_nome || "—")}, ${cipFmtDataHora(p.atualizado_em)}.</p>
      ${base}
    </details>`;
}

function adegaBloco(s) {
  const ehAdmin = ADEGA_PERFIL.role === "administrador";
  const p = s.proc;
  return `
    <article class="proc-adega cartao-procedimento st-${s.status}" data-tipo="${s.tipo}">
      <div class="proc-topo">
        <div>
          <h3 class="proc-nome">${cipEsc(cipRotuloTipo(s.tipo))}</h3>
          <div class="proc-periodo">${p.periodo_quantidade ? `Periodicidade: ${cipEsc(cipTextoPeriodicidade(p))}` : '<span class="pendente-definicao">Periodicidade: a definir pelo supervisor</span>'}</div>
        </div>
        ${cipSeloStatus(s)}
      </div>
      <p class="proc-descricao">${cipEsc(ADEGA_DESCRICAO[s.tipo] || "")}</p>
      <div class="proc-datas">
        <div class="campo-dado"><span>Último CIP</span><span class="valor">${adegaUltimoTexto(s)}</span></div>
        <div class="campo-dado"><span>Próxima data prevista</span><span class="valor proxima-prevista">${s.proxima ? cipFmtData(s.proxima) : "—"}</span><span class="sem-dado nota-pequena">${cipTextoPrazo(s)}</span></div>
      </div>
      <div class="proc-rodape">
        <span class="sem-dado nota-pequena">${s.totalRegistros} registro(s)</span>
        <a class="botao-link primario" href="${cipLinkFormularioAdega(s.tipo)}">Registrar CIP</a>
      </div>
      ${ehAdmin ? adegaBlocoAdmin(s) : ""}
      <div class="erro-base"></div>
    </article>`;
}

function adegaRenderizar(dados) {
  document.getElementById("adega-descricao").textContent =
    "Controle geral da Adega (sem separar Adega A, B e D). A próxima data é calculada a partir do último registro válido de cada procedimento; abrir esta tela não conta como execução.";
  document.getElementById("grid-adegas").innerHTML = dados.situacoes.map(adegaBloco).join("") || '<p class="sem-dado">Nenhum procedimento cadastrado.</p>';
  document.getElementById("legenda-status").innerHTML = ["vencido", "hoje", "proximo", "realizado", "emdia", "semhistorico", "pendente"]
    .map((st) => `<span class="selo-status st-${st}">${CIP_ROTULO_STATUS[st]}</span>`).join("");
  document.getElementById("nota-status").textContent =
    `"Próximo do vencimento": faltam até ${dados.diasAviso} dia(s) para a data prevista (ou a antecedência definida no procedimento). "Realizado": último registro feito dentro desse mesmo prazo. Quando as duas situações se aplicam (períodos curtos), vale a mais próxima.`;

  const regs = [...dados.registros].sort((a, b) => b.data_cip.localeCompare(a.data_cip) || String(b.criado_em).localeCompare(String(a.criado_em)));
  document.getElementById("lista-historico-adega").innerHTML = regs.map((r) => `
    <div class="item-registro">
      <span class="tipo-marca" style="background:${CIP_CORES_TIPO[r.tipo_cip] || "#888"}"></span>
      <div class="dados"><div class="linha-principal">${cipEsc(cipRotuloTipo(r.tipo_cip))} — ${r.tipo_cip === "osam" ? cipRotuloEquipHtml(r) : cipEsc(r.equipamento)}</div><div class="linha-secundaria">Operador: ${cipEsc(r.nome_operador)}</div></div>
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

function adegaErro(botao, m) {
  botao.closest(".proc-adega").querySelector(".erro-base").innerHTML = `<div class="mensagem-erro" style="margin-top:8px;">${cipEsc(m)}</div>`;
}

function ligarAcoesAdmin() {
  document.querySelectorAll(".btn-salvar-periodo").forEach((b) => b.addEventListener("click", async () => {
    const t = b.dataset.tipo;
    const qtdTxt = document.getElementById(`ctl-${t}-qtd`).value;
    const un = document.getElementById(`ctl-${t}-un`).value || null;
    const avisoTxt = document.getElementById(`ctl-${t}-aviso`).value;
    const qtd = qtdTxt === "" ? null : Number(qtdTxt);
    const aviso = avisoTxt === "" ? null : Number(avisoTxt);
    if ((qtd === null) !== (un === null)) return adegaErro(b, 'Informe a periodicidade e a unidade, ou deixe as duas em branco para "pendente de definição".');
    if (qtd !== null && (!Number.isInteger(qtd) || qtd < 1 || qtd > 3650)) return adegaErro(b, "Periodicidade: número inteiro de 1 a 3650.");
    if (aviso !== null && (!Number.isInteger(aviso) || aviso < 1 || aviso > 120)) return adegaErro(b, "Aviso: número inteiro de 1 a 120 dias, ou em branco.");
    b.disabled = true;
    const { error } = await supabaseClient.rpc("definir_periodicidade_adega", { p_tipo_cip: t, p_quantidade: qtd, p_unidade: un, p_dias_aviso: aviso });
    b.disabled = false;
    if (error) return adegaErro(b, cipMensagemErro(error, ""));
    adegaRecarregar("Periodicidade salva.");
  }));
  document.querySelectorAll(".btn-salvar-base").forEach((b) => b.addEventListener("click", async () => {
    const valor = document.getElementById(`ctl-${b.dataset.tipo}-base`).value;
    if (!valor) return adegaErro(b, "Informe a data do último CIP realizado.");
    if (valor > cipHoje()) return adegaErro(b, "A data-base não pode ser futura — use a data em que o último CIP foi de fato realizado.");
    b.disabled = true;
    const { error } = await supabaseClient.rpc("definir_data_base_adega_geral", { p_tipo_cip: b.dataset.tipo, p_data_base: valor });
    b.disabled = false;
    if (error) return adegaErro(b, cipMensagemErro(error, ""));
    adegaRecarregar("Data-base salva.");
  }));
  document.querySelectorAll(".btn-remover-base").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    const { error } = await supabaseClient.rpc("remover_data_base_adega_geral", { p_tipo_cip: b.dataset.tipo });
    b.disabled = false;
    if (error) return adegaErro(b, cipMensagemErro(error, ""));
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
