// Faixa fixa da PRÉVIA e atalhos de entrada (operador / supervisor).
(function () {
  const css = `
    #faixa-previa { position: sticky; top: 0; z-index: 1000; background: repeating-linear-gradient(135deg, #2a2f2c 0 14px, #343a36 14px 28px);
      color: #fff; font: 600 0.8rem/1.3 "IBM Plex Sans", Arial, sans-serif; padding: 7px 16px; display: flex; gap: 10px; align-items: center; justify-content: center; flex-wrap: wrap; }
    #faixa-previa .etiqueta { background: #f5d97e; color: #3a2a00; border-radius: 3px; padding: 2px 8px; letter-spacing: 0.04em; }
    #faixa-previa button { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.6); border-radius: 4px; padding: 3px 10px; font: inherit; cursor: pointer; }
    #atalhos-previa { margin: 16px auto 0; max-width: 420px; border: 1px dashed #b9c4b7; border-radius: 6px; padding: 14px; background: #fff; font-family: "IBM Plex Sans", Arial, sans-serif; }
    #atalhos-previa p { margin: 0 0 10px; font-size: 0.86rem; color: #4b5750; }
    #atalhos-previa .linha { display: flex; gap: 8px; flex-wrap: wrap; }
    #atalhos-previa button { flex: 1 1 160px; padding: 10px; border-radius: 6px; border: 1px solid #1f4d3a; background: #1f4d3a; color: #fff; font: 600 0.9rem "IBM Plex Sans", Arial, sans-serif; cursor: pointer; }
    #atalhos-previa button.sup { background: #2a4b57; border-color: #2a4b57; }`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  function montar() {
    const f = document.createElement("div");
    f.id = "faixa-previa";
    f.innerHTML = '<span class="etiqueta">PRÉVIA v10</span><span>Dados fictícios. Nada aqui é gravado no sistema real.</span><button type="button" id="btn-recomecar-previa">Recomeçar a prévia</button>';
    document.body.prepend(f);
    document.getElementById("btn-recomecar-previa").addEventListener("click", () => window.CIP_PREVIA.recomecar());
    const form = document.getElementById("form-login") || (document.getElementById("email") && document.getElementById("email").closest("form"));
    if (form) {
      const box = document.createElement("div");
      box.id = "atalhos-previa";
      box.innerHTML = '<p>Entre na prévia com um dos perfis (sem senha real):</p><div class="linha"><button type="button" data-email="operador@previa.local">Entrar como operador</button><button type="button" class="sup" data-email="supervisor@previa.local">Entrar como supervisor</button></div>';
      form.insertAdjacentElement("afterend", box);
      const pedido = new URLSearchParams(location.search).get("entrar");
      const alvo = pedido && box.querySelector(`button[data-email^="${pedido === "supervisor" ? "supervisor" : "operador"}"]`);
      if (alvo) setTimeout(() => alvo.click(), 50);
      box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
        document.getElementById("email").value = b.dataset.email;
        document.getElementById("senha").value = "previa";
        document.getElementById("btn-entrar").click();
      }));
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar); else montar();
})();
