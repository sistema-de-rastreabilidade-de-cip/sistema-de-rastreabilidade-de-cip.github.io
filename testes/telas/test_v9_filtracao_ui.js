// Testes de tela da v9: CIP Filtração — Filtro 3 e CIP Filtração — BMF.
// Site real de docs/ + banco Postgres LOCAL com todas as migrações. Nada de produção.
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
const rotulosFormulario = (p) => p.$$eval("#form-cip label", (ls) => ls.map((l) => l.textContent.replace("*", "").replace(/\s+/g, " ").trim()).filter(Boolean));

// Campos oficiais listados na solicitação (ordem do documento).
const CAMPOS_F3 = ["Data", "Nº Utilização de Soda", "Equipamento", "Ciclo", "Hora Inicial", "Hora Final", "Temperatura da Solução",
  "Concentração Inicial de Soda", "Concentração Final de Soda", "Tempo de Circulação", "Hora Inicial do ciclo de ácido", "Hora Final do ciclo de ácido",
  "Concentração Inicial de Ácido", "Concentração Final de Ácido", "Tempo de Circulação do Ácido", "Pressão", "pH do enxágue final",
  "Limpeza do ponto de coleta", "Operador", "Coordenador/Líder", "Observações"];
const CAMPOS_BMF = ["Data", "Equipamento", "Ciclo", "Hora Inicial", "Hora Final", "Tempo Total de CIP", "Soaking (SIM ou NÃO)", "CIP Hipoclorito (membranas)",
  "Concentração Inicial de Soda (2% a 4%)", "Concentração Final de Soda (1% a 3%)", "Concentração Inicial de Divos X5 (4500 a 8500 ppm)",
  "Concentração Final de Divos X5 (500 a 4500 ppm)", "Concentração Inicial de Ácido (0,5%)", "UBT", "UBL", "FBT", "FBL", "Tanque Sílica", "Tanque PVPP",
  "Tanque Alginato", "Tanque Antioxidante", "Tanque Lúpulo", "Linha Maturada", "Linha Adegas", "Linha de água", "Condutividade",
  "Limpeza pontos de coleta", "Operador", "Coordenador/Líder", "Observações"];

async function conferirCampos(p, esperados, nome) {
  const rotulos = (await rotulosFormulario(p)).map((r) => r.replace(/^Observações.*/, "Observações"));
  const faltando = esperados.filter((e) => !rotulos.some((r) => r.toLowerCase() === e.toLowerCase()));
  v(faltando.length === 0, `${nome}: todos os ${esperados.length} campos oficiais presentes`, faltando);
  return rotulos;
}

async function preencherTudo(p, valores) {
  // Preenche todos os campos de dados do formulário com valores identificáveis.
  const ids = await p.$$eval("#campos-dados input, #campos-dados select", (els) => els.map((e) => ({ id: e.id, tag: e.tagName, type: e.type })));
  for (const c of ids) {
    if (c.tag === "SELECT") await p.selectOption(`#${c.id}`, { index: 1 });
    else if (c.type === "time") await p.fill(`#${c.id}`, "10:15");
    else await p.fill(`#${c.id}`, valores[c.id] || `valor ${c.id.replace("campo_", "")}`);
  }
  return ids.length;
}

(async () => {
  const browser = await chromium.launch();
  const cOp = await contexto(browser);
  let p = await login(cOp, "operador.teste@local");
  const cards = await p.$$eval("#op-cartoes-formularios .cartao-formulario", (cs) => cs.map((c) => c.textContent.replace(/\s+/g, " ")));
  v(cards.length === 7, "painel do operador mostra 7 formulários", cards.length);
  v(cards.some((c) => c.includes("CIP Filtração — Filtro 3")) && cards.some((c) => c.includes("CIP Filtração — BMF")), "os dois formulários de Filtração aparecem no menu");

  // ---------- Filtro 3 ----------
  p = await abrir(cOp, "registro.html?tipo=filtracao_filtro3");
  v((await p.textContent("#doc-origem")).includes("PO-JAC-FAB-005"), "Filtro 3: documento de origem PO-JAC-FAB-005");
  const rotF3 = await conferirCampos(p, CAMPOS_F3, "Filtro 3");
  v(!rotF3.some((r) => /Soaking|Divos|Condutividade|UBT/.test(r)), "Filtro 3: nenhum campo do BMF misturado");
  const gruposF3 = await p.$$eval("#equipamento optgroup", (gs) => gs.map((g) => `${g.label}:${g.children.length}`));
  v(JSON.stringify(gruposF3) === JSON.stringify(["Grupo BMF:13", "Filtro 03:10", "Blendagem:7"]), "Filtro 3: equipamentos agrupados como no documento", gruposF3);
  const opF3 = await p.$$eval("#equipamento option", (os) => os.map((o) => o.value));
  v(opF3.includes("Linha de Cerveja filtrada — FBL") && opF3.includes("Tanque de PVPP — BVPP") && opF3.includes("Linha de Adega — BADEGA"), "Filtro 3: grafia do Anexo 2 preservada (FBL filtrada, BVPP)");
  v(opF3.includes("Tanque de água nobre sala 03 — TQN 25 - 3") && opF3.includes("Filtro de Cerveja por placas — F03"), "Filtro 3: referências de Filtro 03 e Blendagem presentes");
  const secoesF3 = await p.$$eval(".secao-formulario", (h) => h.map((x) => x.textContent));
  v(secoesF3.join("|") === "Identificação do ciclo|Ciclo de soda|Ciclo de ácido|Verificação final", "Filtro 3: campos organizados em seções", secoesF3);
  await p.fill("#data_cip", await p.evaluate(() => cipHoje()));
  await p.selectOption("#equipamento", "Tanque de Cerveja Maturada — UBT");
  await p.fill("#hora_inicial", "08:00"); await p.fill("#hora_final", "09:20");
  if (await p.$("#nome_operador_lista")) await p.selectOption("#nome_operador_lista", "__outro__"); await p.fill("#nome_operador", "Operador Filtração");
  const nF3 = await preencherTudo(p, { campo_f3_temperatura_solucao: "80 °C", campo_f3_conc_inicial_soda: "2,5%" });
  v(nF3 === 15, "Filtro 3: 15 campos de procedimento além da identificação", nF3);
  await p.fill("#observacoes", "Observação do verso — Filtro 3");
  await p.screenshot({ path: path.join(SHOTS, "filtro3-formulario-1366.png"), fullPage: true });
  await p.click("#btn-salvar"); await p.waitForURL("**/painel.html");
  const f3 = await sql("select to_jsonb(r) from cip_registros r where tipo_cip='filtracao_filtro3';");
  v(f3 && Object.keys(f3.dados).length === 15 && Object.keys(f3.dados).every((k) => k.startsWith("f3_") && f3.dados[k]), "Filtro 3: os 15 campos gravados, todos preenchidos, só chaves f3_", f3 && Object.keys(f3.dados));
  v(f3.dados.f3_temperatura_solucao === "80 °C" && f3.equipamento === "Tanque de Cerveja Maturada — UBT" && f3.hora_final === "09:20:00" && f3.observacoes_operador === "Observação do verso — Filtro 3", "Filtro 3: valores, equipamento, horários e observações corretos");

  // ---------- BMF ----------
  p = await abrir(cOp, "registro.html?tipo=filtracao_bmf");
  v((await p.textContent("#doc-origem")).includes("PO-JAC-FAB-024"), "BMF: documento de origem PO-JAC-FAB-024");
  const rotB = await conferirCampos(p, CAMPOS_BMF, "BMF");
  v(!rotB.some((r) => /Temperatura da Solução|Nº Utilização de Soda|ciclo de ácido/.test(r)), "BMF: nenhum campo do Filtro 3 misturado");
  const opB = await p.$$eval("#equipamento option", (os) => os.map((o) => o.value));
  v(opB.includes("Linha de Cerveja não filtrada — FBL") && opB.includes("Tanque de PVPP — BPVPP") && !opB.includes("Tanque de PVPP — BVPP") && opB.includes("Linha até Adega — BADEGA"), "BMF: grafia do Anexo 3 preservada (FBL não filtrada, BPVPP), sem padronizar");
  v((await p.$$eval("#campo_bmf_soaking option", (os) => os.map((o) => o.value))).join("|") === "|SIM|NÃO", "BMF: Soaking com SIM ou NÃO");
  v((await p.textContent(".nota-formulario")).includes("só como referência"), "BMF: faixas exibidas como referência informativa");
  await p.fill("#data_cip", await p.evaluate(() => cipHoje()));
  await p.selectOption("#equipamento", "Filtro de Cerveja de Membrana — BMF");
  await p.fill("#hora_inicial", "13:00"); await p.fill("#hora_final", "15:30");
  if (await p.$("#nome_operador_lista")) await p.selectOption("#nome_operador_lista", "__outro__"); await p.fill("#nome_operador", "Operador Filtração");
  const nB = await preencherTudo(p, { campo_bmf_conc_inicial_soda: "9%", campo_bmf_conc_inicial_divos: "12000 ppm" });
  v(nB === 24, "BMF: 24 campos de procedimento além da identificação", nB);
  await p.selectOption("#campo_bmf_soaking", "NÃO");
  await p.fill("#observacoes", "Observação do verso — BMF");
  await p.screenshot({ path: path.join(SHOTS, "bmf-formulario-1366.png"), fullPage: true });
  await p.click("#btn-salvar"); await p.waitForURL("**/painel.html");
  const bmf = await sql("select to_jsonb(r) from cip_registros r where tipo_cip='filtracao_bmf';");
  v(bmf && Object.keys(bmf.dados).length === 24 && Object.keys(bmf.dados).every((k) => k.startsWith("bmf_") && bmf.dados[k]), "BMF: os 24 campos gravados, todos preenchidos, só chaves bmf_");
  v(bmf.dados.bmf_conc_inicial_soda === "9%" && bmf.dados.bmf_soaking === "NÃO", "BMF: valor fora da faixa de referência é aceito (sem bloqueio) e Soaking gravado");

  // Data futura também vale para os novos tipos
  const futura = await p.evaluate(async () => {
    const d = cipAgora(); d.setDate(d.getDate() + 1);
    const r = await supabaseClient.from("cip_registros").insert({ tipo_cip: "filtracao_bmf", equipamento: "UBT", data_cip: cipChaveData(d), hora_inicial: "08:00", hora_final: "09:00", nome_operador: "Operador Filtração" });
    return r.error && r.error.code;
  });
  v(futura === "23514", "data futura recusada pelo banco nos novos tipos", futura);

  // ---------- Persistência, histórico e edição ----------
  p = await abrir(cOp, `historico.html?registroId=${f3.id}`);
  await p.waitForSelector(".detalhe-registro");
  let det = await p.textContent(".detalhe-registro");
  v(det.includes("CIP Filtração — Filtro 3") && det.includes("80 °C") && det.includes("Tanque de Cerveja Maturada — UBT") && det.includes("Observação do verso — Filtro 3"), "detalhe do Filtro 3 mostra os campos após recarregar");
  v((await p.$$eval(".secao-detalhe", (s) => s.length)) === 4, "detalhe mostra as seções do formulário");
  p = await abrir(cOp, `registro.html?tipo=filtracao_filtro3&id=${f3.id}`);
  await p.waitForSelector("#campo_f3_temperatura_solucao");
  v((await p.inputValue("#campo_f3_temperatura_solucao")) === "80 °C" && (await p.$eval("#equipamento", (e) => e.value)) === "Tanque de Cerveja Maturada — UBT", "edição abre com os valores gravados");
  await p.fill("#campo_f3_temperatura_solucao", "82 °C");
  await p.fill("#nome_quem_edita", "Pessoa da Edição"); await p.fill("#justificativa", "Temperatura anotada errada no registro");
  await p.click("#btn-salvar"); await p.waitForURL("**/historico.html?registroId=*"); await p.waitForSelector(".diff-edicao");
  v((await p.textContent(".diff-edicao")).includes("Temperatura da Solução: 80 °C → 82 °C"), "histórico de alterações mostra o campo da Filtração alterado");

  // ---------- Supervisor ----------
  const cAd = await contexto(browser);
  let a = await login(cAd, "admin.teste@local");
  const negado = await a.evaluate(async () => (await supabaseClient.from("cip_registros").insert({ tipo_cip: "filtracao_bmf", equipamento: "UBT", data_cip: cipHoje(), hora_inicial: "08:00", hora_final: "09:00", nome_operador: "Admin Teste" })).error);
  v(negado && negado.code === "42501", "supervisor não grava registro de Filtração (só operador)");
  a = await abrir(cAd, `historico.html?registroId=${f3.id}&foco=avaliacao`);
  await a.waitForSelector("#btn-salvar-avaliacao");
  await a.check('input[name="av-situacao"][value="contaminado"]'); await a.fill("#av-observacao", "Resíduo no filtro após o ciclo de soda");
  await a.click("#btn-salvar-avaliacao"); await a.waitForSelector(".mensagem-sucesso");
  v((await a.getAttribute(".detalhe-registro .selo-avaliacao", "data-avaliacao")) === "contaminado", "avaliação do Filtro 3 como Contaminado");
  await a.fill("#nova-observacao", "Conferir troca das placas do F03"); await a.click("#btn-salvar-observacao");
  await a.waitForFunction(() => (document.querySelector(".lista-observacoes") || {}).textContent);
  a = await abrir(cAd, `historico.html?registroId=${bmf.id}&foco=avaliacao`);
  await a.waitForSelector("#btn-salvar-avaliacao");
  await a.check('input[name="av-situacao"][value="conforme"]'); await a.click("#btn-salvar-avaliacao"); await a.waitForSelector(".mensagem-sucesso");
  const negadoAv = await p.evaluate(async (id) => (await supabaseClient.rpc("avaliar_cip", { p_registro_id: id, p_situacao: "conforme", p_observacao: null, p_versao_esperada: 1 })).error, bmf.id);
  v(negadoAv && negadoAv.code === "42501", "operador não avalia (recusado pelo banco)");
  // revisão necessária após edição do BMF avaliado
  p = await abrir(cOp, `registro.html?tipo=filtracao_bmf&id=${bmf.id}`);
  await p.waitForSelector("#campo_bmf_condutividade");
  await p.fill("#campo_bmf_condutividade", "1,2 mS/cm"); await p.fill("#nome_quem_edita", "Pessoa da Edição"); await p.fill("#justificativa", "Condutividade não tinha sido anotada");
  await p.click("#btn-salvar"); await p.waitForURL("**/historico.html?registroId=*"); await p.waitForSelector(".detalhe-registro");
  v(await p.isVisible(".detalhe-registro .selo-revisao"), "edição do BMF avaliado gera Revisão necessária");
  a = await abrir(cAd, `historico.html?registroId=${bmf.id}&foco=avaliacao`);
  await a.waitForSelector("#aviso-revisao");
  await a.fill("#av-observacao", "Conferi a condutividade incluída; mantenho"); await a.click("#btn-salvar-avaliacao"); await a.waitForSelector(".mensagem-sucesso");
  await a.waitForFunction(() => document.querySelectorAll("#lista-hist-avaliacao li").length === 2);
  v(true, "reavaliação do BMF preserva o histórico de avaliações (2 eventos)");

  // ---------- Filtros e painel ----------
  a = await abrir(cAd, "historico.html?tipo=filtracao_bmf");
  await a.waitForFunction(() => document.querySelectorAll("#corpo-tabela tr").length === 1);
  v((await a.textContent("#corpo-tabela")).includes("CIP Filtração — BMF"), "histórico filtra por tipo BMF");
  a = await abrir(cAd, "historico.html?equipamento=UBT");
  await a.waitForFunction(() => document.querySelectorAll("#corpo-tabela tr").length >= 1);
  v((await a.textContent("#corpo-tabela")).includes("Tanque de Cerveja Maturada — UBT"), "histórico localiza pelo equipamento (UBT)");
  a = await abrir(cAd, "historico.html?operador=Operador%20Filtra%C3%A7%C3%A3o");
  await a.waitForFunction(() => document.querySelectorAll("#corpo-tabela tr").length === 2);
  v(true, "histórico localiza pelo operador (2 registros)");
  a = await abrir(cAd, "painel.html");
  await a.waitForSelector("#grafico-a");
  const graficos = await a.$$eval("canvas[data-grafico]", (cs) => cs.map((c) => c.dataset.grafico).join(" "));
  v(graficos.includes("CIP Filtração — Filtro 3") && graficos.includes("CIP Filtração — BMF"), "gráficos do painel incluem os dois tipos");
  v((await a.$$eval("#dash-filtro-tipo option", (os) => os.map((o) => o.value))).includes("filtracao_filtro3"), "filtro de tipo do painel inclui Filtração");

  // ---------- Relatórios ----------
  a = await abrir(cAd, "relatorios.html");
  await a.selectOption("#r-tipo", "filtracao_filtro3"); await a.click("#btn-gerar-relatorio");
  await a.waitForFunction(() => (document.getElementById("rel-total") || {}).textContent === "1");
  let txt = await a.textContent("#area-relatorio");
  v(txt.includes("Temperatura da Solução") && txt.includes("82 °C") && txt.includes("Justificativa de contaminação") && txt.includes("Conferir troca das placas"), "relatório do Filtro 3 com campos, avaliação e observações");
  v(!txt.includes("Soaking"), "relatório do Filtro 3 não mostra campos do BMF");
  let [dl] = await Promise.all([a.waitForEvent("download"), a.click("#btn-csv-registros")]);
  let csv = fs.readFileSync(await dl.path(), "utf8");
  let cab = csv.replace(/^﻿/, "").split("\r\n")[0].split(";");
  v(cab.includes("Filtro 3 — Ciclo") && cab.includes("Filtro 3 — Temperatura da Solução") && !cab.some((c) => c.startsWith("BMF — ")), "CSV do Filtro 3 só com colunas do Filtro 3 (identificadas)");
  await a.selectOption("#r-tipo", ""); await a.click("#btn-gerar-relatorio");
  await a.waitForFunction(() => Number((document.getElementById("rel-total") || {}).textContent) > 2);
  [dl] = await Promise.all([a.waitForEvent("download"), a.click("#btn-csv-registros")]);
  csv = fs.readFileSync(await dl.path(), "utf8");
  cab = csv.replace(/^﻿/, "").split("\r\n")[0].split(";");
  v(cab.includes("Filtro 3 — Ciclo") && cab.includes("BMF — Ciclo") && cab.includes("BMF — Soaking (SIM ou NÃO)") && cab.includes("BMF — Concentração Inicial de Divos X5 (4500 a 8500 ppm)"), "CSV geral mantém as colunas dos dois procedimentos separadas");
  const linhaBmf = csv.split("\r\n").find((l) => l.includes(bmf.id));
  v(linhaBmf && linhaBmf.includes("12000 ppm") && linhaBmf.includes("1,2 mS/cm"), "CSV traz os valores do BMF");
  [dl] = await Promise.all([a.waitForEvent("download"), a.click("#btn-csv-historico")]);
  const hist = fs.readFileSync(await dl.path(), "utf8");
  v(hist.includes("Temperatura da Solução: 80 °C → 82 °C") && hist.includes("Condutividade"), "CSV de histórico inclui as alterações da Filtração");
  await a.click("#btn-copiar-tabela");
  v((await a.evaluate(() => navigator.clipboard.readText())).includes("CIP Filtração — BMF"), "cópia para o Excel inclui a Filtração");
  await a.evaluate(() => { window.print = () => { window.__impresso = true; }; });
  await a.click("#btn-imprimir");
  v(await a.evaluate(() => window.__impresso === true), "impressão/PDF disponível");

  // ---------- Backup ----------
  a = await abrir(cAd, "gestao.html");
  await a.click("#btn-criar-backup"); await a.waitForSelector("#checksum-backup");
  await a.waitForSelector('tr[data-backup] .btn-baixar-backup');
  [dl] = await Promise.all([a.waitForEvent("download"), a.click('tr[data-backup] .btn-baixar-backup >> nth=0')]);
  const arq = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
  const f3b = arq.tabelas.cip_registros.find((r) => r.tipo_cip === "filtracao_filtro3");
  const bmfb = arq.tabelas.cip_registros.find((r) => r.tipo_cip === "filtracao_bmf");
  v(f3b && Object.keys(f3b.dados).length === 15 && bmfb && Object.keys(bmfb.dados).length === 24, "backup contém os registros de Filtração com todos os campos");
  fs.writeFileSync(path.join(process.env.PGTESTE_DIR || "/var/lib/postgresql/cipteste", "backup_baixado_v9.json"), JSON.stringify(arq));

  // ---------- Responsividade ----------
  for (const w of [1366, 1024, 768, 390]) {
    const c = await contexto(browser, { width: w, height: w > 500 ? 900 : 844 });
    const po = await login(c, "operador.teste@local");
    for (const tipo of ["filtracao_filtro3", "filtracao_bmf"]) {
      await po.goto(BASE + `registro.html?tipo=${tipo}`); await po.waitForLoadState("networkidle");
      v(await po.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${tipo} sem rolagem horizontal em ${w}px`);
      await po.screenshot({ path: path.join(SHOTS, `${tipo}-${w}.png`), fullPage: true });
    }
    await po.goto(BASE + `historico.html?registroId=${bmf.id}`); await po.waitForSelector(".detalhe-registro");
    v(await po.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `detalhe do BMF sem rolagem horizontal em ${w}px`);
    await c.close();
  }
  v(erros.length === 0, "nenhum erro no console", erros.slice(0, 6));
  console.log(`\nResultado: ${ok} ok, ${falhas} falha(s)`);
  await browser.close();
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
