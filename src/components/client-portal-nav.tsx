"use client";

import Link from "next/link";
import { scrollToSolicitar } from "@/lib/client/scroll-to-solicitar";

type Props = {
  readOnly?: boolean;
};

export function ClientPortalNav({ readOnly = true }: Props) {
  return (
    <nav className="flex flex-wrap gap-3 text-sm text-prime-muted" aria-label="Portal cliente">
      <Link href="/client#visao" className="hover:text-prime-gold">
        Início
      </Link>
      <Link href="/client#corridas" className="hover:text-prime-gold">
        Corridas
      </Link>
      <Link href="/client#equipe" className="hover:text-prime-gold">
        Minha equipe
      </Link>
      {!readOnly ? (
        <button type="button" onClick={scrollToSolicitar} className="hover:text-prime-gold">
          Nova solicitação
        </button>
      ) : (
        <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-prime-muted">
          Modo consulta
        </span>
      )}
    </nav>
  );
}
