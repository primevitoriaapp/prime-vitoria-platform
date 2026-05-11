import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Le sessao Supabase dos cookies (middleware Edge) e devolve `response`
 * com cookies atualizados quando o SDK renovar a sessao.
 */
export async function getSessionFromSupabaseCookies(request: NextRequest): Promise<{
  user: User | null;
  response: NextResponse;
}> {
  let supabaseResponse = NextResponse.next({ request });

  if (!supabaseUrl || !anonKey) {
    return { user: null, response: supabaseResponse };
  }

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, cacheHeaders?: Record<string, string>) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options as CookieOptions | undefined)
        );
        if (cacheHeaders) {
          for (const [key, value] of Object.entries(cacheHeaders)) {
            supabaseResponse.headers.set(key, value);
          }
        }
      }
    }
  });

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, response: supabaseResponse };
  }

  return { user, response: supabaseResponse };
}
