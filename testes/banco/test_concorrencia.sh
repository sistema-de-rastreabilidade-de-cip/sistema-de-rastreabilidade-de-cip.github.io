#!/usr/bin/env bash
# Concorrência real: duas sessões de supervisor avaliam o MESMO CIP ao mesmo
# tempo. A segunda precisa esperar a trava e ser recusada (PT409), sem
# sobrescrever a primeira; o histórico deve ter um único evento.
source "$(dirname "$0")/../ambiente.sh"
cd "$(dirname "$0")"
bash recriar.sh cip_conc todas || exit 1
P=(psql -h "$PGTESTE_DIR" -p "$PGTESTE_PORTA" -U postgres -d cip_conc -X -q -At -v VERBOSITY=verbose)
R=10000000-0000-0000-0000-000000000007
SESS="select set_config('request.jwt.claims','{\"sub\":\"00000000-0000-0000-0000-00000000000a\"}',false) \\g /dev/null
set role authenticated;"
TMP="$PGTESTE_DIR/conc_a.txt"
"${P[@]}" > "$TMP" 2>&1 <<SQL &
$SESS
begin;
select (avaliar_cip('$R','conforme',null,0)).versao;
select pg_sleep(2);
commit;
SQL
sleep 0.7
INICIO=$(date +%s.%N)
B=$("${P[@]}" 2>&1 <<SQL
$SESS
select avaliar_cip('$R','contaminado','Resíduo encontrado no cone do tanque',0);
SQL
)
ESPERA=$(echo "$(date +%s.%N) - $INICIO" | bc)
wait
OK=0; FAIL=0
ver() { if [ "$2" = "1" ]; then OK=$((OK+1)); echo "ok   - $1"; else FAIL=$((FAIL+1)); echo "FAIL - $1"; fi; }
ver "primeira sessão grava a avaliação (versão 1)" "$(grep -c '^1$' "$TMP")"
ver "segunda sessão espera a trava da primeira" "$(echo "$ESPERA > 0.8" | bc)"
ver "segunda sessão é recusada com conflito (PT409)" "$(echo "$B" | grep -c 'ERROR:  PT409')"
ver "histórico tem um único evento" "$("${P[@]}" -c "select count(*) from cip_avaliacoes_historico where registro_id='$R'")"
ver "a decisão gravada é a da primeira sessão (Conforme)" "$("${P[@]}" -c "select count(*) from cip_avaliacoes where registro_id='$R' and situacao='conforme'")"
echo; echo "Resultado: $OK ok, $FAIL falha(s)"
[ $FAIL -eq 0 ]
