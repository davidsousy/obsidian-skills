// Dados iniciais (referência: outubro/2026) — os mesmos de load_seed_debts() no banco.
// Usados nos testes para garantir que os totais batem com o combinado.

import type { Debt } from "./debts";

type SeedDebt = Omit<Debt, "id" | "charges">;

const overdue = (name: string, cents: number, extra: Partial<SeedDebt> = {}): SeedDebt => ({
  name, kind: "conta_em_atraso", status: "em_atraso", originalCents: cents, principalCents: cents,
  dueDay: null, riskPriority: false, ...extra,
});

const installments = (name: string, installment: number, n: number, dueDay: number): SeedDebt => ({
  name, kind: "parcelada_sem_juros", status: "em_dia", originalCents: installment * n,
  installmentCents: installment, balanceCents: installment * n, installmentsKnown: true, dueDay, riskPriority: false,
});

export const SEED_DEBTS: SeedDebt[] = [
  overdue("Aluguel do apto antigo (2 meses)", 600000, { status: "em_negociacao" }),
  overdue("Aluguel de outubro", 460000, { originalDueDate: "2026-10-05", dueDay: 5, riskPriority: true }),
  overdue("Condomínio (2 × 450)", 90000, { dueDay: 5, riskPriority: true }),
  overdue("Internet Vivo", 79000, { status: "em_negociacao" }),
  overdue("Terapia", 48000),
  overdue("Água", 28000, { riskPriority: true }),
  overdue("Luz", 22000, { riskPriority: true }),
  {
    name: "Agiota 1", kind: "juros_sobre_principal", status: "em_dia", originalCents: 300000, principalCents: 300000,
    monthlyRate: 0.4, accrualStartMonth: "2026-10-01", dueDay: 30, riskPriority: false,
  },
  {
    name: "Agiota 2", kind: "juros_sobre_principal", status: "em_dia", originalCents: 150000, principalCents: 150000,
    monthlyRate: 0.25, accrualStartMonth: "2026-10-01", dueDay: 30, riskPriority: false,
  },
  installments("Cartão do sogro (entrada do carro)", 333300, 3, 30),
  installments("Empréstimo do amigo", 125000, 4, 30),
  installments("Distrato Gabriel / Interage", 150000, 3, 15),
  {
    name: "Parcela do carro", kind: "parcelada_com_juros", status: "em_dia", originalCents: 350000,
    installmentCents: 350000, balanceCents: 350000, installmentsKnown: false, monthlyRate: null, dueDay: 5,
    riskPriority: false,
  },
];

export function seedDebts(): Debt[] {
  return SEED_DEBTS.map((d, i) => ({ ...d, id: `seed-${i + 1}`, charges: [] }));
}
