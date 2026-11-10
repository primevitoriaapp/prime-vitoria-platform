import { serviceExtrasLabel } from "@/lib/trips/service-extras";
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
import { parseDropoffStops } from "@/lib/trips/trip-dropoff-stops";
import { clientRefFromNotes } from "@/lib/trips/client-ref";
import { shortAddress } from "@/lib/client/short-address";
import { DOC_GOLD, DOC_LABEL, DOC_TD, DOC_TH, DocHeader, DocInfoGrid, DocRoute, DocSheet, docPrintCss, type RoutePoint } from "@/components/docs/prime-doc";

export const dynamic = "force-dynamic";

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
    { client_id: trip.client_id as string, driver_id: (trip.driver_id as string | null) ?? null, tenant_id: trip.tenant_id as string, created_by: (trip.created_by as string | null) ?? null },
    session.driverId
  );
  if (access !== "allow") {
    return <Message title="Sem acesso" text="Este voucher pertence a outra conta." />;
  }

  const [clientRes, driverRes, vehicleRes, company] = await Promise.all([
    db.from("clients").select("billing_issuer, type").eq("id", trip.client_id).maybeSingle(),
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

  const isDriver = session.role === "motorista";
  const pickups = parseTripPickupStops(trip.trip_pickup_stops);
  const dropoffs = parseDropoffStops(trip.trip_dropoff_stops);
  const audience = session.role === "cliente" ? "client" : "operator";
  const ref = clientRefFromNotes(trip.notes as string | null);
  const voucherNumber = ref ?? `Nº ${String(trip.id).slice(0, 8).toUpperCase()}`;
  const vehicleText = vehicle
    ? [vehicle.brand, vehicle.model, vehicle.color].filter(Boolean).join(" ") + (vehicle.plate ? ` · placa ${vehicle.plate}` : "")
    : null;
  const driverPhone = driver?.whatsapp || driver?.phone || null;
  const passengers = pickups.length ? pickups.map((s) => s.passenger_name).join(", ") : (trip.passenger_name as string | null);
  const service = primeServiceTypeLabel(String(trip.service_type ?? ""), { audience, scheduledAt: trip.scheduled_at as string });
  // Sem valor: o motorista vê o voucher e saberia quanto o cliente paga.
  const showValue = false;
  const amount = trip.client_amount == null ? null : Number(trip.client_amount);
  const km = trip.km_billable != null ? Number(trip.km_billable) : trip.actual_km != null ? Number(trip.actual_km) : null;
  // Observações sem a linha do NR (já está no cabeçalho).
  const notes = String(trip.notes ?? "")
    .split("\n")
    .filter((l) => !/^O\.S\.\/Ref\.:/i.test(l.trim()))
    .join("\n")
    .trim();

  const route: RoutePoint[] =
    pickups.length > 1
      ? [...pickups.map((p) => ({ address: shortAddress(p.pickup_text), who: p.passenger_name })), { address: shortAddress(trip.destination_text as string | null) }]
      : [
          { address: shortAddress(trip.origin_text as string | null) },
          ...dropoffs
            .filter((x) => !x.final)
            .map((x) => ({ address: shortAddress(x.address_text), who: [x.passenger_name, isDriver ? x.passenger_phone : null].filter(Boolean).join(" · ") || null })),
          (() => {
            const fin = dropoffs.find((x) => x.final);
            const who = fin ? [fin.passenger_name, isDriver ? fin.passenger_phone : null].filter(Boolean).join(" · ") || null : null;
            return { address: shortAddress(trip.destination_text as string | null), ...(who ? { who } : {}) };
          })()
        ];
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <main style={{ background: "#F4F1EA", minHeight: "100vh", padding: "24px 12px" }} className="voucher-root">
      <style>{docPrintCss("voucher-root", "voucher-sheet", "voucher-actions")}</style>

      <div className="voucher-actions" style={{ maxWidth: 900, margin: "0 auto 12px", display: "flex", gap: 8, justifyContent: "space-between" }}>
        <VoucherPrintButton />
      </div>

      <DocSheet className="voucher-sheet" maxWidth={900}>
        <DocHeader
          issuerName={issuerName}
          issuerCnpj={issuerCnpj}
          contact={[company.email ?? "contato@primevitoria.com", company.phone].filter(Boolean).join(" · ")}
          kind="VOUCHER"
          number={voucherNumber}
          lines={[ref ? `Atendimento ${String(trip.id).slice(0, 8).toUpperCase()}` : null]}
        />

        <section style={{ padding: "18px 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16 }}>
          {/* O voucher vai para a mão do motorista no embarque: nada de nome, CNPJ ou endereço do cliente. */}
          <div>
            <div style={DOC_LABEL}>Atendimento</div>
            <div style={{ fontWeight: 700 }}>{String(client?.type ?? "").toUpperCase() === "PF" ? "Atendimento particular" : "Atendimento empresarial"}</div>
          </div>
          <div>
            <div style={DOC_LABEL}>Data e horário</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{formatBrDateTime(trip.scheduled_at as string)}</div>
          </div>
          {showValue && amount != null ? (
            <div style={{ background: "#111", color: "#fff", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ ...DOC_LABEL, color: "#BBB" }}>Valor</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: DOC_GOLD }}>{brl(amount)}</div>
              <div style={{ fontSize: 11, color: "#BBB" }}>{service}</div>
            </div>
          ) : (
            <div>
              <div style={DOC_LABEL}>Serviço</div>
              <div style={{ fontWeight: 600 }}>{service}</div>
            </div>
          )}
        </section>

        <DocInfoGrid
          items={[
            ["Motorista", driver?.full_name ? `${driver.full_name}${driverPhone && !isDriver ? ` · ${driverPhone}` : ""}` : "A definir"],
            ["Veículo", vehicleText ?? "A definir"],
            ["Voo", (trip.flight_number as string | null) ?? null],
            ["Serviços", serviceExtrasLabel(trip.service_extras as string[] | null) || null]
          ]}
        />

        <section style={{ padding: "4px 24px 18px", overflowX: "auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", margin: "6px 0 8px" }}>Serviço</div>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 620 }}>
            <thead>
              <tr>
                <th style={DOC_TH}>Data</th>
                <th style={DOC_TH}>Passageiro</th>
                <th style={DOC_TH}>Trajeto (embarque → paradas → destino)</th>
                <th style={DOC_TH}>Serviço</th>
                <th style={{ ...DOC_TH, textAlign: "right" }}>KM</th>
                {showValue ? <th style={{ ...DOC_TH, textAlign: "right" }}>Valor</th> : null}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...DOC_TD, whiteSpace: "nowrap" }}>
                  {formatBrDateTime(trip.scheduled_at as string)}
                  <div style={{ fontSize: 10, color: "#888" }}>{ref ?? `Nº ${String(trip.id).slice(0, 8).toUpperCase()}`}</div>
                </td>
                <td style={DOC_TD}>
                  {passengers || "—"}
                  {trip.passenger_count && Number(trip.passenger_count) > 1 ? <div style={{ fontSize: 10, color: "#888" }}>{trip.passenger_count} passageiros</div> : null}
                  {!pickups.length && trip.passenger_phone ? <div style={{ fontSize: 10, color: "#888" }}>{trip.passenger_phone as string}</div> : null}
                </td>
                <td style={DOC_TD}>
                  <DocRoute points={route} />
                </td>
                <td style={DOC_TD}>{service}</td>
                <td style={{ ...DOC_TD, textAlign: "right" }}>{km ? km.toLocaleString("pt-BR") : "—"}</td>
                {showValue && amount != null ? <td style={{ ...DOC_TD, textAlign: "right", fontWeight: 600 }}>{brl(amount)}</td> : null}
              </tr>
            </tbody>
          </table>
        </section>

        {notes ? (
          <section style={{ margin: "0 24px 18px", background: "#F8F5EE", border: "1px solid #EAE4D6", borderRadius: 10, padding: "12px 14px", fontSize: 12 }}>
            <div style={DOC_LABEL}>Observações</div>
            <div style={{ whiteSpace: "pre-line" }}>{notes}</div>
          </section>
        ) : null}

        <footer style={{ borderTop: `2px solid ${DOC_GOLD}`, padding: "14px 24px 20px", fontSize: 12, color: "#555" }}>
          Apresente este voucher ao motorista no embarque. Alterações e cancelamentos devem ser solicitados à central Prime Vitória, conforme as condições combinadas.
        </footer>
      </DocSheet>
    </main>
  );
}
