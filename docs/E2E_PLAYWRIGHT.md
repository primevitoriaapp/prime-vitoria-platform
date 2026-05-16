# Playwright (E2E local / CI)

## Instalação de browsers

Após `npm install`, na máquina local ou no job CI:

```bash
npm run test:e2e-playwright:install
# ou: npx playwright install chromium
```

Sem este passo, `playwright test` falha com *Executable doesn't exist* para o Chromium.

## Comandos

- **Mock / CI (sem staging):** `npm run test:e2e-playwright` — sobe `next dev` via `playwright.config` e corre `e2e/pilot-*.spec.ts`.
- **Staging autenticado:** `PLAYWRIGHT_STAGING=1 npm run test:e2e-playwright:staging` (requer env de Supabase e `BASE_URL`).

## Notas

- Specs `pilot-*-mock.spec.ts` usam `page.route` para APIs e cabeçalhos `x-role` em desenvolvimento (`TRUST_HEADER_AUTH` conforme `next.config`).
- Se `next dev` falhar com erro de interfaces de rede no sandbox, executar os testes fora do sandbox ou na CI oficial.
