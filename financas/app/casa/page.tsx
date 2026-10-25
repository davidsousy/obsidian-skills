import { redirect } from "next/navigation";
import { Button, Card, Field, FlashMessages, Input } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { signOut } from "../entrar/actions";
import { createHousehold, joinHousehold } from "./actions";

export default async function CasaPage({ searchParams }: PageProps<"/casa">) {
  const { supabase, user } = await requireUser();
  const { data: house } = await supabase.from("households").select("id").maybeSingle();
  if (house) redirect("/painel");

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 py-12">
      <div>
        <h1 className="text-2xl font-bold">Bem-vindo(a)</h1>
        <p className="text-slate-600">
          Logado como <strong>{user.email}</strong>. Crie a casa ou entre na casa que já existe com o código de convite.
        </p>
      </div>
      <FlashMessages searchParams={searchParams as Promise<{ erro?: string; ok?: string }>} />
      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Criar uma casa">
          <form action={createHousehold} className="space-y-4">
            <Field label="Nome da casa">
              <Input name="name" defaultValue="Casa David & Paola" required />
            </Field>
            <Field label="Seu nome">
              <Input name="display_name" placeholder="David" required />
            </Field>
            <Button type="submit">Criar casa</Button>
          </form>
        </Card>
        <Card title="Entrar com código de convite">
          <form action={joinHousehold} className="space-y-4">
            <Field label="Código" hint="Quem criou a casa encontra o código em Configurações">
              <Input name="invite_code" placeholder="A1B2C3D4" className="uppercase" required />
            </Field>
            <Field label="Seu nome">
              <Input name="display_name" placeholder="Paola" required />
            </Field>
            <Button type="submit">Entrar na casa</Button>
          </form>
        </Card>
      </div>
      <form action={signOut}>
        <button className="text-sm text-slate-500 underline">Sair</button>
      </form>
    </main>
  );
}
