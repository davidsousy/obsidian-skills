import type { SupabaseClient } from "@supabase/supabase-js";
import type { CostCategory, FixedCost, VariableExpense } from "@/lib/finance/costs";
import type { ISODate } from "@/lib/finance/dates";

export type FixedCostRow = FixedCost & { notes: string | null };

export async function loadFixedCosts(supabase: SupabaseClient, onlyId?: string): Promise<FixedCostRow[]> {
  let query = supabase.from("fixed_costs").select("*").order("amount_cents", { ascending: false });
  if (onlyId) query = query.eq("id", onlyId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    amountCents: Number(r.amount_cents),
    dueDay: r.due_day,
    category: r.category as CostCategory,
    ownerUserId: r.owner_user_id,
    isApproximate: r.is_approximate,
    active: r.active,
    startsOn: r.starts_on,
    notes: r.notes,
  }));
}

/** Gastos variáveis desde `since` (inclusive). */
export async function loadVariableExpenses(supabase: SupabaseClient, since?: ISODate): Promise<VariableExpense[]> {
  let query = supabase
    .from("variable_expenses")
    .select("*")
    .order("spent_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (since) query = query.gte("spent_on", since);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    spentOn: r.spent_on,
    amountCents: Number(r.amount_cents),
    category: r.category as CostCategory,
    description: r.description,
    spentBy: r.spent_by,
  }));
}
