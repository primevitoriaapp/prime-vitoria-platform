import { NextResponse, type NextRequest } from "next/server";
import { asUserRole } from "@/lib/auth/role-from-claims";
import { resolveMiddlewareRole } from "@/lib/auth/middleware-role";
import type { UserRole } from "@/lib/domain/types";
import { getSessionFromSupabaseCookies } from "@/lib/supabase/middleware-session";
import { trustHeaderAuth } from "@/lib/server/trust-header-auth";

const protectedPrefixes: Array<{ prefix: string; allowedRoles: string[] }> = [
  { prefix: "/dashboard", allowedRoles: ["admin", "operador"] },
  { prefix: "/agenda", allowedRoles: ["admin", "operador"] },
  { prefix: "/clients", allowedRoles: ["admin", "operador"] },
  { prefix: "/drivers", allowedRoles: ["admin", "operador"] },
  { prefix: "/vehicles", allowedRoles: ["admin", "operador"] },
  { prefix: "/dispatch", allowedRoles: ["admin", "operador"] },
  { prefix: "/users", allowedRoles: ["admin", "operador"] },
  { prefix: "/audit", allowedRoles: ["admin", "operador", "financeiro"] },
  { prefix: "/finance", allowedRoles: ["admin", "financeiro"] },
  { prefix: "/configuracoes", allowedRoles: ["admin"] },
  { prefix: "/whatsapp", allowedRoles: ["admin", "operador"] },
  { prefix: "/categorias", allowedRoles: ["admin", "operador"] },
  { prefix: "/ao-vivo", allowedRoles: ["admin", "operador"] },
  { prefix: "/orcamentos", allowedRoles: ["admin", "operador"] },
  { prefix: "/parceiros", allowedRoles: ["admin", "operador"] },
  { prefix: "/importar", allowedRoles: ["admin"] },
  { prefix: "/integracoes", allowedRoles: ["admin"] },
  { prefix: "/painel-financeiro", allowedRoles: ["admin", "financeiro"] },
  { prefix: "/contas-a-pagar", allowedRoles: ["admin", "financeiro"] },
  { prefix: "/repasses", allowedRoles: ["admin", "financeiro"] },
  { prefix: "/conciliacao", allowedRoles: ["admin", "financeiro"] },
  { prefix: "/driver", allowedRoles: ["motorista", "admin"] },
  { prefix: "/client", allowedRoles: ["cliente", "admin"] }
];

/**
 * Endereços separados no domínio próprio:
 * primevitoria.com → site · motorista.primevitoria.com → app do motorista
 * empresa.primevitoria.com → portal do cliente · central.primevitoria.com → painel da equipe
 */
function routeByHost(request: NextRequest): NextResponse | null {
  const host = (request.headers.get("host") ?? "").toLowerCase().split(":")[0];
  if (!host.endsWith("primevitoria.com")) return null;
  const sub = host.replace(/\.?primevitoria\.com$/, "");
  const { pathname } = request.nextUrl;
  const url = request.nextUrl.clone();
  if (sub === "" || sub === "www") {
    const SITE_PATHS: Record<string, string> = { "/": "/site", "/en": "/site/en", "/es": "/site/es" };
    if (SITE_PATHS[pathname]) {
      url.pathname = SITE_PATHS[pathname];
      return NextResponse.rewrite(url);
    }
    // Endereço bonito: /site/en vira /en.
    if (pathname === "/site" || pathname.startsWith("/site/")) {
      url.pathname = pathname.replace(/^\/site/, "") || "/";
      return NextResponse.redirect(url, 308);
    }
    return null;
  }
  if (pathname !== "/") return null;
  const HOME: Record<string, string> = { motorista: "/driver", empresa: "/client", cliente: "/client", central: "/dashboard", painel: "/dashboard" };
  if (HOME[sub]) {
    url.pathname = HOME[sub];
    return NextResponse.redirect(url);
  }
  return null;
}

export async function middleware(request: NextRequest) {
  const byHost = routeByHost(request);
  if (byHost) return byHost;
  const allowHeaders = trustHeaderAuth();
  const headerRaw = request.headers.get("x-role");
  const headerRole = allowHeaders && headerRaw ? asUserRole(headerRaw) : null;

  let response = NextResponse.next({ request });
  let role: UserRole | "guest" | null = headerRole;

  if (!role) {
    const { user, response: cookieResponse } = await getSessionFromSupabaseCookies(request);
    response = cookieResponse;
    if (user) {
      role = await resolveMiddlewareRole(user);
    }
  }

  if (!role) {
    role = allowHeaders ? "admin" : "guest";
  }

  const pathname = request.nextUrl.pathname;

  const accept = request.headers.get("accept") ?? "";
  const wantsHtml = accept.includes("text/html");

  if (pathname === "/driver/login" || pathname.startsWith("/driver/login/")) {
    if (role === "motorista" && wantsHtml) {
      const url = request.nextUrl.clone();
      url.pathname = "/driver";
      return NextResponse.redirect(url);
    }
    return response;
  }

  for (const entry of protectedPrefixes) {
    if (pathname.startsWith(entry.prefix) && !entry.allowedRoles.includes(role)) {
      if (wantsHtml) {
        const url = request.nextUrl.clone();
        url.pathname = entry.prefix === "/driver" ? "/driver/login" : "/login";
        url.searchParams.set("next", pathname);
        return NextResponse.redirect(url);
      }
      return NextResponse.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "Role is not allowed for this route." }
        },
        { status: 403 }
      );
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/en",
    "/es",
    "/site/:path*",
    "/dashboard/:path*",
    "/agenda/:path*",
    "/clients/:path*",
    "/drivers/:path*",
    "/vehicles/:path*",
    "/dispatch/:path*",
    "/users",
    "/users/:path*",
    "/audit",
    "/audit/:path*",
    "/finance/:path*",
    "/configuracoes",
    "/configuracoes/:path*",
    "/whatsapp",
    "/whatsapp/:path*",
    "/categorias",
    "/categorias/:path*",
    "/ao-vivo/:path*",
    "/orcamentos/:path*",
    "/parceiros/:path*",
    "/importar/:path*",
    "/integracoes/:path*",
    "/painel-financeiro/:path*",
    "/contas-a-pagar/:path*",
    "/repasses/:path*",
    "/conciliacao/:path*",
    "/driver/:path*",
    "/client/:path*"
  ]
};
