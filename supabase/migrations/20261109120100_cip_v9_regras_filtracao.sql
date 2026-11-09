-- =====================================================================
-- CIP v9 — migração 2 de 2: mesmas regras dos demais CIPs para os novos tipos
-- ---------------------------------------------------------------------
-- A regra de data futura (a data do CIP não pode ser posterior a hoje)
-- vale hoje para os cinco tipos existentes, pela lista
-- cip_configuracao.tipos_data_futura. Esta migração só acrescenta os dois
-- tipos de Filtração a essa lista, para que sigam a mesma regra. Nenhuma
-- outra regra, faixa ou limite operacional é criado.
-- Escopo: exclusivo do CIP. Aplicar depois da migração 1 (v9).
-- =====================================================================
begin;

do $guarda$
begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                 where t.typname = 'tipo_cip_enum' and e.enumlabel = 'filtracao_bmf') then
    raise exception 'Aplique antes a migração 20261109120000_cip_v9_tipos_filtracao.sql. Nada foi alterado.';
  end if;
end
$guarda$;

update public.cip_configuracao c
   set tipos_data_futura = (select array_agg(t order by t)
                              from (select distinct unnest(c.tipos_data_futura
                                     || array['filtracao_filtro3','filtracao_bmf']::public.tipo_cip_enum[]) as t) x),
       atualizado_em = now(),
       atualizado_por_nome = 'Migração CIP v9'
 where c.id = 1
   and not (c.tipos_data_futura @> array['filtracao_filtro3','filtracao_bmf']::public.tipo_cip_enum[]);

commit;
