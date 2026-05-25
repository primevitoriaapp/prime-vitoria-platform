type Props = {
  readOnly: boolean;
};

/** Aviso operacional — portal cliente em modo consulta (default seguro). */
export function ClientPortalReadonlyNotice({ readOnly }: Props) {
  if (!readOnly) return null;
  return (
    <div
      className="rounded-xl border border-amber-800/50 bg-amber-950/40 px-4 py-3 text-sm text-amber-100/90"
      role="status"
    >
      <p className="font-medium text-amber-200">Modo consulta activo</p>
      <p className="mt-1 text-amber-100/80">
        Pode acompanhar corridas e estados. Solicitações e cancelamentos ficam desactivados nesta fase do MVP — a
        operação cria e despacha corridas pelo painel interno.
      </p>
    </div>
  );
}
