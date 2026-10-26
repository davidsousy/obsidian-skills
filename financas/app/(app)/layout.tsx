import { Nav } from "@/components/nav";
import { PersonSwitcher } from "@/components/person-switcher";
import { personByEmail } from "@/lib/auto-auth";
import { loadDebts, loadPayments } from "@/lib/debts-data";
import { goalProgress } from "@/lib/finance/dashboard";
import { debtGroup } from "@/lib/finance/debts";
import { formatBRL } from "@/lib/finance/money";
import { requireHousehold } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, household, me, user } = await requireHousehold();
  const [debts, payments] = await Promise.all([loadDebts(supabase), loadPayments(supabase)]);
  const overdueCount = debts.filter((d) => debtGroup(d) === "atraso").length;
  const goal = goalProgress(debts, payments);
  const name = household.name.replace(/^casa\s+/i, ""); // "Casa David & Paola" → "David & Paola"
  const title = name.charAt(0).toUpperCase() + name.slice(1);

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-slate-200 bg-white p-4 md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:border-b-0 md:border-r">
        <p className="mb-3 px-3 text-xl font-bold md:mb-5">Finanças</p>
        <Nav overdueCount={overdueCount} />
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 md:mt-auto">
          <p className="text-xs text-slate-500">
            Meta: <span className="font-semibold text-slate-700">zerar atrasos e agiotas</span>
          </p>
          <p className={`num mt-1 font-bold ${goal.done ? "text-quitado" : "text-slate-900"}`}>
            {goal.done ? "Meta cumprida!" : `faltam ${formatBRL(goal.remaining)}`}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div className="h-1.5 rounded-full bg-quitado" style={{ width: `${goal.done ? 100 : goal.pct}%` }} />
          </div>
          <p className="num mt-1 text-xs text-slate-500">{goal.done ? 100 : goal.pct}% do principal pago</p>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 md:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-900 text-lg font-bold text-white">
              {me.display_name.trim().charAt(0).toUpperCase()}
            </span>
            <div>
              <p className="font-bold leading-tight">{title}</p>
              <p className="text-xs text-slate-500">Finanças da casa</p>
            </div>
          </div>
          <PersonSwitcher current={personByEmail(user.email)} />
        </header>
        <main className="p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
