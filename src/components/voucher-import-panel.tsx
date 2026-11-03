"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { pdfToWords } from "@/lib/vouchers/pdf-words-client";
import type { VoucherLeg } from "@/lib/vouchers/voucher-legs";
import { TypedDateTime } from "@/components/typed-date-time";
import { AddressAutocompleteInput } from "@/components/address-autocomplete-input";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import { saoPauloDateAndTimeToUtcIso, saoPauloTodayYmd } from "@/lib/dates/br-date";
import { normalizeFlightNumber } from "@/lib/trips/flight";
import { legacyServiceType, type CategoryKind } from "@/lib/pricing/category-catalog";

type Cat = { id: string; name: string; kind: CategoryKind };
type Client = { id: string; name: string; trade_name?: string | null };
type Parsed = {
  voucher: { number: string; event: string; requestedBy: string | null; issuer: string; cnpj: string | null };
  client: { id: string; name: string } | null;
  legs: VoucherLeg[];
  existingRefs: string[];
};

const input = PRIME_INPUT_CLASS;
const num = (s: string) => {
  const v = Number(String(s).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(v) ? v : NaN;
};

/** Importar voucher em PDF: lê, mostra as corridas para conferir e cria tudo de uma vez. */
export function VoucherImportPanel() {
  const today = saoPauloTodayYmd();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [legs, setLegs] = useState<VoucherLeg[]>([]);
  const [clientId, setClientId] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [created, setCreated] = useState<{ ref: string; id: string }[]>([]);

  useEffect(() => {
    if (!open || clients.length) return;
    void (async () => {
      const [c, v] = await Promise.all([
        fetchWithSupabaseSession("/api/clients", {}, "admin").then((r) => r.json()).catch(() => ({})),
        fetchWithSupabaseSession("/api/vehicle-categories", {}, "admin").then((r) => r.json()).catch(() => ({}))
      ]);
      setClients(((c as { data?: Client[] }).data ?? []).slice().sort((a, b) => (a.trade_name || a.name).localeCompare(b.trade_name || b.name)));
      setCats(((v as { data?: (Cat & { active?: boolean })[] }).data ?? []).filter((x) => x.active !== false));
    })();
  }, [open, clients.length]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setParsed(null);
    setCreated([]);
    setBusy("Lendo o voucher…");
    try {
      const words = await pdfToWords(file);
      if (!words.length) {
        setError("Este PDF não tem texto (parece uma foto escaneada). Ainda não consigo ler esse tipo.");
        return;
      }
      const res = await fetchWithSupabaseSession("/api/vouchers/parse", { method: "POST", body: JSON.stringify({ words }) }, "admin");
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Parsed; error?: { message?: string } };
      if (!res.ok || !json.success || !json.data) {
        setError(json.error?.message ?? "Não consegui ler este voucher.");
        return;
      }
      setParsed(json.data);
      setClientId(json.data.client?.id ?? "");
      const base = json.data.legs.map((l) => ({ ...l, include: !json.data!.existingRefs.includes(l.ref) }));
      setLegs(base);
      setBusy("Localizando os endereços no mapa…");
      setLegs(await locateAll(base));
    } catch {
      setError("Não consegui abrir o PDF. Confira a internet e tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  /** Acha cada endereço do voucher no mapa (primeira sugestão do Google), para ter localização e distância. */
  async function locate(text: string): Promise<{ lat: number; lng: number } | null> {
    const q = text.trim();
    if (q.length < 5) return null;
    try {
      const r = await fetchWithSupabaseSession(`/api/integrations/address-search?q=${encodeURIComponent(q.slice(0, 180))}`, {}, "admin");
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: { place_id?: string; lat?: number | null; lng?: number | null }[] };
      const hit = j.success ? j.data?.[0] : undefined;
      if (!hit) return null;
      if (hit.lat != null && hit.lng != null) return { lat: Number(hit.lat), lng: Number(hit.lng) };
      if (!hit.place_id) return null;
      const d = await fetchWithSupabaseSession(`/api/integrations/address-details?place_id=${encodeURIComponent(String(hit.place_id))}`, {}, "admin");
      const dj = (await d.json().catch(() => ({}))) as { success?: boolean; data?: { lat: number; lng: number } };
      return dj.success && dj.data ? { lat: dj.data.lat, lng: dj.data.lng } : null;
    } catch {
      return null;
    }
  }

  async function locateAll(list: VoucherLeg[]): Promise<VoucherLeg[]> {
    const cache = new Map<string, Promise<{ lat: number; lng: number } | null>>();
    const get = (t: string) => {
      if (!cache.has(t)) cache.set(t, locate(t));
      return cache.get(t)!;
    };
    return Promise.all(
      list.map(async (l) => {
        const [o, d] = await Promise.all([get(l.origin), get(l.destination)]);
        return { ...l, originLat: o?.lat ?? null, originLng: o?.lng ?? null, destLat: d?.lat ?? null, destLng: d?.lng ?? null };
      })
    );
  }

  const patch = (key: string, p: Partial<VoucherLeg>) => setLegs((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const chosen = legs.filter((l) => l.include);
  const problems = (l: VoucherLeg): string[] => {
    const m: string[] = [];
    if (!l.date || !l.time) m.push("data e hora");
    if (l.origin.trim().length < 3) m.push("embarque");
    if (l.destination.trim().length < 3) m.push("destino");
    if (!l.categoryId) m.push("veículo");
    if (l.clientAmount.trim() && Number.isNaN(num(l.clientAmount))) m.push("valor do cliente");
    if (l.driverAmount.trim() && Number.isNaN(num(l.driverAmount))) m.push("valor do motorista");
    return m;
  };
  const blocked = !clientId || chosen.length === 0 || chosen.some((l) => problems(l).length > 0);

  async function createAll() {
    if (blocked) return;
    setError(null);
    const done: { ref: string; id: string }[] = [];
    const fails: string[] = [];
    for (const [i, l] of chosen.entries()) {
      setBusy(`Criando ${i + 1} de ${chosen.length}…`);
      const cat = cats.find((c) => c.id === l.categoryId);
      const iso = saoPauloDateAndTimeToUtcIso(l.date, l.time);
      if (!cat || !iso) {
        fails.push(`${l.ref} (dados incompletos)`);
        continue;
      }
      const body = {
        client_id: clientId,
        service_type: legacyServiceType(cat.kind, "transfer"),
        vehicle_category_id: cat.id,
        service_mode: "transfer",
        scheduled_at: iso,
        origin_text: l.origin.trim(),
        origin_lat: l.originLat ?? undefined,
        origin_lng: l.originLng ?? undefined,
        destination_text: l.destination.trim(),
        destination_lat: l.destLat ?? undefined,
        destination_lng: l.destLng ?? undefined,
        passenger_name: l.passengerName.trim() || undefined,
        passenger_phone: l.passengerPhone.trim() || undefined,
        passenger_count: l.passengerCount,
        flight_number: normalizeFlightNumber(l.flight) ?? undefined,
        notes: [`O.S./Ref.: ${l.ref}`, l.notes.trim()].filter(Boolean).join("\n"),
        client_amount: l.clientAmount.trim() ? num(l.clientAmount) : undefined,
        driver_amount: l.driverAmount.trim() ? num(l.driverAmount) : undefined,
        dispatch_mode: "directed" as const,
        presentation_minutes: 15
      };
      const res = await fetchWithSupabaseSession("/api/trips", { method: "POST", body: JSON.stringify(body) }, "admin");
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { id: string }; error?: { message?: string } };
      if (res.ok && json.success && json.data?.id) done.push({ ref: l.ref, id: json.data.id });
      else fails.push(`${l.ref}: ${json.error?.message ?? "erro"}`);
    }
    setBusy(null);
    setCreated(done);
    if (fails.length) setError(`Não criei: ${fails.join("; ")}`);
    if (done.length) setLegs((ls) => ls.map((l) => (done.some((d) => d.ref === l.ref) ? { ...l, include: false } : l)));
  }

  return (
    <div className="rounded-2xl border border-prime-border bg-white shadow-prime-card">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span>
          <span className="block font-semibold">📄 Importar voucher (PDF)</span>
          <span className="block text-xs text-prime-muted">Envie o voucher da agência: o sistema lê as corridas, você confere e cria todas de uma vez.</span>
        </span>
        <span className="text-sm text-prime-gold">{open ? "Fechar" : "Abrir"}</span>
      </button>

      {open ? (
        <div className="space-y-4 border-t border-prime-border p-4">
          <label className="inline-flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-prime-gold/60 bg-[#FBF7EC] px-5 py-4">
            <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
            <span className="text-2xl">⬆️</span>
            <span>
              <span className="block font-semibold">Escolher o PDF do voucher</span>
              <span className="block text-xs text-prime-muted">Hoje lê os vouchers da CEP Transportes</span>
            </span>
          </label>

          {busy ? <p className="text-sm text-prime-muted">{busy}</p> : null}
          {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

          {created.length ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <p className="font-semibold">{created.length} corrida(s) criada(s) na agenda:</p>
              <ul className="mt-1 flex flex-wrap gap-2">
                {created.map((c) => (
                  <li key={c.id}>
                    <Link href={`/agenda?trip=${c.id}#trip-detail` as Route} className="underline">
                      {c.ref}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {parsed ? (
            <>
              <div className="grid gap-3 rounded-xl bg-prime-bg p-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs text-prime-muted">Voucher</p>
                  <p className="font-semibold">
                    {parsed.voucher.issuer} · {parsed.voucher.number}
                  </p>
                  {parsed.voucher.event ? <p className="text-xs text-prime-muted">{parsed.voucher.event}</p> : null}
                  {parsed.voucher.requestedBy ? <p className="text-xs text-prime-muted">Solicitado por {parsed.voucher.requestedBy}</p> : null}
                </div>
                <label className="grid gap-1">
                  <span className="text-xs text-prime-muted">Cliente que será cobrado *</span>
                  <select className={input} value={clientId} onChange={(e) => setClientId(e.target.value)}>
                    <option value="">Escolha o cliente</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.trade_name || c.name}
                      </option>
                    ))}
                  </select>
                  {!parsed.client ? (
                    <span className="text-xs text-amber-700">
                      Não achei o cliente pelo CNPJ {parsed.voucher.cnpj ?? ""}. Escolha na lista (ou cadastre o CNPJ no cliente para vir automático).
                    </span>
                  ) : (
                    <span className="text-xs text-emerald-700">Cliente reconhecido pelo CNPJ.</span>
                  )}
                </label>
              </div>

              {parsed.existingRefs.length ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Já existem na agenda: {parsed.existingRefs.join(", ")}. Deixei desmarcado para não duplicar.
                </p>
              ) : null}

              <ul className="space-y-3">
                {legs.map((l) => {
                  const miss = problems(l);
                  return (
                    <li key={l.key} className={`rounded-2xl border p-4 ${l.include ? "border-prime-gold bg-white" : "border-prime-border bg-prime-bg opacity-70"}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <label className="flex items-center gap-2 font-semibold">
                          <input type="checkbox" checked={l.include} onChange={(e) => patch(l.key, { include: e.target.checked })} />
                          {l.ref}
                        </label>
                        <span className="text-xs text-prime-muted">{l.label}</span>
                      </div>
                      {l.include ? (
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <TypedDateTime date={l.date} time={l.time} today={today} onDate={(d) => patch(l.key, { date: d })} onTime={(t) => patch(l.key, { time: t })} />
                          <label className="grid gap-1 text-sm">
                            <span>Veículo {l.vehicleType ? <span className="text-xs text-prime-muted">(no voucher: {l.vehicleType})</span> : null}</span>
                            <select className={input} value={l.categoryId} onChange={(e) => patch(l.key, { categoryId: e.target.value })}>
                              <option value="">Escolha</option>
                              {cats.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="md:col-span-2">
                            <AddressAutocompleteInput
                              label="Embarque"
                              value={l.origin}
                              hasCoords={l.originLat != null}
                              onChange={(t) => patch(l.key, { origin: t, originLat: null, originLng: null })}
                              onPlaceSelect={(p) => patch(l.key, { origin: p.displayName, originLat: p.lat, originLng: p.lng })}
                              onCoordsClear={() => patch(l.key, { originLat: null, originLng: null })}
                              devFallbackRole="admin"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <AddressAutocompleteInput
                              label="Destino"
                              value={l.destination}
                              placeholder="Digite e escolha na lista"
                              hasCoords={l.destLat != null}
                              onChange={(t) => patch(l.key, { destination: t, destLat: null, destLng: null })}
                              onPlaceSelect={(p) => patch(l.key, { destination: p.displayName, destLat: p.lat, destLng: p.lng })}
                              onCoordsClear={() => patch(l.key, { destLat: null, destLng: null })}
                              devFallbackRole="admin"
                            />
                          </div>
                          <label className="grid gap-1 text-sm">
                            <span>Passageiro</span>
                            <input className={input} value={l.passengerName} onChange={(e) => patch(l.key, { passengerName: e.target.value })} />
                          </label>
                          <div className="grid grid-cols-2 gap-3">
                            <label className="grid gap-1 text-sm">
                              <span>Telefone</span>
                              <input className={input} value={l.passengerPhone} onChange={(e) => patch(l.key, { passengerPhone: e.target.value })} />
                            </label>
                            <label className="grid gap-1 text-sm">
                              <span>Voo</span>
                              <input className={input} value={l.flight} onChange={(e) => patch(l.key, { flight: e.target.value })} />
                            </label>
                          </div>
                          <div className="grid grid-cols-2 gap-3 rounded-xl border-2 border-prime-gold/50 bg-[#FBF7EC] p-3 md:col-span-2">
                            <label className="grid gap-1 text-sm">
                              <span className="font-medium">Cliente paga (R$)</span>
                              <input className={`${input} text-lg font-semibold`} inputMode="decimal" value={l.clientAmount} onChange={(e) => patch(l.key, { clientAmount: e.target.value })} />
                            </label>
                            <label className="grid gap-1 text-sm">
                              <span className="font-medium">Motorista recebe (R$)</span>
                              <input
                                className={`${input} text-lg font-semibold`}
                                inputMode="decimal"
                                placeholder="Digite"
                                value={l.driverAmount}
                                onChange={(e) => patch(l.key, { driverAmount: e.target.value })}
                              />
                            </label>
                          </div>
                          <label className="grid gap-1 text-sm md:col-span-2">
                            <span>Observações para o motorista</span>
                            <textarea className={input} rows={3} value={l.notes} onChange={(e) => patch(l.key, { notes: e.target.value })} />
                          </label>
                          {miss.length ? <p className="text-sm text-amber-800 md:col-span-2">Falta: {miss.join(", ")}</p> : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>

              <div className="flex flex-wrap items-center gap-3 border-t border-prime-border pt-4">
                <button type="button" disabled={blocked || Boolean(busy)} onClick={() => void createAll()} className="btn-primary disabled:opacity-40">
                  {busy ?? `Criar ${chosen.length} corrida(s) na agenda`}
                </button>
                {!clientId ? <span className="text-sm text-amber-800">Escolha o cliente.</span> : null}
                <span className="text-xs text-prime-muted">O motorista você escolhe depois, em cada corrida.</span>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
