-- =====================================================================
-- DESFAZER CIP v10 — arquiva, não apaga
-- ---------------------------------------------------------------------
-- Uso: só se for preciso voltar o banco ao estado da v9 (por exemplo,
-- depois de voltar o site para a versão anterior). Executar no SQL Editor,
-- arquivo inteiro, numa execução só.
--
-- O que faz:
--   * move as tabelas novas da v10 (controles e datas-base da Adega, faixas
--     e históricos) para o schema cip_arquivo_v10_<data/hora>, sem acesso
--     pela API — nada é apagado;
--   * remove o gatilho de verificação das faixas e as funções novas (não
--     guardam dados);
--   * devolve vw_cip_registros e as funções de backup à definição da v8.1/v9.
-- O que NÃO faz (de propósito, para não perder dados):
--   * não apaga registros de CIP Alcalino nem o valor 'alcalino' do tipo
--     de CIP (o PostgreSQL não remove valores de enum);
--   * não apaga a coluna cip_registros.verificacao_parametros nem os
--     limites do mapa de calor em cip_configuracao (ficam sem uso).
-- Pode ser reaplicada a v10 depois: a migração recria as tabelas.
-- =====================================================================

begin;

do $desfazer$
declare
  v_schema text := 'cip_arquivo_v10_' || to_char(clock_timestamp() at time zone 'America/Sao_Paulo', 'YYYYMMDD_HH24MISS');
  t text;
begin
  if to_regclass('public.cip_adega_controles') is null then
    raise exception 'A v10 não está aplicada. Nada foi alterado.';
  end if;
  execute format('create schema %I', v_schema);
  execute format('revoke all on schema %I from public, anon, authenticated', v_schema);
  execute format('comment on schema %I is %L', v_schema, 'CIP: tabelas da v10 arquivadas pelo desfazer. Sem acesso pela API.');
  drop view public.vw_cip_adega_datas_base_atual;
  foreach t in array array['cip_adega_datas_base','cip_adega_controles_historico','cip_adega_controles',
                           'cip_parametros_faixas_historico','cip_parametros_faixas'] loop
    execute format('alter table public.%I set schema %I', t, v_schema);
    execute format('revoke all on %I.%I from public, anon, authenticated', v_schema, t);
  end loop;
  raise notice 'Tabelas da v10 arquivadas em %', v_schema;
end
$desfazer$;

drop trigger if exists trg_cip_registros_verificar_parametros on public.cip_registros;
drop function if exists public.cip_verificar_parametros();
drop function if exists public.definir_periodicidade_adega(public.tipo_cip_enum, integer, text, integer);
drop function if exists public.definir_data_base_adega_geral(public.tipo_cip_enum, date);
drop function if exists public.remover_data_base_adega_geral(public.tipo_cip_enum);
drop function if exists public.definir_faixa_parametro(public.tipo_cip_enum, text, numeric, numeric, text, boolean);
drop function if exists public.definir_limites_mapa_calor(integer, integer);
drop function if exists public.cip_registro_conta_adega(public.tipo_cip_enum, text);
drop function if exists public.cip_extrair_numero(text);
drop function if exists cip_backup.tabelas_opcionais();

-- vw_cip_registros: volta à definição da v8 (sem verificacao_parametros)
drop view public.vw_cip_registros;
create view public.vw_cip_registros with (security_invoker = true) as
select r.id, r.tipo_cip, r.equipamento, r.data_cip, r.hora_inicial, r.hora_final, r.nome_operador, r.dados,
       r.observacoes_operador, r.criado_em, r.criado_por, r.atualizado_em, r.atualizado_por, r.bbt,
       coalesce(a.situacao, 'aguardando') as situacao_avaliacao,
       coalesce(a.revisao_pendente, false) as revisao_pendente,
       a.observacao as avaliacao_observacao,
       a.avaliador_nome,
       a.avaliado_em,
       coalesce(a.versao, 0) as avaliacao_versao,
       a.revisao_desde,
       a.revisao_por,
       a.revisao_ultima_em,
       a.revisao_ultimo_por,
       coalesce(cardinality(a.revisao_edicoes), 0) as revisao_qtd_edicoes
from public.cip_registros r
left join public.cip_avaliacoes a on a.registro_id = r.id;
revoke all on public.vw_cip_registros from anon, authenticated;
grant select on public.vw_cip_registros to authenticated;

-- Funções de backup: definição da v8.1 (cópia literal)
create or replace function cip_backup.tabelas()
returns table (ordem integer, tabela text, chave text[]) language sql immutable set search_path = '' as $$
  values
    (1,  'perfis',                   array['uid']),
    (2,  'cip_configuracao',         array['id']),
    (3,  'adega_procedimentos',      array['adega','tipo_cip']),
    (4,  'cip_operadores',           array['id']),
    (5,  'cip_operadores_historico', array['id']),
    (6,  'cip_registros',            array['id']),
    (7,  'cip_edicoes',              array['id']),
    (8,  'cip_observacoes',          array['id']),
    (9,  'cip_avaliacoes',           array['registro_id']),
    (10, 'cip_avaliacoes_historico', array['id']),
    (11, 'adega_datas_base',         array['id'])
$$;

create or replace function cip_backup.validar_arquivo(p_conteudo jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  t record;
  v_erros text[] := '{}';
  v_linhas jsonb;
  v_concat text := '';
begin
  if p_conteudo is null or jsonb_typeof(p_conteudo) <> 'object' then
    return jsonb_build_object('valido', false, 'erros', jsonb_build_array('Arquivo vazio ou não é um objeto JSON.'));
  end if;
  if p_conteudo->>'formato' is distinct from 'cip-backup' then
    v_erros := array_append(v_erros, 'Formato desconhecido (esperado "cip-backup").'::text);
  end if;
  if p_conteudo->>'versao' is distinct from '1' then
    v_erros := array_append(v_erros, format('Versão de formato incompatível: %s (esta função lê a versão 1).', coalesce(p_conteudo->>'versao', 'ausente'))::text);
  end if;
  if jsonb_typeof(p_conteudo->'tabelas') is distinct from 'object' then
    v_erros := array_append(v_erros, 'Seção "tabelas" ausente.'::text);
    return jsonb_build_object('valido', false, 'erros', to_jsonb(v_erros));
  end if;
  for t in select * from cip_backup.tabelas() order by ordem loop
    v_linhas := p_conteudo->'tabelas'->t.tabela;
    if v_linhas is null or jsonb_typeof(v_linhas) <> 'array' then
      v_erros := array_append(v_erros, format('Tabela %s ausente no arquivo.', t.tabela)::text);
      continue;
    end if;
    if (p_conteudo->'contagens'->>t.tabela)::int is distinct from jsonb_array_length(v_linhas) then
      v_erros := array_append(v_erros, format('Contagem divergente em %s.', t.tabela)::text);
    end if;
    if p_conteudo->'checksums'->>t.tabela is distinct from cip_backup.checksum(v_linhas) then
      v_erros := array_append(v_erros, format('Checksum divergente em %s: o arquivo foi alterado ou está corrompido.', t.tabela)::text);
    end if;
    v_concat := v_concat || cip_backup.checksum(v_linhas);
  end loop;
  if cardinality(v_erros) = 0 and p_conteudo->>'checksum_total' is distinct from encode(sha256(convert_to(v_concat, 'UTF8')), 'hex') then
    v_erros := array_append(v_erros, 'Checksum total divergente.'::text);
  end if;
  -- Indicação de ORIGEM: o mesmo código existe entre as cópias guardadas no
  -- schema protegido? (Integridade não prova autenticidade — ver documentação.)
  return jsonb_build_object('valido', cardinality(v_erros) = 0, 'erros', to_jsonb(v_erros),
    'gerado_em', p_conteudo->'gerado_em', 'contagens', p_conteudo->'contagens', 'checksum_total', p_conteudo->'checksum_total',
    'snapshot_correspondente', (select s.id from cip_backup.snapshots s
                                 where s.checksum_total = p_conteudo->>'checksum_total' order by s.id limit 1));
end;
$$;

create or replace function cip_backup.restaurar(p_conteudo jsonb, p_simular boolean default true)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_validacao jsonb := cip_backup.validar_arquivo(p_conteudo);
  t record;
  v_linha jsonb;
  v_atual jsonb;
  v_rel jsonb := '{}'::jsonb;
  v_novos integer; v_iguais integer; v_div integer; v_ign integer;
  v_div_chaves jsonb;
  v_where text;
  v_seq text;
  v_cols text;
begin
  -- Nunca pela API pública (defesa extra: a função já não tem permissão de execução para ela).
  if session_user::text in ('authenticator', 'anon', 'authenticated', 'service_role')
     or current_user::text in ('anon', 'authenticated', 'service_role') then
    raise exception 'A restauração só pode ser executada pelo responsável técnico no SQL Editor.' using errcode = '42501';
  end if;
  if not (v_validacao->>'valido')::boolean then
    raise exception 'Arquivo de backup inválido: %', v_validacao->'erros' using errcode = '22023';
  end if;
  -- Marcador local da transação: só vale até o fim desta restauração.
  perform set_config('cip.restauracao', 'on', true);

  for t in select * from cip_backup.tabelas() order by ordem loop
    v_novos := 0; v_iguais := 0; v_div := 0; v_ign := 0; v_div_chaves := '[]'::jsonb;
    for v_linha in select jsonb_array_elements(p_conteudo->'tabelas'->t.tabela) loop
      v_where := (select string_agg(format('x.%1$I::text = %2$L', c, v_linha->>c), ' and ') from unnest(t.chave) c);
      execute format('select to_jsonb(x) from public.%I x where %s', t.tabela, v_where) into v_atual;
      if v_atual is not null then
        if v_atual = v_linha then v_iguais := v_iguais + 1;
        else
          v_div := v_div + 1;
          if jsonb_array_length(v_div_chaves) < 20 then
            v_div_chaves := v_div_chaves || jsonb_build_array((select jsonb_object_agg(c, v_linha->c) from unnest(t.chave) c));
          end if;
        end if;
        continue;
      end if;
      -- perfis só podem voltar se a conta de login ainda existir
      if t.tabela = 'perfis' and not exists (select 1 from auth.users u where u.id = (v_linha->>'uid')::uuid) then
        v_ign := v_ign + 1;
        continue;
      end if;
      -- a linha única de configuração nunca é recriada por aqui
      if t.tabela = 'cip_configuracao' then
        v_ign := v_ign + 1;
        continue;
      end if;
      v_novos := v_novos + 1;
      if not p_simular then
        -- só colunas comuns (colunas geradas, como nome_chave, são recalculadas)
        select string_agg(format('%I', a.attname), ', ' order by a.attnum) into v_cols
        from pg_attribute a
        where a.attrelid = format('public.%I', t.tabela)::regclass and a.attnum > 0
          and not a.attisdropped and a.attgenerated = '';
        execute format('insert into public.%1$I (%2$s) overriding system value select %2$s from jsonb_populate_record(null::public.%1$I, $1)', t.tabela, v_cols)
          using v_linha;
        -- gatilhos de auditoria preenchem data/autor atuais: devolve os valores originais
        if t.tabela = 'cip_registros' then
          update public.cip_registros r set criado_em = s.criado_em, criado_por = s.criado_por,
            atualizado_em = s.atualizado_em, atualizado_por = s.atualizado_por,
            nome_operador = s.nome_operador, operador_id = s.operador_id
          from jsonb_populate_record(null::public.cip_registros, v_linha) s where r.id = s.id;
        elsif t.tabela = 'cip_observacoes' then
          update public.cip_observacoes o set administrador_nome = s.administrador_nome,
            administrador_uid = s.administrador_uid, criado_em = s.criado_em
          from jsonb_populate_record(null::public.cip_observacoes, v_linha) s where o.id = s.id;
        end if;
      end if;
    end loop;
    if not p_simular and exists (select 1 from pg_attribute a
                                  where a.attrelid = format('public.%I', t.tabela)::regclass
                                    and a.attname = 'id' and a.attidentity <> '') then
      v_seq := pg_get_serial_sequence(format('public.%I', t.tabela), 'id');
      if v_seq is not null then
        execute format('select setval(%L, greatest(coalesce((select max(id) from public.%I), 0), 1))', v_seq, t.tabela);
      end if;
    end if;
    v_rel := v_rel || jsonb_build_object(t.tabela, jsonb_build_object(
      'no_arquivo', jsonb_array_length(p_conteudo->'tabelas'->t.tabela),
      'novos', v_novos, 'iguais', v_iguais, 'divergentes', v_div, 'ignorados', v_ign,
      'chaves_divergentes', v_div_chaves));
  end loop;

  perform set_config('cip.restauracao', 'off', true);
  v_rel := jsonb_build_object('modo', 'aditiva', 'simulacao', p_simular, 'checksum_total', p_conteudo->>'checksum_total',
                              'gerado_em', p_conteudo->'gerado_em',
                              'snapshot_correspondente', v_validacao->'snapshot_correspondente',
                              'tabelas', v_rel);
  if not p_simular then
    insert into cip_backup.restauracoes (checksum_total, relatorio) values (p_conteudo->>'checksum_total', v_rel);
  end if;
  return v_rel;
end;
$$;
revoke all on all functions in schema cip_backup from public, anon, authenticated;

commit;
