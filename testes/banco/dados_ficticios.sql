-- Dados FICTÍCIOS para a réplica local (nenhum dado real).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin.teste@local'),
  ('00000000-0000-0000-0000-00000000000b', 'operador.teste@local'),
  ('00000000-0000-0000-0000-00000000000c', 'semperfil.teste@local');
insert into public.perfis (uid, perfil, nome) values
  ('00000000-0000-0000-0000-00000000000a', 'administrador', 'Administração (teste)'),
  ('00000000-0000-0000-0000-00000000000b', 'operador', 'Operação CIP (teste)');

insert into public.cip_registros (id, tipo_cip, equipamento, data_cip, hora_inicial, hora_final, nome_operador, dados, observacoes_operador)
select ('10000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
       (array['completo','alcalino_clorado','tanque_levedura','linha_recuperacao_levedura'])[1 + g % 4]::public.tipo_cip_enum,
       case g % 4 when 2 then 'Tanque de Levedura 0' || (1 + g % 9) when 3 then 'Linha de Recuperação de Levedura' else 'Tanque de Fermentação ' || lpad((g % 60 + 1)::text, 2, '0') end,
       current_date - g, '08:00', case when g % 4 = 2 then null else '08:40'::time end,
       (array['Operador Fictício A','Operador Fictício B','Operador Fictício C'])[1 + g % 3],
       '{"pressao":""}'::jsonb, null
from generate_series(1, 27) g;

insert into public.cip_edicoes (registro_id, valores_anteriores, valores_novos, justificativa, alterado_por_nome)
values ('10000000-0000-0000-0000-000000000001', '{}'::jsonb, '{"x":1}'::jsonb, 'Tanque marcado incorretamente', 'Teste'),
       ('10000000-0000-0000-0000-000000000001', '{}'::jsonb, '{"x":2}'::jsonb, 'Hora incorreta', 'Teste');

insert into public.painel_months values ('2026-10', '{"a":1}');
insert into public.painel_current values (1, '2026-10');
insert into public.painel_publications values (1, '2026-10');
insert into public.painel_publicadores values ('ftr@local');
