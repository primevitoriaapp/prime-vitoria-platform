"use client";

/**
 * Sons do sistema (sem arquivo externo). Um único AudioContext, liberado no primeiro toque/clique
 * — navegadores (principalmente iPhone) só deixam tocar som depois de um gesto da pessoa.
 * Obs.: no iPhone, a chave de silencioso lateral também cala o som da página.
 */
let ctx: AudioContext | null = null;
let installed = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    try {
      ctx = new Ctx();
    } catch {
      return null;
    }
  }
  return ctx;
}

function unlock() {
  const c = getCtx();
  if (!c) return;
  void c.resume().catch(() => undefined);
  try {
    // iOS: tocar um buffer mudo dentro do gesto destrava o áudio da página.
    const buf = c.createBuffer(1, 1, 22050);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
  } catch {
    /* ignora */
  }
}

/** Chame uma vez (no layout): destrava o som no primeiro toque, clique ou tecla. */
export function installSoundUnlock(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const handler = () => unlock();
  for (const ev of ["pointerdown", "touchend", "keydown"]) window.addEventListener(ev, handler, { passive: true });
  // Volta da tela bloqueada / outra aba: o iPhone suspende o áudio.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void ctx?.resume().catch(() => undefined);
  });
}

export function soundReady(): boolean {
  return ctx?.state === "running";
}

type Note = { f: number; at: number; dur?: number; vol?: number };

function play(notes: Note[]): void {
  const c = getCtx();
  if (!c) return;
  if (c.state !== "running") void c.resume().catch(() => undefined);
  const now = c.currentTime + 0.02;
  for (const n of notes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    const dur = n.dur ?? 0.32;
    osc.type = "sine";
    osc.frequency.value = n.f;
    gain.gain.setValueAtTime(0.0001, now + n.at);
    gain.gain.exponentialRampToValueAtTime(n.vol ?? 0.5, now + n.at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + n.at + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(now + n.at);
    osc.stop(now + n.at + dur + 0.05);
  }
}

function vibrate(pattern: number[]) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
  } catch {
    /* iPhone não vibra pelo navegador */
  }
}

/** Campainha: aviso novo no painel (sino). */
export function playNotify(): void {
  play([
    { f: 880, at: 0 },
    { f: 1174.66, at: 0.16, dur: 0.45 }
  ]);
}

/** Alerta forte: corrida/oferta nova para o motorista (toca 2x). */
export function playAlert(): void {
  play([0, 0.7].flatMap((b) => [
    { f: 659.25, at: b, vol: 0.7 },
    { f: 880, at: b + 0.16, vol: 0.7 },
    { f: 1318.5, at: b + 0.32, vol: 0.6, dur: 0.4 }
  ]));
  vibrate([220, 90, 220, 90, 320]);
}

/** Confirmação: etapa feita com sucesso (cheguei, iniciei, finalizei). */
export function playSuccess(): void {
  play([
    { f: 523.25, at: 0, dur: 0.18 },
    { f: 659.25, at: 0.1, dur: 0.18 },
    { f: 783.99, at: 0.2, dur: 0.4 }
  ]);
  vibrate([60, 40, 120]);
}

/** Erro: não deu certo, precisa olhar a tela. */
export function playError(): void {
  play([
    { f: 330, at: 0, dur: 0.22, vol: 0.5 },
    { f: 247, at: 0.2, dur: 0.35, vol: 0.5 }
  ]);
  vibrate([300]);
}
