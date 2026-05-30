"use client";

import { isStagingSmokeHintsEnabled } from "@/lib/staging/smoke-hints";

const STAGING_ACCOUNTS = [
  { label: "Operador", email: "staging-operador@example.com", next: "/agenda" },
  { label: "Financeiro", email: "staging-financeiro@example.com", next: "/finance" },
  { label: "Motorista", email: "staging-motorista@example.com", next: "/driver" },
  { label: "Cliente", email: "staging-cliente@example.com", next: "/client" },
  { label: "Admin", email: "staging-admin@example.com", next: "/dashboard" }
] as const;

type Props = {
  defaultNext?: string;
};

/** Atalhos de conta staging (só com NEXT_PUBLIC_STAGING_SMOKE_HINTS=true). */
export function LoginStagingAccounts({ defaultNext }: Props) {
  if (!isStagingSmokeHintsEnabled()) return null;

  return (
    <aside className="mt-4 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-950">
      <p className="font-semibold">Contas staging (mesma senha do seed)</p>
      <ul className="mt-2 space-y-1">
        {STAGING_ACCOUNTS.map((acc) => (
          <li key={acc.email}>
            <button
              type="button"
              className="text-left underline hover:no-underline"
              onClick={() => {
                const form = document.querySelector<HTMLFormElement>("form[action]");
                if (!form) return;
                const email = form.querySelector<HTMLInputElement>('input[name="email"]');
                const next = form.querySelector<HTMLInputElement>('input[name="next"]');
                if (email) email.value = acc.email;
                if (next) next.value = defaultNext?.trim() || acc.next;
                email?.focus();
              }}
            >
              {acc.label}: {acc.email}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 opacity-80">
        Se aparecer &quot;Invalid login credentials&quot;, execute o seed no Supabase deste ambiente (
        <code>npm run seed:staging</code> ou workflow Staging seed).
      </p>
    </aside>
  );
}
