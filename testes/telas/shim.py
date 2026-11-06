#!/usr/bin/env python3
"""Servidor de TESTE local: serve o site (docs/) e traduz as chamadas do
supabase-js simulado (fake_supabase.js) para SQL no Postgres LOCAL
(banco cip_ui), com os mesmos papéis do Supabase (anon/authenticated) e
o mesmo auth.uid() — assim RLS, privilégios, gatilhos e funções são os
reais da migração. Nunca acessa o Supabase de produção."""
import json, os, re, subprocess, sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

DOCS = sys.argv[1]
DB = sys.argv[2] if len(sys.argv) > 2 else "cip_ui"
PORT = int(sys.argv[3]) if len(sys.argv) > 3 else 8787
HOST = os.environ.get("PGTESTE_DIR", "/var/lib/postgresql/cipteste")
PORTA = os.environ.get("PGTESTE_PORTA", "54329")
SENHAS = {"admin.teste@local": "teste123", "operador.teste@local": "teste123", "semperfil.teste@local": "teste123"}
IDENT = re.compile(r"^[a-z_][a-z0-9_]*$")

def lit(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "'true'" if v else "'false'"
    if isinstance(v, (dict, list)):
        v = json.dumps(v, ensure_ascii=False)
    return "'" + str(v).replace("'", "''") + "'"

def ident(c):
    if not IDENT.match(c):
        raise ValueError("identificador inválido: " + c)
    return c

def psql(sql):
    p = subprocess.run(["psql", "-h", HOST, "-p", PORTA, "-U", "postgres", "-d", DB, "-X", "-q", "-At",
                        "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"], input=sql, capture_output=True, text=True)
    if p.returncode != 0:
        m = re.search(r"ERROR:\s+([0-9A-Z]{5}):\s+(.*)", p.stderr)
        if m:
            return None, {"code": m.group(1), "message": m.group(2).strip(), "details": None, "hint": None}
        return None, {"code": "XX000", "message": p.stderr.strip()[:500]}
    linhas = [l for l in p.stdout.splitlines() if l.strip()]
    return (json.loads(linhas[-1]) if linhas else None), None

def prefixo(token):
    if token:
        claims = json.dumps({"sub": token, "role": "authenticated"})
        return f"begin;\nselect set_config('request.jwt.claims', {lit(claims)}, true) \\g /dev/null\nset local role authenticated;\n"
    return "begin;\nselect set_config('request.jwt.claims', '{\"role\":\"anon\"}', true) \\g /dev/null\nset local role anon;\n"

OPS = {"eq": "=", "neq": "<>", "gt": ">", "gte": ">=", "lt": "<", "lte": "<=", "like": "like", "ilike": "ilike"}

def cond(op, col, val):
    col = ident(col)
    if op in OPS:
        return f"{col} {OPS[op]} {lit(val)}"
    if op == "in":
        return f"{col} in ({', '.join(lit(x) for x in val)})" if val else "false"
    if op == "is":
        return f"{col} is {'null' if val is None else ('true' if val else 'false')}"
    raise ValueError("operador não suportado: " + op)

def cond_or(expr):
    partes = []
    for item in expr.split(","):
        col, op, val = item.split(".", 2)
        partes.append(cond(op, col, val))
    return "(" + " or ".join(partes) + ")"

def executar(q):
    token = q.get("token")
    tipo = q["tipo"]
    if tipo == "rpc":
        fn = ident(q["fn"])
        args = ", ".join(f"{ident(k)} => {lit(v)}" for k, v in (q.get("args") or {}).items())
        conj, _ = psql(f"select to_jsonb(coalesce(bool_or(proretset), false)) from pg_proc where proname = {lit(fn)} and pronamespace = 'public'::regnamespace;")
        if conj:  # função que retorna várias linhas: PostgREST devolve uma lista
            sql = prefixo(token) + f"select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.{fn}({args}) t;\ncommit;\n"
        else:
            sql = prefixo(token) + f"select to_json(public.{fn}({args}));\ncommit;\n"
        dados, erro = psql(sql)
        return dados, erro
    tabela = ident(q["tabela"])
    if tipo == "insert":
        linhas = q["linhas"] if isinstance(q["linhas"], list) else [q["linhas"]]
        cols = sorted({k for l in linhas for k in l})
        lista = ", ".join(ident(c) for c in cols)
        sql = prefixo(token) + (f"with ins as (insert into public.{tabela} ({lista}) select {lista} from json_populate_recordset(null::public.{tabela}, {lit(linhas)}) returning *)\n"
                                f"select coalesce(json_agg(ins)::jsonb, '[]'::jsonb) from ins;\ncommit;\n")
        dados, erro = psql(sql)
        if erro:
            return None, erro
        return (dados if q.get("retornar") else None), None
    cols = q.get("cols") or "*"
    cols = "*" if cols.strip() == "*" else ", ".join(ident(c.strip()) for c in cols.split(","))
    where = [cond(op, c, v) for op, c, v in q.get("filtros", [])]
    where += [cond_or(o) for o in q.get("ors", [])]
    sql_q = f"select {cols} from public.{tabela}"
    if where:
        sql_q += " where " + " and ".join(where)
    if q.get("ordem"):
        sql_q += " order by " + ", ".join(f"{ident(c)} {'asc' if a else 'desc'}" for c, a in q["ordem"])
    if q.get("limite") is not None:
        sql_q += f" limit {int(q['limite'])}"
    if q.get("offset"):
        sql_q += f" offset {int(q['offset'])}"
    sql = prefixo(token) + f"select coalesce(json_agg(t)::jsonb, '[]'::jsonb) from ({sql_q}) t;\ncommit;\n"
    dados, erro = psql(sql)
    if erro:
        return None, erro
    if q.get("single") or q.get("maybe"):
        if len(dados) == 1:
            return dados[0], None
        if q.get("maybe") and len(dados) == 0:
            return None, None
        return None, {"code": "PGRST116", "message": "JSON object requested, multiple (or no) rows returned"}
    return dados, None

class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=DOCS, **k)
    def log_message(self, *a):
        pass
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def responder(self, obj):
        corpo = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)
    def do_POST(self):
        tam = int(self.headers.get("Content-Length", 0))
        q = json.loads(self.rfile.read(tam) or b"{}")
        try:
            if self.path == "/__teste/login":
                if SENHAS.get(q.get("email")) != q.get("password"):
                    return self.responder({"data": None, "error": {"message": "Invalid login credentials", "status": 400}})
                dados, erro = psql(f"select json_build_object('id', id, 'email', email) from auth.users where email = {lit(q['email'])};")
                return self.responder({"data": dados, "error": erro})
            if self.path == "/__teste/q":
                dados, erro = executar(q)
                return self.responder({"data": dados, "error": erro})
            if self.path == "/__teste/sql":
                dados, erro = psql(q["sql"])
                return self.responder({"data": dados, "error": erro})
        except Exception as e:
            return self.responder({"data": None, "error": {"code": "XX000", "message": str(e)}})
        self.send_error(404)

ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
