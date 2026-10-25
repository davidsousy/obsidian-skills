import Link from "next/link";
import { groupStyle, RiskBadge, StatusBadge } from "@/components/debt-badges";
import { Button, Card, FlashMessages, LinkButton, Stat } from "@/components/ui";
import { interestPaidThisMonth, loadDebts, loadPayments, type DebtRow } from "@/lib/debts-data";
import { formatDateBR } from "@/lib/finance/dates";
import { debtGroup, debtTotals, GROUP_LABEL, type DebtGroup } from "@/lib/finance/debts";
import { formatBRL, formatPercent } from "@/lib/finance/money";
import { requireHousehold } from "@/lib/session";
import { loadSeedDebts } from "./actions";

const GROUP_ORDER: DebtGroup[] = ["atraso", "agiotas", "parceladas", "quitadas"];

function detail(d: DebtRow): string {
  switch (d.kind) {
    case "juros_sobre_principal":
      return `Principal ${formatBRL(d.principalCents ?? 0)} · ${formatPercent(d.monthlyRate ?? 0)} a.m.`;
    case "conta_em_atraso":
      return d.originalDueDate ? `Venceu em ${formatDateBR(d.originalDueDate)}` : "";
    default: {
      const parcela = formatBRL(d.installmentCents ?? 0);
      if (!d.installmentsKnown) return `${parcela}/mês · parcelas a informar`;
      const juros = d.kind === "parcelada_com_juros" && d.monthlyRate ? ` · ${formatPercent(d.monthlyRate)} a.m.` : "";
      return `${d.installmentsRemaining}× de ${parcela}${juros}`;
    }
  }
}

export default async function DividasPage({ searchParams }: PageProps<"/dividas">) {
  const { supabase } = await requireHousehold();
  const [debts, payments] = await Promise.all([loadDebts(supabase), loadPayments(supabase)]);
  const totals = debtTotals(debts);
  const interestTotal = payments.reduce((s, p) => s + p.interestCents, 0);
  const groups = GROUP_ORDER.map((g) => ({ group: g, items: debts.filter((d) => debtGroup(d) === g) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <div className="max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Dívidas</h1>
        <LinkButton href="/dividas/nova">+ Nova dívida</LinkButton>
      </header>
      <FlashMessages searchParams={searchParams as Promise<{ erro?: string; ok?: string }>} />

      {debts.length === 0 ? (
        <Card title="Nenhuma dívida cadastrada">
          <p className="mb-4 text-slate-600">
            Carregue a lista combinada de outubro/2026 (13 dívidas, total R$ 42.344,00) ou cadastre uma a uma.
          </p>
          <form action={loadSeedDebts}>
            <Button type="submit">Carregar dívidas de outubro/2026</Button>
          </form>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Total de dívidas" value={formatBRL(totals.total)} hint={`${debts.filter((d) => d.status !== "quitada").length} em aberto`} />
            <Stat label="Em atraso" value={formatBRL(totals.overdue)} tone="atraso" />
            <Stat label="Juros pagos no mês" value={formatBRL(interestPaidThisMonth(payments))} tone="juros" />
            <Stat label="Juros pagos (total)" value={formatBRL(interestTotal)} tone="juros" />
          </div>

          {groups.map(({ group, items }) => (
            <section key={group} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className={`flex items-center justify-between border-b border-slate-200 px-5 py-3 ${groupStyle[group].bg}`}>
                <h2 className={`flex items-center gap-2 font-semibold ${groupStyle[group].text}`}>
                  <span className={`size-2.5 rounded-full ${groupStyle[group].bar}`} />
                  {GROUP_LABEL[group]} <span className="font-normal text-slate-500">({items.length})</span>
                </h2>
                {group !== "quitadas" && (
                  <span className={`num text-lg font-bold ${groupStyle[group].text}`}>{formatBRL(totals.byGroup[group])}</span>
                )}
              </div>
              <ul className="divide-y divide-slate-100">
                {items.map((d) => (
                  <li key={d.id}>
                    <Link href={`/dividas/${d.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-slate-50">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {d.name}
                          {d.creditor && <span className="ml-2 text-sm font-normal text-slate-500">{d.creditor}</span>}
                        </p>
                        <p className="text-sm text-slate-500">
                          {[
                            detail(d),
                            d.dueDay && `vence dia ${d.dueDay}`,
                            d.kind === "juros_sobre_principal" &&
                              d.interestPaidCents > 0 &&
                              `${formatBRL(d.interestPaidCents)} pagos só de juros`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {d.riskPriority && d.status !== "quitada" && <RiskBadge />}
                        <StatusBadge status={d.status} />
                      </div>
                      <p className={`num w-36 text-right text-xl font-bold ${d.status === "quitada" ? "text-quitado" : ""}`}>
                        {formatBRL(d.currentBalanceCents)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
