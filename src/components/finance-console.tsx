"use client";

import { FormEvent, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

export function FinanceConsole() {
  const [tripId, setTripId] = useState("");
  const [amountClient, setAmountClient] = useState("0");
  const [amountDriver, setAmountDriver] = useState("0");
  const [tolls, setTolls] = useState("0");
  const [parking, setParking] = useState("0");
  const [extras, setExtras] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [message, setMessage] = useState<string | null>(null);

  async function onGenerate(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const response = await fetchWithSupabaseSession(
      `/api/finance/trips/${tripId}/generate`,
      {
        method: "POST",
        body: JSON.stringify({
          amount_client: Number(amountClient),
          amount_driver: Number(amountDriver),
          tolls: Number(tolls),
          parking: Number(parking),
          extras: Number(extras),
          discount: Number(discount)
        })
      },
      "financeiro"
    );
    const body = await response.json();
    if (!response.ok || !body.success) {
      setMessage(body.error?.message ?? "Falha no financeiro.");
      return;
    }
    setMessage(`Financeiro gerado. Margem: ${body.data.net_margin}`);
  }

  return (
    <section className="card">
      <h2>Geracao financeira por corrida</h2>
      <form className="grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }} onSubmit={onGenerate}>
        <input value={tripId} onChange={(event) => setTripId(event.target.value)} placeholder="Trip ID" required />
        <input value={amountClient} onChange={(event) => setAmountClient(event.target.value)} placeholder="Valor cliente" type="number" />
        <input value={amountDriver} onChange={(event) => setAmountDriver(event.target.value)} placeholder="Valor motorista" type="number" />
        <input value={tolls} onChange={(event) => setTolls(event.target.value)} placeholder="Pedagio" type="number" />
        <input value={parking} onChange={(event) => setParking(event.target.value)} placeholder="Estacionamento" type="number" />
        <input value={extras} onChange={(event) => setExtras(event.target.value)} placeholder="Extras" type="number" />
        <input value={discount} onChange={(event) => setDiscount(event.target.value)} placeholder="Desconto" type="number" />
        <button type="submit">Gerar financeiro</button>
      </form>
      {message ? <p>{message}</p> : null}
    </section>
  );
}
