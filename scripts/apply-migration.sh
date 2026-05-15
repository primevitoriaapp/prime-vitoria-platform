#!/usr/bin/env bash
# Aplica um ficheiro de migração SQL ao Postgres remoto (ex.: Supabase).
# Uso: DATABASE_URL="postgresql://postgres:[pwd]@db.[ref].supabase.co:5432/postgres" \
#      ./scripts/apply-migration.sh supabase/migrations/0015_dispatch_automation_offer_direct_exclusive.sql
set -euo pipefail
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Defina DATABASE_URL (connection string Postgres do projeto Supabase)." >&2
  exit 1
fi
if [[ $# -lt 1 ]]; then
  echo "Uso: DATABASE_URL=... $0 <caminho-para-ficheiro.sql>" >&2
  exit 1
fi
SQL_FILE="$1"
if [[ ! -f "$SQL_FILE" ]]; then
  echo "Ficheiro não encontrado: $SQL_FILE" >&2
  exit 1
fi
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE"
echo "OK: $SQL_FILE"
