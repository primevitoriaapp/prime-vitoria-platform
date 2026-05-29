# Modo MVP operacional — Prime Vitória

> **Foco principal (a partir de maio/2026):** substituir o processo actual (WhatsApp, agenda manual, planilhas) por operação **dentro da plataforma**.  
> Fluxo obrigatório: **Cliente → Operador → Motorista → Financeiro**.

## Filtro de prioridade (todo ciclo de código)

**“Isso aproxima ou afasta o sistema do fluxo operacional real da Prime Vitória?”**

- Se não impacta a operação diária → **Fase 2** ou depois.
- Infra/documentação só quando **desbloqueia** o fluxo no celular com dados reais.

## Definição do MVP (o que tem de funcionar no telemóneo)

### 1. Cadastro completo

| Entidade | Criar | Editar | Inactivar | Notas no repo |
|----------|-------|--------|-----------|---------------|
| Clientes / empresas contratantes | ✓ UI | ✓ UI | ✓ UI | `/clients` |
| Veículos | ✓ UI | ✓ UI | ✓ UI | `/vehicles` |
| Motoristas | ✓ parcial | **falta** | **falta** | `/drivers` — perfil + CPF; falta telefone, editar, inactivar |

### 2. Gestão operacional (corrida / OS)

| Acção | Estado |
|-------|--------|
| Criar corrida (UI) | ✓ agenda — `OperadorTripCreatePanel` |
| Editar corrida (dados, passageiro, origem/destino, notas, valores) | **falta UI** |
| Cancelar | API/status; **falta botão operador na agenda** |
| Reagendar | **falta** |
| Duplicar | **falta** |

### 3. Dados da corrida (ficha completa)

Passageiro, telefone, empresa (cliente), origem, destino, data/hora, observações, **valor cliente**, **valor motorista** — parte em API/DB; **expor e editar na ficha da agenda** é prioridade.

### 4. Fluxo operador

Criar → aprovar → despachar → acompanhar status → encerrar — **núcleo existe** na agenda; falta editar/cancelar/reagendar e valores visíveis na mesma ficha.

### 5. Fluxo motorista

Receber → aceitar → em deslocamento → cheguei → embarcado → em andamento → finalizada — **UI existe** (`/driver`); depende de seed + despacho real. **Próximas corridas** — melhorar lista.

### 6. Fluxo cliente

Ver atendimento, status, motorista/veículo — **read-only** em `/client`; depende de `client_id` no perfil + seed.

### 7. Financeiro básico (por corrida)

Valor cliente, valor motorista, margem, pago/pendente — **parcial** (`trip_financials`, painel financeiro); **resumo operacional simples na agenda** — prioridade.

## Fase 2 (não bloqueia MVP)

- Bandeira 1 / 2 por horário  
- Cobrança por tempo parado  
- Modo **aguardando passageiro** + cronómetro + retomada por movimento  
- Push completas, PWA motorista avançado  

## Ordem de execução (engenharia)

**Pré-requisito:** Preview + Supabase + seed + login (`staging:real-check` PASS).

### Prioridade 1 — Cadastro operacional completo

**Motoristas:** editar cadastro · telefone · WhatsApp · veículo vinculado · activar/inactivar  
**Clientes (empresas contratantes):** criar · editar · activar/inactivar  
**Veículos:** criar · editar · activar/inactivar  

### Prioridade 2 — Corrida / OS

Ficha mínima: empresa · passageiro · telefone · origem · destino · data · horário · observações · motorista · veículo · valor cliente · valor motorista  

Acções: criar · editar · cancelar · reagendar  

### Prioridade 3 — Fluxo motorista (celular)

Corrida actual · próximas corridas · aceitar · em deslocamento · cheguei · passageiro embarcado · em andamento · finalizada  

*Preparar Fase 2 (sem bloquear MVP):* aguardando passageiro · iniciar/encerrar espera · cobrança por tempo parado  

### Prioridade 4 — Financeiro operacional (na corrida)

Valor cliente · valor motorista · margem · pago · pendente — **sem expandir ERP**  

### Prioridade 5 — Validação real (critério final)

Operador cria → despacha → motorista recebe/aceita/executa → cliente acompanha → pricing calcula → histórico grava — **celular + UI**, sem UUID, consola ou API manual  

### Fase 2 (depois do MVP validado)

Bandeira 1/2 · aguardando passageiro · tempo parado · retomada GPS · melhorias financeiras · push/PWA avançado  

## Critério de “MVP validado”

Uma corrida **real** no Preview, no celular, sem UUID/consola/seed manual no meio do fluxo:

**Operador cria → despacha → motorista aceita e fecha estados → cliente acompanha → histórico e valores gravados.**

Registo: `docs/STAGING_VALIDATION_EXECUTION_LOG.md` (PASS/FAIL por passo, não relatório de arquitectura).

## Regras inegociáveis

| Regra | |
|-------|---|
| Deploy produção | Só com aprovação explícita |
| Merge `main` | Só com aprovação explícita |
| `db:push` destrutivo | Só com aprovação explícita |
| Portal cliente writes | OFF por defeito até operação pedir |
| Pricing Comexport runtime | Não quebrar; flags OFF por defeito |

## Branch e ambiente

- Branch: `cursor/pricing-engine-mvp-cycle`  
- URL staging: `docs/STAGING_PREVIEW_OFFICIAL.md`  
- PR: GitHub #2  

## Documentos de apoio (uso operacional)

- [STAGING_PREVIEW_OFFICIAL.md](./STAGING_PREVIEW_OFFICIAL.md) — preview + seed  
- [OPERATIONAL_HUMAN_SMOKE.md](./OPERATIONAL_HUMAN_SMOKE.md) — roteiro humano  
- [STAGING_VALIDATION_EXECUTION_LOG.md](./STAGING_VALIDATION_EXECUTION_LOG.md) — decisões  
- [BLOCKERS_AND_NEXT_ACTIONS.md](./BLOCKERS_AND_NEXT_ACTIONS.md) — blockers  
