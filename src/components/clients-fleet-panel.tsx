"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { ClientCadastroForm, clientRowToForm } from "@/components/client-cadastro-form";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";

export type ClientRow = {
  id: string;
  type: string;
  name: string;
  trade_name?: string | null;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  address_line?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  notes?: string | null;
  registry_status?: string | null;
  active: boolean;
  portal_requests_enabled?: boolean;
  service_types?: string[] | null;
  enabled_categories?: number;
};

type Props = {
  initialClients: ClientRow[];
};

export function ClientsFleetPanel({ initialClients }: Props) {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>(initialClients);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);

  const reload = useCallback(async () => {
    const qs = includeInactive ? "?include_inactive=1" : "";
    const res = await fetchWithSupabaseSession(`/api/clients${qs}`, { method: "GET" }, "admin");
    const json = (await res.json()) as { success?: boolean; data?: ClientRow[] };
    if (res.ok && json.success) setClients(json.data ?? []);
    router.refresh();
  }, [router, includeInactive]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function setActive(client: ClientRow, active: boolean) {
    setBusy(true);
    try {
      const res = await fetchWithSupabaseSession(
        `/api/clients/${client.id}`,
        { method: "PATCH", body: JSON.stringify({ active }) },
        "admin"
      );
      const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Falha");
      setMessage({ kind: "ok", text: `${client.name} ${active ? "reativada" : "desativada"}.` });
      await reload();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Erro inesperado." });
    } finally {
      setBusy(false);
    }
  }

  async function remove(client: ClientRow) {
    if (
      !window.confirm(
        `Excluir ${client.name}?\n\nSe a empresa já tem corridas ou faturas, o sistema só desativa (para não perder o histórico). Se não tem nada, apaga de vez.`
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetchWithSupabaseSession(`/api/clients/${client.id}`, { method: "DELETE" }, "admin");
      const json = (await res.json()) as { success?: boolean; data?: { message?: string }; error?: { message?: string } };
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Falha ao excluir.");
      setMessage({ kind: "ok", text: json.data?.message ?? "Feito." });
      setEditingId(null);
      await reload();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Erro inesperado." });
    } finally {
      setBusy(false);
    }
  }

  const editingClient = editingId ? clients.find((c) => c.id === editingId) : null;

  if (editingClient) {
    return (
      <>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <BackButton fallbackHref="/clients" onClick={() => setEditingId(null)} />
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
            onClick={() => void remove(editingClient)}
          >
            Excluir empresa
          </button>
        </div>
        <ClientCadastroForm
          title={`Editar: ${editingClient.name}`}
          clientId={editingClient.id}
          initial={clientRowToForm(editingClient)}
          onSuccess={() => {
            setEditingId(null);
            setMessage({ kind: "ok", text: "Alterações salvas." });
            void reload();
          }}
          onCancel={() => setEditingId(null)}
        />
      </>
    );
  }

  if (creating) {
    return (
      <>
        <div className="mb-3">
          <BackButton fallbackHref="/clients" onClick={() => setCreating(false)} />
        </div>
        <ClientCadastroForm
          title="Nova empresa"
          onSuccess={() => {
            setCreating(false);
            setMessage({ kind: "ok", text: "Empresa cadastrada. Abra “Editar” para liberar os veículos e preços." });
            void reload();
          }}
          onCancel={() => setCreating(false)}
        />
      </>
    );
  }

  const q = search.trim().toLowerCase();
  const visible = clients.filter((c) =>
    !q ? true : [c.name, c.trade_name, c.document, c.email, c.city].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <input
          className={`${PRIME_INPUT_CLASS} max-w-sm flex-1`}
          placeholder="Buscar por nome, CNPJ, e-mail ou cidade"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-prime-muted">
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
          Mostrar desativadas
        </label>
        <button type="button" className="btn-primary ml-auto" onClick={() => setCreating(true)}>
          + Nova empresa
        </button>
      </div>

      {message ? (
        <p
          className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
            message.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-prime-border bg-white p-6 text-center text-sm text-prime-muted">
          {clients.length === 0 ? "Nenhuma empresa cadastrada." : "Nenhuma empresa encontrada nessa busca."}
        </p>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((client) => {
            const inactive = client.active === false;
            const cats = client.enabled_categories ?? 0;
            return (
              <article
                key={client.id}
                className={`flex flex-col rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card ${inactive ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#111] text-sm font-bold text-prime-gold">
                      {initials(client.trade_name || client.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-prime-text">{client.trade_name || client.name}</p>
                      {client.trade_name ? <p className="truncate text-xs text-prime-muted">{client.name}</p> : null}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-prime-bg px-2 py-0.5 text-[11px] font-semibold text-prime-muted ring-1 ring-prime-border">
                    {inactive ? "Desativada" : client.type}
                  </span>
                </div>

                <dl className="mt-4 grid gap-1.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-prime-muted">{client.type === "PJ" ? "CNPJ" : "CPF"}</dt>
                    <dd className="truncate">{client.document ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-prime-muted">Contato</dt>
                    <dd className="truncate">{client.whatsapp ?? client.phone ?? client.email ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-prime-muted">Veículos liberados</dt>
                    <dd className={cats === 0 ? "font-semibold text-amber-700" : ""}>
                      {cats === 0 ? "Nenhum ainda" : `${cats} ${cats === 1 ? "categoria" : "categorias"}`}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-prime-muted">Portal</dt>
                    <dd>{client.portal_requests_enabled ? "Pede corridas" : "Só consulta"}</dd>
                  </div>
                </dl>

                <div className="mt-auto flex items-center justify-between gap-2 border-t border-prime-border pt-3 text-sm">
                  <button
                    type="button"
                    className="font-semibold text-prime-gold hover:underline"
                    onClick={() => {
                      setEditingId(client.id);
                      setMessage(null);
                    }}
                  >
                    Editar
                  </button>
                  <div className="flex items-center gap-3">
                    {inactive ? (
                      <button type="button" disabled={busy} className="text-emerald-700 hover:underline" onClick={() => void setActive(client, true)}>
                        Reativar
                      </button>
                    ) : (
                      <button type="button" disabled={busy} className="text-prime-muted hover:underline" onClick={() => void setActive(client, false)}>
                        Desativar
                      </button>
                    )}
                    <button type="button" disabled={busy} className="text-red-700 hover:underline" onClick={() => void remove(client)}>
                      Excluir
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}
