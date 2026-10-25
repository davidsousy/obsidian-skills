import Link from "next/link";
import { DebtForm, EMPTY_DEBT } from "@/components/debt-form";
import { Card, FlashMessages } from "@/components/ui";
import { createDebt } from "../actions";

export default function NovaDividaPage({ searchParams }: PageProps<"/dividas/nova">) {
  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/dividas" className="text-sm text-slate-500 hover:underline">
        ← Dívidas
      </Link>
      <h1 className="text-3xl font-bold">Nova dívida</h1>
      <FlashMessages searchParams={searchParams as Promise<{ erro?: string; ok?: string }>} />
      <Card>
        <DebtForm action={createDebt} initial={EMPTY_DEBT} submitLabel="Cadastrar dívida" />
      </Card>
    </div>
  );
}
