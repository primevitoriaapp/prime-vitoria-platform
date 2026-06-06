/** Parâmetros de listagem para a agenda operacional (GET /api/trips). */
export function buildAgendaTripsSearchParams(input: {
  scheduledFrom: string;
  scheduledTo: string;
  pageSize?: number;
}): URLSearchParams {
  return new URLSearchParams({
    page: "1",
    pageSize: String(input.pageSize ?? 250),
    agenda: "1",
    scheduledFrom: input.scheduledFrom,
    scheduledTo: input.scheduledTo
  });
}
