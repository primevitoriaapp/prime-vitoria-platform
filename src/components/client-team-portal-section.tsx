"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { ClientPassengerRow } from "@/lib/clients/client-passengers";
import type { CostCenterRow } from "@/lib/clients/client-cost-centers";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import { PRIME_SURFACE_CARD } from "@/lib/ui/prime-surface-card";

type Tab = "funcionarios" | "centros";

type Props = {
  clientId: string;
  canManage: boolean;
  devFallbackRole?: "cliente" | "admin";
};

type PassengerForm = {
  name: string;
  phone: string;
  address: string;
  matricula: string;
  sector: string;
  postal_code: string;
};

type CenterForm = {
  name: string;
  code: string;
  responsible_name: string;
  responsible_email: string;
};

const emptyPassenger = (): PassengerForm => ({
  name: "",
  phone: "",
  address: "",
  matricula: "",
  sector: "",
  postal_code: ""
});

const emptyCenter = (): CenterForm => ({
  name: "",
  code: "",
  responsible_name: "",
  responsible_email: ""
});

export function ClientTeamPortalSection({
  clientId,
  canManage,
  devFallbackRole = "cliente"
}: Props) {
  const [tab, setTab] = useState<Tab>("funcionarios");
  const [passengers, setPassengers] = useState<ClientPassengerRow[]>([]);
  const [centers, setCenters] = useState<CostCenterRow[]>([]);
  const [pForm, setPForm] = useState<PassengerForm>(emptyPassenger());
  const [cForm, setCForm] = useState<CenterForm>(emptyCenter());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cepBusy, setCepBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadPassengers = useCallback(async () => {
    const q = canManage ? "?include_inactive=1" : "";
    const res = await fetchWithSupabaseSession(
      `/api/clients/${clientId}/passengers${q}`,
      {},
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; data?: ClientPassengerRow[] };
    if (res.ok && json.success) setPassengers(json.data ?? []);
  }, [clientId, canManage, devFallbackRole]);

  const loadCenters = useCallback(async () => {
    const res = await fetchWithSupabaseSession(
      `/api/clients/${clientId}/cost-centers`,
      {},
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; data?: CostCenterRow[] };
    if (res.ok && json.success) setCenters(json.data ?? []);
  }, [clientId, devFallbackRole]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadPassengers(), loadCenters()]);
    setLoading(false);
  }, [loadPassengers, loadCenters]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function lookupCep() {
    const cep = pForm.postal_code.replace(/\D/g, "");
    if (cep.length !== 8) {
      setMessage("Informe um CEP válido (8 dígitos).");
      return;
    }
    setCepBusy(true);
    const res = await fetchWithSupabaseSession(
      `/api/integrations/viacep-lookup?cep=${encodeURIComponent(cep)}`,
      {},
      devFallbackRole
    );
    const json = (await res.json()) as {
      success?: boolean;
      data?: { logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      error?: { message?: string };
    };
    setCepBusy(false);
    if (!res.ok || !json.success || !json.data) {
      setMessage(json.error?.message ?? "CEP não encontrado.");
      return;
    }
    const d = json.data;
    const line = [d.logradouro, d.bairro, d.localidade && d.uf ? `${d.localidade}/${d.uf}` : d.localidade]
      .filter(Boolean)
      .join(", ");
    setPForm((f) => ({ ...f, address: line }));
    setMessage(null);
  }

  function startEdit(row: ClientPassengerRow) {
    setEditingId(row.id);
    setPForm({
      name: row.name,
      phone: row.phone ?? "",
      address: row.address ?? "",
      matricula: row.matricula ?? "",
      sector: row.sector ?? "",
      postal_code: ""
    });
  }

  async function savePassenger(e: FormEvent) {
    e.preventDefault();
    if (!canManage || !pForm.name.trim()) return;
    setBusy(true);
    setMessage(null);
    const body = {
      name: pForm.name.trim(),
      phone: pForm.phone.trim() || null,
      address: pForm.address.trim() || null,
      matricula: pForm.matricula.trim() || null,
      sector: pForm.sector.trim() || null
    };
    const res = editingId
      ? await fetchWithSupabaseSession(
          `/api/clients/${clientId}/passengers/${editingId}`,
          { method: "PATCH", body: JSON.stringify(body) },
          devFallbackRole
        )
      : await fetchWithSupabaseSession(
          `/api/clients/${clientId}/passengers`,
          { method: "POST", body: JSON.stringify(body) },
          devFallbackRole
        );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao guardar funcionário.");
      return;
    }
    setMessage(editingId ? "Funcionário actualizado." : "Funcionário adicionado.");
    setEditingId(null);
    setPForm(emptyPassenger());
    void loadPassengers();
  }

  async function deactivatePassenger(id: string) {
    if (!canManage) return;
    setBusy(true);
    const res = await fetchWithSupabaseSession(
      `/api/clients/${clientId}/passengers/${id}`,
      { method: "PATCH", body: JSON.stringify({ active: false }) },
      devFallbackRole
    );
    setBusy(false);
    if (res.ok) {
      setMessage("Funcionário desactivado.");
      void loadPassengers();
    }
  }

  async function saveCenter(e: FormEvent) {
    e.preventDefault();
    if (!canManage || !cForm.name.trim()) return;
    setBusy(true);
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      `/api/clients/${clientId}/cost-centers`,
      {
        method: "POST",
        body: JSON.stringify({
          name: cForm.name.trim(),
          code: cForm.code.trim() || null,
          responsible_name: cForm.responsible_name.trim() || null,
          responsible_email: cForm.responsible_email.trim() || null
        })
      },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao guardar centro de custo.");
      return;
    }
    setMessage("Centro de custo adicionado.");
    setCForm(emptyCenter());
    void loadCenters();
  }

  return (
    <section id="equipe" className="scroll-mt-6 space-y-4">
      <div>
        <h2 className="font-serif text-xl text-prime-text">Minha equipe</h2>
        <p className="mt-1 text-sm text-prime-muted">
          {canManage
            ? "Cadastre funcionários e centros de custo para uso nas solicitações de corrida."
            : "Consulta dos funcionários e centros de custo da sua empresa."}
        </p>
      </div>

      <div className="inline-flex rounded-lg border border-prime-border bg-white p-0.5 text-sm">
        <button
          type="button"
          className={`rounded-md px-4 py-2 ${tab === "funcionarios" ? "bg-prime-gold/20 font-medium" : "text-prime-muted"}`}
          onClick={() => setTab("funcionarios")}
        >
          Funcionários
        </button>
        <button
          type="button"
          className={`rounded-md px-4 py-2 ${tab === "centros" ? "bg-prime-gold/20 font-medium" : "text-prime-muted"}`}
          onClick={() => setTab("centros")}
        >
          Centros de custo
        </button>
      </div>

      {message ? <p className="text-sm text-prime-text">{message}</p> : null}

      {loading ? (
        <p className="text-sm text-prime-muted">A carregar…</p>
      ) : tab === "funcionarios" ? (
        <div className="space-y-4">
          {canManage ? (
            <form onSubmit={(e) => void savePassenger(e)} className={`${PRIME_SURFACE_CARD} grid gap-3 sm:grid-cols-2`}>
              <label className="grid gap-1 text-sm sm:col-span-2">
                <span>Nome completo *</span>
                <input
                  required
                  className={PRIME_INPUT_CLASS}
                  value={pForm.name}
                  onChange={(e) => setPForm((f) => ({ ...f, name: e.target.value }))}
                  disabled={busy}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Telefone</span>
                <input
                  className={PRIME_INPUT_CLASS}
                  value={pForm.phone}
                  onChange={(e) => setPForm((f) => ({ ...f, phone: e.target.value }))}
                  disabled={busy}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Matrícula</span>
                <input
                  className={PRIME_INPUT_CLASS}
                  value={pForm.matricula}
                  onChange={(e) => setPForm((f) => ({ ...f, matricula: e.target.value }))}
                  disabled={busy}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Setor / centro de custo</span>
                <input
                  className={PRIME_INPUT_CLASS}
                  value={pForm.sector}
                  onChange={(e) => setPForm((f) => ({ ...f, sector: e.target.value }))}
                  disabled={busy}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>CEP</span>
                <div className="flex gap-2">
                  <input
                    className={PRIME_INPUT_CLASS}
                    value={pForm.postal_code}
                    onChange={(e) => setPForm((f) => ({ ...f, postal_code: e.target.value }))}
                    disabled={busy || cepBusy}
                    placeholder="00000-000"
                  />
                  <button
                    type="button"
                    className="btn-outline shrink-0 px-3 text-xs"
                    disabled={busy || cepBusy}
                    onClick={() => void lookupCep()}
                  >
                    {cepBusy ? "…" : "Buscar"}
                  </button>
                </div>
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">
                <span>Endereço</span>
                <input
                  className={PRIME_INPUT_CLASS}
                  value={pForm.address}
                  onChange={(e) => setPForm((f) => ({ ...f, address: e.target.value }))}
                  disabled={busy}
                />
              </label>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">
                  {busy ? "A guardar…" : editingId ? "Actualizar" : "Adicionar funcionário"}
                </button>
                {editingId ? (
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => {
                      setEditingId(null);
                      setPForm(emptyPassenger());
                    }}
                  >
                    Cancelar
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}

          <div className={PRIME_SURFACE_CARD}>
            {passengers.length === 0 ? (
              <p className="text-sm text-prime-muted">Nenhum funcionário cadastrado.</p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {passengers.map((p) => (
                  <li
                    key={p.id}
                    className={`flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0 ${!p.active ? "opacity-60" : ""}`}
                  >
                    <div>
                      <p className="font-medium text-prime-text">
                        {p.name}
                        {!p.active ? (
                          <span className="ml-2 text-xs text-prime-muted">(inactivo)</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-prime-muted">
                        {[p.phone, p.matricula, p.sector].filter(Boolean).join(" · ") || "—"}
                      </p>
                      {p.address ? (
                        <p className="mt-0.5 text-xs text-prime-muted">{p.address}</p>
                      ) : null}
                    </div>
                    {canManage && p.active ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-xs text-prime-gold hover:underline"
                          onClick={() => startEdit(p)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="text-xs text-red-700 hover:underline"
                          onClick={() => void deactivatePassenger(p.id)}
                        >
                          Desactivar
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {canManage ? (
            <form onSubmit={(e) => void saveCenter(e)} className={`${PRIME_SURFACE_CARD} grid gap-3 sm:grid-cols-2`}>
              <label className="grid gap-1 text-sm">
                <span>Nome do centro *</span>
                <input
                  required
                  className={PRIME_INPUT_CLASS}
                  value={cForm.name}
                  onChange={(e) => setCForm((f) => ({ ...f, name: e.target.value }))}
                  disabled={busy}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Código</span>
                <input
                  className={PRIME_INPUT_CLASS}
                  value={cForm.code}
                  onChange={(e) => setCForm((f) => ({ ...f, code: e.target.value }))}
                  disabled={busy}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Responsável</span>
                <input
                  className={PRIME_INPUT_CLASS}
                  value={cForm.responsible_name}
                  onChange={(e) => setCForm((f) => ({ ...f, responsible_name: e.target.value }))}
                  disabled={busy}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>E-mail do responsável</span>
                <input
                  type="email"
                  className={PRIME_INPUT_CLASS}
                  value={cForm.responsible_email}
                  onChange={(e) => setCForm((f) => ({ ...f, responsible_email: e.target.value }))}
                  disabled={busy}
                />
              </label>
              <button type="submit" disabled={busy} className="btn-primary sm:col-span-2 disabled:opacity-50">
                {busy ? "A guardar…" : "Adicionar centro de custo"}
              </button>
            </form>
          ) : null}

          <div className={PRIME_SURFACE_CARD}>
            {centers.length === 0 ? (
              <p className="text-sm text-prime-muted">Nenhum centro de custo cadastrado.</p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {centers.map((c) => (
                  <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="font-medium text-prime-text">
                      {c.code ? `${c.code} · ` : ""}
                      {c.name}
                    </p>
                    {c.responsible_name || c.responsible_email ? (
                      <p className="text-xs text-prime-muted">
                        {[c.responsible_name, c.responsible_email].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
