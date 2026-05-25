import Link from "next/link";

type Props = {
  readOnly?: boolean;
};

export function ClientPortalNav({ readOnly = true }: Props) {
  return (
    <nav className="flex flex-wrap gap-3 text-sm text-slate-400" aria-label="Portal cliente">
      <Link href="/client#visao" className="hover:text-amber-400">
        Início
      </Link>
      <Link href="/client#corridas" className="hover:text-amber-400">
        Corridas
      </Link>
      <Link href="/client#centros" className="hover:text-amber-400">
        Centros de custo
      </Link>
      <Link href="/client#passageiros" className="hover:text-amber-400">
        Passageiros
      </Link>
      {!readOnly ? (
        <Link href="/client#solicitar" className="hover:text-amber-400">
          Nova solicitação
        </Link>
      ) : (
        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-500">
          Modo consulta
        </span>
      )}
    </nav>
  );
}
