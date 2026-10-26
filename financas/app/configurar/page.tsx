import { redirect } from "next/navigation";
import { supabaseConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default function ConfigurarPage() {
  if (supabaseConfigured()) redirect("/entrar");
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 py-16">
      <h1 className="text-3xl font-bold">Finanças da Casa</h1>
      <p className="text-slate-700">
        O app está no ar, mas ainda falta conectar o banco de dados (Supabase). Assim que as variáveis forem configuradas na
        Vercel, esta página some e aparece a tela de login.
      </p>
      <ol className="list-decimal space-y-2 pl-6 text-slate-700">
        <li>
          Na Vercel, abra o projeto → <strong>Storage</strong> → <strong>Create Database</strong> → <strong>Supabase</strong>{" "}
          (ou crie o projeto em supabase.com e cadastre as variáveis manualmente).
        </li>
        <li>
          No Supabase, abra o <strong>SQL Editor</strong>, cole o conteúdo de <code>financas/supabase/setup.sql</code> e rode.
        </li>
        <li>Faça um novo deploy (Deployments → Redeploy).</li>
      </ol>
    </main>
  );
}
