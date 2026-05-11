import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>Prime Vitoria - Plataforma Operacional</h1>
      <p style={{ maxWidth: 560, color: "#475569" }}>
        Acesse com sua conta Supabase em <Link href="/login">Entrar</Link>. Em producao, use JWT/cookies; em desenvolvimento
        ainda e possivel chamar APIs com cabecalho <code>x-role</code> quando <code>TRUST_HEADER_AUTH</code> nao bloqueia.
      </p>
      <div className="grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <Link className="card" href="/dashboard">
          Painel Administrativo
        </Link>
        <Link className="card" href="/driver">
          Painel do Motorista
        </Link>
        <Link className="card" href="/client">
          Painel do Cliente
        </Link>
      </div>
    </main>
  );
}
