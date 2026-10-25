// Renda: Uber (diário, com horas) e entradas da Paola.
//
// Ganho por hora do Uber (últimos 30 dias):
//   bruto/h   = bruto ÷ horas
//   custo do carro = recarga + limpeza (custos fixos da categoria carro, por mês)
//     por hora: custo mensal ÷ horas rodadas por mês
//     por dia:  custo mensal ÷ dias rodados por mês, e o custo dos dias é dividido pelas horas
//   (horas/dias "por mês" = o que foi rodado nos últimos 30 dias; com menos de 30 dias de
//    histórico, proporcional ao período já lançado)
//   líquido/h = bruto/h − custo do carro/h
//
// Médias móveis: total recebido na janela convertido para valor mensal (× 30 ÷ dias da janela).
// Com histórico menor que a janela, usa só os dias já cobertos e marca como parcial.

import { addDays, diffDays, type ISODate } from "./dates";
import type { Cents } from "./money";

export type UberDay = { id: string; workedOn: ISODate; grossCents: Cents; hours: number };
export type IncomeEntry = {
  id: string;
  receivedOn: ISODate;
  amountCents: Cents;
  source: "salario" | "outros";
  description: string | null;
  earnerUserId: string | null;
};
export type CarAllocation = "por_hora" | "por_dia";

/** Primeira data com qualquer lançamento de renda. */
export function firstIncomeDate(uber: UberDay[], entries: IncomeEntry[]): ISODate | null {
  const dates = [...uber.map((u) => u.workedOn), ...entries.map((e) => e.receivedOn)];
  return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;
}

/** Dias da janela [today − window + 1, today] cobertos pelo histórico. */
export function coveredDays(first: ISODate | null, today: ISODate, window: number): number {
  if (!first || first > today) return 0;
  return Math.min(window, diffDays(first, today) + 1);
}

function inWindow(date: ISODate, today: ISODate, window: number): boolean {
  return date <= today && date >= addDays(today, -(window - 1));
}

export type WindowStats = {
  window: number;
  covered: number;
  partial: boolean;
  uberCents: Cents;
  otherCents: Cents;
  totalCents: Cents;
  // equivalentes mensais (30 dias)
  uberMonthly: Cents;
  otherMonthly: Cents;
  totalMonthly: Cents;
  hours: number;
  daysWorked: number;
};

export function windowStats(uber: UberDay[], entries: IncomeEntry[], today: ISODate, window: number): WindowStats {
  const covered = coveredDays(firstIncomeDate(uber, entries), today, window);
  const u = uber.filter((d) => inWindow(d.workedOn, today, window));
  const e = entries.filter((x) => inWindow(x.receivedOn, today, window));
  const uberCents = u.reduce((s, d) => s + d.grossCents, 0);
  const otherCents = e.reduce((s, x) => s + x.amountCents, 0);
  const monthly = (v: Cents) => (covered ? Math.round((v * 30) / covered) : 0);
  return {
    window,
    covered,
    partial: covered < window,
    uberCents,
    otherCents,
    totalCents: uberCents + otherCents,
    uberMonthly: monthly(uberCents),
    otherMonthly: monthly(otherCents),
    totalMonthly: monthly(uberCents + otherCents),
    hours: u.reduce((s, d) => s + d.hours, 0),
    daysWorked: u.length,
  };
}

export type UberRates = {
  hours30: number;
  days30: number;
  monthlyHours: number; // horas rodadas por mês (estimado pelos últimos 30 dias)
  monthlyDays: number; // dias rodados por mês
  grossPerHour: Cents;
  carCostPerHour: Cents;
  netPerHour: Cents;
  carCostPerDay: Cents | null; // só no rateio por dia
};

/** Ganho por hora do Uber nos últimos 30 dias (null sem lançamentos). */
export function uberRates(
  uber: UberDay[],
  today: ISODate,
  carMonthlyCents: Cents,
  allocation: CarAllocation,
): UberRates | null {
  const last = uber.filter((d) => inWindow(d.workedOn, today, 30));
  const hours = last.reduce((s, d) => s + d.hours, 0);
  if (last.length === 0 || hours === 0) return null;
  const gross = last.reduce((s, d) => s + d.grossCents, 0);
  const covered = coveredDays(firstIncomeDate(uber, []), today, 30);
  const monthlyHours = (hours * 30) / covered;
  const monthlyDays = (last.length * 30) / covered;
  const grossPerHour = Math.round(gross / hours);

  let carCostPerHour: Cents;
  let carCostPerDay: Cents | null = null;
  if (allocation === "por_dia") {
    carCostPerDay = Math.round(carMonthlyCents / monthlyDays);
    // custo dos dias rodados na janela ÷ horas rodadas na janela
    carCostPerHour = Math.round((carCostPerDay * last.length) / hours);
  } else {
    carCostPerHour = Math.round(carMonthlyCents / monthlyHours);
  }
  return {
    hours30: hours,
    days30: last.length,
    monthlyHours,
    monthlyDays,
    grossPerHour,
    carCostPerHour,
    netPerHour: grossPerHour - carCostPerHour,
    carCostPerDay,
  };
}

/** Ganho por hora de cada dia (para o gráfico), usando o custo do carro por hora/dia atual. */
export function dailyRates(uber: UberDay[], rates: UberRates | null): { date: ISODate; gross: number; net: number }[] {
  return [...uber]
    .sort((a, b) => (a.workedOn < b.workedOn ? -1 : 1))
    .map((d) => {
      const grossPerHour = d.grossCents / d.hours;
      const carPerHour = !rates ? 0 : rates.carCostPerDay !== null ? rates.carCostPerDay / d.hours : rates.carCostPerHour;
      return { date: d.workedOn, gross: Math.round(grossPerHour), net: Math.round(grossPerHour - carPerHour) };
    });
}

/**
 * Renda média mensal usada no plano:
 *  - 90 dias completos de histórico → média de 90 dias
 *  - pelo menos 30 dias → média do período já coberto (até 90)
 *  - menos de 30 dias → estimativa informada nas configurações
 */
export function incomeMonthlyAverage(
  uber: UberDay[],
  entries: IncomeEntry[],
  today: ISODate,
  initialEstimate: Cents,
): { cents: Cents; source: "media90" | "parcial" | "estimativa"; days: number } {
  const s = windowStats(uber, entries, today, 90);
  if (s.covered >= 90) return { cents: s.totalMonthly, source: "media90", days: 90 };
  if (s.covered >= 30) return { cents: s.totalMonthly, source: "parcial", days: s.covered };
  return { cents: initialEstimate, source: "estimativa", days: s.covered };
}
