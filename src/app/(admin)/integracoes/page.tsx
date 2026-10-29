import Link from "next/link";
import type { Route } from "next";
import { AdminPageHeader } from "@/components/admin-page-header";
import { getSessionContext } from "@/lib/server/session";

type Status = "ligado" | "parcial" | "desligado" | "em_breve";

type Integration = {
  name: string;
  what: string;
  status: Status;
  note: string;
  cost?: string;
  href?: string;
  hrefLabel?: string;
};

const has = (k: string) => Boolean(process.env[k]?.trim());

const STATUS: Record<Status, { label: string; cls: string }> = {
  ligado: { label: "Conectado", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  parcial: { label: "Funciona com limite", cls: "bg-amber-50 text-amber-900 ring-amber-200" },
  desligado: { label: "Não conectado", cls: "bg-gray-100 text-gray-700 ring-gray-200" },
  em_breve: { label: "Ainda não existe", cls: "bg-blue-50 text-blue-800 ring-blue-200" }
};

function list(): { group: string; items: Integration[] }[] {
  const emailFromOwnDomain = (process.env.OPERATIONAL_EMAIL_FROM ?? "").includes("primevitoria");
  return [
    {
      group: "Comunicação",
      items: [
        {
          name: "WhatsApp (central)",
          what: "Mensagens automáticas de cada corrida para quem pediu, passageiro e motorista.",
          status: has("ZAPI_INSTANCE_ID") && has("ZAPI_TOKEN") ? "ligado" : "desligado",
          note:
            has("ZAPI_INSTANCE_ID") && has("ZAPI_TOKEN")
              ? "Conectado pelo QR code do número da central."
              : "Falta criar a conta na Z-API, ler o QR code com o celular da central e colocar as 3 chaves no Vercel.",
          cost: "Z-API: cerca de R$ 100/mês",
          href: "/whatsapp",
          hrefLabel: "Ver mensagens"
        },
        {
          name: "E-mail",
          what: "Aviso de pedido novo, convite de agenda para o motorista e envio de faturas.",
          status: !has("RESEND_API_KEY") ? "desligado" : emailFromOwnDomain ? "ligado" : "parcial",
          note: !has("RESEND_API_KEY")
            ? "Falta a chave do Resend."
            : emailFromOwnDomain
              ? "Saindo pelo domínio da Prime."
              : "Por enquanto só chega no seu e-mail. Para chegar em clientes e motoristas, é preciso confirmar o domínio primevitoria.com no Resend.",
          cost: "Grátis até 3.000 e-mails/mês"
        },
        {
          name: "Google Agenda do motorista",
          what: "Corrida entra na agenda do celular do motorista com lembrete 1 dia e 3 horas antes.",
          status: has("RESEND_API_KEY") ? (emailFromOwnDomain ? "ligado" : "parcial") : "desligado",
          note: "Vai junto com o e-mail de atribuição. Depende do e-mail acima estar liberado."
        }
      ]
    },
    {
      group: "Mapas e voos",
      items: [
        {
          name: "Google Maps: busca de endereço",
          what: "Busca de endereço e nome de empresa ao pedir corrida.",
          status: has("GOOGLE_MAPS_API_KEY") ? "ligado" : "desligado",
          note: has("GOOGLE_MAPS_API_KEY") ? "Ativo." : "Sem chave: usa o OpenStreetMap, que acha menos lugares.",
          cost: "Coberto pelo crédito mensal do Google"
        },
        {
          name: "Google Maps: mapa da frota",
          what: "Mapa ao vivo com os motoristas.",
          status: has("NEXT_PUBLIC_GOOGLE_MAPS_KEY") ? "ligado" : "desligado",
          note: has("NEXT_PUBLIC_GOOGLE_MAPS_KEY") ? "Ativo." : "Sem chave: usa o mapa gratuito.",
          href: "/ao-vivo",
          hrefLabel: "Abrir mapa"
        },
        {
          name: "Flightradar24",
          what: "Acompanhar o voo do passageiro e avisar atraso automaticamente.",
          status: "em_breve",
          note: "Hoje o número do voo é guardado e vira link. O acompanhamento automático precisa do plano de API deles.",
          cost: "A partir de US$ 9/mês"
        }
      ]
    },
    {
      group: "Financeiro",
      items: [
        {
          name: "Conta Azul",
          what: "Mandar faturas, recebimentos e notas fiscais para o Conta Azul sem digitar de novo.",
          status: "em_breve",
          note: "Precisa cadastrar a Prime como desenvolvedora no portal do Conta Azul para liberar o acesso. Aí eu construo a ligação.",
          cost: "Sem custo extra além do seu plano Conta Azul"
        },
        {
          name: "Boleto automático (banco)",
          what: "Gerar o boleto da fatura e dar baixa sozinho quando o cliente pagar.",
          status: "em_breve",
          note: "Precisa escolher o banco ou a plataforma (Inter, Asaas, Cora…). Hoje o boleto é anexado à mão na fatura."
        },
        {
          name: "Nota fiscal",
          what: "Emitir a NF junto com a fatura.",
          status: "em_breve",
          note: "Depende de quem emite a nota hoje (prefeitura, contador ou Conta Azul). Hoje o número e o PDF da NF são anexados à mão."
        }
      ]
    },
    {
      group: "Inteligência artificial",
      items: [
        {
          name: "Assistente IA (Claude ou ChatGPT)",
          what: "Ler e-mails ou mensagens de pedido e montar a corrida sozinho; responder perguntas sobre a operação.",
          status: "em_breve",
          note: "Precisa de uma chave paga da Anthropic (Claude) ou da OpenAI (ChatGPT). Custa por uso; para o volume da Prime, poucas dezenas de reais por mês.",
          cost: "Por uso"
        }
      ]
    }
  ];
}

export default async function IntegracoesPage() {
  const session = await getSessionContext();
  if (session.role !== "admin") {
    return <p className="text-sm text-prime-muted">Só o administrador vê as integrações.</p>;
  }
  const groups = list();
  return (
    <div className="pb-10">
      <AdminPageHeader
        title="Integrações"
        subtitle="O que a plataforma usa de fora, o que já está ligado e o que falta para ligar."
      />
      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g.group}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-prime-muted">{g.group}</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {g.items.map((it) => {
                const st = STATUS[it.status];
                return (
                  <article key={it.name} className="flex flex-col rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-semibold">{it.name}</h3>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${st.cls}`}>{st.label}</span>
                    </div>
                    <p className="mt-2 text-sm">{it.what}</p>
                    <p className="mt-2 text-sm text-prime-muted">{it.note}</p>
                    <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-xs text-prime-muted">
                      <span>{it.cost ?? ""}</span>
                      {it.href ? (
                        <Link href={it.href as Route} className="font-semibold text-prime-gold hover:underline">
                          {it.hrefLabel ?? "Abrir"} →
                        </Link>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
