// Testes de tela da v8 (Playwright) — site real de docs/ servido localmente,
// banco Postgres LOCAL com as migrações reais. Nenhum acesso à produção.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const BASE = "http://127.0.0.1:8787/";
const DIR = __dirname;
const SHOTS = path.join(DIR, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const FAKE_SB = fs.readFileSync(path.join(DIR, "fake_supabase.js"), "utf8");
const FAKE_CHART = fs.readFileSync(path.join(DIR, "fake_chart.js"), "utf8");

let ok = 0, falhas = 0;
const errosConsole = [];
function verificar(cond, nome, extra) {
  if (cond) { ok++; console.log("ok   - " + nome); }
  else { falhas++; console.log("FAIL - " + nome + (extra !== undefined ? " :: " + JSON.stringify(extra) : "")); }
}
async function sql(q) {
  const r = await fetch(BASE + "__teste/sql", { method: "POST", body: JSON.stringify({ sql: q }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.data;
}

async function novoContexto(browser, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1366, height: 900 }, timezoneId: "Asia/Tokyo" });
  await ctx.route("**/*", (route) => {
    const u = route.request().url();
    if (u.includes("supabase-js")) return route.fulfill({ contentType: "application/javascript", body: FAKE_SB });
    if (u.includes("chart.js") || u.includes("chart.umd")) return route.fulfill({ contentType: "application/javascript", body: FAKE_CHART });
    if (u.startsWith(BASE)) return route.continue();
    if (u.includes("fonts.g")) return route.fulfill({ contentType: "text/css", body: "" });
    return route.abort(); // inclusive *.supabase.co: produção nunca é acessada
  });
  return ctx;
}
async function abrir(ctx, url) {
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errosConsole.push(`${url}: ${m.text()}`); });
  page.on("pageerror", (e) => errosConsole.push(`${url}: ${e.message}`));
  page.on("dialog", (d) => { errosConsole.push(`${url}: diálogo inesperado: ${d.message()}`); d.dismiss(); });
  await page.goto(BASE + url);
  await page.waitForLoadState("networkidle");
  return page;
}
async function login(ctx, email) {
  const page = await abrir(ctx, "index.html");
  await page.fill("#email", email);
  await page.fill("#senha", "teste123");
  await page.click("#btn-entrar");
  await page.waitForURL("**/painel.html");
  await page.waitForLoadState("networkidle");
  return page;
}
async function semRolagemHorizontal(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

(async () => {
  const browser = await chromium.launch();
  const R1 = "10000000-0000-0000-0000-000000000001";
  const R5 = "10000000-0000-0000-0000-000000000005";
  const R9 = "10000000-0000-0000-0000-000000000009";
  const total0 = (await sql("select count(*)::int from cip_registros;"));

  // ================= OPERADOR =================
  const ctxOp = await novoContexto(browser);
  let p = await login(ctxOp, "operador.teste@local");
  // v10: a Adega passa a ser controlada no modo geral (coberta em test_v10_ui.js);
  // os trechos da Adega por adega só valem para o site anterior.
  const ADEGA_V10 = await p.evaluate(() => typeof FORM_CONFIG !== "undefined" && !!FORM_CONFIG.alcalino);
  if (!ADEGA_V10) {
  await p.waitForSelector(".modal-alerta", { timeout: 5000 }).catch(() => {});
  verificar(await p.isVisible(".modal-alerta"), "operador: alerta da Adega aparece ao entrar");
  verificar((await p.textContent(".modal-corpo")).includes("CIP Completo — Adega A"), "alerta lista CIP Completo — Adega A (vencido)");
  await p.click("#btn-fechar-modal-adega");
  verificar(!(await p.isVisible(".modal-alerta")), "alerta fecha");
  verificar(await p.isVisible(".faixa-alerta-adega"), "faixa de alerta da Adega continua visível");
  }
  const esperadoForms = ADEGA_V10 ? 6 : (await p.evaluate(() => typeof FORM_CONFIG !== "undefined" && !!FORM_CONFIG.filtracao_bmf)) ? 7 : 5; // v9: +2 de Filtração; v10: OSAN e Alcalino só na Adega
  const textoCartoes = await p.textContent("#op-cartoes-formularios");
  verificar((await p.locator("#op-cartoes-formularios .cartao-formulario").count()) === esperadoForms && (ADEGA_V10 ? !/OSA[MN]/.test(textoCartoes) : /OSA[MN]/.test(textoCartoes)), `${esperadoForms} formulários no Painel (${ADEGA_V10 ? "OSAN só pela Adega" : "inclui CIP OSAN"})`);
  verificar(!(await p.isVisible('a.link-nav[href="contaminados.html"], a.link-nav[href="rastreabilidade.html"]')), "operador não vê o link de CIPs contaminados");
  await p.reload(); await p.waitForLoadState("networkidle");
  verificar(!(await p.isVisible(".modal-alerta")), "alerta não reaparece na mesma sessão de login");
  await p.screenshot({ path: path.join(SHOTS, "operador-painel-1366.png"), fullPage: true });

  // Cadastro CIP Completo
  p = await abrir(ctxOp, "registro.html?tipo=completo");
  await p.fill("#data_cip", await p.evaluate(() => cipHoje()));
  await p.selectOption("#equipamento", { label: "Tanque de Fermentação 05" });
  await p.fill("#hora_inicial", "10:00");
  await p.fill("#nome_operador", "Operador Teste UI");
  await p.click("#btn-salvar");
  verificar((await p.$eval("#hora_final", (e) => e.validity.valueMissing)) && p.url().includes("registro.html"), "hora final obrigatória no cadastro (validação do navegador)");
  await p.evaluate(() => document.getElementById("hora_final").removeAttribute("required"));
  await p.evaluate(() => document.getElementById("form-cip").requestSubmit());
  verificar((await p.textContent("#mensagem")).includes("Hora Final"), "hora final obrigatória também na validação do script");
  await p.fill("#hora_final", "10:40");
  const amanha = await p.evaluate(() => { const d = cipAgora(); d.setDate(d.getDate() + 1); return cipChaveData(d); });
  await p.evaluate((v) => { document.getElementById("data_cip").value = v; }, amanha);
  await p.click("#btn-salvar");
  verificar((await p.$eval("#data_cip", (e) => e.validity.rangeOverflow)) && p.url().includes("registro.html"), "data futura bloqueada pelo limite do campo");
  await p.evaluate(() => document.getElementById("data_cip").removeAttribute("max"));
  await p.evaluate(() => document.getElementById("form-cip").requestSubmit());
  verificar((await p.textContent("#mensagem")).includes("não pode ser futura"), "data futura recusada também na validação do script");
  await p.fill("#data_cip", await p.evaluate(() => cipHoje()));
  await p.click("#btn-salvar");
  await p.waitForURL("**/painel.html");
  verificar((await sql("select count(*)::int from cip_registros where nome_operador='Operador Teste UI';")) === 1, "CIP Completo gravado no banco");

  // Cadastro OSAM
  p = await abrir(ctxOp, "registro.html?tipo=osam");
  const opcoesBbt = await p.$$eval("#equipamento option", (os) => os.map((o) => o.value).filter(Boolean));
  verificar(opcoesBbt.length === 12 && opcoesBbt[0] === "BBT 01" && opcoesBbt[11] === "BBT 12", "OSAM: seletor fixo BBT 01 a BBT 12", opcoesBbt);
  verificar((await p.locator("#equipamento").evaluate((e) => e.tagName)) === "SELECT", "OSAM: BBT sem digitação manual");
  const qtdCamposOsam = await p.locator("#campos-dados .campo").count();
  verificar(qtdCamposOsam === 22, "OSAM: 22 campos de processo do CIP Completo", qtdCamposOsam);
  verificar(!(await p.locator("#campos-dados").textContent()).toLowerCase().includes("temperatura"), "OSAM: nenhum campo de temperatura acrescentado");
  await p.fill("#data_cip", await p.evaluate(() => cipHoje()));
  await p.fill("#hora_inicial", "11:00"); await p.fill("#hora_final", "11:45");
  await p.fill("#nome_operador", "Operador Teste UI");
  await p.fill("#campo_conc_inicial_soda", "1,8%");
  await p.click("#btn-salvar");
  verificar((await p.textContent("#mensagem")).includes("Selecione o BBT"), "OSAM sem BBT recusado na tela");
  await p.selectOption("#equipamento", "BBT 07");
  await p.screenshot({ path: path.join(SHOTS, "registro-osam-1366.png"), fullPage: true });
  await p.click("#btn-salvar");
  await p.waitForURL(/\/(painel|adega)\.html/); // v10: OSAN volta para a aba Adega
  const osam = await sql("select json_build_object('bbt',bbt,'equip',equipamento,'soda',dados->>'conc_inicial_soda')::jsonb from cip_registros where tipo_cip='osam';");
  verificar(osam && osam.bbt === "BBT 07" && osam.equip === "BBT 07" && osam.soda === "1,8%", "OSAM gravado com BBT 07 e campos do Completo", osam);

  // Adega pelo operador
  if (!ADEGA_V10) {
  p = await abrir(ctxOp, "adega.html");
  const stA = await p.getAttribute('.proc-adega[data-adega="Adega A"][data-tipo="completo"] .selo-status', "data-status");
  verificar(stA === "vencido", "Adega A / Completo aparece como vencido", stA);
  const stA2 = await p.getAttribute('.proc-adega[data-adega="Adega A"][data-tipo="alcalino_clorado"] .selo-status', "data-status");
  verificar(stA2 === "realizado", "Adega A / Alcalino Clorado aparece como realizado", stA2);
  verificar((await p.getAttribute('.proc-adega[data-adega="Adega B"][data-tipo="completo"] .selo-status', "data-status")) === "semhistorico", "Adega B / Completo sem histórico");
  await p.screenshot({ path: path.join(SHOTS, "adega-operador-1366.png"), fullPage: true });
  await p.click('.proc-adega[data-adega="Adega A"][data-tipo="completo"] a.botao-link');
  await p.waitForLoadState("networkidle");
  verificar((await p.$eval("#equipamento", (e) => e.value)) === "Adega A", "formulário aberto pela Adega já vem com Adega A");
  await p.fill("#data_cip", await p.evaluate(() => cipHoje()));
  await p.fill("#hora_inicial", "06:00"); await p.fill("#hora_final", "07:00");
  await p.fill("#nome_operador", "Operador Teste UI");
  await p.click("#btn-salvar");
  await p.waitForURL("**/adega.html");
  await p.waitForLoadState("networkidle");
  verificar((await p.getAttribute('.proc-adega[data-adega="Adega A"][data-tipo="completo"] .selo-status', "data-status")) === "realizado", "após registrar, Adega A / Completo fica realizado");
  verificar((await p.locator(".faixa-alerta-adega").count()) === 0, "faixa some quando não há mais pendência");
  }

  // Histórico: correção do histórico de alterações (criado_em)
  p = await abrir(ctxOp, `historico.html?registroId=${R1}`);
  await p.waitForSelector(".detalhe-registro");
  const edicoesR1 = await p.locator(".detalhe-registro .lista-edicoes").first().locator(":scope > li").count();
  verificar(edicoesR1 === 2, "histórico de alterações volta a aparecer (2 edições existentes)", edicoesR1);
  verificar(!(await p.isVisible("#btn-salvar-avaliacao")), "operador não vê o formulário de avaliação");

  // ================= ADMINISTRADOR =================
  const ctxAd = await novoContexto(browser);
  let a = await login(ctxAd, "admin.teste@local");
  verificar(!(await p.isVisible(".modal-alerta")) && (await a.locator(".modal-alerta").count()) === 0, "administrador não recebe o alerta modal");
  verificar(await a.isVisible('a.link-nav[href="contaminados.html"], a.link-nav[href="rastreabilidade.html"]'), "administrador vê o link de CIPs contaminados");
  const ordem = await a.evaluate(() => ["secao-operadores", "secao-avaliacao-admin", "grafico-a"].map((id) => document.getElementById(id).getBoundingClientRect().top));
  verificar(ordem[0] < ordem[1] && ordem[1] < ordem[2], "ordem do painel: operador → avaliação → demais gráficos", ordem);
  const graf = JSON.parse(await a.getAttribute("#grafico-operadores", "data-grafico"));
  verificar(graf.labels.length >= 3 && graf.valores[0][0] >= graf.valores[0][graf.valores[0].length - 1], "gráfico por operador ordenado do maior para o menor", graf);
  const totalReg = await sql("select count(*)::int from cip_registros;");
  verificar(Number(await a.textContent("#akpi-aguardando")) === totalReg, "cartão Aguardando = total de registros (nenhum avaliado ainda)");
  verificar((await a.locator("#fila-aguardando .item-fila:not(.oculto)").count()) === 5 && (await a.isVisible("#fila-aguardando .botao-ver-mais")), "fila mostra 5 e oferece 'ver mais'");
  await a.screenshot({ path: path.join(SHOTS, "admin-painel-1366.png"), fullPage: true });
  await a.screenshot({ path: path.join(SHOTS, "admin-painel-dobra-1366.png") });

  // Avaliar via fila
  await a.click("#fila-aguardando .item-fila a.botao-link >> nth=0");
  await a.waitForSelector("#btn-salvar-avaliacao");
  const idAvaliado = new URL(a.url()).searchParams.get("registroId");
  await a.check('input[name="av-situacao"][value="contaminado"]');
  await a.click("#btn-salvar-avaliacao");
  verificar((await a.textContent("#erro-avaliacao")).includes("Descrição da ocorrência"), "Contaminado sem descrição recusado na tela");
  await a.fill("#av-observacao", "Presença de resíduo no cone após o enxágue");
  await a.click("#btn-salvar-avaliacao");
  await a.waitForSelector(".mensagem-sucesso");
  verificar((await a.getAttribute(".detalhe-registro .selo-avaliacao", "data-avaliacao")) === "contaminado", "avaliação salva como Contaminado");
  await a.waitForSelector("#lista-hist-avaliacao li");
  verificar((await a.textContent("#lista-hist-avaliacao")).includes("Aguardando avaliação → Contaminado"), "histórico de avaliações registra a decisão");
  await a.reload(); await a.waitForSelector(".detalhe-registro .selo-avaliacao");
  verificar((await a.getAttribute(".detalhe-registro .selo-avaliacao", "data-avaliacao")) === "contaminado", "avaliação persiste depois de atualizar a página");
  await a.click("#btn-salvar-avaliacao");
  verificar((await a.textContent("#erro-avaliacao")).includes("já está como Contaminado"), "mesma classificação sem revisão é recusada");

  // Concorrência na tela: duas abas do supervisor
  const a2 = await abrir(ctxAd, `historico.html?registroId=${R5}`);
  const a3 = await abrir(ctxAd, `historico.html?registroId=${R5}`);
  await a2.waitForSelector("#btn-salvar-avaliacao"); await a3.waitForSelector("#btn-salvar-avaliacao");
  await a2.check('input[name="av-situacao"][value="conforme"]');
  await a2.click("#btn-salvar-avaliacao"); await a2.waitForSelector(".mensagem-sucesso");
  await a3.check('input[name="av-situacao"][value="contaminado"]');
  await a3.fill("#av-observacao", "Texto digitado na segunda aba para teste");
  await a3.click("#btn-salvar-avaliacao");
  await a3.waitForSelector("#erro-avaliacao .mensagem-erro");
  verificar((await a3.textContent("#erro-avaliacao")).includes("alterada por outra pessoa"), "segunda aba recebe aviso de conflito (sem sobrescrever)");
  verificar((await a3.inputValue("#av-observacao")) === "Texto digitado na segunda aba para teste", "texto digitado é mantido após o erro");
  verificar((await sql(`select count(*)::int from cip_avaliacoes_historico where registro_id='${R5}';`)) === 1, "banco tem um único evento para o registro disputado");
  await a2.close(); await a3.close();

  // Observação administrativa
  await a.fill("#nova-observacao", "Verificar a pressão registrada neste CIP");
  await a.click("#btn-salvar-observacao");
  await a.waitForFunction(() => document.querySelector(".lista-observacoes") && document.querySelector(".lista-observacoes").textContent.includes("Verificar a pressão"));
  verificar((await a.textContent(".lista-observacoes")).includes("Administração (teste)"), "observação gravada com o autor da conta logada");

  // Revisão necessária: operador edita um registro avaliado
  const idEdit = idAvaliado;
  const tipoEdit = await sql(`select to_jsonb(tipo_cip) from cip_registros where id='${idEdit}';`);
  p = await abrir(ctxOp, `registro.html?tipo=${tipoEdit}&id=${idEdit}`);
  await p.waitForSelector("#nome_operador");
  await p.fill("#nome_operador", "Operador Fictício Z");
  await p.fill("#nome_quem_edita", "Pessoa da Edição");
  await p.fill("#justificativa", "corrigir erro");
  await p.click("#btn-salvar");
  verificar((await p.textContent("#mensagem")).includes("genérica"), "justificativa genérica recusada na edição");
  await p.fill("#justificativa", "Nome do operador estava trocado");
  await p.click("#btn-salvar");
  await p.waitForURL("**/historico.html?registroId=*");
  await p.waitForSelector(".detalhe-registro");
  verificar(await p.isVisible(".detalhe-registro .selo-revisao"), "após a edição aparece 'Revisão necessária'");
  verificar((await p.getAttribute(".detalhe-registro .selo-avaliacao", "data-avaliacao")) === "contaminado", "a classificação anterior é mantida");
  verificar((await p.textContent(".diff-edicao")).includes("Operador Fictício Z"), "histórico de alterações mostra o campo alterado");

  a = await abrir(ctxAd, "painel.html");
  verificar((await a.textContent("#akpi-revisao")) === "1", "cartão Revisão necessária = 1");
  verificar((await a.locator("#fila-revisao .item-fila").count()) === 1, "fila de revisão com 1 registro");
  await a.click("#fila-revisao a.botao-link");
  await a.waitForSelector("#aviso-revisao");
  verificar((await a.textContent('label.op-contaminado')).includes("Manter Contaminado"), "opção 'Manter Contaminado (confirmar)' na reavaliação");
  await a.click("#btn-salvar-avaliacao");
  verificar((await a.textContent("#erro-avaliacao")).includes("Justificativa"), "confirmação após revisão exige justificativa");
  await a.fill("#av-observacao", "Conferi a alteração do nome; resultado mantido");
  await a.click("#btn-salvar-avaliacao");
  await a.waitForSelector(".mensagem-sucesso");
  verificar(!(await a.isVisible(".detalhe-registro .selo-revisao")), "revisão desligada após a confirmação");
  await a.waitForFunction(() => document.querySelectorAll("#lista-hist-avaliacao li").length === 2);
  verificar((await a.textContent("#lista-hist-avaliacao")).includes("Confirmação após revisão necessária"), "histórico preserva os dois eventos (avaliação + confirmação)");

  // Contaminados: geral e filtrado
  a = await abrir(ctxAd, "contaminados.html");
  verificar((await a.textContent("#total-contaminados")) === "1", "consulta geral de contaminados = 1");
  verificar((await a.getAttribute(".faixa-consulta", "data-modo")) === "geral", "modo geral identificado");
  a = await abrir(ctxAd, "painel.html");
  await a.selectOption("#dash-filtro-tipo", "osam");
  await a.click("#dash-btn-filtrar"); await a.waitForLoadState("networkidle");
  await a.click("#card-contaminado"); await a.waitForURL("**/contaminados.html?*"); await a.waitForLoadState("networkidle");
  verificar((await a.getAttribute(".faixa-consulta", "data-modo")) === "filtrado", "card Contaminado abre a consulta filtrada");
  verificar((await a.textContent("#total-contaminados")) === "0", "filtro do painel (só OSAM) aplicado na lista de contaminados");
  await a.screenshot({ path: path.join(SHOTS, "contaminados-1366.png"), fullPage: true });

  // Histórico com filtros de avaliação vindos do card
  a = await abrir(ctxAd, "painel.html");
  await a.click("#card-conforme"); await a.waitForURL("**/historico.html?*"); await a.waitForLoadState("networkidle");
  verificar((await a.locator("#corpo-tabela tr").count()) === 1 && (await a.$eval("#f-avaliacao", (e) => e.value)) === "conforme", "card Conforme abre o histórico filtrado");
  await a.selectOption("#f-avaliacao", ""); await a.selectOption("#f-bbt", "BBT 07");
  await a.click("#btn-filtrar");
  await a.waitForFunction(() => document.querySelectorAll("#corpo-tabela tr").length === 1 && document.querySelector("#corpo-tabela").textContent.includes("BBT"), null, { timeout: 5000 }).catch(() => {});
  verificar((await a.locator("#corpo-tabela tr").count()) === 1 && (await a.textContent("#corpo-tabela")).includes("BBT"), "filtro por BBT encontra o CIP OSAM");

  // Registros de um operador
  a = await abrir(ctxAd, "painel.html");
  await a.click("#lista-operadores .chip-operador >> nth=0");
  await a.waitForURL("**/operador.html?*"); await a.waitForLoadState("networkidle");
  const nomeOp = new URL(a.url()).searchParams.get("nome");
  const qtdOp = await sql(`select count(*)::int from cip_registros where nome_operador=${"'" + nomeOp.replace(/'/g, "''") + "'"};`);
  verificar((await a.locator("#corpo-tabela-operador tr").count()) === qtdOp, "tela do operador lista todos os CIPs dele", { nomeOp, qtdOp });
  await a.click("#link-voltar-grafico"); await a.waitForURL("**/painel.html*");

  // Adega pelo administrador
  if (!ADEGA_V10) {
  a = await abrir(ctxAd, "adega.html");
  verificar(await a.isVisible("#secao-config-adega"), "administrador vê a configuração da Adega");
  const sel = '.proc-adega[data-adega="Adega B"][data-tipo="completo"]';
  const ha370 = await a.evaluate(() => { const d = cipAgora(); d.setDate(d.getDate() - 370); return cipChaveData(d); });
  await a.fill(`${sel} input[type=date]`, ha370);
  await a.click(`${sel} .btn-salvar-base`);
  await a.waitForSelector(".mensagem-sucesso");
  verificar((await a.getAttribute(`${sel} .selo-status`, "data-status")) === "vencido", "data-base de 370 dias deixa Adega B / Completo vencido");
  verificar((await a.locator(".faixa-alerta-adega").count()) === 1, "faixa volta a aparecer para o administrador");
  await a.screenshot({ path: path.join(SHOTS, "adega-admin-1366.png"), fullPage: true });
  await a.click(`${sel} .btn-remover-base`);
  await a.waitForFunction((s) => document.querySelector(s + " .selo-status").dataset.status === "semhistorico", sel);
  verificar(true, "remover data-base volta a 'sem histórico'");
  const selA = '.proc-adega[data-adega="Adega A"][data-tipo="completo"]';
  verificar((await a.locator(`${selA} input[type=date]`).count()) === 0, "com registro, a data-base não é oferecida");
  await a.fill("#cfg-dias-aviso", "0"); await a.click("#btn-salvar-dias-aviso");
  verificar((await a.textContent("#erro-config-adega")).includes("entre 1 e 120"), "antecedência inválida recusada");
  await a.fill("#cfg-dias-aviso", "45"); await a.click("#btn-salvar-dias-aviso");
  await a.waitForFunction(() => document.getElementById("nota-status").textContent.includes("45 dia"), null, { timeout: 5000 }).catch(() => {});
  verificar((await a.textContent("#nota-status")).includes("45 dia"), "antecedência salva (45 dias)");
  await a.fill("#cfg-dias-aviso", "30"); await a.click("#btn-salvar-dias-aviso");
  await a.waitForFunction(() => document.getElementById("nota-status").textContent.includes("30 dia"), null, { timeout: 5000 });
  }

  // Operador não acessa contaminados
  p = await abrir(ctxOp, "contaminados.html");
  verificar((await p.textContent("main")).includes("Acesso restrito"), "operador não acessa a tela de contaminados");

  // ================= RESPONSIVIDADE =================
  for (const w of [1366, 1024, 768, 390]) {
    const vp = { width: w, height: w > 500 ? 900 : 844 };
    const cOp = await novoContexto(browser, vp); const cAd = await novoContexto(browser, vp);
    const po = await login(cOp, "operador.teste@local");
    const pa = await login(cAd, "admin.teste@local");
    const telas = [
      [po, "painel.html", "operador-painel"], [pa, "painel.html", "admin-painel"],
      [pa, `historico.html?registroId=${idAvaliado}&foco=avaliacao`, "historico-detalhe"],
      [po, "adega.html", "adega"], [pa, "contaminados.html", "contaminados"],
      [po, "registro.html?tipo=osam", "registro-osam"], [pa, "historico.html", "historico-lista"],
    ];
    for (const [pg, url, nome] of telas) {
      await pg.goto(BASE + url); await pg.waitForLoadState("networkidle");
      await pg.waitForTimeout(150);
      verificar(await semRolagemHorizontal(pg), `${nome} sem rolagem horizontal em ${w}px`);
      await pg.screenshot({ path: path.join(SHOTS, `${nome}-${w}.png`), fullPage: true });
    }
    await cOp.close(); await cAd.close();
  }

  verificar((await sql("select count(*)::int from cip_registros;")) === total0 + (ADEGA_V10 ? 2 : 3), `total de registros = inicial + ${ADEGA_V10 ? 2 : 3} criados no teste`);
  verificar(errosConsole.length === 0, "nenhum erro no console", errosConsole.slice(0, 8));
  console.log(`\nResultado: ${ok} ok, ${falhas} falha(s)`);
  await browser.close();
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
