# Auditoria de segurança — Sistema de Rastreabilidade de CIP (v8 → v8.1 → v9)

Data: 06/11/2026. Base: leitura do banco de produção (somente consultas, nada alterado),
do código em `docs/` e das migrações em `supabase/migrations/`. As correções propostas
foram implementadas na branch `feature/cip-v8-1` e testadas numa réplica local. A v8.1 e a v9
não estão publicadas e as migrações não foram aplicadas em produção.

## Arquitetura de segurança

- O site é estático (GitHub Pages). O navegador fala direto com o Supabase usando a
  **chave pública** (`sb_publishable_…` em `docs/js/config.js`), a mesma que qualquer
  visitante recebe. Toda proteção está no banco: RLS, privilégios e funções que conferem
  o perfil (`auth_role()`, que lê `perfis` pela conta logada).
- Duas contas compartilhadas: `operador` e `administrador` (supervisor). O nome de quem
  registra, edita ou avalia é declarado (operador/quem edita) ou vem do perfil da conta
  (avaliações, observações, Adega, Gestão).
- O projeto é compartilhado com o Painel FTR: nenhuma migração do CIP referencia objetos
  `painel_*`, e os testes conferem que eles não mudam.

## Resultado por item verificado

| # | Item | Situação encontrada | Resultado |
|---|------|--------------------|-----------|
| 1 | RLS em todas as tabelas | Ativa em todas as tabelas de `public` (CIP e FTR). | OK |
| 2 | Acesso de visitante sem login (anon) | Nenhum privilégio nas tabelas/visões do CIP (retirado na v8). | OK |
| 3 | Escrita direta pela API | Só `INSERT` em `cip_registros` (operador) e `cip_observacoes` (supervisor), ambos limitados por política. Avaliações, edições, Adega, operadores e backups só mudam por funções. `UPDATE`/`DELETE`/`TRUNCATE` retirados das tabelas do CIP. | OK |
| 4 | Separação operador × supervisor | Cada função confere o perfil internamente (`42501` para o perfil errado). Testado chamando as funções direto, sem passar pela tela. | OK |
| 5 | Funções `SECURITY DEFINER` | Todas com `search_path = ''` (sem sequestro de esquema), conferem `auth.uid()` e o perfil, e só `authenticated` pode executar. O aviso do Supabase "authenticated can execute SECURITY DEFINER" é **intencional** para essas funções. | OK (aviso esperado) |
| 6 | Validação de parâmetros | Situação da avaliação, textos (mesma regra do navegador, até 300 caracteres), datas (sem data futura), BBT (lista fixa), Adega (procedimento existente), dias/horas (faixas), nomes (v8.1). | OK |
| 7 | Concorrência das avaliações | Trava do registro + versão esperada (`PT409`). Testado com duas sessões reais. | OK, preservado |
| 8 | Históricos | Histórico de avaliações, datas-base da Adega, cadastro de operadores e backups: gatilhos recusam `UPDATE`/`DELETE`/`TRUNCATE` até para o dono do banco. Edições: sem privilégio de alteração pela API. | OK, preservado |
| 9 | Autoria forjada | Avaliador, autor de observação, autor de data-base e de cadastro vêm do perfil da conta (o valor enviado pelo navegador é ignorado). `criado_por` dos registros vem de `auth.uid()`. | OK |
| 10 | Nome do operador (texto livre) | Antes: aceitava espaços extras e qualquer texto não vazio. | **Corrigido na v8.1**: padronização e validação no banco; lista de operadores com exigência opcional. |
| 11 | Quem edita (texto livre) | Antes: só exigia não vazio. | **Corrigido na v8.1**: padronizado e validado no banco. |
| 12 | Backup | Não havia rotina; só a cópia manual de 06/11 (schema `cip_backup_20261106`). | **Implementado na v8.1**: backup sob demanda, protegido, com verificação de **integridade** (SHA-256) e recuperação não destrutiva. O SHA-256 **não prova autenticidade**: quem altera o arquivo pode recalcular o código (ver item 19). |
| 13 | Chave no JavaScript público | Só a chave pública. Busca por `service_role`, `sb_secret` e tokens JWT no repositório: nada encontrado. | OK |
| 14 | Exportação (CSV) | — | **v8.1**: células iniciadas por `= + - @` são neutralizadas (proteção contra fórmulas no Excel). |
| 15 | Equipamento e campos do procedimento | O banco aceita qualquer texto em `equipamento` e qualquer chave em `dados` vindos de um `INSERT` direto do perfil operador (as listas oficiais ficam no navegador). | Risco residual baixo (exige a senha da conta de operador). Não alterado para não duplicar as listas oficiais — ver pendências. |
| 16 | Proteção contra senhas vazadas (Auth) | Desligada. | **Pendente de autorização**: configuração global do projeto (afeta também o FTR). |
| 17 | 3ª conta de login sem perfil | `auth.users` tem 3 contas e `perfis` tem 2. A conta sem perfil entra na tela "Perfil não configurado" e a RLS não lhe mostra nenhum dado. | Sem exposição. **Pendente**: confirmar a quem pertence (Authentication → Users). |
| 19 | Autenticidade de arquivos exportados | Um `.json` exportado pode ser adulterado e ter os checksums recalculados. | **Mitigado (implementado):** a validação indica se o arquivo corresponde a uma cópia guardada no schema protegido (`snapshot_correspondente`). **Proposta (não ativada):** assinatura HMAC no banco com chave no Supabase Vault — exige configuração do projeto. |
| 20 | Exceção de validação na restauração | Na revisão de 0bf7c8a, a restauração ficava bloqueada por nomes históricos fora das regras atuais e não preservava valores exatamente. | **Corrigido:** os gatilhos só abrem exceção quando `cip_em_restauracao()` é verdadeira — marcador da transação **e** sessão que não é da API (`authenticator`). Testado: pela sessão da API, mesmo ligando o marcador, a validação continua; operador e supervisor não executam a restauração. |
| 21 | Atomicidade da migração | O arquivo dependia do executor abrir uma transação; aplicado com `psql` sem `-1`, uma falha deixava a v8.1 pela metade (demonstrado). | **Corrigido:** `BEGIN/COMMIT` no próprio arquivo + trava contra aplicação dupla ou sem a v8. Testado com falha provocada em 4 formas de aplicação. |
| 22 | Desfazer apagava dados da v8.1 | `DROP SCHEMA cip_backup CASCADE` e remoção das tabelas de operadores. | **Corrigido:** o desfazer arquiva tudo num schema protegido (`cip_arquivo_v8_1_…`) e permite reaplicar a migração. |
| 18 | Contas compartilhadas | A identidade real de quem usa a conta não é verificável pelo sistema. | Mitigado com nomes padronizados e lista de operadores. Contas individuais dependem de autorização. |

## O que a v8.1 acrescenta em segurança

- `cip_operadores` e `cip_operadores_historico`: leitura para perfis do CIP (o histórico
  só para o supervisor); gravação só por `cadastrar_operador` e `alterar_status_operador`;
  operadores não podem ser apagados.
- Schema `cip_backup`: sem `USAGE` para `anon`/`authenticated`; só acessível pelas funções
  do supervisor (`cip_criar_backup`, `cip_listar_backups`, `cip_obter_backup`,
  `cip_verificar_backup`) ou pelo dono do banco no SQL Editor (`cip_backup.restaurar`).
- Restauração **não destrutiva**: nunca atualiza nem apaga; linhas divergentes só são relatadas.

## O que a v9 (Filtração) muda em segurança

- Nada novo em permissões: os dois tipos de Filtração usam as mesmas tabelas, RLS, funções e
  regras dos outros tipos. Só o operador grava; só o supervisor avalia (test_v9.sh e testes de
  tela).
- As migrações só acrescentam dois valores ao tipo de CIP e incluem os dois tipos na regra de
  data futura. Nenhuma tabela, função, privilégio ou conta é criada, e nada do FTR é tocado.
- O item 15 vale também para os novos tipos: o banco não confere o equipamento nem as chaves de
  `dados` contra as listas oficiais (risco residual baixo, exige a senha da conta de operador).
- Não há limites operacionais no banco: as faixas do Anexo 3 são só texto informativo.

## Configuração padrão confirmada

- Duas contas compartilhadas (operador e administrador), sem contas novas.
- Lista obrigatória de operadores desligada.
- Limite de alerta de espera sem valor.
- Backups com SHA-256 de integridade; isso não comprova autenticidade (ver
  `BACKUP_E_RECUPERACAO.md`, seção 3).
- Recuperação aditiva: nunca sobrescreve nem apaga registros.

## Pendências que dependem de autorização

1. Ligar a proteção contra senhas vazadas (Authentication → Policies). É global e vale também para o FTR.
2. Identificar a 3ª conta de login.
3. Se desejado, validar `equipamento` no banco contra as listas oficiais (exigiria manter
   as listas em tabela; hoje ficam em `docs/js/equipamentos.js`).
4. Contas individuais por supervisor (só com autorização).
