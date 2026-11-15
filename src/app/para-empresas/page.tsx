import type { Metadata } from "next";
import { LeadForm } from "@/components/site/lead-form";
import { Cards, CheckList, Faq, H2, Hero, Kicker, LandingFooter, LandingNav, Steps } from "@/components/site/landing";
import { SITE } from "@/components/site/site-data";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.primevitoria.com"),
  title: "Transporte executivo para empresas · Prime Vitória",
  description: "Transporte corporativo no Espírito Santo e nas principais capitais: transfer de aeroporto, rotas de funcionários, eventos e carro à disposição, com faturamento mensal e portal da empresa.",
  alternates: { canonical: "/para-empresas" },
  openGraph: {
    type: "website",
    url: "/para-empresas",
    siteName: "Prime Vitória",
    locale: "pt_BR",
    title: "Prime Vitória para Empresas",
    description: "Transporte executivo corporativo com faturamento mensal e portal da empresa.",
    images: [{ url: "/site/op-porto.webp", width: 1200, height: 630, alt: "Prime Vitória para Empresas" }]
  },
  robots: { index: true, follow: true }
};

const NUMEROS = [
  { n: "10 anos", t: "de operação no Espírito Santo" },
  { n: "Sedã ao ônibus", t: "frota para cada tipo de demanda" },
  { n: "Todas as capitais", t: "atendidas com rede de parceiros" }
];

const SOLUCOES = [
  { icon: "M2 16l20-6-3-2-6 2-6-6-2 1 4 6-5 2-2-1-1 1z", t: "Transfer de aeroporto", d: "Recepção de executivos e visitantes com acompanhamento do voo e placa de identificação." },
  { icon: "M3 7h14l4 5v5h-2M3 7v10h2M9 17h6M3 12h18", t: "Rotas de funcionários", d: "Turnos, rotas fixas e lista de passageiros conferida pelo motorista a cada embarque." },
  { icon: "M4 19l5-14 6 9 2-4 3 9", t: "Eventos e convenções", d: "Logística de grupos com vans e ônibus, escala de horários e coordenação no dia." },
  { icon: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", t: "Carro à disposição", d: "Motorista e veículo por diária ou por hora para agendas cheias de compromissos." },
  { icon: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z", t: "Veículos blindados", d: "Segurança extra para diretoria, visitantes e deslocamentos sensíveis." },
  { icon: "M5 4h14a2 2 0 0 1 2 2v11H3V6a2 2 0 0 1 2-2zM3 11h18M7 17v2M17 17v2", t: "Viagens intermunicipais", d: "Deslocamentos pelo estado e para outras capitais com o mesmo padrão." }
];

const DIFERENCIAIS = [
  "Uma fatura por mês, com nota fiscal e detalhe de cada corrida",
  "Portal da empresa para pedir corridas e acompanhar tudo",
  "Relatórios por passageiro, setor ou centro de custo",
  "Link de acompanhamento em tempo real para o passageiro",
  "Motoristas selecionados, com traje social e treinamento",
  "Central humana acompanhando cada corrida"
];

const PASSOS = [
  { t: "Cadastre sua empresa", d: "Preencha o formulário com a necessidade de transporte." },
  { t: "Receba a proposta", d: "Um consultor fala com você e envia uma proposta sob medida." },
  { t: "Acesso ao portal", d: "Cadastramos sua equipe e liberamos o portal da empresa." },
  { t: "Peça as corridas", d: "Pelo portal, WhatsApp ou telefone. Nós cuidamos do resto." }
];

const FAQ = [
  { q: "Vocês emitem nota fiscal e faturam por mês?", a: "Sim. Empresas cadastradas recebem uma fatura mensal com nota fiscal e o detalhe de cada corrida, no prazo combinado em contrato." },
  { q: "Atendem fora do Espírito Santo?", a: "Sim. Nossa base é Vitória/ES e atendemos todas as capitais com uma rede de parceiros selecionados, mantendo um único contato e uma única fatura." },
  { q: "Qual o pedido mínimo?", a: "Não há volume mínimo para começar. A proposta é montada de acordo com a frequência e o tipo de serviço que sua empresa usa." },
  { q: "Como peço uma corrida?", a: "Pelo portal da empresa, pelo WhatsApp ou por telefone. O passageiro recebe os dados do motorista e o link para acompanhar o trajeto." },
  { q: "Como funciona o preço?", a: "Cada empresa recebe uma tabela própria, por categoria de veículo e tipo de serviço. Enviamos a proposta depois de entender a sua necessidade." }
];

export default function ParaEmpresasPage() {
  return (
    <div lang="pt-BR" className="min-h-screen bg-[#F7F5F0] text-[#111]">
      <LandingNav cta="Pedir proposta" ctaHref="#cadastro" />
      <Hero
        img="/site/op-porto.webp"
        kicker="Prime Vitória para Empresas"
        title={
          <>
            Transporte executivo que a sua empresa <span className="text-[#D9BC6A]">pode confiar</span>
          </>
        }
        sub="Transfer de aeroporto, rotas de funcionários, eventos e carro à disposição. Faturamento mensal, portal da empresa e uma central acompanhando cada corrida."
        cta="Quero uma proposta"
        ctaHref="#cadastro"
        note="Resposta em até 1 dia útil"
      />

      <section className="border-b border-[#ECE7DB] bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 py-10 sm:grid-cols-3">
          {NUMEROS.map((x) => (
            <div key={x.n} className="text-center">
              <p className="font-prime-serif text-3xl text-[#111]">{x.n}</p>
              <p className="mt-1 text-sm text-[#6F6A60]">{x.t}</p>
            </div>
          ))}
        </div>
      </section>

      {SITE.clientes.length > 0 ? (
        <section className="bg-white pb-10">
          <p className="text-center text-xs uppercase tracking-[0.24em] text-[#6B6F76]">Empresas que confiam na Prime</p>
          <div className="mx-auto mt-6 flex max-w-5xl flex-wrap items-center justify-center gap-x-10 gap-y-6 px-5">
            {SITE.clientes.map((c) => (
              <img key={c.name} src={c.src} alt={c.name} className="h-9 w-auto object-contain opacity-70 grayscale" loading="lazy" />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
        <Kicker>Soluções</Kicker>
        <H2>Para cada necessidade da sua empresa</H2>
        <Cards items={SOLUCOES} />
      </section>

      <section className="bg-white py-20 sm:py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-2">
          <div>
            <Kicker>Gestão simples</Kicker>
            <H2>Menos trabalho para o seu time</H2>
            <p className="mt-5 text-base leading-relaxed text-[#6F6A60]">Seu time pede, nós executamos, e no fim do mês chega tudo organizado em uma única fatura.</p>
            <CheckList items={DIFERENCIAIS} />
          </div>
          <img src="/site/equipe.webp" alt="Equipe de motoristas Prime Vitória" loading="lazy" className="aspect-[4/5] w-full rounded-[28px] object-cover shadow-[0_20px_60px_rgba(0,0,0,0.15)]" />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
        <Kicker>Como funciona</Kicker>
        <H2>Em poucos dias sua empresa já está rodando</H2>
        <Steps items={PASSOS} />
      </section>

      <section id="cadastro" className="scroll-mt-20 bg-[#111] py-20 sm:py-28">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <Kicker light>Proposta sob medida</Kicker>
            <H2 light>Cadastre sua empresa</H2>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/75">
              Conte o que sua empresa precisa. Um consultor da Prime Vitória fala com você em até 1 dia útil.
            </p>
            <p className="mt-6 text-sm text-white/60">
              Prefere falar agora?{" "}
              <a href={SITE.whatsapp} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#D9BC6A] underline">
                Chame no WhatsApp
              </a>{" "}
              ou ligue {SITE.phone}.
            </p>
          </div>
          <LeadForm kind="empresa" />
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-20 sm:py-28">
        <Kicker>Dúvidas</Kicker>
        <H2>Perguntas frequentes</H2>
        <Faq items={FAQ} />
      </section>

      <LandingFooter />
    </div>
  );
}
