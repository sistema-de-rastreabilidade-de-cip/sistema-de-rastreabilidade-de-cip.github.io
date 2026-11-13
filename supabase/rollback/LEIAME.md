# Scripts de desfazer (rollback)

Cada arquivo desfaz a migração de mesmo nome em `supabase/migrations/`. Antes de usar
qualquer um, gere um backup (Gestão) e ensaie numa réplica local
(`bash testes/banco/test_rollback.sh`).

| Script | Desfaz | O que acontece com os dados |
|--------|--------|-----------------------------|
| `20261113120100_cip_v10_desfazer.sql` | v10 (Adega geral, faixas, rastreabilidade) | **Nada é apagado.** As tabelas da v10 (controles e datas-base da Adega, faixas e históricos) vão para o schema `cip_arquivo_v10_AAAAMMDD_HHMMSS`, sem acesso pela API. Saem o gatilho de verificação e as funções novas (que não guardam dados). `vw_cip_registros` e as funções de backup voltam à v9. Ficam no banco, sem uso: os registros de CIP Alcalino, o valor `alcalino` do tipo, a coluna `verificacao_parametros` e os limites do mapa de calor. A v10 pode ser reaplicada depois. |
| `20261109120100_cip_v9_desfazer.sql` | v9 (Filtração) | **Nada é apagado.** Só tira os dois tipos de Filtração da regra de data futura. Os registros de Filtração continuam no banco, nos históricos e nos backups. Os valores do tipo de CIP ficam (o PostgreSQL não remove valores de enum), mas sem uso não afetam nada. O site anterior mostra esses registros só com o código do tipo. |
| `20261107120000_cip_v8_1_operadores_backup_desfazer.sql` | v8.1 | **Nada é apagado.** O schema `cip_backup` é renomeado para `cip_arquivo_v8_1_AAAAMMDD_HHMMSS` (horário de São Paulo), com os backups guardados, o log de restaurações e as funções históricas. `cip_operadores` e `cip_operadores_historico` são movidos para esse arquivo. Os vínculos registro→operador e os parâmetros da v8.1 viram as tabelas `registros_operador` e `configuracao_v8_1` no arquivo. Tudo fica sem acesso pela API. |
| `20261106120100_cip_v8_estrutura_desfazer.sql` | v8 | Remove avaliações, datas-base e registros OSAN (exporte-os antes). Devolve `editar_registro_cip` à versão anterior. |

Se for preciso desfazer mais de uma versão, desfaça da mais nova para a mais antiga (v10, v9, v8.1). O desfazer da v8.1 recusa a execução enquanto a v10 estiver aplicada. Para voltar o site, reverta o merge no `main`.

## Funcionamento do desfazer da v8.1

1. Confere se a v8.1 está aplicada. Se não estiver, para sem alterar nada.
2. Arquiva os dados, como na tabela acima.
3. Remove só o necessário para voltar à estrutura exata da v8: funções públicas e gatilhos
   da v8.1, a coluna `operador_id` e as colunas novas de `cip_configuracao`. Devolve a
   definição original de `cip_registros_validar_insert`.
4. Tudo numa transação: qualquer erro desfaz o desfazer (há teste com falha provocada).

Depois do desfazer:
- o site da v8 volta a funcionar normalmente (testado com os 96 testes de tela da v8);
- a migração v8.1 pode ser reaplicada sem conflito de nomes;
- cada novo desfazer cria outro schema de arquivo.

Consultar o arquivo (SQL Editor):
```sql
select nspname from pg_namespace where nspname like 'cip_arquivo_v8_1_%';
select id, criado_em, criado_por_nome, checksum_total from cip_arquivo_v8_1_AAAAMMDD_HHMMSS.snapshots;
select * from cip_arquivo_v8_1_AAAAMMDD_HHMMSS.cip_operadores;
```
As funções históricas no arquivo continuam se referindo ao nome `cip_backup`. Para usá-las
de novo, reaplique a v8.1: os snapshots arquivados podem ser validados com
`cip_backup.validar_arquivo(conteudo)` e restaurados com `cip_backup.restaurar(...)`.

## Como aplicar

SQL Editor do Supabase (arquivo inteiro) ou:
```bash
psql -v ON_ERROR_STOP=1 -f supabase/rollback/<arquivo>.sql
```
**Nunca aplicar em produção sem autorização explícita.**
