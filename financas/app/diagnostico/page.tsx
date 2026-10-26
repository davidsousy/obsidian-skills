import Link from "next/link";
import { PEOPLE } from "@/lib/auto-auth";
import { databaseRegion, nearestVercelRegion } from "@/lib/regions";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabasePublicKey, supabaseSecretKey, supabaseUrl } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

type Check = { label: string; ok: boolean | null; detail?: string };

const TABLES = [
  "households", "household_members", "debts", "debt_charges", "debt_payments", "fixed_costs",
  "variable_expenses", "uber_days", "income_entries", "negotiations", "negotiation_entries", "debt_revisions", "alert_log",
];

async function runChecks(): Promise<Check[]> {
  const checks: Check[] = [
    { label: "Endereço do Supabase (NEXT_PUBLIC_SUPABASE_URL)", ok: Boolean(supabaseUrl()) },
    { label: "Chave pública do Supabase (ANON ou PUBLISHABLE)", ok: Boolean(supabasePublicKey()) },
    { label: "Chave secreta do Supabase (SERVICE_ROLE ou SECRET)", ok: Boolean(supabaseSecretKey()) },
    { label: "Alertas por e-mail: CRON_SECRET e RESEND_API_KEY (opcional)", ok: process.env.CRON_SECRET && process.env.RESEND_API_KEY ? true : null, detail: "Sem eles o app funciona; só os e-mails ficam desligados." },
  ];

  const db = databaseRegion();
  const near = db ? nearestVercelRegion(db) : null;
  const fn = process.env.VERCEL_REGION;
  if (db && near && fn) {
    checks.push({
      label: `Funções da Vercel perto do banco (banco: ${near.city}, ${db} · funções: ${fn})`,
      ok: fn === near.code ? true : null,
      detail:
        fn === near.code
          ? undefined
          : `O app fica mais rápido com as funções em ${near.city}: Vercel → Settings → Functions → Function Region → ${near.code}, depois Redeploy.`,
    });
  }

  const url = supabaseUrl();
  const key = supabasePublicKey();
  if (url && key) {
    try {
      const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key }, cache: "no-store" });
      checks.push({ label: "Supabase respondendo", ok: res.ok, detail: res.ok ? undefined : `HTTP ${res.status}` });
    } catch (e) {
      checks.push({ label: "Supabase respondendo", ok: false, detail: (e as Error).message });
    }
  }

  const admin = createAdminClient();
  if (!admin) return checks;

  const missing: string[] = [];
  for (const table of TABLES) {
    const { error } = await admin.from(table).select("*", { count: "exact", head: true });
    if (error) missing.push(table);
  }
  checks.push({
    label: "Tabelas do banco (setup.sql)",
    ok: missing.length === 0,
    detail: missing.length ? `Faltando: ${missing.join(", ")}. Rode supabase/setup.sql no SQL Editor.` : undefined,
  });
  if (missing.length) return checks;

  const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const internal = (users?.users ?? []).filter((u) => u.email === PEOPLE.david.email || u.email === PEOPLE.paola.email);
  checks.push({
    label: "Contas internas (David e Paola)",
    ok: usersError ? false : internal.length === 2,
    detail: usersError?.message ?? (internal.length === 2 ? undefined : "Serão criadas no primeiro acesso ao Painel."),
  });

  const [houses, debts, fixed] = await Promise.all([
    admin.from("households").select("id, name, household_members(display_name)"),
    admin.from("debts").select("*", { count: "exact", head: true }),
    admin.from("fixed_costs").select("*", { count: "exact", head: true }),
  ]);
  const houseList = (houses.data ?? []) as { name: string; household_members: { display_name: string }[] }[];
  checks.push({
    label: "Casa",
    ok: houseList.length > 0 ? true : null,
    detail: houseList.length
      ? houseList.map((h) => `${h.name} (${h.household_members.map((m) => m.display_name).join(", ")})`).join(" · ")
      : "Será criada no primeiro acesso ao Painel.",
  });
  checks.push({ label: "Dívidas cadastradas", ok: (debts.count ?? 0) > 0 ? true : null, detail: String(debts.count ?? 0) });
  checks.push({ label: "Custos fixos cadastrados", ok: (fixed.count ?? 0) > 0 ? true : null, detail: String(fixed.count ?? 0) });
  return checks;
}

export default async function DiagnosticoPage({ searchParams }: PageProps<"/diagnostico">) {
  const { erro } = (await searchParams) as { erro?: string };
  const checks = await runChecks();
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 py-12">
      <h1 className="text-2xl font-bold">Diagnóstico</h1>
      {erro && <p className="rounded-lg border border-red-200 bg-atraso-bg px-4 py-3 text-sm text-red-800">{erro}</p>}
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {checks.map((c) => (
          <li key={c.label} className="flex gap-3 px-4 py-3 text-sm">
            <span className="w-5 shrink-0">{c.ok === true ? "✅" : c.ok === false ? "❌" : "➖"}</span>
            <span>
              <span className="font-medium">{c.label}</span>
              {c.detail && <span className="block text-slate-500">{c.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500">
        Versão: {commit ?? "local"} · Região: {process.env.VERCEL_REGION ?? "local"}
      </p>
      <Link href="/painel" className="inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
        Ir para o Painel
      </Link>
    </main>
  );
}
