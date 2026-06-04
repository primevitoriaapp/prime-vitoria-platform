#!/usr/bin/env bash
# Aplica migration 0044 APENAS em staging (não produção sem confirmação explícita).
#
# Uso:
#   export STAGING_DATABASE_URL="postgresql://..."
#   export CONFIRM_STAGING_MIGRATION=true
#   npm run db:apply-0044-staging
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL_FILE="$ROOT/supabase/migrations/0044_operational_cadastro_extend.sql"
URL="${STAGING_DATABASE_URL:-${DATABASE_URL:-}}"

if [[ -z "$URL" ]]; then
  echo "ERRO: Defina STAGING_DATABASE_URL (connection string Postgres do Supabase de staging)." >&2
  exit 1
fi

if [[ "${CONFIRM_STAGING_MIGRATION:-}" != "true" ]]; then
  echo "ERRO: Para aplicar em staging, defina CONFIRM_STAGING_MIGRATION=true" >&2
  echo "      Isto evita apply acidental. Use STAGING_DATABASE_URL (não produção)." >&2
  exit 1
fi

if [[ -n "${BLOCK_PRODUCTION_HOST:-}" ]]; then
  case "$URL" in
    *"$BLOCK_PRODUCTION_HOST"*)
      echo "ERRO: URL parece apontar para host bloqueado: $BLOCK_PRODUCTION_HOST" >&2
      exit 1
      ;;
  esac
fi

echo "=== Apply migration 0044 (staging) ==="
echo "Ficheiro: $SQL_FILE"
echo "Host: $(echo "$URL" | sed -E 's|.*@([^:/]+).*|\1|')"

export DATABASE_URL="$URL"
bash "$ROOT/scripts/apply-migration.sh" "$SQL_FILE"

psql "$URL" -v ON_ERROR_STOP=1 <<'EOSQL'
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('0044', 'operational_cadastro_extend', ARRAY[]::text[])
ON CONFLICT (version) DO NOTHING;
EOSQL

echo ""
echo "OK: migration 0044 aplicada. Validar:"
echo "  DATABASE_URL=\"\$STAGING_DATABASE_URL\" npm run db:validate-operational-0044"
