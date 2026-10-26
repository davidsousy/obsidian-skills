import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { parsePerson, personCredentials, PERSON_COOKIE, safeReturnPath } from "@/lib/auto-auth";
import { bootstrapHousehold } from "@/lib/bootstrap";
import { createClient } from "@/lib/supabase/server";

// Primeiro acesso (ou contas internas ausentes): prepara contas, casa e dados e entra no app.
export async function GET(request: NextRequest) {
  const back = safeReturnPath(request.nextUrl.searchParams.get("volta"));
  let problem: string | null = null;
  try {
    await bootstrapHousehold();
  } catch (e) {
    problem = (e as Error).message;
  }
  if (problem) redirect(`/diagnostico?erro=${encodeURIComponent(problem)}`);

  const supabase = await createClient();
  const person = parsePerson((await cookies()).get(PERSON_COOKIE)?.value);
  const { error } = await supabase.auth.signInWithPassword(await personCredentials(person));
  if (error) redirect(`/diagnostico?erro=${encodeURIComponent(`Não foi possível entrar automaticamente: ${error.message}`)}`);
  redirect(back);
}
