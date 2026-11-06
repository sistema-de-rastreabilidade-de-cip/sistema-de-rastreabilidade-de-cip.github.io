-- =====================================================================
-- CIP v8 — migração 2 de 2: avaliação, revisão necessária, Adega, OSAM
-- ---------------------------------------------------------------------
-- Escopo: EXCLUSIVO do Sistema de Rastreabilidade de CIP.
--   * Só cria ou altera objetos com prefixo cip_ / adega_ / vw_cip_ /
--     vw_adega_ e as funções editar_registro_cip e avaliar_cip.
--   * Não toca em nenhum objeto do Painel FTR (painel_months,
--     painel_current, painel_publications, painel_publicadores,
--     painel_publish), nem em configurações globais do projeto.
--   * Mudanças só aditivas: nenhuma tabela, coluna ou dado existente é
--     apagado. A tabela cip_registros ganha só a coluna "bbt" (vazia).
--
-- Compatibilidade com o site antigo (Netlify):
--   * INSERT em cip_registros continua igual para os 4 tipos originais.
--   * editar_registro_cip mantém os 10 parâmetros atuais; o novo p_bbt
--     tem valor padrão, então a chamada antiga continua funcionando.
--   * INSERT em cip_observacoes continua aceito (autor agora vem do banco).
--
-- Tudo roda numa única transação: ou entra tudo, ou nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Configuração (linha única)
-- ---------------------------------------------------------------------
create table public.cip_configuracao (
  id smallint primary key default 1 check (id = 1),
  dias_aviso_adega integer not null default 30 check (dias_aviso_adega between 1 and 120),
  bloquear_data_futura boolean not null default true,
  tipos_data_futura public.tipo_cip_enum[] not null
    default array['alcalino_clorado','completo','tanque_levedura','linha_recuperacao_levedura','osam']::public.tipo_cip_enum[],
  atualizado_em timestamptz not null default now(),
  atualizado_por_nome text,
  atualizado_por_uid uuid references auth.users(id)
);
insert into public.cip_configuracao (id) values (1);

-- Data "de hoje" no fuso da fábrica, independente do fuso do servidor.
create or replace function public.cip_hoje()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- Regra de data futura (mesma da demonstração v8, agora no servidor).
create or replace function public.cip_data_futura_bloqueada(p_tipo public.tipo_cip_enum, p_data date)
returns boolean language sql stable set search_path = '' as $$
  select coalesce((
    select c.bloquear_data_futura and p_tipo = any (c.tipos_data_futura) and p_data > public.cip_hoje()
    from public.cip_configuracao c where c.id = 1), false);
$$;

-- Validação de texto livre (justificativa, observação de avaliação),
-- idêntica à do navegador (validarJustificativa.js). A função antiga
-- public.justificativa_valida continua intacta, porque é usada pela
-- constraint de cip_edicoes.
create or replace function public.cip_texto_valido(p_texto text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  v_original text := btrim(coalesce(p_texto, ''));
  v_sem_acento text;
  v_norm text;
  v_genericas text[] := array[
    'erro','erros','corrigir','correcao','corrigido','corrigida',
    'arrumar','arrumado','arrumada','alteracao','alterado','alterada',
    'ajuste','ajustado','ajustada','edicao','editado','editada',
    'mudanca','mudado','mudada','atualizacao','atualizado','atualizada',
    'ok','teste','n/a','na','pq sim','porque sim','sem motivo','sem razao'];
begin
  if v_original = '' then return false; end if;
  v_sem_acento := translate(v_original,
    'áàâãäÁÀÂÃÄéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
    'aaaaaAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN');
  if char_length(regexp_replace(v_sem_acento, '[^A-Za-z]', '', 'g')) < 4 then return false; end if;
  v_norm := lower(v_sem_acento);
  v_norm := regexp_replace(v_norm, '[.,;:!?"''()\-_/\\]', ' ', 'g');
  v_norm := btrim(regexp_replace(v_norm, '\s+', ' ', 'g'));
  if v_norm = any (v_genericas) then return false; end if;
  if not exists (
    select 1 from unnest(string_to_array(v_norm, ' ')) as p(palavra)
    where p.palavra <> '' and not (p.palavra = any (v_genericas))
  ) then return false; end if;
  if char_length(v_original) > 300 then return false; end if;
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. CIP OSAM: coluna bbt (BBT 01 a BBT 12, lista fixa)
-- ---------------------------------------------------------------------
alter table public.cip_registros add column bbt text;
alter table public.cip_registros add constraint cip_registros_bbt_check check (
  (tipo_cip = 'osam' and bbt in ('BBT 01','BBT 02','BBT 03','BBT 04','BBT 05','BBT 06',
                                 'BBT 07','BBT 08','BBT 09','BBT 10','BBT 11','BBT 12')
                     and equipamento = bbt)
  or (tipo_cip <> 'osam' and bbt is null)
);

-- Validação na criação (vale também para quem chamar a API direto).
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
create trigger trg_cip_registros_validar_insert before insert on public.cip_registros
  for each row execute function public.cip_registros_validar_insert();

-- ---------------------------------------------------------------------
-- 3. Avaliação do CIP (situação atual + histórico só de inclusão)
-- ---------------------------------------------------------------------
create table public.cip_avaliacoes (
  registro_id uuid primary key references public.cip_registros(id) on delete restrict,
  situacao text not null check (situacao in ('conforme','contaminado')),
  observacao text,
  avaliador_nome text not null,
  avaliador_uid uuid references auth.users(id),
  avaliado_em timestamptz not null default now(),
  versao integer not null default 1 check (versao >= 1),
  revisao_pendente boolean not null default false,
  revisao_desde timestamptz,
  revisao_por text,
  revisao_ultima_em timestamptz,
  revisao_ultimo_por text,
  revisao_edicoes uuid[] not null default '{}'
);
create index idx_cip_avaliacoes_situacao on public.cip_avaliacoes (situacao);
create index idx_cip_avaliacoes_avaliador_uid on public.cip_avaliacoes (avaliador_uid);

create table public.cip_avaliacoes_historico (
  id bigint generated always as identity primary key,
  registro_id uuid not null references public.cip_registros(id) on delete restrict,
  situacao_anterior text not null check (situacao_anterior in ('aguardando','conforme','contaminado')),
  situacao_nova text not null check (situacao_nova in ('conforme','contaminado')),
  tipo_evento text not null check (tipo_evento in ('avaliacao','correcao','confirmacao_revisao','reavaliacao_revisao')),
  observacao text,
  avaliador_nome text not null,
  avaliador_uid uuid references auth.users(id),
  revisao_desde timestamptz,
  versao integer not null,
  criado_em timestamptz not null default now()
);
create index idx_cip_avaliacoes_historico_registro on public.cip_avaliacoes_historico (registro_id);
create index idx_cip_avaliacoes_historico_avaliador_uid on public.cip_avaliacoes_historico (avaliador_uid);

-- Histórico imutável: nenhuma alteração ou exclusão, para nenhum perfil.
create or replace function public.cip_bloquear_alteracao_historico()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Registros de histórico não podem ser alterados nem apagados.' using errcode = '42501';
end;
$$;
create trigger trg_cip_avaliacoes_historico_imutavel
  before update or delete on public.cip_avaliacoes_historico
  for each row execute function public.cip_bloquear_alteracao_historico();
create trigger trg_cip_avaliacoes_historico_sem_truncate
  before truncate on public.cip_avaliacoes_historico
  for each statement execute function public.cip_bloquear_alteracao_historico();

-- ---------------------------------------------------------------------
-- 4. Adega: procedimentos periódicos e data-base (eventos só de inclusão)
-- ---------------------------------------------------------------------
create table public.adega_procedimentos (
  adega text not null check (adega in ('Adega A','Adega B')),
  tipo_cip public.tipo_cip_enum not null,
  meses integer not null check (meses > 0),
  primary key (adega, tipo_cip)
);
insert into public.adega_procedimentos (adega, tipo_cip, meses) values
  ('Adega A', 'alcalino_clorado', 6), ('Adega A', 'completo', 12),
  ('Adega B', 'alcalino_clorado', 6), ('Adega B', 'completo', 12);

create table public.adega_datas_base (
  id bigint generated always as identity primary key,
  adega text not null,
  tipo_cip public.tipo_cip_enum not null,
  acao text not null check (acao in ('definir','remover')),
  data_base date,
  definido_por_nome text not null,
  definido_por_uid uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  foreign key (adega, tipo_cip) references public.adega_procedimentos (adega, tipo_cip),
  check ((acao = 'definir') = (data_base is not null))
);
create index idx_adega_datas_base_chave on public.adega_datas_base (adega, tipo_cip, criado_em desc);
create index idx_adega_datas_base_uid on public.adega_datas_base (definido_por_uid);
create trigger trg_adega_datas_base_imutavel
  before update or delete on public.adega_datas_base
  for each row execute function public.cip_bloquear_alteracao_historico();
create trigger trg_adega_datas_base_sem_truncate
  before truncate on public.adega_datas_base
  for each statement execute function public.cip_bloquear_alteracao_historico();

-- Data-base vigente: último evento de cada procedimento, quando é "definir".
create view public.vw_adega_datas_base_atual with (security_invoker = true) as
select adega, tipo_cip, data_base, definido_por_nome, criado_em
from (
  select distinct on (adega, tipo_cip) adega, tipo_cip, acao, data_base, definido_por_nome, criado_em
  from public.adega_datas_base
  order by adega, tipo_cip, criado_em desc, id desc
) ultimo
where acao = 'definir';

-- ---------------------------------------------------------------------
-- 5. Visão de leitura: registro + situação da avaliação
-- ---------------------------------------------------------------------
create view public.vw_cip_registros with (security_invoker = true) as
select r.*,
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

-- ---------------------------------------------------------------------
-- 6. Observações administrativas: autor vem da conta logada
-- ---------------------------------------------------------------------
create or replace function public.cip_observacoes_set_autor()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_nome text;
begin
  select p.nome into v_nome from public.perfis p where p.uid = auth.uid();
  new.administrador_uid := auth.uid();
  new.administrador_nome := coalesce(v_nome, new.administrador_nome);
  new.criado_em := now();
  return new;
end;
$$;
create trigger trg_cip_observacoes_set_autor before insert on public.cip_observacoes
  for each row execute function public.cip_observacoes_set_autor();

-- ---------------------------------------------------------------------
-- 7. editar_registro_cip: + revisão necessária, data futura e BBT
--    (substitui a versão de 10 parâmetros por uma de 11 com p_bbt
--    opcional — a chamada do site antigo continua válida)
-- ---------------------------------------------------------------------
drop function public.editar_registro_cip(uuid, text, date, time without time zone, time without time zone, text, jsonb, text, text, text);

create function public.editar_registro_cip(
  p_registro_id uuid,
  p_equipamento text,
  p_data_cip date,
  p_hora_inicial time without time zone,
  p_hora_final time without time zone,
  p_nome_operador text,
  p_dados jsonb,
  p_observacoes_operador text,
  p_justificativa text,
  p_alterado_por_nome text,
  p_bbt text default null
)
returns public.cip_registros
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_registro public.cip_registros;
  v_valores_anteriores jsonb;
  v_valores_novos jsonb;
  v_uid uuid := auth.uid();
  v_bbt text := null;
  v_equipamento text := p_equipamento;
  v_edicao_id uuid;
  v_situacao text;
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

  if not public.justificativa_valida(p_justificativa) or not public.cip_texto_valido(p_justificativa) then
    raise exception 'Justificativa inválida: não pode ficar vazia, ser apenas números/símbolos, ou uma resposta genérica como "erro" ou "corrigir".' using errcode = '23514';
  end if;

  if p_alterado_por_nome is null or btrim(p_alterado_por_nome) = '' then
    raise exception 'Informe o nome de quem está fazendo esta alteração.' using errcode = '22023';
  end if;

  if v_registro.tipo_cip = 'osam' then
    v_bbt := coalesce(nullif(btrim(p_bbt), ''), nullif(btrim(p_equipamento), ''));
    if v_bbt is null then
      raise exception 'Selecione o BBT do CIP OSAM.' using errcode = '22023';
    end if;
    v_equipamento := v_bbt;
  end if;

  if v_equipamento is null or btrim(v_equipamento) = '' then
    raise exception 'Informe o equipamento.' using errcode = '22023';
  end if;
  if p_data_cip is null then
    raise exception 'Informe a data do CIP.' using errcode = '22023';
  end if;
  if public.cip_data_futura_bloqueada(v_registro.tipo_cip, p_data_cip) then
    raise exception 'A data do CIP não pode ser futura.' using errcode = '23514';
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
    'tipo_cip', v_registro.tipo_cip,
    'equipamento', v_registro.equipamento,
    'data_cip', v_registro.data_cip,
    'hora_inicial', v_registro.hora_inicial,
    'hora_final', v_registro.hora_final,
    'nome_operador', v_registro.nome_operador,
    'observacoes_operador', v_registro.observacoes_operador,
    'dados', v_registro.dados
  );

  v_valores_novos := jsonb_build_object(
    'tipo_cip', v_registro.tipo_cip,
    'equipamento', v_equipamento,
    'data_cip', p_data_cip,
    'hora_inicial', p_hora_inicial,
    'hora_final', p_hora_final,
    'nome_operador', p_nome_operador,
    'observacoes_operador', p_observacoes_operador,
    'dados', p_dados
  );

  if v_registro.tipo_cip = 'osam' then
    v_valores_anteriores := v_valores_anteriores || jsonb_build_object('bbt', v_registro.bbt);
    v_valores_novos := v_valores_novos || jsonb_build_object('bbt', v_bbt);
  end if;

  if v_valores_anteriores = v_valores_novos then
    raise exception 'Nenhum campo foi alterado — nada para salvar.' using errcode = '22023';
  end if;

  update public.cip_registros set
    equipamento = v_equipamento,
    bbt = v_bbt,
    data_cip = p_data_cip,
    hora_inicial = p_hora_inicial,
    hora_final = p_hora_final,
    nome_operador = p_nome_operador,
    dados = coalesce(p_dados, '{}'::jsonb),
    observacoes_operador = p_observacoes_operador,
    atualizado_em = now(),
    atualizado_por = v_uid
  where id = p_registro_id
  returning * into v_registro;

  insert into public.cip_edicoes (
    registro_id, valores_anteriores, valores_novos, justificativa,
    alterado_por_nome, alterado_por_uid
  ) values (
    p_registro_id, v_valores_anteriores, v_valores_novos, p_justificativa,
    btrim(p_alterado_por_nome), v_uid
  )
  returning id into v_edicao_id;

  -- Revisão necessária: registro já avaliado teve dado alterado. A
  -- classificação (Conforme/Contaminado) é mantida; só o sinal é ligado.
  select a.situacao into v_situacao from public.cip_avaliacoes a where a.registro_id = p_registro_id for update;
  if v_situacao in ('conforme', 'contaminado') then
    update public.cip_avaliacoes a set
      revisao_desde = case when a.revisao_pendente then a.revisao_desde else now() end,
      revisao_por = case when a.revisao_pendente then a.revisao_por else btrim(p_alterado_por_nome) end,
      revisao_edicoes = case when a.revisao_pendente then a.revisao_edicoes || v_edicao_id else array[v_edicao_id] end,
      revisao_pendente = true,
      revisao_ultima_em = now(),
      revisao_ultimo_por = btrim(p_alterado_por_nome)
    where a.registro_id = p_registro_id;
  end if;

  return v_registro;
end;
$function$;

-- ---------------------------------------------------------------------
-- 8. avaliar_cip: única porta de gravação da avaliação
-- ---------------------------------------------------------------------
create or replace function public.avaliar_cip(
  p_registro_id uuid,
  p_situacao text,
  p_observacao text,
  p_versao_esperada integer
)
returns public.cip_avaliacoes
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_nome text;
  v_atual public.cip_avaliacoes;
  v_anterior text;
  v_versao integer;
  v_revisao boolean;
  v_texto text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_obrigatorio boolean;
  v_evento text;
  v_resultado public.cip_avaliacoes;
begin
  if v_uid is null or public.auth_role() is distinct from 'administrador' then
    raise exception 'Somente o supervisor/administrador pode avaliar o CIP.' using errcode = '42501';
  end if;
  select p.nome into v_nome from public.perfis p where p.uid = v_uid;

  if p_situacao is null or p_situacao not in ('conforme', 'contaminado') then
    raise exception 'Selecione Conforme ou Contaminado.' using errcode = '22023';
  end if;

  -- Trava o registro (serializa avaliações simultâneas, inclusive a primeira).
  perform 1 from public.cip_registros r where r.id = p_registro_id for update;
  if not found then
    raise exception 'Registro de CIP não encontrado.' using errcode = 'P0002';
  end if;

  select * into v_atual from public.cip_avaliacoes a where a.registro_id = p_registro_id for update;
  v_anterior := coalesce(v_atual.situacao, 'aguardando');
  v_versao := coalesce(v_atual.versao, 0);
  v_revisao := coalesce(v_atual.revisao_pendente, false);

  if p_versao_esperada is null or p_versao_esperada <> v_versao then
    raise exception 'Esta avaliação foi alterada por outra pessoa depois que a tela foi aberta. Recarregue para ver a decisão atual.' using errcode = 'PT409';
  end if;

  if v_anterior = p_situacao and not v_revisao then
    raise exception 'O registro já está como %. Para corrigir, selecione outra classificação.',
      case v_anterior when 'conforme' then 'Conforme' else 'Contaminado' end using errcode = '22023';
  end if;

  v_obrigatorio := v_anterior <> 'aguardando' or p_situacao = 'contaminado';
  if (v_obrigatorio or v_texto is not null) and not public.cip_texto_valido(v_texto) then
    raise exception '%', case
      when v_anterior = 'aguardando' and p_situacao = 'contaminado' then 'Descrição da ocorrência inválida: escreva uma explicação (sem respostas genéricas, até 300 caracteres).'
      when v_anterior = 'aguardando' then 'Observação inválida: escreva uma explicação (sem respostas genéricas, até 300 caracteres).'
      else 'Justificativa inválida: escreva uma explicação (sem respostas genéricas, até 300 caracteres).'
    end using errcode = '23514';
  end if;

  v_evento := case
    when v_anterior = 'aguardando' then 'avaliacao'
    when v_revisao and v_anterior = p_situacao then 'confirmacao_revisao'
    when v_revisao then 'reavaliacao_revisao'
    else 'correcao'
  end;

  insert into public.cip_avaliacoes_historico (
    registro_id, situacao_anterior, situacao_nova, tipo_evento, observacao,
    avaliador_nome, avaliador_uid, revisao_desde, versao
  ) values (
    p_registro_id, v_anterior, p_situacao, v_evento, v_texto,
    coalesce(v_nome, 'Administrador'), v_uid, case when v_revisao then v_atual.revisao_desde end, v_versao + 1
  );

  insert into public.cip_avaliacoes as a (
    registro_id, situacao, observacao, avaliador_nome, avaliador_uid, avaliado_em, versao, revisao_pendente
  ) values (
    p_registro_id, p_situacao, v_texto, coalesce(v_nome, 'Administrador'), v_uid, now(), 1, false
  )
  on conflict (registro_id) do update set
    situacao = excluded.situacao,
    observacao = excluded.observacao,
    avaliador_nome = excluded.avaliador_nome,
    avaliador_uid = excluded.avaliador_uid,
    avaliado_em = excluded.avaliado_em,
    versao = a.versao + 1,
    revisao_pendente = false
  returning * into v_resultado;

  return v_resultado;
end;
$function$;

-- ---------------------------------------------------------------------
-- 9. Adega: data-base e antecedência do aviso (só administrador)
-- ---------------------------------------------------------------------
create or replace function public.definir_data_base_adega(p_adega text, p_tipo_cip public.tipo_cip_enum, p_data_base date)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_nome text;
begin
  if v_uid is null or public.auth_role() is distinct from 'administrador' then
    raise exception 'Somente o administrador pode definir a data-base da Adega.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.adega_procedimentos p where p.adega = p_adega and p.tipo_cip = p_tipo_cip) then
    raise exception 'Procedimento da Adega inexistente.' using errcode = '22023';
  end if;
  if p_data_base is null then
    raise exception 'Informe a data do último CIP realizado.' using errcode = '22023';
  end if;
  if p_data_base > public.cip_hoje() then
    raise exception 'A data-base não pode ser futura — use a data em que o último CIP foi de fato realizado.' using errcode = '23514';
  end if;
  if exists (select 1 from public.cip_registros r
             where r.tipo_cip = p_tipo_cip and r.equipamento = p_adega and r.data_cip <= public.cip_hoje()) then
    raise exception 'Já existe registro deste procedimento nesta adega — a periodicidade segue o último registro.' using errcode = '23514';
  end if;
  select p.nome into v_nome from public.perfis p where p.uid = v_uid;
  insert into public.adega_datas_base (adega, tipo_cip, acao, data_base, definido_por_nome, definido_por_uid)
  values (p_adega, p_tipo_cip, 'definir', p_data_base, coalesce(v_nome, 'Administrador'), v_uid);
end;
$function$;

create or replace function public.remover_data_base_adega(p_adega text, p_tipo_cip public.tipo_cip_enum)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_nome text;
begin
  if v_uid is null or public.auth_role() is distinct from 'administrador' then
    raise exception 'Somente o administrador pode remover a data-base da Adega.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.vw_adega_datas_base_atual v where v.adega = p_adega and v.tipo_cip = p_tipo_cip) then
    raise exception 'Não há data-base definida para este procedimento.' using errcode = '22023';
  end if;
  select p.nome into v_nome from public.perfis p where p.uid = v_uid;
  insert into public.adega_datas_base (adega, tipo_cip, acao, data_base, definido_por_nome, definido_por_uid)
  values (p_adega, p_tipo_cip, 'remover', null, coalesce(v_nome, 'Administrador'), v_uid);
end;
$function$;

create or replace function public.definir_dias_aviso_adega(p_dias integer)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_nome text;
begin
  if v_uid is null or public.auth_role() is distinct from 'administrador' then
    raise exception 'Somente o administrador pode alterar a antecedência do aviso.' using errcode = '42501';
  end if;
  if p_dias is null or p_dias < 1 or p_dias > 120 then
    raise exception 'Informe um número inteiro de dias entre 1 e 120.' using errcode = '22023';
  end if;
  select p.nome into v_nome from public.perfis p where p.uid = v_uid;
  update public.cip_configuracao set dias_aviso_adega = p_dias, atualizado_em = now(),
    atualizado_por_nome = coalesce(v_nome, 'Administrador'), atualizado_por_uid = v_uid
  where id = 1;
end;
$function$;

-- ---------------------------------------------------------------------
-- 10. Segurança: RLS e privilégios (somente objetos do CIP)
-- ---------------------------------------------------------------------
alter table public.cip_configuracao enable row level security;
alter table public.cip_avaliacoes enable row level security;
alter table public.cip_avaliacoes_historico enable row level security;
alter table public.adega_procedimentos enable row level security;
alter table public.adega_datas_base enable row level security;

create policy cip_configuracao_select on public.cip_configuracao for select to authenticated
  using ((select public.auth_role()) = any (array['operador','administrador']));
create policy cip_avaliacoes_select on public.cip_avaliacoes for select to authenticated
  using ((select public.auth_role()) = any (array['operador','administrador']));
create policy cip_avaliacoes_historico_select on public.cip_avaliacoes_historico for select to authenticated
  using ((select public.auth_role()) = any (array['operador','administrador']));
create policy adega_procedimentos_select on public.adega_procedimentos for select to authenticated
  using ((select public.auth_role()) = any (array['operador','administrador']));
create policy adega_datas_base_select on public.adega_datas_base for select to authenticated
  using ((select public.auth_role()) = any (array['operador','administrador']));

-- Tabelas novas: só leitura para usuários logados; escrita só pelas funções.
revoke all on public.cip_configuracao, public.cip_avaliacoes, public.cip_avaliacoes_historico,
              public.adega_procedimentos, public.adega_datas_base,
              public.vw_cip_registros, public.vw_adega_datas_base_atual
  from anon, authenticated;
grant select on public.cip_configuracao, public.cip_avaliacoes, public.cip_avaliacoes_historico,
                public.adega_procedimentos, public.adega_datas_base,
                public.vw_cip_registros, public.vw_adega_datas_base_atual
  to authenticated;

-- Tabelas existentes do CIP: retira privilégios que nunca foram usados
-- pelo site (a RLS já recusava; agora a recusa também vem dos privilégios).
revoke all on public.perfis, public.cip_registros, public.cip_edicoes, public.cip_observacoes from anon;
revoke insert, update, delete, truncate, references, trigger on public.perfis from authenticated;
revoke update, delete, truncate, references, trigger on public.cip_registros from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.cip_edicoes from authenticated;
revoke update, delete, truncate, references, trigger on public.cip_observacoes from authenticated;
grant select on public.perfis, public.cip_edicoes to authenticated;
grant select, insert on public.cip_registros, public.cip_observacoes to authenticated;

-- Funções: execução só para usuários logados (o perfil é conferido dentro).
revoke all on function public.editar_registro_cip(uuid, text, date, time without time zone, time without time zone, text, jsonb, text, text, text, text) from public, anon;
revoke all on function public.avaliar_cip(uuid, text, text, integer) from public, anon;
revoke all on function public.definir_data_base_adega(text, public.tipo_cip_enum, date) from public, anon;
revoke all on function public.remover_data_base_adega(text, public.tipo_cip_enum) from public, anon;
revoke all on function public.definir_dias_aviso_adega(integer) from public, anon;
grant execute on function public.editar_registro_cip(uuid, text, date, time without time zone, time without time zone, text, jsonb, text, text, text, text) to authenticated;
grant execute on function public.avaliar_cip(uuid, text, text, integer) to authenticated;
grant execute on function public.definir_data_base_adega(text, public.tipo_cip_enum, date) to authenticated;
grant execute on function public.remover_data_base_adega(text, public.tipo_cip_enum) to authenticated;
grant execute on function public.definir_dias_aviso_adega(integer) to authenticated;

-- Funções auxiliares (sem acesso a dados sensíveis): uso interno.
revoke all on function public.cip_registros_validar_insert() from public, anon, authenticated;
revoke all on function public.cip_observacoes_set_autor() from public, anon, authenticated;
revoke all on function public.cip_bloquear_alteracao_historico() from public, anon, authenticated;
revoke all on function public.cip_data_futura_bloqueada(public.tipo_cip_enum, date) from anon;
revoke all on function public.cip_texto_valido(text) from anon;
revoke all on function public.cip_hoje() from anon;

comment on table public.cip_avaliacoes is 'CIP v8: situação atual da avaliação (Conforme/Contaminado) por registro; gravação só via avaliar_cip.';
comment on table public.cip_avaliacoes_historico is 'CIP v8: histórico imutável das avaliações.';
comment on table public.adega_procedimentos is 'CIP v8: procedimentos periódicos da Adega (periodicidade em meses).';
comment on table public.adega_datas_base is 'CIP v8: eventos de data-base da Adega (só inclusão).';
comment on table public.cip_configuracao is 'CIP v8: parâmetros do CIP (aviso da Adega, regra de data futura).';
