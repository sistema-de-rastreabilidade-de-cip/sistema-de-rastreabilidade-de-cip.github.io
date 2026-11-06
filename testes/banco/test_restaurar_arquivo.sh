#!/usr/bin/env bash
# Restaura um ARQUIVO de backup (baixado pela tela Gestão) num banco local
# vazio: valida, simula, restaura e confere tabela a tabela.
# Uso: bash testes/banco/test_restaurar_arquivo.sh caminho/backup.json
source "$(dirname "$0")/../ambiente.sh"
cd "$(dirname "$0")"
ARQ="${1:-$PGTESTE_DIR/backup_baixado_ui.json}"
[ -f "$ARQ" ] || { echo "Arquivo não encontrado: $ARQ"; exit 1; }
DB=cip_restaura_arquivo
bash recriar.sh $DB todas || exit 1
P=(psql -h "$PGTESTE_DIR" -p "$PGTESTE_PORTA" -U postgres -d $DB -X -q -At -v ON_ERROR_STOP=1)
"${P[@]}" -c "delete from cip_edicoes; delete from cip_observacoes; delete from cip_registros;" >/dev/null
C="$(cat "$ARQ")"
OK=0; FAIL=0
ver() { if [ "$2" = "$3" ]; then OK=$((OK+1)); echo "ok   - $1"; else FAIL=$((FAIL+1)); echo "FAIL - $1 [$2] x [$3]"; fi; }
ver "arquivo baixado é válido" "true" "$("${P[@]}" -v c="$C" <<< "select cip_backup.validar_arquivo(:'c'::jsonb)->>'valido';")"
N=$(python3 -c "import json,sys; print(len(json.load(open(sys.argv[1]))['tabelas']['cip_registros']))" "$ARQ")
ver "simulação prevê todos os registros como novos" "$N" "$("${P[@]}" -v c="$C" <<< "select cip_backup.restaurar(:'c'::jsonb, true) #>> '{tabelas,cip_registros,novos}';")"
"${P[@]}" -v c="$C" <<< "select cip_backup.restaurar(:'c'::jsonb, false);" >/dev/null || { echo "FAIL - restauração"; exit 1; }
for T in cip_registros cip_edicoes cip_observacoes cip_avaliacoes cip_avaliacoes_historico cip_operadores cip_operadores_historico adega_datas_base; do
  ESP=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['checksums'][sys.argv[2]])" "$ARQ" $T)
  ver "tabela $T restaurada idêntica (checksum)" "$ESP" "$("${P[@]}" -c "select cip_backup.montar_conteudo()->'checksums'->>'$T';")"
done
echo; echo "Resultado: $OK ok, $FAIL falha(s)"
[ $FAIL -eq 0 ]
