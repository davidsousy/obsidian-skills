import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, connect, createUser, deleteUsers } from "./helpers";

let db: pg.Client;
let david: string;
let paola: string;
let intruso: string;

const debt = async (name: string) =>
  asUser(db, david, async (q) => (await q("select * from debts_overview where name = $1", [name])).rows[0]);

beforeAll(async () => {
  db = connect();
  await db.connect();
  david = await createUser(db, "david");
  paola = await createUser(db, "paola");
  intruso = await createUser(db, "intruso");
  const code = await asUser(db, david, async (q) => {
    await q("select create_household('Casa', 'David')");
    await q("select load_seed_debts()");
    return (await q("select invite_code from households")).rows[0].invite_code;
  });
  await asUser(db, paola, (q) => q("select join_household($1, 'Paola')", [code]));
  await asUser(db, intruso, (q) => q("select create_household('Outra casa', 'Intruso')"));
});

afterAll(async () => {
  await deleteUsers(db, [david, paola, intruso]);
  await db.end();
});

describe("negociação do aluguel antigo", () => {
  let negotiation: string;
  let proposal: string;

  it("abre negociação (uma aberta por dívida)", async () => {
    const d = await debt("Aluguel do apto antigo (2 meses)");
    negotiation = await asUser(db, paola, async (q) => (await q("select open_negotiation($1) as id", [d.id])).rows[0].id);
    await expect(asUser(db, david, (q) => q("select open_negotiation($1)", [d.id]))).rejects.toThrow(/Já existe/);
    expect((await debt("Aluguel do apto antigo (2 meses)")).status).toBe("em_negociacao");
  });

  it("registra contato e propostas", async () => {
    await asUser(db, paola, (q) =>
      q(`insert into negotiation_entries (household_id, negotiation_id, occurred_on, kind, conditions)
         values (current_household_id(), $1, '2026-10-20', 'contato', 'liguei para o proprietário')`, [negotiation]),
    );
    await asUser(db, david, (q) =>
      q(`insert into negotiation_entries (household_id, negotiation_id, occurred_on, kind, amount_cents, installments, conditions)
         values (current_household_id(), $1, '2026-10-21', 'proposta_feita', 300000, 3, '3 × 1.000 sem juros')`, [negotiation]),
    );
    proposal = await asUser(db, david, async (q) =>
      (
        await q(`insert into negotiation_entries (household_id, negotiation_id, occurred_on, kind, amount_cents, installments, conditions)
                 values (current_household_id(), $1, '2026-10-22', 'proposta_recebida', 400000, 4, 'contraproposta')
                 returning id`, [negotiation])
      ).rows[0].id,
    );
    const n = await asUser(db, paola, async (q) => (await q("select count(*)::int as n from negotiation_entries")).rows[0].n);
    expect(n).toBe(3);
  });

  it("aceitar converte em parcelada, guarda o histórico e fecha a negociação", async () => {
    await asUser(db, paola, (q) => q("select accept_proposal($1, 400000, 4, 10::smallint)", [proposal]));
    const d = await debt("Aluguel do apto antigo (2 meses)");
    expect(d.kind).toBe("parcelada_sem_juros");
    expect(d.status).toBe("em_dia");
    expect(Number(d.current_balance_cents)).toBe(400000);
    expect(d.installments_remaining).toBe(4);
    expect(Number(d.installment_cents)).toBe(100000);
    expect(d.due_day).toBe(10);
    expect(d.notes).toMatch(/Acordo em .*R\$ 4\.000,00 em 4× de R\$ 1\.000,00/);
    const rev = await asUser(db, david, async (q) => (await q("select * from debt_revisions where debt_id = $1", [d.id])).rows);
    expect(rev).toHaveLength(1);
    expect(rev[0].snapshot.debt.kind).toBe("conta_em_atraso");
    expect(Number(rev[0].snapshot.debt.principal_cents)).toBe(600000);
    const entries = await asUser(db, david, async (q) =>
      (await q("select kind, status from negotiation_entries order by occurred_on")).rows,
    );
    expect(entries.map((e) => e.status)).toEqual(["aberta", "recusada", "aceita"]);
    const n = await asUser(db, david, async (q) => (await q("select status, closed_on from negotiations")).rows[0]);
    expect(n.status).toBe("aceita");
    // total de dívidas cai 2.000 (6.000 → 4.000)
    const total = await asUser(db, david, async (q) =>
      (await q("select sum(current_balance_cents)::bigint as t from debts_overview where status <> 'quitada'")).rows[0].t,
    );
    expect(Number(total)).toBe(4234400 - 200000);
  });

  it("negociação encerrada não aceita outra proposta", async () => {
    await expect(asUser(db, david, (q) => q("select accept_proposal($1, 1, 1, null::smallint)", [proposal]))).rejects.toThrow(
      /encerrada/,
    );
  });
});

describe("agiota negociado: juros em aberto são substituídos pelo acordo", () => {
  it("aceita quitar o Agiota 2 por 1.500 em 1×", async () => {
    const d = await debt("Agiota 2");
    const neg = await asUser(db, david, async (q) => (await q("select open_negotiation($1) as id", [d.id])).rows[0].id);
    const entry = await asUser(db, david, async (q) =>
      (
        await q(`insert into negotiation_entries (household_id, negotiation_id, occurred_on, kind, amount_cents, installments)
                 values (current_household_id(), $1, '2026-10-25', 'proposta_feita', 150000, 1) returning id`, [neg])
      ).rows[0].id,
    );
    await asUser(db, david, (q) => q("select accept_proposal($1, 150000, 1, 30::smallint)", [entry]));
    const after = await debt("Agiota 2");
    expect(after.kind).toBe("parcelada_sem_juros");
    expect(Number(after.current_balance_cents)).toBe(150000);
    expect(Number(after.open_charges_cents)).toBe(0); // os R$ 375 de juros em aberto saíram
    // não lança mais juros
    expect((await asUser(db, david, async (q) => (await q("select accrue_charges() as n")).rows[0].n))).toBe(0);
  });
});

describe("encerrar sem acordo", () => {
  it("Vivo: recusa e volta para em atraso", async () => {
    const d = await debt("Internet Vivo");
    const neg = await asUser(db, paola, async (q) => (await q("select open_negotiation($1) as id", [d.id])).rows[0].id);
    await asUser(db, paola, (q) =>
      q(`insert into negotiation_entries (household_id, negotiation_id, occurred_on, kind, amount_cents, installments)
         values (current_household_id(), $1, '2026-10-25', 'proposta_recebida', 70000, 1)`, [neg]),
    );
    await asUser(db, paola, (q) => q("select close_negotiation($1)", [neg]));
    expect((await debt("Internet Vivo")).status).toBe("em_atraso");
    const e = await asUser(db, paola, async (q) => (await q("select status from negotiation_entries where negotiation_id = $1", [neg])).rows);
    expect(e.map((x) => x.status)).toEqual(["recusada"]);
  });
});

describe("RLS de negociações", () => {
  it("outra casa não vê nem mexe", async () => {
    const seen = await asUser(db, intruso, async (q) =>
      (
        await q(`select (select count(*) from negotiations)::int as n, (select count(*) from negotiation_entries)::int as e,
                        (select count(*) from debt_revisions)::int as r`)
      ).rows[0],
    );
    expect(seen).toEqual({ n: 0, e: 0, r: 0 });
    const d = await debt("Terapia");
    await expect(asUser(db, intruso, (q) => q("select open_negotiation($1)", [d.id]))).rejects.toThrow(/não encontrada/);
  });

  it("não cria negociação de dívida de outra casa", async () => {
    const d = await debt("Terapia");
    await expect(
      asUser(db, intruso, (q) =>
        q("insert into negotiations (household_id, debt_id) values (current_household_id(), $1)", [d.id]),
      ),
    ).rejects.toThrow(/não encontrada/);
  });
});
