import Link from "next/link";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { addMonths, endOfMonthISO, formatDateBR, formatMonthBR } from "@/lib/finance/dates";
import { debtBalance } from "@/lib/finance/debts";
import { formatAmount, formatBRL, parseBRL } from "@/lib/finance/money";
import { isPayable, planStart, type Phase } from "@/lib/finance/plan";
import { applyScenario, isEmptyScenario, type Scenario } from "@/lib/finance/scenario";
import { computePlan, loadPlanContext, type PlanContext, type PlanResult } from "@/lib/plan-data";
import { requireHousehold } from "@/lib/session";

type Search = Record<string, string | string[] | undefined>;

const list = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const one = (v: string | string[] | undefined): string => list(v)[0] ?? "";

function parseScenario(sp: Search): Scenario {
  const extra = parseBRL(one(sp.extra));
  const hours = Number(one(sp.horas).replace(",", "."));
  const negDebt = one(sp.neg_divida);
  const negValue = parseBRL(one(sp.neg_valor));
  const negN = Number(one(sp.neg_parcelas) || "1");
  return {
    extraIncome: extra && extra > 0 ? extra : 0,
    extraHours: Number.isFinite(hours) && hours > 0 ? hours : 0,
    cutFixedCostIds: list(sp.cortar),
    payNowDebtIds: list(sp.quitar),
    negotiation:
      negDebt && negValue !== null && negValue >= 0
        ? { debtId: negDebt, amount: negValue, installments: Number.isFinite(negN) && negN >= 1 ? negN : 1 }
        : null,
  };
}

const h = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function Phases({ phases }: { phases: Phase[] }) {
  return (
    <ul className="space-y-0.5">
      {phases.map((p) => (
        <li key={p.from}>
          <strong>{formatBRL(p.income)}</strong>{" "}
          <span className="text-slate-500">{p.from === p.to ? formatMonthBR(p.from) : `${formatMonthBR(p.from)}–${formatMonthBR(p.to)}`}</span>
        </li>
      ))}
    </ul>
  );
}

const VERDICT = { viavel: "Viável", apertado: "Apertado", inviavel: "Inviável" } as const;
const VERDICT_STYLE = { viavel: "text-quitado", apertado: "text-yellow-700", inviavel: "text-atraso" } as const;

/** Juros totais da simulação mais relevante: com a renda considerada, se quita; senão, com a renda necessária. */
function interestOf(p: PlanResult): { cents: number; label: string } {
  if (p.nearest.date) return { cents: p.nearest.simulation.totalInterest, label: "com a renda considerada" };
  return { cents: p.schedule.simulation.totalInterest, label: "com a renda necessária" };
}

function payoff(p: PlanResult): string {
  if (p.nearest.date) return formatDateBR(p.nearest.date);
  return p.nearest.reason === "minimos" ? `não cobre os mínimos de ${formatMonthBR(p.nearest.shortfallMonth!)}` : "mais de 10 anos";
}

export default async function SimuladorPage({ searchParams }: PageProps<"/simulador">) {
  const sp = (await searchParams) as Search;
  const { supabase, household } = await requireHousehold();
  const ctx = await loadPlanContext(supabase, household);
  const minTarget = endOfMonthISO(planStart(ctx.today));
  const target = one(sp.alvo) || household.target_date || addMonths(minTarget, 8);
  const scenario = parseScenario(sp);
  const applied = applyScenario(ctx.input, ctx.realIncome.cents, ctx.rates?.netPerHour ?? null, scenario);
  const scenarioCtx: PlanContext = {
    ...ctx,
    input: applied.input,
    realIncome: { ...ctx.realIncome, cents: applied.income },
  };
  const current = computePlan(ctx, target, household.tight_margin_pct);
  const sim = computePlan(scenarioCtx, target, household.tight_margin_pct);
  const debts = ctx.debts.filter((d) => d.status !== "quitada");
  const costs = ctx.input.fixedCosts.filter((c) => c.active);
  const empty = isEmptyScenario(scenario);

  return (
    <div className="max-w-6xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Simulador</h1>
        <p className="text-slate-500">Cenários “e se” — nada aqui altera os dados reais.</p>
      </header>

      <Card title="Monte o cenário">
        <form method="get" className="space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Data-alvo">
              <Input name="alvo" type="date" min={minTarget} defaultValue={target} />
            </Field>
            <Field label="Ganhar a mais por mês (R$)">
              <Input name="extra" inputMode="decimal" placeholder="0,00" defaultValue={one(sp.extra)} />
            </Field>
            <Field
              label="Rodar a mais de Uber (h/mês)"
              hint={ctx.rates ? `≈ ${formatBRL(ctx.rates.netPerHour)} líquido por hora` : "Sem dados de Uber nos últimos 30 dias"}
            >
              <Input name="horas" inputMode="decimal" placeholder="0" defaultValue={one(sp.horas)} disabled={!ctx.rates} />
            </Field>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700">Cortar custos fixos</legend>
              <div className="grid max-h-56 grid-cols-1 gap-x-6 gap-y-1 overflow-y-auto rounded-lg border border-slate-200 p-3 text-sm lg:grid-cols-2">
                {costs.map((c) => (
                  <label key={c.id} className="flex items-center gap-2">
                    <input type="checkbox" name="cortar" value={c.id} defaultChecked={scenario.cutFixedCostIds.includes(c.id)} />
                    <span className="flex-1">{c.name}</span>
                    <span className="num whitespace-nowrap text-slate-500">{formatBRL(c.amountCents)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700">Quitar agora (dinheiro de fora do plano)</legend>
              <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-3 text-sm">
                {debts.filter(isPayable).map((d) => (
                  <label key={d.id} className="flex items-center gap-2">
                    <input type="checkbox" name="quitar" value={d.id} defaultChecked={scenario.payNowDebtIds.includes(d.id)} />
                    <span className="flex-1">{d.name}</span>
                    <span className="num whitespace-nowrap text-slate-500">{formatBRL(debtBalance(d))}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <fieldset className="grid gap-4 rounded-lg bg-slate-50 p-4 md:grid-cols-[2fr_1fr_1fr]">
            <legend className="px-1 text-sm font-medium text-slate-700">Fechar negociação com desconto</legend>
            <Field label="Dívida">
              <Select name="neg_divida" defaultValue={scenario.negotiation?.debtId ?? ""}>
                <option value="">— nenhuma —</option>
                {debts.filter(isPayable).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({formatBRL(debtBalance(d))})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Valor fechado (R$)">
              <Input
                name="neg_valor"
                inputMode="decimal"
                placeholder="0,00"
                defaultValue={scenario.negotiation ? formatAmount(scenario.negotiation.amount) : ""}
              />
            </Field>
            <Field label="Parcelas" hint="1 = à vista no próximo mês">
              <Input name="neg_parcelas" type="number" min={1} max={60} defaultValue={scenario.negotiation?.installments ?? 1} />
            </Field>
          </fieldset>

          <div className="flex items-center gap-4">
            <Button type="submit">Simular</Button>
            {!empty && (
              <Link href={`/simulador?alvo=${target}`} className="text-sm text-slate-600 underline">
                Limpar cenário
              </Link>
            )}
          </div>
        </form>
      </Card>

      {!current || !sim ? (
        <Card>
          <p className="text-atraso">A data-alvo precisa ser no fim de {formatMonthBR(planStart(ctx.today))} ou depois.</p>
        </Card>
      ) : (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="font-semibold text-slate-700">
              Plano atual × cenário <span className="font-normal text-slate-500">(data-alvo {formatDateBR(target)})</span>
            </h2>
            {empty && <p className="text-sm text-slate-500">Escolha alguma mudança acima para comparar.</p>}
          </div>
          <div className="overflow-x-auto">
            <table className="num w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-2" />
                  <th className="px-5 py-2">Plano atual</th>
                  <th className="bg-slate-50 px-5 py-2">Cenário</th>
                  <th className="px-5 py-2">Diferença</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top">
                <Row
                  label="Renda considerada por mês"
                  a={formatBRL(ctx.realIncome.cents)}
                  b={formatBRL(applied.income)}
                  diff={applied.addedIncome ? `+ ${formatBRL(applied.addedIncome)}` : ""}
                />
                <Row
                  label="Renda necessária"
                  a={<Phases phases={current.schedule.phases} />}
                  b={<Phases phases={sim.schedule.phases} />}
                  diff={diffMoney(sim.schedule.base - current.schedule.base, "na renda-base")}
                />
                <Row
                  label="Mês mais pesado"
                  a={formatBRL(current.schedule.peak)}
                  b={formatBRL(sim.schedule.peak)}
                  diff={diffMoney(sim.schedule.peak - current.schedule.peak)}
                />
                <Row
                  label="Viabilidade"
                  a={<span className={`font-bold ${VERDICT_STYLE[current.viability.status]}`}>{VERDICT[current.viability.status]}</span>}
                  b={<span className={`font-bold ${VERDICT_STYLE[sim.viability.status]}`}>{VERDICT[sim.viability.status]}</span>}
                  diff=""
                />
                <Row
                  label="Quitação de tudo com a renda considerada"
                  a={payoff(current)}
                  b={payoff(sim)}
                  diff={
                    current.nearest.date && sim.nearest.date
                      ? monthsDiff(current.nearest.date, sim.nearest.date)
                      : !current.nearest.date && sim.nearest.date
                        ? "passa a ser possível"
                        : ""
                  }
                />
                <Row
                  label="Total de juros pagos"
                  a={<>{formatBRL(interestOf(current).cents)}<br /><span className="text-xs text-slate-500">{interestOf(current).label}</span></>}
                  b={<>{formatBRL(interestOf(sim).cents)}<br /><span className="text-xs text-slate-500">{interestOf(sim).label}</span></>}
                  diff={
                    interestOf(current).label === interestOf(sim).label
                      ? economy(interestOf(current).cents - interestOf(sim).cents)
                      : ""
                  }
                />
                {applied.discount > 0 && (
                  <Row label="Desconto na negociação" a="" b={formatBRL(applied.discount)} diff={<span className="text-quitado">economia de {formatBRL(applied.discount)}</span>} />
                )}
                <Row
                  label="Uber a mais (mês mais pesado)"
                  a={current.hours ? `${h(current.hours.perMonth)} h/mês` : current.viability.diff >= 0 ? "não precisa" : "—"}
                  b={sim.hours ? `${h(sim.hours.perMonth)} h/mês` : sim.viability.diff >= 0 ? "não precisa" : "—"}
                  diff=""
                />
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Row({ label, a, b, diff }: { label: string; a: React.ReactNode; b: React.ReactNode; diff: React.ReactNode }) {
  return (
    <tr>
      <th className="px-5 py-3 text-left font-medium text-slate-600">{label}</th>
      <td className="px-5 py-3">{a}</td>
      <td className="bg-slate-50 px-5 py-3 font-semibold">{b}</td>
      <td className="px-5 py-3">{diff}</td>
    </tr>
  );
}

function diffMoney(cents: number, suffix = ""): React.ReactNode {
  if (cents === 0) return "";
  const better = cents < 0;
  return (
    <span className={better ? "text-quitado" : "text-atraso"}>
      {better ? "−" : "+"} {formatBRL(Math.abs(cents))} {suffix}
    </span>
  );
}

function economy(cents: number): React.ReactNode {
  if (cents === 0) return "";
  return cents > 0 ? (
    <span className="text-quitado">economiza {formatBRL(cents)}</span>
  ) : (
    <span className="text-atraso">paga {formatBRL(-cents)} a mais</span>
  );
}

function monthsDiff(a: string, b: string): React.ReactNode {
  const ma = Number(a.slice(0, 4)) * 12 + Number(a.slice(5, 7));
  const mb = Number(b.slice(0, 4)) * 12 + Number(b.slice(5, 7));
  const d = ma - mb;
  if (d === 0) return "mesma data";
  return d > 0 ? (
    <span className="text-quitado">{d} {d === 1 ? "mês" : "meses"} antes</span>
  ) : (
    <span className="text-atraso">{-d} {d === -1 ? "mês" : "meses"} depois</span>
  );
}



