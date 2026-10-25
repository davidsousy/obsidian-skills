import Link from "next/link";
import { notFound } from "next/navigation";
import { FixedCostForm } from "@/components/fixed-cost-form";
import { Card, FlashMessages } from "@/components/ui";
import { loadFixedCosts } from "@/lib/costs-data";
import { requireHousehold } from "@/lib/session";
import { deleteFixedCost, updateFixedCost } from "../../actions";

export default async function EditarCustoPage({ params, searchParams }: PageProps<"/custos/fixos/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, members } = await requireHousehold();
  const [cost] = await loadFixedCosts(supabase, id);
  if (!cost) notFound();

  return (
    <div className="max-w-5xl space-y-6">
      <Link href="/custos" className="text-sm text-slate-500 hover:underline">
        ← Custos
      </Link>
      <h1 className="text-3xl font-bold">{cost.name}</h1>
      <FlashMessages searchParams={searchParams as Promise<{ erro?: string; ok?: string }>} />
      <Card>
        <FixedCostForm action={updateFixedCost.bind(null, id)} members={members} cost={cost} submitLabel="Salvar alterações" />
      </Card>
      <form action={deleteFixedCost.bind(null, id)}>
        <button className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50">
          Excluir este custo
        </button>
        <span className="ml-3 text-sm text-slate-500">Para parar de contar sem apagar o histórico, marque “Inativo”.</span>
      </form>
    </div>
  );
}
