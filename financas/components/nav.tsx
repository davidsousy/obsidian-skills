"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; badge?: number };

const mainItems: Item[] = [
  { href: "/painel", label: "Painel" },
  { href: "/atrasos", label: "Em atraso" },
  { href: "/agiotas", label: "Agiotas" },
  { href: "/parceladas", label: "Parceladas" },
  { href: "/custos", label: "Custos fixos" },
  { href: "/resumo", label: "Resumo do mês" },
];

const moreItems: Item[] = [
  { href: "/calendario", label: "Calendário" },
  { href: "/renda", label: "Renda" },
  { href: "/plano", label: "Plano" },
  { href: "/simulador", label: "Simulador" },
  { href: "/configuracoes", label: "Configurações" },
];

function NavLink({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`flex items-center justify-between gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
        active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-200"
      }`}
    >
      {item.label}
      {item.badge !== undefined && (
        <span
          className={`num min-w-6 rounded-full px-1.5 text-center text-xs font-bold ${
            item.badge > 0 ? "bg-atraso text-white" : active ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
          }`}
        >
          {item.badge}
        </span>
      )}
    </Link>
  );
}

/** Menu do documento (Painel, Em atraso, Agiotas, Parceladas, Custos fixos, Resumo do mês) + "Mais". */
export function Nav({ overdueCount }: { overdueCount: number }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const main = mainItems.map((i) => (i.href === "/atrasos" ? { ...i, badge: overdueCount } : i));
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      <p className="hidden px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 md:block">Menu</p>
      {main.map((item) => (
        <NavLink key={item.href} item={item} active={isActive(item.href)} />
      ))}
      <span className="mx-1 w-px shrink-0 bg-slate-200 md:mx-0 md:my-2 md:h-px md:w-auto" />
      <p className="hidden px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 md:block">Mais</p>
      {moreItems.map((item) => (
        <NavLink key={item.href} item={item} active={isActive(item.href)} />
      ))}
    </nav>
  );
}
