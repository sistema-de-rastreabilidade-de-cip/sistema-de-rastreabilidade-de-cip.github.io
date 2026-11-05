# Sistema de Rastreabilidade de CIP

Registro e consulta das limpezas CIP (Cleaning in Place) da fermentação, publicado pelo
GitHub Pages em **https://sistema-de-rastreabilidade-de-cip.github.io/**

## Estrutura

```
docs/               ← o sistema (o GitHub Pages publica a pasta /docs do main)
  index.html        ← login
  registro.html     ← novo registro de CIP
  historico.html    ← histórico e edições com justificativa
  painel.html       ← painel da administração
  js/config.js      ← URL e chave PÚBLICA do Supabase
supabase/schema.sql ← tabelas, RLS e funções (referência; já aplicado)
```

O sistema não tem funções de servidor: o navegador conversa direto com o Supabase
(projeto `krscjbdphymgzjteclif`), e as permissões ficam no RLS do banco. A chave em
`js/config.js` é a pública (`sb_publishable_`), a mesma que qualquer navegador recebe.

## Atualizar

Cada mudança no `main` que toque a pasta `docs/` é publicada sozinha em 1 a 2 minutos.

Histórico anterior do código: repositório `PabloConstant/Sistema-de-Rastreabilidade-de-CIP`.
