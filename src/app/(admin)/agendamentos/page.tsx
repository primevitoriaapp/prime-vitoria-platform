import { redirect } from "next/navigation";

/** A lista de agendamentos agora é a própria Agenda. */
export default function AgendamentosPage() {
  redirect("/agenda");
}
