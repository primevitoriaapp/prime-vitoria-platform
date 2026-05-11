import { DispatchConsole } from "@/components/dispatch-console";

export default function DispatchPage() {
  return (
    <main>
      <h1>Despacho</h1>
      <div className="card">
        <p>Utilize os endpoints de despacho direcionado e oferta para distribuir corridas.</p>
        <p>Fluxos prontos:</p>
        <ul>
          <li>POST /api/trips/:id/approve</li>
          <li>POST /api/trips/:id/dispatch-directed</li>
          <li>POST /api/dispatch/offers</li>
          <li>POST /api/dispatch/offers/:offerId/approve</li>
          <li>POST /api/trips/:id/reassign</li>
        </ul>
      </div>
      <DispatchConsole />
    </main>
  );
}
