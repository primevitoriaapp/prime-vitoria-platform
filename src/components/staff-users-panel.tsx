"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";

type Staff = { id: string; name: string | null; email: string | null; phone: string | null; role: string; active: boolean | null; me: boolean };

const ROLES = [
  { id: "admin", label: "Administrador", hint: "Vê e muda tudo, inclusive usuários e financeiro." },
  { id: "operador", label: "Operador", hint: "Agenda, corridas, motoristas e clientes. Não vê o financeiro." },
  { id: "financeiro", label: "Financeiro", hint: "Faturas, recebimentos, pagamentos e relatórios." }
] as const;

const roleLabel = (r: string) => ROLES.find((x) => x.id === r)?.label ?? r;

/** Usuários → equipe da Prime: criar, mudar papel, desativar e gerar nova senha. */
export function StaffUsersPanel() {
  const [list, setList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "operador" as (typeof ROLES)[number]["id"] });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [credential, setCredential] = useState<{ name: string; email: string; password: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchWithSupabaseSession("/api/staff-users", {}, "admin");
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Staff[]; error?: { message?: string } };
    if (res.ok && json.success) setList(json.data ?? []);
    else setMsg({ ok: false, text: json.error?.message ?? "Não foi possível carregar os usuários." });
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (form.name.trim().length < 2 || !form.email.includes("@")) {
      setMsg({ ok: false, text: "Informe nome e e-mail." });
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await fetchWithSupabaseSession("/api/staff-users", { method: "POST", body: JSON.stringify(form) }, "admin");
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { email: string; password: string }; error?: { message?: string } };
    setBusy(false);
    if (!res.ok || !json.success || !json.data) {
      setMsg({ ok: false, text: json.error?.message ?? "Não foi possível criar." });
      return;
    }
    setCredential({ name: form.name, email: json.data.email, password: json.data.password });
    setForm({ name: "", email: "", phone: "", role: "operador" });
    setShowForm(false);
    void load();
  }

  async function patch(u: Staff, body: Record<string, unknown>, okText: string) {
    setBusy(true);
    setMsg(null);
    const res = await fetchWithSupabaseSession(`/api/staff-users/${u.id}`, { method: "PATCH", body: JSON.stringify(body) }, "admin");
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { password: string | null }; error?: { message?: string } };
    setBusy(false);
    if (!res.ok || !json.success) {
      setMsg({ ok: false, text: json.error?.message ?? "Não foi possível alterar." });
      return;
    }
    if (json.data?.password) setCredential({ name: u.name ?? "", email: u.email ?? "", password: json.data.password });
    else setMsg({ ok: true, text: okText });
    void load();
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Equipe da Prime</h2>
        <button type="button" className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Fechar" : "+ Novo usuário"}
        </button>
      </div>

      {credential ? (
        <div className="rounded-2xl border-2 border-prime-gold bg-[#111] p-4 text-[#fff]">
          <p className="text-sm font-semibold text-prime-gold">Acesso de {credential.name}</p>
          <p className="mt-2 text-sm">
            Endereço: <b>prime-vitoria-web.vercel.app/login</b>
            <br />
            E-mail: <b>{credential.email}</b>
            <br />
            Senha provisória: <b className="font-mono text-lg tracking-wider text-prime-gold">{credential.password}</b>
          </p>
          <p className="mt-2 text-xs text-[#bbb]">
            Anote ou envie para a pessoa agora: esta senha não aparece de novo. Ela pode trocar depois em “Esqueci a senha”.
          </p>
          <button type="button" className="mt-3 text-xs text-prime-gold underline" onClick={() => setCredential(null)}>
            Já anotei, fechar
          </button>
        </div>
      ) : null}

      {showForm ? (
        <div className="grid gap-3 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span>Nome</span>
            <input className={PRIME_INPUT_CLASS} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>E-mail (é o login)</span>
            <input className={PRIME_INPUT_CLASS} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>WhatsApp</span>
            <input className={PRIME_INPUT_CLASS} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <div className="grid gap-1 text-sm sm:col-span-2">
            <span>Papel</span>
            <div className="grid gap-2 sm:grid-cols-3">
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setForm({ ...form, role: r.id })}
                  className={`rounded-xl p-3 text-left ring-1 ${form.role === r.id ? "bg-prime-bg ring-2 ring-prime-gold" : "ring-prime-border"}`}
                >
                  <span className="block font-semibold">{r.label}</span>
                  <span className="block text-xs text-prime-muted">{r.hint}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <button type="button" disabled={busy} className="btn-primary disabled:opacity-50" onClick={() => void create()}>
              {busy ? "Criando…" : "Criar acesso"}
            </button>
          </div>
        </div>
      ) : null}

      {msg ? (
        <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{msg.text}</p>
      ) : null}

      {loading ? (
        <div className="h-24 animate-pulse rounded-2xl border border-prime-border bg-white" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((u) => (
            <article key={u.id} className={`rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card ${u.active === false ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {u.name ?? "Sem nome"} {u.me ? <span className="text-xs text-prime-muted">(você)</span> : null}
                  </p>
                  <p className="truncate text-xs text-prime-muted">{u.email ?? "—"}</p>
                </div>
                <span className="shrink-0 rounded-full bg-prime-bg px-2.5 py-1 text-[11px] font-semibold ring-1 ring-prime-border">
                  {u.active === false ? "Desativado" : roleLabel(u.role)}
                </span>
              </div>
              {!u.me ? (
                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-prime-border pt-3 text-sm">
                  <select
                    className={`${PRIME_INPUT_CLASS} w-auto`}
                    value={u.role}
                    disabled={busy}
                    onChange={(e) => void patch(u, { role: e.target.value }, "Papel alterado.")}
                  >
                    {ROLES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy}
                    className="text-prime-gold hover:underline"
                    onClick={() => window.confirm(`Gerar nova senha para ${u.name}?`) && void patch(u, { reset_password: true }, "")}
                  >
                    Nova senha
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={u.active === false ? "text-emerald-700 hover:underline" : "text-red-700 hover:underline"}
                    onClick={() =>
                      u.active === false
                        ? void patch(u, { active: true }, "Acesso reativado.")
                        : window.confirm(`Tirar o acesso de ${u.name}? Ele não consegue mais entrar.`) &&
                          void patch(u, { active: false }, "Acesso desativado.")
                    }
                  >
                    {u.active === false ? "Reativar" : "Desativar"}
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
