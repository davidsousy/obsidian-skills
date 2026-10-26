import Link from "next/link";
import { notFound } from "next/navigation";
import { DebtForm } from "@/components/debt-form";
import type { DebtFormValues } from "@/components/debt-form-values";
import { Card, FlashMessages } from "@/components/ui";
import { loadDebts, type DebtRow } from "@/lib/debts-data";
import { formatAmount } from "@/lib/finance/money";
import { requireHousehold } from "@/lib/session";
import { updateDebt } from "../../actions";

const amount = (cents: number | null | undefined) => (cents == null ? "" : formatAmount(cents));
const pct = (rate: number | null | undefined) => (rate == null ? "" : (rate * 100).toLocaleString("pt-BR"));

function toForm(d: DebtRow): DebtFormValues {
  return {
    name: d.name,
    creditor: d.creditor ?? "",
    kind: d.kind,
    status: d.status,
    dueDay: d.dueDay?.toString() ?? "",
    notes: d.notes ?? "",
    riskPriority: d.riskPriority,
    original: amount(d.originalCents),
    installment: amount(d.installmentCents),
    installmentsRemaining: d.installmentsRemaining?.toString() ?? "",
    installmentsUnknown: !d.installmentsKnown,
    monthlyRate: pct(d.monthlyRate),
    principal: amount(d.principalCents),
    accrualStart: d.accrualStartMonth ?? "",
    openAmount: amount(d.principalCents),
    originalDueDate: d.originalDueDate ?? "",
    lateFeeRate: pct(d.lateFeeRate),
    lateInterestRate: pct(d.lateInterestRate),
  };
}

export default async function EditarDividaPage({ params, searchParams }: PageProps<"/dividas/[id]/editar">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase } = await requireHousehold();
  const [debt] = await loadDebts(supabase, id);
  if (!debt) notFound();

  return (
    <div className="max-w-4xl space-y-6">
      <Link href={`/dividas/${id}`} className="text-sm text-slate-500 hover:underline">
        ← {debt.name}
      </Link>
      <h1 className="text-3xl font-bold">Editar dívida</h1>
      <FlashMessages searchParams={searchParams as Promise<{ erro?: string; ok?: string }>} />
      <Card>
        <DebtForm action={updateDebt.bind(null, id)} initial={toForm(debt)} submitLabel="Salvar alterações" isEdit />
      </Card>
    </div>
  );
}
