// Substituto de TESTE do supabase-js (subconjunto usado pelo site).
// Envia cada consulta ao servidor local de teste, que executa no Postgres
// local com os papéis do Supabase. Não acessa nenhum serviço externo.
(function () {
  const BASE = "/__teste";
  const CHAVE = "fake-supabase-sessao";
  function lerSessao() { try { return JSON.parse(localStorage.getItem(CHAVE)); } catch (e) { return null; } }
  async function post(caminho, corpo) {
    const r = await fetch(BASE + caminho, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    return r.json();
  }
  class Consulta {
    constructor(tabela) { this.q = { tipo: "select", tabela, filtros: [], ors: [], ordem: [] }; }
    select(cols) { if (this.q.tipo === "insert") this.q.retornar = true; else this.q.cols = cols || "*"; return this; }
    insert(linhas) { this.q.tipo = "insert"; this.q.linhas = linhas; return this; }
    _f(op, c, v) { this.q.filtros.push([op, c, v]); return this; }
    eq(c, v) { return this._f("eq", c, v); }
    neq(c, v) { return this._f("neq", c, v); }
    gt(c, v) { return this._f("gt", c, v); }
    gte(c, v) { return this._f("gte", c, v); }
    lt(c, v) { return this._f("lt", c, v); }
    lte(c, v) { return this._f("lte", c, v); }
    like(c, v) { return this._f("like", c, v); }
    ilike(c, v) { return this._f("ilike", c, v); }
    in(c, v) { return this._f("in", c, v); }
    is(c, v) { return this._f("is", c, v); }
    or(expr) { this.q.ors.push(expr); return this; }
    order(c, o) { this.q.ordem.push([c, !(o && o.ascending === false)]); return this; }
    limit(n) { this.q.limite = n; return this; }
    range(a, b) { this.q.offset = a; this.q.limite = b - a + 1; return this; }
    single() { this.q.single = true; return this; }
    maybeSingle() { this.q.maybe = true; return this; }
    then(ok, falha) {
      const s = lerSessao();
      this.q.token = s ? s.user.id : null;
      return post("/q", this.q).then(ok, falha);
    }
  }
  function createClient() {
    return {
      auth: {
        async signInWithPassword({ email, password }) {
          const r = await post("/login", { email, password });
          if (r.error) return { data: { session: null }, error: r.error };
          const session = { access_token: "teste", user: { id: r.data.id, email: r.data.email, last_sign_in_at: new Date().toISOString() } };
          localStorage.setItem(CHAVE, JSON.stringify(session));
          return { data: { session, user: session.user }, error: null };
        },
        async getSession() { return { data: { session: lerSessao() }, error: null }; },
        async signOut() { localStorage.removeItem(CHAVE); return { error: null }; },
      },
      from(t) { return new Consulta(t); },
      rpc(fn, args) {
        const s = lerSessao();
        return post("/q", { tipo: "rpc", fn, args, token: s ? s.user.id : null });
      },
    };
  }
  window.supabase = { createClient };
})();
