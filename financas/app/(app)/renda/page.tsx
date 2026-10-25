import { HourlyChart } from "@/components/hourly-chart";
import { Button, Card, Field, FlashMessages, Input, Select, Stat } from "@/components/ui";
import { loadFixedCosts } from "@/lib/costs-data";
import { carMonthlyCost } from "@/lib/finance/costs";
import { addDays, formatDateBR, monthStart, todayISO } from "@/lib/finance/dates";
import { dailyRates, incomeMonthlyAverage, uberRates, windowStats, type WindowStats } from "@/lib/finance/income";
import { formatBRL } from "@/lib/finance/money";
import { loadIncome } from "@/lib/income-data";
import { requireHousehold } from "@/lib/session";
import { deleteIncomeEntry, deleteUberDay, saveIncomeEntry, saveUberDay } from "./actions";

const hoursBR = (h: number) => h.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function windowLabel(s: WindowStats): string {
  if (s.covered === 0) return "sem lançamentos";
  return s.partial ? `parcial: ${s.covered} de ${s.window} dias com histórico` : `últimos ${s.window} dias`;
}

export default async function RendaPage({ searchParams }: PageProps<"/renda">) {
  const { supabase, household, members, me } = await requireHousehold();
  const today = todayISO();
  // histórico completo (≈ 1 linha por dia): necessário para saber quantos dias as médias cobrem
  const [{ uber, entries }, fixed] = await Promise.all([loadIncome(supabase), loadFixedCosts(supabase)]);
  const car = carMonthlyCost(fixed, today);
  const rates = uberRates(uber, today, car, household.car_cost_allocation);
  const w30 = windowStats(uber, entries, today, 30);
  const w90 = windowStats(uber, entries, today, 90);
  const planIncome = incomeMonthlyAverage(uber, entries, today, household.initial_income_monthly_cents);
  const names = new Map(members.map((m) => [m.user_id, m.display_name]));
  const paola = members.find((m) => m.display_name.toLowerCase().startsWith("paola")) ?? me;
  const month = monthStart(today);
  const receivedThisMonth =
    uber.filter((u) => u.workedOn >= month && u.workedOn <= today).reduce((s, u) => s + u.grossCents, 0) +
    entries.filter((e) => e.receivedOn >= month && e.receivedOn <= today).reduce((s, e) => s + e.amountCents, 0);

  const chartDays = uber.filter((u) => u.workedOn >= addDays(today, -29) && u.workedOn <= today);
  const chart = dailyRates(chartDays, rates).map((p) => ({
    label: formatDateBR(p.date).slice(0, 5),
    bruto: p.gross,
    liquido: p.net,
  }));

  return (
    <div className="max-w-6xl space-y-6">
      <h1 className="text-3xl font-bold">Renda</h1>
      <FlashMessages searchParams={searchParams as Promise<{ erro?: string; ok?: string }>} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Uber do dia (David)">
          <form action={saveUberDay} className="grid items-end gap-3 sm:grid-cols-[9.5rem_1fr_6rem]">
            <Field label="Data">
              <Input name="worked_on" type="date" defaultValue={today} required />
            </Field>
            <Field label="Valor bruto (R$)" hint="O que o app repassou no dia">
              <Input name="gross" inputMode="decimal" placeholder="0,00" required />
            </Field>
            <Field label="Horas">
              <Input name="hours" inputMode="decimal" placeholder="8,5" required />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Observação">
                <Input name="notes" placeholder="opcional" />
              </Field>
            </div>
            <Button type="submit">Lançar dia</Button>
          </form>
          <p className="mt-2 text-xs text-slate-500">Lançar de novo a mesma data substitui o lançamento daquele dia.</p>
        </Card>
        <Card title="Renda da Paola e outras entradas">
          <form action={saveIncomeEntry} className="grid items-end gap-3 sm:grid-cols-[9.5rem_1fr_8rem]">
            <Field label="Data">
              <Input name="received_on" type="date" defaultValue={today} required />
            </Field>
            <Field label="Valor (R$)">
              <Input name="amount" inputMode="decimal" placeholder="0,00" required />
            </Field>
            <Field label="Tipo">
              <Select name="source" defaultValue="salario">
                <option value="salario">Salário</option>
                <option value="outros">Outros</option>
              </Select>
            </Field>
            <Field label="Descrição">
              <Input name="description" placeholder="opcional" />
            </Field>
            <Field label="Quem recebeu">
              <Select name="earner" defaultValue={paola.user_id}>
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
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Uber: bruto por hora"
          value={rates ? formatBRL(rates.grossPerHour) : "—"}
          hint={rates ? `${hoursBR(rates.hours30)} h em ${rates.days30} dias (30 dias)` : "Sem lançamentos nos últimos 30 dias"}
        />
        <Stat
          label="Uber: líquido por hora"
          value={rates ? formatBRL(rates.netPerHour) : "—"}
          tone="quitado"
          hint={
            rates
              ? household.car_cost_allocation === "por_dia"
                ? `Carro ${formatBRL(car)}/mês ÷ ${hoursBR(rates.monthlyDays)} dias = ${formatBRL(rates.carCostPerDay!)}/dia (${formatBRL(rates.carCostPerHour)}/h)`
                : `Carro ${formatBRL(car)}/mês ÷ ${hoursBR(rates.monthlyHours)} h = ${formatBRL(rates.carCostPerHour)}/h`
              : `Custo do carro: ${formatBRL(car)}/mês`
          }
        />
        <Stat label="Recebido no mês" value={formatBRL(receivedThisMonth)} hint="Uber bruto + entradas" />
        <Stat
          label="Renda média usada no plano"
          value={formatBRL(planIncome.cents)}
          tone="parcelado"
          hint={
            planIncome.source === "media90"
              ? "Média dos últimos 90 dias"
              : planIncome.source === "parcial"
                ? `Média dos ${planIncome.days} dias com histórico`
                : `Estimativa das Configurações (só ${planIncome.days} dias de histórico; precisa de 30)`
          }
        />
      </div>

      <Card title="Médias móveis (valor por mês)">
        <div className="overflow-x-auto">
          <table className="num w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Fonte</th>
                <th className="py-2 text-right">30 dias</th>
                <th className="py-2 text-right">90 dias</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-2">Uber (David, bruto)</td>
                <td className="py-2 text-right">{formatBRL(w30.uberMonthly)}</td>
                <td className="py-2 text-right">{formatBRL(w90.uberMonthly)}</td>
              </tr>
              <tr>
                <td className="py-2">Paola e outras entradas</td>
                <td className="py-2 text-right">{formatBRL(w30.otherMonthly)}</td>
                <td className="py-2 text-right">{formatBRL(w90.otherMonthly)}</td>
              </tr>
              <tr className="font-bold">
                <td className="py-2">Total</td>
                <td className="py-2 text-right text-lg">{formatBRL(w30.totalMonthly)}</td>
                <td className="py-2 text-right text-lg">{formatBRL(w90.totalMonthly)}</td>
              </tr>
              <tr className="text-xs text-slate-500">
                <td className="py-1" />
                <td className="py-1 text-right">{windowLabel(w30)}</td>
                <td className="py-1 text-right">{windowLabel(w90)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Ganho por hora do Uber (últimos 30 dias)">
        {chart.length === 0 ? <p className="text-slate-500">Lance os dias rodados para ver o gráfico.</p> : <HourlyChart data={chart} />}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Dias do Uber">
          {uber.length === 0 ? (
            <p className="text-slate-500">Nenhum dia lançado.</p>
          ) : (
            <table className="num w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2">Data</th>
                  <th className="py-2 text-right">Bruto</th>
                  <th className="py-2 text-right">Horas</th>
                  <th className="py-2 text-right">R$/h</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {uber.slice(0, 31).map((u) => (
                  <tr key={u.id} title={u.notes ?? undefined}>
                    <td className="py-2">{formatDateBR(u.workedOn)}</td>
                    <td className="py-2 text-right font-semibold">{formatBRL(u.grossCents)}</td>
                    <td className="py-2 text-right">{hoursBR(u.hours)}</td>
                    <td className="py-2 text-right">{formatBRL(Math.round(u.grossCents / u.hours))}</td>
                    <td className="py-2 text-right">
                      <form action={deleteUberDay.bind(null, u.id)}>
                        <button className="text-xs text-slate-400 hover:text-red-600">excluir</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Entradas">
          {entries.length === 0 ? (
            <p className="text-slate-500">Nenhuma entrada lançada.</p>
          ) : (
            <table className="num w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2">Data</th>
                  <th className="px-2 py-2">Quem</th>
                  <th className="px-2 py-2">Descrição</th>
                  <th className="py-2 text-right">Valor</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.slice(0, 30).map((e) => (
                  <tr key={e.id}>
                    <td className="py-2">{formatDateBR(e.receivedOn)}</td>
                    <td className="px-2 py-2">{e.earnerUserId ? names.get(e.earnerUserId) : "Casa"}</td>
                    <td className="px-2 py-2 text-slate-600">
                      {e.source === "salario" ? "Salário" : "Outros"}
                      {e.description && ` · ${e.description}`}
                    </td>
                    <td className="py-2 text-right font-semibold">{formatBRL(e.amountCents)}</td>
                    <td className="py-2 text-right">
                      <form action={deleteIncomeEntry.bind(null, e.id)}>
                        <button className="text-xs text-slate-400 hover:text-red-600">excluir</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
