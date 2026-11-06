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
  alcalino_clorado: "#1f4d3a",
  completo: "#3c7a5c",
  tanque_levedura: "#8a5a12",
  linha_recuperacao_levedura: "#2a4b57",
  osam: "#5b5796",
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
let CIP_CONFIG = { dias_aviso_adega: 30, bloquear_data_futura: true, tipos_data_futura: ["alcalino_clorado", "completo", "tanque_levedura", "linha_recuperacao_levedura", "osam"] };
async function cipCarregarConfiguracao() {
  const { data, error } = await supabaseClient.from("cip_configuracao").select("dias_aviso_adega, bloquear_data_futura, tipos_data_futura").eq("id", 1).maybeSingle();
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
// ADEGA — Alcalino Clorado a cada 6 meses e Completo a cada 12 meses
// (periodicidades em adega_procedimentos), separadamente para Adega A e B.
// A situação é sempre recalculada a partir dos registros; sem registro,
// vale a data-base definida pelo administrador; sem nenhum dos dois, a
// situação é "sem histórico" (nada é inventado).
// =====================================================================
const CIP_NOMES_ADEGAS = ["Adega A", "Adega B"];
const CIP_ROTULO_STATUS = { vencido: "Vencido", hoje: "Vence hoje", proximo: "Próximo do vencimento", realizado: "Realizado", emdia: "Em dia", semhistorico: "Sem histórico" };
const CIP_ICONE_ALERTA = '<svg class="icone-alerta" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4 2.5 42h43z" fill="currentColor"/><path d="M24 17v13" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/><circle cx="24" cy="36" r="2.8" fill="#fff"/></svg>';

async function cipCarregarAdega() {
  const [procs, bases, regs] = await Promise.all([
    supabaseClient.from("adega_procedimentos").select("adega, tipo_cip, meses").order("adega").order("meses"),
    supabaseClient.from("vw_adega_datas_base_atual").select("adega, tipo_cip, data_base, definido_por_nome, criado_em"),
    supabaseClient.from("vw_cip_registros")
      .select("id, tipo_cip, equipamento, bbt, data_cip, hora_inicial, hora_final, nome_operador, criado_em, situacao_avaliacao, revisao_pendente")
      .in("equipamento", CIP_NOMES_ADEGAS)
      .order("data_cip", { ascending: false })
      .limit(500),
    cipCarregarConfiguracao(),
  ]);
  const erro = procs.error || bases.error || regs.error;
  if (erro) throw erro;
  const procedimentos = procs.data || [];
  const registros = regs.data || [];
  const situacoes = procedimentos.map((p) => cipSituacaoProcedimento(p, registros, bases.data || []));
  return { procedimentos, registros, situacoes, diasAviso: CIP_CONFIG.dias_aviso_adega };
}

function cipSituacaoProcedimento(proc, registros, bases) {
  const hoje = cipHoje();
  const diasAviso = CIP_CONFIG.dias_aviso_adega;
  const regs = registros
    .filter((r) => r.tipo_cip === proc.tipo_cip && r.equipamento === proc.adega && r.data_cip <= hoje)
    .sort((a, b) => b.data_cip.localeCompare(a.data_cip) || String(b.criado_em).localeCompare(String(a.criado_em)));
  const base = bases.find((b) => b.adega === proc.adega && b.tipo_cip === proc.tipo_cip) || null;
  const res = { adega: proc.adega, tipo: proc.tipo_cip, meses: proc.meses, ultimo: null, fonte: null, registro: null, proxima: null, dias: null, status: "semhistorico", base, totalRegistros: regs.length };
  if (regs.length) { res.ultimo = regs[0].data_cip; res.fonte = "registro"; res.registro = regs[0]; }
  else if (base) { res.ultimo = base.data_base; res.fonte = "base"; }
  if (!res.ultimo) return res;
  res.proxima = cipChaveData(cipSomarMeses(cipDataDeChave(res.ultimo), proc.meses));
  res.dias = cipDiasEntre(hoje, res.proxima);
  if (res.dias < 0) res.status = "vencido";
  else if (res.dias === 0) res.status = "hoje";
  else if (res.dias <= diasAviso) res.status = "proximo";
  else if (res.fonte === "registro" && cipDiasEntre(res.ultimo, hoje) <= diasAviso) res.status = "realizado";
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
  return `Faltam ${s.dias} dia(s)`;
}
function cipSeloStatus(s) {
  const texto = s.status === "vencido" ? `Vencido · ${-s.dias} dia(s)` : s.status === "proximo" ? `Próximo · ${s.dias} dia(s)` : CIP_ROTULO_STATUS[s.status];
  return `<span class="selo-status st-${s.status}" data-status="${s.status}">${texto}</span>`;
}
function cipLinkFormularioAdega(tipo, adega) {
  return `registro.html?tipo=${encodeURIComponent(tipo)}&adega=${encodeURIComponent(adega)}`;
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
  const resumo = pend.map((p) => `${cipRotuloTipo(p.tipo)} — ${p.adega}`).join("; ");
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
                <div class="nome">${cipEsc(cipRotuloTipo(p.tipo))} — ${cipEsc(p.adega)}</div>
                <div class="meta">Data prevista: <strong>${cipFmtData(p.proxima)}</strong> · Periodicidade: ${p.meses} meses</div>
                <div style="margin-top:6px;">${cipSeloStatus(p)}</div>
              </div>
              <a class="botao-link primario" href="${cipLinkFormularioAdega(p.tipo, p.adega)}">Abrir formulário</a>
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
