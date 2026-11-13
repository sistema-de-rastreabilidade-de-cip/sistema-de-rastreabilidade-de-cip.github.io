// =====================================================================
// Gestão (v8.1, supervisor): operadores, parâmetros e backup.
// Toda gravação passa por funções do banco que conferem o perfil
// (cadastrar_operador, alterar_status_operador, definir_exigencia_operador,
// definir_alerta_espera, cip_criar_backup, cip_verificar_backup...).
// =====================================================================

let GESTAO_PERFIL = null;

function gMensagem(tipo, texto) {
  const classe = tipo === "erro" ? "mensagem-erro" : "mensagem-sucesso";
  document.getElementById("mensagem").innerHTML = texto ? `<div class="${classe}">${cipEsc(texto)}</div>` : "";
}
function gErro(id, texto) {
  document.getElementById(id).innerHTML = texto ? `<div class="mensagem-erro" style="margin-top:8px;">${cipEsc(texto)}</div>` : "";
}

// ---------------- Operadores ----------------
async function gCarregarOperadores() {
  const [ops, regs] = await Promise.all([
    supabaseClient.from("cip_operadores").select("id, nome, ativo, criado_em, criado_por_nome, atualizado_em, atualizado_por_nome").order("ativo", { ascending: false }).order("nome"),
    supabaseClient.from("cip_registros").select("nome_operador, operador_id").limit(10000),
  ]);
  if (ops.error || regs.error) {
    document.getElementById("corpo-operadores").innerHTML = `<tr><td colspan="5"><div class="mensagem-erro">${cipEsc(cipMensagemErro(ops.error || regs.error, "Não foi possível carregar os operadores: "))}</div></td></tr>`;
    return;
  }
  const lista = ops.data || [];
  const porChave = new Map(lista.map((o) => [cipChaveNome(o.nome), o]));
  const contagem = {};
  const naoCadastrados = {};
  (regs.data || []).forEach((r) => {
    const op = porChave.get(cipChaveNome(r.nome_operador));
    if (op) contagem[op.id] = (contagem[op.id] || 0) + 1;
    else naoCadastrados[cipNormalizarNome(r.nome_operador)] = (naoCadastrados[cipNormalizarNome(r.nome_operador)] || 0) + 1;
  });
  document.getElementById("corpo-operadores").innerHTML = lista.map((o) => `
    <tr data-operador="${cipEsc(o.nome)}">
      <td data-label="Nome" class="col-texto"><strong>${cipEsc(o.nome)}</strong></td>
      <td data-label="Situação">${o.ativo ? '<span class="selo-ativo">Ativo</span>' : '<span class="selo-inativo">Inativo</span>'}</td>
      <td data-label="Cadastrado">${cipFmtDataHora(o.criado_em)} por ${cipEsc(o.criado_por_nome)}${o.atualizado_em ? `<br><span class="sem-dado">${o.ativo ? "reativado" : "desativado"} em ${cipFmtDataHora(o.atualizado_em)} por ${cipEsc(o.atualizado_por_nome)}</span>` : ""}</td>
      <td data-label="Registros">${contagem[o.id] || 0}</td>
      <td><button type="button" class="secundario btn-status-operador" data-id="${o.id}" data-ativo="${o.ativo ? "0" : "1"}">${o.ativo ? "Desativar" : "Reativar"}</button></td>
    </tr>`).join("") || '<tr><td colspan="5" class="col-texto">Nenhum operador cadastrado ainda. Enquanto a lista estiver vazia, o formulário mantém o campo de nome livre.</td></tr>';
  document.querySelectorAll(".btn-status-operador").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    const { error } = await supabaseClient.rpc("alterar_status_operador", { p_operador_id: b.dataset.id, p_ativo: b.dataset.ativo === "1" });
    if (error) { b.disabled = false; gErro("erro-operador", cipMensagemErro(error, "")); return; }
    gMensagem("sucesso", b.dataset.ativo === "1" ? "Operador reativado." : "Operador desativado — ele não aparece mais na lista do formulário.");
    gCarregarOperadores();
  }));

  // Sugestões: nomes já usados nos registros que ainda não estão cadastrados.
  const sug = Object.entries(naoCadastrados).filter(([n]) => cipNomeValido(n)).sort((a, b) => b[1] - a[1]);
  document.getElementById("sugestoes-operadores").innerHTML = sug.length
    ? `<p class="sem-dado" style="margin:4px 0 0;">Nomes que já aparecem nos registros e ainda não estão cadastrados — confira a grafia antes de cadastrar:</p>
       <div class="sugestoes-operadores">${sug.map(([n, q]) => `<button type="button" class="chip-operador btn-sugestao" data-nome="${cipEsc(n)}">${cipEsc(n)}<strong>${q}</strong></button>`).join("")}</div>`
    : "";
  document.querySelectorAll(".btn-sugestao").forEach((b) => b.addEventListener("click", () => {
    document.getElementById("novo-operador").value = b.dataset.nome;
    document.getElementById("novo-operador").focus();
  }));
}

async function gCadastrarOperador() {
  gErro("erro-operador", "");
  const campo = document.getElementById("novo-operador");
  const nome = cipNormalizarNome(campo.value);
  if (!nome) return gErro("erro-operador", "Informe o nome do operador.");
  if (!cipNomeValido(nome)) return gErro("erro-operador", "Nome inválido: " + CIP_MSG_NOME_INVALIDO);
  if ((CIP_OPERADORES || []).some((o) => cipChaveNome(o.nome) === cipChaveNome(nome))) {
    return gErro("erro-operador", "Já existe um operador com este nome (ativo ou inativo). Reative o cadastro existente.");
  }
  const btn = document.getElementById("btn-cadastrar-operador");
  btn.disabled = true;
  const { error } = await supabaseClient.rpc("cadastrar_operador", { p_nome: nome });
  btn.disabled = false;
  if (error) return gErro("erro-operador", cipMensagemErro(error, ""));
  campo.value = "";
  gMensagem("sucesso", `Operador "${nome}" cadastrado.`);
  await cipCarregarOperadores();
  gCarregarOperadores();
}

// ---------------- Parâmetros ----------------
function gRenderizarParametros() {
  const exigir = !!CIP_CONFIG.exigir_operador_cadastrado;
  document.getElementById("estado-exigencia").textContent = exigir ? "obrigatória (só nomes da lista)" : "opcional (permite digitar outro nome)";
  document.getElementById("btn-alternar-exigencia").textContent = exigir ? "Tornar opcional" : "Tornar obrigatória";
  document.getElementById("cfg-alerta-horas").value = CIP_CONFIG.alerta_espera_horas || "";
}
async function gAlternarExigencia() {
  gErro("erro-exigencia", "");
  const nova = !CIP_CONFIG.exigir_operador_cadastrado;
  const { error } = await supabaseClient.rpc("definir_exigencia_operador", { p_exigir: nova });
  if (error) return gErro("erro-exigencia", cipMensagemErro(error, ""));
  await cipCarregarConfiguracao();
  gRenderizarParametros();
  gMensagem("sucesso", nova ? "Lista de operadores agora é obrigatória." : "Lista de operadores agora é opcional.");
}
async function gSalvarAlerta(remover) {
  gErro("erro-alerta", "");
  let horas = null;
  if (!remover) {
    horas = Number(document.getElementById("cfg-alerta-horas").value);
    if (!Number.isInteger(horas) || horas < 1 || horas > 720) return gErro("erro-alerta", "Informe um número inteiro de horas entre 1 e 720, ou use \"Remover limite\".");
  }
  const { error } = await supabaseClient.rpc("definir_alerta_espera", { p_horas: horas });
  if (error) return gErro("erro-alerta", cipMensagemErro(error, ""));
  await cipCarregarConfiguracao();
  gRenderizarParametros();
  gMensagem("sucesso", horas ? `Limite de alerta definido: ${horas} h.` : "Limite de alerta removido.");
}

// ---------------- Backup ----------------
function gTamanho(bytes) { return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`; }
async function gCarregarBackups() {
  const { data, error } = await supabaseClient.rpc("cip_listar_backups");
  const corpo = document.getElementById("corpo-backups");
  if (error) { corpo.innerHTML = `<tr><td colspan="6"><div class="mensagem-erro">${cipEsc(cipMensagemErro(error, "Não foi possível listar os backups: "))}</div></td></tr>`; return; }
  corpo.innerHTML = (data || []).map((b) => `
    <tr data-backup="${b.id}">
      <td data-label="Nº">${b.id}</td>
      <td data-label="Gerado em">${cipFmtDataHora(b.criado_em)}</td>
      <td data-label="Por" class="col-texto">${cipEsc(b.criado_por_nome)}</td>
      <td data-label="Registros">${b.contagens ? b.contagens.cip_registros : "—"} <span class="sem-dado">(${gTamanho(b.tamanho_bytes)})</span></td>
      <td data-label="Código de verificação" class="col-texto"><span class="caixa-codigo">${cipEsc(String(b.checksum_total).slice(0, 16))}…</span></td>
      <td><div class="linha-acoes">
        <button type="button" class="secundario btn-verificar-backup" data-id="${b.id}">Verificar</button>
        <button type="button" class="secundario btn-baixar-backup" data-id="${b.id}">Baixar arquivo</button>
      </div></td>
    </tr>`).join("") || '<tr><td colspan="6" class="col-texto">Nenhum backup gerado ainda.</td></tr>';
  document.querySelectorAll(".btn-verificar-backup").forEach((b) => b.addEventListener("click", () => gVerificarBackup(Number(b.dataset.id), b)));
  document.querySelectorAll(".btn-baixar-backup").forEach((b) => b.addEventListener("click", () => gBaixarBackup(Number(b.dataset.id), b)));
}
async function gCriarBackup() {
  const btn = document.getElementById("btn-criar-backup");
  btn.disabled = true; btn.textContent = "Gerando...";
  const { data, error } = await supabaseClient.rpc("cip_criar_backup");
  btn.disabled = false; btn.textContent = "Gerar backup agora";
  const el = document.getElementById("resultado-backup");
  if (error) { el.innerHTML = `<div class="mensagem-erro" style="margin-top:8px;">${cipEsc(cipMensagemErro(error, "Não foi possível gerar o backup: "))}</div>`; return; }
  const c = data.contagens || {};
  el.innerHTML = `<div class="mensagem-sucesso" style="margin-top:8px;">Backup nº ${data.id} gerado em ${cipFmtDataHora(data.gerado_em)}: ${c.cip_registros} registros, ${c.cip_avaliacoes} avaliações, ${c.cip_avaliacoes_historico} eventos de avaliação, ${c.cip_edicoes} edições, ${c.cip_observacoes} observações, ${c.cip_operadores} operadores, ${c.adega_datas_base} eventos de data-base da Adega.<br>Código de verificação: <span class="caixa-codigo" id="checksum-backup">${cipEsc(data.checksum_total)}</span></div>`;
  gCarregarBackups();
  const selTipo = document.getElementById("faixa-tipo");
  selTipo.innerHTML = Object.keys(FORM_CONFIG).map((t) => `<option value="${t}">${cipEsc(cipRotuloTipo(t))}</option>`).join("");
  selTipo.addEventListener("change", gRenderizarFaixas);
  gCarregarFaixas();
}
async function gVerificarBackup(id, btn) {
  btn.disabled = true;
  const { data, error } = await supabaseClient.rpc("cip_verificar_backup", { p_id: id });
  btn.disabled = false;
  const el = document.getElementById("detalhe-backup");
  if (error) { el.innerHTML = `<div class="mensagem-erro" style="margin-top:8px;">${cipEsc(cipMensagemErro(error, ""))}</div>`; return; }
  const v = data.validacao || {};
  if (!v.valido) {
    el.innerHTML = `<div class="mensagem-erro" style="margin-top:8px;" id="resultado-verificacao" data-valido="false"><strong>Backup nº ${id} com problema de integridade:</strong><ul>${(v.erros || []).map((e) => `<li>${cipEsc(e)}</li>`).join("")}</ul></div>`;
    return;
  }
  const t = (data.comparacao && data.comparacao.tabelas) || {};
  const nomes = { cip_registros: "Registros", cip_edicoes: "Edições", cip_observacoes: "Observações", cip_avaliacoes: "Avaliações", cip_avaliacoes_historico: "Histórico de avaliações", cip_operadores: "Operadores", cip_operadores_historico: "Histórico de operadores", adega_datas_base: "Datas-base da Adega", adega_procedimentos: "Procedimentos da Adega", perfis: "Perfis", cip_configuracao: "Configuração" };
  el.innerHTML = `<div class="mensagem-sucesso" style="margin-top:8px;" id="resultado-verificacao" data-valido="true"><strong>Backup nº ${id} íntegro</strong> (códigos de verificação conferidos). Comparação com os dados atuais — simulação, nada foi gravado:</div>
    <table class="tabela-simples tabela-historico"><thead><tr><th>Tabela</th><th>No backup</th><th>Iguais hoje</th><th>Faltando hoje</th><th>Alteradas depois</th></tr></thead><tbody>
    ${Object.keys(nomes).filter((k) => t[k]).map((k) => `<tr><td data-label="Tabela" class="col-texto">${nomes[k]}</td><td data-label="No backup">${t[k].no_arquivo}</td><td data-label="Iguais hoje">${t[k].iguais}</td><td data-label="Faltando hoje">${t[k].novos}</td><td data-label="Alteradas depois">${t[k].divergentes}</td></tr>`).join("")}
    </tbody></table>
    <p class="sem-dado">"Alteradas depois" é esperado para linhas que mudaram legitimamente após o backup (ex.: avaliação corrigida). Uma recuperação nunca as sobrescreve.</p>`;
}
async function gBaixarBackup(id, btn) {
  btn.disabled = true;
  const { data, error } = await supabaseClient.rpc("cip_obter_backup", { p_id: id });
  btn.disabled = false;
  if (error) { gMensagem("erro", cipMensagemErro(error, "Não foi possível obter o backup: ")); return; }
  cipBaixarArquivo(`backup-cip_${id}_${cipCarimboArquivo()}.json`, JSON.stringify(data), "application/json");
  gMensagem("sucesso", `Arquivo do backup nº ${id} preparado para download. Guarde-o fora do sistema; o código de verificação dentro do arquivo é conferido na recuperação.`);
}

// ---------------- Início ----------------
// ---- v10: faixas aceitáveis dos parâmetros ----
let G_FAIXAS = [];
function gNumeroOuNulo(txt) {
  const t = String(txt || "").trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}
async function gCarregarFaixas() {
  const { data, error } = await supabaseClient.from("cip_parametros_faixas").select("*");
  if (error) { gErro("erro-faixa", cipMensagemErro(error, "Não foi possível carregar as faixas")); return; }
  G_FAIXAS = data || [];
  gRenderizarFaixas();
}
function gRenderizarFaixas() {
  const tipo = document.getElementById("faixa-tipo").value;
  const campos = (FORM_CONFIG[tipo] && FORM_CONFIG[tipo].campos || []).filter((c) => c.tipo !== "hora" && c.tipo !== "opcoes");
  const ativas = G_FAIXAS.filter((f) => f.tipo_cip === tipo && f.ativo).length;
  document.getElementById("faixa-resumo").textContent = ativas
    ? `${ativas} parâmetro(s) com comparação ativa neste tipo.`
    : "Nenhuma faixa cadastrada neste tipo: comparação desligada.";
  document.getElementById("corpo-faixas").innerHTML = campos.map((c) => {
    const f = G_FAIXAS.find((x) => x.tipo_cip === tipo && x.campo === c.key);
    const v = (n) => (n === null || n === undefined ? "" : String(n).replace(".", ","));
    return `<tr data-campo="${c.key}">
      <td data-rotulo="Parâmetro">${cipEsc(c.label)}${f ? `<div class="sem-dado nota-pequena">Por ${cipEsc(f.atualizado_por_nome)}, ${cipFmtDataHora(f.atualizado_em)}</div>` : ""}</td>
      <td data-rotulo="Mínimo"><input type="text" inputmode="decimal" class="faixa-min" value="${v(f && f.minimo)}" placeholder="—" aria-label="Mínimo de ${cipEsc(c.label)}" /></td>
      <td data-rotulo="Máximo"><input type="text" inputmode="decimal" class="faixa-max" value="${v(f && f.maximo)}" placeholder="—" aria-label="Máximo de ${cipEsc(c.label)}" /></td>
      <td data-rotulo="Unidade"><input type="text" class="faixa-un" maxlength="20" value="${cipEsc((f && f.unidade) || "")}" placeholder="ex.: %" aria-label="Unidade de ${cipEsc(c.label)}" /></td>
      <td data-rotulo="Comparar"><input type="checkbox" class="faixa-ativo" ${!f || f.ativo ? "checked" : ""} aria-label="Comparar ${cipEsc(c.label)}" /></td>
      <td><button type="button" class="secundario btn-salvar-faixa">Salvar</button></td>
    </tr>`;
  }).join("") || '<tr><td colspan="6" class="sem-dado">Este formulário não tem parâmetros numéricos.</td></tr>';
  document.querySelectorAll(".btn-salvar-faixa").forEach((b) => b.addEventListener("click", () => gSalvarFaixa(b)));
}
async function gSalvarFaixa(botao) {
  const tr = botao.closest("tr");
  const tipo = document.getElementById("faixa-tipo").value;
  const min = gNumeroOuNulo(tr.querySelector(".faixa-min").value);
  const max = gNumeroOuNulo(tr.querySelector(".faixa-max").value);
  document.getElementById("erro-faixa").innerHTML = "";
  if (Number.isNaN(min) || Number.isNaN(max)) return gErro("erro-faixa", "Use apenas números nos limites (vírgula ou ponto como decimal).");
  if (min === null && max === null) return gErro("erro-faixa", "Informe ao menos o limite mínimo ou o máximo.");
  if (min !== null && max !== null && min > max) return gErro("erro-faixa", "O limite mínimo não pode ser maior que o máximo.");
  botao.disabled = true;
  const { error } = await supabaseClient.rpc("definir_faixa_parametro", {
    p_tipo_cip: tipo, p_campo: tr.dataset.campo, p_minimo: min, p_maximo: max,
    p_unidade: tr.querySelector(".faixa-un").value.trim() || null, p_ativo: tr.querySelector(".faixa-ativo").checked,
  });
  botao.disabled = false;
  if (error) return gErro("erro-faixa", cipMensagemErro(error, "Não foi possível salvar a faixa"));
  gMensagem("sucesso", "Faixa salva. Ela vale para os próximos registros e edições deste tipo de CIP.");
  gCarregarFaixas();
}

async function iniciarGestao() {
  const resultado = await exigirSessao();
  if (!resultado) return;
  GESTAO_PERFIL = resultado.perfil;
  document.getElementById("info-usuario").textContent =
    `${GESTAO_PERFIL.nome} (${GESTAO_PERFIL.role === "administrador" ? "Administrador" : "Operador"})`;
  cipInicializarPagina(GESTAO_PERFIL);
  if (GESTAO_PERFIL.role !== "administrador") {
    document.querySelector("main.conteudo").innerHTML = '<div class="tela-erro"><h1>Acesso restrito</h1><p>Esta área é exclusiva do supervisor/administrador.</p><a href="painel.html">Voltar ao painel</a></div>';
    return;
  }
  document.getElementById("btn-cadastrar-operador").addEventListener("click", gCadastrarOperador);
  document.getElementById("novo-operador").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); gCadastrarOperador(); } });
  document.getElementById("btn-alternar-exigencia").addEventListener("click", gAlternarExigencia);
  document.getElementById("btn-salvar-alerta").addEventListener("click", () => gSalvarAlerta(false));
  document.getElementById("btn-remover-alerta").addEventListener("click", () => gSalvarAlerta(true));
  document.getElementById("btn-criar-backup").addEventListener("click", gCriarBackup);
  await Promise.all([cipCarregarConfiguracao(), cipCarregarOperadores()]);
  gRenderizarParametros();
  gCarregarOperadores();
  gCarregarBackups();
  const selTipo = document.getElementById("faixa-tipo");
  selTipo.innerHTML = Object.keys(FORM_CONFIG).map((t) => `<option value="${t}">${cipEsc(cipRotuloTipo(t))}</option>`).join("");
  selTipo.addEventListener("change", gRenderizarFaixas);
  gCarregarFaixas();
}

iniciarGestao();
