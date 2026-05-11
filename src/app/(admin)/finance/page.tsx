import { FinanceConsole } from "@/components/finance-console";

export default function FinancePage() {
  return (
    <main>
      <h1>Financeiro</h1>
      <div className="card">Contas a receber, contas a pagar, margem operacional e fechamento mensal.</div>
      <FinanceConsole />
      <section className="card">
        <h2>Jobs financeiros e ERP</h2>
        <ul>
          <li>GET /api/integrations/mappings</li>
          <li>POST /api/integrations/mappings (x-role: admin ou operador)</li>
          <li>POST /api/jobs/erp/process (JWT operador/admin ou Bearer ERP_JOB_PROCESS_SECRET)</li>
          <li>POST /api/jobs/notifications/process (operador/admin ou Bearer NOTIFICATION_JOB_PROCESS_SECRET)</li>
          <li>POST /api/jobs/reconcile/run (financeiro/operador/admin ou Bearer RECONCILE_JOB_PROCESS_SECRET)</li>
          <li>POST /api/integrations/conta_azul/sync/receivable</li>
          <li>POST /api/integrations/omie/sync/receivable</li>
        </ul>
      </section>
    </main>
  );
}
