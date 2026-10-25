import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, connect, createUser, deleteUsers } from "./helpers";

let db: pg.Client;
let david: string;
let paola: string;

beforeAll(async () => {
  db = connect();
  await db.connect();
  david = await createUser(db, "david");
  paola = await createUser(db, "paola");
  const code = await asUser(db, david, async (q) => {
    await q("select create_household('Casa', 'David')");
    return (await q("select invite_code from households")).rows[0].invite_code;
  });
  await asUser(db, paola, (q) => q("select join_household($1, 'Paola')", [code]));
});

afterAll(async () => {
  await deleteUsers(db, [david, paola]);
  await db.end();
});

describe("alertas", () => {
  it("usuários comuns não acessam a lista de destinatários (e-mails)", async () => {
    await expect(asUser(db, david, (q) => q("select * from alert_recipients()"))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, null, (q) => q("select * from alert_recipients()"))).rejects.toThrow(/permission denied/);
  });

  it("service role lista quem quer alerta; quem desativou fica de fora", async () => {
    await asUser(db, paola, (q) => q("update household_members set email_alerts = false where user_id = $1", [paola]));
    await db.query("begin; set local role service_role");
    const { rows } = await db.query("select * from alert_recipients() where user_id = any($1)", [[david, paola]]);
    await db.query("commit");
    expect(rows.map((r) => r.display_name)).toEqual(["David"]);
    expect(rows[0].alert_days_before).toBe(3);
    expect(rows[0].email).toMatch(/@teste\.local$/);
  });

  it("alert_log não deixa repetir o mesmo aviso e usuário não grava direto", async () => {
    const house = await asUser(db, david, async (q) => (await q("select current_household_id() as h")).rows[0].h);
    const src = "00000000-0000-0000-0000-000000000001";
    await db.query(
      "insert into alert_log (household_id, user_id, source_type, source_id, due_date) values ($1, $2, 'debt', $3, '2026-10-30')",
      [house, david, src],
    );
    await expect(
      db.query(
        "insert into alert_log (household_id, user_id, source_type, source_id, due_date) values ($1, $2, 'debt', $3, '2026-10-30')",
        [house, david, src],
      ),
    ).rejects.toThrow(/duplicate key/);
    await expect(
      asUser(db, david, (q) =>
        q("insert into alert_log (household_id, user_id, source_type, source_id, due_date) values ($1, $2, 'debt', $3, '2026-11-30')", [
          house, david, src,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
    const mine = await asUser(db, david, async (q) => (await q("select count(*)::int as n from alert_log")).rows[0].n);
    const hers = await asUser(db, paola, async (q) => (await q("select count(*)::int as n from alert_log")).rows[0].n);
    expect([mine, hers]).toEqual([1, 0]);
  });
});
