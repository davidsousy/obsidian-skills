import Link from "next/link";
import { FixedCostForm } from "@/components/fixed-cost-form";
import { Button, Card, Field, FlashMessages, Input, Select, Stat } from "@/components/ui";
import { loadFixedCosts, loadVariableExpenses } from "@/lib/costs-data";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  compareWithAverage,
  fixedByCategory,
  fixedMonthlyTotal,
  fixedTotalForMonth,
  type CostCategory,
} from "@/lib/finance/costs";
import { addMonths, formatDateBR, formatMonthBR, monthStart, todayISO } from "@/lib/finance/dates";
import { formatBRL } from "@/lib/finance/money";
import { requireHousehold, type Member } from "@/lib/session";
import { createExpense, createFixedCost, deleteExpense, loadSeedFixedCosts } from "./actions";

type Search = { aba?: string; mes?: string; erro?: string; ok?: string };

function Tabs({ active }: { active: "fixos" | "variaveis" }) {
  const tab = (key: "fixos" | "variaveis", label: string, href: string) => (
    <Link
      href={href}
      className={`rounded-lg px-4 py-2 text-sm font-semibold ${
        active === key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex gap-2">
      {tab("fixos", "Custos fixos", "/custos")}
      {tab("variaveis", "Gastos variáveis", "/custos?aba=variaveis")}
    </div>
  );
}

export default async function CustosPage({ searchParams }: PageProps<"/custos">) {
  const params = (await searchParams) as Search;
  const { supabase, members, household, me } = await requireHousehold();
  const active = params.aba === "variaveis" ? "variaveis" : "fixos";
  const flash = Promise.resolve({ erro: params.erro, ok: params.ok });

  return (
    <div className="max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Custos</h1>
        <Tabs active={active} />
      </header>
      <FlashMessages searchParams={flash} />
      {active === "fixos" ? (
        <FixedTab supabase={supabase} members={members} />
      ) : (
        <VariableTab
          supabase={supabase}
          members={members}
          meId={me.user_id}
          month={params.mes}
          initialEstimate={household.initial_variable_monthly_cents}
        />
      )}
    </div>
  );
}

type TabProps = { supabase: Awaited<ReturnType<typeof requireHousehold>>["supabase"]; members: Member[] };

async function FixedTab({ supabase, members }: TabProps) {
  const costs = await loadFixedCosts(supabase);
  const names = new Map(members.map((m) => [m.user_id, m.display_name]));
  const today = todayISO();
  const total = fixedMonthlyTotal(costs);
  const thisMonth = fixedTotalForMonth(costs, today);
  const byCategory = fixedByCategory(costs);
  const approx = costs.filter((c) => c.active && c.isApproximate);
  const categories = CATEGORIES.filter((c) => costs.some((x) => x.category === c));

  if (costs.length === 0) {
    return (
      <>
        <Card title="Nenhum custo fixo cadastrado">
          <p className="mb-4 text-slate-600">Carregue a lista combinada de outubro/2026 (17 custos, total R$ 10.931,00) ou cadastre um a um.</p>
          <form action={loadSeedFixedCosts}>
            <Button type="submit">Carregar custos fixos de outubro/2026</Button>
          </form>
        </Card>
        <Card title="Novo custo fixo">
          <FixedCostForm action={createFixedCost} members={members} submitLabel="Adicionar custo" />
        </Card>
      </>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Custos fixos por mês" value={formatBRL(total)} hint={`${costs.filter((c) => c.active).length} custos ativos`} />
        <Stat
          label={`Contam em ${formatMonthBR(monthStart(today))}`}
          value={formatBRL(thisMonth)}
          hint={thisMonth !== total ? "Alguns só começam a contar nos próximos meses" : undefined}
        />
        <Stat
          label="Valores aproximados"
          value={formatBRL(approx.reduce((s, c) => s + c.amountCents, 0))}
          hint={`${approx.length} itens marcados como “aprox.”`}
          tone="parcelado"
        />
      </div>

      {categories.map((cat) => (
        <section key={cat} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
            <h2 className="font-semibold text-slate-700">{CATEGORY_LABEL[cat]}</h2>
            <span className="num text-lg font-bold">{formatBRL(byCategory.get(cat) ?? 0)}</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {costs
              .filter((c) => c.category === cat)
              .map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/custos/fixos/${c.id}`}
                    className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-slate-50 ${c.active ? "" : "opacity-50"}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {c.name}
                        {!c.active && <span className="ml-2 text-xs text-slate-500">(inativo)</span>}
                      </p>
                      <p className="text-sm text-slate-500">
                        {[
                          c.ownerUserId ? names.get(c.ownerUserId) : "Casa",
                          c.dueDay && `vence dia ${c.dueDay}`,
                          c.startsOn && c.startsOn > monthStart(today) && `a partir de ${formatMonthBR(c.startsOn)}`,
                          c.notes,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {c.isApproximate && (
                      <span className="rounded-full bg-parcelado-bg px-2 py-0.5 text-xs font-semibold text-yellow-800 ring-1 ring-yellow-200">
                        aprox.
                      </span>
                    )}
                    <p className="num w-32 text-right text-lg font-bold">{formatBRL(c.amountCents)}</p>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}

      <Card title="Novo custo fixo">
        <FixedCostForm action={createFixedCost} members={members} submitLabel="Adicionar custo" />
      </Card>
    </>
  );
}

async function VariableTab({
  supabase,
  members,
  meId,
  month,
  initialEstimate,
}: TabProps & { meId: string; month?: string; initialEstimate: number }) {
  const today = todayISO();
  const current = month && /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : monthStart(today);
  const expenses = await loadVariableExpenses(supabase, addMonths(current, -3));
  const monthExpenses = expenses.filter((e) => monthStart(e.spentOn) === current && e.spentOn < addMonths(current, 1));
  const cmp = compareWithAverage(
    expenses.filter((e) => e.spentOn < addMonths(current, 1)),
    current,
  );
  const names = new Map(members.map((m) => [m.user_id, m.display_name]));
  const maxBar = Math.max(1, ...cmp.rows.map((r) => Math.max(r.monthCents, r.averageCents ?? 0)));
  const prev = addMonths(current, -1).slice(0, 7);
  const next = addMonths(current, 1).slice(0, 7);
  const isCurrentMonth = current === monthStart(today);

  return (
    <>
      <Card title="Lançar gasto">
        <form action={createExpense} className="grid items-end gap-3 md:grid-cols-[9rem_8rem_10rem_1fr_9rem_auto]">
          <input type="hidden" name="mes" value={current.slice(0, 7)} />
          <Field label="Data">
            <Input name="spent_on" type="date" defaultValue={isCurrentMonth ? today : current} required />
          </Field>
          <Field label="Valor (R$)">
            <Input name="amount" inputMode="decimal" placeholder="0,00" required autoFocus />
          </Field>
          <Field label="Categoria">
            <Select name="category" defaultValue="alimentacao">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Descrição">
            <Input name="description" placeholder="mercado, farmácia…" />
          </Field>
          <Field label="Quem gastou">
            <Select name="spent_by" defaultValue={meId}>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name}
                </option>
              ))}
              <option value="casa">Casa</option>
            </Select>
          </Field>
          <Button type="submit">Lançar</Button>
        </form>
      </Card>

      <div className="flex items-center justify-between">
        <Link href={`/custos?aba=variaveis&mes=${prev}`} className="rounded-lg px-3 py-1 text-slate-600 hover:bg-slate-200">
          ‹ {formatMonthBR(`${prev}-01`)}
        </Link>
        <h2 className="text-xl font-semibold">{formatMonthBR(current)}</h2>
        <Link href={`/custos?aba=variaveis&mes=${next}`} className="rounded-lg px-3 py-1 text-slate-600 hover:bg-slate-200">
          {formatMonthBR(`${next}-01`)} ›
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={`Total de ${formatMonthBR(current)}`} value={formatBRL(cmp.monthTotal)} hint={`${monthExpenses.length} lançamentos`} />
        <Stat
          label="Média mensal"
          value={cmp.averageTotal === null ? "—" : formatBRL(cmp.averageTotal)}
          hint={
            cmp.averageTotal === null
              ? `Sem meses completos ainda. O plano usa a estimativa de ${formatBRL(initialEstimate)} (Configurações).`
              : cmp.monthsInAverage === 1
                ? "Último mês completo"
                : `Últimos ${cmp.monthsInAverage} meses completos`
          }
        />
        <Stat
          label="Diferença para a média"
          value={cmp.averageTotal === null ? "—" : formatBRL(cmp.monthTotal - cmp.averageTotal)}
          tone={cmp.averageTotal !== null && cmp.monthTotal > cmp.averageTotal ? "atraso" : "quitado"}
        />
      </div>

      {cmp.rows.length > 0 && (
        <Card title="Por categoria × média">
          <ul className="space-y-3">
            {cmp.rows.map((r) => (
              <CategoryBar key={r.category} category={r.category} month={r.monthCents} average={r.averageCents} max={maxBar} />
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">Barra cheia = mês atual · traço = média</p>
        </Card>
      )}

      <Card title="Lançamentos do mês">
        {monthExpenses.length === 0 ? (
          <p className="text-slate-500">Nenhum gasto lançado em {formatMonthBR(current)}.</p>
        ) : (
          <table className="num w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Data</th>
                <th className="py-2">Categoria</th>
                <th className="py-2">Descrição</th>
                <th className="py-2">Quem</th>
                <th className="py-2 text-right">Valor</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {monthExpenses.map((e) => (
                <tr key={e.id}>
                  <td className="py-2">{formatDateBR(e.spentOn)}</td>
                  <td className="py-2">{CATEGORY_LABEL[e.category]}</td>
                  <td className="py-2 text-slate-600">{e.description}</td>
                  <td className="py-2">{e.spentBy ? names.get(e.spentBy) : "Casa"}</td>
                  <td className="py-2 text-right font-semibold">{formatBRL(e.amountCents)}</td>
                  <td className="py-2 text-right">
                    <form action={deleteExpense.bind(null, e.id, current.slice(0, 7))}>
                      <button className="text-xs text-slate-400 hover:text-red-600" title="Excluir lançamento">
                        excluir
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

function CategoryBar({ category, month, average, max }: { category: CostCategory; month: number; average: number | null; max: number }) {
  const over = average !== null && month > average;
  return (
    <li className="grid grid-cols-[8rem_1fr_7rem] items-center gap-3 text-sm sm:grid-cols-[10rem_1fr_14rem]">
      <span className="font-medium">{CATEGORY_LABEL[category]}</span>
      <div className="relative h-4 rounded bg-slate-100">
        <div className={`h-4 rounded ${over ? "bg-atraso" : "bg-slate-700"}`} style={{ width: `${(month / max) * 100}%` }} />
        {average !== null && (
          <div className="absolute top-[-3px] h-[22px] w-0.5 bg-slate-900" style={{ left: `${(average / max) * 100}%` }} />
        )}
      </div>
      <span className="num text-right">
        <strong>{formatBRL(month)}</strong>
        <span className="hidden text-slate-500 sm:inline"> · média {average === null ? "—" : formatBRL(average)}</span>
      </span>
    </li>
  );
}
