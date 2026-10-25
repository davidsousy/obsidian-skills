import { describe, expect, it } from "vitest";
import {
  accrue,
  applyPayment,
  chargesToAccrue,
  debtBalance,
  debtGroup,
  debtTotals,
  installmentsRemaining,
  interestByMonth,
  PaymentError,
  presentValue,
  type Debt,
} from "./debts";
import { seedDebts } from "./seed";

const TODAY = "2026-10-25";

function seed(): Debt[] {
  return seedDebts().map((d) => accrue(d, TODAY));
}

function byName(debts: Debt[], name: string): Debt {
  return debts.find((d) => d.name === name)!;
}

describe("seed de outubro/2026", () => {
  it("total de dívidas = R$ 42.344 (inclui os juros de outubro dos agiotas)", () => {
    const totals = debtTotals(seed());
    expect(totals.total).toBe(4234400);
    expect(totals.byGroup.atraso).toBe(1327000);
    expect(totals.byGroup.agiotas).toBe(450000 + 157500);
    expect(totals.byGroup.parceladas).toBe(999900 + 500000 + 450000 + 350000);
    expect(totals.overdue).toBe(1327000);
  });

  it("sem os juros do mês o total seria R$ 40.769", () => {
    expect(debtTotals(seedDebts()).total).toBe(4076900);
  });

  it("agrupa em atraso / agiotas / parceladas", () => {
    const groups = seed().map((d) => [d.name, debtGroup(d)]);
    expect(groups.filter(([, g]) => g === "atraso")).toHaveLength(7);
    expect(groups.filter(([, g]) => g === "agiotas")).toHaveLength(2);
    expect(groups.filter(([, g]) => g === "parceladas")).toHaveLength(4);
  });

  it("parcelas restantes; carro sem número informado", () => {
    const debts = seed();
    expect(installmentsRemaining(byName(debts, "Cartão do sogro (entrada do carro)"))).toBe(3);
    expect(installmentsRemaining(byName(debts, "Empréstimo do amigo"))).toBe(4);
    expect(installmentsRemaining(byName(debts, "Parcela do carro"))).toBeNull();
  });
});

describe("agiota (juros sobre principal)", () => {
  it("lança os juros de outubro: 40% de 3.000 = 1.200 e 25% de 1.500 = 375", () => {
    const debts = seed();
    expect(byName(debts, "Agiota 1").charges.map((c) => c.amountCents)).toEqual([120000]);
    expect(byName(debts, "Agiota 2").charges.map((c) => c.amountCents)).toEqual([37500]);
    expect(debtBalance(byName(debts, "Agiota 1"))).toBe(420000);
  });

  it("lançamento é idempotente", () => {
    const a1 = byName(seed(), "Agiota 1");
    expect(chargesToAccrue(a1, TODAY)).toEqual([]);
    expect(accrue(a1, TODAY)).toBe(a1);
  });

  it("pagamento abate primeiro os juros, o excedente reduz o principal; juros caem no mês seguinte", () => {
    const a1 = byName(seed(), "Agiota 1");
    const paid = applyPayment(a1, 200000); // paga R$ 2.000 em 30/10
    expect(paid.interestCents).toBe(120000);
    expect(paid.principalCents).toBe(80000);
    expect(paid.debt.principalCents).toBe(220000);

    const nov = accrue(paid.debt, "2026-11-10");
    expect(nov.charges.at(-1)).toMatchObject({ referenceMonth: "2026-11-01", baseCents: 220000, amountCents: 88000 });
    expect(debtBalance(nov)).toBe(220000 + 88000);
  });

  it("pagamento só de juros não mexe no principal", () => {
    const paid = applyPayment(byName(seed(), "Agiota 1"), 120000);
    expect(paid.interestCents).toBe(120000);
    expect(paid.principalCents).toBe(0);
    expect(paid.debt.principalCents).toBe(300000);
  });

  it("pagamento parcial dos juros deixa o resto em aberto", () => {
    const paid = applyPayment(byName(seed(), "Agiota 1"), 50000);
    expect(paid.interestCents).toBe(50000);
    expect(debtBalance(paid.debt)).toBe(370000);
  });

  it("juros não pagos acumulam sem juros sobre juros", () => {
    const a1 = accrue(byName(seed(), "Agiota 1"), "2026-12-05"); // out, nov, dez sem pagar
    expect(a1.charges.map((c) => c.amountCents)).toEqual([120000, 120000, 120000]);
    expect(debtBalance(a1)).toBe(300000 + 360000);
  });

  it("quitar tudo marca como quitada e para de lançar juros", () => {
    const a2 = byName(seed(), "Agiota 2");
    const paid = applyPayment(a2, 187500);
    expect(paid.debt.status).toBe("quitada");
    expect(debtBalance(paid.debt)).toBe(0);
    expect(chargesToAccrue(paid.debt, "2027-01-10")).toEqual([]);
  });

  it("mostra juros por mês", () => {
    const paid = applyPayment(byName(seed(), "Agiota 1"), 200000).debt;
    expect(interestByMonth(accrue(paid, "2026-11-01"))).toEqual([
      { month: "2026-10-01", chargedCents: 120000, paidCents: 120000 },
      { month: "2026-11-01", chargedCents: 88000, paidCents: 0 },
    ]);
  });
});

describe("parceladas", () => {
  it("pagar uma parcela reduz saldo e parcelas restantes", () => {
    const sogro = byName(seed(), "Cartão do sogro (entrada do carro)");
    const r = applyPayment(sogro, 333300);
    expect(r.installmentsCovered).toBe(1);
    expect(r.debt.balanceCents).toBe(666600);
    expect(installmentsRemaining(r.debt)).toBe(2);
  });

  it("pagamento parcial não conta parcela inteira", () => {
    const amigo = byName(seed(), "Empréstimo do amigo");
    const r = applyPayment(amigo, 50000);
    expect(r.installmentsCovered).toBe(0);
    expect(installmentsRemaining(r.debt)).toBe(4); // 4.500 restantes ainda são 4 parcelas (a última menor)
    const r2 = applyPayment(r.debt, 75000);
    expect(r2.installmentsCovered).toBe(1);
    expect(installmentsRemaining(r2.debt)).toBe(3);
  });

  it("última parcela quita", () => {
    let distrato = byName(seed(), "Distrato Gabriel / Interage");
    for (let i = 0; i < 3; i++) distrato = applyPayment(distrato, 150000).debt;
    expect(distrato.status).toBe("quitada");
    expect(() => applyPayment(distrato, 100)).toThrow(PaymentError);
  });

  it("não aceita pagar mais que o saldo", () => {
    expect(() => applyPayment(byName(seed(), "Distrato Gabriel / Interage"), 450001)).toThrow(PaymentError);
  });

  it("carro sem nº de parcelas: pagamento registra mas saldo continua sendo a parcela do mês", () => {
    const carro = byName(seed(), "Parcela do carro");
    const r = applyPayment(carro, 350000);
    expect(r.installmentsCovered).toBe(1);
    expect(debtBalance(r.debt)).toBe(350000);
    expect(r.debt.status).toBe("em_dia");
  });

  it("valor presente (quitação antecipada) pela Tabela Price", () => {
    expect(presentValue(100000, 12, 0)).toBe(1200000);
    // 12 × R$ 1.000 a 2% a.m. ≈ R$ 10.575,34
    expect(presentValue(100000, 12, 0.02)).toBe(1057534);
  });
});

describe("conta em atraso", () => {
  const base: Debt = {
    id: "x", name: "Conta", kind: "conta_em_atraso", status: "em_atraso", originalCents: 100000,
    principalCents: 100000, dueDay: null, riskPriority: false, charges: [],
    originalDueDate: "2026-08-10", lateFeeRate: 0.02, lateInterestRate: 0.01,
  };

  it("sem taxa: saldo fixo", () => {
    const semTaxa = { ...base, lateFeeRate: null, lateInterestRate: null };
    expect(chargesToAccrue(semTaxa, TODAY)).toEqual([]);
    expect(debtBalance(semTaxa)).toBe(100000);
  });

  it("multa única no mês do vencimento + juros simples ao mês sobre o original", () => {
    const d = accrue(base, TODAY); // venceu em ago: multa ago, juros set e out
    expect(d.charges.map((c) => [c.kind, c.referenceMonth, c.amountCents])).toEqual([
      ["multa", "2026-08-01", 2000],
      ["juros", "2026-09-01", 1000],
      ["juros", "2026-10-01", 1000],
    ]);
    expect(debtBalance(d)).toBe(104000);
  });

  it("pagamento paga multa e juros antes do principal", () => {
    const r = applyPayment(accrue(base, TODAY), 10000);
    expect(r.interestCents).toBe(4000);
    expect(r.principalCents).toBe(6000);
    expect(debtBalance(r.debt)).toBe(94000);
  });
});
