import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixedMonthlyTotal } from "@/lib/finance/costs";
import { seedFixedCosts } from "@/lib/finance/seed-costs";
import { asUser, connect, createUser, deleteUsers } from "./helpers";

let db: pg.Client;
let david: string;
let paola: string;
let intruso: string;

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

describe("custos fixos", () => {
  it("seed: 17 custos, total R$ 10.931 (igual à lib), responsáveis ligados a David e Paola", async () => {
    await asUser(db, paola, (q) => q("select load_seed_fixed_costs()"));
    const r = await asUser(db, david, async (q) =>
      (
        await q(`select count(*)::int as n, sum(amount_cents)::bigint as total,
                        count(*) filter (where owner_user_id = $1)::int as do_david,
                        count(*) filter (where owner_user_id = $2)::int as da_paola,
                        count(*) filter (where is_approximate)::int as aprox,
                        count(*) filter (where starts_on = '2026-11-01')::int as a_partir_nov
                 from fixed_costs`, [david, paola])
      ).rows[0],
    );
    expect(r.n).toBe(17);
    expect(Number(r.total)).toBe(1093100);
    expect(Number(r.total)).toBe(fixedMonthlyTotal(seedFixedCosts()));
    expect(r.do_david).toBe(3); // recarga, limpeza, Claude Code David
    expect(r.da_paola).toBe(4); // Uber, cílios, Claude Code Paola, internet
    expect(r.aprox).toBe(5); // alimentação, recarga, água, luz, limpeza
    expect(r.a_partir_nov).toBe(5);
  });

  it("não carrega o seed duas vezes", async () => {
    await expect(asUser(db, david, (q) => q("select load_seed_fixed_costs()"))).rejects.toThrow(/já tem custos/);
  });

  it("responsável precisa ser membro da casa", async () => {
    await expect(
      asUser(db, david, (q) =>
        q(`insert into fixed_costs (household_id, name, amount_cents, category, owner_user_id)
           values (current_household_id(), 'X', 100, 'lazer', $1)`, [intruso]),
      ),
    ).rejects.toThrow(/não é membro/);
  });
});

describe("gastos variáveis", () => {
  it("membro lança e o outro vê", async () => {
    await asUser(db, paola, (q) =>
      q(`insert into variable_expenses (household_id, spent_on, amount_cents, category, description, spent_by)
         values (current_household_id(), '2026-10-24', 8750, 'alimentacao', 'mercado', $1)`, [paola]),
    );
    const rows = await asUser(db, david, async (q) => (await q("select * from variable_expenses")).rows);
    expect(rows).toHaveLength(1);
    expect(rows[0].created_by).toBe(paola);
    expect(Number(rows[0].amount_cents)).toBe(8750);
  });

  it("valor precisa ser positivo", async () => {
    await expect(
      asUser(db, david, (q) =>
        q(`insert into variable_expenses (household_id, spent_on, amount_cents, category)
           values (current_household_id(), '2026-10-24', 0, 'lazer')`),
      ),
    ).rejects.toThrow(/check/);
  });
});

describe("RLS de custos", () => {
  it("outra casa não vê, não altera e não apaga", async () => {
    const seen = await asUser(db, intruso, async (q) =>
      (await q("select (select count(*) from fixed_costs)::int as f, (select count(*) from variable_expenses)::int as v")).rows[0],
    );
    expect(seen).toEqual({ f: 0, v: 0 });
    const upd = await asUser(db, intruso, (q) => q("update fixed_costs set amount_cents = 0"));
    const del = await asUser(db, intruso, (q) => q("delete from variable_expenses"));
    expect(upd.rowCount).toBe(0);
    expect(del.rowCount).toBe(0);
  });

  it("não insere em outra casa nem move lançamento de casa", async () => {
    const house = await asUser(db, david, async (q) => (await q("select current_household_id() as h")).rows[0].h);
    await expect(
      asUser(db, intruso, (q) =>
        q(`insert into fixed_costs (household_id, name, amount_cents, category) values ($1, 'x', 1, 'lazer')`, [house]),
      ),
    ).rejects.toThrow(/row-level security/);
    const other = await asUser(db, intruso, async (q) => (await q("select current_household_id() as h")).rows[0].h);
    await expect(
      asUser(db, david, (q) => q("update fixed_costs set household_id = $1 where name = 'Netflix'", [other])),
    ).rejects.toThrow();
  });
});
