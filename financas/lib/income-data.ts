import type { SupabaseClient } from "@supabase/supabase-js";
import type { ISODate } from "@/lib/finance/dates";
import type { IncomeEntry, UberDay } from "@/lib/finance/income";

export type UberDayRow = UberDay & { notes: string | null; createdBy: string | null };

export async function loadIncome(
  supabase: SupabaseClient,
  since?: ISODate,
): Promise<{ uber: UberDayRow[]; entries: IncomeEntry[]; firstDate: ISODate | null }> {
  let uq = supabase.from("uber_days").select("*").order("worked_on", { ascending: false });
  let eq = supabase.from("income_entries").select("*").order("received_on", { ascending: false }).order("created_at", {
    ascending: false,
  });
  if (since) {
    uq = uq.gte("worked_on", since);
    eq = eq.gte("received_on", since);
  }
  // primeira data de todo o histórico (para saber quantos dias as médias cobrem)
  const firstU = supabase.from("uber_days").select("worked_on").order("worked_on").limit(1);
  const firstE = supabase.from("income_entries").select("received_on").order("received_on").limit(1);
  const [u, e, fu, fe] = await Promise.all([uq, eq, firstU, firstE]);
  const err = u.error ?? e.error ?? fu.error ?? fe.error;
  if (err) throw new Error(err.message);
  const firsts = [fu.data?.[0]?.worked_on, fe.data?.[0]?.received_on].filter(Boolean) as ISODate[];
  return {
    uber: (u.data ?? []).map((r) => ({
      id: r.id,
      workedOn: r.worked_on,
      grossCents: Number(r.gross_cents),
      hours: Number(r.hours),
      notes: r.notes,
      createdBy: r.created_by,
    })),
    entries: (e.data ?? []).map((r) => ({
      id: r.id,
      receivedOn: r.received_on,
      amountCents: Number(r.amount_cents),
      source: r.source,
      description: r.description,
      earnerUserId: r.earner_user_id,
    })),
    firstDate: firsts.length ? firsts.reduce((a, b) => (a < b ? a : b)) : null,
  };
}
