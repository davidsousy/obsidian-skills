import { describe, expect, it } from "vitest";
import { emailDues, interestOverPaid, overdueItems, upcomingDues, type PaymentRef } from "./alerts";
import { accrue, type Debt } from "./debts";
import { seedDebts } from "./seed";
import { seedFixedCosts } from "./seed-costs";

const TODAY = "2026-10-25";
const debts = (): Debt[] => seedDebts().map((d) => accrue(d, TODAY));
const pay = (debts: Debt[], name: string, paidOn: string, reais: number, interest = 0): PaymentRef => ({
  debtId: debts.find((d) => d.name === name)!.id, paidOn, amountCents: reais * 100, interestCents: interest * 100,
});

describe("próximos vencimentos (7 dias)", () => {
  it("seed em 25/10: dia 30 (sogro, amigo, agiotas) e nada dos custos fixos de outubro", () => {
    const due = upcomingDues(debts(), [], seedFixedCosts(), TODAY, 7);
    expect(due.map((d) => [d.dueDate, d.name, d.amountCents])).toEqual([
      ["2026-10-30", "Agiota 1", 120000],
      ["2026-10-30", "Agiota 2", 37500],
      ["2026-10-30", "Cartão do sogro (entrada do carro)", 333300],
      ["2026-10-30", "Empréstimo do amigo", 125000],
    ]);
  });

  it("janela que vira o mês inclui o dia 5 de novembro (carro, aluguel, condomínio)", () => {
    const due = upcomingDues(debts(), [], seedFixedCosts(), "2026-10-30", 7);
    const names = due.map((d) => `${d.dueDate} ${d.name}`);
    expect(names).toContain("2026-11-05 Parcela do carro");
    expect(names).toContain("2026-11-05 Aluguel");
    expect(names).toContain("2026-11-05 Condomínio");
  });

  it("parcela já paga no mês não aparece", () => {
    const d = debts();
    const due = upcomingDues(d, [pay(d, "Empréstimo do amigo", "2026-10-24", 1250)], [], TODAY, 7);
    expect(due.map((x) => x.name)).not.toContain("Empréstimo do amigo");
  });

  it("agiota com juros do mês pagos não aparece; próximo mês estima principal × taxa", () => {
    const d = debts().map((x) => (x.name === "Agiota 2" ? { ...x, charges: x.charges.map((c) => ({ ...c, paidCents: c.amountCents })) } : x));
    expect(upcomingDues(d, [], [], TODAY, 7).map((x) => x.name)).not.toContain("Agiota 2");
    const nov = upcomingDues(d, [], [], "2026-11-25", 7).find((x) => x.name === "Agiota 2")!;
    expect(nov.amountCents).toBe(37500);
  });
});

describe("em atraso", () => {
  it("contas em atraso do seed + distrato vencido no dia 15 sem pagamento", () => {
    const items = overdueItems(debts(), [], TODAY);
    expect(items.filter((i) => i.reason.startsWith("em atraso")).map((i) => i.name)).toHaveLength(7);
    expect(items.find((i) => i.name === "Distrato Gabriel / Interage")).toMatchObject({ amountCents: 150000, reason: "parcela vencida em 15/10" });
    expect(items.find((i) => i.name === "Parcela do carro")).toMatchObject({ reason: "parcela vencida em 05/10" });
  });

  it("parcela paga no mês não fica em atraso", () => {
    const d = debts();
    const items = overdueItems(d, [pay(d, "Distrato Gabriel / Interage", "2026-10-15", 1500)], TODAY);
    expect(items.map((i) => i.name)).not.toContain("Distrato Gabriel / Interage");
  });
});

describe("juros maiores que o pago", () => {
  it("agiotas sem pagamento aparecem; com pagamento maior que os juros, não", () => {
    const d = debts();
    expect(interestOverPaid(d, []).map((i) => i.name)).toEqual(["Agiota 1", "Agiota 2"]);
    expect(interestOverPaid(d, [pay(d, "Agiota 1", "2026-10-25", 2000, 1200)]).map((i) => i.name)).toEqual(["Agiota 2"]);
  });
});

describe("e-mail", () => {
  it("manda só o que vence exatamente daqui a N dias", () => {
    const due = upcomingDues(debts(), [], seedFixedCosts(), "2026-10-27", 7);
    expect(emailDues(due, "2026-10-27", 3).map((d) => d.dueDate)).toEqual(["2026-10-30", "2026-10-30", "2026-10-30", "2026-10-30"]);
    expect(emailDues(due, "2026-10-27", 2)).toEqual([]);
  });
});
