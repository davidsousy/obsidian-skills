import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

describe("renda", () => {
  it("David lança o Uber do dia; Paola vê", async () => {
    await asUser(db, david, (q) =>
      q(`insert into uber_days (household_id, worked_on, gross_cents, hours)
         values (current_household_id(), '2026-10-24', 28000, 8.5)`),
    );
    const rows = await asUser(db, paola, async (q) => (await q("select * from uber_days")).rows);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].hours)).toBe(8.5);
    expect(rows[0].created_by).toBe(david);
  });

  it("um lançamento por dia: upsert substitui o dia", async () => {
    await expect(
      asUser(db, paola, (q) =>
        q(`insert into uber_days (household_id, worked_on, gross_cents, hours)
           values (current_household_id(), '2026-10-24', 1, 1)`),
      ),
    ).rejects.toThrow(/duplicate key/);
    await asUser(db, david, (q) =>
      q(`insert into uber_days (household_id, worked_on, gross_cents, hours)
         values (current_household_id(), '2026-10-24', 30000, 9)
         on conflict (household_id, worked_on) do update set gross_cents = excluded.gross_cents, hours = excluded.hours`),
    );
    const row = await asUser(db, david, async (q) => (await q("select gross_cents, hours from uber_days")).rows[0]);
    expect(Number(row.gross_cents)).toBe(30000);
  });

  it("horas precisam ser entre 0 e 24", async () => {
    await expect(
      asUser(db, david, (q) =>
        q(`insert into uber_days (household_id, worked_on, gross_cents, hours)
           values (current_household_id(), '2026-10-25', 100, 25)`),
      ),
    ).rejects.toThrow(/check/);
  });

  it("Paola lança o salário; quem recebeu precisa ser membro", async () => {
    await asUser(db, paola, (q) =>
      q(`insert into income_entries (household_id, received_on, amount_cents, source, earner_user_id)
         values (current_household_id(), '2026-10-05', 250000, 'salario', $1)`, [paola]),
    );
    await expect(
      asUser(db, paola, (q) =>
        q(`insert into income_entries (household_id, received_on, amount_cents, earner_user_id)
           values (current_household_id(), '2026-10-05', 100, $1)`, [intruso]),
      ),
    ).rejects.toThrow(/não é membro/);
  });
});

describe("RLS de renda", () => {
  it("outra casa não vê, não altera e não apaga", async () => {
    const seen = await asUser(db, intruso, async (q) =>
      (await q("select (select count(*) from uber_days)::int as u, (select count(*) from income_entries)::int as i")).rows[0],
    );
    expect(seen).toEqual({ u: 0, i: 0 });
    expect((await asUser(db, intruso, (q) => q("update uber_days set gross_cents = 0"))).rowCount).toBe(0);
    expect((await asUser(db, intruso, (q) => q("delete from income_entries"))).rowCount).toBe(0);
  });

  it("não insere na casa dos outros", async () => {
    const house = await asUser(db, david, async (q) => (await q("select current_household_id() as h")).rows[0].h);
    await expect(
      asUser(db, intruso, (q) =>
        q(`insert into uber_days (household_id, worked_on, gross_cents, hours) values ($1, '2026-10-01', 1, 1)`, [house]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});
