#!/usr/bin/env bash
# Roda um teste de tela: recria o banco local (todas as migrações + dados
# fictícios da Adega), sobe o servidor local e executa o arquivo indicado.
# Uso: bash testes/telas/rodar.sh test_v8_ui.js   (ou test_v8_1_ui.js)
# Opcional: DOCS_DIR=<pasta docs de outra versão do site>
#           APOS_SQL=<arquivo .sql aplicado depois dos dados fictícios> (ex.: o desfazer da v8.1)
source "$(dirname "$0")/../ambiente.sh"
cd "$TESTES_DIR/telas"
DB="${DB:-cip_ui}"; PORTA_WEB="${PORTA_WEB:-8787}"
pkill -f "shim.py .* $DB $PORTA_WEB" 2>/dev/null; sleep 0.3
bash "$TESTES_DIR/banco/recriar.sh" "$DB" todas || exit 1
"${PSQL_BASE[@]}" -d "$DB" -c "insert into cip_registros (tipo_cip, equipamento, data_cip, hora_inicial, hora_final, nome_operador, dados) values ('completo','Adega A',current_date-400,'07:00','08:00','Operador Fictício A','{}'),('alcalino_clorado','Adega A',current_date-20,'07:00','08:00','Operador Fictício B','{}');" >/dev/null
for arq in $APOS_SQL; do "${PSQL_BASE[@]}" -v ON_ERROR_STOP=1 -d "$DB" -f "$arq" >/dev/null || { echo "Falha ao aplicar $arq"; exit 1; }; done  # vários arquivos: separados por espaço, na ordem
python3 shim.py "${DOCS_DIR:-$REPO_DIR/docs}" "$DB" "$PORTA_WEB" > "$PGTESTE_DIR/shim_$DB.log" 2>&1 &
SHIM=$!
sleep 1
NODE_PATH="$(npm root -g)" timeout 900 node "${1:-test_v8_ui.js}"
R=$?
kill $SHIM 2>/dev/null
exit $R
