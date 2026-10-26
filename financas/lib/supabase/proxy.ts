import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { parsePerson, personCredentials, PERSON_COOKIE } from "@/lib/auto-auth";
import { supabaseConfigured, supabasePublicKey, supabaseUrl } from "./env";

// Rotas que funcionam sem sessão.
const PUBLIC_PATHS = ["/iniciar", "/api/cron", "/configurar", "/diagnostico"];

/**
 * Renova a sessão do Supabase a cada request. Sem sessão, entra sozinho com a conta interna
 * escolhida no seletor (David por padrão); se ainda não houver contas/casa, manda para /iniciar.
 */
export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  // Sem Supabase configurado: mostra a página de configuração em vez de quebrar.
  if (!supabaseConfigured()) {
    if (path.startsWith("/configurar") || path.startsWith("/diagnostico")) return NextResponse.next({ request });
    const url = request.nextUrl.clone();
    url.pathname = "/configurar";
    url.search = "";
    return NextResponse.redirect(url);
  }
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl()!, supabasePublicKey()!, {
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
  });

  const { data } = await supabase.auth.getClaims();
  if (data?.claims || isPublic) return response;

  // Sem sessão: entra com a conta interna (sem tela de login).
  const person = parsePerson(request.cookies.get(PERSON_COOKIE)?.value);
  let signedIn = false;
  try {
    const { error } = await supabase.auth.signInWithPassword(await personCredentials(person));
    signedIn = !error;
  } catch {
    signedIn = false;
  }
  if (signedIn) return response;

  const url = request.nextUrl.clone();
  url.pathname = "/iniciar";
  url.search = `?volta=${encodeURIComponent(path + request.nextUrl.search)}`;
  return NextResponse.redirect(url);
}
