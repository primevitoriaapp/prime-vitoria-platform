"use client";

import { useCallback, useEffect, useState } from "react";

type ProfileRow = {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  client_id: string | null;
  active: boolean;
};

type ClientRow = { id: string; name: string };

export function ProfileClientScopePanel() {
  const [profiles, setProfiles] = useState<ProfileRow[] | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([
      fetch("/api/profiles", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/clients", { credentials: "include" }).then((r) => r.json())
    ])
      .then(([pBody, cBody]) => {
        if (!pBody?.success) {
          setError(pBody?.error?.message ?? "Não foi possível carregar perfis.");
          setProfiles(null);
          return;
        }
        if (!cBody?.success) {
          setError(cBody?.error?.message ?? "Não foi possível carregar clientes.");
          setProfiles(null);
          return;
        }
        setProfiles(pBody.data as ProfileRow[]);
        const raw = cBody.data as { id: string; name: string }[];
        setClients((raw ?? []).map((c) => ({ id: c.id, name: c.name })));
      })
      .catch(() => {
        setError("Falha de rede ao carregar dados.");
        setProfiles(null);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveClientScope(profileId: string, clientId: string | null) {
    setBusyId(profileId);
    setError(null);
    try {
      const res = await fetch(`/api/profiles/${profileId}/client-scope`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId })
      });
      const body = await res.json();
      if (!res.ok || !body?.success) {
        setError(body?.error?.message ?? "Falha ao atualizar vínculo.");
        return;
      }
      await load();
    } catch {
      setError("Falha de rede ao gravar.");
    } finally {
      setBusyId(null);
    }
  }

  if (profiles === null && !error) {
    return <p className="text-sm text-slate-600">A carregar perfis…</p>;
  }

  if (profiles === null) {
    return <p className="text-sm text-red-700">{error ?? "Erro."}</p>;
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Papel</th>
              <th className="px-3 py-2">Cliente corporativo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {profiles.map((p) => (
              <tr key={p.id} className="text-slate-800">
                <td className="px-3 py-2">
                  <div className="font-medium">{p.name}</div>
                  <div className="font-mono text-xs text-slate-500">{p.id.slice(0, 8)}…</div>
                </td>
                <td className="px-3 py-2">{p.role}</td>
                <td className="px-3 py-2">
                  {p.role === "cliente" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        key={`${p.id}-${p.client_id ?? "none"}`}
                        defaultValue={p.client_id ?? ""}
                        className="max-w-[220px] rounded border border-slate-300 px-2 py-1.5 text-slate-900"
                        disabled={busyId === p.id}
                        onChange={(e) => {
                          const v = e.target.value;
                          void saveClientScope(p.id, v === "" ? null : v);
                        }}
                      >
                        <option value="">— sem vínculo —</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      {busyId === p.id ? <span className="text-xs text-slate-500">A gravar…</span> : null}
                    </div>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
