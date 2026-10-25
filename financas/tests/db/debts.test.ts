import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { accrue, debtTotals } from "@/lib/finance/debts";
import { seedDebts } from "@/lib/finance/seed";
import { todayISO } from "@/lib/finance/dates";
import { asUser, connect, createUser, deleteUsers } from "./helpers";

let db: pg.Client;
let david: string;
let paola: string;
let intruso: string;

const debtId = async (user: string, name: string): Promise<string> =>
  asUser(db, user, async (q) => (await q("select id from debts where name = $1", [name])).rows[0].id);

const overview = async (user: string, name: string) =>
  asUser(db, user, async (q) => (await q("select * from debts_overview where name = $1", [name])).rows[0]);

beforeAll(async () => {
  db = connect();
  await db.connect();
  david = await createUser(db, "david");
  paola = await createUser(db, "paola");
  intruso = await createUser(db, "intruso");
  const code = await asUser(db, david, async (q) => {
    await q("select create_household('Casa', 'David')");
    return (await q("select invite_code from households")).rows[0].invite_code;
  });
  await asUser(db, paola, (q) => q("select join_household($1, 'Paola')", [code]));
  await asUser(db, intruso, (q) => q("select create_household('Outra casa', 'Intruso')"));
});

afterAll(async () => {
  await deleteUsers(db, [david, paola, intruso]);
  await db.end();
});

describe("seed e totais", () => {
  it("carrega as 13 dívidas do seed e o total bate R$ 42.344 (igual à lib)", async () => {
    await asUser(db, david, (q) => q("select load_seed_debts()"));
    const totals = await asUser(db, paola, async (q) =>
      (
        await q(`select count(*)::int as n,
                        sum(current_balance_cents) filter (where status <> 'quitada')::bigint as total,
                        sum(current_balance_cents) filter (where kind = 'conta_em_atraso')::bigint as atraso
                 from debts_overview`)
      ).rows[0],
    );
    expect(totals.n).toBe(13);
    expect(Number(totals.total)).toBe(4234400);
    expect(Number(totals.atraso)).toBe(1327000);
    // a lib calcula o mesmo
    expect(debtTotals(seedDebts().map((d) => accrue(d, todayISO()))).total).toBe(Number(totals.total));
  });

  it("não carrega o seed duas vezes", async () => {
    await expect(asUser(db, paola, (q) => q("select load_seed_debts()"))).rejects.toThrow(/já tem dívidas/);
  });

  it("lançar juros de novo não duplica", async () => {
    const n = await asUser(db, david, async (q) => (await q("select accrue_charges() as n")).rows[0].n);
    expect(n).toBe(0);
  });

  it("não lança juros de meses futuros", async () => {
    await expect(asUser(db, david, (q) => q("select accrue_charges('2099-01-01')"))).rejects.toThrow(/futuros/);
  });
});

describe("pagamentos", () => {
  it("agiota: R$ 2.000 → 1.200 de juros + 800 de principal, com quem lançou", async () => {
    const id = await debtId(paola, "Agiota 1");
    await asUser(db, paola, (q) => q("select register_payment($1, '2026-10-30', 200000, 'pago em dinheiro')", [id]));
    const d = await overview(david, "Agiota 1");
    expect(Number(d.principal_cents)).toBe(220000);
    expect(Number(d.current_balance_cents)).toBe(220000);
    expect(Number(d.interest_paid_cents)).toBe(120000);
    const pay = await asUser(db, david, async (q) => (await q("select * from debt_payments where debt_id = $1", [id])).rows[0]);
    expect(Number(pay.interest_cents)).toBe(120000);
    expect(Number(pay.principal_cents)).toBe(80000);
    expect(pay.created_by).toBe(paola);
  });

  it("parcelada: pagar uma parcela reduz saldo e parcelas restantes", async () => {
    const id = await debtId(david, "Cartão do sogro (entrada do carro)");
    await asUser(db, david, (q) => q("select register_payment($1, '2026-10-30', 333300)", [id]));
    const d = await overview(david, "Cartão do sogro (entrada do carro)");
    expect(Number(d.current_balance_cents)).toBe(666600);
    expect(d.installments_remaining).toBe(2);
  });

  it("não aceita valor acima do saldo nem zero", async () => {
    const id = await debtId(david, "Luz");
    await expect(asUser(db, david, (q) => q("select register_payment($1, '2026-10-25', 22001)", [id]))).rejects.toThrow(
      /maior que o saldo/,
    );
    await expect(asUser(db, david, (q) => q("select register_payment($1, '2026-10-25', 0)", [id]))).rejects.toThrow(
      /maior que zero/,
    );
  });

  it("quitar conta em atraso marca como quitada; desfazer volta", async () => {
    const id = await debtId(david, "Luz");
    await asUser(db, david, (q) => q("select register_payment($1, '2026-10-25', 22000)", [id]));
    expect((await overview(david, "Luz")).status).toBe("quitada");
    await asUser(db, paola, (q) => q("select undo_last_payment($1)", [id]));
    const d = await overview(david, "Luz");
    expect(d.status).toBe("em_atraso");
    expect(Number(d.current_balance_cents)).toBe(22000);
  });

  it("desfazer pagamento do agiota devolve juros em aberto e principal", async () => {
    const id = await debtId(david, "Agiota 1");
    await asUser(db, david, (q) => q("select undo_last_payment($1)", [id]));
    const d = await overview(david, "Agiota 1");
    expect(Number(d.principal_cents)).toBe(300000);
    expect(Number(d.open_charges_cents)).toBe(120000);
    expect(Number(d.current_balance_cents)).toBe(420000);
  });

  it("carro sem nº de parcelas: pagamento registrado, saldo continua R$ 3.500", async () => {
    const id = await debtId(david, "Parcela do carro");
    await asUser(db, david, (q) => q("select register_payment($1, '2026-10-05', 350000)", [id]));
    const d = await overview(david, "Parcela do carro");
    expect(Number(d.current_balance_cents)).toBe(350000);
    expect(Number(d.total_paid_cents)).toBe(350000);
    expect(d.status).toBe("em_dia");
  });
});

describe("conta em atraso com multa e juros", () => {
  it("lança multa única + juros simples por mês desde o vencimento", async () => {
    await asUser(db, david, (q) =>
      q(`insert into debts (household_id, name, kind, status, original_cents, principal_cents,
                            original_due_date, late_fee_rate, late_interest_rate)
         values (current_household_id(), 'Conta com multa', 'conta_em_atraso', 'em_atraso', 100000, 100000,
                 '2026-08-10', 0.02, 0.01)`),
    );
    await asUser(db, david, (q) => q("select accrue_charges()"));
    const d = await overview(david, "Conta com multa");
    expect(Number(d.open_charges_cents)).toBe(2000 + 1000 + 1000); // multa ago + juros set/out
    expect(Number(d.current_balance_cents)).toBe(104000);
  });
});

describe("RLS das dívidas", () => {
  it("outra casa não vê dívidas, pagamentos nem juros", async () => {
    const counts = await asUser(db, intruso, async (q) =>
      (
        await q(`select (select count(*) from debts)::int as d, (select count(*) from debt_payments)::int as p,
                        (select count(*) from debt_charges)::int as c, (select count(*) from debts_overview)::int as o`)
      ).rows[0],
    );
    expect(counts).toEqual({ d: 0, p: 0, c: 0, o: 0 });
  });

  it("outra casa não registra pagamento, não desfaz, não altera nem apaga", async () => {
    const id = await debtId(david, "Agiota 2");
    await expect(asUser(db, intruso, (q) => q("select register_payment($1, '2026-10-25', 100)", [id]))).rejects.toThrow(
      /não encontrada/,
    );
    await expect(asUser(db, intruso, (q) => q("select undo_last_payment($1)", [id]))).rejects.toThrow(/não encontrada/);
    const upd = await asUser(db, intruso, (q) => q("update debts set principal_cents = 0 where id = $1", [id]));
    const del = await asUser(db, intruso, (q) => q("delete from debts where id = $1", [id]));
    expect(upd.rowCount).toBe(0);
    expect(del.rowCount).toBe(0);
  });

  it("não cria dívida em outra casa", async () => {
    const otherHouse = await asUser(db, david, async (q) => (await q("select current_household_id() as h")).rows[0].h);
    await expect(
      asUser(db, intruso, (q) =>
        q(`insert into debts (household_id, name, kind, original_cents, principal_cents)
           values ($1, 'x', 'conta_em_atraso', 1, 1)`, [otherHouse]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("membro não grava juros nem pagamentos direto (só pelas funções)", async () => {
    const id = await debtId(david, "Agiota 2");
    await expect(
      asUser(db, david, (q) =>
        q(`insert into debt_payments (household_id, debt_id, paid_on, amount_cents)
           values (current_household_id(), $1, '2026-10-25', 100)`, [id]),
      ),
    ).rejects.toThrow(/row-level security/);
    const upd = await asUser(db, david, (q) => q("update debt_charges set paid_cents = amount_cents"));
    expect(upd.rowCount).toBe(0);
  });
});
