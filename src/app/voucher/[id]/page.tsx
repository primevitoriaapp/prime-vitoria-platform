import Link from "next/link";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { getSessionContext } from "@/lib/server/session";
import { withResolvedDriverId } from "@/lib/drivers/resolve-driver-for-session";
import { tripGetAccess } from "@/lib/trips/trip-detail-access";
import { formatBrDateTime } from "@/lib/dates/br-date";
import { parseTripPickupStops } from "@/lib/trips/trip-pickup-stops";
import { primeServiceTypeLabel } from "@/lib/pricing/prime-service-catalog";
import { billingIssuerById } from "@/lib/clients/billing-terms-calc";
import { getTenantCompanyProfile } from "@/lib/company/tenant-company-profile";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { VoucherPrintButton } from "./print-button";

export const dynamic = "force-dynamic";

const GOLD = "#C9A84C";
const INK = "#111111";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 12, padding: "8px 0", borderBottom: "1px solid #E7E2D3" }}>
      <dt style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#7A6A3A" }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: 14, color: INK }}>{value}</dd>
    </div>
  );
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <main style={{ maxWidth: 520, margin: "48px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20 }}>{title}</h1>
      <p style={{ color: "#555" }}>{text}</p>
      <p>
        <Link href="/login">Entrar</Link>
      </p>
    </main>
  );
}

/**
 * Voucher da viagem (padrão Prime preto e dourado). Abre no navegador e
 * vira PDF pelo botão "Baixar PDF" (impressão do navegador → Salvar como PDF).
 * Acesso: operação da Prime, o cliente da corrida e o motorista atribuído.
 */
export default async function VoucherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return <Message title="Voucher não encontrado" text="O endereço deste voucher não é válido." />;
  }

  const session = await withResolvedDriverId(await getSessionContext());
  if (session.role === "guest" || session.userId === "anonymous") {
    return <Message title="Entre para ver o voucher" text="Este voucher só pode ser aberto com login." />;
  }
  const tenantId = session.tenantId ?? DEFAULT_TENANT_ID;

  const { data: trip } = await db.from("trips").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (!trip) return <Message title="Voucher não encontrado" text="Esta corrida não existe ou não está disponível." />;

  const access = tripGetAccess(
    session,
    { client_id: trip.client_id as string, driver_id: (trip.driver_id as string | null) ?? null, tenant_id: trip.tenant_id as string },
    session.driverId
  );
  if (access !== "allow") {
    return <Message title="Sem acesso" text="Este voucher pertence a outra conta." />;
  }

  const [clientRes, driverRes, vehicleRes, company] = await Promise.all([
    db.from("clients").select("name, trade_name, document, billing_issuer").eq("id", trip.client_id).maybeSingle(),
    trip.driver_id
      ? db.from("drivers").select("full_name, phone, whatsapp").eq("id", trip.driver_id).maybeSingle()
      : Promise.resolve({ data: null }),
    trip.vehicle_id
      ? db.from("vehicles").select("brand, model, color, plate").eq("id", trip.vehicle_id).maybeSingle()
      : Promise.resolve({ data: null }),
    getTenantCompanyProfile(tenantId)
  ]);

  const client = clientRes.data as Record<string, string | null> | null;
  const driver = driverRes.data as Record<string, string | null> | null;
  const vehicle = vehicleRes.data as Record<string, string | null> | null;
  const issuer = billingIssuerById(client?.billing_issuer ?? null);
  const issuerName = issuer?.legal_name ?? company.legal_name;
  const issuerCnpj = issuer?.cnpj ?? company.cnpj;

  const stops = parseTripPickupStops(trip.trip_pickup_stops);
  const audience = session.role === "cliente" ? "client" : "operator";
  const voucherNumber = String(trip.id).slice(0, 8).toUpperCase();
  const vehicleText = vehicle
    ? [vehicle.brand, vehicle.model, vehicle.color].filter(Boolean).join(" ") + (vehicle.plate ? ` · placa ${vehicle.plate}` : "")
    : null;
  const driverPhone = driver?.whatsapp || driver?.phone || null;
  const passengers = stops.length
    ? stops.map((s) => s.passenger_name).join(", ")
    : (trip.passenger_name as string | null);

  return (
    <main style={{ background: "#F4F1EA", minHeight: "100vh", padding: "24px 16px" }} className="voucher-root">
      <style>{`
        @media print {
          .voucher-root { background: #fff !important; padding: 0 !important; }
          .voucher-actions { display: none !important; }
          .voucher-sheet { box-shadow: none !important; margin: 0 !important; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>

      <div className="voucher-actions" style={{ maxWidth: 720, margin: "0 auto 12px", display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <VoucherPrintButton />
      </div>

      <article
        className="voucher-sheet"
        style={{ maxWidth: 720, margin: "0 auto", background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,.08)", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif" }}
      >
        <header style={{ background: INK, color: "#fff", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0.04em" }}>
              PRIME <span style={{ color: GOLD }}>VITÓRIA</span>
            </div>
            <div style={{ fontSize: 11, letterSpacing: "0.16em", color: GOLD, marginTop: 2 }}>TRANSPORTE EXECUTIVO</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, letterSpacing: "0.12em", color: "#BBB" }}>VOUCHER</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: GOLD, fontVariantNumeric: "tabular-nums" }}>Nº {voucherNumber}</div>
          </div>
        </header>
        <div style={{ height: 4, background: GOLD }} />

        <section style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.08em", color: "#7A6A3A", textTransform: "uppercase" }}>Data e horário</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: INK }}>{formatBrDateTime(trip.scheduled_at as string)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, letterSpacing: "0.08em", color: "#7A6A3A", textTransform: "uppercase" }}>Serviço</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: INK }}>
                {primeServiceTypeLabel(String(trip.service_type ?? ""), { audience, scheduledAt: trip.scheduled_at as string })}
              </div>
            </div>
          </div>

          <dl style={{ margin: 0 }}>
            <Row label="Cliente" value={client?.trade_name || client?.name} />
            <Row label="Passageiro(s)" value={passengers} />
            <Row label="Telefone" value={stops.length ? null : (trip.passenger_phone as string | null)} />
            <Row
              label="Embarque"
              value={
                stops.length ? (
                  <ol style={{ margin: 0, paddingLeft: 18 }}>
                    {stops.map((s, i) => (
                      <li key={i}>
                        {s.pickup_text}
                        <span style={{ color: "#666" }}> · {s.passenger_name}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  (trip.origin_text as string | null)
                )
              }
            />
            <Row label="Destino" value={trip.destination_text as string | null} />
            <Row label="Passageiros" value={trip.passenger_count ? `${trip.passenger_count}` : null} />
            <Row label="Motorista" value={driver?.full_name ? `${driver.full_name}${driverPhone ? ` · ${driverPhone}` : ""}` : "A definir"} />
            <Row label="Veículo" value={vehicleText ?? "A definir"} />
            <Row label="Observações" value={trip.notes as string | null} />
          </dl>
        </section>

        <footer style={{ borderTop: `2px solid ${GOLD}`, padding: "14px 24px 20px", fontSize: 12, color: "#555", display: "grid", gap: 6 }}>
          <div>
            Apresente este voucher ao motorista no embarque. Alterações e cancelamentos devem ser solicitados à central Prime
            Vitória, conforme as condições combinadas com a sua empresa.
          </div>
          <div style={{ color: INK }}>
            {issuerName} · CNPJ {issuerCnpj}
            {company.email ? ` · ${company.email}` : ""}
            {company.phone ? ` · ${company.phone}` : ""}
          </div>
        </footer>
      </article>
    </main>
  );
}
