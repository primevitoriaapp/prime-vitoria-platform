import { db } from "../server/db";

export type EnqueueNotificationOptions = {
  /** Mesmo valor em varios jobs para permitir rollback em lote (ex.: oferta a varios motoristas). */
  correlation_id?: string;
};

export async function enqueueNotificationJob(
  payload: Record<string, unknown>,
  options?: EnqueueNotificationOptions
) {
  const correlation_id = options?.correlation_id ?? crypto.randomUUID();

  const { error } = await db.from("notification_jobs").insert({
    type: "notification.send",
    payload,
    status: "queued",
    attempt_count: 0,
    max_attempts: 5,
    correlation_id
  });

  if (error) {
    throw new Error(error.message);
  }
}
