"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { id: "inicio", href: "/driver", label: "Início", icon: "⌂" },
  { id: "corridas", href: "/driver#corridas", label: "Corridas", icon: "◎" },
  { id: "carteira", href: "/driver#carteira", label: "Carteira", icon: "◈" },
  { id: "perfil", href: "/driver#push-setup", label: "Perfil", icon: "◉" }
] as const;

export function DriverBottomNav() {
  const pathname = usePathname();
  if (!pathname.startsWith("/driver")) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-prime-border bg-prime-card/95 shadow-prime-card backdrop-blur md:hidden"
      aria-label="Navegação motorista"
    >
      <ul className="mx-auto flex max-w-lg justify-around px-2 py-2">
        {TABS.map((tab) => (
          <li key={tab.id}>
            <Link
              href={tab.href}
              className="flex min-w-[4rem] flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-prime-muted hover:text-prime-gold"
            >
              <span className="text-base leading-none" aria-hidden>
                {tab.icon}
              </span>
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
