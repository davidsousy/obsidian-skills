import { redirect } from "next/navigation";
import { cache } from "react";
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
};

export type Member = {
  user_id: string;
  display_name: string;
  email_alerts: boolean;
  alert_days_before: number;
};

/** Usuário logado (ou redireciona para /entrar). */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/entrar");
  return { supabase, user: data.user };
});

/** Usuário + casa + membros (ou redireciona para /casa se ainda não tem casa). */
export const requireHousehold = cache(async () => {
  const { supabase, user } = await requireUser();
  const { data: house } = await supabase.from("households").select("*").maybeSingle();
  if (!house) redirect("/casa");
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
