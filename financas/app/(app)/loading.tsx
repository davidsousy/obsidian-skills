// Enquanto a tela busca os dados (o menu e o cabeçalho continuam na tela).
export default function Carregando() {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 py-16 text-slate-500">
      <span className="size-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
      Carregando…
    </div>
  );
}
