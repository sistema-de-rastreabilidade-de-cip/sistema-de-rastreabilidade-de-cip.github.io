// Substituto de TESTE do Chart.js (a CDN não é acessível neste ambiente).
// Desenha só um retângulo cinza e guarda a configuração recebida, para os
// testes conferirem rótulos e valores de cada gráfico.
(function () {
  window.__graficos = [];
  class Chart {
    constructor(alvo, config) {
      const canvas = typeof alvo.getContext === "function" ? alvo : alvo.canvas;
      this.canvas = canvas; this.data = config.data; this.options = config.options || {}; this.config = config;
      canvas.dataset.grafico = JSON.stringify({ tipo: config.type, labels: config.data.labels, valores: config.data.datasets.map((d) => d.data) });
      try { const ctx = canvas.getContext("2d"); ctx.fillStyle = "#e3e9e1"; ctx.fillRect(0, 0, canvas.width, canvas.height); } catch (e) {}
      window.__graficos.push(this);
    }
    update() {}
    destroy() { this.destroyed = true; }
  }
  window.Chart = Chart;
})();
