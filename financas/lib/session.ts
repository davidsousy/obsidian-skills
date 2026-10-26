import { redirect } from "next/navigation";
import { cache } from "react";
import { bootstrapHousehold } from "@/lib/bootstrap";
import { createClient } from "@/lib/supabase/server";

export type Household = {
  id: string;
  name: string;
  target_date: string | null;
  reserve_target_cents: number;
  reserve_balance_cents: number;
  tight_margin_pct: number;
  car_cost_allocation: "por_hora" | "por_dia";
  initial_variable_monthly_cents: number;
  initial_income_monthly_cents: number;
  invite_code: string;
  created_at: string;
};

export type Member = {
  user_id: string;
  display_name: string;
  email_alerts: boolean;
  alert_days_before: number;
};

/** Usuário da sessão (o proxy entra sozinho; sem sessão, /iniciar prepara as contas). */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/iniciar");
  return { supabase, user: data.user };
});

/** Usuário + casa + membros (sem casa, cria a casa e os dados iniciais aqui mesmo). */
export const requireHousehold = cache(async () => {
  const { supabase, user } = await requireUser();
  let { data: house } = await supabase.from("households").select("*").maybeSingle();
  if (!house) {
    // primeiro acesso: prepara sem redirecionar (redirecionar para a rota /iniciar no meio de uma
    // navegação do cliente deixava a tela em branco)
    let householdId: string | null = null;
    let problem: string | null = null;
    try {
      ({ householdId } = await bootstrapHousehold());
    } catch (e) {
      problem = (e as Error).message;
    }
    if (!householdId) redirect(`/diagnostico?erro=${encodeURIComponent(problem ?? "Não foi possível preparar a casa.")}`);
    // filtra pelo id: um GET idêntico ao de cima viria da memória desta renderização (o Next memoriza o fetch)
    ({ data: house } = await supabase.from("households").select("*").eq("id", householdId).maybeSingle());
    if (!house) redirect("/iniciar"); // conta antiga (com login) sem casa: entra como David ou Paola
  }
  const { data: members } = await supabase
    .from("household_members")
    .select("user_id, display_name, email_alerts, alert_days_before")
    .order("created_at");
  const household: Household = {
    ...house,
    // bigint chega como number pelo PostgREST; numeric chega como string ou number
    tight_margin_pct: Number(house.tight_margin_pct),
  };
  const memberList = (members ?? []) as Member[];
  const me = memberList.find((m) => m.user_id === user.id)!;
  return { supabase, user, household, members: memberList, me };
});
