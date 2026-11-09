# Testes automatizados

Tudo roda localmente, num PostgreSQL de teste com **dados fictícios**. Nenhum teste acessa
o Supabase de produção. A réplica (`banco/replica_base.sql`) reproduz a estrutura do CIP
anterior à v8 e um esqueleto mínimo do Supabase: papéis `anon`/`authenticated`,
`auth.uid()` e tabelas `painel_*` vazias, usadas para provar que o FTR não é tocado. As
migrações reais de `supabase/migrations/` são aplicadas por cima.

## Requisitos

- PostgreSQL 14+ (`psql`, `initdb`, `pg_ctl`)
- Python 3, Node.js e Playwright (testes de tela)

## Como rodar

Tudo de uma vez (resumo no final):

```bash
SITE_V8_DIR=<pasta docs do main> LEGADO_DIR=<pasta public do site Netlify> bash testes/rodar_tudo.sh
```

Ou cada suíte:

```bash
bash testes/iniciar_postgres.sh               # cria/inicia o Postgres local (porta 54329)

# Banco
bash testes/banco/test_v8.sh                   # regressão das regras da v8 (68 verificações)
bash testes/banco/test_v8_1.sh                 # operadores, nomes, parâmetros, backup e restauração
bash testes/banco/test_concorrencia.sh         # duas sessões reais avaliando o mesmo CIP
bash testes/banco/test_restauracao_historica.sh # restauração exata de dados históricos fora das regras atuais
bash testes/banco/test_rollback.sh             # desfazer com arquivamento, reaplicação
bash testes/banco/test_atomicidade.sh          # falha provocada durante a migração/desfazer

# Telas (Playwright)
bash testes/telas/rodar.sh test_v8_ui.js       # regressão das funções da v8
bash testes/telas/rodar.sh test_v8_1_ui.js     # funções da v8.1 (gera o arquivo de backup baixado)
bash testes/banco/test_restaurar_arquivo.sh    # restaura o arquivo baixado pela tela num banco vazio
```

Nos testes de tela, a CDN do supabase-js e do Chart.js é substituída por `telas/fake_supabase.js`
e `telas/fake_chart.js`. O substituto do supabase-js envia cada consulta a `telas/shim.py`, que a
executa no Postgres local **com os papéis do Supabase**, de modo que RLS, privilégios, gatilhos e
funções são os reais. Os gráficos em si (Chart.js) não são renderizados nesses testes.

As capturas de tela e o PDF de exemplo ficam em `telas/capturas/` (ignorado pelo git).
