#!/usr/bin/env bash
# Monta a PRÉVIA navegável da versão em desenvolvimento (pasta docs/) com o
# banco simulado no navegador. Não altera docs/ nem o site oficial.
# Uso: bash previa/montar_previa.sh <pasta de saída>
# Com ARTEFATO=1, prepara para publicar como página do Claude: a página de
# entrada é inicio.html e o login vira entrar.html (index.html é reservado).
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SAIDA="${1:?informe a pasta de saída}"
rm -rf "$SAIDA"; mkdir -p "$SAIDA/previa"
cp -r "$REPO/docs/." "$SAIDA/"
cp "$REPO/previa/banco_previa.js" "$REPO/previa/faixa_previa.js" "$SAIDA/previa/"
# Faixas oficiais: extraídas da própria migração v10 (uma só fonte).
python3 - "$REPO/supabase/migrations/20261113120100_cip_v10_adega_faixas_mapa.sql" "$SAIDA/previa/faixas_oficiais.js" <<'EOF'
import json, re, sys
sql = open(sys.argv[1], encoding="utf-8").read()
bloco = sql[sql.index("insert into public.cip_parametros_faixas (tipo_cip, campo, grupo_equipamento"):]
bloco = bloco[:bloco.index(") as v(tipo, campo, grupo")]
linhas = re.findall(r"\('([a-z_0-9]+)','([a-z_0-9]+)','([a-z_]+)',([0-9.]+|null),([0-9.]+|null),'([^']*)','([^']*)'\)", bloco)
num = lambda x: None if x == "null" else float(x)
dados = [[t, c, g, num(mi), num(ma), u, f] for t, c, g, mi, ma, u, f in linhas]
assert len(dados) == 59, len(dados)
open(sys.argv[2], "w", encoding="utf-8").write("// Gerado de supabase/migrations/20261113120100_cip_v10_adega_faixas_mapa.sql\nwindow.CIP_FAIXAS_OFICIAIS = " + json.dumps(dados, ensure_ascii=False) + ";\n")
EOF
# Configuração falsa: a prévia não conhece o endereço nem a chave do Supabase real.
cat > "$SAIDA/js/config.js" <<'EOF'
// PRÉVIA: sem endereço nem chave do Supabase real (banco simulado no navegador).
window.SUPABASE_URL = "https://previa.invalid";
window.SUPABASE_ANON_KEY = "previa-sem-chave";
EOF
python3 - "$SAIDA" <<'EOF'
import glob, os, re, sys
saida = sys.argv[1]
for f in glob.glob(os.path.join(saida, "*.html")):
    s = open(f, encoding="utf-8").read()
    s, n = re.subn(r'<script src="https://cdn\.jsdelivr\.net/npm/@supabase/supabase-js@[^"]+"></script>',
                   '<script src="previa/faixas_oficiais.js"></script>\n  <script src="previa/banco_previa.js"></script>\n  <script src="previa/faixa_previa.js"></script>', s)
    assert n == 1, f
    s = s.replace("<title>", "<title>[Prévia] ", 1)
    open(f, "w", encoding="utf-8").write(s)
EOF
grep -rl "krscjbdphymgzjteclif\|sb_publishable" "$SAIDA" && { echo "ERRO: referência ao Supabase real na prévia"; exit 1; } || true
if [ "${ARTEFATO:-0}" = "1" ]; then
  mv "$SAIDA/index.html" "$SAIDA/entrar.html"
  sed -i 's/index\.html/entrar.html/g' "$SAIDA/js/auth.js"
  sed 's/index\.html/entrar.html/g' "$REPO/previa/inicio.html" > "$SAIDA/inicio.html"
  rm -f "$SAIDA/.nojekyll"
fi
echo "Prévia montada em $SAIDA"
