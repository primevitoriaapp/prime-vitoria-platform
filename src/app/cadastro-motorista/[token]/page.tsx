import type { Metadata } from "next";
import { DriverSignupForm } from "@/components/site/driver-signup-form";
import { H2, Kicker, LandingFooter, LandingNav } from "@/components/site/landing";
import { leadBySignupToken } from "@/lib/leads/signup-token";
import { SITE } from "@/components/site/site-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cadastro de motorista · Prime Vitória", robots: { index: false, follow: false } };

/** Cadastro completo do motorista (etapa 2): aberto pelo link único que a central envia depois da primeira conversa. */
export default async function CadastroMotoristaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lead = await leadBySignupToken(token);
  const d = (lead?.details ?? {}) as Record<string, string>;
  return (
    <div lang="pt-BR" className="min-h-screen bg-[#F7F5F0] text-[#111]">
      <LandingNav cta="Falar com a central" ctaHref={SITE.whatsapp} />
      <main className="mx-auto max-w-2xl px-5 pb-20 pt-[calc(6rem+env(safe-area-inset-top))]">
        <Kicker>Motorista parceiro</Kicker>
        <H2>Cadastro completo</H2>
        {!lead ? (
          <p className="mt-6 rounded-[22px] bg-white p-6 text-[15px] text-[#6F6A60]">
            Este link não é válido ou expirou. Fale com a central pelo{" "}
            <a href={SITE.whatsapp} className="font-semibold text-[#111] underline">
              WhatsApp
            </a>{" "}
            para receber um novo.
          </p>
        ) : lead.completed_at ? (
          <p className="mt-6 rounded-[22px] bg-white p-6 text-[15px] text-[#6F6A60]">
            Recebemos o seu cadastro. A central está analisando e vai falar com você pelo WhatsApp. Precisa corrigir algo? Chame a central.
          </p>
        ) : (
          <>
            <p className="mb-6 mt-3 text-[15px] leading-relaxed text-[#6F6A60]">
              Olá, {lead.name.split(" ")[0]}! Complete seus dados, envie os documentos e as fotos do veículo. Leva uns 10 minutos. Tenha em mãos CNH, CRLV, comprovante de residência e a certidão de antecedentes.
            </p>
            <DriverSignupForm
              token={token}
              prefill={{ name: lead.name, phone: lead.phone, email: lead.email, city: lead.city, vehicle_model: d.vehicle_model, vehicle_year: d.vehicle_year, vehicle_color: d.vehicle_color }}
            />
          </>
        )}
      </main>
      <LandingFooter />
    </div>
  );
}
