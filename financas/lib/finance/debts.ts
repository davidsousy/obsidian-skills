// Regras de dívidas — espelho exato de supabase/migrations/*_debts.sql (accrue_charges, register_payment).
// O banco é a fonte de verdade para os dados gravados; esta lib é usada para exibir, simular e testar.

import { addMonths, monthStart, type ISODate } from "./dates";
import { applyRate, type Cents } from "./money";

export type DebtKind = "parcelada_sem_juros" | "parcelada_com_juros" | "juros_sobre_principal" | "conta_em_atraso";
export type DebtStatus = "em_dia" | "em_atraso" | "em_negociacao" | "quitada";

export const KIND_LABEL: Record<DebtKind, string> = {
  parcelada_sem_juros: "Parcelada sem juros",
  parcelada_com_juros: "Parcelada com juros",
  juros_sobre_principal: "Juros sobre principal (agiota)",
  conta_em_atraso: "Conta em atraso",
};

export const STATUS_LABEL: Record<DebtStatus, string> = {
  em_dia: "Em dia",
  em_atraso: "Em atraso",
  em_negociacao: "Em negociação",
  quitada: "Quitada",
};

export type Charge = {
  kind: "juros" | "multa";
  referenceMonth: ISODate; // 1º dia do mês
  baseCents: Cents;
  rate: number;
  amountCents: Cents;
  paidCents: Cents;
};

export type Debt = {
  id: string;
  name: string;
  kind: DebtKind;
  status: DebtStatus;
  originalCents: Cents;
  dueDay: number | null;
  riskPriority: boolean;
  // parceladas
  installmentCents?: Cents | null;
  installmentsKnown?: boolean;
  balanceCents?: Cents | null;
  // juros
  monthlyRate?: number | null;
  // agiota / conta em atraso
  principalCents?: Cents | null;
  accrualStartMonth?: ISODate | null;
  originalDueDate?: ISODate | null;
  lateFeeRate?: number | null;
  lateInterestRate?: number | null;
  charges: Charge[];
};

export function isInstallment(d: Pick<Debt, "kind">): boolean {
  return d.kind === "parcelada_sem_juros" || d.kind === "parcelada_com_juros";
}

export function openCharges(d: Debt): Cents {
  return d.charges.reduce((sum, c) => sum + (c.amountCents - c.paidCents), 0);
}

/** Saldo atual: parceladas = saldo; agiota/atraso = principal + juros/multas em aberto. */
export function debtBalance(d: Debt): Cents {
  if (isInstallment(d)) return d.balanceCents ?? 0;
  return (d.principalCents ?? 0) + openCharges(d);
}

/** Parcelas restantes (null quando o número não foi informado, como o carro). */
export function installmentsRemaining(d: Debt): number | null {
  if (!isInstallment(d) || !d.installmentsKnown || !d.installmentCents) return null;
  return Math.ceil((d.balanceCents ?? 0) / d.installmentCents);
}

/**
 * Valor presente das parcelas restantes (Tabela Price): quanto custaria quitar hoje.
 * Só faz sentido para parcelada com juros com taxa e nº de parcelas conhecidos.
 */
export function presentValue(installment: Cents, n: number, monthlyRate: number): Cents {
  if (n <= 0) return 0;
  if (monthlyRate === 0) return installment * n;
  return Math.round((installment * (1 - Math.pow(1 + monthlyRate, -n))) / monthlyRate);
}

/** Juros/multas que ainda não foram lançados até o mês de `today` (mesma regra de accrue_charges). */
export function chargesToAccrue(d: Debt, today: ISODate): Charge[] {
  if (d.status === "quitada") return [];
  const current = monthStart(today);
  const has = (kind: Charge["kind"], month: ISODate) =>
    d.charges.some((c) => c.kind === kind && c.referenceMonth === month);
  const out: Charge[] = [];

  if (d.kind === "juros_sobre_principal") {
    const principal = d.principalCents ?? 0;
    if (!d.accrualStartMonth || d.monthlyRate == null || principal === 0) return [];
    for (let m = d.accrualStartMonth; m <= current; m = addMonths(m, 1)) {
      if (!has("juros", m)) {
        out.push({ kind: "juros", referenceMonth: m, baseCents: principal, rate: d.monthlyRate,
          amountCents: applyRate(principal, d.monthlyRate), paidCents: 0 });
      }
    }
  } else if (d.kind === "conta_em_atraso" && d.originalDueDate) {
    const dueMonth = monthStart(d.originalDueDate);
    if (d.lateFeeRate && dueMonth <= current && !has("multa", dueMonth)) {
      out.push({ kind: "multa", referenceMonth: dueMonth, baseCents: d.originalCents, rate: d.lateFeeRate,
        amountCents: applyRate(d.originalCents, d.lateFeeRate), paidCents: 0 });
    }
    if (d.lateInterestRate) {
      for (let m = addMonths(dueMonth, 1); m <= current; m = addMonths(m, 1)) {
        if (!has("juros", m)) {
          out.push({ kind: "juros", referenceMonth: m, baseCents: d.originalCents, rate: d.lateInterestRate,
            amountCents: applyRate(d.originalCents, d.lateInterestRate), paidCents: 0 });
        }
      }
    }
  }
  return out;
}

export function accrue(d: Debt, today: ISODate): Debt {
  const extra = chargesToAccrue(d, today);
  return extra.length ? { ...d, charges: [...d.charges, ...extra] } : d;
}

export type PaymentResult = {
  debt: Debt;
  interestCents: Cents;
  principalCents: Cents;
  installmentsCovered: number;
};

export class PaymentError extends Error {}

/**
 * Aplica um pagamento (mesma regra de register_payment):
 * - parceladas: abate o saldo; parcelas cobertas = quantas parcelas o saldo "perdeu"
 * - agiota/atraso: paga juros/multas em aberto do mais antigo ao mais novo (multa antes de juros
 *   no mesmo mês) e o excedente reduz o principal
 * Quando o saldo zera, a dívida fica quitada.
 */
export function applyPayment(d: Debt, amount: Cents): PaymentResult {
  if (amount <= 0) throw new PaymentError("O valor do pagamento precisa ser maior que zero.");
  if (d.status === "quitada") throw new PaymentError("Esta dívida já está quitada.");

  if (isInstallment(d)) {
    const installment = d.installmentCents ?? 0;
    if (!d.installmentsKnown) {
      return { debt: d, interestCents: 0, principalCents: amount, installmentsCovered: Math.floor(amount / installment) };
    }
    const balance = d.balanceCents ?? 0;
    if (amount > balance) throw new PaymentError("O valor é maior que o saldo da dívida.");
    const after = balance - amount;
    const covered = Math.ceil(balance / installment) - Math.ceil(after / installment);
    return {
      debt: { ...d, balanceCents: after, status: after === 0 ? "quitada" : d.status },
      interestCents: 0,
      principalCents: amount,
      installmentsCovered: covered,
    };
  }

  const balance = debtBalance(d);
  if (amount > balance) throw new PaymentError("O valor é maior que o saldo da dívida.");
  let remaining = amount;
  let interest = 0;
  const order = [...d.charges.keys()].sort((a, b) => {
    const ca = d.charges[a];
    const cb = d.charges[b];
    if (ca.referenceMonth !== cb.referenceMonth) return ca.referenceMonth < cb.referenceMonth ? -1 : 1;
    return ca.kind === cb.kind ? 0 : ca.kind === "multa" ? -1 : 1;
  });
  const charges = d.charges.map((c) => ({ ...c }));
  for (const i of order) {
    if (remaining === 0) break;
    const take = Math.min(remaining, charges[i].amountCents - charges[i].paidCents);
    charges[i].paidCents += take;
    remaining -= take;
    interest += take;
  }
  const principal = (d.principalCents ?? 0) - remaining;
  return {
    debt: { ...d, charges, principalCents: principal, status: balance - amount === 0 ? "quitada" : d.status },
    interestCents: interest,
    principalCents: remaining,
    installmentsCovered: 0,
  };
}

export type DebtGroup = "atraso" | "agiotas" | "parceladas" | "quitadas";

export const GROUP_LABEL: Record<DebtGroup, string> = {
  atraso: "Em atraso",
  agiotas: "Agiotas",
  parceladas: "Parceladas",
  quitadas: "Quitadas",
};

export function debtGroup(d: Pick<Debt, "kind" | "status">): DebtGroup {
  if (d.status === "quitada") return "quitadas";
  if (d.kind === "juros_sobre_principal") return "agiotas";
  if (d.kind === "conta_em_atraso" || d.status === "em_atraso") return "atraso";
  return "parceladas";
}

export type DebtTotals = { total: Cents; overdue: Cents; byGroup: Record<DebtGroup, Cents> };

export function debtTotals(debts: Debt[]): DebtTotals {
  const byGroup: Record<DebtGroup, Cents> = { atraso: 0, agiotas: 0, parceladas: 0, quitadas: 0 };
  for (const d of debts) byGroup[debtGroup(d)] += debtBalance(d);
  return {
    total: byGroup.atraso + byGroup.agiotas + byGroup.parceladas,
    overdue: byGroup.atraso,
    byGroup,
  };
}

/** Juros de cada mês de uma dívida: lançado × pago. */
export function interestByMonth(d: Debt): { month: ISODate; chargedCents: Cents; paidCents: Cents }[] {
  const map = new Map<ISODate, { chargedCents: Cents; paidCents: Cents }>();
  for (const c of d.charges) {
    const row = map.get(c.referenceMonth) ?? { chargedCents: 0, paidCents: 0 };
    row.chargedCents += c.amountCents;
    row.paidCents += c.paidCents;
    map.set(c.referenceMonth, row);
  }
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([month, v]) => ({ month, ...v }));
}
