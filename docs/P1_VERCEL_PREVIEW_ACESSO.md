# Desbloquear acesso ao Preview P1 (Vercel)

> Sintoma: URL do preview devolve **401** e página **"Authentication Required"** (não é Password Protection nem Trusted IP).

---

## O que está a bloquear

**Vercel Authentication** (Deployment Protection para Preview).  
Exige login na conta Vercel / equipa antes de ver a app.

Password Protection e Trusted IP **já estão desactivados** (confirmado) — falta esta camada.

---

## Caminho no painel Vercel (passo a passo)

1. Abrir https://vercel.com/rubens-projects2/prime-vitoria-web  
2. **Settings** (definições do projecto)  
3. **Deployment Protection** (menu lateral)  
4. Secção **Preview Deployments** (ou **Vercel Authentication**)  
5. Desactivar **“Vercel Authentication”** para previews  
   - Alternativa temporária: **“Only team members”** e garantir que o tester tem convite na equipa `rubens-projects2`  
6. **Save**  
7. **Deployments** → abrir deployment `3cd8522` → **Redeploy** (opcional, normalmente não necessário)

**Link directo do deployment P1:**  
https://vercel.com/rubens-projects2/prime-vitoria-web/b4zBDpLScquyL6hLqyAs4NxDL3cP  
→ botão **Visit** (funciona com sessão Vercel mesmo com protection activa)

---

## Verificar amanhã (30 segundos)

```bash
npm run p1:check-preview
```

| Resultado | Significado |
|-----------|-------------|
| `HTTP 200` | Preview acessível — abrir URL no browser |
| `HTTP 401` | Ainda bloqueado — repetir passos acima ou usar **Visit** no painel |

Ou no browser (sem login Vercel): abrir a [URL oficial P1](./P1_HOMOLOGACAO_URL_OFICIAL.md) — deve carregar login da **app** (Prime Vitória), não página cinza da Vercel.

---

## Bypass para CI / scripts (não substitui homologação humana)

1. Vercel → **Settings → Deployment Protection → Automation**  
2. Gerar **Protection Bypass for Automation**  
3. Guardar como secret `VERCEL_AUTOMATION_BYPASS_SECRET` (GitHub Actions)  
4. Scripts enviam header `x-vercel-protection-bypass`

Homologação humana: preferir **desactivar Vercel Authentication** no preview.

---

## O que NÃO fazer

- Não alterar **Production** Deployment Protection para “testar P1”  
- Não fazer deploy `--prod`  
- Não usar `prime-vitoria-web.vercel.app` para homologar P1
