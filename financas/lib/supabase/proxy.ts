import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfigured, supabasePublicKey, supabaseUrl } from "./env";

const PUBLIC_PATHS = ["/entrar", "/api/cron", "/configurar"];

/** Renova a sessão do Supabase a cada request e manda quem não está logado para /entrar. */
export async function updateSession(request: NextRequest) {
  // Sem Supabase configurado: mostra a página de configuração em vez de quebrar.
  if (!supabaseConfigured()) {
    if (request.nextUrl.pathname.startsWith("/configurar")) return NextResponse.next({ request });
    const url = request.nextUrl.clone();
    url.pathname = "/configurar";
    url.search = "";
    return NextResponse.redirect(url);
  }
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseUrl()!,
    supabasePublicKey()!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!data?.claims && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
