"use client";

import type { PdfWord } from "./voucher-types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";
let loader: Promise<any> | null = null;

function loadPdfJs(): Promise<any> {
  const w = window as any;
  if (w.pdfjsLib) return Promise.resolve(w.pdfjsLib);
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `${PDFJS}/pdf.min.js`;
    s.async = true;
    s.onload = () => {
      const lib = (window as any).pdfjsLib;
      if (!lib) return reject(new Error("pdfjs"));
      lib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.js`;
      resolve(lib);
    };
    s.onerror = () => {
      loader = null;
      reject(new Error("pdfjs"));
    };
    document.head.appendChild(s);
  });
  return loader;
}

/** Lê o PDF no navegador e devolve cada palavra com sua posição na página (nada sai do aparelho além do texto). */
export async function pdfToWords(file: File): Promise<PdfWord[]> {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: PdfWord[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 30); p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    for (const it of tc.items as { str: string; transform: number[]; width: number }[]) {
      const str = it.str ?? "";
      if (!str.trim()) continue;
      const x0 = it.transform[4];
      const y = Math.round((vp.height - it.transform[5]) * 10) / 10;
      const per = str.length ? it.width / str.length : 0;
      // Um trecho pode ter várias palavras: estima a posição de cada uma pela largura.
      const re = /\S+/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(str))) out.push({ page: p, x: Math.round((x0 + per * m.index) * 10) / 10, y, text: m[0] });
    }
  }
  return out;
}
