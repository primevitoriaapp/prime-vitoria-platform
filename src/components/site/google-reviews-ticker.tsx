"use client";

import { useEffect, useState } from "react";
import type { GoogleReviewsData } from "@/lib/integrations/google-reviews";

type Props = { data: GoogleReviewsData; reviewsUrl: string; label: { reviews: string; close: string } };

/** Selo flutuante com as avaliações do Google passando uma a uma. */
export function GoogleReviewsTicker({ data, reviewsUrl, label }: Props) {
  const [i, setI] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [show, setShow] = useState(false);
  const n = data.reviews.length;

  // Aparece depois que a pessoa passa da foto do topo, para não cobrir a chamada principal.
  useEffect(() => {
    const on = () => {
      if (window.scrollY > window.innerHeight * 0.6) setShow(true);
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    if (n < 2) return;
    const t = window.setInterval(() => setI((v) => (v + 1) % n), 6500);
    return () => window.clearInterval(t);
  }, [n]);

  if (hidden || !show || n === 0) return null;
  const r = data.reviews[i];
  return (
    <div className="pv-float-in fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-4 z-40 w-[min(330px,calc(100vw-6.5rem))]">
      <div className="relative rounded-[22px] border border-[#ECE7DB] bg-white/95 p-3.5 pr-8 shadow-[0_18px_40px_rgba(0,0,0,0.16)] backdrop-blur">
        <button type="button" onClick={() => setHidden(true)} aria-label={label.close} className="absolute right-2.5 top-2 text-lg leading-none text-[#B5B0A5]">
          ×
        </button>
        <a href={reviewsUrl} target="_blank" rel="noopener noreferrer" className="block">
          <div className="flex items-center gap-2 text-xs">
            <GoogleG />
            <span className="font-semibold text-[#111]">{data.rating != null ? data.rating.toFixed(1).replace(".", ",") : "5,0"}</span>
            <span className="text-[#E2B33C]">★★★★★</span>
            {data.total ? <span className="text-[#8A8A8A]">· {data.total} {label.reviews}</span> : null}
          </div>
          <div key={i} className="pv-review-in mt-2">
            <p className="line-clamp-3 text-[13px] leading-snug text-[#333]">“{r.text}”</p>
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[#8A8A8A]">
              {r.photo ? <img src={r.photo} alt="" width={16} height={16} className="h-4 w-4 rounded-full" referrerPolicy="no-referrer" /> : null}
              <span className="font-medium text-[#555]">{r.author}</span>
              {r.when ? <span>· {r.when}</span> : null}
            </p>
          </div>
        </a>
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="14" height="14" viewBox="0 0 48 48" aria-label="Google">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
