"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { parsePerson, PEOPLE, personCredentials, PERSON_COOKIE } from "@/lib/auto-auth";
import { bootstrapHousehold } from "@/lib/bootstrap";
import { createClient } from "@/lib/supabase/server";

/** Troca quem está usando o app (David ↔ Paola), sem senha. */
export async function switchPerson(formData: FormData) {
  const person = parsePerson(String(formData.get("pessoa") ?? ""));
  const store = await cookies();
  store.set(PERSON_COOKIE, person, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  let { error } = await supabase.auth.signInWithPassword(await personCredentials(person));
  if (error) {
    // conta interna ausente ou com senha antiga: prepara de novo e tenta outra vez
    let problem: string | null = null;
    try {
      await bootstrapHousehold();
    } catch (e) {
      problem = (e as Error).message;
    }
    if (problem) redirect(`/diagnostico?erro=${encodeURIComponent(problem)}`);
    ({ error } = await supabase.auth.signInWithPassword(await personCredentials(person)));
    if (error) redirect(`/diagnostico?erro=${encodeURIComponent(`Não foi possível entrar como ${PEOPLE[person].name}: ${error.message}`)}`);
  }
  revalidatePath("/", "layout");
}
