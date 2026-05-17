export type BestEffortResult = { ok: true } | { ok: false; message: string };

/** Executa efeito colateral sem bloquear o fluxo principal. */
export async function runBestEffort(label: string, task: () => Promise<unknown>): Promise<BestEffortResult> {
  try {
    await task();
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[best_effort]", label, message);
    return { ok: false, message };
  }
}
