import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAlertEmail } from "@/lib/alert-email";
import { mapFixedCost } from "@/lib/costs-data";
import { mapDebts } from "@/lib/debts-data";
import { emailDues, upcomingDues, type DueItem } from "@/lib/finance/alerts";
import type { ISODate } from "@/lib/finance/dates";

export type Email = { to: string; subject: string; html: string; text: string };
export type SendFn = (email: Email) => Promise<void>;

export type JobResult = {
  date: ISODate;
  dryRun: boolean;
  sent: { to: string; items: { name: string; dueDate: string; amountCents: number }[] }[];
  skippedAlreadySent: number;
  errors: string[];
};

/**
 * Envia, para cada membro com alertas ativados, os vencimentos que caem daqui a `alert_days_before`
 * dias. Usa o client com service role (lê todas as casas). Sem `send`, só simula (não grava log).
 */
export async function runAlerts(admin: SupabaseClient, today: ISODate, appUrl: string, send?: SendFn): Promise<JobResult> {
  const result: JobResult = { date: today, dryRun: !send, sent: [], skippedAlreadySent: 0, errors: [] };
  const { data: recipients, error } = await admin.rpc("alert_recipients");
  if (error) throw new Error(error.message);

  const byHouse = new Map<string, typeof recipients>();
  for (const r of recipients ?? []) byHouse.set(r.household_id, [...(byHouse.get(r.household_id) ?? []), r]);

  for (const [householdId, members] of byHouse) {
    const [debts, charges, payments, fixed] = await Promise.all([
      admin.from("debts_overview").select("*").eq("household_id", householdId),
      admin.from("debt_charges").select("*").eq("household_id", householdId),
      admin.from("debt_payments").select("debt_id, paid_on, amount_cents, interest_cents").eq("household_id", householdId),
      admin.from("fixed_costs").select("*").eq("household_id", householdId),
    ]);
    const err = debts.error ?? charges.error ?? payments.error ?? fixed.error;
    if (err) {
      result.errors.push(`${householdId}: ${err.message}`);
      continue;
    }
    const dues = upcomingDues(
      mapDebts(debts.data ?? [], charges.data ?? []),
      (payments.data ?? []).map((p) => ({
        debtId: p.debt_id,
        paidOn: p.paid_on,
        amountCents: Number(p.amount_cents),
        interestCents: Number(p.interest_cents),
      })),
      (fixed.data ?? []).map(mapFixedCost),
      today,
      31,
    );

    for (const m of members ?? []) {
      let items: DueItem[] = emailDues(dues, today, m.alert_days_before);
      if (items.length === 0) continue;
      const { data: logged } = await admin
        .from("alert_log")
        .select("source_type, source_id, due_date")
        .eq("user_id", m.user_id)
        .in("due_date", [...new Set(items.map((i) => i.dueDate))]);
      const already = new Set((logged ?? []).map((l) => `${l.source_type}:${l.source_id}:${l.due_date}`));
      const fresh = items.filter((i) => !already.has(`${i.source}:${i.id}:${i.dueDate}`));
      result.skippedAlreadySent += items.length - fresh.length;
      items = fresh;
      if (items.length === 0) continue;

      const email = buildAlertEmail(m.display_name, items, appUrl);
      result.sent.push({ to: m.email, items: items.map((i) => ({ name: i.name, dueDate: i.dueDate, amountCents: i.amountCents })) });
      if (!send) continue;
      try {
        await send({ to: m.email, ...email });
        const { error: logError } = await admin.from("alert_log").insert(
          items.map((i) => ({ household_id: householdId, user_id: m.user_id, source_type: i.source, source_id: i.id, due_date: i.dueDate })),
        );
        if (logError) result.errors.push(`log ${m.email}: ${logError.message}`);
      } catch (e) {
        result.errors.push(`envio ${m.email}: ${(e as Error).message}`);
      }
    }
  }
  return result;
}
