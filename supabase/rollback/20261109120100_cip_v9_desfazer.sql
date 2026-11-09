-- =====================================================================
-- DESFAZER a v9 (tipos de CIP de Filtração)
-- ---------------------------------------------------------------------
-- * Tira os dois tipos de Filtração da lista da regra de data futura.
-- * NÃO apaga registros de Filtração já gravados: eles continuam no banco,
--   nos históricos e nos backups (o site da v8.1 os mostra com o código
--   do tipo, sem os campos específicos).
-- * Os valores 'filtracao_filtro3' e 'filtracao_bmf' do tipo de CIP
--   permanecem (o PostgreSQL não remove valores de enum sem recriar o
--   tipo); sem uso, não afetam os demais tipos.
-- Para voltar o site, basta reverter o merge no main.
-- =====================================================================
begin;
update public.cip_configuracao c
   set tipos_data_futura = array(select t from unnest(c.tipos_data_futura) t
                                 where t::text not in ('filtracao_filtro3','filtracao_bmf') order by t),
       atualizado_em = now(),
       atualizado_por_nome = 'Desfazer CIP v9'
 where c.id = 1;
commit;
