"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { BackButton } from "@/components/back-button";
import { DateInput } from "@/components/date-input";
import { normalizeDateFieldForStorage } from "@/lib/dates/br-date";
import {
  CNH_CATEGORY_OPTIONS,
  OPERATIONAL_CATEGORY_OPTIONS,
  OPERATIONAL_STATUS_OPTIONS,
  SERVICE_REGION_OPTIONS,
  activeFlagsFromOperationalStatus,
  cnhCategoriesFromRow,
  isCnhExpiringWithinDays,
  operationalCategoriesFromRow,
  operationalStatusFromRow,
  serviceRegionsFromRow,
  type CnhCategoryId,
  type OperationalCategoryId,
  type OperationalStatusId,
  type ServiceRegionId
} from "@/lib/drivers/driver-ficha-options";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type LinkedVehicle = {
  link_id: string;
  id: string;
  plate: string;
  model: string;
  brand?: string | null;
  is_default?: boolean;
};

export type DriverDetail = {
  id: string;
  cpf: string;
  profile_id?: string;
  cnh_number?: string | null;
  cnh_category?: string | null;
  cnh_categories?: string[] | null;
  cnh_expiry?: string | null;
  birth_date?: string | null;
  photo_url?: string | null;
  profile_name?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  postal_code?: string | null;
  address_number?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  address?: string | null;
  notes?: string | null;
  active?: boolean;
  available?: boolean;
  operational_status?: string | null;
  operational_category?: string | null;
  operational_categories?: string[] | null;
  service_region?: string | null;
  service_regions?: string[] | null;
  operational_notes?: string | null;
  pix_key?: string | null;
  bank_name?: string | null;
  bank_branch?: string | null;
  bank_account?: string | null;
  bank_account_type?: string | null;
  payee_name?: string | null;
  payee_document?: string | null;
  payout_price_per_km?: number | null;
  payout_percent?: number | null;
  profile_phone?: string | null;
  linked_vehicles: LinkedVehicle[];
};

type VehicleOption = { id: string; plate: string; model: string };

type FormFeedback = {
  kind: "success" | "error" | "info";
  message: string;
  code?: string;
  hint?: string;
};

const inputClass = "rounded border border-slate-300 px-2 py-2 w-full text-sm";

async function parseApiResponse(res: Response) {
  const text = await res.text();
  if (!text.trim()) {
    return {
      success: false as const,
      error: { code: `HTTP_${res.status}`, message: `Resposta vazia (HTTP ${res.status}).` }
    };
  }
  try {
    return JSON.parse(text) as {
      success?: boolean;
      data?: unknown;
      error?: { code?: string; message?: string; hint?: string };
    };
  } catch {
    return {
      success: false as const,
      error: {
        code: `HTTP_${res.status}`,
        message: res.status === 401 ? "Sessão expirada. Inicie sessão novamente." : `Resposta inválida (HTTP ${res.status}).`
      }
    };
  }
}

function FeedbackBanner({ feedback }: { feedback: FormFeedback | null }) {
  if (!feedback) return null;
  return (
    <div
      role="alert"
      className={`mt-3 rounded-lg border px-3 py-3 text-sm ${
        feedback.kind === "error"
          ? "border-red-300 bg-red-50 text-red-950"
          : feedback.kind === "success"
            ? "border-emerald-300 bg-emerald-50 text-emerald-950"
            : "border-amber-300 bg-amber-50 text-amber-950"
      }`}
    >
      {feedback.code ? <p className="mb-1 font-mono text-xs opacity-80">Código: {feedback.code}</p> : null}
      <p className="font-medium">{feedback.message}</p>
      {feedback.hint ? <p className="mt-2 text-xs opacity-90">{feedback.hint}</p> : null}
    </div>
  );
}

export function driverApiRowToDetail(data: DriverDetail): DriverDetail {
  return {
    ...data,
    cnh_categories: cnhCategoriesFromRow(data),
    operational_categories: operationalCategoriesFromRow(data),
    service_regions: serviceRegionsFromRow(data),
    operational_status: operationalStatusFromRow(data)
  };
}

type Props = {
  driverId: string;
  onClose: () => void;
  onSaved: () => void;
};

export function DriverFichaPanel({ driverId, onClose, onSaved }: Props) {
  const fichaRef = useRef<HTMLElement>(null);
  const [detail, setDetail] = useState<DriverDetail | null>(null);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [feedback, setFeedback] = useState<FormFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [cepBusy, setCepBusy] = useState(false);
  const [linkVehicleId, setLinkVehicleId] = useState("");
  const [loading, setLoading] = useState(true);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    const res = await fetchWithSupabaseSession(`/api/drivers/${driverId}`, {}, "admin");
    const json = await parseApiResponse(res);
    if (res.ok && json.success && json.data) {
      setDetail(driverApiRowToDetail(json.data as DriverDetail));
    } else {
      setFeedback({
        kind: "error",
        code: json.error?.code,
        message: json.error?.message ?? "Não foi possível carregar a ficha."
      });
    }
    setLoading(false);
  }, [driverId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    void (async () => {
      const res = await fetchWithSupabaseSession("/api/vehicles", {}, "admin");
      const json = await parseApiResponse(res);
      if (res.ok && json.success) setVehicles((json.data as VehicleOption[]) ?? []);
    })();
  }, []);

  useEffect(() => {
    if (detail && fichaRef.current) {
      fichaRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [detail?.id]);

  function patchDetail<K extends keyof DriverDetail>(key: K, value: DriverDetail[K]) {
    setDetail((d) => (d ? { ...d, [key]: value } : d));
  }

  function toggleCnhCategory(id: CnhCategoryId) {
    if (!detail) return;
    const current = cnhCategoriesFromRow(detail);
    const next = current.includes(id) ? current.filter((c) => c !== id) : [...current, id];
    patchDetail("cnh_categories", next);
    patchDetail("cnh_category", next.join(","));
  }

  function toggleOperationalCategory(id: OperationalCategoryId) {
    if (!detail) return;
    const current = operationalCategoriesFromRow(detail);
    const next = current.includes(id) ? current.filter((c) => c !== id) : [...current, id];
    patchDetail("operational_categories", next);
  }

  function toggleServiceRegion(id: ServiceRegionId) {
    if (!detail) return;
    const current = serviceRegionsFromRow(detail);
    const next = current.includes(id) ? current.filter((c) => c !== id) : [...current, id];
    patchDetail("service_regions", next);
  }

  async function lookupCep() {
    if (!detail) return;
    const digits = detail.postal_code?.replace(/\D/g, "") ?? "";
    if (digits.length !== 8) {
      setFeedback({ kind: "error", message: "Informe um CEP com 8 dígitos." });
      return;
    }
    setCepBusy(true);
    setFeedback(null);
    try {
      const res = await fetchWithSupabaseSession(
        `/api/integrations/viacep-lookup?cep=${encodeURIComponent(digits)}`,
        {},
        "admin"
      );
      const json = await parseApiResponse(res);
      if (!res.ok || !json.success) {
        setFeedback({
          kind: "error",
          message: json.error?.message ?? "CEP não encontrado.",
          hint: json.error?.hint
        });
        return;
      }
      const d = json.data as {
        postal_code?: string;
        address_line?: string;
        district?: string;
        city?: string;
        state?: string;
      };
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              postal_code: d.postal_code ?? digits,
              address: d.address_line || prev.address,
              district: d.district || prev.district,
              city: d.city || prev.city,
              state: d.state || prev.state
            }
          : prev
      );
      setFeedback({ kind: "success", message: "Endereço preenchido pelo CEP. Confira número e complemento." });
    } catch {
      setFeedback({ kind: "error", message: "Falha na consulta CEP. Preencha manualmente." });
    } finally {
      setCepBusy(false);
    }
  }

  async function uploadPhoto(file: File) {
    if (!detail) return;
    setPhotoBusy(true);
    setFeedback(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetchWithSupabaseSession(`/api/drivers/${detail.id}/photo/upload`, {
        method: "POST",
        body: form
      }, "admin");
      const json = await parseApiResponse(res);
      if (!res.ok || !json.success) {
        setFeedback({
          kind: "error",
          code: json.error?.code,
          message: json.error?.message ?? "Falha ao enviar foto.",
          hint: json.error?.hint
        });
        return;
      }
      const data = json.data as { _warning?: string };
      setFeedback({
        kind: data._warning ? "info" : "success",
        message: data._warning ?? "Foto actualizada."
      });
      await loadDetail();
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Erro ao enviar foto."
      });
    } finally {
      setPhotoBusy(false);
    }
  }

  async function saveDetail(e: FormEvent) {
    e.preventDefault();
    if (!detail) return;
    if (!detail.profile_name?.trim()) {
      setFeedback({ kind: "error", message: "Informe o nome completo." });
      return;
    }
    const email = detail.email?.trim() ?? "";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFeedback({ kind: "error", message: "E-mail inválido — corrija ou deixe em branco." });
      return;
    }

    setBusy(true);
    setFeedback(null);
    const phoneValue = (detail.profile_phone ?? detail.phone ?? "").trim() || null;
    const status = operationalStatusFromRow(detail) as OperationalStatusId;
    const trim = (v: string | null | undefined) => {
      const t = v?.trim();
      return t ? t : null;
    };

    const cnhCats = cnhCategoriesFromRow(detail);
    const opCats = operationalCategoriesFromRow(detail);
    const regions = serviceRegionsFromRow(detail);
    const flags = activeFlagsFromOperationalStatus(status);

    const patchBody = {
      full_name: detail.profile_name?.trim(),
      profile_name: detail.profile_name?.trim(),
      profile_phone: phoneValue,
      cpf: detail.cpf?.trim(),
      phone: phoneValue,
      whatsapp: trim(detail.whatsapp),
      email: trim(detail.email),
      birth_date: normalizeDateFieldForStorage(detail.birth_date),
      cnh_number: trim(detail.cnh_number),
      cnh_category: cnhCats.length ? cnhCats.join(",") : null,
      cnh_categories: cnhCats,
      cnh_expiry: normalizeDateFieldForStorage(detail.cnh_expiry),
      postal_code: trim(detail.postal_code),
      address: trim(detail.address),
      address_number: trim(detail.address_number),
      district: trim(detail.district),
      city: trim(detail.city),
      state: trim(detail.state)?.toUpperCase() ?? null,
      operational_category: opCats[0] ?? null,
      operational_categories: opCats,
      service_regions: regions,
      operational_notes: trim(detail.operational_notes),
      active: flags.active,
      available: flags.available,
      pix_key: trim(detail.pix_key),
      bank_name: trim(detail.bank_name),
      bank_branch: trim(detail.bank_branch),
      bank_account: trim(detail.bank_account),
      bank_account_type: trim(detail.bank_account_type),
      payee_name: trim(detail.payee_name),
      payee_document: trim(detail.payee_document),
      payout_price_per_km: detail.payout_price_per_km ?? null,
      payout_percent: detail.payout_percent ?? null,
      notes: trim(detail.notes)
    };

    try {
      const url = `/api/drivers/${detail.id}`;
      console.info("[DriverFicha] PATCH request", { url, driverId: detail.id, body: patchBody });

      const res = await fetchWithSupabaseSession(
        url,
        {
          method: "PATCH",
          body: JSON.stringify(patchBody)
        },
        "admin"
      );
      const responseText = await res.clone().text();
      let json: Awaited<ReturnType<typeof parseApiResponse>>;
      try {
        json = JSON.parse(responseText) as Awaited<ReturnType<typeof parseApiResponse>>;
      } catch {
        json = {
          success: false as const,
          error: {
            code: `HTTP_${res.status}`,
            message: responseText || `Resposta inválida (HTTP ${res.status}).`
          }
        };
      }

      console.info("[DriverFicha] PATCH response", {
        status: res.status,
        ok: res.ok,
        body: json
      });

      if (!res.ok || !json.success) {
        console.error("[DriverFicha] PATCH failed", json.error);
        setFeedback({
          kind: "error",
          code: json.error?.code,
          message: json.error?.message ?? "Falha ao guardar ficha.",
          hint: json.error?.hint
        });
        return;
      }
      setFeedback({
        kind: "success",
        message: "Ficha do motorista guardada com sucesso."
      });
      await loadDetail();
      onSaved();
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Erro inesperado ao guardar."
      });
    } finally {
      setBusy(false);
    }
  }

  async function linkExistingVehicle() {
    if (!detail || !linkVehicleId) return;
    setBusy(true);
    try {
      const res = await fetchWithSupabaseSession(
        `/api/drivers/${detail.id}/vehicles`,
        {
          method: "POST",
          body: JSON.stringify({
            vehicle_id: linkVehicleId,
            set_default: detail.linked_vehicles.length === 0
          })
        },
        "admin"
      );
      const json = await parseApiResponse(res);
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Falha ao vincular");
      setLinkVehicleId("");
      await loadDetail();
      onSaved();
      setFeedback({ kind: "success", message: "Veículo vinculado." });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Erro inesperado." });
    } finally {
      setBusy(false);
    }
  }

  async function setDefaultVehicle(vehicleId: string) {
    if (!detail) return;
    setBusy(true);
    try {
      const res = await fetchWithSupabaseSession(
        `/api/drivers/${detail.id}/vehicles`,
        {
          method: "PATCH",
          body: JSON.stringify({ vehicle_id: vehicleId, action: "set_default" })
        },
        "admin"
      );
      const json = await parseApiResponse(res);
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Falha");
      await loadDetail();
      onSaved();
      setFeedback({ kind: "success", message: "Veículo padrão actualizado." });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Erro inesperado." });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="card mt-6" aria-busy="true">
        <p className="text-sm text-slate-500">A carregar ficha do motorista…</p>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="card mt-6">
        <FeedbackBanner feedback={feedback} />
        <button type="button" className="mt-3 text-sm text-amber-800" onClick={onClose}>
          Voltar à lista
        </button>
      </section>
    );
  }

  const cnhCats = cnhCategoriesFromRow(detail);
  const opCats = operationalCategoriesFromRow(detail);
  const regions = serviceRegionsFromRow(detail);
  const opStatus = operationalStatusFromRow(detail);
  const cnhAlert = isCnhExpiringWithinDays(detail.cnh_expiry);

  return (
    <section ref={fichaRef} className="card mt-6">
      <div className="mb-4">
        <BackButton fallbackHref="/drivers" onClick={onClose} />
      </div>
      <h2 className="text-lg font-semibold text-slate-900">Ficha: {detail.profile_name ?? detail.cpf}</h2>
      <FeedbackBanner feedback={feedback} />

      <form className="mt-4 space-y-6" noValidate onSubmit={(e) => void saveDetail(e)}>
        <fieldset className="grid gap-3 md:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-slate-800 md:col-span-2">Foto</legend>
          <div className="flex flex-wrap items-center gap-4 md:col-span-2">
            {detail.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={detail.photo_url}
                alt={`Foto de ${detail.profile_name ?? "motorista"}`}
                className="h-24 w-24 rounded-full border border-slate-200 object-cover"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500">
                Sem foto
              </div>
            )}
            <label className="grid gap-1 text-sm">
              <span>Enviar foto (JPEG, PNG ou WebP — máx. 5 MB)</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={photoBusy || busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadPhoto(file);
                  e.target.value = "";
                }}
                className="text-sm"
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="grid gap-3 md:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-slate-800 md:col-span-2">Dados pessoais</legend>
          <label className="grid gap-1 text-sm md:col-span-2">
            <span>Nome completo</span>
            <input
              required
              className={inputClass}
              value={detail.profile_name ?? ""}
              onChange={(e) => patchDetail("profile_name", e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>CPF</span>
            <input className={inputClass} value={detail.cpf} onChange={(e) => patchDetail("cpf", e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Data de nascimento</span>
            <DateInput
              className={inputClass}
              value={detail.birth_date}
              onChange={(iso) => patchDetail("birth_date", iso)}
            />
          </label>
        </fieldset>

        <fieldset className="grid gap-3 md:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-slate-800 md:col-span-2">CNH</legend>
          <label className="grid gap-1 text-sm">
            <span>Número da CNH</span>
            <input
              className={inputClass}
              value={detail.cnh_number ?? ""}
              onChange={(e) => patchDetail("cnh_number", e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Vencimento da CNH</span>
            <DateInput
              className={`${inputClass} ${cnhAlert ? "border-red-500 bg-red-50" : ""}`}
              aria-invalid={cnhAlert}
              value={detail.cnh_expiry}
              onChange={(iso) => patchDetail("cnh_expiry", iso)}
            />
            {cnhAlert ? (
              <p className="text-xs font-medium text-red-700" role="alert">
                CNH vence em menos de 30 dias — actualize ou renove.
              </p>
            ) : null}
          </label>
          <div className="md:col-span-2">
            <p className="mb-2 text-sm font-medium text-slate-800">Categoria (pode seleccionar várias)</p>
            <div className="flex flex-wrap gap-4">
              {CNH_CATEGORY_OPTIONS.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={cnhCats.includes(c)} onChange={() => toggleCnhCategory(c)} />
                  <span>{c}</span>
                </label>
              ))}
            </div>
          </div>
        </fieldset>

        <fieldset className="grid gap-3 md:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-slate-800 md:col-span-2">Contato</legend>
          <label className="grid gap-1 text-sm">
            <span>Telefone</span>
            <input
              className={inputClass}
              value={detail.profile_phone ?? detail.phone ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                patchDetail("profile_phone", v);
                patchDetail("phone", v);
              }}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>WhatsApp</span>
            <input
              className={inputClass}
              value={detail.whatsapp ?? ""}
              onChange={(e) => patchDetail("whatsapp", e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm md:col-span-2">
            <span>E-mail</span>
            <input
              type="text"
              inputMode="email"
              className={inputClass}
              value={detail.email ?? ""}
              onChange={(e) => patchDetail("email", e.target.value)}
            />
          </label>
        </fieldset>

        <fieldset className="grid gap-3 md:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-slate-800 md:col-span-2">Endereço</legend>
          <label className="grid gap-1 text-sm">
            <span>CEP</span>
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={detail.postal_code ?? ""}
                onChange={(e) => patchDetail("postal_code", e.target.value)}
                placeholder="00000-000"
              />
              <button
                type="button"
                disabled={cepBusy || busy}
                onClick={() => void lookupCep()}
                className="shrink-0 rounded-lg border border-amber-700 px-3 py-2 text-sm text-amber-900 hover:bg-amber-50 disabled:opacity-50"
              >
                {cepBusy ? "…" : "Buscar CEP"}
              </button>
            </div>
          </label>
          <label className="grid gap-1 text-sm">
            <span>Número</span>
            <input
              className={inputClass}
              value={detail.address_number ?? ""}
              onChange={(e) => patchDetail("address_number", e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm md:col-span-2">
            <span>Rua</span>
            <input className={inputClass} value={detail.address ?? ""} onChange={(e) => patchDetail("address", e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Bairro</span>
            <input
              className={inputClass}
              value={detail.district ?? ""}
              onChange={(e) => patchDetail("district", e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Cidade</span>
            <input className={inputClass} value={detail.city ?? ""} onChange={(e) => patchDetail("city", e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>UF</span>
            <input
              className={inputClass}
              maxLength={2}
              value={detail.state ?? ""}
              onChange={(e) => patchDetail("state", e.target.value.toUpperCase())}
            />
          </label>
        </fieldset>

        <fieldset className="grid gap-3 md:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-slate-800 md:col-span-2">Operacional</legend>
          <label className="grid gap-1 text-sm md:col-span-2">
            <span>Status</span>
            <select
              className={inputClass}
              value={opStatus}
              onChange={(e) => {
                const status = e.target.value as OperationalStatusId;
                patchDetail("operational_status", status);
                const flags = activeFlagsFromOperationalStatus(status);
                patchDetail("active", flags.active);
                patchDetail("available", flags.available);
              }}
            >
              {OPERATIONAL_STATUS_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <div className="md:col-span-2">
            <p className="mb-2 text-sm font-medium text-slate-800">Categoria operacional</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {OPERATIONAL_CATEGORY_OPTIONS.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={opCats.includes(o.id)} onChange={() => toggleOperationalCategory(o.id)} />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="md:col-span-2">
            <p className="mb-2 text-sm font-medium text-slate-800">Região de atuação</p>
            <div className="flex flex-wrap gap-4">
              {SERVICE_REGION_OPTIONS.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={regions.includes(o.id)} onChange={() => toggleServiceRegion(o.id)} />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
          </div>
          <label className="grid gap-1 text-sm md:col-span-2">
            <span>Observação operacional</span>
            <textarea
              className={inputClass}
              rows={2}
              value={detail.operational_notes ?? ""}
              onChange={(e) => patchDetail("operational_notes", e.target.value)}
            />
          </label>
        </fieldset>

        <fieldset className="grid gap-3 md:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-slate-800 md:col-span-2">Financeiro</legend>
          <label className="grid gap-1 text-sm">
            <span>Banco</span>
            <input
              className={inputClass}
              value={detail.bank_name ?? ""}
              onChange={(e) => patchDetail("bank_name", e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Agência</span>
            <input
              className={inputClass}
              value={detail.bank_branch ?? ""}
              onChange={(e) => patchDetail("bank_branch", e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Conta</span>
            <input
              className={inputClass}
              value={detail.bank_account ?? ""}
              onChange={(e) => patchDetail("bank_account", e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Tipo de conta</span>
            <select
              className={inputClass}
              value={detail.bank_account_type ?? ""}
              onChange={(e) => patchDetail("bank_account_type", e.target.value)}
            >
              <option value="">—</option>
              <option value="corrente">Corrente</option>
              <option value="poupanca">Poupança</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm md:col-span-2">
            <span>Pix</span>
            <input className={inputClass} value={detail.pix_key ?? ""} onChange={(e) => patchDetail("pix_key", e.target.value)} />
          </label>
        </fieldset>

        <fieldset className="grid gap-3 md:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-slate-800 md:col-span-2">Repasse financeiro</legend>
          <p className="text-xs text-slate-600 md:col-span-2">
            Usado pelo motor de precificação no repasse ao motorista. Se informar valor por km, ele tem prioridade sobre o
            percentual.
          </p>
          <label className="grid gap-1 text-sm">
            <span>Valor por km repassado ao motorista (R$)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputClass}
              value={detail.payout_price_per_km ?? ""}
              onChange={(e) =>
                patchDetail("payout_price_per_km", e.target.value === "" ? null : Number(e.target.value))
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Percentual de repasse por corrida (%)</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              className={inputClass}
              value={detail.payout_percent ?? ""}
              onChange={(e) =>
                patchDetail("payout_percent", e.target.value === "" ? null : Number(e.target.value))
              }
            />
          </label>
        </fieldset>

        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "A guardar…" : "Salvar ficha"}
        </button>
      </form>

      <div className="mt-8 border-t border-slate-200 pt-6">
        <h3 className="font-semibold text-slate-900">Veículos vinculados</h3>
        {detail.linked_vehicles.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nenhum veículo vinculado. Use a frota cadastrada em Veículos.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {detail.linked_vehicles.map((v) => (
              <li
                key={v.link_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 px-3 py-2"
              >
                <span>
                  {v.plate} · {v.model}
                  {v.brand ? ` · ${v.brand}` : ""}
                  {v.is_default ? (
                    <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">padrão</span>
                  ) : null}
                </span>
                {!v.is_default ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="text-xs text-amber-800"
                    onClick={() => void setDefaultVehicle(v.id)}
                  >
                    Marcar como padrão
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid min-w-[12rem] flex-1 gap-1 text-sm">
            <span>Vincular veículo</span>
            <select className={inputClass} value={linkVehicleId} onChange={(e) => setLinkVehicleId(e.target.value)}>
              <option value="">— seleccionar da frota —</option>
              {vehicles
                .filter((v) => !detail.linked_vehicles.some((lv) => lv.id === v.id))
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate} · {v.model}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !linkVehicleId}
            onClick={() => void linkExistingVehicle()}
            className="rounded-lg border border-amber-700 px-4 py-2 text-sm text-amber-900 disabled:opacity-50"
          >
            Vincular veículo
          </button>
        </div>
      </div>
    </section>
  );
}
