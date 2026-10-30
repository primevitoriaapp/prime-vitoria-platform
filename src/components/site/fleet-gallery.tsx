"use client";

import { useRef, useState } from "react";

/** Fotos de uma categoria da frota: arrasta para o lado no celular, setas no computador. */
export function FleetGallery({ photos, alt }: { photos: string[]; alt: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const go = (n: number) => {
    const el = ref.current;
    if (!el) return;
    const k = (n + photos.length) % photos.length;
    el.scrollTo({ left: k * el.clientWidth, behavior: "smooth" });
  };
  return (
    <div className="group relative">
      <div
        ref={ref}
        onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {photos.map((src, k) => (
          <img key={src} src={src} alt={k === 0 ? alt : ""} loading="lazy" className="h-full w-full shrink-0 snap-center object-cover" />
        ))}
      </div>
      {photos.length > 1 ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {photos.map((_, k) => (
              <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? "w-4 bg-white" : "w-1.5 bg-white/60"}`} />
            ))}
          </div>
          <button type="button" aria-label="Foto anterior" onClick={() => go(i - 1)} className="absolute left-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-[#111] shadow group-hover:flex">
            ‹
          </button>
          <button type="button" aria-label="Próxima foto" onClick={() => go(i + 1)} className="absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-[#111] shadow group-hover:flex">
            ›
          </button>
        </>
      ) : null}
    </div>
  );
}
