"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CATEGORY_SERVICES, type CategoryService } from "@/lib/pricing/category-catalog";

type Category = { id: string; name: string; passengers: number; photo_url: string | null; active: boolean; allows_km?: boolean };
type Cell = { category_id: string; service: CategoryService; enabled: boolean; client_price: string; partner_price: string };

const key = (c: string, s: string) => `${c}:${s}`;
const toText = (n: number | null | undefined) => (n == null ? "" : Number(n).toFixed(2).replace(".", ","));
/** "3" → "3,00"; "3,5" → "3,50"; "1.234,5" → "1234,50"; vazio continua vazio. */
const moneyText = (raw: string) => {
  const t = raw.trim();
  if (!t) return "";
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : t;
};

/** Cadastro da empresa → veículos liberados e preços por serviço (tudo editável; vazio = a combinar). */
export function ClientCategoryPricesSection({ clientId, disabled }: { clientId: string; disabled?: boolean }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const [cRes, pRes] = await Promise.all([
      fetch("/api/vehicle-categories", { credentials: "include" }),
      fetch(`/api/clients/${clientId}/category-prices`, { credentials: "include" })
    ]);
    const cJson = (await cRes.json().catch(() => ({}))) as { data?: Category[] };
    const pJson = (await pRes.json().catch(() => ({}))) as {
      data?: { category_id: string; service: CategoryService; enabled: boolean; client_price: number | null; partner_price: number | null }[];
    };
    setCategories((cJson.data ?? []).filter((c) => c.active));
    const map: Record<string, Cell> = {};
    for (const p of pJson.data ?? []) {
      map[key(p.category_id, p.service)] = {
        category_id: p.category_id,
        service: p.service,
        enabled: p.enabled,
        client_price: toText(p.client_price),
        partner_price: toText(p.partner_price)
      };
    }
    setCells(map);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  function cell(catId: string, s: CategoryService): Cell {
    return cells[key(catId, s)] ?? { category_id: catId, service: s, enabled: false, client_price: "", partner_price: "" };
  }

  function setCell(catId: string, s: CategoryService, patch: Partial<Cell>) {
    setCells((m) => ({ ...m, [key(catId, s)]: { ...cell(catId, s), ...patch } }));
  }

  const enabledCount = useMemo(
    () => (catId: string) => CATEGORY_SERVICES.filter((s) => cell(catId, s.id).enabled).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cells]
  );

  async function save() {
    setBusy(true);
    setMsg(null);
    const rows = Object.values(cells).map((c) => ({
      category_id: c.category_id,
      service: c.service,
      enabled: c.enabled,
      client_price: c.client_price.trim() === "" ? null : c.client_price,
      partner_price: c.partner_price.trim() === "" ? null : c.partner_price
    }));
    const res = await fetch(`/api/clients/${clientId}/category-prices`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rows)
    });
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: "Veículos e preços salvos." } : { ok: false, text: "Não foi possível salvar. Confira os valores." });
    if (res.ok) void load();
  }

  const input = "w-full rounded-md border border-prime-input-border px-2 py-1.5 text-sm";

  return (
    <section className="card space-y-4 md:col-span-2">
      <div>
        <h3 className="text-base font-semibold text-prime-text">Veículos e preços desta empresa</h3>
        <p className="mt-1 text-sm text-prime-muted">
          Ligue o que a empresa pode pedir. Valor vazio = <b>a combinar</b> (você completa na corrida). O cliente nunca vê valor de transfer e
          diária; no corporativo ele vê só a estimativa por km.
        </p>
      </div>

      <ul className="grid gap-2">
        {categories.map((c) => {
          const n = enabledCount(c.id);
          const isOpen = open === c.id;
          return (
            <li key={c.id} className="rounded-xl border border-prime-border">
              <button type="button" onClick={() => setOpen(isOpen ? null : c.id)} className="flex w-full items-center gap-3 p-3 text-left">
                <span className="flex h-12 w-16 items-center justify-center overflow-hidden rounded-md bg-prime-bg text-[10px] text-prime-muted">
                  {c.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.photo_url} alt="" className="h-full w-full object-contain" />
                  ) : (
                    "sem foto"
                  )}
                </span>
                <span className="flex-1">
                  <span className="block font-medium">{c.name}</span>
                  <span className="text-xs text-prime-muted">
                    {c.passengers} lugares · {n > 0 ? `${n} serviço(s) liberado(s)` : "não liberado"}
                    {c.allows_km ? " · cobra por km" : " · só transfer e diárias"}
                  </span>
                </span>
                <span className="text-prime-muted">{isOpen ? "▲" : "▼"}</span>
              </button>
              {isOpen ? (
                <div className="overflow-x-auto border-t border-prime-border p-3">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-prime-muted">
                        <th className="pb-2">Liberar</th>
                        <th className="pb-2">Serviço</th>
                        <th className="pb-2">Cliente paga</th>
                        <th className="pb-2">Parceiro recebe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {CATEGORY_SERVICES.filter((s) => c.allows_km || (s.id !== "km_b1" && s.id !== "km_b2")).map((s) => {
                        const v = cell(c.id, s.id);
                        return (
                          <tr key={s.id} className="border-t border-prime-border">
                            <td className="py-2">
                              <input
                                type="checkbox"
                                checked={v.enabled}
                                disabled={disabled || busy}
                                onChange={(e) => setCell(c.id, s.id, { enabled: e.target.checked })}
                              />
                            </td>
                            <td className="py-2 pr-2">
                              {s.label}
                              <span className="block text-xs text-prime-muted">{s.unit}</span>
                            </td>
                            <td className="py-2 pr-2">
                              <div className="relative">
                                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-prime-muted">R$</span>
                                <input
                                  inputMode="decimal"
                                  className={`${input} pl-8 text-right`}
                                  placeholder="a combinar"
                                  value={v.client_price}
                                  disabled={disabled || busy}
                                  onChange={(e) => setCell(c.id, s.id, { client_price: e.target.value.replace(/[^0-9.,]/g, "") })}
                                  onBlur={(e) => setCell(c.id, s.id, { client_price: moneyText(e.target.value) })}
                                />
                              </div>
                            </td>
                            <td className="py-2">
                              <div className="relative">
                                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-prime-muted">R$</span>
                                <input
                                  inputMode="decimal"
                                  className={`${input} pl-8 text-right`}
                                  placeholder="a combinar"
                                  value={v.partner_price}
                                  disabled={disabled || busy}
                                  onChange={(e) => setCell(c.id, s.id, { partner_price: e.target.value.replace(/[^0-9.,]/g, "") })}
                                  onBlur={(e) => setCell(c.id, s.id, { partner_price: moneyText(e.target.value) })}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-3">
        <button type="button" disabled={disabled || busy} onClick={() => void save()} className="btn-primary disabled:opacity-50">
          {busy ? "Salvando…" : "Salvar veículos e preços"}
        </button>
        {msg ? <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</span> : null}
      </div>
    </section>
  );
}
