// Testes de tela da v8.1 (Playwright): operadores, parâmetros, filas com
// tempo, resumo do supervisor, relatórios (CSV/cópia/impressão), backup e os
// cinco formulários. Site real de docs/ + banco Postgres LOCAL. Nada de produção.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const PORTA = process.env.PORTA_WEB || "8787";
const BASE = `http://127.0.0.1:${PORTA}/`;
const DIR = __dirname;
const SHOTS = path.join(DIR, "capturas");
fs.mkdirSync(SHOTS, { recursive: true });
const FAKE_SB = fs.readFileSync(path.join(DIR, "fake_supabase.js"), "utf8");
const FAKE_CHART = fs.readFileSync(path.join(DIR, "fake_chart.js"), "utf8");
let ok = 0, falhas = 0;
const errosConsole = [];
const verificar = (c, n, x) => { if (c) { ok++; console.log("ok   - " + n); } else { falhas++; console.log("FAIL - " + n + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
async function sql(q) {
  const j = await (await fetch(BASE + "__teste/sql", { method: "POST", body: JSON.stringify({ sql: q }) })).json();
  if (j.error) throw new Error(j.error.message);
  return j.data;
}
async function contexto(browser, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1366, height: 900 }, timezoneId: "Europe/Lisbon", acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.route("**/*", (route) => {
    const u = route.request().url();
    if (u.includes("supabase-js")) return route.fulfill({ contentType: "application/javascript", body: FAKE_SB });
    if (u.includes("chart.js") || u.includes("chart.umd")) return route.fulfill({ contentType: "application/javascript", body: FAKE_CHART });
    if (u.startsWith(BASE)) return route.continue();
    if (u.includes("fonts.g")) return route.fulfill({ contentType: "text/css", body: "" });
    return route.abort();
  });
  return ctx;
}
async function abrir(ctx, url) {
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errosConsole.push(`${url}: ${m.text()}`); });
  page.on("pageerror", (e) => errosConsole.push(`${url}: ${e.message}`));
  page.on("dialog", (d) => { errosConsole.push(`${url}: diálogo: ${d.message()}`); d.dismiss(); });
  await page.goto(BASE + url); await page.waitForLoadState("networkidle");
  return page;
}
async function login(ctx, email) {
  const p = await abrir(ctx, "index.html");
  await p.fill("#email", email); await p.fill("#senha", "teste123"); await p.click("#btn-entrar");
  await p.waitForURL("**/painel.html"); await p.waitForLoadState("networkidle");
  return p;
}
const hoje = (p) => p.evaluate(() => cipHoje());
async function preencherBasico(p, tipo, operador) {
  await p.fill("#data_cip", await hoje(p));
  if (await p.$("#equipamento")) {
    const tag = await p.$eval("#equipamento", (e) => e.tagName);
    if (tag === "SELECT") await p.selectOption("#equipamento", { index: 1 });
  }
  await p.fill("#hora_inicial", "09:00");
  if (await p.$("#hora_final")) await p.fill("#hora_final", "09:30");
  if (await p.$("#nome_operador_lista")) await p.selectOption("#nome_operador_lista", operador);
  else await p.fill("#nome_operador", operador);
}

(async () => {
  const browser = await chromium.launch();
  // Registros de teste com horários de gravação distintos (para tempos de espera).
  await sql(`update cip_registros set criado_em = now() - (interval '1 hour' * (substr(id::text, 25)::int * 7)) where id::text like '10000000-%';`);

  // ============ Gestão: operadores e parâmetros (supervisor) ============
  const cAd = await contexto(browser);
  let a = await login(cAd, "admin.teste@local");
  verificar(await a.isVisible('a[href="gestao.html"]') && await a.isVisible('a[href="relatorios.html"]'), "supervisor vê os links Relatórios e Gestão");
  a = await abrir(cAd, "gestao.html");
  await a.waitForSelector("#sugestoes-operadores .btn-sugestao");
  const sugestoes = await a.$$eval(".btn-sugestao", (bs) => bs.map((b) => b.dataset.nome));
  verificar(sugestoes.includes("Operador Fictício A"), "sugere nomes já usados nos registros", sugestoes);
  await a.click('.btn-sugestao[data-nome="Operador Fictício A"]');
  verificar((await a.inputValue("#novo-operador")) === "Operador Fictício A", "clicar na sugestão preenche o nome");
  await a.click("#btn-cadastrar-operador");
  await a.waitForSelector('tr[data-operador="Operador Fictício A"]');
  verificar(true, "operador cadastrado a partir da sugestão");
  await a.fill("#novo-operador", "  Ana    Lima "); await a.click("#btn-cadastrar-operador");
  await a.waitForSelector('tr[data-operador="Ana Lima"]');
  verificar(true, "nome com espaços extras é padronizado (Ana Lima)");
  await a.fill("#novo-operador", "ANA LÍMA"); await a.click("#btn-cadastrar-operador");
  verificar((await a.textContent("#erro-operador")).includes("Já existe"), "duplicado (maiúsculas/acento) recusado");
  await a.fill("#novo-operador", "12"); await a.click("#btn-cadastrar-operador");
  verificar((await a.textContent("#erro-operador")).includes("inválido"), "nome inválido recusado");
  await a.fill("#novo-operador", "Bruno Reis"); await a.click("#btn-cadastrar-operador");
  await a.waitForSelector('tr[data-operador="Bruno Reis"]');
  await a.click('tr[data-operador="Bruno Reis"] .btn-status-operador');
  await a.waitForFunction(() => document.querySelector('tr[data-operador="Bruno Reis"]').textContent.includes("Inativo"));
  verificar(true, "operador desativado (continua na lista, como inativo)");
  verificar((await sql("select count(*)::int from cip_operadores_historico;")) === 4, "histórico do cadastro registra cada ação (3 cadastros + 1 desativação)");
  verificar((await a.textContent("#estado-exigencia")).includes("opcional"), "lista obrigatória começa desligada");
  await a.fill("#cfg-alerta-horas", "0"); await a.click("#btn-salvar-alerta");
  verificar((await a.textContent("#erro-alerta")).includes("entre 1 e 720"), "limite de alerta inválido recusado");
  await a.fill("#cfg-alerta-horas", "48"); await a.click("#btn-salvar-alerta");
  await a.waitForFunction(() => document.getElementById("mensagem").textContent.includes("48 h"));
  verificar((await sql("select alerta_espera_horas from cip_configuracao;")) === 48, "limite de alerta de 48 h gravado");
  await a.screenshot({ path: path.join(SHOTS, "gestao-1366.png"), fullPage: true });

  // ============ Operador: lista no formulário ============
  const cOp = await contexto(browser);
  let p = await login(cOp, "operador.teste@local");
  verificar(!(await p.isVisible('a[href="gestao.html"]')), "operador não vê o link Gestão");
  p = await abrir(cOp, "registro.html?tipo=completo");
  const opcoes = await p.$$eval("#nome_operador_lista option", (os) => os.map((o) => o.value));
  verificar(opcoes.includes("Ana Lima") && opcoes.includes("Operador Fictício A") && !opcoes.includes("Bruno Reis"), "formulário lista só operadores ativos", opcoes);
  verificar(opcoes.includes("__outro__"), "com a lista opcional, permite 'Outro nome'");
  await preencherBasico(p, "completo", "__outro__");
  await p.fill("#nome_operador", "J0ão");
  await p.click("#btn-salvar");
  verificar((await p.textContent("#mensagem")).includes("inválido"), "outro nome inválido recusado na tela");
  await p.fill("#nome_operador", "  Carlos   Mendes ");
  await p.click("#btn-salvar"); await p.waitForURL("**/painel.html");
  verificar((await sql("select count(*)::int from cip_registros where nome_operador='Carlos Mendes' and operador_id is null;")) === 1, "outro nome gravado padronizado, sem vínculo de cadastro");
  p = await abrir(cOp, "registro.html?tipo=completo");
  await preencherBasico(p, "completo", "Ana Lima");
  await p.click("#btn-salvar"); await p.waitForURL("**/painel.html");
  verificar((await sql("select count(*)::int from cip_registros r join cip_operadores o on o.id=r.operador_id where o.nome='Ana Lima';")) === 1, "registro com operador da lista fica vinculado ao cadastro");
  // Edição de registro antigo: nome registrado aparece mesmo fora da lista
  p = await abrir(cOp, "registro.html?tipo=completo&id=10000000-0000-0000-0000-000000000004");
  await p.waitForSelector("#nome_operador_lista");
  verificar((await p.$eval("#nome_operador_lista", (s) => s.options[s.selectedIndex].text)).includes("(nome registrado)"), "edição mostra o nome original mesmo fora da lista");

  // Lista obrigatória
  a = await abrir(cAd, "gestao.html");
  await a.click("#btn-alternar-exigencia");
  await a.waitForFunction(() => document.getElementById("estado-exigencia").textContent.includes("obrigatória"));
  verificar(true, "supervisor torna a lista obrigatória");
  p = await abrir(cOp, "registro.html?tipo=completo");
  verificar(!(await p.$$eval("#nome_operador_lista option", (os) => os.map((o) => o.value))).includes("__outro__"), "com a lista obrigatória não há 'Outro nome'");
  a = await abrir(cAd, "gestao.html");
  await a.click("#btn-alternar-exigencia");
  await a.waitForFunction(() => document.getElementById("estado-exigencia").textContent.includes("opcional"));

  // ============ Os cinco formulários ============
  const tipos = ["alcalino_clorado", "completo", "tanque_levedura", "linha_recuperacao_levedura", "osam"];
  const antes = await sql("select count(*)::int from cip_registros;");
  for (const tipo of tipos) {
    p = await abrir(cOp, `registro.html?tipo=${tipo}`);
    await preencherBasico(p, tipo, "Ana Lima");
    await p.click("#btn-salvar");
    await p.waitForURL(/\/(painel|adega)\.html/, { timeout: 5000 }).catch(() => {});
    verificar(/(painel|adega)\.html$/.test(p.url()), `formulário ${tipo} grava o registro`, await p.textContent("#mensagem").catch(() => "")); // v10: OSAN volta para a Adega
  }
  verificar((await sql("select count(*)::int from cip_registros;")) === antes + 5, "5 registros novos, um por tipo");
  verificar((await sql("select count(*)::int from cip_registros where tipo_cip='osam' and bbt='BBT 01';")) === 1, "OSAM continua com BBT da lista fixa");

  // ============ Painel: filas com tempo e resumo ============
  a = await abrir(cAd, "painel.html");
  await a.waitForFunction(() => /\d/.test((document.getElementById("resumo-avaliacoes-periodo") || {}).textContent || ""));
  const totalAg = await sql("select count(*)::int from vw_cip_registros where situacao_avaliacao='aguardando';");
  verificar(Number(await a.textContent("#resumo-aguardando")) === totalAg, "resumo mostra a quantidade aguardando avaliação");
  verificar((await a.textContent("#resumo-mais-antigo")).includes("mais antigo há 7 d"), "resumo identifica o mais antigo (registrado há ~7 dias)", await a.textContent("#resumo-mais-antigo"));
  const primeiro = await a.$eval("#fila-aguardando .item-fila", (e) => e.textContent.replace(/\s+/g, " "));
  verificar(primeiro.includes("Mais antigo") && primeiro.includes("Aguardando avaliação há 7 d"), "fila começa pelo mais antigo, com o tempo de espera", primeiro.slice(0, 200));
  verificar(primeiro.includes("Registrado há"), "fila mostra o tempo desde o registro");
  verificar((await a.locator("#fila-aguardando .selo-acima-limite").count()) >= 1, "registros acima do limite de 48 h destacados");
  verificar(Number(await a.textContent("#resumo-acima-limite")) === await sql("select count(*)::int from cip_registros where criado_em < now() - interval '48 hours';"), "resumo conta os registros acima do limite");
  await a.selectOption("#fila-ordem", "recente");
  const primeiroRecente = await a.$eval("#fila-aguardando .item-fila", (e) => e.textContent);
  verificar(!primeiroRecente.includes("há 7 d"), "ordenação 'mais recente primeiro' inverte a fila");
  await a.selectOption("#fila-status", "revisao");
  verificar(!(await a.isVisible(".fila-aguardando")) && await a.isVisible(".fila-revisao"), "filtro de status mostra só a fila de revisão");
  await a.selectOption("#fila-status", "todas");
  await a.selectOption("#fila-ordem", "antigo");
  await a.screenshot({ path: path.join(SHOTS, "painel-supervisor-1366.png"), fullPage: true });
  // Avaliar 1 e conferir "avaliações no período" + mediana
  await a.click("#fila-aguardando .item-fila a.botao-link >> nth=0");
  await a.waitForSelector("#btn-salvar-avaliacao");
  const idAval = new URL(a.url()).searchParams.get("registroId");
  await a.check('input[name="av-situacao"][value="contaminado"]');
  await a.fill("#av-observacao", "=SOMA(1) resíduo no cone do tanque");
  await a.click("#btn-salvar-avaliacao"); await a.waitForSelector(".mensagem-sucesso");
  await a.fill("#nova-observacao", "@cmd verificar laudo do laboratório"); await a.click("#btn-salvar-observacao");
  await a.waitForFunction(() => (document.querySelector(".lista-observacoes") || {}).textContent);
  a = await abrir(cAd, "painel.html");
  await a.waitForFunction(() => document.getElementById("resumo-avaliacoes-periodo").textContent === "1");
  const mediana = await a.textContent("#resumo-avaliacoes-detalhe");
  verificar(/Tempo mediano até a 1ª avaliação: \d+ d/.test(mediana), "resumo mostra o tempo mediano até a 1ª avaliação", mediana);

  // ============ Relatórios ============
  a = await abrir(cAd, "relatorios.html");
  verificar((await a.$$eval("#r-operador option", (os) => os.map((o) => o.value))).includes("Ana Lima"), "filtro de operador lista os nomes");
  await a.click("#btn-gerar-relatorio"); await a.waitForSelector("#rel-total");
  verificar(Number(await a.textContent("#rel-total")) === await sql("select count(*)::int from cip_registros;"), "relatório sem filtro traz todos os registros");
  await a.selectOption("#r-status", "contaminado"); await a.click("#btn-gerar-relatorio");
  await a.waitForFunction(() => document.getElementById("rel-total").textContent === "1");
  verificar((await a.textContent("#area-relatorio")).includes("Justificativa de contaminação"), "relatório mostra a justificativa de contaminação");
  verificar((await a.textContent("#area-relatorio")).includes("verificar laudo do laboratório"), "relatório inclui observações administrativas");
  await a.selectOption("#r-status", ""); await a.selectOption("#r-operador", "Ana Lima"); await a.click("#btn-gerar-relatorio");
  await a.waitForFunction(() => document.getElementById("rel-total").textContent === "6");
  verificar(true, "filtro por operador (Ana Lima: 6 registros)");
  await a.selectOption("#r-operador", ""); await a.selectOption("#r-tipo", "osam"); await a.click("#btn-gerar-relatorio");
  await a.waitForFunction(() => document.getElementById("rel-total").textContent === "1");
  verificar(true, "filtro por tipo (CIP OSAM)");
  await a.selectOption("#r-tipo", ""); await a.fill("#r-equipamento", "Tanque de Fermentação 02"); await a.click("#btn-gerar-relatorio");
  await a.waitForSelector("#rel-total");
  verificar(Number(await a.textContent("#rel-total")) === await sql("select count(*)::int from cip_registros where equipamento ilike '%Tanque de Fermentação 02%';"), "filtro por equipamento");
  const totalGeral = await sql("select count(*)::int from cip_registros;");
  await a.fill("#r-equipamento", ""); await a.click("#btn-gerar-relatorio");
  await a.waitForFunction((n) => document.getElementById("rel-total").textContent === String(n), totalGeral);
  await a.waitForFunction(() => !document.getElementById("btn-csv-registros").disabled);
  const [dl] = await Promise.all([a.waitForEvent("download"), a.click("#btn-csv-registros")]);
  const csv = fs.readFileSync(await dl.path(), "utf8");
  const linhas = csv.replace(/^﻿/, "").split("\r\n");
  verificar(csv.charCodeAt(0) === 0xfeff, "CSV com BOM UTF-8 (acentos corretos no Excel)");
  verificar(linhas[0].startsWith("ID do registro;Data do CIP;") && linhas.length - 1 === await sql("select count(*)::int from cip_registros;"), "CSV de registros: cabeçalho e uma linha por registro");
  const shaCsv = crypto.createHash("sha256").update(csv.replace(/^﻿/, "")).digest("hex");
  verificar(shaCsv === (await a.textContent("#rel-sha-registros")).trim(), "SHA-256 mostrado confere com o arquivo baixado");
  verificar(csv.includes("'=SOMA(1)") && !csv.includes(";=SOMA"), "CSV protegido contra fórmulas (=, @)");
  verificar(csv.includes("Conc. Inicial") || csv.includes("Concentração") || linhas[0].split(";").length > 19, "CSV inclui as colunas do procedimento");
  const [dl2] = await Promise.all([a.waitForEvent("download"), a.click("#btn-csv-historico")]);
  const hist = fs.readFileSync(await dl2.path(), "utf8");
  verificar(hist.includes("Alteração do registro") && hist.includes("Tanque marcado incorretamente"), "CSV de histórico inclui alterações com justificativa");
  verificar(hist.includes("Avaliação;") && hist.includes("Observação administrativa"), "CSV de histórico inclui avaliações e observações");
  await a.click("#btn-copiar-tabela");
  const copiado = await a.evaluate(() => navigator.clipboard.readText());
  verificar(copiado.startsWith("ID do registro\tData do CIP"), "cópia para o Excel (colunas separadas por tabulação)");
  await a.evaluate(() => { window.print = () => { window.__impresso = true; }; });
  await a.click("#btn-imprimir");
  verificar(await a.evaluate(() => window.__impresso === true), "botão de impressão/PDF aciona a impressão");
  await a.emulateMedia({ media: "print" });
  verificar(!(await a.isVisible("header.topo")) && !(await a.isVisible("#btn-gerar-relatorio")), "na impressão, só o relatório aparece");
  await a.pdf({ path: path.join(SHOTS, "relatorio-exemplo.pdf"), format: "A4", printBackground: true });
  await a.emulateMedia({ media: "screen" });
  verificar(fs.statSync(path.join(SHOTS, "relatorio-exemplo.pdf")).size > 5000, "PDF do relatório gerado pela impressão do navegador");
  await a.screenshot({ path: path.join(SHOTS, "relatorios-1366.png") });

  // ============ Backup ============
  a = await abrir(cAd, "gestao.html");
  await a.click("#btn-criar-backup");
  await a.waitForSelector("#checksum-backup");
  const shaTela = (await a.textContent("#checksum-backup")).trim();
  const shaBanco = await sql("select to_jsonb(checksum_total) from cip_backup.snapshots order by id desc limit 1;");
  verificar(shaTela === shaBanco, "backup gerado: código de verificação igual ao gravado no banco");
  await a.waitForSelector('tr[data-backup] .btn-verificar-backup');
  await a.click('tr[data-backup] .btn-verificar-backup >> nth=0');
  await a.waitForSelector("#resultado-verificacao");
  verificar((await a.getAttribute("#resultado-verificacao", "data-valido")) === "true", "verificação do backup aprova a integridade");
  const [dl3] = await Promise.all([a.waitForEvent("download"), a.click('tr[data-backup] .btn-baixar-backup >> nth=0')]);
  const arq = JSON.parse(fs.readFileSync(await dl3.path(), "utf8"));
  verificar(arq.formato === "cip-backup" && arq.versao === 1 && arq.checksum_total === shaBanco, "arquivo baixado tem formato, versão e código de verificação");
  verificar(arq.tabelas.cip_registros.length === await sql("select count(*)::int from cip_registros;") && arq.tabelas.cip_avaliacoes_historico.length === 1, "arquivo contém registros e históricos");
  fs.writeFileSync(path.join(process.env.PGTESTE_DIR || "/var/lib/postgresql/cipteste", "backup_baixado_ui.json"), JSON.stringify(arq));
  await a.screenshot({ path: path.join(SHOTS, "gestao-backup-1366.png"), fullPage: true });

  // ============ Acesso do operador às áreas do supervisor ============
  for (const url of ["gestao.html", "relatorios.html"]) {
    p = await abrir(cOp, url);
    verificar((await p.textContent("main")).includes("Acesso restrito"), `operador não acessa ${url}`);
  }
  const negado = await p.evaluate(async () => (await supabaseClient.rpc("cip_criar_backup")).error);
  verificar(negado && negado.code === "42501", "operador chamando a função de backup direto é recusado pelo banco");
  const negado2 = await p.evaluate(async () => (await supabaseClient.rpc("cadastrar_operador", { p_nome: "Invasor Teste" })).error);
  verificar(negado2 && negado2.code === "42501", "operador chamando cadastrar_operador direto é recusado pelo banco");

  // ============ Responsividade ============
  for (const w of [1366, 1024, 768, 390]) {
    const vp = { width: w, height: w > 500 ? 900 : 844 };
    const ca = await contexto(browser, vp);
    const pa = await login(ca, "admin.teste@local");
    for (const [url, nome] of [["painel.html", "painel-supervisor"], ["gestao.html", "gestao"], ["relatorios.html", "relatorios"]]) {
      await pa.goto(BASE + url); await pa.waitForLoadState("networkidle");
      if (url === "relatorios.html") { await pa.click("#btn-gerar-relatorio"); await pa.waitForSelector("#rel-total"); }
      await pa.waitForTimeout(200);
      verificar(await pa.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${nome} sem rolagem horizontal em ${w}px`);
      await pa.screenshot({ path: path.join(SHOTS, `${nome}-${w}.png`), fullPage: true });
    }
    const co = await contexto(browser, vp);
    const po = await login(co, "operador.teste@local");
    await po.goto(BASE + "registro.html?tipo=completo"); await po.waitForLoadState("networkidle");
    verificar(await po.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `formulário com lista de operadores sem rolagem horizontal em ${w}px`);
    await po.screenshot({ path: path.join(SHOTS, `registro-operador-${w}.png`), fullPage: true });
    await ca.close(); await co.close();
  }

  verificar(errosConsole.length === 0, "nenhum erro no console", errosConsole.slice(0, 8));
  console.log(`\nResultado: ${ok} ok, ${falhas} falha(s)`);
  await browser.close();
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
