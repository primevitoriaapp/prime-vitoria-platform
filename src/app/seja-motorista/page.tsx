import type { Metadata } from "next";
import { LeadForm } from "@/components/site/lead-form";
import { Cards, CheckList, Faq, H2, Hero, Kicker, LandingFooter, LandingNav, Steps } from "@/components/site/landing";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.primevitoria.com"),
  title: "Seja motorista parceiro · Prime Vitória",
  description: "Dirija com a Prime Vitória: corridas agendadas para empresas, aeroporto e eventos no Espírito Santo. Agenda no app, repasse por PIX e suporte da central.",
  alternates: { canonical: "/seja-motorista" },
  openGraph: {
    type: "website",
    url: "/seja-motorista",
    siteName: "Prime Vitória",
    locale: "pt_BR",
    title: "Seja motorista parceiro da Prime Vitória",
    description: "Corridas agendadas para empresas, aeroporto e eventos. Cadastre-se.",
    images: [{ url: "/site/frota-sedan-1.webp", width: 1200, height: 630, alt: "Motorista parceiro Prime Vitória" }]
  },
  robots: { index: true, follow: true }
};

const BENEFICIOS = [
  { icon: "M4 6h16v14H4zM4 10h16M9 3v5M15 3v5", t: "Corridas agendadas", d: "Você recebe as corridas com antecedência e monta sua agenda. Nada de ficar rodando à espera de chamada." },
  { icon: "M4 21V5l8-3 8 3v16M9 21v-5h6v5M8 9h2M14 9h2M8 13h2M14 13h2", t: "Clientes corporativos", d: "Empresas, executivos, aeroporto, eventos e casamentos. Passageiros que valorizam um bom serviço." },
  { icon: "M3 7h18v12H3zM3 7l3-3h12l3 3M16 13h2", t: "Repasse por PIX", d: "Cada corrida aparece na sua carteira do app com o valor e a data prevista do pagamento." },
  { icon: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2", t: "App próprio do motorista", d: "Agenda, rota no Waze ou Google Maps, contato com o passageiro e histórico, tudo no celular." },
  { icon: "M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z", t: "Central de verdade", d: "Gente do nosso time acompanha cada corrida e resolve com você qualquer imprevisto." },
  { icon: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z", t: "Sem taxa de cadastro", d: "Cadastrar-se é gratuito e você não precisa ter exclusividade com a Prime." }
];

const PASSOS = [
  { t: "Faça o cadastro", d: "Preencha o formulário abaixo. Leva menos de 2 minutos." },
  { t: "Conversa com a central", d: "Chamamos você no WhatsApp para conhecer seu perfil e pedir os documentos." },
  { t: "Vistoria do carro", d: "Conferimos o veículo e explicamos o nosso padrão de atendimento." },
  { t: "Comece a rodar", d: "Você recebe o acesso ao app e as primeiras corridas na sua agenda." }
];

const REQUISITOS = [
  "CNH definitiva com a observação EAR (exerce atividade remunerada)",
  "Carro de 4 portas, sedã ou SUV, em ótimo estado e com ar-condicionado",
  "Veículo de 2018 em diante (outros casos analisamos na conversa)",
  "Documento do carro (CRLV) em dia",
  "Certidão de antecedentes criminais sem pendências",
  "Smartphone Android ou iPhone com internet",
  "Boa apresentação: traje social e postura executiva",
  "MEI ou CNPJ (desejável: ajudamos você a abrir)"
];

const FAQ = [
  { q: "Preciso ter carro próprio?", a: "Para começar, sim: o carro pode ser seu ou alugado no seu nome. Se você tem van ou ônibus, também queremos conversar." },
  { q: "Quanto eu ganho por corrida?", a: "Depende da categoria do seu veículo e do tipo de serviço (transfer, diária, evento). Explicamos os valores na conversa com a central, antes de você aceitar qualquer corrida." },
  { q: "Como e quando eu recebo?", a: "Por PIX. Cada corrida aparece na carteira do app com a data prevista. O repasse segue o prazo de pagamento de cada empresa cliente." },
  { q: "Preciso trabalhar só para a Prime?", a: "Não. Não pedimos exclusividade. Você confirma no app só as corridas que pode fazer." },
  { q: "Atendem fora da Grande Vitória?", a: "Nossa base é a Grande Vitória, mas temos corridas para todo o Espírito Santo e uma rede de parceiros em outras capitais." }
];

export default function SejaMotoristaPage() {
  return (
    <div lang="pt-BR" className="min-h-screen bg-[#F7F5F0] text-[#111]">
      <LandingNav cta="Cadastrar" ctaHref="#cadastro" />
      <Hero
        img="/site/frota-sedan-1.webp"
        kicker="Motorista parceiro"
        title={
          <>
            Dirija para quem <span className="text-[#D9BC6A]">valoriza</span> um bom serviço
          </>
        }
        sub="Corridas agendadas para empresas, aeroporto e eventos no Espírito Santo. Você sabe a sua agenda com antecedência e recebe por PIX."
        cta="Quero ser parceiro"
        ctaHref="#cadastro"
        note="Cadastro gratuito · leva menos de 2 minutos"
      />

      <section className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
        <Kicker>Por que a Prime</Kicker>
        <H2>Mais previsibilidade do que nos aplicativos</H2>
        <Cards items={BENEFICIOS} />
      </section>

      <section className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <Kicker>Como funciona</Kicker>
          <H2>Do cadastro à primeira corrida</H2>
          <Steps items={PASSOS} />
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-20 sm:py-28">
        <Kicker>Requisitos</Kicker>
        <H2>O que você precisa ter</H2>
        <CheckList items={REQUISITOS} />
      </section>

      <section id="cadastro" className="scroll-mt-20 bg-[#111] py-20 sm:py-28">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <Kicker light>Cadastro</Kicker>
            <H2 light>Faça parte da equipe Prime Vitória</H2>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/75">
              Preencha seus dados. Nossa central analisa o cadastro e chama você no WhatsApp para os próximos passos.
            </p>
          </div>
          <LeadForm kind="motorista" />
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
