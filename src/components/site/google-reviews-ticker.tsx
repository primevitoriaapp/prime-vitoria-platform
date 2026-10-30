"use client";

import { useEffect, useState } from "react";
import type { GoogleReviewsData } from "@/lib/integrations/google-reviews";

type Props = { data: GoogleReviewsData; reviewsUrl: string; label: { reviews: string; close: string } };

/** Avaliações do Google passando uma a uma, dentro da seção de avaliações. */
export function GoogleReviewsTicker({ data, reviewsUrl, label }: Props) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = data.reviews.length;

  useEffect(() => {
    if (n < 2 || paused) return;
    const t = window.setInterval(() => setI((v) => (v + 1) % n), 7000);
    return () => window.clearInterval(t);
  }, [n, paused]);

  if (n === 0) return null;
  const r = data.reviews[i];
  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} className="rounded-[24px] bg-[#F7F5F0] p-5">
      <a href={reviewsUrl} target="_blank" rel="noopener noreferrer" className="block">
        <div className="flex items-center gap-2 text-xs">
          <GoogleG />
          <span className="text-[#E2B33C]">{"★".repeat(Math.round(r.rating))}</span>
          {r.when ? <span className="text-[#8A8A8A]">· {r.when}</span> : null}
        </div>
        <div key={i} className="pv-review-in mt-3 min-h-[7.5rem]">
          <p className="line-clamp-5 text-[15px] leading-relaxed text-[#333]">“{r.text}”</p>
          <p className="mt-3 flex items-center gap-2 text-sm">
            {r.photo ? <img src={r.photo} alt="" width={24} height={24} className="h-6 w-6 rounded-full" referrerPolicy="no-referrer" /> : null}
            <span className="font-semibold text-[#111]">{r.author}</span>
          </p>
        </div>
      </a>
      {n > 1 ? (
        <div className="mt-4 flex gap-1.5" role="tablist" aria-label={label.reviews}>
          {data.reviews.map((_, k) => (
            <button
              key={k}
              type="button"
              aria-label={`${k + 1}`}
              onClick={() => setI(k)}
              className={`h-1.5 rounded-full transition-all ${k === i ? "w-6 bg-[#111]" : "w-1.5 bg-[#D9CFB8]"}`}
            />
          ))}
        </div>
      ) : null}
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
