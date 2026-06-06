import { NextResponse } from "next/server"

export async function GET() {
  const apiKey = process.env.RESEND_API_KEY
  
  if (!apiKey) {
    return NextResponse.json({ error: "RESEND_API_KEY não configurada" }, { status: 503 })
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "onboarding@resend.dev",
      to: "contatoprimevix@gmail.com",
      subject: "Teste Prime Vitória",
      html: "<p>Email de teste funcionando!</p>"
    })
  })

  const data = await res.json()
  return NextResponse.json({ status: res.status, data, apiKeyLength: apiKey.length })
}
