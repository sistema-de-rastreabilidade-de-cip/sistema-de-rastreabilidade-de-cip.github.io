-- Réplica LOCAL (somente teste) do estado atual do projeto krscjbdphymgzjteclif,
-- reconstruída a partir do inventário somente-leitura de 05/11/2026.
-- Inclui um "stub" mínimo do Supabase (roles, schema auth, auth.uid()).

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin; create role authenticated nologin;
    create role service_role nologin bypassrls; create role authenticator login noinherit;
    grant anon, authenticated, service_role to authenticator;
  end if;
end $$;

create schema auth;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to public;

create extension if not exists pgcrypto;

grant usage on schema public to anon, authenticated, service_role;
-- Padrão Supabase: privilégios amplos por padrão em public
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create type public.tipo_cip_enum as enum ('alcalino_clorado','completo','tanque_levedura','linha_recuperacao_levedura');

create table public.perfis (
  uid uuid primary key references auth.users(id) on delete cascade,
  perfil text not null check (perfil = any (array['operador','administrador'])),
  nome text not null,
  criado_em timestamptz not null default now()
);

create table public.cip_registros (
  id uuid primary key default gen_random_uuid(),
  tipo_cip public.tipo_cip_enum not null,
  equipamento text not null,
  data_cip date not null,
  hora_inicial time not null,
  hora_final time,
  nome_operador text not null,
  dados jsonb not null default '{}'::jsonb,
  observacoes_operador text,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_em timestamptz,
  atualizado_por uuid references auth.users(id)
);
create index idx_cip_registros_data on public.cip_registros (data_cip);
create index idx_cip_registros_equipamento on public.cip_registros (equipamento);
create index idx_cip_registros_operador on public.cip_registros (nome_operador);
create index idx_cip_registros_tipo on public.cip_registros (tipo_cip);

create or replace function public.justificativa_valida(p_texto text) returns boolean
language sql immutable set search_path to 'public', 'pg_temp' as $function$
  select
    p_texto is not null
    and char_length(regexp_replace(trim(p_texto), '[^A-Za-zÀ-ÖØ-öø-ÿ]', '', 'g')) >= 4
    and lower(trim(p_texto)) not in (
      'erro', 'erros', 'corrigir', 'correção', 'correcao', 'corrigido', 'corrigida',
      'arrumar', 'arrumado', 'arrumada', 'alteração', 'alteracao', 'alterado', 'alterada',
      'ajuste', 'ajustado', 'ajustada', 'edição', 'edicao', 'editado', 'editada',
      'mudança', 'mudanca', 'mudado', 'mudada', 'atualização', 'atualizacao',
      'atualizado', 'atualizada', 'ok', 'teste', 'n/a', 'na'
    );
$function$;

create table public.cip_edicoes (
  id uuid primary key default gen_random_uuid(),
  registro_id uuid not null references public.cip_registros(id) on delete cascade,
  valores_anteriores jsonb not null,
  valores_novos jsonb not null,
  justificativa text not null constraint justificativa_minima check (public.justificativa_valida(justificativa)),
  alterado_por_nome text not null,
  alterado_por_uid uuid references auth.users(id),
  criado_em timestamptz not null default now()
);
create index idx_cip_edicoes_registro on public.cip_edicoes (registro_id);

create table public.cip_observacoes (
  id uuid primary key default gen_random_uuid(),
  registro_id uuid not null references public.cip_registros(id) on delete cascade,
  texto text not null constraint cip_observacoes_texto_minimo check (char_length(trim(texto)) >= 3),
  administrador_nome text not null,
  administrador_uid uuid constraint cip_observacoes_criado_por_uid_fkey references auth.users(id),
  criado_em timestamptz not null default now()
);
create index idx_cip_observacoes_registro on public.cip_observacoes (registro_id);

create or replace function public.auth_role() returns text
language sql stable set search_path to 'public', 'pg_temp' as $function$
  select perfil from public.perfis where uid = auth.uid();
$function$;

create or replace function public.cip_registros_set_auditoria_insert() returns trigger
language plpgsql set search_path to '' as $function$
begin
  new.criado_em := now();
  new.criado_por := auth.uid();
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end;
$function$;
create trigger trg_cip_registros_auditoria_insert before insert on public.cip_registros
  for each row execute function public.cip_registros_set_auditoria_insert();

-- editar_registro_cip: cópia literal da definição de produção
CREATE OR REPLACE FUNCTION public.editar_registro_cip(p_registro_id uuid, p_equipamento text, p_data_cip date, p_hora_inicial time without time zone, p_hora_final time without time zone, p_nome_operador text, p_dados jsonb, p_observacoes_operador text, p_justificativa text, p_alterado_por_nome text)
 RETURNS cip_registros
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_registro public.cip_registros;
  v_valores_anteriores jsonb;
  v_valores_novos jsonb;
  v_uid uuid := auth.uid();
begin
  if auth.uid() is null or public.auth_role() is distinct from 'operador' then
    raise exception 'Apenas o perfil operador pode editar registros de CIP.' using errcode = '42501';
  end if;
  if p_registro_id is null then
    raise exception 'Informe o registro a ser editado.' using errcode = '22023';
  end if;
  select * into v_registro from public.cip_registros where id = p_registro_id for update;
  if v_registro.id is null then
    raise exception 'Registro de CIP não encontrado.' using errcode = 'P0002';
  end if;
  if not public.justificativa_valida(p_justificativa) then
    raise exception 'Justificativa inválida: não pode ficar vazia, ser apenas números/símbolos, ou uma resposta genérica como "erro" ou "corrigir".' using errcode = '23514';
  end if;
  if p_alterado_por_nome is null or btrim(p_alterado_por_nome) = '' then
    raise exception 'Informe o nome de quem está fazendo esta alteração.' using errcode = '22023';
  end if;
  if p_equipamento is null or btrim(p_equipamento) = '' then
    raise exception 'Informe o equipamento.' using errcode = '22023';
  end if;
  if p_data_cip is null then
    raise exception 'Informe a data do CIP.' using errcode = '22023';
  end if;
  if p_nome_operador is null or btrim(p_nome_operador) = '' then
    raise exception 'Informe o nome do operador.' using errcode = '22023';
  end if;
  if p_hora_inicial is null then
    raise exception 'Informe a hora inicial.' using errcode = '22023';
  end if;
  if v_registro.tipo_cip <> 'tanque_levedura' and p_hora_final is null then
    raise exception 'Informe a hora final.' using errcode = '22023';
  end if;
  v_valores_anteriores := jsonb_build_object(
    'tipo_cip', v_registro.tipo_cip, 'equipamento', v_registro.equipamento, 'data_cip', v_registro.data_cip,
    'hora_inicial', v_registro.hora_inicial, 'hora_final', v_registro.hora_final, 'nome_operador', v_registro.nome_operador,
    'observacoes_operador', v_registro.observacoes_operador, 'dados', v_registro.dados);
  v_valores_novos := jsonb_build_object(
    'tipo_cip', v_registro.tipo_cip, 'equipamento', p_equipamento, 'data_cip', p_data_cip,
    'hora_inicial', p_hora_inicial, 'hora_final', p_hora_final, 'nome_operador', p_nome_operador,
    'observacoes_operador', p_observacoes_operador, 'dados', p_dados);
  if v_valores_anteriores = v_valores_novos then
    raise exception 'Nenhum campo foi alterado — nada para salvar.' using errcode = '22023';
  end if;
  update public.cip_registros set
    equipamento = p_equipamento, data_cip = p_data_cip, hora_inicial = p_hora_inicial, hora_final = p_hora_final,
    nome_operador = p_nome_operador, dados = coalesce(p_dados, '{}'::jsonb), observacoes_operador = p_observacoes_operador,
    atualizado_em = now(), atualizado_por = v_uid
  where id = p_registro_id
  returning * into v_registro;
  insert into public.cip_edicoes (registro_id, valores_anteriores, valores_novos, justificativa, alterado_por_nome, alterado_por_uid)
  values (p_registro_id, v_valores_anteriores, v_valores_novos, p_justificativa, btrim(p_alterado_por_nome), v_uid);
  return v_registro;
end;
$function$;

alter table public.perfis enable row level security;
alter table public.cip_registros enable row level security;
alter table public.cip_edicoes enable row level security;
alter table public.cip_observacoes enable row level security;

create policy perfis_select_proprio on public.perfis for select using (auth.uid() = uid);
create policy cip_registros_select on public.cip_registros for select using (auth_role() = any (array['operador','administrador']));
create policy cip_registros_insert_operador on public.cip_registros for insert with check (auth_role() = 'operador');
create policy cip_edicoes_select on public.cip_edicoes for select using (auth_role() = any (array['operador','administrador']));
create policy cip_observacoes_select on public.cip_observacoes for select using (auth_role() = any (array['operador','administrador']));
create policy cip_observacoes_insert_admin on public.cip_observacoes for insert with check (auth_role() = 'administrador');

-- Privilégios como estão em produção
revoke update on public.cip_registros from anon, authenticated;
revoke insert on public.cip_edicoes from anon, authenticated;
revoke all on function public.editar_registro_cip(uuid,text,date,time,time,text,jsonb,text,text,text) from public, anon;
grant execute on function public.editar_registro_cip(uuid,text,date,time,time,text,jsonb,text,text,text) to authenticated;

-- ---- Stub das tabelas do FTR (só para provar que não são tocadas) ----
create table public.painel_months (period_key text primary key, data jsonb not null);
create table public.painel_current (id smallint primary key default 1 check (id = 1), period_key text not null references public.painel_months(period_key));
create table public.painel_publications (id bigint primary key, period_key text not null);
create table public.painel_publicadores (email text primary key);
alter table public.painel_months enable row level security;
alter table public.painel_current enable row level security;
alter table public.painel_publications enable row level security;
alter table public.painel_publicadores enable row level security;
create policy painel_months_public_read on public.painel_months for select to anon, authenticated using (true);
create policy painel_current_public_read on public.painel_current for select to anon, authenticated using (true);
create or replace function public.painel_publish(p_period_key text) returns jsonb language sql security definer set search_path = public, pg_temp as $$ select '{}'::jsonb $$;
