-- =====================================================================
-- CIP v8 — migração 1 de 2: novo tipo de CIP "osam"
-- ---------------------------------------------------------------------
-- Escopo: exclusivo do Sistema de Rastreabilidade de CIP. Só altera o
-- tipo public.tipo_cip_enum, usado apenas por public.cip_registros.
-- Nenhum objeto do Painel FTR (painel_*) é referenciado.
--
-- Fica numa migração separada porque o PostgreSQL não permite usar um
-- valor novo de enum na mesma transação em que ele foi criado.
--
-- Reversão: um valor de enum não pode ser removido sem recriar o tipo.
-- Se a v8 for revertida, o valor "osam" fica sem uso e não afeta os
-- outros quatro tipos nem o site antigo.
-- =====================================================================

alter type public.tipo_cip_enum add value if not exists 'osam';
