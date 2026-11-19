"use client";

import { useEffect } from "react";

/** Nome da coluna em cada célula (data-label): no celular a tabela vira cartões "Coluna: valor". */
function labelTables() {
  document.querySelectorAll<HTMLTableElement>("table.pv-rtable").forEach((table) => {
    const heads = [...table.querySelectorAll("thead tr:last-child th, thead tr:last-child td")].map((th) => (th.textContent ?? "").trim());
    if (!heads.length) return;
    table.querySelectorAll<HTMLTableRowElement>("tbody tr, tfoot tr").forEach((tr) => {
      let col = 0;
      [...tr.cells].forEach((td) => {
        const span = td.colSpan || 1;
        const label = span > 1 ? "" : (heads[col] ?? "");
        if (td.getAttribute("data-label") !== label) td.setAttribute("data-label", label);
        col += span;
      });
    });
  });
}

/** Liga a etiqueta automática das tabelas marcadas com a classe pv-rtable (inclusive as que carregam depois). */
export function ResponsiveTables() {
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      if (t) clearTimeout(t);
      t = setTimeout(labelTables, 60);
    };
    run();
    const mo = new MutationObserver(run);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      if (t) clearTimeout(t);
    };
  }, []);
  return null;
}
