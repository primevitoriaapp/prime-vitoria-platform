/** E-mail de boas-vindas ao Portal da empresa (gestor ou solicitante), com o link para criar a senha. */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

export type PortalWelcomeInput = {
  name: string;
  company: string;
  access: "gestor" | "solicitante";
  link: string;
  portalUrl: string;
  logoUrl: string;
  phones: string;
};

export function buildPortalWelcomeEmail(d: PortalWelcomeInput): { subject: string; text: string; html: string } {
  const first = d.name.trim().split(/\s+/)[0] || d.name;
  const items =
    d.access === "gestor"
      ? [
          "Pedir corridas e acompanhar cada atendimento em tempo real, com a linha do tempo completa (saída, chegada, embarque, finalização e KM).",
          "Cadastrar os funcionários da empresa e definir quem pode pedir corrida.",
          "Baixar relatórios, faturas detalhadas e boletos.",
          "Ter a gestão completa da mobilidade e da logística de transporte da sua empresa."
        ]
      : ["Pedir corridas para você e para a sua equipe.", "Acompanhar cada atendimento em tempo real, do motorista a caminho até a finalização.", "Consultar o histórico das suas corridas."];
  const subject = `Bem-vindo ao Portal Prime Vitória · ${d.company}`;
  const text = [
    `Olá, ${first}.`,
    "",
    `Seja bem-vindo(a) ao painel da ${d.company} na Prime Vitória. ${d.access === "gestor" ? "Você é o gestor da conta." : ""}`.trim(),
    "",
    "Por aqui você pode:",
    ...items.map((i) => `• ${i}`),
    "",
    "Para começar, crie a sua senha pelo link abaixo (vale por 7 dias):",
    d.link,
    "",
    `Depois, entre sempre em ${d.portalUrl} com este e-mail e a senha que você criou.`,
    "Se o link expirar, use “Esqueci minha senha” na tela de entrada.",
    "",
    "Equipe Prime Vitória",
    d.phones,
    "contato@primevitoria.com"
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;background:#F4F1EA;font-family:Arial,Helvetica,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EA;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden">
<tr><td style="background:#111;padding:20px 24px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td><img src="${esc(d.logoUrl)}" alt="Prime Vitória" height="56" style="display:block;border-radius:6px"></td>
    <td style="padding-left:14px;color:#C9A84C;font-size:11px;letter-spacing:2px">TRANSPORTE EXECUTIVO<br>MOBILIDADE CORPORATIVA</td>
  </tr></table>
</td></tr>
<tr><td style="height:4px;background:#C9A84C"></td></tr>
<tr><td style="padding:28px 28px 8px">
  <p style="margin:0 0 6px;font-size:13px;color:#7A6A3A;letter-spacing:1px;text-transform:uppercase">Portal da empresa</p>
  <h1 style="margin:0 0 14px;font-size:22px">Olá, ${esc(first)}. Seja bem-vindo(a)!</h1>
  <p style="margin:0 0 14px;font-size:15px;line-height:1.5">Este é o painel da <b>${esc(d.company)}</b> na Prime Vitória.${d.access === "gestor" ? " Você é o <b>gestor da conta</b>." : ""} Por aqui você pode:</p>
  <ul style="margin:0 0 18px;padding-left:20px;font-size:15px;line-height:1.6">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
  <p style="margin:0 0 18px;font-size:15px">Para começar, crie a sua senha:</p>
  <p style="margin:0 0 18px"><a href="${esc(d.link)}" style="background:#111;color:#C9A84C;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block">Criar minha senha e entrar</a></p>
  <p style="margin:0 0 6px;font-size:13px;color:#555">O link vale por 7 dias. Depois, entre sempre em <a href="${esc(d.portalUrl)}" style="color:#7A6A3A">${esc(d.portalUrl.replace(/^https?:\/\//, ""))}</a> com este e-mail e a senha que você criou.</p>
  <p style="margin:0 0 22px;font-size:13px;color:#555">Se o link expirar, use “Esqueci minha senha” na tela de entrada.</p>
</td></tr>
<tr><td style="border-top:2px solid #C9A84C;padding:16px 28px;font-size:13px;color:#555">
  <b style="color:#111">Equipe Prime Vitória</b><br>${esc(d.phones)} · contato@primevitoria.com
</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
