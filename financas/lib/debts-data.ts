import type { SupabaseClient } from "@supabase/supabase-js";
import { monthStart, todayISO, type ISODate } from "@/lib/finance/dates";
import type { Charge, Debt, DebtKind, DebtStatus } from "@/lib/finance/debts";

/** Dívida como vem da view debts_overview + campos de exibição. */
export type DebtRow = Debt & {
  creditor: string | null;
  notes: string | null;
  currentBalanceCents: number;
  installmentsRemaining: number | null;
  interestPaidCents: number;
  totalPaidCents: number;
  priorityOverride: number | null;
};

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

type OverviewRow = Record<string, unknown>;

function toDebt(row: OverviewRow, charges: Charge[]): DebtRow {
  return {
    id: row.id as string,
    name: row.name as string,
    creditor: (row.creditor as string) ?? null,
    notes: (row.notes as string) ?? null,
    kind: row.kind as DebtKind,
    status: row.status as DebtStatus,
    originalCents: Number(row.original_cents),
    dueDay: num(row.due_day),
    riskPriority: Boolean(row.risk_priority),
    priorityOverride: num(row.priority_override),
    installmentCents: num(row.installment_cents),
    installmentsKnown: Boolean(row.installments_known),
    balanceCents: num(row.balance_cents),
    monthlyRate: num(row.monthly_rate),
    principalCents: num(row.principal_cents),
    accrualStartMonth: (row.accrual_start_month as ISODate) ?? null,
    originalDueDate: (row.original_due_date as ISODate) ?? null,
    lateFeeRate: num(row.late_fee_rate),
    lateInterestRate: num(row.late_interest_rate),
    charges,
    currentBalanceCents: Number(row.current_balance_cents),
    installmentsRemaining: num(row.installments_remaining),
    interestPaidCents: Number(row.interest_paid_cents),
    totalPaidCents: Number(row.total_paid_cents),
  };
}

function toCharge(row: OverviewRow): Charge & { debtId: string } {
  return {
    debtId: row.debt_id as string,
    kind: row.kind as Charge["kind"],
    referenceMonth: row.reference_month as ISODate,
    baseCents: Number(row.base_cents),
    rate: Number(row.rate),
    amountCents: Number(row.amount_cents),
    paidCents: Number(row.paid_cents),
  };
}

/** Lança os juros do mês (idempotente) e carrega as dívidas da casa. */
export async function loadDebts(supabase: SupabaseClient, onlyId?: string): Promise<DebtRow[]> {
  const { error: accrueError } = await supabase.rpc("accrue_charges");
  if (accrueError) throw new Error(accrueError.message);

  let debtsQuery = supabase.from("debts_overview").select("*").order("created_at");
  let chargesQuery = supabase.from("debt_charges").select("*").order("reference_month");
  if (onlyId) {
    debtsQuery = debtsQuery.eq("id", onlyId);
    chargesQuery = chargesQuery.eq("debt_id", onlyId);
  }
  const [{ data: rows, error }, { data: chargeRows, error: chargeError }] = await Promise.all([debtsQuery, chargesQuery]);
  if (error || chargeError) throw new Error((error ?? chargeError)!.message);

  return mapDebts(rows ?? [], chargeRows ?? []);
}

/** Converte linhas de debts_overview + debt_charges em dívidas. */
export function mapDebts(rows: OverviewRow[], chargeRows: OverviewRow[]): DebtRow[] {
  const charges = chargeRows.map(toCharge);
  return rows.map((row) =>
    toDebt(
      row,
      charges.filter((c) => c.debtId === row.id),
    ),
  );
}

export type PaymentRow = {
  id: string;
  debtId: string;
  paidOn: ISODate;
  amountCents: number;
  interestCents: number;
  principalCents: number;
  installmentsCovered: number;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
};

export async function loadPayments(supabase: SupabaseClient, debtId?: string): Promise<PaymentRow[]> {
  let query = supabase.from("debt_payments").select("*").order("paid_on", { ascending: false }).order("created_at", {
    ascending: false,
  });
  if (debtId) query = query.eq("debt_id", debtId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    debtId: r.debt_id,
    paidOn: r.paid_on,
    amountCents: Number(r.amount_cents),
    interestCents: Number(r.interest_cents),
    principalCents: Number(r.principal_cents),
    installmentsCovered: r.installments_covered,
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));
}

/** Juros pagos no mês corrente (São Paulo). */
export function interestPaidThisMonth(payments: PaymentRow[], today: ISODate = todayISO()): number {
  const month = monthStart(today);
  return payments.filter((p) => monthStart(p.paidOn) === month).reduce((s, p) => s + p.interestCents, 0);
}
