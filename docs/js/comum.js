// =====================================================================
// CIP v8 — utilidades compartilhadas por todas as páginas logadas:
// datas no fuso da fábrica, selos de avaliação/revisão, navegação por
// perfil e o cálculo/alerta da Adega. Lógica portada da demonstração v8
// aprovada; os dados vêm do Supabase (nada aqui é fixo ou fictício).
//
// Os nomes começam com "cip" para não colidir com funções já existentes
// em registro.js, historico.js, dashboard.js e validarJustificativa.js.
// =====================================================================

const CIP_FUSO = "America/Sao_Paulo";

// Date cujos getters locais já devolvem o horário de São Paulo,
// independente do fuso do computador de quem acessa.
function cipAgora() {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: CIP_FUSO, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const v = {};
  partes.forEach((p) => { if (p.type !== "literal") v[p.type] = p.value; });
  let hora = Number(v.hour);
  if (hora === 24) hora = 0;
  return new Date(Number(v.year), Number(v.month) - 1, Number(v.day), hora, Number(v.minute), Number(v.second));
}
function cipChaveData(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function cipHoje() { return cipChaveData(cipAgora()); }
function cipDataDeChave(chave) {
  const [a, m, d] = String(chave).split("-").map(Number);
  return new Date(a, m - 1, d);
}
// Soma meses de calendário; se o dia não existir no mês de destino
// (ex.: 31 + 1 mês), usa o último dia desse mês.
function cipSomarMeses(d, n) {
  const alvo = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(d.getDate(), ultimoDia));
  return alvo;
}
function cipDiasEntre(a, b) {
  return Math.round((cipDataDeChave(b) - cipDataDeChave(a)) / 86400000);
}
function cipFmtData(chave) {
  if (!chave) return "—";
  const [a, m, d] = String(chave).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}
function cipFmtDataHora(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: CIP_FUSO, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function cipHora(h) { return h ? String(h).slice(0, 5) : "—"; }

function cipEsc(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function cipMensagemErro(error, prefixo) {
  const classificado = error && typeof classificarErroSupabase === "function" ? classificarErroSupabase(error) : null;
  if (classificado && classificado.tipo !== "desconhecido" && classificado.tipo !== "credenciais") return classificado.mensagem;
  return (prefixo || "") + (error && error.message ? error.message : "erro desconhecido");
}

// ---- Tipos de CIP ----
const CIP_CORES_TIPO = {
  alcalino: "#4f6d1f",
  alcalino_clorado: "#1f4d3a",
  completo: "#3c7a5c",
  tanque_levedura: "#8a5a12",
  linha_recuperacao_levedura: "#2a4b57",
  osam: "#5b5796",
  filtracao_filtro3: "#7a5a2e",
  filtracao_bmf: "#2f6f8f",
};
function cipRotuloTipo(tipo) { return (typeof TIPO_CIP_LABELS !== "undefined" && TIPO_CIP_LABELS[tipo]) || tipo; }
// Nos registros OSAM o "equipamento" é o BBT.
function cipRotuloEquipHtml(r) {
  return r.tipo_cip === "osam" ? `<span class="tag-bbt">BBT</span>${cipEsc(String(r.bbt || r.equipamento).replace(/^BBT\s*/, ""))}` : cipEsc(r.equipamento);
}

// ---- Avaliação do CIP ----
const CIP_ROTULO_AVALIACAO = { aguardando: "Aguardando avaliação", conforme: "Conforme", contaminado: "Contaminado" };
const CIP_ROTULO_EVENTO_AV = {
  avaliacao: "Avaliação",
  correcao: "Correção",
  confirmacao_revisao: "Confirmação após revisão necessária",
  reavaliacao_revisao: "Reavaliação após revisão necessária",
};
function cipSituacao(r) { return (r && r.situacao_avaliacao) || "aguardando"; }
function cipTemRevisao(r) { return !!(r && r.revisao_pendente); }
function cipSeloAvaliacao(r) {
  const sit = cipSituacao(r);
  return `<span class="selo-avaliacao av-${sit}" data-avaliacao="${sit}">${CIP_ROTULO_AVALIACAO[sit]}</span>`;
}
function cipSeloRevisao(r) {
  return cipTemRevisao(r) ? '<span class="selo-revisao" data-revisao="pendente">Revisão necessária — dados alterados após a avaliação</span>' : "";
}
function cipSelos(r) { return `<span class="selos-avaliacao">${cipSeloAvaliacao(r)}${cipSeloRevisao(r)}</span>`; }

// ---- Regra de data futura (configuração em cip_configuracao) ----
// Situação: pendente de validação operacional. Enquanto não houver outra
// decisão, a data do CIP não pode ser posterior a hoje (fuso da fábrica)
// em todos os tipos. O banco aplica a mesma regra (cip_data_futura_bloqueada).
let CIP_CONFIG = { dias_aviso_adega: 30, bloquear_data_futura: true, tipos_data_futura: ["alcalino_clorado", "completo", "tanque_levedura", "linha_recuperacao_levedura", "osam", "filtracao_filtro3", "filtracao_bmf", "alcalino"] };
async function cipCarregarConfiguracao() {
  const { data, error } = await supabaseClient.from("cip_configuracao").select("*").eq("id", 1).maybeSingle();
  if (!error && data) CIP_CONFIG = data;
  return CIP_CONFIG;
}
function cipRegraDataFuturaAplica(tipo) {
  return !!CIP_CONFIG.bloquear_data_futura && (CIP_CONFIG.tipos_data_futura || []).includes(tipo);
}
function cipValidarDataCip(tipo, chave) {
  if (!chave) return "Informe a data do CIP.";
  if (cipRegraDataFuturaAplica(tipo) && chave > cipHoje()) return "A data do CIP não pode ser futura.";
  return null;
}
function cipDataMaxima(tipo) { return cipRegraDataFuturaAplica(tipo) ? cipHoje() : ""; }

// ---- Navegação por perfil ----
function cipConfigurarNavegacao(perfil) {
  document.querySelectorAll(".link-nav.so-admin").forEach((a) => a.classList.toggle("oculto", perfil.role !== "administrador"));
}

// =====================================================================
// ADEGA (v10) — modo geral, sem separar Adega A, B e D:
//   CIP Alcalino a cada 30 dias, CIP Alcalino Clorado a cada 6 meses e
//   CIP OSAN (BBT 01–12) com periodicidade pendente de definição.
// Periodicidades em cip_adega_controles (configuráveis pelo supervisor).
// A situação é sempre recalculada a partir dos registros; sem registro,
// vale a data-base definida pelo administrador; sem nenhum dos dois, a
// situação é "sem histórico"; sem periodicidade, "periodicidade pendente"
// (nada é inventado).
// =====================================================================
const CIP_NOMES_ADEGAS = ["Adega A", "Adega B", "Adega D"];
const CIP_TIPOS_ADEGA = ["alcalino", "alcalino_clorado", "osam"];
const CIP_ROTULO_STATUS = { vencido: "Vencido", hoje: "Vence hoje", proximo: "Próximo do vencimento", realizado: "Realizado", emdia: "Em dia", semhistorico: "Sem histórico", pendente: "Periodicidade pendente" };
const CIP_ICONE_ALERTA = '<svg class="icone-alerta" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4 2.5 42h43z" fill="currentColor"/><path d="M24 17v13" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/><circle cx="24" cy="36" r="2.8" fill="#fff"/></svg>';

// Mesma regra do banco (cip_registro_conta_adega): o Alcalino Clorado
// também é usado nos tanques de fermentação, que não entram na Adega.
function cipRegistroContaAdega(r) {
  if (r.tipo_cip === "alcalino" || r.tipo_cip === "osam") return true;
  if (r.tipo_cip === "alcalino_clorado") return CIP_NOMES_ADEGAS.includes(r.equipamento);
  return false;
}
function cipSomarDias(d, n) { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
function cipTextoPeriodicidade(proc) {
  if (!proc || !proc.periodo_quantidade) return "periodicidade pendente de definição";
  return `a cada ${proc.periodo_quantidade} ${proc.periodo_unidade === "dias" ? "dia(s)" : "mes(es)"}`;
}

async function cipCarregarAdega() {
  const [procs, bases, regs] = await Promise.all([
    supabaseClient.from("cip_adega_controles").select("tipo_cip, ordem, periodo_quantidade, periodo_unidade, dias_aviso, atualizado_por_nome, atualizado_em").order("ordem"),
    supabaseClient.from("vw_cip_adega_datas_base_atual").select("tipo_cip, data_base, definido_por_nome, criado_em"),
    supabaseClient.from("vw_cip_registros")
      .select("id, tipo_cip, equipamento, bbt, data_cip, hora_inicial, hora_final, nome_operador, criado_em, situacao_avaliacao, revisao_pendente")
      .in("tipo_cip", CIP_TIPOS_ADEGA)
      .order("data_cip", { ascending: false })
      .limit(1000),
    cipCarregarConfiguracao(),
  ]);
  const erro = procs.error || bases.error || regs.error;
  if (erro) throw erro;
  const procedimentos = procs.data || [];
  const registros = (regs.data || []).filter(cipRegistroContaAdega);
  const situacoes = procedimentos.map((p) => cipSituacaoProcedimento(p, registros, bases.data || []));
  return { procedimentos, registros, situacoes, diasAviso: CIP_CONFIG.dias_aviso_adega };
}

function cipSituacaoProcedimento(proc, registros, bases) {
  const hoje = cipHoje();
  const diasAviso = CIP_CONFIG.dias_aviso_adega;
  const regs = registros
    .filter((r) => r.tipo_cip === proc.tipo_cip && r.data_cip <= hoje)
    .sort((a, b) => b.data_cip.localeCompare(a.data_cip) || String(b.criado_em).localeCompare(String(a.criado_em)));
  const base = bases.find((b) => b.tipo_cip === proc.tipo_cip) || null;
  const res = { tipo: proc.tipo_cip, proc, ultimo: null, fonte: null, registro: null, proxima: null, dias: null, status: "semhistorico", base, totalRegistros: regs.length };
  if (regs.length) { res.ultimo = regs[0].data_cip; res.fonte = "registro"; res.registro = regs[0]; }
  else if (base) { res.ultimo = base.data_base; res.fonte = "base"; }
  if (!proc.periodo_quantidade) { res.status = "pendente"; return res; }
  if (!res.ultimo) return res;
  const inicio = cipDataDeChave(res.ultimo);
  res.proxima = cipChaveData(proc.periodo_unidade === "dias" ? cipSomarDias(inicio, proc.periodo_quantidade) : cipSomarMeses(inicio, proc.periodo_quantidade));
  res.dias = cipDiasEntre(hoje, res.proxima);
  // Antecedência do aviso: a deste procedimento, se o supervisor definiu;
  // senão, a geral da Adega.
  const aviso = proc.dias_aviso || diasAviso;
  res.diasAviso = aviso;
  const decorridos = cipDiasEntre(res.ultimo, hoje);
  const recente = res.fonte === "registro" && decorridos <= aviso;
  if (res.dias < 0) res.status = "vencido";
  else if (res.dias === 0) res.status = "hoje";
  // Períodos curtos (ex.: 30 dias com aviso de 30): as duas situações se
  // aplicam ao mesmo tempo; vale a mais próxima — "Realizado" na primeira
  // metade do prazo, "Próximo do vencimento" na segunda.
  else if (res.dias <= aviso && !(recente && decorridos < res.dias)) res.status = "proximo";
  else if (recente) res.status = "realizado";
  else res.status = "emdia";
  return res;
}
function cipPendenciasAdega(situacoes) {
  return situacoes.filter((s) => s.status === "vencido" || s.status === "hoje").sort((a, b) => a.dias - b.dias);
}
function cipTextoPrazo(s) {
  if (s.status === "vencido") return `Vencido há ${-s.dias} dia(s)`;
  if (s.status === "hoje") return "Vence hoje";
  if (s.status === "proximo") return `Vence em ${s.dias} dia(s)`;
  if (s.status === "semhistorico") return "Sem registro e sem data-base";
  if (s.status === "pendente") return "Sem periodicidade aprovada: não há data prevista nem alerta";
  return `Faltam ${s.dias} dia(s)`;
}
function cipSeloStatus(s) {
  const texto = s.status === "vencido" ? `Vencido · ${-s.dias} dia(s)` : s.status === "proximo" ? `Próximo · ${s.dias} dia(s)` : CIP_ROTULO_STATUS[s.status];
  return `<span class="selo-status st-${s.status}" data-status="${s.status}">${texto}</span>`;
}
function cipLinkFormularioAdega(tipo) {
  return `registro.html?tipo=${encodeURIComponent(tipo)}&adega=1`;
}

// Faixa persistente (todas as páginas) enquanto houver procedimento vencido ou vencendo hoje.
function cipMostrarFaixaAdega(perfil, situacoes) {
  let el = document.getElementById("faixa-alerta-adega");
  if (!el) {
    el = document.createElement("div");
    el.id = "faixa-alerta-adega";
    const topo = document.querySelector("header.topo");
    if (topo) topo.insertAdjacentElement("afterend", el); else document.body.prepend(el);
  }
  const pend = cipPendenciasAdega(situacoes);
  if (!pend.length) { el.innerHTML = ""; return; }
  const vencidos = pend.filter((p) => p.status === "vencido").length;
  const hoje = pend.length - vencidos;
  const partes = [];
  if (vencidos) partes.push(`<strong>${vencidos} vencido(s)</strong>`);
  if (hoje) partes.push(`<strong>${hoje} vence(m) hoje</strong>`);
  const resumo = pend.map((p) => cipRotuloTipo(p.tipo)).join("; ");
  el.innerHTML = `
    <div class="faixa-alerta-adega${vencidos ? "" : " so-hoje"}" role="alert">
      <div class="interno">
        ${CIP_ICONE_ALERTA}
        <div class="texto">CIP da Adega pendente: ${partes.join(" e ")}. <span>${cipEsc(resumo)}.</span></div>
        <button type="button" class="primario" id="btn-faixa-adega">${perfil.role === "operador" ? "Ver pendências" : "Ver na aba Adega"}</button>
      </div>
    </div>`;
  document.getElementById("btn-faixa-adega").addEventListener("click", () => {
    if (perfil.role === "operador") cipAbrirModalAdega(situacoes); else window.location.href = "adega.html";
  });
}

function cipFecharModalAdega() {
  const el = document.getElementById("modal-adega");
  if (el) el.innerHTML = "";
  document.removeEventListener("keydown", cipTeclaModalAdega);
}
function cipTeclaModalAdega(e) { if (e.key === "Escape") cipFecharModalAdega(); }
function cipAbrirModalAdega(situacoes) {
  const pend = cipPendenciasAdega(situacoes);
  if (!pend.length) return;
  let el = document.getElementById("modal-adega");
  if (!el) { el = document.createElement("div"); el.id = "modal-adega"; document.body.appendChild(el); }
  const algumVencido = pend.some((p) => p.status === "vencido");
  el.innerHTML = `
    <div class="modal-fundo" id="modal-fundo-adega">
      <div class="modal-alerta${algumVencido ? "" : " so-hoje"}" role="alertdialog" aria-modal="true" aria-labelledby="titulo-modal-adega">
        <div class="modal-cabecalho" style="color:${algumVencido ? "var(--cor-erro)" : "#c47a12"}">
          ${CIP_ICONE_ALERTA.replace('class="icone-alerta"', "")}
          <div>
            <h2 id="titulo-modal-adega">Atenção: CIP da Adega ${algumVencido ? "vencido" : "previsto para hoje"}</h2>
            <p>Os procedimentos abaixo chegaram à data prevista. Registre o CIP para atualizar a periodicidade.</p>
          </div>
        </div>
        <div class="modal-corpo">
          ${pend.map((p) => `
            <div class="item-pendente st-${p.status}">
              <div class="info">
                <div class="nome">${cipEsc(cipRotuloTipo(p.tipo))}</div>
                <div class="meta">Data prevista: <strong>${cipFmtData(p.proxima)}</strong> · Periodicidade: ${cipEsc(cipTextoPeriodicidade(p.proc))}</div>
                <div style="margin-top:6px;">${cipSeloStatus(p)}</div>
              </div>
              <a class="botao-link primario" href="${cipLinkFormularioAdega(p.tipo)}">Abrir formulário</a>
            </div>`).join("")}
        </div>
        <div class="modal-rodape">
          <span class="nota">O aviso continua no topo da tela enquanto houver procedimento pendente.</span>
          <button type="button" class="secundario" id="btn-fechar-modal-adega">Fechar</button>
        </div>
      </div>
    </div>`;
  document.getElementById("btn-fechar-modal-adega").addEventListener("click", cipFecharModalAdega);
  document.getElementById("modal-fundo-adega").addEventListener("click", (e) => { if (e.target.id === "modal-fundo-adega") cipFecharModalAdega(); });
  document.addEventListener("keydown", cipTeclaModalAdega);
  const primeiro = el.querySelector(".item-pendente .botao-link");
  if (primeiro) primeiro.focus();
}

// Chamado por todas as páginas logadas depois de exigirSessao().
// opcoes.modalAoEntrar: mostra o alerta da Adega ao operador uma vez por
// sessão de login (no painel), como na demonstração v8.
let CIP_ADEGA_ATUAL = null;
async function cipInicializarPagina(perfil, opcoes) {
  cipConfigurarNavegacao(perfil);
  try {
    CIP_ADEGA_ATUAL = await cipCarregarAdega();
  } catch (e) {
    console.error("Não foi possível calcular a situação da Adega:", e);
    return null;
  }
  cipMostrarFaixaAdega(perfil, CIP_ADEGA_ATUAL.situacoes);
  if (opcoes && opcoes.modalAoEntrar && perfil.role === "operador" && cipPendenciasAdega(CIP_ADEGA_ATUAL.situacoes).length) {
    let jaMostrado = false;
    let chave = "cipAlertaAdegaMostrado";
    try {
      const { data } = await supabaseClient.auth.getSession();
      const s = data && data.session;
      if (s) chave += ":" + s.user.id + ":" + (s.user.last_sign_in_at || "");
      jaMostrado = sessionStorage.getItem(chave) === "1";
      sessionStorage.setItem(chave, "1");
    } catch (e) { jaMostrado = false; }
    if (!jaMostrado) cipAbrirModalAdega(CIP_ADEGA_ATUAL.situacoes);
  }
  return CIP_ADEGA_ATUAL;
}

// =====================================================================
// v8.1 — nomes de pessoas, tempos de espera, diferenças de edição,
// exportação (CSV/arquivo) e integridade (SHA-256)
// =====================================================================

// Mesmas regras do banco (cip_normalizar_nome / cip_nome_pessoa_valido).
function cipNormalizarNome(nome) { return String(nome || "").replace(/\s+/g, " ").trim(); }
function cipChaveNome(nome) { return cipNormalizarNome(nome).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
function cipNomeValido(nome) {
  const n = cipNormalizarNome(nome);
  if (n.length < 2 || n.length > 80) return false;
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ .'-]+$/.test(n)) return false;
  return n.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "").length >= 2;
}
const CIP_MSG_NOME_INVALIDO = "use de 2 a 80 caracteres, só letras, espaços, ponto, hífen ou apóstrofo.";

let CIP_OPERADORES = null;
async function cipCarregarOperadores() {
  const { data, error } = await supabaseClient.from("cip_operadores").select("id, nome, ativo").order("nome");
  CIP_OPERADORES = error ? [] : data || [];
  return CIP_OPERADORES;
}

// Duração legível: "45 min", "5 h 10 min", "3 d 4 h".
function cipDuracao(ms) {
  if (ms == null || isNaN(ms)) return "—";
  const min = Math.max(0, Math.floor(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h${min % 60 ? ` ${min % 60} min` : ""}`;
  const d = Math.floor(h / 24);
  return `${d} d${h % 24 ? ` ${h % 24} h` : ""}`;
}
function cipMsDesde(iso) { return iso ? Date.now() - new Date(iso).getTime() : null; }
// Início/fim de um dia do calendário da fábrica em ISO (Brasil sem horário de verão desde 2019).
function cipInicioDiaIso(chave) { return chave ? `${chave}T00:00:00-03:00` : null; }
function cipFimDiaIso(chave) { return chave ? `${chave}T23:59:59.999-03:00` : null; }
function cipMediana(valores) {
  const v = valores.filter((x) => x != null && !isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// Diferenças de uma edição (valores_anteriores x valores_novos), por rótulo.
function cipDiferencasEdicao(e, tipoCip) {
  const antes = e.valores_anteriores || {};
  const depois = e.valores_novos || {};
  const config = (typeof FORM_CONFIG !== "undefined" && FORM_CONFIG[tipoCip]) || { campos: [] };
  const diffs = [];
  const fmt = (chave, valor) => {
    if (valor === null || valor === undefined || valor === "") return "—";
    if (chave === "data_cip") return cipFmtData(valor);
    if (chave === "hora_inicial" || chave === "hora_final") return cipHora(valor);
    return String(valor);
  };
  const comparar = (rotulo, chave, a, d) => {
    const va = fmt(chave, a);
    const vd = fmt(chave, d);
    if (va !== vd) diffs.push({ rotulo, de: va, para: vd });
  };
  if (tipoCip === "osam") comparar("BBT", "bbt", antes.bbt, depois.bbt);
  else comparar("Equipamento", "equipamento", antes.equipamento, depois.equipamento);
  comparar("Data do CIP", "data_cip", antes.data_cip, depois.data_cip);
  comparar("Hora inicial", "hora_inicial", antes.hora_inicial, depois.hora_inicial);
  comparar("Hora final", "hora_final", antes.hora_final, depois.hora_final);
  comparar("Operador", "nome_operador", antes.nome_operador, depois.nome_operador);
  comparar("Observações do operador", "observacoes_operador", antes.observacoes_operador, depois.observacoes_operador);
  const dadosA = antes.dados || {};
  const dadosD = depois.dados || {};
  const conhecidas = new Set();
  config.campos.forEach((c) => { conhecidas.add(c.key); comparar(c.label, c.key, dadosA[c.key], dadosD[c.key]); });
  new Set([...Object.keys(dadosA), ...Object.keys(dadosD)]).forEach((k) => { if (!conhecidas.has(k)) comparar(k, k, dadosA[k], dadosD[k]); });
  return diffs;
}

// ---- Exportação ----
// Célula CSV segura: aspas escapadas e proteção contra fórmulas (= + - @).
function cipCelulaCsv(valor) {
  let s = valor == null ? "" : String(valor);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
// CSV no padrão do Excel em português: separador ";" e BOM UTF-8.
function cipMontarCsv(cabecalho, linhas) {
  return [cabecalho, ...linhas].map((l) => l.map(cipCelulaCsv).join(";")).join("\r\n");
}
function cipMontarTsv(cabecalho, linhas) {
  const c = (v) => String(v == null ? "" : v).replace(/[\t\r\n]+/g, " ");
  return [cabecalho, ...linhas].map((l) => l.map(c).join("\t")).join("\n");
}
function cipBaixarArquivo(nome, conteudo, tipo) {
  const blob = new Blob([tipo && tipo.startsWith("text/csv") ? "﻿" + conteudo : conteudo], { type: tipo || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function cipCopiarTexto(texto) {
  try { await navigator.clipboard.writeText(texto); return true; }
  catch (e) {
    const ta = document.createElement("textarea");
    ta.value = texto; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
    ta.remove();
    return ok;
  }
}
async function cipSha256(texto) {
  if (!(window.crypto && crypto.subtle)) return null;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function cipCarimboArquivo() {
  const d = cipAgora();
  return `${cipChaveData(d)}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
}
// Busca linhas em lotes de ids (evita URLs longas demais).
async function cipBuscarPorIds(tabela, colunas, campoId, ids, ordem) {
  const lotes = [];
  for (let i = 0; i < ids.length; i += 80) lotes.push(ids.slice(i, i + 80));
  const resultados = await Promise.all(lotes.map((lote) => {
    let q = supabaseClient.from(tabela).select(colunas).in(campoId, lote);
    if (ordem) q = q.order(ordem, { ascending: true });
    return q;
  }));
  const erro = resultados.find((r) => r.error);
  if (erro) throw erro.error;
  return resultados.flatMap((r) => r.data || []);
}

// =====================================================================
// v10 — Verificação dos parâmetros contra as faixas aceitáveis
// O resultado vem do banco (cip_registros.verificacao_parametros), gravado
// no momento do registro/edição com as faixas vigentes. Os valores
// digitados nunca são alterados. Sem faixa cadastrada: sem verificação.
// =====================================================================
const CIP_ROTULO_VERIFICACAO = {
  dentro: "Dentro da faixa", abaixo: "Abaixo do mínimo", acima: "Acima do máximo",
  sem_valor: "Não preenchido", nao_numerico: "Sem número para comparar",
};
function cipRotuloCampo(tipo, chave) {
  const cfg = typeof FORM_CONFIG !== "undefined" && FORM_CONFIG[tipo];
  const campo = cfg && (cfg.campos || []).find((c) => c.key === chave);
  return campo ? campo.label : chave;
}
function cipFmtNumero(n) {
  if (n === null || n === undefined || n === "") return "—";
  return String(n).replace(".", ",");
}
function cipTabelaVerificacao(tipo, v) {
  if (!v || !Array.isArray(v.itens) || !v.itens.length) return '<p class="sem-dado">Nenhuma faixa cadastrada para este tipo de CIP quando o registro foi gravado: a comparação está desligada.</p>';
  const linhas = v.itens.map((i) => {
    const fora = i.situacao === "abaixo" || i.situacao === "acima";
    return `<tr class="verif-${i.situacao}${fora ? " verif-fora" : ""}">
      <td data-rotulo="Parâmetro">${cipEsc(cipRotuloCampo(tipo, i.campo))}</td>
      <td data-rotulo="Valor registrado" class="verif-valor">${cipEsc(i.valor ?? "—")}</td>
      <td data-rotulo="Mínimo">${cipFmtNumero(i.minimo)}${i.minimo !== null && i.unidade ? " " + cipEsc(i.unidade) : ""}</td>
      <td data-rotulo="Máximo">${cipFmtNumero(i.maximo)}${i.maximo !== null && i.unidade ? " " + cipEsc(i.unidade) : ""}</td>
      <td data-rotulo="Situação"><span class="selo-verif selo-verif-${i.situacao}">${fora ? "✕ " : i.situacao === "dentro" ? "✓ " : ""}${CIP_ROTULO_VERIFICACAO[i.situacao] || i.situacao}</span></td>
    </tr>`;
  }).join("");
  const fora = v.fora_da_faixa || 0;
  return `
    <div class="resumo-verif ${fora ? "tem-fora" : "tudo-ok"}">${fora ? `<strong>${fora} de ${v.verificados}</strong> parâmetro(s) fora da faixa` : `Os ${v.verificados} parâmetro(s) com faixa cadastrada estão dentro da faixa`}</div>
    <div class="tabela-rolagem"><table class="tabela-verificacao">
      <thead><tr><th>Parâmetro</th><th>Valor registrado</th><th>Mínimo</th><th>Máximo</th><th>Situação</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table></div>
    <p class="nota-verif">Comparação feita em ${cipFmtDataHora(v.verificado_em)}, com as faixas vigentes nesse momento. O valor registrado é mostrado exatamente como foi digitado; para comparar, o sistema usa o primeiro número do texto (vírgula ou ponto como decimal).</p>`;
}
function cipResumoVerificacaoTexto(tipo, v) {
  if (!v || !Array.isArray(v.itens) || !v.itens.length) return "Sem faixa cadastrada";
  const fora = v.itens.filter((i) => i.situacao === "abaixo" || i.situacao === "acima");
  if (!fora.length) return `Todos dentro da faixa (${v.verificados})`;
  return `${fora.length} de ${v.verificados} fora da faixa: ` + fora.map((i) =>
    `${cipRotuloCampo(tipo, i.campo)} = ${i.valor} (${i.situacao === "abaixo" ? "mín. " + cipFmtNumero(i.minimo) : "máx. " + cipFmtNumero(i.maximo)}${i.unidade ? " " + i.unidade : ""})`).join("; ");
}
