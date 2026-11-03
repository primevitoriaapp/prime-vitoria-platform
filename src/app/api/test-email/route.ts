import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/server/session";
import { resolveEmailFrom, sendOperationalEmail } from "@/lib/notifications/send-email";

/** Teste de envio (só administrador): manda um e-mail para as duas caixas da Prime. */
export async function GET() {
  const s = await getSessionContext();
  if (s.role !== "admin") return NextResponse.json({ error: "Só o administrador." }, { status: 403 });
  const from = resolveEmailFrom();
  const result = await sendOperationalEmail({
    to: ["contato@primevitoria.com", "contatoprimevix@gmail.com"],
    subject: "Teste Prime Vitória — e-mail pelo domínio próprio",
    text: `Se você recebeu este e-mail, o envio pelo domínio primevitoria.com está funcionando.\nRemetente: ${from}`,
    html: `<p>Se você recebeu este e-mail, o envio pelo domínio <b>primevitoria.com</b> está funcionando.</p><p style="color:#666">Remetente: ${from.replace(/</g, "&lt;")}</p>`
  });
  return NextResponse.json(
    result.ok
      ? { ok: true, mensagem: "Enviado. Confira contato@primevitoria.com e contatoprimevix@gmail.com (olhe também o spam).", from }
      : { ok: false, motivo: result.reason, from },
    { status: result.ok ? 200 : 502 }
  );
}
