#!/usr/bin/env bash
# Aplica APENAS a migration 0041_pricing_rules no projecto Supabase linked.
#
# PRÉ-REQUISITOS
#   - Supabase CLI (via npx) com projecto linked: tcpgmndarqxwfnonzurl
#   - Aprovação explícita do operador
#
# USO (preparação — dry-run, sem alterações):
#   ./scripts/db-push-pricing-0041.sh dry-run
#
# USO (execução — só após aprovação):
#   CONFIRM=1 ./scripts/db-push-pricing-0041.sh push
#
# PÓS-EXECUÇÃO (read-only):
#   npm run db:validate-pricing-0041
#
set -euo pipefail

cd "$(dirname "$0")/.."

MODE="${1:-dry-run}"

case "$MODE" in
  dry-run)
    echo "=== DRY RUN — nenhuma alteração será aplicada ==="
    npx supabase db push --linked --dry-run
    echo ""
    echo "Próximo passo após aprovação:"
    echo "  CONFIRM=1 ./scripts/db-push-pricing-0041.sh push"
    ;;
  push)
    if [[ "${CONFIRM:-}" != "1" ]]; then
      echo "Bloqueado: defina CONFIRM=1 para executar db:push." >&2
      echo "  CONFIRM=1 ./scripts/db-push-pricing-0041.sh push" >&2
      exit 1
    fi
    echo "=== Aplicando migration 0041_pricing_rules (linked) ==="
    npx supabase db push --linked
    echo ""
    echo "=== Concluído. Execute validação read-only: ==="
    echo "  npm run db:validate-pricing-0041"
    ;;
  *)
    echo "Uso: $0 {dry-run|push}" >&2
    exit 1
    ;;
esac
