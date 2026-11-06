-- =====================================================================
-- DESFAZER a migração 20261106120100_cip_v8_estrutura.sql
-- ---------------------------------------------------------------------
-- Use só em caso de reversão completa da v8, e SÓ DEPOIS de exportar o
-- conteúdo de cip_avaliacoes, cip_avaliacoes_historico, adega_datas_base
-- e dos registros OSAM (tipo_cip = 'osam'): estes dados são removidos.
--
-- Na maioria dos problemas NÃO é preciso rodar este script: o banco da
-- v8 continua compatível com o site anterior, basta voltar o site.
--
-- Escopo: só objetos do CIP. Não toca no Painel FTR.
-- O endurecimento de privilégios (revoke) NÃO é desfeito: os privilégios
-- retirados nunca foram usados pelo site.
-- O valor 'osam' do tipo de CIP permanece (não pode ser removido sem
-- recriar o tipo) — fica sem uso.
-- =====================================================================
begin;

-- Registros OSAM (só existem a partir da v8) precisam sair antes da coluna.
-- ATENÇÃO: exporte-os antes. Edições/observações ligadas saem em cascata.
delete from public.cip_registros where tipo_cip = 'osam';

drop function if exists public.avaliar_cip(uuid, text, text, integer);
drop function if exists public.definir_data_base_adega(text, public.tipo_cip_enum, date);
drop function if exists public.remover_data_base_adega(text, public.tipo_cip_enum);
drop function if exists public.definir_dias_aviso_adega(integer);

drop view if exists public.vw_cip_registros;
drop view if exists public.vw_adega_datas_base_atual;

drop table if exists public.cip_avaliacoes_historico;
drop table if exists public.cip_avaliacoes;
drop table if exists public.adega_datas_base;
drop table if exists public.adega_procedimentos;

drop trigger if exists trg_cip_observacoes_set_autor on public.cip_observacoes;
drop function if exists public.cip_observacoes_set_autor();
drop trigger if exists trg_cip_registros_validar_insert on public.cip_registros;
drop function if exists public.cip_registros_validar_insert();
drop function if exists public.cip_bloquear_alteracao_historico();

alter table public.cip_registros drop constraint if exists cip_registros_bbt_check;
alter table public.cip_registros drop column if exists bbt;

-- editar_registro_cip volta exatamente à versão anterior (10 parâmetros).
drop function if exists public.editar_registro_cip(uuid, text, date, time without time zone, time without time zone, text, jsonb, text, text, text, text);

CREATE FUNCTION public.editar_registro_cip(p_registro_id uuid, p_equipamento text, p_data_cip date, p_hora_inicial time without time zone, p_hora_final time without time zone, p_nome_operador text, p_dados jsonb, p_observacoes_operador text, p_justificativa text, p_alterado_por_nome text)
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
    'equipamento', p_equipamento,
    'data_cip', p_data_cip,
    'hora_inicial', p_hora_inicial,
    'hora_final', p_hora_final,
    'nome_operador', p_nome_operador,
    'observacoes_operador', p_observacoes_operador,
    'dados', p_dados
  );

  if v_valores_anteriores = v_valores_novos then
    raise exception 'Nenhum campo foi alterado — nada para salvar.' using errcode = '22023';
  end if;

  update public.cip_registros set
    equipamento = p_equipamento,
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
  );

  return v_registro;
end;
$function$;
revoke all on function public.editar_registro_cip(uuid, text, date, time without time zone, time without time zone, text, jsonb, text, text, text) from public, anon;
grant execute on function public.editar_registro_cip(uuid, text, date, time without time zone, time without time zone, text, jsonb, text, text, text) to authenticated;

drop function if exists public.cip_data_futura_bloqueada(public.tipo_cip_enum, date);
drop function if exists public.cip_hoje();
drop function if exists public.cip_texto_valido(text);
drop table if exists public.cip_configuracao;

commit;
