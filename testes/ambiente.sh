#!/usr/bin/env bash
# Configuração comum dos testes locais. Tudo roda num PostgreSQL LOCAL,
# com dados fictícios — nenhum teste acessa o Supabase de produção.
TESTES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$TESTES_DIR/.." && pwd)"
export PGTESTE_DIR="${PGTESTE_DIR:-/var/lib/postgresql/cipteste}"   # pasta do cluster local
export PGTESTE_PORTA="${PGTESTE_PORTA:-54329}"
PSQL_BASE=(psql -h "$PGTESTE_DIR" -p "$PGTESTE_PORTA" -U postgres -X -q)
