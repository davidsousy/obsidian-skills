import type { Metadata } from "next";
import Link from "next/link";
import { DebtSection, GROUP_PAGE } from "@/components/debt-list";
import { Button, Card, FlashMessages, LinkButton } from "@/components/ui";
import { loadDebts } from "@/lib/debts-data";
import { debtGroup, debtTotals, GROUP_LABEL, type DebtGroup } from "@/lib/finance/debts";
import { formatBRL } from "@/lib/finance/money";
import { requireHousehold } from "@/lib/session";
import { loadSeedDebts } from "../dividas/actions";

const OPEN_GROUPS = [
  { group: "atraso", color: "var(--color-atraso)" },
  { group: "agiotas", color: "var(--color-juros)" },
  { group: "parceladas", color: "var(--color-parcelado)" },
] as const;

/** Rosca em CSS (conic-gradient): cada grupo ocupa a sua fatia do total. */
function Donut({ parts, total }: { parts: { value: number; color: string }[]; total: number }) {
  let acc = 0;
  const stops = parts
    .map((p) => {
      const start = acc;
      acc += total > 0 ? (p.value / total) * 100 : 0;
      return `${p.color} ${start}% ${acc}%`;
    })
    .join(", ");
  return (
    <div
      className="relative size-48 shrink-0 rounded-full"
      style={{ background: total > 0 ? `conic-gradient(${stops})` : "#e2e8f0" }}
    >
      <div className="absolute inset-7 grid place-items-center rounded-full bg-white text-center">
        <div>
          <p className="text-xs text-slate-500">Total</p>
          <p className="num text-lg font-bold">{formatBRL(total)}</p>
        </div>
      </div>
    </div>
  );
}

export const metadata: Metadata = { title: "Composição da dívida total" };

export default async function ComposicaoPage({ searchParams }: PageProps<"/composicao">) {
  const { supabase } = await requireHousehold();
  const debts = await loadDebts(supabase);
  const totals = debtTotals(debts);
  const byGroup = (g: DebtGroup) => debts.filter((d) => debtGroup(d) === g);

  return (
    <div className="max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Composição da dívida total</h1>
          <p className="text-slate-500">Quanto de cada tipo de dívida forma o total. Clique em uma dívida para pagar ou editar.</p>
        </div>
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
          <Card>
            <div className="flex flex-col items-center gap-8 sm:flex-row">
              <Donut parts={OPEN_GROUPS.map((p) => ({ value: totals.byGroup[p.group], color: p.color }))} total={totals.total} />
              <ul className="w-full space-y-3">
                {OPEN_GROUPS.map(({ group, color }) => {
                  const value = totals.byGroup[group];
                  const pct = totals.total > 0 ? ((value / totals.total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "0";
                  return (
                    <li key={group}>
                      <Link href={GROUP_PAGE[group].href} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                        <span className="size-3 shrink-0 rounded-sm" style={{ background: color }} />
                        <span className="flex-1 font-medium">
                          {GROUP_LABEL[group]} <span className="font-normal text-slate-500">({byGroup(group).length})</span>
                        </span>
                        <span className="num w-14 text-right text-sm text-slate-500">{pct}%</span>
                        <span className="num w-32 text-right font-bold">{formatBRL(value)}</span>
                      </Link>
                    </li>
                  );
                })}
                <li className="flex items-center gap-3 border-t border-slate-200 px-2 pt-3 font-bold">
                  <span className="size-3 shrink-0" />
                  <span className="flex-1">Total</span>
                  <span className="num w-32 text-right">{formatBRL(totals.total)}</span>
                </li>
              </ul>
            </div>
          </Card>

          {(["atraso", "agiotas", "parceladas", "quitadas"] as const).map((group) => {
            const items = byGroup(group);
            return items.length ? (
              <DebtSection key={group} group={group} items={items} total={group === "quitadas" ? undefined : totals.byGroup[group]} />
            ) : null;
          })}
        </>
      )}
    </div>
  );
}
