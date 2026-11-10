# Backup e recuperação dos dados do CIP (v8.1 e v9)

> A v8.1 e a v9 foram publicadas em 10/11/2026 (site: `main` em `79d0e29`; migrações v8.1 e v9 aplicadas no banco de produção, nessa ordem). O FTR Beer Production (`painel_*`), que usa o
> mesmo projeto Supabase, não entra no backup e não é alterado.

## 1. O que entra no backup

Todas as tabelas do CIP, em ordem de dependência. As tabelas do Painel FTR **não** entram.

| Ordem | Tabela | Conteúdo |
|------:|--------|----------|
| 1 | `perfis` | perfis das contas (operador/administrador) |
| 2 | `cip_configuracao` | aviso da Adega, regra de data futura, exigência de operador, limite de alerta |
| 3 | `adega_procedimentos` | periodicidades da Adega A e B |
| 4 | `cip_operadores` | lista de operadores |
| 5 | `cip_operadores_historico` | cadastros, desativações e reativações |
| 6 | `cip_registros` | registros dos sete tipos de CIP, inclusive OSAN (BBT 01 a BBT 12) e os dois de Filtração (v9), com todos os campos do procedimento em `dados` |
| 7 | `cip_edicoes` | histórico de edições (antes/depois, justificativa, autor) |
| 8 | `cip_observacoes` | observações administrativas |
| 9 | `cip_avaliacoes` | situação atual de cada avaliação |
| 10 | `cip_avaliacoes_historico` | histórico imutável das avaliações |
| 11 | `adega_datas_base` | eventos de data-base da Adega |

Os campos de cada procedimento ficam na coluna `dados` (JSON) de `cip_registros`. Por
isso um novo tipo de CIP entra automaticamente no backup, sem mudar o formato.

## 2. Formato do arquivo (versão 1)

```json
{
  "formato": "cip-backup", "versao": 1, "gerado_em": "...",
  "ordem_tabelas": ["perfis", "..."],
  "tabelas":   { "cip_registros": [ {...} ], "...": [] },
  "contagens": { "cip_registros": 27 },
  "checksums": { "cip_registros": "<sha256>" },
  "checksum_total": "<sha256>"
}
```

`checksums[tabela]` é o SHA-256 do texto JSON canônico (formato do Postgres) das linhas
da tabela, ordenadas pela chave primária. `checksum_total` é o SHA-256 da concatenação
dos checksums das tabelas, na ordem acima.

## 3. Integridade não é autenticidade — limites do checksum

- **O que o SHA-256 garante (integridade):** detecta qualquer alteração acidental ou
  corrupção (arquivo truncado, caractere trocado, edição descuidada). A recuperação
  recusa o arquivo nesses casos.
- **O que o SHA-256 NÃO garante (autenticidade):** ele não prova quem gerou o arquivo.
  Quem conhece o formato pode alterar o conteúdo **e recalcular os checksums**; o arquivo
  adulterado passa a parecer íntegro. O checksum **não impede adulteração intencional**.
- **Indicação de origem (implementada):** a validação informa
  `snapshot_correspondente`, que é o número da cópia guardada no schema protegido com o
  mesmo `checksum_total`, se existir. Se um arquivo externo corresponde a uma cópia
  guardada, ele é idêntico a algo que o próprio sistema gerou. Isso só vale enquanto o
  banco estiver íntegro: não serve para arquivos de backups que não estão mais guardados
  no banco.
- **Proteções diferentes:**
  - *Cópias guardadas no banco* (`cip_backup.snapshots`): ficam num schema sem acesso
    pela API. Só o supervisor gera e consulta, por funções que conferem o perfil, e
    nenhum perfil consegue alterá-las ou apagá-las (há um gatilho de imutabilidade).
    Quem administra o projeto Supabase tem acesso total.
  - *Arquivos exportados* (`.json` baixado): ficam fora do sistema, sob a proteção de
    onde forem guardados. Qualquer pessoa com acesso ao arquivo pode lê-lo, porque ele
    contém todos os dados do CIP.
- **Cópia externa segura (orientação):**
  - Guarde o `.json` numa pasta com acesso restrito da coordenação, de preferência em
    dois lugares.
  - Anote, num registro separado (planilha de controle, e-mail para a coordenação), o
    número do backup, a data e o `checksum_total` mostrado na tela Gestão.
  - Na recuperação, confira que o `checksum_total` do arquivo é o mesmo anotado. Isso
    ajuda a detectar a troca do arquivo por outro.

**Proposta de autenticação criptográfica (não ativada):** assinar cada backup com HMAC-SHA-256
no próprio banco, usando uma chave secreta guardada no Supabase Vault (já instalado no
projeto) e a função `hmac()` do pgcrypto (também já instalado). A chave nunca iria para o
JavaScript: a assinatura seria feita e conferida só no banco. Ativar exige criar o segredo no
Vault, uma configuração do projeto compartilhado com o FTR, e por isso depende de
autorização. Sem ela, valem a indicação de origem e o registro separado do código.

## 4. Como gerar um backup (supervisor)

1. Entre como supervisor e abra **Gestão → Backup dos dados do CIP** → **Gerar backup agora**.
2. **Verificar:** confere a integridade e compara com os dados atuais. É só uma simulação:
   não grava nada.
3. **Baixar arquivo**, quando o computador permitir, e guardar como na seção 3. No PC da
   fábrica, onde downloads são bloqueados, a cópia fica guardada no banco.

A frequência não foi definida e cabe à coordenação. Prática sugerida: gerar um backup
antes de qualquer migração e ao fechar cada período de auditoria. O agendamento
automático exigiria ativar a extensão `pg_cron` (configuração do projeto, não feita).

## 5. Recuperação aditiva × restauração integral

**O que o sistema faz — recuperação ADITIVA (`cip_backup.restaurar`):**
- insere **apenas** as linhas que faltam no banco;
- linhas existentes e iguais são ignoradas;
- linhas existentes e **diferentes** são só **relatadas**, sem alteração;
- nunca apaga, nunca sobrescreve;
- preserva ids, datas, autores e valores históricos exatamente como estão no arquivo.

Serve para recuperar dados perdidos (registros apagados, tabela esvaziada, banco novo) sem
risco de destruir o que existe.

**Backups com registros de Filtração (v9):** o banco de destino precisa ter a migração
`20261109120000_cip_v9_tipos_filtracao.sql`. Sem ela, a recuperação é recusada com
"invalid input value for enum" e nada é gravado (testado: o banco ficou com as mesmas
contagens). Desfazer a v9 não impede a recuperação, porque os tipos de CIP continuam no banco.

**O que o sistema NÃO faz — restauração INTEGRAL:** voltar o banco inteiro para o estado
exato do backup, desfazendo o que mudou depois. Isso exigiria apagar ou sobrescrever dados
e trilhas de auditoria posteriores, o que as regras do sistema proíbem. Se um dia for
necessário, o caminho é a restauração de backup da própria plataforma (Point-in-Time
Recovery do Supabase, recurso pago e não ativado) ou um procedimento manual, decidido caso
a caso, sempre fazendo antes um novo backup do estado atual.

## 6. Registros antigos com nomes fora das regras atuais

As regras de nome da v8.1 (sem vazio, sem só números ou símbolos, sem espaços extras)
valem para **novos registros e novas edições**. Registros antigos podem ter nomes fora
dessas regras (por exemplo, criados antes da v8.1).
- **Na recuperação:** esses valores voltam **exatamente como estavam**, sem padronizar,
  recusar ou trocar nada. A função `cip_backup.restaurar` liga um marcador da transação, e
  os gatilhos deixam de validar **somente** quando esse marcador está ligado **e** a sessão
  não é da API pública (`cip_em_restauracao()`). Pela API, o navegador sempre usa a sessão
  `authenticator`, então não consegue usar essa exceção, e a função de restauração não
  pode ser executada por operador nem supervisor.
- **No uso diário:** o registro antigo continua visível, nos relatórios e nos backups, com o
  nome original. O banco aceita editar outros campos mantendo o nome antigo. No **site**,
  porém, o formulário de edição só aceita um nome válido: quem editar um registro desses
  precisa escolher ou digitar o nome correto, e a troca fica registrada no histórico.
- **Para corrigir um nome antigo:** edite o registro pelo site, com justificativa. A
  correção fica no histórico de alterações. Não altere diretamente no banco.

## 7. Recuperação passo a passo (responsável técnico, SQL Editor do Supabase)

1. **Ensaie antes (obrigatório para uma recuperação real):** rode a recuperação primeiro
   numa réplica local, com os testes do repositório:
   ```bash
   bash testes/iniciar_postgres.sh
   bash testes/banco/test_restaurar_arquivo.sh caminho/do/backup.json   # valida, simula e restaura num banco vazio
   ```
   O relatório mostra, tabela por tabela, se tudo voltou idêntico.
2. **Faça um backup do estado atual** em Gestão, antes de mexer em qualquer coisa.
3. **Escolha a cópia:**
   ```sql
   select id, criado_em, criado_por_nome, checksum_total from cip_backup.snapshots order by id desc;
   ```
   Para um arquivo externo, confira se o `checksum_total` é o mesmo anotado no registro
   separado.
4. **Valide** (formato, versão, contagens, checksums e indicação de origem):
   ```sql
   select jsonb_pretty(cip_backup.validar_arquivo(conteudo)) from cip_backup.snapshots where id = 5;
   select jsonb_pretty(cip_backup.validar_arquivo($json$ { ...conteúdo do arquivo... } $json$::jsonb));
   ```
   Continue só se `"valido": true`.
5. **Simule** (padrão da função, não grava nada):
   ```sql
   select jsonb_pretty(cip_backup.restaurar(conteudo)) from cip_backup.snapshots where id = 5;
   ```
   Confira por tabela: `novos` (o que seria inserido), `iguais`, `divergentes` e as chaves
   das divergentes.
6. **Restaure**, só depois de conferir a simulação. A função roda numa transação única: ou
   tudo, ou nada.
   ```sql
   select jsonb_pretty(cip_backup.restaurar(conteudo, false)) from cip_backup.snapshots where id = 5;
   ```
   A execução fica registrada em `cip_backup.restauracoes`.
7. **Confira** com um novo backup e compare as contagens.

## 8. Testes que comprovam o processo

| Teste | O que prova |
|-------|-------------|
| `test_v8_1.sh` | Permissões; geração; verificação; arquivo íntegro, adulterado, de versão errada e de formato desconhecido; simulação sem gravação; restauração completa num banco vazio; preservação de datas e autores; sequências; log; não destrutiva. |
| `test_restauracao_historica.sh` | Restauração **exata** de nomes históricos vazios, numéricos, só com símbolos e com espaços, além de autores de edição fora das regras e de `operador_id`. As regras continuam valendo para novos registros, e a exceção **não** pode ser usada pela sessão da API. Falha com a migração anterior e passa com a corrigida. |
| `test_restaurar_arquivo.sh` | Restaura num banco vazio o arquivo **baixado pela tela** e confere cada tabela. |
| `test_v8_1_ui.js` | Geração, verificação e download pela tela. |
