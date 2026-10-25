import type { SupabaseClient } from "@supabase/supabase-js";
import { loadFixedCosts, loadVariableExpenses } from "@/lib/costs-data";
import { loadDebts, type DebtRow } from "@/lib/debts-data";
import { carMonthlyCost, variableMonthlyEstimate } from "@/lib/finance/costs";
import { addMonths, monthStart, todayISO, type ISODate } from "@/lib/finance/dates";
import { incomeMonthlyAverage, uberRates, type UberRates } from "@/lib/finance/income";
import {
  extraUberHours,
  nearestViableDate,
  requiredIncome,
  requiredSchedule,
  viability,
  type PlanInput,
} from "@/lib/finance/plan";
import { loadIncome } from "@/lib/income-data";
import type { Household } from "@/lib/session";

export type PlanContext = {
  input: PlanInput;
  debts: DebtRow[];
  realIncome: ReturnType<typeof incomeMonthlyAverage>;
  variable: ReturnType<typeof variableMonthlyEstimate>;
  rates: UberRates | null;
  today: ISODate;
};

/** Junta tudo o que o plano precisa a partir do banco. */
export async function loadPlanContext(supabase: SupabaseClient, household: Household): Promise<PlanContext> {
  const today = todayISO();
  const [debts, fixedCosts, expenses, income] = await Promise.all([
    loadDebts(supabase),
    loadFixedCosts(supabase),
    loadVariableExpenses(supabase, addMonths(monthStart(today), -3)),
    loadIncome(supabase),
  ]);
  const variable = variableMonthlyEstimate(expenses, today, household.initial_variable_monthly_cents);
  const realIncome = incomeMonthlyAverage(income.uber, income.entries, today, household.initial_income_monthly_cents);
  const rates = uberRates(income.uber, today, carMonthlyCost(fixedCosts, today), household.car_cost_allocation);
  return {
    input: {
      today,
      debts,
      fixedCosts,
      variableMonthly: variable.cents,
      reserveTarget: household.reserve_target_cents,
      reserveBalance: household.reserve_balance_cents,
    },
    debts,
    realIncome,
    variable,
    rates,
    today,
  };
}

export type PlanResult = {
  target: ISODate;
  /** Renda necessária por fases (principal). */
  schedule: NonNullable<ReturnType<typeof requiredSchedule>>;
  /** Valor fixo igual todo mês (referência). */
  required: NonNullable<ReturnType<typeof requiredIncome>>;
  /** Comparada ao mês mais pesado: a renda real precisa cobrir todos os meses. */
  viability: ReturnType<typeof viability>;
  /** Meses do plano em que a renda real não cobre a renda necessária. */
  shortMonths: ISODate[];
  hours: ReturnType<typeof extraUberHours>;
  nearest: ReturnType<typeof nearestViableDate>;
};

/** Renda necessária, viabilidade, horas de Uber e data viável mais próxima para a data-alvo. */
export function computePlan(ctx: PlanContext, target: ISODate, tightMarginPct: number): PlanResult | null {
  const schedule = requiredSchedule(ctx.input, target);
  const required = requiredIncome(ctx.input, target);
  if (!schedule || !required) return null;
  const v = viability(ctx.realIncome.cents, schedule.peak, tightMarginPct);
  return {
    target,
    schedule,
    required,
    viability: v,
    shortMonths: schedule.months.filter((m) => m.income > ctx.realIncome.cents).map((m) => m.month),
    hours: extraUberHours(v.diff, ctx.rates?.netPerHour ?? null, ctx.rates?.monthlyDays ?? null),
    nearest: nearestViableDate(ctx.input, ctx.realIncome.cents),
  };
}
