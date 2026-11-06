# Backup e recuperação dos dados do CIP (v8.1)

## O que entra no backup

Todas as tabelas do CIP, em ordem de dependência:

| Ordem | Tabela | Conteúdo |
|------:|--------|----------|
| 1 | `perfis` | perfis das contas (operador/administrador) |
| 2 | `cip_configuracao` | aviso da Adega, regra de data futura, exigência de operador, limite de alerta |
| 3 | `adega_procedimentos` | periodicidades da Adega A e B |
| 4 | `cip_operadores` | lista de operadores |
| 5 | `cip_operadores_historico` | cadastros, desativações e reativações |
| 6 | `cip_registros` | registros de CIP (5 tipos, incluindo OSAM/BBT) |
| 7 | `cip_edicoes` | histórico de edições (antes/depois, justificativa, autor) |
| 8 | `cip_observacoes` | observações administrativas |
| 9 | `cip_avaliacoes` | situação atual de cada avaliação |
| 10 | `cip_avaliacoes_historico` | histórico imutável das avaliações |
| 11 | `adega_datas_base` | eventos de data-base da Adega |

Tabelas do Painel FTR **não** entram no backup.

## Formato do arquivo (versão 1)

```json
{
  "formato": "cip-backup",
  "versao": 1,
  "gerado_em": "...",
  "ordem_tabelas": ["perfis", "..."],
  "tabelas": { "cip_registros": [ {...}, ... ], "...": [] },
  "contagens": { "cip_registros": 27, "...": 0 },
  "checksums": { "cip_registros": "<sha256>", "...": "..." },
  "checksum_total": "<sha256>"
}
```

- `checksums[tabela]` é o SHA-256 do texto JSON (formato canônico do Postgres) da lista de
  linhas da tabela, ordenada pela chave primária.
- `checksum_total` é o SHA-256 da concatenação dos checksums das tabelas, na ordem acima.
- Qualquer alteração no arquivo, mesmo de uma letra, muda o checksum e a recuperação recusa
  o arquivo.

## Como gerar um backup (supervisor)

1. Entre como supervisor e abra **Gestão → Backup dos dados do CIP**.
2. Clique em **Gerar backup agora**. A cópia fica guardada no próprio banco (schema
   protegido `cip_backup`, sem acesso pela API pública), com número, data, autor e código de
   verificação.
3. Clique em **Verificar** para conferir a integridade e comparar com os dados atuais. É só
   uma simulação: não grava nada.
4. Quando o computador permitir downloads, clique em **Baixar arquivo** e guarde o `.json`
   fora do sistema (pasta da área, pendrive da coordenação). No PC da fábrica, onde
   downloads são bloqueados, a cópia guardada no banco continua disponível.

A frequência dos backups **não foi definida** e cabe à coordenação. Sugestão de prática:
gerar um backup antes de qualquer migração ou mudança importante e ao fechar cada período
de auditoria.

## Automação

Um backup automático (agendado) exigiria ativar a extensão `pg_cron` no projeto Supabase.
É uma mudança de configuração do projeto compartilhado com o FTR e **não foi feita**. Se
for autorizada, basta agendar `select public.cip_criar_backup();`, adaptado para rodar sem
usuário logado (por exemplo, uma função auxiliar só para o agendador). Os backups
automáticos do Supabase dependem do plano pago e também não foram ativados.

## Recuperação (responsável técnico, no SQL Editor do Supabase)

A recuperação nunca apaga e nunca sobrescreve: só **insere linhas que estão faltando**.
Linhas que existem e são iguais são ignoradas. Linhas que existem com conteúdo diferente
(por exemplo, uma avaliação corrigida depois do backup) são **apenas listadas** no
relatório. Assim a trilha de auditoria fica preservada.

### Passo a passo

1. **Escolha o backup.**
   - Se a cópia está no banco:
     ```sql
     select id, criado_em, criado_por_nome, checksum_total from cip_backup.snapshots order by id desc;
     ```
   - Se a cópia está num arquivo: abra o `.json` e copie todo o conteúdo.
2. **Valide** o formato, a versão, as contagens e os checksums:
   ```sql
   -- cópia guardada no banco
   select cip_backup.validar_arquivo(conteudo) from cip_backup.snapshots where id = 5;
   -- arquivo: cole o conteúdo entre $json$ e $json$
   select cip_backup.validar_arquivo($json$ { ...conteúdo do arquivo... } $json$::jsonb);
   ```
   Continue só se `"valido": true`.
3. **Simule.** É o padrão da função e não grava nada:
   ```sql
   select jsonb_pretty(cip_backup.restaurar(conteudo)) from cip_backup.snapshots where id = 5;
   ```
   Confira, por tabela: `novos` (o que seria inserido), `iguais` e `divergentes`, com as
   chaves das divergentes.
4. **Restaure**, só depois de conferir a simulação:
   ```sql
   select jsonb_pretty(cip_backup.restaurar(conteudo, false)) from cip_backup.snapshots where id = 5;
   ```
   A execução fica registrada em `cip_backup.restauracoes` (data, quem executou, código do
   arquivo e relatório).
5. **Confira** com um novo backup pela tela Gestão e compare as contagens.

### Garantias da função `cip_backup.restaurar`

- Recusa arquivo inválido, adulterado ou de versão incompatível, antes de qualquer gravação.
- Respeita a ordem de dependência: perfis → configuração → Adega → operadores → registros →
  edições → observações → avaliações → histórico → datas-base.
- Preserva ids, datas e autores originais: os gatilhos de auditoria são compensados e as
  sequências de ids são ajustadas.
- Nunca recria a linha de configuração e só recria um perfil se a conta de login ainda
  existir.
- Sem acesso pela API: só o dono do banco executa.

## Testes que comprovam o processo

| Teste | O que prova |
|-------|-------------|
| `testes/banco/test_v8_1.sh` | Permissões, geração, verificação, validação (arquivo íntegro, adulterado, versão errada, formato desconhecido), simulação sem gravação, restauração num banco vazio idêntica ao backup, datas/autores preservados, sequências, log, 2ª restauração sem efeito e sem sobrescrever divergências. |
| `testes/telas/test_v8_1_ui.js` | Geração e verificação pela tela, código de verificação igual ao do banco, arquivo baixado com formato, versão e conteúdo corretos. |
| `testes/banco/test_restaurar_arquivo.sh` | Restaura num banco vazio o **arquivo baixado pela tela** e confere tabela por tabela. |
