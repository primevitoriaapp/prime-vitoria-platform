"use client";

let baseTitle = "";

function ensureBaseTitle() {
  if (typeof document === "undefined") return;
  if (!baseTitle) {
    baseTitle = document.title.replace(/^🔴\s*/, "").replace(/^Nova corrida ·\s*/, "");
  }
}

/** Beep curto via Web Audio (sem ficheiro externo). */
export function playDriverAlertBeep(): void {
  if (typeof window === "undefined") return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
    void ctx.close();
  } catch {
    /* browsers podem bloquear AudioContext sem gesto do utilizador */
  }
}

export function vibrateDriverAlert(): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate([180, 80, 180]);
  }
}

export function setDriverTabAlertBadge(active: boolean): void {
  if (typeof document === "undefined") return;
  ensureBaseTitle();
  document.title = active ? `🔴 Nova corrida · ${baseTitle}` : baseTitle;
}

/** Som + vibração + badge no título da aba. */
export function notifyDriverNewAssignment(reason: "trip" | "offer"): void {
  playDriverAlertBeep();
  vibrateDriverAlert();
  setDriverTabAlertBadge(true);
  void reason;
}

export function clearDriverTabAlertBadge(): void {
  setDriverTabAlertBadge(false);
}
