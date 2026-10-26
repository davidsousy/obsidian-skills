import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Volta do link de confirmação de e-mail do Supabase (?code=...). Troca o código por uma sessão;
// se não der (link aberto em outro aparelho, expirado…), manda para o login com uma mensagem.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  if (params.get("error_description")) {
    redirect(`/entrar?erro=${encodeURIComponent("O link de confirmação é inválido ou expirou. Entre ou crie a conta de novo.")}`);
  }
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect("/casa");
  }
  redirect(`/entrar?ok=${encodeURIComponent("E-mail confirmado. Agora entre com seu e-mail e senha.")}`);
}
