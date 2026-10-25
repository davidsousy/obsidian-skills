import { Card } from "@/components/ui";
import { formatDateBR, todayISO } from "@/lib/finance/dates";
import { requireHousehold } from "@/lib/session";

export default async function PainelPage() {
  const { household, members } = await requireHousehold();
  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Painel</h1>
        <p className="text-slate-500">Hoje é {formatDateBR(todayISO())}</p>
      </header>
      <Card title="Casa configurada">
        <p className="text-slate-700">
          {members.length === 1
            ? "Só você está na casa por enquanto. Envie o código de convite para o(a) parceiro(a) entrar."
            : `${members.map((m) => m.display_name).join(" e ")} já estão na casa e veem as mesmas informações.`}
        </p>
        {members.length === 1 && (
          <p className="mt-3">
            Código de convite: <code className="rounded bg-slate-100 px-2 py-1 font-mono text-lg">{household.invite_code}</code>
          </p>
        )}
      </Card>
      <Card title="Próximas etapas">
        <p className="text-slate-600">
          Os totais de dívidas, juros, renda × necessária e o card “Quanto preciso ganhar” aparecem aqui conforme os módulos
          forem sendo liberados.
        </p>
      </Card>
    </div>
  );
}
