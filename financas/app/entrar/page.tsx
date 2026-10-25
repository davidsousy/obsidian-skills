import { Button, Card, Field, FlashMessages, Input } from "@/components/ui";
import { signIn, signUp } from "./actions";

export default function EntrarPage({ searchParams }: PageProps<"/entrar">) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Finanças da Casa</h1>
          <p className="text-sm text-slate-500">Rumo ao zero em dívidas</p>
        </div>
        <FlashMessages searchParams={searchParams as Promise<{ erro?: string; ok?: string }>} />
        <Card>
          <form className="space-y-4">
            <Field label="E-mail">
              <Input name="email" type="email" autoComplete="email" required />
            </Field>
            <Field label="Senha" hint="Mínimo de 6 caracteres">
              <Input name="password" type="password" autoComplete="current-password" minLength={6} required />
            </Field>
            <div className="flex gap-2">
              <Button formAction={signIn} className="flex-1">
                Entrar
              </Button>
              <Button formAction={signUp} variant="secondary" className="flex-1">
                Criar conta
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </main>
  );
}
