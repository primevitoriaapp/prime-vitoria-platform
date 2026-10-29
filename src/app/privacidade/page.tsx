import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacidade e termos de uso · Prime Vitória" };

const H = ({ children }: { children: React.ReactNode }) => <h2 className="mt-8 text-lg font-semibold text-[#111]">{children}</h2>;

/** Política de privacidade (LGPD) e termos de uso da plataforma Prime Vitória. */
export default function PrivacidadePage() {
  return (
    <div className="min-h-dvh bg-[#F4F1EA]">
      <header className="bg-[#111] px-5 py-5 text-center">
        <p className="text-lg font-bold tracking-[0.08em] text-[#fff]">
          PRIME <span className="text-[#C9A84C]">VITÓRIA</span>
        </p>
        <p className="text-[10px] tracking-[0.28em] text-[#C9A84C]">TRANSPORTE EXECUTIVO</p>
      </header>
      <div className="h-1 bg-[#C9A84C]" />
      <main className="mx-auto max-w-3xl px-5 py-8 text-[15px] leading-relaxed text-[#333]">
        <h1 className="text-2xl font-semibold text-[#111]">Privacidade e termos de uso</h1>
        <p className="mt-1 text-sm text-[#777]">Última atualização: outubro de 2026</p>

        <H>1. Quem somos</H>
        <p>
          Esta plataforma é operada pela <b>R J Prime Transporte LTDA</b> (Prime Vitória), CNPJ 49.126.277/0001-54, com sede em Vitória/ES, em conjunto com as
          empresas do grupo Prime Locadora &amp; Serviços LTDA (CNPJ 65.710.916/0001-80) e Ilha Prime Fretamento e Turismo LTDA (CNPJ 65.020.288/0001-01). Somos
          os responsáveis (controladores) pelos dados tratados aqui, nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018).
        </p>

        <H>2. Quais dados usamos</H>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <b>Clientes e passageiros:</b> nome, telefone, e-mail, CPF ou CNPJ, endereços de embarque e destino, número de voo, nome de quem solicitou e centro de
            custo da empresa.
          </li>
          <li>
            <b>Durante a corrida:</b> localização do veículo (para o acompanhamento em tempo real), horários de cada etapa, quilometragem e, em corridas de
            empresa, a assinatura do passageiro confirmando o serviço.
          </li>
          <li>
            <b>Motoristas e parceiros:</b> dados cadastrais, CNH, dados do veículo, chave PIX e dados bancários para repasse, e a localização do celular enquanto
            há corrida em andamento.
          </li>
          <li>
            <b>Uso do sistema:</b> registros de acesso e das ações realizadas (para segurança e auditoria).
          </li>
        </ul>

        <H>3. Para que usamos</H>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Agendar, executar e acompanhar os serviços de transporte contratados.</li>
          <li>Avisar o passageiro e a empresa sobre motorista, veículo e andamento da corrida.</li>
          <li>Faturar, cobrar, emitir notas fiscais e pagar motoristas e parceiros.</li>
          <li>Comprovar a prestação do serviço (horários, quilometragem e assinatura).</li>
          <li>Cumprir obrigações legais, fiscais e contratuais, e garantir a segurança de todos.</li>
        </ul>
        <p className="mt-2">Não vendemos dados pessoais e não os usamos para publicidade de terceiros.</p>

        <H>4. Com quem compartilhamos</H>
        <p>
          Somente o necessário para prestar o serviço: o motorista e o parceiro designados recebem nome, telefone e trajeto do passageiro; a empresa contratante
          vê as corridas dos seus colaboradores; e usamos fornecedores de tecnologia (hospedagem, banco de dados, mapas e envio de mensagens) que tratam os dados
          em nosso nome, sob contrato e com medidas de segurança.
        </p>

        <H>5. Localização</H>
        <p>
          A localização do motorista é coletada só enquanto há corrida em andamento, para o passageiro acompanhar o carro e para medir a distância percorrida. O
          link de acompanhamento enviado ao passageiro deixa de funcionar quando a corrida termina.
        </p>

        <H>6. Por quanto tempo guardamos</H>
        <p>
          Pelo tempo necessário para prestar o serviço e cumprir obrigações legais e fiscais (em geral, 5 anos para documentos fiscais e financeiros). Depois disso,
          os dados são apagados ou tornados anônimos.
        </p>

        <H>7. Seus direitos</H>
        <p>
          Você pode pedir a qualquer momento: confirmação de que tratamos seus dados, acesso, correção, anonimização ou exclusão (quando a lei permitir),
          portabilidade e informações sobre compartilhamento. Basta escrever para <b>contato@primevitoria.com</b>.
        </p>

        <H>8. Segurança</H>
        <p>
          O acesso ao sistema é feito com login individual e cada perfil vê apenas o que precisa. As conexões são criptografadas e as ações importantes ficam
          registradas.
        </p>

        <H>9. Termos de uso</H>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>O acesso é pessoal; não compartilhe sua senha ou PIN.</li>
          <li>As informações de corridas, valores e passageiros são confidenciais e só podem ser usadas para a prestação do serviço.</li>
          <li>Valores, prazos e condições de cada serviço seguem o orçamento aprovado ou o contrato com a empresa cliente.</li>
          <li>Motoristas e parceiros devem manter documentos, veículo e dados bancários atualizados e registrar corretamente cada etapa da corrida.</li>
          <li>O uso indevido pode levar ao bloqueio do acesso.</li>
        </ul>

        <H>10. Contato</H>
        <p>
          Dúvidas sobre privacidade: <b>contato@primevitoria.com</b> · Rua Amélia da Cunha Ornellas, 89, Bento Ferreira, Vitória/ES.
        </p>

        <p className="mt-10 text-sm">
          <Link href="/" className="text-[#7A6A3A] underline">
            Voltar
          </Link>
        </p>
      </main>
    </div>
  );
}
