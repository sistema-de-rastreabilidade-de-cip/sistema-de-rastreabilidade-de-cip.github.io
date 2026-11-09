-- =====================================================================
-- CIP v9 — migração 1 de 2: novos tipos de CIP de Filtração
--   * filtracao_filtro3 — CIP Filtração — Filtro 3 (PO-JAC-FAB-005, Anexo 2, rev. 2)
--   * filtracao_bmf     — CIP Filtração — BMF      (PO-JAC-FAB-024, Anexo 3, rev. 2)
-- ---------------------------------------------------------------------
-- Escopo: exclusivo do CIP; só acrescenta valores ao tipo
-- public.tipo_cip_enum (usado apenas por objetos do CIP). Os campos de
-- cada procedimento ficam na coluna JSON cip_registros.dados, como nos
-- demais formulários: nenhuma tabela nova, nenhum dado alterado.
-- Fica separada da migração 2 porque um valor novo de enum não pode ser
-- usado na mesma transação em que foi criado.
-- Reversão: valores de enum não podem ser removidos sem recriar o tipo;
-- se a v9 for revertida, os valores ficam sem uso (ver rollback).
-- Aplicar: SQL Editor (arquivo inteiro) ou psql -v ON_ERROR_STOP=1 -f.
-- =====================================================================
begin;

do $guarda$
begin
  if to_regclass('public.cip_operadores') is null then
    raise exception 'A migração CIP v8.1 precisa ser aplicada antes da v9. Nada foi alterado.';
  end if;
end
$guarda$;

alter type public.tipo_cip_enum add value if not exists 'filtracao_filtro3';
alter type public.tipo_cip_enum add value if not exists 'filtracao_bmf';

commit;
