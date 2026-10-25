import { Button, Card, Field, FlashMessages, Input, Select } from "@/components/ui";
import { formatAmount } from "@/lib/finance/money";
import { requireHousehold } from "@/lib/session";
import { regenerateInvite, updateHousehold, updateMyPreferences } from "./actions";

export default async function ConfiguracoesPage({ searchParams }: PageProps<"/configuracoes">) {
  const { household, members, me, user } = await requireHousehold();

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-3xl font-bold">Configurações</h1>
      <FlashMessages searchParams={searchParams as Promise<{ erro?: string; ok?: string }>} />

      <Card title="Casa">
        <form action={updateHousehold} className="grid gap-4 md:grid-cols-2">
          <Field label="Nome da casa">
            <Input name="name" defaultValue={household.name} required />
          </Field>
          <Field label="Rateio do custo do carro no Uber" hint="Recarga e limpeza divididas pelas horas ou pelos dias rodados">
            <Select name="car_cost_allocation" defaultValue={household.car_cost_allocation}>
              <option value="por_hora">Por hora rodada</option>
              <option value="por_dia">Por dia rodado</option>
            </Select>
          </Field>
          <Field label="Meta da reserva de emergência (R$)">
            <Input name="reserve_target" inputMode="decimal" defaultValue={formatAmount(household.reserve_target_cents)} required />
          </Field>
          <Field label="Reserva atual (R$)" hint="Quanto da reserva já está guardado">
            <Input name="reserve_balance" inputMode="decimal" defaultValue={formatAmount(household.reserve_balance_cents)} required />
          </Field>
          <Field label="Margem para “apertado” (%)" hint="Folga abaixo disso = apertado; abaixo de zero = inviável">
            <Input
              name="tight_margin_pct"
              inputMode="decimal"
              defaultValue={household.tight_margin_pct.toLocaleString("pt-BR")}
              required
            />
          </Field>
          <div />
          <Field label="Gastos variáveis estimados por mês (R$)" hint="Usado até existir 1 mês de lançamentos">
            <Input
              name="initial_variable"
              inputMode="decimal"
              defaultValue={formatAmount(household.initial_variable_monthly_cents)}
              required
            />
          </Field>
          <Field label="Renda mensal estimada (R$)" hint="Usada até existirem 30 dias de lançamentos de renda">
            <Input
              name="initial_income"
              inputMode="decimal"
              defaultValue={formatAmount(household.initial_income_monthly_cents)}
              required
            />
          </Field>
          <div className="md:col-span-2">
            <Button type="submit">Salvar configurações da casa</Button>
          </div>
        </form>
      </Card>

      <Card title="Minhas preferências">
        <form action={updateMyPreferences} className="grid gap-4 md:grid-cols-3">
          <Field label="Meu nome">
            <Input name="display_name" defaultValue={me.display_name} required />
          </Field>
          <Field label="Avisar quantos dias antes do vencimento">
            <Input name="alert_days_before" type="number" min={0} max={30} defaultValue={me.alert_days_before} required />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input name="email_alerts" type="checkbox" defaultChecked={me.email_alerts} className="size-4" />
            Receber alertas por e-mail ({user.email})
          </label>
          <div className="md:col-span-3">
            <Button type="submit">Salvar preferências</Button>
          </div>
        </form>
      </Card>

      <Card title="Membros da casa">
        <ul className="mb-4 divide-y divide-slate-100">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between py-2">
              <span className="font-medium">
                {m.display_name}
                {m.user_id === user.id && <span className="ml-2 text-xs text-slate-500">(você)</span>}
              </span>
              <span className="text-sm text-slate-500">
                {m.email_alerts ? `alertas por e-mail ${m.alert_days_before} dia(s) antes` : "sem alertas por e-mail"}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-600">Código de convite:</span>
          <code className="rounded bg-slate-100 px-3 py-1 font-mono text-lg tracking-widest">{household.invite_code}</code>
          <form action={regenerateInvite}>
            <Button variant="secondary" type="submit">
              Gerar novo código
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
