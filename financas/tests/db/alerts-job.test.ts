import { createClient } from "@supabase/supabase-js";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAlerts, type Email } from "@/lib/alerts-job";
import { asUser, connect, createUser, deleteUsers } from "./helpers";

// Supabase local: URL e chave secreta vêm do .env.local (carregado pelo vitest.config.mts)
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321", process.env.SUPABASE_SECRET_KEY ?? "", {
  auth: { persistSession: false },
});

let db: pg.Client;
let david: string;
let paola: string;
let emails: string[] = [];

beforeAll(async () => {
  db = connect();
  await db.connect();
  david = await createUser(db, "david");
  paola = await createUser(db, "paola");
  const code = await asUser(db, david, async (q) => {
    await q("select create_household('Casa', 'David')");
    await q("select load_seed_debts()");
    await q("select load_seed_fixed_costs()");
    return (await q("select invite_code from households")).rows[0].invite_code;
  });
  await asUser(db, paola, (q) => q("select join_household($1, 'Paola')", [code]));
  emails = (await db.query("select email from auth.users where id = any($1) order by email", [[david, paola]])).rows.map((r) => r.email);
});

afterAll(async () => {
  await deleteUsers(db, [david, paola]);
  await db.end();
});

// o banco local pode ter outras casas de testes anteriores: considera só os e-mails deste teste
const mine = (r: Awaited<ReturnType<typeof runAlerts>>) => r.sent.filter((s) => emails.includes(s.to));

describe.skipIf(!process.env.SUPABASE_SECRET_KEY)("job de alertas por e-mail (precisa de SUPABASE_SECRET_KEY no .env.local)", () => {
  it("simulação (sem chave do Resend): lista o que seria enviado e não grava log", async () => {
    const r = await runAlerts(admin, "2026-10-27", "https://app.test");
    expect(r.dryRun).toBe(true);
    const sent = mine(r);
    expect(sent).toHaveLength(2); // os dois recebem
    expect(sent[0].items.map((i) => i.name).sort()).toEqual([
      "Agiota 1", "Agiota 2", "Cartão do sogro (entrada do carro)", "Empréstimo do amigo",
    ]);
    const { count } = await admin.from("alert_log").select("*", { count: "exact", head: true }).in("user_id", [david, paola]);
    expect(count).toBe(0);
  });

  it("envia 3 dias antes, grava log e não repete no dia seguinte", async () => {
    const outbox: Email[] = [];
    const send = async (e: Email) => {
      outbox.push(e);
    };
    await runAlerts(admin, "2026-10-27", "https://app.test", send);
    const ours = outbox.filter((e) => emails.includes(e.to));
    expect(ours).toHaveLength(2);
    expect(ours[0].subject).toBe("Vencem em 30/10/2026: 4 contas (R$ 6.158,00)");
    expect(ours[0].html).toContain("Agiota 1");
    expect(ours[0].html).toContain("https://app.test/painel");
    const { count } = await admin.from("alert_log").select("*", { count: "exact", head: true }).in("user_id", [david, paola]);
    expect(count).toBe(8);
    const again: Email[] = [];
    const r2 = await runAlerts(admin, "2026-10-27", "https://app.test", async (e) => void again.push(e));
    expect(again.filter((e) => emails.includes(e.to))).toHaveLength(0);
    expect(r2.skippedAlreadySent).toBeGreaterThanOrEqual(8);
  });

  it("respeita quem desativou e os dias de antecedência de cada um", async () => {
    await asUser(db, paola, (q) => q("update household_members set email_alerts = false where user_id = $1", [paola]));
    await asUser(db, david, (q) => q("update household_members set alert_days_before = 5 where user_id = $1", [david]));
    // 05/11 (carro, aluguel, condomínio) − 5 dias = 31/10
    const r = await runAlerts(admin, "2026-10-31", "https://app.test");
    const ours = mine(r);
    expect(ours.map((s) => s.to.split("-")[0])).toEqual(["david"]);
    expect(ours[0].items.map((i) => i.name).sort()).toEqual(["Aluguel", "Condomínio", "Parcela do carro"]);
  });

  it("sem login: conta interna não recebe; a casa dela avisa os endereços de ALERT_EMAILS", async () => {
    const internal = await createUser(db, "interna", "financas-da-casa.invalid");
    const conta = `Conta da casa sem login ${internal.slice(0, 8)}`; // identifica esta casa entre as do banco local
    try {
      await asUser(db, internal, async (q) => {
        await q("select create_household('Casa sem login', 'David')");
        await q(
          `insert into fixed_costs (household_id, name, amount_cents, due_day, category)
           values (current_household_id(), $1, 12345, 30, 'moradia')`,
          [conta],
        );
      });
      const deste = (r: Awaited<ReturnType<typeof runAlerts>>) => r.sent.filter((s) => s.items.some((i) => i.name === conta));
      const destinos = ["casal@exemplo.com", "outro@exemplo.com"];

      const outbox: Email[] = [];
      const r = await runAlerts(admin, "2026-10-27", "https://app.test", async (e) => void outbox.push(e), destinos);
      expect(r.sent.some((s) => s.to.endsWith("@financas-da-casa.invalid"))).toBe(false);
      expect(deste(r).map((s) => s.to)).toEqual(destinos);
      expect(deste(r)[0].items).toEqual([{ name: conta, dueDate: "2026-10-30", amountCents: 12345 }]);
      expect(outbox.filter((e) => e.html.includes(conta)).map((e) => e.subject)).toEqual([
        `Vence em 30/10/2026: ${conta} (R$ 123,45)`,
        `Vence em 30/10/2026: ${conta} (R$ 123,45)`,
      ]);

      // sem ALERT_EMAILS: ninguém recebe os avisos desta casa
      expect(deste(await runAlerts(admin, "2026-10-27", "https://app.test"))).toEqual([]);

      // antecedência das Configurações (5 dias: 25/10 → 30/10) e alertas desligados
      await asUser(db, internal, (q) => q("update household_members set alert_days_before = 5 where user_id = $1", [internal]));
      expect(deste(await runAlerts(admin, "2026-10-27", "https://app.test", undefined, destinos))).toEqual([]);
      expect(deste(await runAlerts(admin, "2026-10-25", "https://app.test", undefined, destinos))).toHaveLength(2);
      await asUser(db, internal, (q) => q("update household_members set email_alerts = false where user_id = $1", [internal]));
      expect(deste(await runAlerts(admin, "2026-10-25", "https://app.test", undefined, destinos))).toEqual([]);
    } finally {
      await deleteUsers(db, [internal]);
    }
  });
});
