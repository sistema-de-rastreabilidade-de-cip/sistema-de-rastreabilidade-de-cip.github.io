-- =====================================================================
-- DESFAZER a migração 20261107120000_cip_v8_1_operadores_backup.sql
-- ---------------------------------------------------------------------
-- ATENÇÃO — antes de rodar:
--   1. Exporte os backups guardados (schema cip_backup) que quiser manter:
--      eles são removidos junto com o schema.
--   2. Exporte cip_operadores e cip_operadores_historico.
-- Os registros de CIP NÃO são apagados: só perdem a coluna operador_id
-- (o nome do operador continua em nome_operador).
--
-- Na maioria dos problemas basta voltar o site: o banco da v8.1 continua
-- compatível com o site da v8.
-- Escopo: só objetos do CIP. Não toca no Painel FTR.
-- =====================================================================
begin;

drop function if exists public.cip_verificar_backup(bigint);
drop function if exists public.cip_obter_backup(bigint);
drop function if exists public.cip_listar_backups();
drop function if exists public.cip_criar_backup();
drop schema if exists cip_backup cascade;

drop function if exists public.definir_alerta_espera(integer);
drop function if exists public.definir_exigencia_operador(boolean);
drop function if exists public.alterar_status_operador(uuid, boolean);
drop function if exists public.cadastrar_operador(text);

drop trigger if exists trg_cip_edicoes_normalizar_autor on public.cip_edicoes;
drop function if exists public.cip_edicoes_normalizar_autor();
drop trigger if exists trg_cip_registros_operador on public.cip_registros;
drop function if exists public.cip_registros_operador();

alter table public.cip_registros drop column if exists operador_id;
alter table public.cip_configuracao drop column if exists exigir_operador_cadastrado;
alter table public.cip_configuracao drop column if exists alerta_espera_horas;

drop table if exists public.cip_operadores_historico;
drop table if exists public.cip_operadores;

drop function if exists public.cip_nome_pessoa_valido(text);
drop function if exists public.cip_nome_chave(text);
drop function if exists public.cip_normalizar_nome(text);

commit;
