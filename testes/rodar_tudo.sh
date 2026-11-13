#!/usr/bin/env bash
# Roda toda a suíte e mostra um resumo. Tudo local, com dados fictícios.
# Opcional:
#   SITE_V8_DIR=<pasta docs do site v8 (main)>  → testa o site v8 num banco com a v8.1 desfeita
#   LEGADO_DIR=<pasta public do site Netlify>   → testa a compatibilidade do site legado
source "$(dirname "$0")/ambiente.sh"
cd "$TESTES_DIR"
bash iniciar_postgres.sh >/dev/null
LOG="$PGTESTE_DIR/suite.log"; : > "$LOG"
rodar() { echo "### $1" >> "$LOG"; shift; "$@" >> "$LOG" 2>&1; }
rodar "banco/test_v8.sh"                    bash banco/test_v8.sh
rodar "banco/test_v8_1.sh"                  bash banco/test_v8_1.sh
rodar "banco/test_restauracao_historica.sh" bash banco/test_restauracao_historica.sh
rodar "banco/test_concorrencia.sh"          bash banco/test_concorrencia.sh
rodar "banco/test_rollback.sh"              bash banco/test_rollback.sh
rodar "banco/test_atomicidade.sh"           bash banco/test_atomicidade.sh
rodar "banco/test_v9.sh"                    bash banco/test_v9.sh
rodar "banco/test_v10.sh"                   bash banco/test_v10.sh
rodar "telas/test_v8_ui.js"                 bash telas/rodar.sh test_v8_ui.js
rodar "telas/test_v8_1_ui.js"               bash telas/rodar.sh test_v8_1_ui.js
rodar "banco/test_restaurar_arquivo.sh"     bash banco/test_restaurar_arquivo.sh
for extra in telas/test_v9_filtracao_ui.js telas/test_v10_ui.js; do
  [ -f "$extra" ] && rodar "$extra" bash telas/rodar.sh "$(basename "$extra")"
done
if [ -n "$SITE_V8_DIR" ]; then
  rodar "site em produção (main) num banco com todas as migrações, inclusive a v10 (migrações antes do site)" env DOCS_DIR="$SITE_V8_DIR" bash telas/rodar.sh test_v8_ui.js
  rodar "site em produção (main) num banco com a v10 desfeita" env DOCS_DIR="$SITE_V8_DIR" APOS_SQL="$REPO_DIR/supabase/rollback/20261113120100_cip_v10_desfazer.sql" bash telas/rodar.sh test_v8_ui.js
  rodar "site em produção (main) num banco com a v10 e a v8.1 desfeitas, nessa ordem" env DOCS_DIR="$SITE_V8_DIR" APOS_SQL="$REPO_DIR/supabase/rollback/20261113120100_cip_v10_desfazer.sql $REPO_DIR/supabase/rollback/20261107120000_cip_v8_1_operadores_backup_desfazer.sql" bash telas/rodar.sh test_v8_ui.js
fi
if [ -n "$LEGADO_DIR" ]; then
  bash banco/recriar.sh cip_legado todas >/dev/null
  python3 telas/shim.py "$LEGADO_DIR" cip_legado 8788 > "$PGTESTE_DIR/shim_legado.log" 2>&1 & S=$!; sleep 1
  rodar "site legado (Netlify) contra o banco atual" env NODE_PATH="$(npm root -g)" node telas/test_site_legado.js
  kill $S 2>/dev/null
fi
grep -E "^###|^Resultado|^FAIL" "$LOG"
! grep -q "^FAIL" "$LOG"
