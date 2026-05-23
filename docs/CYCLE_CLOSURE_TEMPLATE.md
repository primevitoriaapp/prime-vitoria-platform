# Relatório de fechamento de ciclo — Prime Vitória

Modelo oficial para registar o fecho de qualquer ciclo de entrega. Copie esta secção para o relatório do ciclo (ex.: entrada em [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) ou nota de PR).

> **Regra:** alterações destrutivas (drop de coluna/tabela, truncate, reset de dados, `force` push, rollback irreversível) **só** com confirmação explícita do utilizador.

---

1. O que foi alterado
2. Quais arquivos foram modificados
3. Impacto da mudança
4. Risco de regressão (baixo/médio/alto)
5. Precisa migration? (sim/não)
6. Precisa db:push? (sim/não)
7. Precisa deploy? (sim/não)
8. O que ficou pendente
9. Recomendação de próximo passo
10. Status do GitHub/Vercel/Supabase
    - branch atual
    - commit hash
    - Vercel alinhado? (sim/não)
    - Supabase alinhado? (sim/não)
11. Impacto no MVP
    - MVP crítico | melhoria operacional | infraestrutura | preparação futura
12. Testado?
    - [ ] local / [ ] staging / [ ] produção
