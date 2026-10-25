"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// `ready: false` = módulo de uma etapa futura (aparece desabilitado).
const items = [
  { href: "/painel", label: "Painel", ready: true },
  { href: "/dividas", label: "Dívidas", ready: true },
  { href: "/custos", label: "Custos", ready: true },
  { href: "/renda", label: "Renda", ready: true },
  { href: "/plano", label: "Plano", ready: true },
  { href: "/simulador", label: "Simulador", ready: false },
  { href: "/configuracoes", label: "Configurações", ready: true },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {items.map((item) =>
        item.ready ? (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
              pathname.startsWith(item.href) ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-200"
            }`}
          >
            {item.label}
          </Link>
        ) : (
          <span
            key={item.href}
            title="Disponível nas próximas etapas"
            className="flex cursor-not-allowed items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-slate-400"
          >
            {item.label}
            <span className="rounded bg-slate-200 px-1.5 text-[10px] uppercase text-slate-500">em breve</span>
          </span>
        ),
      )}
    </nav>
  );
}
