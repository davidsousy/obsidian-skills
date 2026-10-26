"use client";

import Link from "next/link";

// Tela amigável para erros inesperados (em produção o detalhe técnico fica nos logs da Vercel).
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl space-y-4 p-6 py-16">
      <h1 className="text-2xl font-bold">Algo deu errado</h1>
      <p className="text-slate-700">A página não carregou. Tente de novo; se continuar, abra o diagnóstico e mande um print.</p>
      {error.digest && <p className="font-mono text-xs text-slate-500">Código do erro: {error.digest}</p>}
      <div className="flex gap-3">
        <button onClick={reset} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          Tentar de novo
        </button>
        <Link href="/diagnostico" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">
          Ver diagnóstico
        </Link>
      </div>
    </main>
  );
}
