/** Agrupa as corridas por voucher (NR) para fechar uma fatura por voucher. Função pura. */
export type VoucherTrip = {
  id: string;
  client_id: string;
  client_name: string;
  ref: string;
  scheduled_at: string;
  operational_status: string;
  client_amount: number | null;
  has_voucher: boolean;
  /** Aprovada pelo gestor (KM e valores conferidos). */
  approved?: boolean;
  /** Chave para juntar na fatura ("-" = separado). */
  merge_key?: string | null;
};

export type VoucherGroup = {
  key: string;
  client_id: string;
  client_name: string;
  ref: string;
  trips: VoucherTrip[];
  total: number;
  done: number;
  pending: number;
  ready: boolean;
  /** Concluídas mas ainda sem a aprovação do gestor. */
  to_approve: number;
  first_trip_id: string;
  has_voucher_file: boolean;
  last_at: string;
};

const SKIP = new Set(["cancelled", "rejected", "no_show"]);

export function baseRef(ref: string): string {
  return ref.trim().toUpperCase().split("-")[0] || ref.toUpperCase();
}

export function groupVouchers(trips: VoucherTrip[]): VoucherGroup[] {
  const map = new Map<string, VoucherGroup>();
  for (const t of trips) {
    if (SKIP.has(t.operational_status)) continue;
    const ref = baseRef(t.ref);
    const key = `${t.client_id}|${ref}`;
    let g = map.get(key);
    if (!g) {
      g = { key, client_id: t.client_id, client_name: t.client_name, ref, trips: [], total: 0, done: 0, pending: 0, ready: false, to_approve: 0, first_trip_id: "", has_voucher_file: false, last_at: t.scheduled_at };
      map.set(key, g);
    }
    g.trips.push(t);
    g.total = Math.round((g.total + (Number(t.client_amount) || 0)) * 100) / 100;
    if (t.operational_status === "completed") {
      g.done++;
      if (t.approved === false) g.to_approve++;
    }
    else g.pending++;
    if (t.has_voucher) g.has_voucher_file = true;
    if (t.scheduled_at > g.last_at) g.last_at = t.scheduled_at;
  }
  const out = [...map.values()];
  for (const g of out) {
    g.trips.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    g.ready = g.pending === 0 && g.done > 0 && g.to_approve === 0;
    g.first_trip_id = g.trips.find((t) => t.operational_status === "completed")?.id ?? g.trips[0].id;
  }
  // Prontos primeiro, depois pelo último serviço.
  return out.sort((a, b) => Number(b.ready) - Number(a.ready) || a.last_at.localeCompare(b.last_at));
}
