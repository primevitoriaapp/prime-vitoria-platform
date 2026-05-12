import { ClientRequestConsole } from "@/components/client-request-console";

export default function ClientPage() {
  return (
    <main>
      <h1>Painel do Cliente</h1>
      <div className="card">
        Solicitar corrida com centro de custo, matrícula, setor, unidade e acompanhamento por status.
      </div>
      <ClientRequestConsole />
    </main>
  );
}
