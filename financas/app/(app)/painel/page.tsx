import Link from "next/link";
import { PlanVerdict } from "@/components/plan-verdict";
import { Card, Stat } from "@/components/ui";
import { interestPaidThisMonth, loadDebts, loadPayments } from "@/lib/debts-data";
import { diffDays, formatDateBR, formatMonthBR, monthStart, todayISO } from "@/lib/finance/dates";
import { loadIncome } from "@/lib/income-data";
import { debtTotals } from "@/lib/finance/debts";
import { formatBRL } from "@/lib/finance/money";
import { computePlan, loadPlanContext } from "@/lib/plan-data";
import { requireHousehold } from "@/lib/session";

export default async function PainelPage() {
  const { supabase, household, members } = await requireHousehold();
  const today = todayISO();
  const [debts, payments, income, ctx] = await Promise.all([
    loadDebts(supabase),
    loadPayments(supabase),
    loadIncome(supabase, monthStart(today)),
    loadPlanContext(supabase, household),
  ]);
  const plan = household.target_date ? computePlan(ctx, household.target_date, household.tight_margin_pct) : null;
  const receivedThisMonth =
    income.uber.filter((u) => u.workedOn <= today).reduce((s, u) => s + u.grossCents, 0) +
    income.entries.filter((e) => e.receivedOn <= today).reduce((s, e) => s + e.amountCents, 0);
  const totals = debtTotals(debts);
  const openInterest = debts
    .filter((d) => d.status !== "quitada")
    .reduce((s, d) => s + d.charges.reduce((x, c) => x + c.amountCents - c.paidCents, 0), 0);

  return (
    <div className="max-w-6xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Painel</h1>
        <p className="text-slate-500">Hoje é {formatDateBR(today)}</p>
      </header>

      {members.length === 1 && (
        <Card title="Convide o(a) parceiro(a)">
          <p className="text-slate-700">
            Só você está na casa por enquanto. Código de convite:{" "}
            <code className="rounded bg-slate-100 px-2 py-1 font-mono text-lg">{household.invite_code}</code>
          </p>
        </Card>
      )}

      {debts.length === 0 ? (
        <Card title="Comece pelas dívidas">
          <p className="text-slate-600">
            Nenhuma dívida cadastrada.{" "}
            <Link href="/dividas" className="font-semibold underline">
              Ir para Dívidas
            </Link>
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total de dívidas" value={formatBRL(totals.total)} />
          <Stat label="Total em atraso" value={formatBRL(totals.overdue)} tone="atraso" />
          <Stat label="Juros pagos no mês" value={formatBRL(interestPaidThisMonth(payments))} tone="juros" />
          <Stat label="Juros do mês em aberto" value={formatBRL(openInterest)} tone="juros" hint="Agiotas e contas com multa" />
          <Stat label="Renda recebida no mês" value={formatBRL(receivedThisMonth)} tone="quitado" hint="Uber bruto + entradas" />
        </div>
      )}

      {plan ? (
        <>
          <PlanVerdict ctx={ctx} plan={plan} compact />
          <Progress
            paidPrincipal={payments.reduce((s, p) => s + p.principalCents, 0)}
            remaining={totals.total}
            start={household.created_at}
            target={plan.target}
            today={today}
          />
          <Card title="Renda do mês × necessária">
            <Bar
              value={receivedThisMonth}
              max={plan.schedule.months[0].income}
              label={`${formatBRL(receivedThisMonth)} recebidos de ${formatBRL(plan.schedule.months[0].income)} (necessário em ${formatMonthBR(plan.schedule.months[0].month)})`}
            />
          </Card>
        </>
      ) : (
        <Card title="Quanto preciso ganhar">
          <p className="text-slate-600">
            Defina a data em que quer estar sem dívidas no{" "}
            <Link href="/plano" className="font-semibold underline">
              Plano
            </Link>{" "}
            para ver a renda necessária e a viabilidade.
          </p>
        </Card>
      )}
    </div>
  );
}

function Bar({ value, max, label, tone = "bg-slate-800" }: { value: number; max: number; label: string; tone?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div>
      <div className="h-4 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-4 rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="num mt-1 text-sm text-slate-600">
        {label} · {Math.round(pct)}%
      </p>
    </div>
  );
}

function Progress({
  paidPrincipal,
  remaining,
  start,
  target,
  today,
}: {
  paidPrincipal: number;
  remaining: number;
  start: string;
  target: string;
  today: string;
}) {
  const startDate = start.slice(0, 10);
  const totalDays = Math.max(1, diffDays(startDate, target));
  const elapsed = Math.min(totalDays, Math.max(0, diffDays(startDate, today)));
  return (
    <Card title={`Progresso até ${formatDateBR(target)}`}>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-600">Dívidas quitadas</p>
          <Bar
            value={paidPrincipal}
            max={paidPrincipal + remaining}
            tone="bg-quitado"
            label={`${formatBRL(paidPrincipal)} abatidos de ${formatBRL(paidPrincipal + remaining)}`}
          />
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-slate-600">Tempo até a data-alvo</p>
          <Bar value={elapsed} max={totalDays} label={`${elapsed} de ${totalDays} dias · faltam ${totalDays - elapsed}`} />
        </div>
      </div>
    </Card>
  );
}
