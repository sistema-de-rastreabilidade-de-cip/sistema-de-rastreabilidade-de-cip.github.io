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
                   '<script src="previa/banco_previa.js"></script>\n  <script src="previa/faixa_previa.js"></script>', s)
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
