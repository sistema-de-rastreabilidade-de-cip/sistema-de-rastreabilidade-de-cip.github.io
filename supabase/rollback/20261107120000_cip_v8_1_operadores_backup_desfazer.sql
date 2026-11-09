-- =====================================================================
-- DESFAZER a migração 20261107120000_cip_v8_1_operadores_backup.sql
-- COM ARQUIVAMENTO (nenhum dado da v8.1 é apagado)
-- ---------------------------------------------------------------------
-- O que acontece:
--   1. Cria o schema de arquivo  cip_arquivo_v8_1_AAAAMMDD_HHMMSS
--      (data/hora de São Paulo). Na prática, é o schema cip_backup
--      RENOMEADO: os backups guardados (snapshots), o log de
--      restaurações e as funções históricas continuam lá.
--   2. Move para esse schema as tabelas cip_operadores e
--      cip_operadores_historico (a relação entre operadores e seus
--      eventos é preservada) e arquiva:
--        * registros_operador — vínculo de cada registro ao cadastro
--          (registro_id, nome_operador, operador_id), antes de remover a
--          coluna operador_id;
--        * configuracao_v8_1 — os parâmetros criados pela v8.1.
--   3. Remove só o que é necessário para voltar à estrutura da v8:
--      funções públicas e gatilhos da v8.1, a coluna operador_id e as
--      colunas novas de cip_configuracao. Devolve a definição original
--      da v8 de cip_registros_validar_insert.
--
-- Proteção: o schema de arquivo e as tabelas arquivadas ficam sem
-- acesso para anon/authenticated (nada aparece pela API pública).
-- Reaplicação: depois do desfazer, a migração v8.1 pode ser aplicada de
-- novo sem conflito de nomes (cip_backup e cip_operadores voltam a ser
-- criados do zero; o arquivo fica intacto, com outro nome).
-- Registros de CIP, edições, observações, avaliações e Adega não são
-- tocados. O Painel FTR não é tocado.
--
-- Aplicar pelo SQL Editor (arquivo inteiro) ou
--   psql -v ON_ERROR_STOP=1 -f <arquivo>
-- Tudo roda numa transação: um erro desfaz o desfazer.
-- =====================================================================
begin;

do $arquivar$
declare
  v_arquivo text := 'cip_arquivo_v8_1_' || to_char(clock_timestamp() at time zone 'America/Sao_Paulo', 'YYYYMMDD_HH24MISS');
begin
  if not exists (select 1 from pg_namespace where nspname = 'cip_backup')
     or to_regclass('public.cip_operadores') is null then
    raise exception 'A v8.1 não está aplicada (cip_backup ou cip_operadores ausentes). Nada foi alterado.';
  end if;
  if exists (select 1 from pg_namespace where nspname = v_arquivo) then
    raise exception 'O schema de arquivo % já existe. Aguarde um segundo e rode de novo.', v_arquivo;
  end if;

  -- 1. O schema de backup vira o schema de arquivo (snapshots, restaurações, funções).
  execute format('alter schema cip_backup rename to %I', v_arquivo);
  execute format('revoke all on schema %I from public, anon, authenticated', v_arquivo);
  execute format('comment on schema %I is %L', v_arquivo,
    'CIP: arquivo dos dados da v8.1 (backups, restaurações, operadores, vínculos e parâmetros), criado pelo desfazer em '
    || to_char(clock_timestamp() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') || '. Sem acesso pela API.');

  -- 2. Vínculos registro → operador e parâmetros da v8.1 (antes de remover as colunas).
  execute format('create table %I.registros_operador as
                    select id as registro_id, nome_operador, operador_id from public.cip_registros where operador_id is not null', v_arquivo);
  execute format('create table %I.configuracao_v8_1 as
                    select id, exigir_operador_cadastrado, alerta_espera_horas, atualizado_em, atualizado_por_nome, atualizado_por_uid
                    from public.cip_configuracao', v_arquivo);

  -- 3. Operadores e histórico: sem dependência das funções que serão removidas.
  alter table public.cip_operadores alter column nome_chave drop expression;   -- vira coluna comum (valores mantidos)
  alter table public.cip_operadores drop constraint if exists cip_operadores_nome_check;
  alter table public.cip_registros drop column operador_id;                    -- vínculo já arquivado acima
  execute format('alter table public.cip_operadores_historico set schema %I', v_arquivo);
  execute format('alter table public.cip_operadores set schema %I', v_arquivo);

  -- 4. Nada arquivado fica acessível pela API.
  execute format('revoke all on all tables in schema %I from public, anon, authenticated', v_arquivo);
  execute format('revoke all on all sequences in schema %I from public, anon, authenticated', v_arquivo);
  execute format('revoke all on all functions in schema %I from public, anon, authenticated', v_arquivo);
  execute format('alter table %I.registros_operador enable row level security', v_arquivo);
  execute format('alter table %I.configuracao_v8_1 enable row level security', v_arquivo);

  raise notice 'Dados da v8.1 arquivados no schema %', v_arquivo;
end
$arquivar$;

-- 5. Funções públicas da v8.1
drop function if exists public.cip_verificar_backup(bigint);
drop function if exists public.cip_obter_backup(bigint);
drop function if exists public.cip_listar_backups();
drop function if exists public.cip_criar_backup();
drop function if exists public.definir_alerta_espera(integer);
drop function if exists public.definir_exigencia_operador(boolean);
drop function if exists public.alterar_status_operador(uuid, boolean);
drop function if exists public.cadastrar_operador(text);

-- 6. Gatilhos da v8.1
drop trigger if exists trg_cip_edicoes_normalizar_autor on public.cip_edicoes;
drop function if exists public.cip_edicoes_normalizar_autor();
drop trigger if exists trg_cip_registros_operador on public.cip_registros;
drop function if exists public.cip_registros_operador();

-- 7. Gatilho de criação da v8 volta exatamente à definição original
create or replace function public.cip_registros_validar_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.tipo_cip = 'osam' then
    if new.bbt is null or btrim(new.bbt) = '' then
      raise exception 'Selecione o BBT do CIP OSAM.' using errcode = '23514';
    end if;
    new.equipamento := new.bbt;
  end if;
  if public.cip_data_futura_bloqueada(new.tipo_cip, new.data_cip) then
    raise exception 'A data do CIP não pode ser futura.' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- 8. Colunas novas de configuração (valores já arquivados) e funções auxiliares
alter table public.cip_configuracao drop column if exists exigir_operador_cadastrado;
alter table public.cip_configuracao drop column if exists alerta_espera_horas;
drop function if exists public.cip_em_restauracao();
drop function if exists public.cip_nome_pessoa_valido(text);
drop function if exists public.cip_nome_chave(text);
drop function if exists public.cip_normalizar_nome(text);

commit;
