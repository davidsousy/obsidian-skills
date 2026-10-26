import type { Metadata } from "next";
import Link from "next/link";
import { DebtForm } from "@/components/debt-form";
import { EMPTY_DEBT, type DebtFormValues } from "@/components/debt-form-values";
import { Card, FlashMessages } from "@/components/ui";
import { createDebt } from "../actions";

// ?tipo= vindo do "+ Nova dívida" de cada tela (Em atraso, Agiotas, Parceladas)
const TIPOS: Record<string, Pick<DebtFormValues, "kind" | "status">> = {
  atraso: { kind: "conta_em_atraso", status: "em_atraso" },
  agiota: { kind: "juros_sobre_principal", status: "em_dia" },
  parcelada: { kind: "parcelada_sem_juros", status: "em_dia" },
};

export const metadata: Metadata = { title: "Nova dívida" };

export default async function NovaDividaPage({ searchParams }: PageProps<"/dividas/nova">) {
  const { tipo } = (await searchParams) as { tipo?: string };
  const initial = { ...EMPTY_DEBT, ...(tipo ? TIPOS[tipo] : undefined) };
  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/composicao" className="text-sm text-slate-500 hover:underline">
        ← Todas as dívidas
      </Link>
      <h1 className="text-3xl font-bold">Nova dívida</h1>
      <FlashMessages searchParams={searchParams as Promise<{ erro?: string; ok?: string }>} />
      <Card>
        <DebtForm action={createDebt} initial={initial} submitLabel="Cadastrar dívida" />
      </Card>
    </div>
  );
}
