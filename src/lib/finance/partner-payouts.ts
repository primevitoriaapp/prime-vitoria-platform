/** Repasses agrupados por parceiro (empresa PJ, pessoa PF ou motorista avulso). Funções puras. */

export type PayoutRow = {
  id: string;
  amount: number;
  status: string; // open | paid | cancelled
  paid_at: string | null;
  due_date: string | null;
  released: boolean; // cliente já pagou a Prime
  trip_id: string;
  trip_at: string | null;
  route: string;
  client_name: string;
  driver_id: string;
  driver_name: string;
  partner_id: string | null;
};

export type PayoutOwner = { id: string; kind: "PJ" | "PF" | "avulso"; name: string; document: string | null; pix_key: string | null; phone: string | null };

export type PayoutGroup = PayoutOwner & {
  key: string;
  rows: PayoutRow[];
  drivers: string[];
  released: number;
  waiting: number;
  paid: number;
  openCount: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function groupPayouts(rows: PayoutRow[], partners: Map<string, PayoutOwner>, drivers: Map<string, PayoutOwner>): PayoutGroup[] {
  const groups = new Map<string, PayoutGroup>();
  for (const r of rows) {
    if (r.status === "cancelled") continue;
    const owner = (r.partner_id && partners.get(r.partner_id)) || drivers.get(r.driver_id) || { id: r.driver_id, kind: "avulso" as const, name: r.driver_name, document: null, pix_key: null, phone: null };
    const key = r.partner_id && partners.has(r.partner_id) ? `p:${r.partner_id}` : `d:${r.driver_id}`;
    const g = groups.get(key) ?? { ...owner, key, rows: [], drivers: [], released: 0, waiting: 0, paid: 0, openCount: 0 };
    g.rows.push(r);
    if (!g.drivers.includes(r.driver_name)) g.drivers.push(r.driver_name);
    if (r.status === "paid") g.paid = r2(g.paid + r.amount);
    else {
      g.openCount += 1;
      if (r.released) g.released = r2(g.released + r.amount);
      else g.waiting = r2(g.waiting + r.amount);
    }
    groups.set(key, g);
  }
  for (const g of groups.values()) g.rows.sort((a, b) => String(a.trip_at).localeCompare(String(b.trip_at)));
  return [...groups.values()].sort((a, b) => b.released - a.released || b.waiting - a.waiting || a.name.localeCompare(b.name));
}

/** Texto do extrato para mandar ao parceiro pelo WhatsApp. */
export function payoutStatementText(g: PayoutGroup, onlyIds?: Set<string>): string {
  const rows = g.rows.filter((r) => r.status !== "paid" && (!onlyIds || onlyIds.has(r.id)));
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const when = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
  const lines = rows.map((r) => `• ${when(r.trip_at)} · ${r.client_name} · ${r.route}${g.drivers.length > 1 ? ` · ${r.driver_name}` : ""} — ${brl(r.amount)}`);
  const total = r2(rows.reduce((s, r) => s + r.amount, 0));
  return [`*Prime Vitória · Extrato de repasse*`, g.name, "", ...lines, "", `*Total: ${brl(total)}* (${rows.length} serviço(s))`, g.pix_key ? `PIX: ${g.pix_key}` : ""]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n")
    .trim();
}
