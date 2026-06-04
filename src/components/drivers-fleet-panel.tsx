"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BackButton } from "@/components/back-button";

type LinkedVehicle = {
  link_id: string;
  id: string;
  plate: string;
  model: string;
  brand?: string | null;
  is_default?: boolean;
};

type DriverRow = {
  id: string;
  cpf: string;
  cnh_number?: string | null;
  profile_name?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  active?: boolean;
  available?: boolean;
  default_vehicle?: { id: string; model: string; plate: string } | null;
  linked_vehicles?: LinkedVehicle[];
};

type VehicleOption = { id: string; plate: string; model: string };
type ProfileOption = { id: string; name: string; role: string; active?: boolean };

type DriverDetail = DriverRow & {
  cnh_category?: string | null;
  cnh_expiry?: string | null;
  photo_url?: string | null;
  city?: string | null;
  district?: string | null;
  address?: string | null;
  notes?: string | null;
  operational_category?: string | null;
  service_region?: string | null;
  operational_notes?: string | null;
  pix_key?: string | null;
  bank_name?: string | null;
  bank_branch?: string | null;
  bank_account?: string | null;
  bank_account_type?: string | null;
  payee_name?: string | null;
  payee_document?: string | null;
  profile_phone?: string | null;
  linked_vehicles: LinkedVehicle[];
};

const inputClass = "rounded border border-slate-300 px-2 py-2 w-full text-sm";

type Props = {
  initialDrivers: DriverRow[];
};

const CATEGORY_OPTIONS = ["sedan", "SUV", "van", "executivo", "evento", "viagem", "bilíngue", "outro"];
const CNH_CATEGORY_OPTIONS = ["A", "B", "AB", "C", "D", "E", "ACC"];

type FormFeedback = {
  kind: "success" | "error" | "info";
  message: string;
  code?: string;
  hint?: string;
};

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

export function DriversFleetPanel({ initialDrivers }: Props) {
  const router = useRouter();
  const [drivers, setDrivers] = useState(initialDrivers);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DriverDetail | null>(null);
  const [feedback, setFeedback] = useState<FormFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const [createProfileId, setCreateProfileId] = useState("");
  const [createCpf, setCreateCpf] = useState("");
  const [createCnh, setCreateCnh] = useState("");
  const [creating, setCreating] = useState(false);

  const [linkVehicleId, setLinkVehicleId] = useState("");
  const [newVehicle, setNewVehicle] = useState({
    plate: "",
    model: "",
    brand: "",
    category: "",
    color: "",
    capacity: ""
  });

  const reloadDrivers = useCallback(async () => {
    const qs = includeInactive ? "?include_inactive=1" : "";
    const res = await fetch(`/api/drivers${qs}`, { credentials: "include" });
    const json = await parseApiResponse(res);
    if (res.ok && json.success) {
      setDrivers((json.data as DriverRow[]) ?? []);
    }
    router.refresh();
  }, [router, includeInactive]);

  const loadDetail = useCallback(async (driverId: string) => {
    const res = await fetch(`/api/drivers/${driverId}`, { credentials: "include" });
    const json = (await res.json()) as { success?: boolean; data?: DriverDetail };
    if (res.ok && json.success && json.data) {
      setDetail(json.data);
      setSelectedId(driverId);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const [vRes, pRes] = await Promise.all([
        fetch("/api/vehicles", { credentials: "include" }),
        fetch("/api/profiles", { credentials: "include" })
      ]);
      const vJson = (await vRes.json()) as { success?: boolean; data?: VehicleOption[] };
      const pJson = (await pRes.json()) as { success?: boolean; data?: ProfileOption[] };
      if (vRes.ok && vJson.success) setVehicles(vJson.data ?? []);
      if (pRes.ok && pJson.success) {
        const motoristas = (pJson.data ?? []).filter((p) => p.role === "motorista" && p.active !== false);
        setProfiles(motoristas);
        if (motoristas[0]) setCreateProfileId(motoristas[0].id);
      }
    })();
  }, []);

  useEffect(() => {
    void reloadDrivers();
  }, [reloadDrivers]);

  async function createDriver(e: FormEvent) {
    e.preventDefault();
    if (!createProfileId || !createCpf.trim()) return;
    setCreating(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          profile_id: createProfileId,
          cpf: createCpf.trim(),
          cnh_number: createCnh.trim() || undefined
        })
      });
      const json = await parseApiResponse(res);
      if (!res.ok || json.success !== true) {
        setFeedback({
          kind: "error",
          code: json.error?.code,
          message: json.error?.message ?? "Falha ao criar motorista.",
          hint: json.error?.hint
        });
        return;
      }
      setFeedback({ kind: "success", message: "Motorista registado. Complete a ficha abaixo." });
      setCreateCpf("");
      setCreateCnh("");
      await reloadDrivers();
      const created = json.data as DriverRow | undefined;
      if (created?.id) await loadDetail(created.id);
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Erro inesperado ao criar motorista."
      });
    } finally {
      setCreating(false);
    }
  }

  async function uploadPhoto(file: File) {
    if (!detail) return;
    setPhotoBusy(true);
    setFeedback(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/drivers/${detail.id}/photo/upload`, {
        method: "POST",
        credentials: "include",
        body: form
      });
      const json = await parseApiResponse(res);
      if (!res.ok || json.success !== true) {
        setFeedback({
          kind: "error",
          code: json.error?.code,
          message: json.error?.message ?? "Falha ao enviar foto.",
          hint: json.error?.hint
        });
        return;
      }
      const data = json.data as { photo_url?: string; _warning?: string };
      setFeedback({
        kind: data._warning ? "info" : "success",
        message: data._warning ?? "Foto actualizada."
      });
      await loadDetail(detail.id);
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
    setBusy(true);
    setFeedback(null);
    const phoneValue = (detail.profile_phone ?? detail.phone ?? "").trim() || null;
    try {
      const res = await fetch(`/api/drivers/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          cpf: detail.cpf,
          cnh_number: detail.cnh_number,
          cnh_category: detail.cnh_category,
          cnh_expiry: detail.cnh_expiry || null,
          phone: phoneValue,
          whatsapp: detail.whatsapp,
          email: detail.email,
          city: detail.city,
          district: detail.district,
          address: detail.address,
          notes: detail.notes,
          active: detail.active,
          available: detail.available,
          operational_category: detail.operational_category,
          service_region: detail.service_region,
          operational_notes: detail.operational_notes,
          pix_key: detail.pix_key,
          bank_name: detail.bank_name,
          bank_branch: detail.bank_branch,
          bank_account: detail.bank_account,
          bank_account_type: detail.bank_account_type,
          payee_name: detail.payee_name,
          payee_document: detail.payee_document,
          profile_name: detail.profile_name,
          profile_phone: phoneValue
        })
      });
      const json = await parseApiResponse(res);
      if (!res.ok || json.success !== true) {
        setFeedback({
          kind: "error",
          code: json.error?.code ?? `HTTP_${res.status}`,
          message: json.error?.message ?? "Falha ao guardar ficha.",
          hint: json.error?.hint
        });
        return;
      }
      const saved = json.data as { _warning?: string } | undefined;
      setFeedback({
        kind: saved?._warning ? "info" : "success",
        message: saved?._warning ?? "Ficha do motorista guardada com sucesso."
      });
      await reloadDrivers();
      await loadDetail(detail.id);
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
      const res = await fetch(`/api/drivers/${detail.id}/vehicles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ vehicle_id: linkVehicleId, set_default: detail.linked_vehicles.length === 0 })
      });
      const json = await parseApiResponse(res);
      if (!res.ok || json.success !== true) {
        throw new Error(json.error?.message ?? "Falha ao vincular");
      }
      setLinkVehicleId("");
      await loadDetail(detail.id);
      await reloadDrivers();
      setFeedback({ kind: "success", message: "Veículo vinculado." });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Erro inesperado." });
    } finally {
      setBusy(false);
    }
  }

  async function createAndLinkVehicle(e: FormEvent) {
    e.preventDefault();
    if (!detail) return;
    setBusy(true);
    try {
      const cap = newVehicle.capacity.trim();
      const res = await fetch(`/api/drivers/${detail.id}/vehicles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          plate: newVehicle.plate.trim(),
          model: newVehicle.model.trim(),
          brand: newVehicle.brand.trim() || null,
          category: newVehicle.category.trim() || null,
          color: newVehicle.color.trim() || null,
          capacity: cap ? Number(cap) : null,
          set_default: true
        })
      });
      const json = await parseApiResponse(res);
      if (!res.ok || json.success !== true) {
        throw new Error(json.error?.message ?? "Falha ao criar veículo");
      }
      setNewVehicle({ plate: "", model: "", brand: "", category: "", color: "", capacity: "" });
      const vRes = await fetch("/api/vehicles", { credentials: "include" });
      const vJson = (await vRes.json()) as { success?: boolean; data?: VehicleOption[] };
      if (vRes.ok && vJson.success) setVehicles(vJson.data ?? []);
      await loadDetail(detail.id);
      await reloadDrivers();
      setFeedback({ kind: "success", message: "Veículo criado e vinculado." });
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
      const res = await fetch(`/api/drivers/${detail.id}/vehicles`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ vehicle_id: vehicleId, action: "set_default" })
      });
      const json = await parseApiResponse(res);
      if (!res.ok || json.success !== true) {
        throw new Error(json.error?.message ?? "Falha");
      }
      setFeedback({ kind: "success", message: "Veículo padrão actualizado." });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Erro inesperado." });
    } finally {
      setBusy(false);
    }
  }

  function patchDetail<K extends keyof DriverDetail>(key: K, value: DriverDetail[K]) {
    setDetail((d) => (d ? { ...d, [key]: value } : d));
  }

  return (
    <>
      <section className="card">
        <h2 className="text-lg font-semibold text-slate-900">Novo motorista</h2>
        <p className="mt-1 text-sm text-slate-600">
          Cadastro principal: motorista com perfil de acesso. Depois abra a ficha para dados operacionais, financeiros e
          veículos vinculados.
        </p>
        <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={(e) => void createDriver(e)}>
          <label className="grid gap-1 text-sm md:col-span-2">
            <span>Perfil (utilizador motorista)</span>
            <select
              required
              className={inputClass}
              value={createProfileId}
              onChange={(e) => setCreateProfileId(e.target.value)}
            >
              <option value="">— seleccionar —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span>CPF</span>
            <input required className={inputClass} value={createCpf} onChange={(e) => setCreateCpf(e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>CNH</span>
            <input className={inputClass} value={createCnh} onChange={(e) => setCreateCnh(e.target.value)} />
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={creating || profiles.length === 0}
              className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {creating ? "A guardar…" : "Registar motorista"}
            </button>
          </div>
        </form>
        <FeedbackBanner feedback={feedback} />
      </section>

      <section className="card mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Motoristas</h2>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Incluir inactivos
          </label>
        </div>
        <FeedbackBanner feedback={!detail ? feedback : null} />
        {drivers.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Nenhum motorista registado.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {drivers.map((driver) => (
              <li key={driver.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-slate-900">
                    {driver.profile_name ?? "Motorista"} · CPF {driver.cpf}
                    {driver.active === false ? (
                      <span className="ml-2 rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-700">inactivo</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-slate-500">
                    CNH {driver.cnh_number ?? "—"}
                    {(driver.linked_vehicles?.length ?? 0) > 0 ? (
                      <span className="ml-2 text-amber-800">
                        · {driver.linked_vehicles!.length} veículo(s)
                        {driver.default_vehicle ? ` · padrão ${driver.default_vehicle.plate}` : ""}
                      </span>
                    ) : (
                      <span className="ml-2 text-slate-400">· sem veículos vinculados</span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-amber-700 px-3 py-1.5 text-sm text-amber-900 hover:bg-amber-50"
                  onClick={() => void loadDetail(driver.id)}
                >
                  {selectedId === driver.id ? "Ficha aberta" : "Abrir ficha"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail ? (
        <section className="card mt-6">
          <div className="mb-4">
            <BackButton
              fallbackHref="/drivers"
              onClick={() => {
                setDetail(null);
                setSelectedId(null);
                setFeedback(null);
              }}
            />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Ficha: {detail.profile_name ?? detail.cpf}</h2>
          <FeedbackBanner feedback={feedback} />
          <form className="mt-4 space-y-6" onSubmit={(e) => void saveDetail(e)}>
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
              <legend className="mb-2 text-sm font-semibold text-slate-800 md:col-span-2">Dados pessoais e CNH</legend>
              <label className="grid gap-1 text-sm md:col-span-2">
                <span>Nome completo</span>
                <input
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
                <span>Número da CNH</span>
                <input
                  className={inputClass}
                  value={detail.cnh_number ?? ""}
                  onChange={(e) => patchDetail("cnh_number", e.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Categoria da CNH</span>
                <select
                  className={inputClass}
                  value={detail.cnh_category ?? ""}
                  onChange={(e) => patchDetail("cnh_category", e.target.value)}
                >
                  <option value="">— seleccionar —</option>
                  {CNH_CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span>Vencimento da CNH</span>
                <input
                  type="date"
                  className={inputClass}
                  value={detail.cnh_expiry?.slice(0, 10) ?? ""}
                  onChange={(e) => patchDetail("cnh_expiry", e.target.value || null)}
                />
              </label>
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
                  type="email"
                  className={inputClass}
                  value={detail.email ?? ""}
                  onChange={(e) => patchDetail("email", e.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Cidade</span>
                <input className={inputClass} value={detail.city ?? ""} onChange={(e) => patchDetail("city", e.target.value)} />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Bairro</span>
                <input
                  className={inputClass}
                  value={detail.district ?? ""}
                  onChange={(e) => patchDetail("district", e.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm md:col-span-2">
                <span>Endereço completo</span>
                <input
                  className={inputClass}
                  value={detail.address ?? ""}
                  onChange={(e) => patchDetail("address", e.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm md:col-span-2">
                <span>Observações internas</span>
                <textarea
                  className={inputClass}
                  rows={2}
                  value={detail.notes ?? ""}
                  onChange={(e) => patchDetail("notes", e.target.value)}
                />
              </label>
            </fieldset>

            <fieldset className="grid gap-3 md:grid-cols-2">
              <legend className="mb-2 text-sm font-semibold text-slate-800 md:col-span-2">Operacional</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={detail.active !== false}
                  onChange={(e) => patchDetail("active", e.target.checked)}
                />
                Activo
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={detail.available !== false}
                  onChange={(e) => patchDetail("available", e.target.checked)}
                />
                Disponível para corridas
              </label>
              <label className="grid gap-1 text-sm">
                <span>Categoria de atendimento</span>
                <select
                  className={inputClass}
                  value={detail.operational_category ?? ""}
                  onChange={(e) => patchDetail("operational_category", e.target.value)}
                >
                  <option value="">—</option>
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span>Região de actuação</span>
                <input
                  className={inputClass}
                  value={detail.service_region ?? ""}
                  onChange={(e) => patchDetail("service_region", e.target.value)}
                />
              </label>
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
              <label className="grid gap-1 text-sm md:col-span-2">
                <span>Chave Pix</span>
                <input
                  className={inputClass}
                  value={detail.pix_key ?? ""}
                  onChange={(e) => patchDetail("pix_key", e.target.value)}
                />
              </label>
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
                  <option value="pagamento">Pagamento</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span>Favorecido</span>
                <input
                  className={inputClass}
                  value={detail.payee_name ?? ""}
                  onChange={(e) => patchDetail("payee_name", e.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>CPF/CNPJ favorecido</span>
                <input
                  className={inputClass}
                  value={detail.payee_document ?? ""}
                  onChange={(e) => patchDetail("payee_document", e.target.value)}
                />
              </label>
            </fieldset>

            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "A guardar…" : "Guardar ficha do motorista"}
            </button>
          </form>

          <div className="mt-8 border-t border-slate-200 pt-6">
            <h3 className="font-semibold text-slate-900">Veículos vinculados</h3>
            {detail.linked_vehicles.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Nenhum veículo. Vincule da frota ou registe um novo abaixo.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {detail.linked_vehicles.map((v) => (
                  <li key={v.link_id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 px-3 py-2">
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
                        className="text-amber-800 text-xs"
                        onClick={() => void setDefaultVehicle(v.id)}
                      >
                        Definir como padrão
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span>Vincular veículo existente</span>
                <select
                  className={inputClass}
                  value={linkVehicleId}
                  onChange={(e) => setLinkVehicleId(e.target.value)}
                >
                  <option value="">— frota —</option>
                  {vehicles
                    .filter((v) => !detail.linked_vehicles.some((lv) => lv.id === v.id))
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plate} · {v.model}
                      </option>
                    ))}
                </select>
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  disabled={busy || !linkVehicleId}
                  onClick={() => void linkExistingVehicle()}
                  className="rounded-lg border border-amber-700 px-4 py-2 text-sm text-amber-900 disabled:opacity-50"
                >
                  Vincular
                </button>
              </div>
            </div>

            <form className="mt-6 grid gap-3 md:grid-cols-3" onSubmit={(e) => void createAndLinkVehicle(e)}>
              <p className="text-sm font-medium text-slate-800 md:col-span-3">Registar novo veículo para este motorista</p>
              <input
                required
                placeholder="Placa"
                className={inputClass}
                value={newVehicle.plate}
                onChange={(e) => setNewVehicle((v) => ({ ...v, plate: e.target.value }))}
              />
              <input
                required
                placeholder="Modelo"
                className={inputClass}
                value={newVehicle.model}
                onChange={(e) => setNewVehicle((v) => ({ ...v, model: e.target.value }))}
              />
              <input
                placeholder="Marca"
                className={inputClass}
                value={newVehicle.brand}
                onChange={(e) => setNewVehicle((v) => ({ ...v, brand: e.target.value }))}
              />
              <input
                placeholder="Categoria"
                className={inputClass}
                value={newVehicle.category}
                onChange={(e) => setNewVehicle((v) => ({ ...v, category: e.target.value }))}
              />
              <input
                placeholder="Cor"
                className={inputClass}
                value={newVehicle.color}
                onChange={(e) => setNewVehicle((v) => ({ ...v, color: e.target.value }))}
              />
              <input
                placeholder="Capacidade"
                type="number"
                className={inputClass}
                value={newVehicle.capacity}
                onChange={(e) => setNewVehicle((v) => ({ ...v, capacity: e.target.value }))}
              />
              <button
                type="submit"
                disabled={busy}
                className="md:col-span-3 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Criar e vincular veículo
              </button>
            </form>
          </div>
        </section>
      ) : null}
    </>
  );
}
