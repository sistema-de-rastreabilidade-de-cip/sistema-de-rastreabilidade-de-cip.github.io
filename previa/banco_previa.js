// =====================================================================
// PRÉVIA da v10 — banco SIMULADO no navegador (dados FICTÍCIOS).
// Substitui o supabase-js só nesta prévia. Não faz NENHUMA chamada de rede:
// nada chega ao Supabase real. Os dados ficam na aba do navegador
// (armazenamento local do navegador) e voltam ao estado inicial com "Recomeçar a prévia".
// As regras principais imitam as do banco (perfis, data futura, nome do
// operador, avaliação, revisão, faixas, Adega), para a navegação ser fiel.
// =====================================================================
(function () {
  const CHAVE = "cip-previa-v10-dados";
  const CHAVE_SESSAO = "cip-previa-v10-sessao";
  const UID_OP = "00000000-0000-4000-8000-0000000000b1";
  const UID_ADM = "00000000-0000-4000-8000-0000000000a1";
  const USUARIOS = { "operador@previa.local": UID_OP, "supervisor@previa.local": UID_ADM };
  let memoria = {};
  const ler = (k) => { try { return localStorage.getItem(k); } catch (e) { return memoria[k] ?? null; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { memoria[k] = v; } };
  const apagar = (k) => { try { localStorage.removeItem(k); } catch (e) { delete memoria[k]; } };

  // ---------- utilidades ----------
  const agora = () => new Date().toISOString();
  function hojeChave(deslocDias = 0) {
    const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    d.setDate(d.getDate() + deslocDias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  let semente = 20261113;
  const rnd = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
  const uuid = () => "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
  const erro = (code, message) => ({ data: null, error: { code, message, details: null, hint: null } });
  const ok = (data) => ({ data, error: null });
  const normNome = (n) => String(n || "").replace(/\s+/g, " ").trim();
  const nomeValido = (n) => { const x = normNome(n); return x.length >= 2 && x.length <= 80 && /^[A-Za-zÀ-ÖØ-öø-ÿ .'-]+$/.test(x) && x.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "").length >= 2; };
  const chaveNome = (n) => normNome(n).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const GENERICAS = ["erro", "erros", "corrigir", "correcao", "corrigido", "ajuste", "ok", "teste", "n/a", "na", "pq sim", "porque sim", "alteracao", "edicao", "mudanca", "atualizacao", "sem motivo"];
  const textoValido = (t) => { const x = String(t || "").trim(); if (!x || x.length > 300) return false; const s = x.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); if (s.replace(/[^A-Za-z]/g, "").length < 4) return false; return !GENERICAS.includes(s.toLowerCase().replace(/[.,;:!?]/g, "").trim()); };
  const numero = (t) => { const m = String(t ?? "").match(/-?[0-9]+(?:[.,][0-9]+)?/); return m ? Number(m[0].replace(",", ".")) : null; };

  // ---------- dados fictícios iniciais ----------
  function semear() {
    semente = 20261113;
    const db = {
      perfis: [
        { uid: UID_OP, perfil: "operador", nome: "Operação CIP (prévia)" },
        { uid: UID_ADM, perfil: "administrador", nome: "Supervisão (prévia)" },
      ],
      cip_configuracao: [{ id: 1, dias_aviso_adega: 30, bloquear_data_futura: true,
        tipos_data_futura: ["alcalino_clorado", "completo", "tanque_levedura", "linha_recuperacao_levedura", "osam", "filtracao_filtro3", "filtracao_bmf", "alcalino"],
        exigir_operador_cadastrado: false, alerta_espera_horas: null, mapa_limite_amarelo: null, mapa_limite_vermelho: null,
        atualizado_em: agora(), atualizado_por_nome: null }],
      cip_operadores: [], cip_operadores_historico: [],
      cip_registros: [], cip_edicoes: [], cip_observacoes: [], cip_avaliacoes: [], cip_avaliacoes_historico: [],
      cip_adega_controles: [
        { tipo_cip: "alcalino", ordem: 1, periodo_quantidade: 30, periodo_unidade: "dias", dias_aviso: 7, atualizado_em: agora(), atualizado_por_nome: "Prévia (exemplo)" },
        { tipo_cip: "alcalino_clorado", ordem: 2, periodo_quantidade: 6, periodo_unidade: "meses", dias_aviso: null, atualizado_em: agora(), atualizado_por_nome: "Prévia (exemplo)" },
        { tipo_cip: "osam", ordem: 3, periodo_quantidade: null, periodo_unidade: null, dias_aviso: null, atualizado_em: agora(), atualizado_por_nome: "Prévia (exemplo)" },
      ],
      cip_adega_controles_historico: [], cip_adega_datas_base: [],
      cip_parametros_faixas: [], cip_parametros_faixas_historico: [],
      adega_procedimentos: [], adega_datas_base: [], backups: [],
    };
    let hid = 1;
    ["Ana Lima", "Bruno Souza", "Carla Dias", "Diego Rocha", "Elisa Martins"].forEach((n) => {
      const o = { id: uuid(), nome: n, nome_chave: chaveNome(n), ativo: true, criado_em: agora(), criado_por_nome: "Supervisão (prévia)", criado_por_uid: UID_ADM, atualizado_em: null, atualizado_por_nome: null };
      db.cip_operadores.push(o);
      db.cip_operadores_historico.push({ id: hid++, operador_id: o.id, acao: "cadastrar", nome: n, por_nome: "Supervisão (prévia)", por_uid: UID_ADM, criado_em: agora() });
    });
    const ops = db.cip_operadores.map((o) => o.nome);
    const tf = (n) => { const h = { 53: "H01", 54: "H02", 55: "H03", 56: "H04", 57: "H05", 58: "H06", 59: "H07", 60: "H08", 61: "H09" }[n]; return `Tanque de Fermentação ${String(n).padStart(2, "0")}${h ? ` (HORAP ${h})` : ""}`; };
    const dadosCompleto = (soda, acido, pressao) => ({ num_utilizacao_soda: String(10 + Math.floor(rnd() * 40)), painel_cip: "Painel 2", conc_inicial_soda: soda, conc_final_soda: (numero(soda) - 0.3).toFixed(1).replace(".", ",") + "%", tempo_circulacao_soda: "20 min", num_utilizacao_acido: String(5 + Math.floor(rnd() * 30)), hora_inicial_acido: "08:30", hora_final_acido: "08:55", painel_cip_acido: "Painel 2", conc_inicial_acido: acido, conc_final_acido: "0,8%", tempo_circulacao_acido: "15 min", num_utilizacao_divosan: "3", hora_inicial_divosan: "09:00", hora_final_divosan: "09:15", conc_inicial_divosan: "0,3%", conc_final_divosan: "0,25%", tempo_circulacao_divosan: "10 min", pressao, ph_enxague_final: "6,9", limpeza_cone_cupula_microbiologico: "Sim", coordenador_lider: "Carla Dias" });
    // Faixas FICTÍCIAS de exemplo (só na prévia) — as oficiais ainda serão informadas.
    const dataFaixas = hojeChave(-21);
    [["completo", "conc_inicial_soda", 2, 4, "%"], ["completo", "conc_inicial_acido", 0.5, 1.5, "%"], ["completo", "pressao", null, 3, "bar"]].forEach(([t, c, mi, ma, u]) => {
      db.cip_parametros_faixas.push({ tipo_cip: t, campo: c, minimo: mi, maximo: ma, unidade: u, ativo: true, atualizado_em: dataFaixas + "T10:00:00-03:00", atualizado_por_nome: "EXEMPLO FICTÍCIO (prévia)" });
      db.cip_parametros_faixas_historico.push({ id: hid++, tipo_cip: t, campo: c, minimo: mi, maximo: ma, unidade: u, ativo: true, por_nome: "EXEMPLO FICTÍCIO (prévia)", criado_em: dataFaixas + "T10:00:00-03:00" });
    });
    const add = (tipo, equip, dias, extra = {}) => {
      const data = hojeChave(-dias);
      const r = { id: uuid(), tipo_cip: tipo, equipamento: equip, bbt: tipo === "osam" ? equip : null, data_cip: data, hora_inicial: "08:00:00", hora_final: tipo === "tanque_levedura" ? null : "09:10:00",
        nome_operador: extra.op || ops[Math.floor(rnd() * ops.length)], dados: extra.dados || {}, observacoes_operador: extra.obs || null,
        criado_em: `${data}T09:15:00-03:00`, criado_por: UID_OP, atualizado_em: `${data}T09:15:00-03:00`, atualizado_por: UID_OP, operador_id: null, verificacao_parametros: null };
      if (data >= dataFaixas) r.verificacao_parametros = verificar(db, r);
      db.cip_registros.push(r);
      return r;
    };
    const avaliar = (r, situacao, obs, horas = 6) => {
      const em = new Date(new Date(r.criado_em).getTime() + horas * 3600000).toISOString();
      db.cip_avaliacoes.push({ registro_id: r.id, situacao, observacao: obs || null, avaliador_nome: "Supervisão (prévia)", avaliador_uid: UID_ADM, avaliado_em: em, versao: 1, revisao_pendente: false, revisao_desde: null, revisao_por: null, revisao_ultima_em: null, revisao_ultimo_por: null, revisao_edicoes: [] });
      db.cip_avaliacoes_historico.push({ id: hid++, registro_id: r.id, situacao_anterior: "aguardando", situacao_nova: situacao, tipo_evento: "avaliacao", observacao: obs || null, avaliador_nome: "Supervisão (prévia)", avaliador_uid: UID_ADM, criado_em: em, versao: 1 });
    };
    // Registros dos últimos 12 meses (fictícios)
    const contaminacoes = { [tf(8)]: [12, 47, 95, 180], [tf(21)]: [33, 120, 260], [tf(60)]: [70, 210], "BBT 04": [25, 140], "Tanque de Levedura 03": [88], "Adega B": [150], "Tanque de PVPP — BPVPP": [55] };
    Object.entries(contaminacoes).forEach(([eq, dias]) => dias.forEach((d, i) => {
      const tipo = eq.startsWith("BBT") ? "osam" : eq.startsWith("Tanque de Levedura") ? "tanque_levedura" : eq === "Adega B" ? "alcalino_clorado" : eq.includes("PVPP") ? "filtracao_bmf" : (i % 2 ? "alcalino_clorado" : "completo");
      const r = add(tipo, eq, d, { dados: tipo === "completo" || tipo === "osam" ? dadosCompleto(i % 2 ? "4,6%" : "3,1%", "1,0%", "2,2 bar") : {} });
      avaliar(r, "contaminado", ["Resíduo de levedura no cone", "Biofilme na válvula de fundo", "Odor após enxágue", "Swab microbiológico positivo"][i % 4]);
    }));
    for (let i = 0; i < 70; i++) {
      const d = Math.floor(rnd() * 360) + 1;
      const k = rnd();
      let r;
      if (k < 0.35) { const s = rnd() < 0.2 ? "4,8%" : rnd() < 0.15 ? "1,6%" : (2.2 + rnd() * 1.6).toFixed(1).replace(".", ",") + "%"; r = add("completo", tf(1 + Math.floor(rnd() * 61)), d, { dados: dadosCompleto(s, rnd() < 0.15 ? "1,8%" : "0,9%", rnd() < 0.1 ? "3,4 bar" : "2,4 bar") }); }
      else if (k < 0.55) r = add("alcalino_clorado", tf(1 + Math.floor(rnd() * 61)), d);
      else if (k < 0.68) r = add("tanque_levedura", `Tanque de Levedura 0${1 + Math.floor(rnd() * 9)}`, d);
      else if (k < 0.76) r = add("linha_recuperacao_levedura", "Linha de Recuperação de Levedura", d);
      else if (k < 0.86) r = add("osam", `BBT ${String(1 + Math.floor(rnd() * 12)).padStart(2, "0")}`, d, { dados: dadosCompleto("3,0%", "1,0%", "2,0 bar") });
      else if (k < 0.93) r = add("filtracao_filtro3", "Filtro de Cerveja por placas — F03", d, { dados: { f3_ciclo: "1", f3_temperatura_solucao: "80 °C", f3_pressao: "2 bar" } });
      else r = add("filtracao_bmf", "Filtro de Cerveja de Membrana — BMF", d, { dados: { bmf_ciclo: "2", bmf_soaking: "NÃO", bmf_conc_inicial_soda: "3%" } });
      if (d > 3 && rnd() < 0.8) avaliar(r, "conforme", null, 4 + Math.floor(rnd() * 30));
    }
    // Adega: CIP Alcalino vencido (34 dias), Alcalino Clorado em dia, OSAN sem periodicidade
    add("alcalino", "Adega A", 34, { dados: dadosCompleto("2,9%", "1,0%", "2,1 bar") });
    add("alcalino", "Adega D", 66, { dados: dadosCompleto("3,2%", "1,1%", "2,0 bar") });
    avaliar(add("alcalino_clorado", "Adega D", 41), "conforme");
    add("osam", "BBT 07", 2, { dados: dadosCompleto("3,4%", "0,7%", "2,6 bar") });
    // Recentes com parâmetros fora da faixa fictícia (aguardando avaliação)
    add("completo", tf(14), 1, { dados: dadosCompleto("5,2%", "1,0%", "3,6 bar"), obs: "Concentração alta na partida" });
    add("completo", tf(33), 0, { dados: dadosCompleto("3,0%", "0,3%", "2,4 bar") });
    add("completo", tf(9), 0, { dados: dadosCompleto("2,8%", "1,1%", "2,2 bar") });
    // Um contaminado reavaliado (não duplica) e um conforme com revisão necessária
    const reav = db.cip_registros.find((r) => r.equipamento === tf(8));
    const av = db.cip_avaliacoes.find((a) => a.registro_id === reav.id);
    db.cip_avaliacoes_historico.push({ id: hid++, registro_id: reav.id, situacao_anterior: "contaminado", situacao_nova: "conforme", tipo_evento: "correcao", observacao: "Swab refeito sem crescimento", avaliador_nome: "Supervisão (prévia)", avaliador_uid: UID_ADM, criado_em: agora(), versao: 2 });
    db.cip_avaliacoes_historico.push({ id: hid++, registro_id: reav.id, situacao_anterior: "conforme", situacao_nova: "contaminado", tipo_evento: "correcao", observacao: "Contraprova positiva", avaliador_nome: "Supervisão (prévia)", avaliador_uid: UID_ADM, criado_em: agora(), versao: 3 });
    av.versao = 3; av.observacao = "Contraprova positiva";
    const rev = db.cip_avaliacoes.find((a) => a.situacao === "conforme");
    Object.assign(rev, { revisao_pendente: true, revisao_desde: agora(), revisao_por: "Ana Lima", revisao_ultima_em: agora(), revisao_ultimo_por: "Ana Lima", revisao_edicoes: [] });
    db._hid = hid;
    return db;
  }

  function verificar(db, r) {
    const faixas = db.cip_parametros_faixas.filter((f) => f.tipo_cip === r.tipo_cip && f.ativo).sort((a, b) => a.campo.localeCompare(b.campo));
    if (!faixas.length) return null;
    let fora = 0;
    const itens = faixas.map((f) => {
      const texto = String((r.dados || {})[f.campo] ?? "").trim() || null;
      const n = numero(texto);
      let s = texto === null ? "sem_valor" : n === null ? "nao_numerico" : f.minimo !== null && n < f.minimo ? "abaixo" : f.maximo !== null && n > f.maximo ? "acima" : "dentro";
      if (s === "abaixo" || s === "acima") fora++;
      return { campo: f.campo, valor: texto, numero: n, minimo: f.minimo, maximo: f.maximo, unidade: f.unidade, situacao: s, faixa_atualizada_em: f.atualizado_em };
    });
    return { verificado_em: r.criado_em || agora(), verificados: itens.length, fora_da_faixa: fora, itens };
  }

  function carregar() {
    const t = ler(CHAVE);
    if (t) { try { return JSON.parse(t); } catch (e) { /* recomeça */ } }
    const db = semear(); salvar(db); return db;
  }
  function salvar(db) { gravar(CHAVE, JSON.stringify(db)); }
  const sessao = () => { try { return JSON.parse(ler(CHAVE_SESSAO)); } catch (e) { return null; } };
  const papel = (db) => { const s = sessao(); const p = s && db.perfis.find((x) => x.uid === s.user.id); return p ? p.perfil : null; };
  const quem = (db) => { const s = sessao(); const p = s && db.perfis.find((x) => x.uid === s.user.id); return p ? p.nome : "—"; };

  // ---------- views e permissões (imitam a RLS) ----------
  function tabela(db, nome) {
    const role = papel(db);
    if (!role) return { erro: erro("42501", "permission denied") };
    if (["cip_operadores_historico", "cip_adega_controles_historico", "cip_parametros_faixas_historico"].includes(nome) && role !== "administrador") return { linhas: [] };
    if (nome === "vw_cip_registros") {
      return { linhas: db.cip_registros.map((r) => {
        const a = db.cip_avaliacoes.find((x) => x.registro_id === r.id);
        const { operador_id, ...base } = r;
        return { ...base, situacao_avaliacao: a ? a.situacao : "aguardando", revisao_pendente: a ? !!a.revisao_pendente : false, avaliacao_observacao: a ? a.observacao : null,
          avaliador_nome: a ? a.avaliador_nome : null, avaliado_em: a ? a.avaliado_em : null, avaliacao_versao: a ? a.versao : 0, revisao_desde: a ? a.revisao_desde : null,
          revisao_por: a ? a.revisao_por : null, revisao_ultima_em: a ? a.revisao_ultima_em : null, revisao_ultimo_por: a ? a.revisao_ultimo_por : null,
          revisao_qtd_edicoes: a ? (a.revisao_edicoes || []).length : 0, verificacao_parametros: r.verificacao_parametros };
      }) };
    }
    if (nome === "vw_cip_adega_datas_base_atual") {
      const atual = {};
      db.cip_adega_datas_base.forEach((e) => { atual[e.tipo_cip] = e; });
      return { linhas: Object.values(atual).filter((e) => e.acao === "definir").map((e) => ({ tipo_cip: e.tipo_cip, data_base: e.data_base, definido_por_nome: e.definido_por_nome, criado_em: e.criado_em })) };
    }
    if (nome === "vw_adega_datas_base_atual") return { linhas: [] };
    if (!db[nome]) return { erro: erro("42P01", `relation "public.${nome}" does not exist`) };
    return { linhas: db[nome] };
  }

  function comparar(valor, op, alvo) {
    if (op === "is") return alvo === null ? valor === null || valor === undefined : valor === alvo;
    if (op === "in") return (alvo || []).map(String).includes(String(valor));
    if (valor === null || valor === undefined) return false;
    if (op === "like" || op === "ilike") {
      const re = new RegExp("^" + String(alvo).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$", op === "ilike" ? "is" : "s");
      return re.test(String(valor));
    }
    const a = typeof valor === "number" ? valor : String(valor), b = typeof valor === "number" ? Number(alvo) : String(alvo);
    return { eq: a === b, neq: a !== b, gt: a > b, gte: a >= b, lt: a < b, lte: a <= b }[op];
  }

  class Consulta {
    constructor(t) { this.q = { tabela: t, filtros: [], ors: [], ordem: [], tipo: "select" }; }
    select(c) { if (this.q.tipo === "insert") this.q.retornar = c || "*"; else this.q.cols = c || "*"; return this; }
    insert(l) { this.q.tipo = "insert"; this.q.linhas = Array.isArray(l) ? l : [l]; return this; }
    _f(op, c, v) { this.q.filtros.push([op, c, v]); return this; }
    eq(c, v) { return this._f("eq", c, v); } neq(c, v) { return this._f("neq", c, v); }
    gt(c, v) { return this._f("gt", c, v); } gte(c, v) { return this._f("gte", c, v); }
    lt(c, v) { return this._f("lt", c, v); } lte(c, v) { return this._f("lte", c, v); }
    like(c, v) { return this._f("like", c, v); } ilike(c, v) { return this._f("ilike", c, v); }
    in(c, v) { return this._f("in", c, v); } is(c, v) { return this._f("is", c, v); }
    or(e) { this.q.ors.push(e); return this; }
    order(c, o) { this.q.ordem.push([c, !(o && o.ascending === false)]); return this; }
    limit(n) { this.q.limite = n; return this; }
    range(a, b) { this.q.offset = a; this.q.limite = b - a + 1; return this; }
    single() { this.q.single = true; return this; }
    maybeSingle() { this.q.maybe = true; return this; }
    then(okFn, falha) { return new Promise((res) => setTimeout(() => res(executar(this.q)), 15)).then(okFn, falha); }
  }

  function projetar(linha, cols) {
    if (!cols || cols.trim() === "*") return { ...linha };
    const o = {};
    cols.split(",").map((c) => c.trim()).filter(Boolean).forEach((c) => { o[c] = linha[c] === undefined ? null : linha[c]; });
    return o;
  }

  function executar(q) {
    const db = carregar();
    if (q.tipo === "insert") return inserir(db, q);
    const t = tabela(db, q.tabela);
    if (t.erro) return t.erro;
    let linhas = t.linhas.filter((l) => q.filtros.every(([op, c, v]) => comparar(l[c], op, v))
      && q.ors.every((expr) => expr.split(",").some((item) => { const [c, op, ...resto] = item.split("."); return comparar(l[c], op, resto.join(".")); })));
    if (q.ordem.length) linhas = [...linhas].sort((a, b) => { for (const [c, asc] of q.ordem) { const x = a[c], y = b[c]; if (x === y) continue; if (x === null || x === undefined) return 1; if (y === null || y === undefined) return -1; return (x < y ? -1 : 1) * (asc ? 1 : -1); } return 0; });
    if (q.offset) linhas = linhas.slice(q.offset);
    if (q.limite !== undefined) linhas = linhas.slice(0, q.limite);
    linhas = linhas.map((l) => projetar(JSON.parse(JSON.stringify(l)), q.cols));
    if (q.single || q.maybe) {
      if (linhas.length === 1) return ok(linhas[0]);
      if (q.maybe && !linhas.length) return ok(null);
      return erro("PGRST116", "JSON object requested, multiple (or no) rows returned");
    }
    return ok(linhas);
  }

  function inserir(db, q) {
    const role = papel(db);
    const s = sessao();
    if (q.tabela === "cip_registros") {
      if (role !== "operador") return erro("42501", 'new row violates row-level security policy for table "cip_registros"');
      const novos = [];
      for (const l of q.linhas) {
        const r = { id: uuid(), bbt: null, hora_final: null, observacoes_operador: null, dados: {}, ...l };
        if (r.tipo_cip === "osam") { if (!r.bbt) return erro("23514", "Selecione o BBT do CIP OSAN."); r.equipamento = r.bbt; }
        const cfg = db.cip_configuracao[0];
        if (cfg.bloquear_data_futura && cfg.tipos_data_futura.includes(r.tipo_cip) && r.data_cip > hojeChave()) return erro("23514", "A data do CIP não pode ser futura.");
        r.nome_operador = normNome(r.nome_operador);
        if (!nomeValido(r.nome_operador)) return erro("23514", "Nome do operador inválido: informe o nome (ao menos 2 letras, sem números ou símbolos).");
        const op = db.cip_operadores.find((o) => o.nome_chave === chaveNome(r.nome_operador));
        if (cfg.exigir_operador_cadastrado && (!op || !op.ativo)) return erro("23514", "Operador não cadastrado ou inativo: selecione um nome da lista de operadores.");
        if (op) { r.nome_operador = op.nome; r.operador_id = op.id; } else r.operador_id = null;
        if (r.hora_inicial && r.hora_inicial.length === 5) r.hora_inicial += ":00";
        if (r.hora_final && r.hora_final.length === 5) r.hora_final += ":00";
        r.criado_em = r.atualizado_em = agora(); r.criado_por = r.atualizado_por = s.user.id;
        r.verificacao_parametros = verificar(db, r);
        novos.push(r);
      }
      db.cip_registros.push(...novos); salvar(db);
      return ok(q.retornar ? novos.map((r) => projetar(r, q.retornar)) : null);
    }
    if (q.tabela === "cip_observacoes") {
      if (role !== "administrador") return erro("42501", "permission denied");
      const novos = q.linhas.map((l) => ({ id: uuid(), ...l, administrador_uid: s.user.id, administrador_nome: quem(db), criado_em: agora() }));
      if (novos.some((o) => !textoValido(o.texto))) return erro("23514", "Observação inválida: escreva uma explicação (sem respostas genéricas, até 300 caracteres).");
      db.cip_observacoes.push(...novos); salvar(db);
      return ok(q.retornar ? novos : null);
    }
    return erro("42501", "permission denied");
  }

  // ---------- funções (RPC) ----------
  const soAdm = (db, msg) => (papel(db) === "administrador" ? null : erro("42501", msg || "Somente o supervisor/administrador pode fazer isso."));
  const RPC = {
    avaliar_cip(db, a) {
      const e = soAdm(db, "Somente o supervisor/administrador pode avaliar o CIP."); if (e) return e;
      if (!["conforme", "contaminado"].includes(a.p_situacao)) return erro("22023", "Selecione Conforme ou Contaminado.");
      const r = db.cip_registros.find((x) => x.id === a.p_registro_id); if (!r) return erro("P0002", "Registro de CIP não encontrado.");
      let av = db.cip_avaliacoes.find((x) => x.registro_id === r.id);
      const anterior = av ? av.situacao : "aguardando", versao = av ? av.versao : 0, revisao = av ? av.revisao_pendente : false;
      if (a.p_versao_esperada !== versao) return erro("PT409", "Esta avaliação foi alterada por outra pessoa depois que a tela foi aberta. Recarregue para ver a decisão atual.");
      if (anterior === a.p_situacao && !revisao) return erro("22023", `O registro já está como ${anterior === "conforme" ? "Conforme" : "Contaminado"}. Para corrigir, selecione outra classificação.`);
      const texto = String(a.p_observacao || "").trim() || null;
      const obrigatorio = anterior !== "aguardando" || a.p_situacao === "contaminado";
      if ((obrigatorio || texto) && !textoValido(texto)) return erro("23514", anterior === "aguardando" && a.p_situacao === "contaminado" ? "Descrição da ocorrência inválida: escreva uma explicação (sem respostas genéricas, até 300 caracteres)." : "Justificativa inválida: escreva uma explicação (sem respostas genéricas, até 300 caracteres).");
      const evento = anterior === "aguardando" ? "avaliacao" : revisao && anterior === a.p_situacao ? "confirmacao_revisao" : revisao ? "reavaliacao_revisao" : "correcao";
      db.cip_avaliacoes_historico.push({ id: db._hid++, registro_id: r.id, situacao_anterior: anterior, situacao_nova: a.p_situacao, tipo_evento: evento, observacao: texto, avaliador_nome: quem(db), avaliador_uid: sessao().user.id, revisao_desde: revisao ? av.revisao_desde : null, criado_em: agora(), versao: versao + 1 });
      if (!av) { av = { registro_id: r.id, versao: 0, revisao_edicoes: [] }; db.cip_avaliacoes.push(av); }
      Object.assign(av, { situacao: a.p_situacao, observacao: texto, avaliador_nome: quem(db), avaliador_uid: sessao().user.id, avaliado_em: agora(), versao: versao + 1, revisao_pendente: false });
      salvar(db); return ok(av);
    },
    editar_registro_cip(db, a) {
      if (papel(db) !== "operador") return erro("42501", "Apenas o perfil operador pode editar registros de CIP.");
      const r = db.cip_registros.find((x) => x.id === a.p_registro_id); if (!r) return erro("P0002", "Registro de CIP não encontrado.");
      if (!textoValido(a.p_justificativa)) return erro("23514", 'Justificativa inválida: não pode ficar vazia, ser apenas números/símbolos, ou uma resposta genérica como "erro" ou "corrigir".');
      if (!nomeValido(a.p_alterado_por_nome)) return erro("23514", "Nome de quem está editando inválido: informe o nome (ao menos 2 letras).");
      if (a.p_data_cip > hojeChave()) return erro("23514", "A data do CIP não pode ser futura.");
      const snap = (x) => ({ tipo_cip: r.tipo_cip, equipamento: x.equipamento, data_cip: x.data_cip, hora_inicial: x.hora_inicial, hora_final: x.hora_final, nome_operador: x.nome_operador, observacoes_operador: x.observacoes_operador, dados: x.dados, ...(r.tipo_cip === "osam" ? { bbt: x.bbt } : {}) });
      const hm = (h) => (h && String(h).length === 5 ? h + ":00" : h || null);
      const novo = { equipamento: r.tipo_cip === "osam" ? a.p_bbt : a.p_equipamento, bbt: r.tipo_cip === "osam" ? a.p_bbt : null, data_cip: a.p_data_cip, hora_inicial: hm(a.p_hora_inicial), hora_final: hm(a.p_hora_final), nome_operador: normNome(a.p_nome_operador), observacoes_operador: a.p_observacoes_operador || null, dados: a.p_dados || {} };
      const antes = snap(r), depois = snap(novo);
      if (JSON.stringify(antes) === JSON.stringify(depois)) return erro("22023", "Nenhum campo foi alterado — nada para salvar.");
      const mudouDados = JSON.stringify(r.dados) !== JSON.stringify(novo.dados);
      Object.assign(r, novo, { atualizado_em: agora(), atualizado_por: sessao().user.id });
      if (mudouDados) r.verificacao_parametros = verificar(db, { ...r, criado_em: agora() });
      const ed = { id: uuid(), registro_id: r.id, valores_anteriores: antes, valores_novos: depois, justificativa: a.p_justificativa, alterado_por_uid: sessao().user.id, alterado_por_nome: normNome(a.p_alterado_por_nome), criado_em: agora() };
      db.cip_edicoes.push(ed);
      const av = db.cip_avaliacoes.find((x) => x.registro_id === r.id);
      if (av) Object.assign(av, { revisao_desde: av.revisao_pendente ? av.revisao_desde : agora(), revisao_por: av.revisao_pendente ? av.revisao_por : ed.alterado_por_nome, revisao_edicoes: av.revisao_pendente ? [...(av.revisao_edicoes || []), ed.id] : [ed.id], revisao_pendente: true, revisao_ultima_em: agora(), revisao_ultimo_por: ed.alterado_por_nome });
      salvar(db); return ok(r);
    },
    cadastrar_operador(db, a) {
      const e = soAdm(db, "Somente o supervisor/administrador pode cadastrar operadores."); if (e) return e;
      const n = normNome(a.p_nome);
      if (!nomeValido(n)) return erro("23514", "Nome inválido: use de 2 a 80 caracteres, só letras, espaços, ponto, hífen ou apóstrofo.");
      if (db.cip_operadores.some((o) => o.nome_chave === chaveNome(n))) return erro("23505", "Já existe um operador com este nome (ativo ou inativo). Reative o cadastro existente.");
      const o = { id: uuid(), nome: n, nome_chave: chaveNome(n), ativo: true, criado_em: agora(), criado_por_nome: quem(db), criado_por_uid: sessao().user.id, atualizado_em: null, atualizado_por_nome: null };
      db.cip_operadores.push(o);
      db.cip_operadores_historico.push({ id: db._hid++, operador_id: o.id, acao: "cadastrar", nome: n, por_nome: quem(db), por_uid: sessao().user.id, criado_em: agora() });
      salvar(db); return ok(o);
    },
    alterar_status_operador(db, a) {
      const e = soAdm(db); if (e) return e;
      const o = db.cip_operadores.find((x) => x.id === a.p_operador_id); if (!o) return erro("P0002", "Operador não encontrado.");
      if (o.ativo === a.p_ativo) return erro("22023", `O operador já está ${a.p_ativo ? "ativo" : "inativo"}.`);
      Object.assign(o, { ativo: a.p_ativo, atualizado_em: agora(), atualizado_por_nome: quem(db) });
      db.cip_operadores_historico.push({ id: db._hid++, operador_id: o.id, acao: a.p_ativo ? "reativar" : "desativar", nome: o.nome, por_nome: quem(db), por_uid: sessao().user.id, criado_em: agora() });
      salvar(db); return ok(o);
    },
    definir_exigencia_operador(db, a) { const e = soAdm(db); if (e) return e; if (a.p_exigir && !db.cip_operadores.some((o) => o.ativo)) return erro("23514", "Cadastre ao menos um operador ativo antes de tornar a lista obrigatória."); db.cip_configuracao[0].exigir_operador_cadastrado = !!a.p_exigir; salvar(db); return ok(null); },
    definir_alerta_espera(db, a) { const e = soAdm(db); if (e) return e; if (a.p_horas !== null && (a.p_horas < 1 || a.p_horas > 720)) return erro("22023", "Informe um número inteiro de horas entre 1 e 720, ou deixe em branco para não usar alerta."); db.cip_configuracao[0].alerta_espera_horas = a.p_horas; salvar(db); return ok(null); },
    definir_dias_aviso_adega(db, a) { const e = soAdm(db); if (e) return e; if (!(a.p_dias >= 1 && a.p_dias <= 120)) return erro("22023", "Informe um número inteiro de dias entre 1 e 120."); db.cip_configuracao[0].dias_aviso_adega = a.p_dias; salvar(db); return ok(null); },
    definir_periodicidade_adega(db, a) {
      const e = soAdm(db, "Somente o supervisor/administrador pode alterar a periodicidade da Adega."); if (e) return e;
      const c = db.cip_adega_controles.find((x) => x.tipo_cip === a.p_tipo_cip); if (!c) return erro("22023", "Procedimento da Adega inexistente.");
      if ((a.p_quantidade === null) !== (a.p_unidade === null)) return erro("22023", 'Informe a quantidade e a unidade (dias ou meses), ou deixe as duas em branco para "pendente de definição".');
      Object.assign(c, { periodo_quantidade: a.p_quantidade, periodo_unidade: a.p_unidade, dias_aviso: a.p_dias_aviso ?? null, atualizado_em: agora(), atualizado_por_nome: quem(db) });
      db.cip_adega_controles_historico.push({ id: db._hid++, tipo_cip: c.tipo_cip, periodo_quantidade: a.p_quantidade, periodo_unidade: a.p_unidade, dias_aviso: a.p_dias_aviso ?? null, por_nome: quem(db), criado_em: agora() });
      salvar(db); return ok(null);
    },
    definir_data_base_adega_geral(db, a) {
      const e = soAdm(db, "Somente o administrador pode definir a data-base da Adega."); if (e) return e;
      if (!a.p_data_base) return erro("22023", "Informe a data do último CIP realizado.");
      if (a.p_data_base > hojeChave()) return erro("23514", "A data-base não pode ser futura — use a data em que o último CIP foi de fato realizado.");
      const conta = (r) => r.tipo_cip === a.p_tipo_cip && (r.tipo_cip !== "alcalino_clorado" || ["Adega A", "Adega B", "Adega D"].includes(r.equipamento)) && r.data_cip <= hojeChave();
      if (db.cip_registros.some(conta)) return erro("23514", "Já existe registro deste procedimento na Adega — a periodicidade segue o último registro.");
      db.cip_adega_datas_base.push({ id: db._hid++, tipo_cip: a.p_tipo_cip, acao: "definir", data_base: a.p_data_base, definido_por_nome: quem(db), criado_em: agora() });
      salvar(db); return ok(null);
    },
    remover_data_base_adega_geral(db, a) {
      const e = soAdm(db); if (e) return e;
      db.cip_adega_datas_base.push({ id: db._hid++, tipo_cip: a.p_tipo_cip, acao: "remover", data_base: null, definido_por_nome: quem(db), criado_em: agora() });
      salvar(db); return ok(null);
    },
    definir_faixa_parametro(db, a) {
      const e = soAdm(db, "Somente o supervisor/administrador pode definir faixas de parâmetros."); if (e) return e;
      if (a.p_minimo === null && a.p_maximo === null) return erro("22023", "Informe ao menos o limite mínimo ou o máximo.");
      if (a.p_minimo !== null && a.p_maximo !== null && a.p_minimo > a.p_maximo) return erro("22023", "O limite mínimo não pode ser maior que o máximo.");
      let f = db.cip_parametros_faixas.find((x) => x.tipo_cip === a.p_tipo_cip && x.campo === a.p_campo);
      if (!f) { f = { tipo_cip: a.p_tipo_cip, campo: a.p_campo }; db.cip_parametros_faixas.push(f); }
      Object.assign(f, { minimo: a.p_minimo, maximo: a.p_maximo, unidade: a.p_unidade || null, ativo: a.p_ativo !== false, atualizado_em: agora(), atualizado_por_nome: quem(db) });
      db.cip_parametros_faixas_historico.push({ id: db._hid++, ...f, por_nome: quem(db), criado_em: agora() });
      salvar(db); return ok(null);
    },
    definir_limites_mapa_calor(db, a) {
      const e = soAdm(db); if (e) return e;
      if ((a.p_amarelo === null) !== (a.p_vermelho === null)) return erro("22023", "Informe os dois limites, ou deixe os dois em branco para usar a escala relativa.");
      if (a.p_amarelo !== null && (a.p_amarelo < 1 || a.p_vermelho > 1000 || a.p_amarelo >= a.p_vermelho)) return erro("22023", "Use números inteiros de 1 a 1000, com o limite do amarelo menor que o do vermelho.");
      Object.assign(db.cip_configuracao[0], { mapa_limite_amarelo: a.p_amarelo, mapa_limite_vermelho: a.p_vermelho });
      salvar(db); return ok(null);
    },
    cip_criar_backup(db) {
      const e = soAdm(db); if (e) return e;
      const contagens = {}; ["cip_registros", "cip_avaliacoes", "cip_edicoes", "cip_observacoes", "cip_operadores", "cip_parametros_faixas", "cip_adega_controles"].forEach((t) => { contagens[t] = db[t].length; });
      const b = { id: db.backups.length + 1, criado_em: agora(), criado_por_nome: quem(db), checksum_total: "prévia-sem-checksum-real", tamanho_bytes: JSON.stringify(db).length, contagens };
      db.backups.push(b); salvar(db);
      return ok({ id: b.id, gerado_em: b.criado_em, contagens, checksum_total: b.checksum_total });
    },
    cip_listar_backups(db) { const e = soAdm(db); if (e) return e; return ok([...db.backups].reverse()); },
    cip_obter_backup(db) { const e = soAdm(db); if (e) return e; return erro("P0001", "Na prévia o arquivo de backup não é gerado (não há banco real)."); },
    cip_verificar_backup(db) { const e = soAdm(db); if (e) return e; return erro("P0001", "Na prévia a verificação do backup não é executada (não há banco real)."); },
  };

  function createClient() {
    return {
      auth: {
        async signInWithPassword({ email }) {
          const uid = USUARIOS[String(email || "").trim().toLowerCase()];
          if (!uid) return { data: { session: null }, error: { message: "Invalid login credentials", status: 400 } };
          const session = { access_token: "previa", user: { id: uid, email, last_sign_in_at: agora() } };
          gravar(CHAVE_SESSAO, JSON.stringify(session));
          return { data: { session, user: session.user }, error: null };
        },
        async getSession() { return { data: { session: sessao() }, error: null }; },
        async signOut() { apagar(CHAVE_SESSAO); return { error: null }; },
        onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
      },
      from(t) { return new Consulta(t); },
      rpc(fn, args) {
        return new Promise((res) => setTimeout(() => {
          const db = carregar();
          if (!RPC[fn]) return res(erro("PGRST202", `Função ${fn} não existe na prévia.`));
          res(RPC[fn](db, args || {}));
        }, 20));
      },
    };
  }
  window.supabase = { createClient };
  window.CIP_PREVIA = {
    recomecar() { apagar(CHAVE); window.location.reload(); },
    sessao,
  };
})();
