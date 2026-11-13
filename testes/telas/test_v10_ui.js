// Testes de tela da v10: Painel (nome novo, sem OSAN), Adega no modo geral
// (CIP Alcalino, Alcalino Clorado e OSAN), Adega A/B/D no formulário,
// faixas dos parâmetros (valores FICTÍCIOS, só neste banco local) e a aba
// Rastreabilidade de Contaminação. Site real de docs/ + Postgres LOCAL.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const PORTA = process.env.PORTA_WEB || "8787";
const BASE = `http://127.0.0.1:${PORTA}/`;
const DIR = __dirname;
const SHOTS = path.join(DIR, "capturas");
fs.mkdirSync(SHOTS, { recursive: true });
const FAKE_SB = fs.readFileSync(path.join(DIR, "fake_supabase.js"), "utf8");
const FAKE_CHART = fs.readFileSync(path.join(DIR, "fake_chart.js"), "utf8");
let ok = 0, falhas = 0;
const erros = [];
const v = (c, n, x) => { if (c) { ok++; console.log("ok   - " + n); } else { falhas++; console.log("FAIL - " + n + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
async function sql(q) {
  const j = await (await fetch(BASE + "__teste/sql", { method: "POST", body: JSON.stringify({ sql: q }) })).json();
  if (j.error) throw new Error(j.error.message);
  return j.data;
}
async function contexto(browser, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1366, height: 900 }, acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.route("**/*", (r) => {
    const u = r.request().url();
    if (u.includes("supabase-js")) return r.fulfill({ contentType: "application/javascript", body: FAKE_SB });
    if (u.includes("chart.js") || u.includes("chart.umd")) return r.fulfill({ contentType: "application/javascript", body: FAKE_CHART });
    if (u.startsWith(BASE)) return r.continue();
    if (u.includes("fonts.g")) return r.fulfill({ contentType: "text/css", body: "" });
    return r.abort();
  });
  return ctx;
}
async function abrir(ctx, url) {
  const p = await ctx.newPage();
  p.on("console", (m) => { if (m.type() === "error") erros.push(`${url}: ${m.text()}`); });
  p.on("pageerror", (e) => erros.push(`${url}: ${e.message}`));
  p.on("dialog", (d) => { erros.push(`${url}: diálogo ${d.message()}`); d.dismiss(); });
  await p.goto(BASE + url); await p.waitForLoadState("networkidle");
  return p;
}
async function login(ctx, email) {
  const p = await abrir(ctx, "index.html");
  await p.fill("#email", email); await p.fill("#senha", "teste123"); await p.click("#btn-entrar");
  await p.waitForURL("**/painel.html"); await p.waitForLoadState("networkidle");
  return p;
}
async function preencherBasico(p, opcoes = {}) {
  await p.fill("#data_cip", opcoes.data || await p.evaluate(() => cipHoje()));
  if (opcoes.equip) await p.selectOption("#equipamento", opcoes.equip);
  await p.fill("#hora_inicial", "07:00");
  if (await p.$("#hora_final")) await p.fill("#hora_final", "08:00");
  if (await p.$("#nome_operador_lista")) await p.selectOption("#nome_operador_lista", "__outro__");
  await p.fill("#nome_operador", opcoes.operador || "Operador Teste Dez");
}
const status = (p, tipo) => p.getAttribute(`.proc-adega[data-tipo="${tipo}"] .selo-status`, "data-status");
const semRolagem = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

(async () => {
  const browser = await chromium.launch();
  // Cenário fictício: um CIP Alcalino feito há 31 dias (vencido, periodicidade de 30 dias).
  await sql("insert into cip_registros (tipo_cip, equipamento, data_cip, hora_inicial, hora_final, nome_operador, dados) values ('alcalino','Adega B',current_date-31,'07:00','08:00','Operador Fictício C','{}'); select 1;");

  // ================= OPERADOR =================
  const cOp = await contexto(browser);
  let p = await login(cOp, "operador.teste@local");
  await p.waitForSelector(".modal-alerta", { timeout: 5000 }).catch(() => {});
  v(await p.isVisible(".modal-alerta"), "alerta da Adega aparece ao operador ao entrar");
  v((await p.textContent(".modal-corpo")).includes("CIP Alcalino") && (await p.textContent(".modal-corpo")).includes("a cada 30 dia(s)"), "alerta lista o CIP Alcalino vencido, com a periodicidade de 30 dias");
  await p.click("#btn-fechar-modal-adega");
  const cartoes = await p.$$eval("#op-cartoes-formularios .cartao-formulario h3", (hs) => hs.map((h) => h.textContent.trim()));
  v(cartoes.includes("CIP TFM/HORAP/Trasfega/DAW") && !cartoes.some((c) => /Completo/.test(c)), "Painel: 'CIP Completo' agora se chama 'CIP TFM/HORAP/Trasfega/DAW'", cartoes);
  v(!cartoes.some((c) => /OSA[MN]/.test(c)) && !cartoes.includes("CIP Alcalino"), "Painel: OSAN e CIP Alcalino não aparecem como formulários independentes", cartoes);
  v(cartoes.length === 6, "Painel: 6 formulários", cartoes.length);
  await p.screenshot({ path: path.join(SHOTS, "v10-painel-operador-1366.png"), fullPage: true });

  // Formulário TFM/HORAP/Trasfega/DAW
  p = await abrir(cOp, "registro.html?tipo=completo");
  v((await p.textContent("#titulo-formulario")).trim() === "CIP TFM/HORAP/Trasfega/DAW", "formulário com o nome novo");
  const opsCompleto = await p.$$eval("#equipamento option", (os) => os.map((o) => o.value).filter(Boolean));
  v(["Adega A", "Adega B", "Adega D"].every((a) => opsCompleto.includes(a)), "equipamentos incluem Adega A, Adega B e Adega D", opsCompleto.slice(-4));
  const baseAnterior = await p.evaluate(() => listaEquipamentosParaCampo("tfm_horap_trasfega").map(nomeExibicaoEquipamento));
  v(baseAnterior.every((e) => opsCompleto.includes(e)) && opsCompleto.length === baseAnterior.length + 3, "equipamentos atuais mantidos (lista anterior + 3 adegas)", [opsCompleto.length, baseAnterior.length]);
  v((await p.locator("#campos-dados .campo").count()) === 22, "os 22 campos do formulário continuam os mesmos");
  await preencherBasico(p, { equip: "Adega D" });
  await p.click("#btn-salvar"); await p.waitForURL("**/painel.html");
  v((await sql("select count(*)::int from cip_registros where tipo_cip='completo' and equipamento='Adega D';")) === 1, "CIP TFM/HORAP/Trasfega/DAW gravado na Adega D (banco aceita)");
  const opsAlcClor = await (await abrir(cOp, "registro.html?tipo=alcalino_clorado")).$$eval("#equipamento option", (os) => os.map((o) => o.value));
  v(!opsAlcClor.includes("Adega D"), "outros formulários não ganharam as adegas");

  // Aba Adega pelo operador
  p = await abrir(cOp, "adega.html");
  const ordem = await p.$$eval(".proc-adega", (els) => els.map((e) => e.dataset.tipo));
  v(JSON.stringify(ordem) === JSON.stringify(["alcalino", "alcalino_clorado", "osam"]), "Adega com os três procedimentos, na ordem pedida", ordem);
  v((await p.$$eval(".cartao-adega", (e) => e.length)) === 0 && !(await p.textContent("#grid-adegas")).includes("Nenhum procedimento"), "Adega no modo geral (sem cartões separados por adega)");
  v((await status(p, "alcalino")) === "vencido", "CIP Alcalino de 31 dias atrás aparece vencido (30 em 30 dias)", await status(p, "alcalino"));
  v((await status(p, "alcalino_clorado")) === "realizado", "Alcalino Clorado na Adega há 20 dias: realizado (6 em 6 meses)", await status(p, "alcalino_clorado"));
  v((await status(p, "osam")) === "pendente" && (await p.textContent('.proc-adega[data-tipo="osam"]')).includes("a definir pelo supervisor"), "OSAN: periodicidade pendente de definição (nada inventado)");
  v((await p.textContent('.proc-adega[data-tipo="alcalino_clorado"] .proc-periodo')).includes("a cada 6 mes(es)"), "Alcalino Clorado: a cada 6 meses");
  const proxAlc = await p.textContent('.proc-adega[data-tipo="alcalino"] .proxima-prevista');
  v(proxAlc.trim() === (await p.evaluate(() => { const d = cipAgora(); d.setDate(d.getDate() - 1); return cipFmtData(cipChaveData(d)); })), "próxima data do Alcalino = último registro + 30 dias", proxAlc);
  v(await p.isVisible(".faixa-alerta-adega"), "faixa de alerta da Adega visível");
  await p.screenshot({ path: path.join(SHOTS, "v10-adega-operador-1366.png"), fullPage: true });

  // Registrar CIP Alcalino pela aba Adega
  await p.click('.proc-adega[data-tipo="alcalino"] a.botao-link'); await p.waitForLoadState("networkidle");
  v(p.url().includes("tipo=alcalino") && p.url().includes("adega=1"), "botão abre o formulário do CIP Alcalino");
  const opsAlc = await p.$$eval("#equipamento option", (os) => os.map((o) => o.value).filter(Boolean));
  v(JSON.stringify(opsAlc) === JSON.stringify(["Adega A", "Adega B", "Adega D"]), "CIP Alcalino: equipamento = Adega A, B ou D", opsAlc);
  v((await p.locator("#campos-dados .campo").count()) === 22, "CIP Alcalino: mesmos 22 campos do CIP TFM/HORAP/Trasfega/DAW");
  v((await p.textContent("#aviso-adega")).includes("a cada 30 dia(s)"), "aviso de procedimento periódico com a periodicidade");
  await preencherBasico(p, { equip: "Adega A" });
  await p.click("#btn-salvar"); await p.waitForURL("**/adega.html"); await p.waitForLoadState("networkidle");
  v((await status(p, "alcalino")) === "realizado", "após registrar, CIP Alcalino fica realizado");
  v((await p.locator(".faixa-alerta-adega .faixa-alerta-adega, #faixa-alerta-adega .faixa-alerta-adega").count()) === 0, "faixa de alerta some sem pendência");

  // OSAN pela aba Adega
  await p.click('.proc-adega[data-tipo="osam"] a.botao-link'); await p.waitForLoadState("networkidle");
  const bbts = await p.$$eval("#equipamento option", (os) => os.map((o) => o.value).filter(Boolean));
  v(bbts.length === 12 && bbts[0] === "BBT 01" && bbts[11] === "BBT 12", "OSAN dentro da Adega com BBT 01 a BBT 12", bbts);
  await preencherBasico(p, { equip: "BBT 03" });
  await p.click("#btn-salvar"); await p.waitForURL("**/adega.html"); await p.waitForLoadState("networkidle");
  v((await p.textContent('.proc-adega[data-tipo="osam"]')).includes("BBT 03") && (await status(p, "osam")) === "pendente", "OSAN registrado mostra o BBT; continua sem alerta por falta de periodicidade");
  v((await p.textContent("#lista-historico-adega")).includes("CIP OSAN"), "histórico da Adega inclui o OSAN");
  v((await p.locator(".config-procedimento").count()) === 0, "operador não vê a configuração dos procedimentos");

  // ================= SUPERVISOR =================
  const cAd = await contexto(browser);
  let a = await login(cAd, "admin.teste@local");
  v(await a.isVisible('a.link-nav[href="rastreabilidade.html"]') && (await a.textContent('a.link-nav[href="rastreabilidade.html"]')).includes("Rastreabilidade de Contaminação"), "aba 'Rastreabilidade de Contaminação' no menu do supervisor");
  a = await abrir(cAd, "adega.html");
  v((await a.locator(".config-procedimento").count()) === 3, "supervisor configura cada procedimento");
  await a.click('.proc-adega[data-tipo="osam"] summary');
  await a.fill("#ctl-osam-qtd", "3"); await a.click('.proc-adega[data-tipo="osam"] .btn-salvar-periodo');
  v((await a.textContent('.proc-adega[data-tipo="osam"] .erro-base')).includes("unidade"), "periodicidade sem unidade recusada na tela");
  await a.selectOption("#ctl-osam-un", "meses"); await a.click('.proc-adega[data-tipo="osam"] .btn-salvar-periodo');
  await a.waitForSelector(".mensagem-sucesso");
  v((await a.textContent('.proc-adega[data-tipo="osam"] .proc-periodo')).includes("a cada 3 mes(es)") && (await status(a, "osam")) === "realizado", "OSAN com periodicidade definida pelo supervisor passa a ser controlado");
  await a.click('.proc-adega[data-tipo="osam"] summary');
  await a.fill("#ctl-osam-qtd", ""); await a.selectOption("#ctl-osam-un", ""); await a.click('.proc-adega[data-tipo="osam"] .btn-salvar-periodo');
  await a.waitForFunction(() => document.querySelector('.proc-adega[data-tipo="osam"] .selo-status').dataset.status === "pendente");
  v(true, "supervisor volta o OSAN para 'pendente de definição'");
  v((await sql("select count(*)::int from cip_adega_controles_historico where tipo_cip='osam';")) === 2, "alterações de periodicidade ficam no histórico");
  await a.screenshot({ path: path.join(SHOTS, "v10-adega-supervisor-1366.png"), fullPage: true });

  // Faixas na Gestão (valores FICTÍCIOS de teste — só neste banco local)
  a = await abrir(cAd, "gestao.html");
  await a.selectOption("#faixa-tipo", "completo");
  v((await a.textContent("#faixa-resumo")).includes("comparação desligada"), "sem faixas: comparação desligada");
  v((await a.locator("#corpo-faixas tr").count()) === 18, "Gestão lista os 18 parâmetros não-horário do formulário", await a.locator("#corpo-faixas tr").count());
  const linha = '#corpo-faixas tr[data-campo="conc_inicial_soda"]';
  await a.fill(`${linha} .faixa-min`, "5"); await a.fill(`${linha} .faixa-max`, "4"); await a.click(`${linha} .btn-salvar-faixa`);
  v((await a.textContent("#erro-faixa")).includes("mínimo não pode ser maior"), "mínimo maior que máximo recusado");
  await a.fill(`${linha} .faixa-min`, "2"); await a.fill(`${linha} .faixa-max`, "4"); await a.fill(`${linha} .faixa-un`, "%");
  await a.click(`${linha} .btn-salvar-faixa`); await a.waitForSelector(".mensagem-sucesso");
  await a.waitForFunction(() => document.getElementById("faixa-resumo").textContent.includes("1 parâmetro"));
  v(true, "faixa fictícia salva (1 parâmetro com comparação ativa)");
  await a.selectOption("#faixa-tipo", "osam");
  v((await a.textContent("#faixa-resumo")).includes("comparação desligada"), "faixa do TFM/HORAP/Trasfega/DAW não aparece no OSAN (sem mistura)");
  await a.screenshot({ path: path.join(SHOTS, "v10-gestao-faixas-1366.png"), fullPage: true });

  // Operador registra com valor fora da faixa e vê o resultado
  p = await abrir(cOp, "registro.html?tipo=completo");
  await preencherBasico(p, { equip: "Tanque de Fermentação 07" });
  await p.fill("#campo_conc_inicial_soda", "9%");
  await p.click("#btn-salvar");
  await p.waitForSelector(".resultado-parametros");
  v((await p.textContent("#mensagem")).includes("1 parâmetro(s) fora da faixa"), "operador vê o aviso de parâmetro fora da faixa depois de salvar");
  const linhaFora = await p.$eval(".tabela-verificacao tbody tr", (tr) => ({ fora: tr.classList.contains("verif-fora"), txt: tr.textContent.replace(/\s+/g, " ") }));
  v(linhaFora.fora && linhaFora.txt.includes("Conc. Inicial de soda") && linhaFora.txt.includes("9%") && linhaFora.txt.includes("2 %") && linhaFora.txt.includes("4 %") && linhaFora.txt.includes("Acima do máximo"), "tabela mostra parâmetro, valor, mínimo, máximo e situação em vermelho", linhaFora.txt);
  v(await p.evaluate(() => getComputedStyle(document.querySelector(".selo-verif-acima")).backgroundColor) === "rgb(162, 59, 59)", "situação fora da faixa destacada em vermelho");
  await p.screenshot({ path: path.join(SHOTS, "v10-resultado-parametros-1366.png"), fullPage: true });
  const idFora = await sql("select to_json(id) from cip_registros where equipamento='Tanque de Fermentação 07' and tipo_cip='completo';");
  v((await sql(`select to_json(dados->>'conc_inicial_soda') from cip_registros where id='${idFora}';`)) === "9%", "valor original preservado como digitado");
  await p.click("#btn-continuar-registro"); await p.waitForURL("**/painel.html");
  v(true, "botão Continuar volta ao Painel");
  // Dentro da faixa
  p = await abrir(cOp, "registro.html?tipo=completo");
  await preencherBasico(p, { equip: "Tanque de Fermentação 11" });
  await p.fill("#campo_conc_inicial_soda", "2,5%");
  await p.click("#btn-salvar"); await p.waitForSelector(".resultado-parametros");
  v((await p.textContent("#mensagem")).includes("dentro da faixa"), "valor dentro da faixa: situação normal");
  // Tipo sem faixa: segue direto, sem tela de resultado
  p = await abrir(cOp, "registro.html?tipo=tanque_levedura");
  await preencherBasico(p, { equip: "Tanque de Levedura 01" });
  await p.click("#btn-salvar"); await p.waitForURL("**/painel.html");
  v(true, "tipo sem faixa cadastrada salva normalmente, sem comparação");

  // Supervisor vê a mesma verificação na revisão
  a = await abrir(cAd, `historico.html?registroId=${idFora}&foco=avaliacao`);
  await a.waitForSelector("#secao-verificacao");
  v((await a.$$eval("#secao-verificacao tr.verif-fora", (t) => t.length)) === 1 && (await a.textContent("#secao-verificacao")).includes("1 de 1"), "supervisor vê o parâmetro fora da faixa durante a avaliação");
  await a.screenshot({ path: path.join(SHOTS, "v10-detalhe-verificacao-1366.png"), fullPage: true });
  const R1 = "10000000-0000-0000-0000-000000000001";
  a = await abrir(cAd, `historico.html?registroId=${R1}`);
  await a.waitForSelector("#secao-verificacao");
  v((await a.textContent("#secao-verificacao")).includes("comparação está desligada"), "registro sem faixa na época: comparação desligada");
  // CSV
  a = await abrir(cAd, "relatorios.html");
  await a.selectOption("#r-tipo", "completo"); await a.click("#btn-gerar-relatorio");
  await a.waitForFunction(() => Number((document.getElementById("rel-total") || {}).textContent) > 0);
  const [dl] = await Promise.all([a.waitForEvent("download"), a.click("#btn-csv-registros")]);
  const csv = fs.readFileSync(await dl.path(), "utf8");
  v(csv.includes("Verificação dos parâmetros") && csv.includes("1 de 1 fora da faixa: Conc. Inicial de soda = 9% (máx. 4 %)"), "CSV registra a condição encontrada");

  // ============ Rastreabilidade de contaminação ============
  // Cenário fictício: 4 CIPs contaminados no Tanque de Fermentação 02 (um deles reavaliado),
  // 1 no Tanque de Fermentação 06, 1 no BBT 03 e 1 conforme em revisão (não conta).
  await sql(`insert into cip_registros (tipo_cip, equipamento, data_cip, hora_inicial, hora_final, nome_operador, dados) values
    ('completo','Tanque de Fermentação 02',current_date-40,'07:00','08:00','Operador Fictício A','{}'),
    ('completo','Tanque de Fermentação 02',current_date-75,'07:00','08:00','Operador Fictício A','{}'),
    ('completo','Tanque de Fermentação 02',current_date-130,'07:00','08:00','Operador Fictício B','{}'); select 1;`);
  const ids = await sql("select json_agg(id order by data_cip desc) from cip_registros where equipamento='Tanque de Fermentação 02';");
  const id06 = await sql("select to_json(id) from cip_registros where equipamento='Tanque de Fermentação 06' limit 1;");
  const idBbt = await sql("select to_json(id) from cip_registros where tipo_cip='osam' and bbt='BBT 03' limit 1;");
  const idRev = await sql("select to_json(id) from cip_registros where equipamento='Tanque de Fermentação 11' and tipo_cip='completo';");
  a = await abrir(cAd, "painel.html");
  const res = await a.evaluate(async ({ ids, id06, idBbt, idRev }) => {
    const r = [];
    for (const id of [...ids, id06, idBbt]) r.push((await supabaseClient.rpc("avaliar_cip", { p_registro_id: id, p_situacao: "contaminado", p_observacao: "Resíduo visível (teste fictício)", p_versao_esperada: 0 })).error);
    r.push((await supabaseClient.rpc("avaliar_cip", { p_registro_id: ids[0], p_situacao: "conforme", p_observacao: "Refeito (teste)", p_versao_esperada: 1 })).error);
    r.push((await supabaseClient.rpc("avaliar_cip", { p_registro_id: ids[0], p_situacao: "contaminado", p_observacao: "Contaminou de novo (teste)", p_versao_esperada: 2 })).error);
    r.push((await supabaseClient.rpc("avaliar_cip", { p_registro_id: idRev, p_situacao: "conforme", p_observacao: null, p_versao_esperada: 0 })).error);
    return r.filter(Boolean);
  }, { ids, id06, idBbt, idRev });
  v(res.length === 0, "avaliações fictícias registradas", res);
  p = await abrir(cOp, `registro.html?tipo=completo&id=${idRev}`);
  await p.waitForSelector("#campo_conc_inicial_soda");
  await p.fill("#campo_conc_inicial_soda", "2,6%"); await p.fill("#nome_quem_edita", "Pessoa da Edição"); await p.fill("#justificativa", "Concentração anotada errada no papel");
  await p.click("#btn-salvar"); await p.waitForURL("**/historico.html?registroId=*");
  v((await sql(`select to_json(revisao_pendente::text||'/'||situacao_avaliacao) from vw_cip_registros where id='${idRev}';`)) === "true/conforme", "registro conforme editado fica só em 'Revisão necessária'");

  p = await abrir(cOp, "rastreabilidade.html");
  v((await p.textContent("main")).includes("Acesso restrito"), "operador não acessa a Rastreabilidade de Contaminação");
  a = await abrir(cAd, "rastreabilidade.html");
  await a.selectOption("#rt-periodo", "todos");
  await a.waitForSelector("#rt-mapa tbody tr");
  const totalEsperado = await sql("select count(*)::int from vw_cip_registros where situacao_avaliacao='contaminado';");
  v(totalEsperado === 6 && (await a.textContent("#rt-indicadores .indicador:first-child .ind-valor")).trim() === "6", "conta 6 contaminações: reavaliação não duplica e revisão sozinha não conta", totalEsperado);
  const linhasMapa = await a.$$eval("#rt-mapa tbody tr", (trs) => trs.map((tr) => ({ eq: tr.querySelector(".btn-equip").textContent, total: tr.querySelector("td.col-total").textContent.trim(), nivel: [...tr.querySelector("td.col-total").classList].find((c) => c.startsWith("nivel-")) })));
  v(linhasMapa.length === 3 && linhasMapa[0].eq === "Tanque de Fermentação 02" && linhasMapa[0].total === "4", "mapa de calor: equipamento mais recorrente no topo, com 4 ocorrências", linhasMapa);
  v(linhasMapa[0].nivel === "nivel-vermelho" && linhasMapa.slice(1).every((l) => l.nivel === "nivel-verde"), "cores: alta recorrência em vermelho, baixa em verde (escala relativa)", linhasMapa);
  v((await a.textContent("#rt-criterio")).includes("escala relativa"), "critério de cores explicado (escala relativa, sem limite inventado)");
  v((await a.textContent("#rt-indicadores")).includes("Tanque de Fermentação 02") && (await a.textContent("#rt-indicadores")).includes("4 ocorrência(s)"), "indicador de maior recorrência");
  const rk = await a.$$eval("#rt-ranking li .rk-nome", (s) => s.map((x) => x.textContent));
  v(rk[0] === "Tanque de Fermentação 02" && rk.length === 3, "ranking dos equipamentos", rk);
  v((await a.locator("#rt-ocorrencias .ocorrencia").count()) === 6, "histórico com as 6 ocorrências e as datas");
  await a.screenshot({ path: path.join(SHOTS, "v10-rastreabilidade-1366.png"), fullPage: true });
  await a.click('#rt-mapa .btn-equip[data-equip="Tanque de Fermentação 02"]');
  v((await a.locator("#rt-ocorrencias .ocorrencia").count()) === 4 && (await a.isVisible("#rt-limpar-equip")), "clicar no equipamento mostra só os registros dele");
  const hrefs = await a.$$eval("#rt-ocorrencias .oc-ver", (l) => l.map((x) => x.getAttribute("href")));
  v(hrefs.every((h) => h.startsWith("historico.html?registroId=")) && hrefs.some((h) => h.includes(ids[0])), "cada ocorrência abre o registro de origem");
  await a.click("#rt-limpar-equip");
  await a.selectOption("#rt-periodo", "3");
  const esperado3 = await sql("select count(*)::int from vw_cip_registros where situacao_avaliacao='contaminado' and data_cip >= (date_trunc('month', current_date) - interval '2 months')::date;");
  v((await a.textContent("#rt-indicadores .indicador:first-child .ind-valor")).trim() === String(esperado3), "filtro de período (últimos 3 meses)", esperado3);
  await a.selectOption("#rt-periodo", "todos");
  await a.selectOption("#rt-tipo", "osam");
  v((await a.textContent("#rt-indicadores .indicador:first-child .ind-valor")).trim() === "1", "filtro por tipo (OSAN)");
  await a.selectOption("#rt-tipo", "");
  await a.fill("#rt-equip", "BBT");
  v((await a.locator("#rt-mapa tbody tr").count()) === 1, "busca por equipamento");
  await a.fill("#rt-equip", "");
  // Limites fixos definidos pelo supervisor (valores de teste)
  await a.fill("#rt-lim-amarelo", "4"); await a.fill("#rt-lim-vermelho", "3"); await a.click("#rt-salvar-limites");
  v((await a.textContent("#rt-erro-config")).includes("amarelo menor"), "limites inválidos recusados");
  await a.fill("#rt-lim-amarelo", "2"); await a.fill("#rt-lim-vermelho", "4"); await a.click("#rt-salvar-limites");
  await a.waitForFunction(() => document.getElementById("rt-criterio").textContent.includes("limites fixos"));
  const niveisFixos = await a.$$eval("#rt-mapa tbody td.col-total", (t) => t.map((x) => [...x.classList].find((c) => c.startsWith("nivel-"))));
  v(niveisFixos[0] === "nivel-vermelho" && niveisFixos[1] === "nivel-verde" && (await a.textContent("#rt-legenda")).includes("4 ou mais"), "com limites fixos (2 e 4), cores seguem os limites", niveisFixos);
  await a.click("#rt-limpar-limites");
  await a.waitForFunction(() => document.getElementById("rt-criterio").textContent.includes("escala relativa"));
  v((await sql("select to_json(coalesce(mapa_limite_amarelo::text,'-')) from cip_configuracao;")) === "-", "voltar para a escala relativa");

  // ============ Responsividade ============
  for (const w of [1366, 1024, 768, 390]) {
    const vp = { width: w, height: w > 500 ? 900 : 844 };
    const co = await contexto(browser, vp), ca = await contexto(browser, vp);
    const po = await login(co, "operador.teste@local");
    const pa = await login(ca, "admin.teste@local");
    for (const [pg, url, nome] of [[po, "painel.html", "painel"], [po, "adega.html", "adega"], [pa, "adega.html", "adega-sup"], [pa, "rastreabilidade.html", "rastreabilidade"],
      [pa, `historico.html?registroId=${idFora}`, "detalhe"], [pa, "gestao.html", "gestao"], [po, "registro.html?tipo=alcalino&adega=1", "alcalino"]]) {
      await pg.goto(BASE + url); await pg.waitForLoadState("networkidle");
      if (nome === "rastreabilidade") { await pg.selectOption("#rt-periodo", "todos"); await pg.waitForSelector("#rt-mapa tbody tr"); }
      if (nome === "detalhe") await pg.waitForSelector("#secao-verificacao");
      v(await semRolagem(pg), `${nome} sem rolagem horizontal em ${w}px`);
      if (w === 390 || w === 768) await pg.screenshot({ path: path.join(SHOTS, `v10-${nome}-${w}.png`), fullPage: true });
    }
    await co.close(); await ca.close();
  }
  v(erros.length === 0, "nenhum erro no console", erros.slice(0, 6));
  console.log(`\nResultado: ${ok} ok, ${falhas} falha(s)`);
  await browser.close();
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
