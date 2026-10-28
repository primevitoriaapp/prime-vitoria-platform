import Link from "next/link";
import { PrimeLogoMark } from "@/components/prime-logo-mark";

const ENTRADAS = [
  {
    href: "/login?next=/client",
    title: "Empresas",
    text: "Peça corridas, acompanhe sua equipe, veja faturas e relatórios.",
    cta: "Entrar no portal"
  },
  {
    href: "/driver/login",
    title: "Motoristas",
    text: "Suas corridas do dia, navegação e ordem de serviço.",
    cta: "Entrar com CPF e PIN"
  },
  {
    href: "/login?next=/dashboard",
    title: "Central Prime",
    text: "Agenda, despacho, clientes, financeiro e WhatsApp.",
    cta: "Entrar no painel"
  }
] as const;

/** Página inicial: escolhe por onde entrar (empresa, motorista ou central). */
export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#111] px-5 py-10 text-[#fff]">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center">
        <PrimeLogoMark size={88} />
        <h1 className="mt-5 text-center font-prime-display text-3xl !text-[#fff] sm:text-4xl">Prime Vitória</h1>
        <p className="mt-1 text-center text-xs font-medium uppercase tracking-[0.3em] text-prime-gold">Transporte executivo</p>
        <p className="mt-6 max-w-xl text-center text-sm text-[#fff]/70">
          Mobilidade executiva no Espírito Santo e nas principais capitais do Brasil. Escolha como você quer entrar.
        </p>

        <div className="mt-10 grid w-full gap-4 sm:grid-cols-3">
          {ENTRADAS.map((e) => (
            <Link
              key={e.title}
              href={e.href}
              className="group flex flex-col rounded-2xl border border-[#fff]/10 bg-[#1b1b1b] p-5 transition hover:border-prime-gold"
            >
              <span className="text-lg font-semibold text-[#fff]">{e.title}</span>
              <span className="mt-2 flex-1 text-sm text-[#fff]/60">{e.text}</span>
              <span className="mt-5 text-sm font-semibold text-prime-gold group-hover:underline">{e.cta} →</span>
            </Link>
          ))}
        </div>
      </div>
      <p className="mt-10 text-center text-xs text-[#fff]/40">
        R J Prime Transporte LTDA · CNPJ 49.126.277/0001-54 · contato@primevitoria.com
      </p>
    </div>
  );
}
