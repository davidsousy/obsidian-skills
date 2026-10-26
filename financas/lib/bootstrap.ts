// Primeiro acesso: garante as contas internas (David e Paola), a casa e os dados iniciais.
// Idempotente e tolerante a dois primeiros acessos ao mesmo tempo.

import type { SupabaseClient } from "@supabase/supabase-js";
import { PEOPLE, personCredentials, type Person } from "@/lib/auto-auth";
import { addMonths, endOfMonthISO, monthStart, todayISO } from "@/lib/finance/dates";
import { createAdminClient, createPlainClient } from "@/lib/supabase/admin";

export class SetupError extends Error {}

// "já pertence" ou, em primeiros acessos simultâneos, a chave única de household_members
// (o outro acesso acabou de colocar a pessoa na casa)
const ALREADY_IN_HOUSE = /já pertence a uma casa|unique constraint "household_members_/i;
const ALREADY_SEEDED = /já tem (dívidas|custos)/i;

function setupMessage(message: string): string {
  if (/relation .* does not exist|could not find the (table|function)|schema cache/i.test(message)) {
    return "O banco ainda não foi preparado: rode o arquivo supabase/setup.sql no SQL Editor do Supabase.";
  }
  return message;
}

async function findUserId(admin: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new SetupError(error.message);
    const user = data.users.find((u) => u.email?.toLowerCase() === email);
    if (user) return user.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** Garante que a conta interna existe com a senha atual; devolve um cliente já autenticado. */
async function ensurePerson(admin: SupabaseClient, person: Person): Promise<{ id: string; client: SupabaseClient }> {
  const creds = await personCredentials(person);
  const client = createPlainClient();
  let signIn = await client.auth.signInWithPassword(creds);
  if (signIn.error) {
    const created = await admin.auth.admin.createUser({ ...creds, email_confirm: true, user_metadata: { name: PEOPLE[person].name } });
    if (created.error) {
      // já existe (senha antiga ou criada por outro acesso ao mesmo tempo): atualiza a senha
      const id = await findUserId(admin, creds.email);
      if (!id) throw new SetupError(`Não foi possível criar a conta interna de ${PEOPLE[person].name}: ${created.error.message}`);
      const updated = await admin.auth.admin.updateUserById(id, { password: creds.password, email_confirm: true });
      if (updated.error) throw new SetupError(updated.error.message);
    }
    signIn = await client.auth.signInWithPassword(creds);
    if (signIn.error) throw new SetupError(`Não foi possível entrar como ${PEOPLE[person].name}: ${signIn.error.message}`);
  }
  return { id: signIn.data.user.id, client };
}

async function householdOf(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await admin.from("household_members").select("household_id").eq("user_id", userId).maybeSingle();
  if (error) throw new SetupError(setupMessage(error.message));
  return data?.household_id ?? null;
}

export async function bootstrapHousehold(): Promise<{ householdId: string; created: boolean }> {
  const admin = createAdminClient();
  if (!admin) throw new SetupError("Faltam as variáveis do Supabase na Vercel (URL e chave secreta).");

  const david = await ensurePerson(admin, "david");
  const paola = await ensurePerson(admin, "paola");

  // casa: a das contas internas; senão a mais antiga do banco; senão cria uma nova
  let householdId = (await householdOf(admin, david.id)) ?? (await householdOf(admin, paola.id));
  if (!householdId) {
    const { data, error } = await admin.from("households").select("id").order("created_at").limit(1);
    if (error) throw new SetupError(setupMessage(error.message));
    householdId = data?.[0]?.id ?? null;
  }

  let created = false;
  if (!householdId) {
    const { data, error } = await david.client.rpc("create_household", {
      p_name: "Casa David & Paola",
      p_display_name: PEOPLE.david.name,
    });
    if (error && !ALREADY_IN_HOUSE.test(error.message)) throw new SetupError(setupMessage(error.message));
    householdId = (data as string | null) ?? (await householdOf(admin, david.id));
    created = !error;
  }
  if (!householdId) throw new SetupError("Não foi possível criar a casa.");

  const { data: house, error: houseError } = await admin
    .from("households")
    .select("invite_code, target_date")
    .eq("id", householdId)
    .single();
  if (houseError) throw new SetupError(setupMessage(houseError.message));

  for (const [person, info] of [["david", david], ["paola", paola]] as const) {
    if ((await householdOf(admin, info.id)) === householdId) continue;
    const { error } = await info.client.rpc("join_household", {
      p_invite_code: house.invite_code,
      p_display_name: PEOPLE[person].name,
    });
    if (error && !ALREADY_IN_HOUSE.test(error.message)) throw new SetupError(setupMessage(error.message));
  }

  if (created) {
    // casa nova: dados de outubro/2026 e uma data-alvo inicial (editável no Plano)
    for (const fn of ["load_seed_debts", "load_seed_fixed_costs"]) {
      const { error } = await david.client.rpc(fn);
      if (error && !ALREADY_SEEDED.test(error.message)) throw new SetupError(setupMessage(error.message));
    }
    if (!house.target_date) {
      const target = endOfMonthISO(addMonths(monthStart(todayISO()), 8));
      await admin.from("households").update({ target_date: target }).eq("id", householdId);
    }
  }
  return { householdId, created };
}
