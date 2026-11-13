-- =====================================================================
-- CIP v10 (2/2) — Adega no modo geral, faixas dos parâmetros e
-- rastreabilidade de contaminação
-- ---------------------------------------------------------------------
-- Escopo: EXCLUSIVO do Sistema de Rastreabilidade de CIP. Só cria ou altera
-- objetos com prefixo cip_ / vw_cip_ e o schema cip_backup. Não referencia
-- nenhum objeto do FTR (painel_*). Nenhum registro existente é apagado ou
-- alterado; as tabelas antigas da Adega (adega_procedimentos,
-- adega_datas_base) ficam intactas, para o site atual continuar funcionando
-- até a publicação.
--
-- Objetos CRIADOS:
--   * public.cip_adega_controles (+ _historico): procedimentos da aba Adega
--     no modo geral, com periodicidade em dias ou meses, ou sem
--     periodicidade definida (OSAN: pendente de definição)
--   * public.cip_adega_datas_base (+ vw_cip_adega_datas_base_atual)
--   * public.cip_parametros_faixas (+ _historico): faixas aceitáveis por
--     tipo de CIP e campo. NASCE VAZIA: nenhuma faixa é inventada; sem faixa,
--     a comparação fica desligada para aquele parâmetro.
--   * coluna public.cip_registros.verificacao_parametros: resultado da
--     comparação gravado no momento do registro/edição (rastreabilidade)
--   * colunas em public.cip_configuracao: mapa_limite_amarelo e
--     mapa_limite_vermelho (vazias = mapa de calor em escala relativa)
--   * funções: cip_extrair_numero, cip_verificar_parametros (gatilho),
--     cip_registro_conta_adega, definir_periodicidade_adega,
--     definir_data_base_adega_geral, remover_data_base_adega_geral,
--     definir_faixa_parametro (desativar = ativo falso; faixas não são apagadas),
--     definir_limites_mapa_calor, cip_backup.tabelas_opcionais
-- Objetos ALTERADOS:
--   * vw_cip_registros: ganha a coluna verificacao_parametros no fim
--   * cip_configuracao.tipos_data_futura: inclui 'alcalino'
--   * cip_backup.tabelas / validar_arquivo / restaurar: incluem as tabelas
--     novas; backups antigos (sem elas) continuam válidos
--
-- ATOMICIDADE: BEGIN/COMMIT próprios e trava contra aplicar duas vezes.
-- =====================================================================

begin;

do $guarda$
begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                 where t.typname = 'tipo_cip_enum' and e.enumlabel = 'alcalino') then
    raise exception 'Aplique antes a migração 20261113120000_cip_v10_tipo_alcalino.sql. Nada foi alterado.';
  end if;
  if to_regclass('public.cip_adega_controles') is not null or to_regclass('public.cip_parametros_faixas') is not null then
    raise exception 'A migração CIP v10 já foi aplicada. Nada foi alterado.';
  end if;
  if to_regclass('public.cip_operadores') is null then
    raise exception 'A migração CIP v8.1 precisa ser aplicada antes da v10. Nada foi alterado.';
  end if;
end
$guarda$;

-- ---------------------------------------------------------------------
-- 1. Aba Adega no modo geral (sem separar Adega A, B e D)
-- ---------------------------------------------------------------------
create table public.cip_adega_controles (
  tipo_cip public.tipo_cip_enum primary key,
  ordem integer not null,
  periodo_quantidade integer check (periodo_quantidade is null or periodo_quantidade between 1 and 3650),
  periodo_unidade text check (periodo_unidade is null or periodo_unidade in ('dias','meses')),
  -- antecedência do aviso "próximo do vencimento" só deste procedimento;
  -- vazia = usa a antecedência geral (cip_configuracao.dias_aviso_adega)
  dias_aviso integer check (dias_aviso is null or dias_aviso between 1 and 120),
  atualizado_em timestamptz not null default now(),
  atualizado_por_nome text,
  atualizado_por_uid uuid references auth.users(id),
  constraint cip_adega_controles_periodo_completo check ((periodo_quantidade is null) = (periodo_unidade is null))
);
create index idx_cip_adega_controles_uid on public.cip_adega_controles (atualizado_por_uid);

-- Periodicidades informadas pelo usuário em 13/11/2026. OSAN sem regra
-- aprovada: fica sem periodicidade ("pendente de definição"), configurável
-- depois pelo supervisor.
insert into public.cip_adega_controles (tipo_cip, ordem, periodo_quantidade, periodo_unidade, atualizado_por_nome) values
  ('alcalino',         1, 30,   'dias',  'Migração CIP v10'),
  ('alcalino_clorado', 2, 6,    'meses', 'Migração CIP v10'),
  ('osam',             3, null, null,    'Migração CIP v10');

create table public.cip_adega_controles_historico (
  id bigint generated always as identity primary key,
  tipo_cip public.tipo_cip_enum not null references public.cip_adega_controles(tipo_cip) on delete restrict,
  periodo_quantidade integer,
  periodo_unidade text,
  dias_aviso integer,
  por_nome text not null,
  por_uid uuid references auth.users(id),
  criado_em timestamptz not null default now()
);
create index idx_cip_adega_controles_historico_tipo on public.cip_adega_controles_historico (tipo_cip);
create index idx_cip_adega_controles_historico_uid on public.cip_adega_controles_historico (por_uid);
-- O histórico começa na primeira alteração feita pelo supervisor; a carga
-- inicial fica registrada na própria linha (atualizado_por_nome).
create trigger trg_cip_adega_controles_historico_imutavel before update or delete on public.cip_adega_controles_historico
  for each row execute function public.cip_bloquear_alteracao_historico();
create trigger trg_cip_adega_controles_historico_sem_truncate before truncate on public.cip_adega_controles_historico
  for each statement execute function public.cip_bloquear_alteracao_historico();
create trigger trg_cip_adega_controles_sem_delete before delete on public.cip_adega_controles
  for each row execute function public.cip_bloquear_alteracao_historico();

-- Eventos de data-base (só inclusão), agora por procedimento, sem adega.
create table public.cip_adega_datas_base (
  id bigint generated always as identity primary key,
  tipo_cip public.tipo_cip_enum not null references public.cip_adega_controles(tipo_cip) on delete restrict,
  acao text not null check (acao in ('definir','remover')),
  data_base date,
  definido_por_nome text not null,
  definido_por_uid uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  constraint cip_adega_datas_base_data check ((acao = 'definir') = (data_base is not null))
);
create index idx_cip_adega_datas_base_tipo on public.cip_adega_datas_base (tipo_cip, criado_em desc);
create index idx_cip_adega_datas_base_uid on public.cip_adega_datas_base (definido_por_uid);
create trigger trg_cip_adega_datas_base_imutavel before update or delete on public.cip_adega_datas_base
  for each row execute function public.cip_bloquear_alteracao_historico();
create trigger trg_cip_adega_datas_base_sem_truncate before truncate on public.cip_adega_datas_base
  for each statement execute function public.cip_bloquear_alteracao_historico();

create view public.vw_cip_adega_datas_base_atual with (security_invoker = true) as
select tipo_cip, data_base, definido_por_nome, criado_em
from (
  select distinct on (tipo_cip) tipo_cip, acao, data_base, definido_por_nome, criado_em
  from public.cip_adega_datas_base
  order by tipo_cip, criado_em desc, id desc
) x
where acao = 'definir';

-- Quais registros contam para cada procedimento da aba Adega:
--   CIP Alcalino e OSAN: todos os registros do tipo;
--   CIP Alcalino Clorado: só os feitos numa adega (o mesmo tipo também é
--   usado nos tanques de fermentação, que não entram na Adega).
create or replace function public.cip_registro_conta_adega(p_tipo public.tipo_cip_enum, p_equipamento text)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when p_tipo in ('alcalino', 'osam') then true
    when p_tipo = 'alcalino_clorado' then p_equipamento in ('Adega A', 'Adega B', 'Adega D')
    else false
  end;
$$;

create or replace function public.definir_periodicidade_adega(p_tipo_cip public.tipo_cip_enum, p_quantidade integer, p_unidade text, p_dias_aviso integer default null)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_nome text;
begin
  if v_uid is null or public.auth_role() is distinct from 'administrador' then
    raise exception 'Somente o supervisor/administrador pode alterar a periodicidade da Adega.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cip_adega_controles c where c.tipo_cip = p_tipo_cip) then
    raise exception 'Procedimento da Adega inexistente.' using errcode = '22023';
  end if;
  if (p_quantidade is null) <> (p_unidade is null) then
    raise exception 'Informe a quantidade e a unidade (dias ou meses), ou deixe as duas em branco para "pendente de definição".' using errcode = '22023';
  end if;
  if p_quantidade is not null and (p_quantidade < 1 or p_quantidade > 3650 or p_unidade not in ('dias','meses')) then
    raise exception 'Periodicidade inválida: use de 1 a 3650, em dias ou meses.' using errcode = '22023';
  end if;
  if p_dias_aviso is not null and (p_dias_aviso < 1 or p_dias_aviso > 120) then
    raise exception 'Antecedência do aviso inválida: use de 1 a 120 dias, ou deixe em branco para usar a geral.' using errcode = '22023';
  end if;
  select p.nome into v_nome from public.perfis p where p.uid = v_uid;
  update public.cip_adega_controles set periodo_quantidade = p_quantidade, periodo_unidade = p_unidade, dias_aviso = p_dias_aviso,
    atualizado_em = now(), atualizado_por_nome = coalesce(v_nome, 'Administrador'), atualizado_por_uid = v_uid
  where tipo_cip = p_tipo_cip;
  insert into public.cip_adega_controles_historico (tipo_cip, periodo_quantidade, periodo_unidade, dias_aviso, por_nome, por_uid)
  values (p_tipo_cip, p_quantidade, p_unidade, p_dias_aviso, coalesce(v_nome, 'Administrador'), v_uid);
end;
$function$;

create or replace function public.definir_data_base_adega_geral(p_tipo_cip public.tipo_cip_enum, p_data_base date)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_nome text;
begin
  if v_uid is null or public.auth_role() is distinct from 'administrador' then
    raise exception 'Somente o administrador pode definir a data-base da Adega.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cip_adega_controles c where c.tipo_cip = p_tipo_cip) then
    raise exception 'Procedimento da Adega inexistente.' using errcode = '22023';
  end if;
  if p_data_base is null then
    raise exception 'Informe a data do último CIP realizado.' using errcode = '22023';
  end if;
  if p_data_base > public.cip_hoje() then
    raise exception 'A data-base não pode ser futura — use a data em que o último CIP foi de fato realizado.' using errcode = '23514';
  end if;
  if exists (select 1 from public.cip_registros r
             where r.tipo_cip = p_tipo_cip and public.cip_registro_conta_adega(r.tipo_cip, r.equipamento)
               and r.data_cip <= public.cip_hoje()) then
    raise exception 'Já existe registro deste procedimento na Adega — a periodicidade segue o último registro.' using errcode = '23514';
  end if;
  select p.nome into v_nome from public.perfis p where p.uid = v_uid;
  insert into public.cip_adega_datas_base (tipo_cip, acao, data_base, definido_por_nome, definido_por_uid)
  values (p_tipo_cip, 'definir', p_data_base, coalesce(v_nome, 'Administrador'), v_uid);
end;
$function$;

create or replace function public.remover_data_base_adega_geral(p_tipo_cip public.tipo_cip_enum)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_nome text;
begin
  if v_uid is null or public.auth_role() is distinct from 'administrador' then
    raise exception 'Somente o administrador pode remover a data-base da Adega.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.vw_cip_adega_datas_base_atual v where v.tipo_cip = p_tipo_cip) then
    raise exception 'Não há data-base definida para este procedimento.' using errcode = '22023';
  end if;
  select p.nome into v_nome from public.perfis p where p.uid = v_uid;
  insert into public.cip_adega_datas_base (tipo_cip, acao, data_base, definido_por_nome, definido_por_uid)
  values (p_tipo_cip, 'remover', null, coalesce(v_nome, 'Administrador'), v_uid);
end;
$function$;

-- ---------------------------------------------------------------------
-- 2. Faixas aceitáveis dos parâmetros (vazia até receber as oficiais)
-- ---------------------------------------------------------------------
create table public.cip_parametros_faixas (
  tipo_cip public.tipo_cip_enum not null,
  campo text not null check (campo ~ '^[a-z0-9_]{1,80}$'),
  minimo numeric,
  maximo numeric,
  unidade text check (unidade is null or char_length(unidade) <= 20),
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  atualizado_por_nome text not null,
  atualizado_por_uid uuid references auth.users(id),
  primary key (tipo_cip, campo),
  constraint cip_parametros_faixas_limite check (minimo is not null or maximo is not null),
  constraint cip_parametros_faixas_ordem check (minimo is null or maximo is null or minimo <= maximo)
);
create index idx_cip_parametros_faixas_uid on public.cip_parametros_faixas (atualizado_por_uid);
create trigger trg_cip_parametros_faixas_sem_delete before delete on public.cip_parametros_faixas
  for each row execute function public.cip_bloquear_alteracao_historico();

create table public.cip_parametros_faixas_historico (
  id bigint generated always as identity primary key,
  tipo_cip public.tipo_cip_enum not null,
  campo text not null,
  minimo numeric,
  maximo numeric,
  unidade text,
  ativo boolean not null,
  por_nome text not null,
  por_uid uuid references auth.users(id),
  criado_em timestamptz not null default now()
);
create index idx_cip_parametros_faixas_historico_chave on public.cip_parametros_faixas_historico (tipo_cip, campo);
create index idx_cip_parametros_faixas_historico_uid on public.cip_parametros_faixas_historico (por_uid);
create trigger trg_cip_parametros_faixas_historico_imutavel before update or delete on public.cip_parametros_faixas_historico
  for each row execute function public.cip_bloquear_alteracao_historico();
create trigger trg_cip_parametros_faixas_historico_sem_truncate before truncate on public.cip_parametros_faixas_historico
  for each statement execute function public.cip_bloquear_alteracao_historico();

-- Primeiro número do texto digitado ("2,5%" → 2.5; "4500 ppm" → 4500;
-- "80 °C" → 80). Vírgula ou ponto como separador decimal. Sem número: null.
create or replace function public.cip_extrair_numero(p_texto text)
returns numeric language sql immutable set search_path = '' as $$
  select replace((regexp_match(coalesce(p_texto, ''), '-?[0-9]+(?:[.,][0-9]+)?'))[1], ',', '.')::numeric;
$$;

-- Gatilho: compara os valores digitados com as faixas ATIVAS do tipo de CIP
-- e grava o resultado. Os valores digitados (dados) nunca são alterados.
-- Sem faixa cadastrada para o tipo: verificacao_parametros fica vazia
-- (comparação desligada).
create or replace function public.cip_verificar_parametros()
returns trigger language plpgsql set search_path = '' as $$
declare
  f record;
  v_itens jsonb := '[]'::jsonb;
  v_texto text;
  v_num numeric;
  v_sit text;
  v_fora integer := 0;
begin
  -- Restauração técnica: o resultado histórico entra exatamente como estava.
  if public.cip_em_restauracao() then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.dados is not distinct from old.dados then
    new.verificacao_parametros := old.verificacao_parametros;
    return new;
  end if;
  for f in select * from public.cip_parametros_faixas p
           where p.tipo_cip = new.tipo_cip and p.ativo order by p.campo loop
    v_texto := nullif(btrim(coalesce(new.dados->>f.campo, '')), '');
    v_num := public.cip_extrair_numero(v_texto);
    if v_texto is null then v_sit := 'sem_valor';
    elsif v_num is null then v_sit := 'nao_numerico';
    elsif f.minimo is not null and v_num < f.minimo then v_sit := 'abaixo';
    elsif f.maximo is not null and v_num > f.maximo then v_sit := 'acima';
    else v_sit := 'dentro';
    end if;
    if v_sit in ('abaixo', 'acima') then v_fora := v_fora + 1; end if;
    v_itens := v_itens || jsonb_build_array(jsonb_build_object(
      'campo', f.campo, 'valor', v_texto, 'numero', v_num, 'minimo', f.minimo, 'maximo', f.maximo,
      'unidade', f.unidade, 'situacao', v_sit, 'faixa_atualizada_em', f.atualizado_em));
  end loop;
  if jsonb_array_length(v_itens) = 0 then
    new.verificacao_parametros := null;
  else
    new.verificacao_parametros := jsonb_build_object('verificado_em', now(), 'verificados', jsonb_array_length(v_itens),
                                                     'fora_da_faixa', v_fora, 'itens', v_itens);
  end if;
  return new;
end;
$$;

-- "if not exists": a coluna sobrevive a um desfazer (dados não são apagados).
alter table public.cip_registros add column if not exists verificacao_parametros jsonb;
create trigger trg_cip_registros_verificar_parametros
  before insert or update of dados on public.cip_registros
  for each row execute function public.cip_verificar_parametros();

create or replace function public.definir_faixa_parametro(p_tipo_cip public.tipo_cip_enum, p_campo text,
  p_minimo numeric, p_maximo numeric, p_unidade text, p_ativo boolean)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_nome text;
  v_unidade text := nullif(btrim(coalesce(p_unidade, '')), '');
begin
  if v_uid is null or public.auth_role() is distinct from 'administrador' then
    raise exception 'Somente o supervisor/administrador pode definir faixas de parâmetros.' using errcode = '42501';
  end if;
  if p_campo is null or p_campo !~ '^[a-z0-9_]{1,80}$' then
    raise exception 'Parâmetro inválido.' using errcode = '22023';
  end if;
  if p_minimo is null and p_maximo is null then
    raise exception 'Informe ao menos o limite mínimo ou o máximo.' using errcode = '22023';
  end if;
  if p_minimo is not null and p_maximo is not null and p_minimo > p_maximo then
    raise exception 'O limite mínimo não pode ser maior que o máximo.' using errcode = '22023';
  end if;
  if v_unidade is not null and char_length(v_unidade) > 20 then
    raise exception 'Unidade muito longa (até 20 caracteres).' using errcode = '22023';
  end if;
  select p.nome into v_nome from public.perfis p where p.uid = v_uid;
  insert into public.cip_parametros_faixas (tipo_cip, campo, minimo, maximo, unidade, ativo, atualizado_por_nome, atualizado_por_uid)
  values (p_tipo_cip, p_campo, p_minimo, p_maximo, v_unidade, coalesce(p_ativo, true), coalesce(v_nome, 'Administrador'), v_uid)
  on conflict (tipo_cip, campo) do update set minimo = excluded.minimo, maximo = excluded.maximo, unidade = excluded.unidade,
    ativo = excluded.ativo, atualizado_em = now(), atualizado_por_nome = excluded.atualizado_por_nome,
    atualizado_por_uid = excluded.atualizado_por_uid;
  insert into public.cip_parametros_faixas_historico (tipo_cip, campo, minimo, maximo, unidade, ativo, por_nome, por_uid)
  values (p_tipo_cip, p_campo, p_minimo, p_maximo, v_unidade, coalesce(p_ativo, true), coalesce(v_nome, 'Administrador'), v_uid);
end;
$function$;

-- ---------------------------------------------------------------------
-- 3. Mapa de calor: limites de frequência configuráveis (vazios = escala
--    relativa ao maior valor do período; nenhum limite é inventado)
-- ---------------------------------------------------------------------
alter table public.cip_configuracao
  add column if not exists mapa_limite_amarelo integer check (mapa_limite_amarelo is null or mapa_limite_amarelo between 1 and 1000),
  add column if not exists mapa_limite_vermelho integer check (mapa_limite_vermelho is null or mapa_limite_vermelho between 1 and 1000);
do $limites$
begin
  if not exists (select 1 from pg_constraint where conname = 'cip_configuracao_mapa_limites') then
    alter table public.cip_configuracao add constraint cip_configuracao_mapa_limites check (
      (mapa_limite_amarelo is null) = (mapa_limite_vermelho is null)
      and (mapa_limite_amarelo is null or mapa_limite_amarelo < mapa_limite_vermelho));
  end if;
end
$limites$;

create or replace function public.definir_limites_mapa_calor(p_amarelo integer, p_vermelho integer)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_nome text;
begin
  if v_uid is null or public.auth_role() is distinct from 'administrador' then
    raise exception 'Somente o supervisor/administrador pode alterar esta configuração.' using errcode = '42501';
  end if;
  if (p_amarelo is null) <> (p_vermelho is null) then
    raise exception 'Informe os dois limites, ou deixe os dois em branco para usar a escala relativa.' using errcode = '22023';
  end if;
  if p_amarelo is not null and (p_amarelo < 1 or p_vermelho > 1000 or p_amarelo >= p_vermelho) then
    raise exception 'Use números inteiros de 1 a 1000, com o limite do amarelo menor que o do vermelho.' using errcode = '22023';
  end if;
  select p.nome into v_nome from public.perfis p where p.uid = v_uid;
  update public.cip_configuracao set mapa_limite_amarelo = p_amarelo, mapa_limite_vermelho = p_vermelho,
    atualizado_em = now(), atualizado_por_nome = coalesce(v_nome, 'Administrador'), atualizado_por_uid = v_uid
  where id = 1;
end;
$function$;

-- ---------------------------------------------------------------------
-- 4. Regra de data futura também para o CIP Alcalino
-- ---------------------------------------------------------------------
update public.cip_configuracao c
   set tipos_data_futura = c.tipos_data_futura || array['alcalino']::public.tipo_cip_enum[],
       atualizado_em = now(), atualizado_por_nome = 'Migração CIP v10'
 where c.id = 1 and not (c.tipos_data_futura @> array['alcalino']::public.tipo_cip_enum[]);

-- ---------------------------------------------------------------------
-- 5. vw_cip_registros: mesma definição da v8 + verificacao_parametros
-- ---------------------------------------------------------------------
create or replace view public.vw_cip_registros with (security_invoker = true) as
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
       coalesce(cardinality(a.revisao_edicoes), 0) as revisao_qtd_edicoes,
       r.verificacao_parametros
from public.cip_registros r
left join public.cip_avaliacoes a on a.registro_id = r.id;

-- ---------------------------------------------------------------------
-- 6. Backup: tabelas novas incluídas; backups antigos continuam válidos
-- ---------------------------------------------------------------------
create or replace function cip_backup.tabelas()
returns table (ordem integer, tabela text, chave text[]) language sql immutable set search_path = '' as $$
  values
    (1,  'perfis',                        array['uid']),
    (2,  'cip_configuracao',              array['id']),
    (3,  'adega_procedimentos',           array['adega','tipo_cip']),
    (4,  'cip_operadores',                array['id']),
    (5,  'cip_operadores_historico',      array['id']),
    (6,  'cip_registros',                 array['id']),
    (7,  'cip_edicoes',                   array['id']),
    (8,  'cip_observacoes',               array['id']),
    (9,  'cip_avaliacoes',                array['registro_id']),
    (10, 'cip_avaliacoes_historico',      array['id']),
    (11, 'adega_datas_base',              array['id']),
    (12, 'cip_adega_controles',           array['tipo_cip']),
    (13, 'cip_adega_controles_historico', array['id']),
    (14, 'cip_adega_datas_base',          array['id']),
    (15, 'cip_parametros_faixas',         array['tipo_cip','campo']),
    (16, 'cip_parametros_faixas_historico', array['id'])
$$;

-- Tabelas que podem faltar num arquivo gerado antes da v10.
create or replace function cip_backup.tabelas_opcionais()
returns text[] language sql immutable set search_path = '' as $$
  select array['cip_adega_controles','cip_adega_controles_historico','cip_adega_datas_base',
               'cip_parametros_faixas','cip_parametros_faixas_historico'];
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
    if v_linhas is null and t.tabela = any (cip_backup.tabelas_opcionais()) then
      continue;  -- arquivo anterior à v10: a tabela não existia
    end if;
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

-- Restauração aditiva: igual à v8.1, com uma correção — uma linha existente
-- é "igual" quando coincide nas colunas que o ARQUIVO traz (colunas criadas
-- depois do backup, como verificacao_parametros, não a tornam divergente).
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
    for v_linha in select jsonb_array_elements(coalesce(p_conteudo->'tabelas'->t.tabela, '[]'::jsonb)) loop
      v_where := (select string_agg(format('x.%1$I::text = %2$L', c, v_linha->>c), ' and ') from unnest(t.chave) c);
      execute format('select to_jsonb(x) from public.%I x where %s', t.tabela, v_where) into v_atual;
      if v_atual is not null then
        if (select jsonb_object_agg(k, v_atual->k) from jsonb_object_keys(v_linha) k) = v_linha then v_iguais := v_iguais + 1;
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
      'no_arquivo', coalesce(jsonb_array_length(p_conteudo->'tabelas'->t.tabela), 0),
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

-- ---------------------------------------------------------------------
-- 7. Segurança: RLS e privilégios dos objetos novos
-- ---------------------------------------------------------------------
alter table public.cip_adega_controles enable row level security;
alter table public.cip_adega_controles_historico enable row level security;
alter table public.cip_adega_datas_base enable row level security;
alter table public.cip_parametros_faixas enable row level security;
alter table public.cip_parametros_faixas_historico enable row level security;

create policy cip_adega_controles_select on public.cip_adega_controles for select to authenticated
  using ((select public.auth_role()) = any (array['operador','administrador']));
create policy cip_adega_datas_base_select on public.cip_adega_datas_base for select to authenticated
  using ((select public.auth_role()) = any (array['operador','administrador']));
create policy cip_parametros_faixas_select on public.cip_parametros_faixas for select to authenticated
  using ((select public.auth_role()) = any (array['operador','administrador']));
create policy cip_adega_controles_historico_select on public.cip_adega_controles_historico for select to authenticated
  using ((select public.auth_role()) = 'administrador');
create policy cip_parametros_faixas_historico_select on public.cip_parametros_faixas_historico for select to authenticated
  using ((select public.auth_role()) = 'administrador');

revoke all on public.cip_adega_controles, public.cip_adega_controles_historico, public.cip_adega_datas_base,
              public.vw_cip_adega_datas_base_atual, public.cip_parametros_faixas, public.cip_parametros_faixas_historico
  from anon, authenticated;
grant select on public.cip_adega_controles, public.cip_adega_controles_historico, public.cip_adega_datas_base,
                public.vw_cip_adega_datas_base_atual, public.cip_parametros_faixas, public.cip_parametros_faixas_historico
  to authenticated;
-- a view recriada mantém os privilégios da v8 (só leitura para logados)
revoke all on public.vw_cip_registros from anon;
grant select on public.vw_cip_registros to authenticated;

revoke all on function public.definir_periodicidade_adega(public.tipo_cip_enum, integer, text, integer) from public, anon;
revoke all on function public.definir_data_base_adega_geral(public.tipo_cip_enum, date) from public, anon;
revoke all on function public.remover_data_base_adega_geral(public.tipo_cip_enum) from public, anon;
revoke all on function public.definir_faixa_parametro(public.tipo_cip_enum, text, numeric, numeric, text, boolean) from public, anon;
revoke all on function public.definir_limites_mapa_calor(integer, integer) from public, anon;
grant execute on function public.definir_periodicidade_adega(public.tipo_cip_enum, integer, text, integer) to authenticated;
grant execute on function public.definir_data_base_adega_geral(public.tipo_cip_enum, date) to authenticated;
grant execute on function public.remover_data_base_adega_geral(public.tipo_cip_enum) to authenticated;
grant execute on function public.definir_faixa_parametro(public.tipo_cip_enum, text, numeric, numeric, text, boolean) to authenticated;
grant execute on function public.definir_limites_mapa_calor(integer, integer) to authenticated;

revoke all on function public.cip_verificar_parametros() from public, anon, authenticated;
revoke all on function public.cip_extrair_numero(text) from anon;
revoke all on function public.cip_registro_conta_adega(public.tipo_cip_enum, text) from anon;

comment on table public.cip_adega_controles is 'CIP v10: procedimentos da aba Adega no modo geral (periodicidade em dias/meses ou pendente).';
comment on table public.cip_adega_datas_base is 'CIP v10: eventos de data-base da aba Adega no modo geral (só inclusão).';
comment on table public.cip_parametros_faixas is 'CIP v10: faixas aceitáveis por tipo de CIP e parâmetro. Vazia até as faixas oficiais serem informadas.';
comment on column public.cip_registros.verificacao_parametros is 'CIP v10: comparação com as faixas vigentes no momento do registro/edição. Os valores digitados ficam em dados, inalterados.';

commit;
