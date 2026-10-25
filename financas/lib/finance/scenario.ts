// Simulador "e se": transforma a entrada do plano sem tocar nos dados reais.

import type { Debt } from "./debts";
import type { Cents } from "./money";
import type { PlanInput } from "./plan";

export type Scenario = {
  extraIncome: Cents; // ganhar R$ X a mais por mês
  extraHours: number; // rodar Y horas a mais de Uber por mês (vale o ganho líquido por hora)
  cutFixedCostIds: string[]; // cortar custos fixos
  payNowDebtIds: string[]; // quitar agora (dinheiro de fora do plano)
  negotiation: { debtId: string; amount: Cents; installments: number } | null; // fechar com desconto
};

export const EMPTY_SCENARIO: Scenario = {
  extraIncome: 0,
  extraHours: 0,
  cutFixedCostIds: [],
  payNowDebtIds: [],
  negotiation: null,
};

export function isEmptyScenario(s: Scenario): boolean {
  return !s.extraIncome && !s.extraHours && !s.cutFixedCostIds.length && !s.payNowDebtIds.length && !s.negotiation;
}

/** Renda extra por mês vinda das horas a mais de Uber. */
export function hoursIncome(hours: number, netPerHour: Cents | null): Cents {
  return hours > 0 && netPerHour ? Math.round(hours * netPerHour) : 0;
}

/**
 * Negociação aceita: a dívida vira parcelada sem juros (valor ÷ parcelas; à vista = 1 parcela),
 * sem juros/multas em aberto. A parcela vence a partir do 1º mês do plano.
 */
export function negotiate(d: Debt, amount: Cents, installments: number): Debt {
  const n = Math.max(1, Math.floor(installments));
  const installment = Math.ceil(amount / n);
  return {
    ...d,
    kind: "parcelada_sem_juros",
    status: "em_dia",
    installmentCents: installment,
    installmentsKnown: true,
    balanceCents: amount,
    principalCents: null,
    monthlyRate: null,
    lateFeeRate: null,
    lateInterestRate: null,
    charges: [],
  };
}

export function applyScenario(
  input: PlanInput,
  realIncome: Cents,
  netPerHour: Cents | null,
  s: Scenario,
): { input: PlanInput; income: Cents; addedIncome: Cents; discount: Cents } {
  let discount = 0;
  const debts = input.debts
    .filter((d) => !s.payNowDebtIds.includes(d.id))
    .map((d) => {
      if (s.negotiation && d.id === s.negotiation.debtId) {
        const before = d.kind === "parcelada_sem_juros" || d.kind === "parcelada_com_juros"
          ? (d.balanceCents ?? 0)
          : (d.principalCents ?? 0) + d.charges.reduce((x, c) => x + c.amountCents - c.paidCents, 0);
        discount = before - s.negotiation.amount;
        return { ...negotiate(d, s.negotiation.amount, s.negotiation.installments), priorityOverride: d.priorityOverride };
      }
      return d;
    });
  const addedIncome = s.extraIncome + hoursIncome(s.extraHours, netPerHour);
  return {
    input: {
      ...input,
      debts,
      fixedCosts: input.fixedCosts.filter((c) => !s.cutFixedCostIds.includes(c.id)),
    },
    income: realIncome + addedIncome,
    addedIncome,
    discount,
  };
}
