#!/usr/bin/env bash
# Aplica migrations P1 (0044 + 0045 + 0046) no Postgres de staging.
#
# Uso:
#   export STAGING_DATABASE_URL="postgresql://..."
#   export CONFIRM_STAGING_MIGRATION=true
#   npm run db:apply-p1-staging
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="${STAGING_DATABASE_URL:-${DATABASE_URL:-}}"

if [[ -z "$URL" ]]; then
  echo "ERRO: Defina STAGING_DATABASE_URL." >&2
  exit 1
fi

if [[ "${CONFIRM_STAGING_MIGRATION:-}" != "true" ]]; then
  echo "ERRO: Defina CONFIRM_STAGING_MIGRATION=true" >&2
  exit 1
fi

export DATABASE_URL="$URL"

for ver file name in \
  "0044:0044_operational_cadastro_extend.sql:operational_cadastro_extend" \
  "0045:0045_driver_photo_url.sql:driver_photo_url" \
  "0046:0046_client_service_types.sql:client_service_types"; do
  IFS=: read -r version sqlfile mig_name <<< "$ver"
  echo "=== Apply $version ($sqlfile) ==="
  bash "$ROOT/scripts/apply-migration.sh" "$ROOT/supabase/migrations/$sqlfile"
  psql "$URL" -v ON_ERROR_STOP=1 -c \
    "INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ('$version', '$mig_name', ARRAY[]::text[]) ON CONFLICT (version) DO NOTHING;"
done

echo ""
echo "OK: migrations P1 aplicadas. Validar:"
echo "  DATABASE_URL=\"\$STAGING_DATABASE_URL\" npm run db:validate-operational-0044"
