import { PublicTrackPoller } from "@/components/public-track-poller";
import { normalizePublicTrackToken } from "@/lib/public/track-token";
import { resolvePublicTrackSnapshot } from "@/lib/public/resolve-public-track";

type PageProps = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

function Brand() {
  return (
    <header className="bg-[#111] px-5 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))] text-center">
      <p className="text-lg font-bold tracking-[0.08em] text-[#fff]">
        PRIME <span className="text-[#C9A84C]">VITÓRIA</span>
      </p>
      <p className="text-[10px] tracking-[0.28em] text-[#C9A84C]">TRANSPORTE EXECUTIVO</p>
    </header>
  );
}

/** Página que o passageiro abre pelo WhatsApp para acompanhar o carro. */
export default async function PublicTrackPage({ params }: PageProps) {
  const { token: raw } = await params;
  const token = normalizePublicTrackToken(raw);
  const snapshot = token ? await resolvePublicTrackSnapshot(raw) : null;

  return (
    <div className="min-h-dvh bg-[#F4F1EA]">
      <Brand />
      <div className="h-1 bg-[#C9A84C]" />
      <main className="mx-auto max-w-lg space-y-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 md:max-w-2xl">
        {snapshot && token ? (
          <PublicTrackPoller token={token} initial={snapshot} />
        ) : (
          <section className="rounded-3xl bg-white p-6 text-center shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
            <h1 className="text-xl font-semibold text-[#111]">Acompanhamento encerrado</h1>
            <p className="mt-2 text-sm text-[#6B6B6B]">
              Este link vale só durante a corrida. Se a sua viagem já terminou, obrigado por viajar com a Prime Vitória.
            </p>
          </section>
        )}
        <p className="text-center text-[11px] text-[#9A9A9A]">
          Link privado da sua corrida. Não compartilhe. ·{" "}
          <a href="/privacidade" className="underline">
            Privacidade
          </a>
        </p>
      </main>
    </div>
  );
}
