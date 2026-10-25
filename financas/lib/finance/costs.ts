// Custos fixos e gastos variáveis.

import { addMonths, monthStart, type ISODate } from "./dates";
import type { Cents } from "./money";

export type CostCategory = "moradia" | "alimentacao" | "carro" | "assinaturas" | "saude" | "pessoal" | "lazer" | "outros";

export const CATEGORY_LABEL: Record<CostCategory, string> = {
  moradia: "Moradia",
  alimentacao: "Alimentação",
  carro: "Carro",
  assinaturas: "Assinaturas",
  saude: "Saúde",
  pessoal: "Pessoal",
  lazer: "Lazer",
  outros: "Outros",
};

export const CATEGORIES = Object.keys(CATEGORY_LABEL) as CostCategory[];

export type FixedCost = {
  id: string;
  name: string;
  amountCents: Cents;
  dueDay: number | null;
  category: CostCategory;
  ownerUserId: string | null; // null = casa
  isApproximate: boolean;
  active: boolean;
  startsOn: ISODate | null; // 1º mês em que conta; null = sempre
};

export type VariableExpense = {
  id: string;
  spentOn: ISODate;
  amountCents: Cents;
  category: CostCategory;
  description: string | null;
  spentBy: string | null;
};

/** O custo conta no mês de `month`? */
export function fixedCostApplies(c: FixedCost, month: ISODate): boolean {
  return c.active && (!c.startsOn || c.startsOn <= monthStart(month));
}

/** Total mensal dos custos fixos ativos (sem considerar mês de início). */
export function fixedMonthlyTotal(costs: FixedCost[]): Cents {
  return costs.filter((c) => c.active).reduce((s, c) => s + c.amountCents, 0);
}

/** Total dos custos fixos que contam no mês de `month`. */
export function fixedTotalForMonth(costs: FixedCost[], month: ISODate): Cents {
  return costs.filter((c) => fixedCostApplies(c, month)).reduce((s, c) => s + c.amountCents, 0);
}

export function fixedByCategory(costs: FixedCost[]): Map<CostCategory, Cents> {
  const map = new Map<CostCategory, Cents>();
  for (const c of costs) if (c.active) map.set(c.category, (map.get(c.category) ?? 0) + c.amountCents);
  return map;
}

/** Custo mensal do carro (recarga + limpeza): categoria "carro", usado no ganho líquido do Uber. */
export function carMonthlyCost(costs: FixedCost[], month: ISODate): Cents {
  return costs.filter((c) => c.category === "carro" && fixedCostApplies(c, month)).reduce((s, c) => s + c.amountCents, 0);
}

/** Totais de gastos variáveis por mês (chave = 1º dia do mês) e categoria. */
export function variableByMonth(expenses: VariableExpense[]): Map<ISODate, Map<CostCategory, Cents>> {
  const out = new Map<ISODate, Map<CostCategory, Cents>>();
  for (const e of expenses) {
    const m = monthStart(e.spentOn);
    const cats = out.get(m) ?? new Map<CostCategory, Cents>();
    cats.set(e.category, (cats.get(e.category) ?? 0) + e.amountCents);
    out.set(m, cats);
  }
  return out;
}

function sum(map: Map<CostCategory, Cents> | undefined): Cents {
  return map ? [...map.values()].reduce((s, v) => s + v, 0) : 0;
}

/**
 * Meses completos anteriores a `month` usados na média: até `window` meses, mas sem contar meses
 * antes do primeiro lançamento (o começo do uso não dilui a média).
 */
export function averageMonths(expenses: VariableExpense[], month: ISODate, window = 3): ISODate[] {
  if (expenses.length === 0) return [];
  const first = monthStart(expenses.reduce((min, e) => (e.spentOn < min ? e.spentOn : min), expenses[0].spentOn));
  const current = monthStart(month);
  const months: ISODate[] = [];
  for (let i = 1; i <= window; i++) {
    const m = addMonths(current, -i);
    if (m < first) break;
    months.push(m);
  }
  return months;
}

export type CategoryComparison = { category: CostCategory; monthCents: Cents; averageCents: Cents | null };

/** Total do mês por categoria × média dos meses completos anteriores (até 3). */
export function compareWithAverage(
  expenses: VariableExpense[],
  month: ISODate,
  window = 3,
): { rows: CategoryComparison[]; monthTotal: Cents; averageTotal: Cents | null; monthsInAverage: number } {
  const byMonth = variableByMonth(expenses);
  const current = byMonth.get(monthStart(month));
  const months = averageMonths(expenses, month, window);
  const avg = (cat: CostCategory | null): Cents | null => {
    if (months.length === 0) return null;
    const total = months.reduce((s, m) => s + (cat ? (byMonth.get(m)?.get(cat) ?? 0) : sum(byMonth.get(m))), 0);
    return Math.round(total / months.length);
  };
  const rows = CATEGORIES.map((category) => ({
    category,
    monthCents: current?.get(category) ?? 0,
    averageCents: avg(category),
  })).filter((r) => r.monthCents > 0 || (r.averageCents ?? 0) > 0);
  return { rows, monthTotal: sum(current), averageTotal: avg(null), monthsInAverage: months.length };
}

/**
 * Gasto variável mensal usado no plano: média dos meses completos (até 3) quando já existe
 * pelo menos 1 mês completo de lançamentos; senão, a estimativa informada nas configurações.
 */
export function variableMonthlyEstimate(
  expenses: VariableExpense[],
  today: ISODate,
  initialEstimate: Cents,
): { cents: Cents; source: "media" | "estimativa"; months: number } {
  const { averageTotal, monthsInAverage } = compareWithAverage(expenses, today);
  if (averageTotal === null) return { cents: initialEstimate, source: "estimativa", months: 0 };
  return { cents: averageTotal, source: "media", months: monthsInAverage };
}
