"use client";

import { playAlert } from "@/lib/client/sounds";

let baseTitle = "";

function ensureBaseTitle() {
  if (typeof document === "undefined") return;
  if (!baseTitle) {
    baseTitle = document.title.replace(/^🔴\s*/, "").replace(/^Nova corrida ·\s*/, "");
  }
}

/** Som de corrida nova (o antigo fechava o áudio antes de tocar — por isso ficava mudo). */
export function playDriverAlertBeep(): void {
  playAlert();
}

export function vibrateDriverAlert(): void {
  /* a vibração já sai junto com playAlert() */
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
