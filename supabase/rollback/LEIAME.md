# Scripts de desfazer (rollback)

Cada arquivo desfaz a migração de mesmo nome em `supabase/migrations/`. Antes de usar
qualquer um, gere um backup (Gestão) e ensaie numa réplica local
(`bash testes/banco/test_rollback.sh`).

| Script | Desfaz | O que acontece com os dados |
|--------|--------|-----------------------------|
| `20261107120000_cip_v8_1_operadores_backup_desfazer.sql` | v8.1 | **Nada é apagado.** O schema `cip_backup` é renomeado para `cip_arquivo_v8_1_AAAAMMDD_HHMMSS` (horário de São Paulo), com os backups guardados, o log de restaurações e as funções históricas. `cip_operadores` e `cip_operadores_historico` são movidos para esse arquivo. Os vínculos registro→operador e os parâmetros da v8.1 viram as tabelas `registros_operador` e `configuracao_v8_1` no arquivo. Tudo fica sem acesso pela API. |
| `20261106120100_cip_v8_estrutura_desfazer.sql` | v8 | Remove avaliações, datas-base e registros OSAM (exporte-os antes). Devolve `editar_registro_cip` à versão anterior. |

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
