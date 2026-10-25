import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, connect, createUser, deleteUsers } from "./helpers";

let db: pg.Client;
let david: string;
let paola: string;
let intruso: string;
let householdId: string;
let inviteCode: string;

beforeAll(async () => {
  db = connect();
  await db.connect();
  david = await createUser(db, "david");
  paola = await createUser(db, "paola");
  intruso = await createUser(db, "intruso");
});

afterAll(async () => {
  await deleteUsers(db, [david, paola, intruso]);
  await db.end();
});

describe("casa e membros", () => {
  it("David cria a casa e vira membro", async () => {
    householdId = await asUser(db, david, async (q) => {
      const { rows } = await q("select create_household('Casa David & Paola', 'David') as id");
      return rows[0].id;
    });
    const house = await asUser(db, david, (q) => q("select * from households"));
    expect(house.rows).toHaveLength(1);
    expect(house.rows[0].reserve_target_cents).toBe("100000"); // R$ 1.000 padrão
    inviteCode = house.rows[0].invite_code;
    expect(inviteCode).toMatch(/^[0-9A-F]{8}$/);
  });

  it("não deixa criar uma segunda casa para o mesmo usuário", async () => {
    await expect(
      asUser(db, david, (q) => q("select create_household('Outra', 'David')")),
    ).rejects.toThrow(/já pertence/);
  });

  it("código errado não entra", async () => {
    await expect(
      asUser(db, intruso, (q) => q("select join_household('XXXXXXXX', 'Intruso')")),
    ).rejects.toThrow(/inválido/);
  });

  it("Paola entra com o código (minúsculas e espaços aceitos) e os dois veem os mesmos dados", async () => {
    await asUser(db, paola, (q) =>
      q("select join_household($1, 'Paola')", [` ${inviteCode.toLowerCase()} `]),
    );
    for (const user of [david, paola]) {
      const members = await asUser(db, user, (q) =>
        q("select display_name from household_members order by display_name"),
      );
      expect(members.rows.map((r) => r.display_name)).toEqual(["David", "Paola"]);
      const house = await asUser(db, user, (q) => q("select id from households"));
      expect(house.rows).toEqual([{ id: householdId }]);
    }
  });

  it("usuário de fora não vê nada", async () => {
    const house = await asUser(db, intruso, (q) => q("select * from households"));
    const members = await asUser(db, intruso, (q) => q("select * from household_members"));
    expect(house.rows).toHaveLength(0);
    expect(members.rows).toHaveLength(0);
  });

  it("visitante anônimo não vê nada e não pode criar casa", async () => {
    const house = await asUser(db, null, (q) => q("select * from households"));
    expect(house.rows).toHaveLength(0);
    await expect(
      asUser(db, null, (q) => q("select create_household('X', 'Y')")),
    ).rejects.toThrow(/permission denied/);
  });

  it("usuário de fora não altera a casa (update não afeta linha nenhuma)", async () => {
    const result = await asUser(db, intruso, (q) =>
      q("update households set name = 'hackeada' where id = $1", [householdId]),
    );
    expect(result.rowCount).toBe(0);
  });

  it("membro altera configurações da casa", async () => {
    await asUser(db, paola, (q) =>
      q("update households set reserve_target_cents = 150000 where id = $1", [householdId]),
    );
    const house = await asUser(db, david, (q) => q("select reserve_target_cents from households"));
    expect(house.rows[0].reserve_target_cents).toBe("150000");
  });

  it("ninguém insere membro direto (só por convite)", async () => {
    await expect(
      asUser(db, david, (q) =>
        q("insert into household_members (household_id, user_id, display_name) values ($1, $2, 'X')", [
          householdId,
          intruso,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("cada membro edita só as próprias preferências", async () => {
    const other = await asUser(db, paola, (q) =>
      q("update household_members set display_name = 'Hack' where user_id = $1", [david]),
    );
    expect(other.rowCount).toBe(0);
    const own = await asUser(db, paola, (q) =>
      q("update household_members set email_alerts = false where user_id = $1", [paola]),
    );
    expect(own.rowCount).toBe(1);
  });

  it("membro não troca de casa via update", async () => {
    await expect(
      asUser(db, paola, (q) =>
        q("update household_members set household_id = gen_random_uuid() where user_id = $1", [paola]),
      ),
    ).rejects.toThrow();
  });

  it("código de convite só muda pela função própria", async () => {
    await expect(
      asUser(db, david, (q) => q("update households set invite_code = 'AAAAAAAA' where id = $1", [householdId])),
    ).rejects.toThrow(/regenerate_invite_code/);
    const code = await asUser(db, david, async (q) => (await q("select regenerate_invite_code() as c")).rows[0].c);
    expect(code).not.toBe(inviteCode);
    await expect(
      asUser(db, intruso, (q) => q("select join_household($1, 'Intruso')", [inviteCode])),
    ).rejects.toThrow(/inválido/);
  });
});
