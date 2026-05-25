type Props = {
  operationalStatus: string;
};

/**
 * Rastreio em fase read-only: não gera token (POST). Orienta o utilizador.
 */
export function ClientTrackingReadonly({ operationalStatus }: Props) {
  const active = ["dispatched", "accepted", "on_the_way", "arrived", "in_progress", "completed"].includes(
    operationalStatus
  );

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-sm text-slate-400">
      <p className="font-medium text-slate-300">Rastreio</p>
      {active ? (
        <p className="mt-1">
          Peça o link de rastreio à operação ou aguarde notificação. Nesta fase o portal está em modo consulta
          (sem gerar links automaticamente).
        </p>
      ) : (
        <p className="mt-1">O rastreio em tempo real fica disponível após o despacho da corrida.</p>
      )}
    </div>
  );
}
