import { NextResponse, type NextRequest } from "next/server";
import { asUserRole, roleFromJwtClaims } from "@/lib/auth/role-from-claims";
import type { UserRole } from "@/lib/domain/types";
import { getSessionFromSupabaseCookies } from "@/lib/supabase/middleware-session";
import { trustHeaderAuth } from "@/lib/server/trust-header-auth";

const protectedPrefixes: Array<{ prefix: string; allowedRoles: string[] }> = [
  { prefix: "/dashboard", allowedRoles: ["admin", "operador"] },
  { prefix: "/agenda", allowedRoles: ["admin", "operador"] },
  { prefix: "/dispatch", allowedRoles: ["admin", "operador"] },
  { prefix: "/users", allowedRoles: ["admin", "operador"] },
  { prefix: "/audit", allowedRoles: ["admin", "operador", "financeiro"] },
  { prefix: "/finance", allowedRoles: ["admin", "financeiro"] },
  { prefix: "/driver", allowedRoles: ["motorista", "admin"] },
  { prefix: "/client", allowedRoles: ["cliente", "admin"] }
];

export async function middleware(request: NextRequest) {
  const allowHeaders = trustHeaderAuth();
  const headerRaw = request.headers.get("x-role");
  const headerRole = allowHeaders && headerRaw ? asUserRole(headerRaw) : null;

  let response = NextResponse.next({ request });
  let role: UserRole | "guest" | null = headerRole;

  if (!role) {
    const { user, response: cookieResponse } = await getSessionFromSupabaseCookies(request);
    response = cookieResponse;
    if (user) {
      role = roleFromJwtClaims(user);
    }
  }

  if (!role) {
    role = allowHeaders ? "admin" : "guest";
  }

  const pathname = request.nextUrl.pathname;

  const accept = request.headers.get("accept") ?? "";
  const wantsHtml = accept.includes("text/html");

  for (const entry of protectedPrefixes) {
    if (pathname.startsWith(entry.prefix) && !entry.allowedRoles.includes(role)) {
      if (wantsHtml) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
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
    "/dashboard/:path*",
    "/agenda/:path*",
    "/dispatch/:path*",
    "/users",
    "/users/:path*",
    "/audit",
    "/audit/:path*",
    "/finance/:path*",
    "/driver/:path*",
    "/client/:path*"
  ]
};
