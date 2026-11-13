import { AdminPageHeader } from "@/components/admin-page-header";
import { MessageTemplatesEditor } from "@/components/message-templates-editor";

export default function ConfiguracoesPage() {
  return (
    <div className="pb-10">
      <AdminPageHeader
        title="Configurações"
        subtitle="Textos que o sistema manda para motorista, passageiro e cliente."
      />
      <nav className="mb-5 flex flex-wrap gap-2 text-sm">
        <a href="#mensagens" className="rounded-full bg-white px-4 py-2 font-semibold ring-1 ring-prime-border hover:ring-prime-gold">
          Mensagens automáticas (WhatsApp)
        </a>
        <a href="/minha-empresa" className="rounded-full bg-white px-4 py-2 font-semibold ring-1 ring-prime-border hover:ring-prime-gold">
          Logo e dados da empresa → Minha empresa
        </a>
      </nav>
      <div id="mensagens" className="scroll-mt-6">
        <MessageTemplatesEditor />
      </div>
    </div>
  );
}
