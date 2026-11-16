-- =====================================================================
-- CIP v10 (1/2) — novos tipos de CIP: "CIP Alcalino" (aba Adega, a cada 30
-- dias), "CIP Degás" e "CIP Aldox" (aba Adega, semanais)
-- ---------------------------------------------------------------------
-- Escopo: EXCLUSIVO do Sistema de Rastreabilidade de CIP. Só acrescenta três
-- valores ao tipo public.tipo_cip_enum. Nenhum dado é alterado e nenhum
-- objeto do FTR (painel_*) é referenciado.
--
-- O PostgreSQL não permite usar um valor novo de enum na mesma transação
-- em que ele foi criado; por isso este arquivo é aplicado SOZINHO, antes de
-- 20261113120100_cip_v10_adega_faixas_mapa.sql.
--
-- Os campos do CIP Alcalino são os mesmos do CIP Completo
-- (PO-JAC-FAB-004, Anexo 3), por decisão do usuário em 13/11/2026.
-- =====================================================================

begin;

do $guarda$
begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                 where t.typname = 'tipo_cip_enum' and e.enumlabel = 'filtracao_bmf') then
    raise exception 'A migração CIP v9 precisa ser aplicada antes da v10. Nada foi alterado.';
  end if;
end
$guarda$;

alter type public.tipo_cip_enum add value if not exists 'alcalino';
-- CIPs de Degás (PO-JAC-FAB-030) e Aldox (PO-JAC-FAB-029), aba Adega
alter type public.tipo_cip_enum add value if not exists 'degas';
alter type public.tipo_cip_enum add value if not exists 'aldox';

commit;
