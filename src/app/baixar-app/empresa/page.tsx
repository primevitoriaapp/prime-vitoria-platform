import type { Metadata } from "next";
import { ApkCompatCheck } from "@/components/apk-compat-check";

export const metadata: Metadata = { title: "Baixar o app · Prime Empresas" };

/** Página para a empresa cliente instalar o app Android (antes de estar na Play Store). */
export default function BaixarAppEmpresaPage() {
  return (
    <div className="min-h-dvh bg-[#111] px-5 py-10 text-[#F5F5F5]">
      <div className="mx-auto max-w-md text-center">
        <p className="text-lg font-bold tracking-[0.08em]">
          PRIME <span className="text-[#C9A84C]">VITÓRIA</span>
        </p>
        <h1 className="mt-6 text-2xl font-semibold">App Prime Empresas</h1>
        <p className="mt-2 text-sm text-[#BBBBBB]">Peça carro para a equipe, acompanhe o motorista e veja suas faturas. Para Android 7 ou mais novo.</p>
        <a href="/baixar-app/empresa/apk" className="mt-8 block rounded-2xl bg-[#C9A84C] px-6 py-4 text-lg font-bold text-[#111]">
          ⬇️ Baixar o app
        </a>
        <ApkCompatCheck web="https://empresa.primevitoria.com/client" label="o portal Prime Empresas" />
        <ol className="mt-8 space-y-3 text-left text-sm text-[#DDDDDD]">
          <li>
            <b>1.</b> Toque em <b>Baixar o app</b> e espere terminar.
          </li>
          <li>
            <b>2.</b> Abra o arquivo <b>Prime-Empresas.apk</b> (na notificação ou em Downloads).
          </li>
          <li>
            <b>3.</b> Se o celular avisar, toque em <b>Configurações</b> e ligue <b>“Permitir desta fonte”</b>. Volte e toque em <b>Instalar</b>.
          </li>
          <li>
            <b>4.</b> Abra o <b>Prime Empresas</b> e entre com o mesmo e-mail e senha do portal.
          </li>
        </ol>
        <p className="mt-8 text-xs text-[#888888]">iPhone: use empresa.primevitoria.com no Safari e toque em Compartilhar → “Adicionar à Tela de Início”.</p>
      </div>
    </div>
  );
}
