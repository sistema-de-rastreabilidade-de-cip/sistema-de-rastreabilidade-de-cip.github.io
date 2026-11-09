-- =====================================================================
-- CIP v8.1 — operadores cadastrados, alertas configuráveis, backup e
-- recuperação dos dados do CIP
-- ---------------------------------------------------------------------
-- Escopo: EXCLUSIVO do Sistema de Rastreabilidade de CIP. Não referencia
-- nenhum objeto do Painel FTR (painel_*). Mudanças só aditivas: nenhum
-- dado existente é apagado ou alterado (a padronização de nomes vale
-- para novos registros e novas edições).
--
-- Objetos CRIADOS:
--   * public.cip_operadores, public.cip_operadores_historico
--   * coluna public.cip_registros.operador_id (vazia nos registros atuais)
--   * colunas em public.cip_configuracao: exigir_operador_cadastrado
--     (padrão: desligado) e alerta_espera_horas (padrão: sem alerta)
--   * funções: cip_normalizar_nome, cip_nome_pessoa_valido,
--     cip_nome_chave, cip_registros_operador (gatilho),
--     cip_edicoes_normalizar_autor (gatilho), cadastrar_operador,
--     alterar_status_operador, definir_exigencia_operador,
--     definir_alerta_espera, cip_criar_backup, cip_listar_backups,
--     cip_obter_backup, cip_verificar_backup
--   * schema privado cip_backup (sem acesso pela API): snapshots,
--     restauracoes, montar_conteudo, validar_arquivo, restaurar
--   * public.cip_em_restauracao(): identifica a restauração técnica
-- Objetos ALTERADOS:
--   * public.cip_registros_validar_insert (gatilho da v8): mesma regra de
--     antes, mas não interfere numa restauração técnica controlada
--     (o desfazer devolve a definição original da v8)
--   * cip_registros e cip_edicoes ganham gatilhos novos; cip_registros e
--     cip_configuracao ganham colunas novas.
--
-- ATOMICIDADE: o arquivo tem BEGIN/COMMIT próprios. Aplicado pelo SQL
-- Editor do Supabase (colando o arquivo inteiro) ou por
--   psql -v ON_ERROR_STOP=1 -f <arquivo>
-- qualquer erro desfaz tudo — nada fica aplicado pela metade. Se o
-- executor já abrir uma transação, o BEGIN interno só gera um aviso.
-- Uma trava no início impede aplicar duas vezes.
--
-- Compatibilidade: o site anterior continua funcionando — o nome do
-- operador só passa a ser padronizado (espaços extras removidos) e
-- recusado quando vazio ou sem letras. A exigência de nome cadastrado
-- só vale depois que o supervisor ligá-la.
-- =====================================================================

begin;

do $guarda$
begin
  if exists (select 1 from pg_namespace where nspname = 'cip_backup')
     or to_regclass('public.cip_operadores') is not null then
    raise exception 'A migração CIP v8.1 já foi aplicada (cip_backup ou cip_operadores já existem). Nada foi alterado.';
  end if;
  if to_regclass('public.cip_avaliacoes') is null then
    raise exception 'A migração CIP v8 precisa ser aplicada antes da v8.1. Nada foi alterado.';
  end if;
end
$guarda$;

-- ---------------------------------------------------------------------
-- 1. Nomes de pessoas: padronização e validação
-- ---------------------------------------------------------------------
create or replace function public.cip_normalizar_nome(p_nome text)
returns text language sql immutable set search_path = '' as $$
  select nullif(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), '');
$$;

-- Chave de comparação: sem acento, minúscula (evita "João" e "JOAO " duplicados).
create or replace function public.cip_nome_chave(p_nome text)
returns text language sql immutable set search_path = '' as $$
  select lower(translate(public.cip_normalizar_nome(p_nome),
    'áàâãäÁÀÂÃÄéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
    'aaaaaAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN'));
$$;

-- Nome válido: 2 a 80 caracteres, ao menos 2 letras, só letras, espaço,
-- ponto, hífen e apóstrofo (recusa "123", "---", "  ").
create or replace function public.cip_nome_pessoa_valido(p_nome text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    char_length(public.cip_normalizar_nome(p_nome)) between 2 and 80
    and public.cip_normalizar_nome(p_nome) ~ '^[A-Za-zÀ-ÖØ-öø-ÿ .''-]+$'
    and char_length(regexp_replace(public.cip_normalizar_nome(p_nome), '[^A-Za-zÀ-ÖØ-öø-ÿ]', '', 'g')) >= 2,
    false);
$$;

-- Restauração técnica controlada: verdadeira SOMENTE quando
--   (1) a função cip_backup.restaurar ligou o marcador da transação e
--   (2) a sessão NÃO é da API pública. Toda chamada do site chega ao banco
--       pela sessão "authenticator" (papéis anon/authenticated); o
--       navegador não consegue mudar isso nem definir o marcador.
-- Só nessa situação os gatilhos deixam de padronizar/validar, para que
-- valores históricos voltem exatamente como estavam no backup.
create or replace function public.cip_em_restauracao()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(current_setting('cip.restauracao', true), '') = 'on'
     and session_user::text not in ('authenticator', 'anon', 'authenticated', 'service_role')
     and current_user::text not in ('anon', 'authenticated', 'service_role');
$$;

-- Gatilho de criação da v8 (data futura e BBT do OSAM): mesma regra de
-- antes; numa restauração técnica, o registro histórico entra como está.
create or replace function public.cip_registros_validar_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  if public.cip_em_restauracao() then
    return new;
  end if;
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

-- ---------------------------------------------------------------------
-- 2. Lista de operadores (administrada pelo supervisor; nunca apagada)
-- ---------------------------------------------------------------------
create table public.cip_operadores (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (public.cip_nome_pessoa_valido(nome) and nome = public.cip_normalizar_nome(nome)),
  nome_chave text generated always as (public.cip_nome_chave(nome)) stored,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por_nome text not null,
  criado_por_uid uuid references auth.users(id),
  atualizado_em timestamptz,
  atualizado_por_nome text,
  constraint cip_operadores_nome_chave_unico unique (nome_chave)
);
create index idx_cip_operadores_criado_por_uid on public.cip_operadores (criado_por_uid);

create table public.cip_operadores_historico (
  id bigint generated always as identity primary key,
  operador_id uuid not null references public.cip_operadores(id) on delete restrict,
  acao text not null check (acao in ('cadastrar','desativar','reativar')),
  nome text not null,
  por_nome text not null,
  por_uid uuid references auth.users(id),
  criado_em timestamptz not null default now()
);
create index idx_cip_operadores_historico_operador on public.cip_operadores_historico (operador_id);
create index idx_cip_operadores_historico_uid on public.cip_operadores_historico (por_uid);
create trigger trg_cip_operadores_historico_imutavel
  before update or delete on public.cip_operadores_historico
  for each row execute function public.cip_bloquear_alteracao_historico();
create trigger trg_cip_operadores_historico_sem_truncate
  before truncate on public.cip_operadores_historico
  for each statement execute function public.cip_bloquear_alteracao_historico();
-- Operadores não são apagados (desativar preserva o histórico).
create trigger trg_cip_operadores_sem_delete
  before delete on public.cip_operadores
  for each row execute function public.cip_bloquear_alteracao_historico();

alter table public.cip_registros add column operador_id uuid references public.cip_operadores(id) on delete restrict;
create index idx_cip_registros_operador_id on public.cip_registros (operador_id);

alter table public.cip_configuracao
  add column exigir_operador_cadastrado boolean not null default false,
  add column alerta_espera_horas integer check (alerta_espera_horas is null or alerta_espera_horas between 1 and 720);

-- Gatilho: padroniza e valida o nome do operador em novos registros e
-- em edições que mudem o nome; liga o registro ao cadastro quando houver.
create or replace function public.cip_registros_operador()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_op public.cip_operadores;
  v_exigir boolean;
begin
  -- Restauração técnica: valores históricos (nome e vínculo) ficam intactos.
  if public.cip_em_restauracao() then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.nome_operador is not distinct from old.nome_operador then
    return new;
  end if;
  new.nome_operador := public.cip_normalizar_nome(new.nome_operador);
  if not public.cip_nome_pessoa_valido(new.nome_operador) then
    raise exception 'Nome do operador inválido: informe o nome (ao menos 2 letras, sem números ou símbolos).' using errcode = '23514';
  end if;
  select * into v_op from public.cip_operadores o
   where o.nome_chave = public.cip_nome_chave(new.nome_operador)
   order by o.ativo desc limit 1;
  select coalesce(c.exigir_operador_cadastrado, false) into v_exigir from public.cip_configuracao c where c.id = 1;
  if coalesce(v_exigir, false) and (v_op.id is null or not v_op.ativo) then
    raise exception 'Operador não cadastrado ou inativo: selecione um nome da lista de operadores.' using errcode = '23514';
  end if;
  if v_op.id is not null then
    new.nome_operador := v_op.nome;  -- grafia oficial do cadastro
    new.operador_id := v_op.id;
  else
    new.operador_id := null;
  end if;
  return new;
end;
$$;
create trigger trg_cip_registros_operador
  before insert or update of nome_operador on public.cip_registros
  for each row execute function public.cip_registros_operador();

-- Autor das edições (nome digitado por quem edita): padronizado e validado.
create or replace function public.cip_edicoes_normalizar_autor()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Restauração técnica: o autor histórico entra exatamente como estava.
  if public.cip_em_restauracao() then
    return new;
  end if;
  new.alterado_por_nome := public.cip_normalizar_nome(new.alterado_por_nome);
  if not public.cip_nome_pessoa_valido(new.alterado_por_nome) then
    raise exception 'Nome de quem está editando inválido: informe o nome (ao menos 2 letras).' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger trg_cip_edicoes_normalizar_autor
  before insert on public.cip_edicoes
  for each row execute function public.cip_edicoes_normalizar_autor();

-- ---------------------------------------------------------------------
-- 3. Funções do supervisor: operadores e parâmetros
-- ---------------------------------------------------------------------
create or replace function public.cadastrar_operador(p_nome text)
returns public.cip_operadores language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_quem text;
  v_nome text := public.cip_normalizar_nome(p_nome);
  v_op public.cip_operadores;
begin
  if v_uid is null or public.auth_role() is distinct from 'administrador' then
    raise exception 'Somente o supervisor/administrador pode cadastrar operadores.' using errcode = '42501';
  end if;
  if not public.cip_nome_pessoa_valido(v_nome) then
    raise exception 'Nome inválido: use de 2 a 80 caracteres, só letras, espaços, ponto, hífen ou apóstrofo.' using errcode = '23514';
  end if;
  if exists (select 1 from public.cip_operadores o where o.nome_chave = public.cip_nome_chave(v_nome)) then
    raise exception 'Já existe um operador com este nome (ativo ou inativo). Reative o cadastro existente.' using errcode = '23505';
  end if;
  select p.nome into v_quem from public.perfis p where p.uid = v_uid;
  insert into public.cip_operadores (nome, criado_por_nome, criado_por_uid)
  values (v_nome, coalesce(v_quem, 'Administrador'), v_uid) returning * into v_op;
  insert into public.cip_operadores_historico (operador_id, acao, nome, por_nome, por_uid)
  values (v_op.id, 'cadastrar', v_op.nome, coalesce(v_quem, 'Administrador'), v_uid);
  return v_op;
end;
$function$;

create or replace function public.alterar_status_operador(p_operador_id uuid, p_ativo boolean)
returns public.cip_operadores language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_quem text;
  v_op public.cip_operadores;
begin
  if v_uid is null or public.auth_role() is distinct from 'administrador' then
    raise exception 'Somente o supervisor/administrador pode alterar operadores.' using errcode = '42501';
  end if;
  if p_ativo is null then
    raise exception 'Informe se o operador fica ativo ou inativo.' using errcode = '22023';
  end if;
  select * into v_op from public.cip_operadores o where o.id = p_operador_id for update;
  if v_op.id is null then
    raise exception 'Operador não encontrado.' using errcode = 'P0002';
  end if;
  if v_op.ativo = p_ativo then
    raise exception 'O operador já está %.', case when p_ativo then 'ativo' else 'inativo' end using errcode = '22023';
  end if;
  select p.nome into v_quem from public.perfis p where p.uid = v_uid;
  update public.cip_operadores set ativo = p_ativo, atualizado_em = now(), atualizado_por_nome = coalesce(v_quem, 'Administrador')
  where id = p_operador_id returning * into v_op;
  insert into public.cip_operadores_historico (operador_id, acao, nome, por_nome, por_uid)
  values (v_op.id, case when p_ativo then 'reativar' else 'desativar' end, v_op.nome, coalesce(v_quem, 'Administrador'), v_uid);
  return v_op;
end;
$function$;

create or replace function public.definir_exigencia_operador(p_exigir boolean)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_quem text;
begin
  if v_uid is null or public.auth_role() is distinct from 'administrador' then
    raise exception 'Somente o supervisor/administrador pode alterar esta configuração.' using errcode = '42501';
  end if;
  if p_exigir is null then
    raise exception 'Informe se a lista de operadores será obrigatória.' using errcode = '22023';
  end if;
  if p_exigir and not exists (select 1 from public.cip_operadores o where o.ativo) then
    raise exception 'Cadastre ao menos um operador ativo antes de tornar a lista obrigatória.' using errcode = '23514';
  end if;
  select p.nome into v_quem from public.perfis p where p.uid = v_uid;
  update public.cip_configuracao set exigir_operador_cadastrado = p_exigir, atualizado_em = now(),
    atualizado_por_nome = coalesce(v_quem, 'Administrador'), atualizado_por_uid = v_uid
  where id = 1;
end;
$function$;

-- Limite de alerta de espera: só existe quando definido por quem tem
-- autorização (o sistema não inventa prazo). null = sem alerta.
create or replace function public.definir_alerta_espera(p_horas integer)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_quem text;
begin
  if v_uid is null or public.auth_role() is distinct from 'administrador' then
    raise exception 'Somente o supervisor/administrador pode alterar esta configuração.' using errcode = '42501';
  end if;
  if p_horas is not null and (p_horas < 1 or p_horas > 720) then
    raise exception 'Informe um número inteiro de horas entre 1 e 720, ou deixe em branco para não usar alerta.' using errcode = '22023';
  end if;
  select p.nome into v_quem from public.perfis p where p.uid = v_uid;
  update public.cip_configuracao set alerta_espera_horas = p_horas, atualizado_em = now(),
    atualizado_por_nome = coalesce(v_quem, 'Administrador'), atualizado_por_uid = v_uid
  where id = 1;
end;
$function$;

-- ---------------------------------------------------------------------
-- 4. Backup: schema privado + cópias completas dentro do banco
-- ---------------------------------------------------------------------
create schema cip_backup;
revoke all on schema cip_backup from public, anon, authenticated;
comment on schema cip_backup is 'CIP: cópias de segurança e funções de recuperação. Sem acesso pela API pública.';

create table cip_backup.snapshots (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  criado_por_nome text not null,
  criado_por_uid uuid,
  conteudo jsonb not null,
  checksum_total text not null,
  tamanho_bytes integer not null
);
create table cip_backup.restauracoes (
  id bigint generated always as identity primary key,
  executado_em timestamptz not null default now(),
  executado_por text not null default current_user,
  checksum_total text not null,
  relatorio jsonb not null
);
create trigger trg_cip_backup_snapshots_imutavel before update or delete on cip_backup.snapshots
  for each row execute function public.cip_bloquear_alteracao_historico();
create trigger trg_cip_backup_restauracoes_imutavel before update or delete on cip_backup.restauracoes
  for each row execute function public.cip_bloquear_alteracao_historico();
alter table cip_backup.snapshots enable row level security;
alter table cip_backup.restauracoes enable row level security;
revoke all on all tables in schema cip_backup from public, anon, authenticated;

-- Tabelas do CIP no backup, em ordem de dependência (pais antes dos filhos)
-- e a chave primária de cada uma.
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

-- Checksum de uma tabela no arquivo: SHA-256 do texto jsonb (canônico).
create or replace function cip_backup.checksum(p_linhas jsonb)
returns text language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(coalesce(p_linhas, '[]'::jsonb)::text, 'UTF8')), 'hex');
$$;

create or replace function cip_backup.montar_conteudo()
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  t record;
  v_tabelas jsonb := '{}'::jsonb;
  v_contagens jsonb := '{}'::jsonb;
  v_checksums jsonb := '{}'::jsonb;
  v_linhas jsonb;
  v_concat text := '';
begin
  for t in select * from cip_backup.tabelas() order by ordem loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x) order by %s), ''[]''::jsonb) from public.%I x',
                   (select string_agg(format('x.%I', c), ', ') from unnest(t.chave) c), t.tabela)
      into v_linhas;
    v_tabelas := v_tabelas || jsonb_build_object(t.tabela, v_linhas);
    v_contagens := v_contagens || jsonb_build_object(t.tabela, jsonb_array_length(v_linhas));
    v_checksums := v_checksums || jsonb_build_object(t.tabela, cip_backup.checksum(v_linhas));
    v_concat := v_concat || cip_backup.checksum(v_linhas);
  end loop;
  return jsonb_build_object(
    'formato', 'cip-backup',
    'versao', 1,
    'sistema', 'Sistema de Rastreabilidade de CIP',
    'gerado_em', now(),
    'ordem_tabelas', (select jsonb_agg(tabela order by ordem) from cip_backup.tabelas()),
    'tabelas', v_tabelas,
    'contagens', v_contagens,
    'checksums', v_checksums,
    'checksum_total', encode(sha256(convert_to(v_concat, 'UTF8')), 'hex'));
end;
$$;

-- Valida um arquivo de backup: formato, versão, tabelas, contagens e checksums.
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

-- Restauração NÃO destrutiva. Por padrão só SIMULA (p_simular = true) e
-- devolve o relatório. Com p_simular = false, insere apenas as linhas que
-- não existem no banco; linhas existentes iguais são ignoradas e
-- divergentes são só relatadas — nada é sobrescrito nem apagado.
-- Sem acesso pela API: executar no SQL Editor pelo responsável.
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

-- Funções públicas do supervisor (conferem o perfil dentro).
create or replace function public.cip_criar_backup()
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_quem text;
  v_conteudo jsonb;
  v_id bigint;
begin
  if v_uid is null or public.auth_role() is distinct from 'administrador' then
    raise exception 'Somente o supervisor/administrador pode gerar backup.' using errcode = '42501';
  end if;
  select p.nome into v_quem from public.perfis p where p.uid = v_uid;
  v_conteudo := cip_backup.montar_conteudo();
  insert into cip_backup.snapshots (criado_por_nome, criado_por_uid, conteudo, checksum_total, tamanho_bytes)
  values (coalesce(v_quem, 'Administrador'), v_uid, v_conteudo, v_conteudo->>'checksum_total', octet_length(v_conteudo::text))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'gerado_em', v_conteudo->'gerado_em', 'contagens', v_conteudo->'contagens',
                            'checksum_total', v_conteudo->>'checksum_total');
end;
$function$;

create or replace function public.cip_listar_backups()
returns table (id bigint, criado_em timestamptz, criado_por_nome text, checksum_total text, tamanho_bytes integer, contagens jsonb)
language plpgsql security definer set search_path = '' as $function$
begin
  if auth.uid() is null or public.auth_role() is distinct from 'administrador' then
    raise exception 'Somente o supervisor/administrador pode consultar os backups.' using errcode = '42501';
  end if;
  return query select s.id, s.criado_em, s.criado_por_nome, s.checksum_total, s.tamanho_bytes, s.conteudo->'contagens'
               from cip_backup.snapshots s order by s.id desc limit 200;
end;
$function$;

create or replace function public.cip_obter_backup(p_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v jsonb;
begin
  if auth.uid() is null or public.auth_role() is distinct from 'administrador' then
    raise exception 'Somente o supervisor/administrador pode exportar backups.' using errcode = '42501';
  end if;
  select s.conteudo into v from cip_backup.snapshots s where s.id = p_id;
  if v is null then
    raise exception 'Backup não encontrado.' using errcode = 'P0002';
  end if;
  return v;
end;
$function$;

-- Confere a integridade de um backup guardado e compara com os dados atuais
-- (simulação de restauração — não grava nada).
create or replace function public.cip_verificar_backup(p_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v jsonb;
  v_validacao jsonb;
begin
  if auth.uid() is null or public.auth_role() is distinct from 'administrador' then
    raise exception 'Somente o supervisor/administrador pode verificar backups.' using errcode = '42501';
  end if;
  select s.conteudo into v from cip_backup.snapshots s where s.id = p_id;
  if v is null then
    raise exception 'Backup não encontrado.' using errcode = 'P0002';
  end if;
  v_validacao := cip_backup.validar_arquivo(v);
  if not (v_validacao->>'valido')::boolean then
    return jsonb_build_object('validacao', v_validacao);
  end if;
  return jsonb_build_object('validacao', v_validacao, 'comparacao', cip_backup.restaurar(v, true));
end;
$function$;

-- ---------------------------------------------------------------------
-- 5. Segurança: RLS e privilégios dos objetos novos
-- ---------------------------------------------------------------------
alter table public.cip_operadores enable row level security;
alter table public.cip_operadores_historico enable row level security;
create policy cip_operadores_select on public.cip_operadores for select to authenticated
  using ((select public.auth_role()) = any (array['operador','administrador']));
create policy cip_operadores_historico_select on public.cip_operadores_historico for select to authenticated
  using ((select public.auth_role()) = 'administrador');
revoke all on public.cip_operadores, public.cip_operadores_historico from anon, authenticated;
grant select on public.cip_operadores, public.cip_operadores_historico to authenticated;

revoke all on function public.cadastrar_operador(text) from public, anon;
revoke all on function public.alterar_status_operador(uuid, boolean) from public, anon;
revoke all on function public.definir_exigencia_operador(boolean) from public, anon;
revoke all on function public.definir_alerta_espera(integer) from public, anon;
revoke all on function public.cip_criar_backup() from public, anon;
revoke all on function public.cip_listar_backups() from public, anon;
revoke all on function public.cip_obter_backup(bigint) from public, anon;
revoke all on function public.cip_verificar_backup(bigint) from public, anon;
grant execute on function public.cadastrar_operador(text) to authenticated;
grant execute on function public.alterar_status_operador(uuid, boolean) to authenticated;
grant execute on function public.definir_exigencia_operador(boolean) to authenticated;
grant execute on function public.definir_alerta_espera(integer) to authenticated;
grant execute on function public.cip_criar_backup() to authenticated;
grant execute on function public.cip_listar_backups() to authenticated;
grant execute on function public.cip_obter_backup(bigint) to authenticated;
grant execute on function public.cip_verificar_backup(bigint) to authenticated;

revoke all on function public.cip_registros_operador() from public, anon, authenticated;
revoke all on function public.cip_edicoes_normalizar_autor() from public, anon, authenticated;
revoke all on function public.cip_normalizar_nome(text) from anon;
revoke all on function public.cip_nome_chave(text) from anon;
revoke all on function public.cip_nome_pessoa_valido(text) from anon;

comment on table public.cip_operadores is 'CIP v8.1: lista de operadores mantida pelo supervisor (desativar em vez de apagar).';
comment on table public.cip_operadores_historico is 'CIP v8.1: histórico imutável do cadastro de operadores.';

commit;
