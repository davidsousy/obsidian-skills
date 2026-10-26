import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function Card({ title, children, className = "" }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {title && <h2 className="mb-4 text-base font-semibold text-slate-700">{title}</h2>}
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 ${props.className ?? ""}`}
    />
  );
}

export function Select(props: ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 ${props.className ?? ""}`}
    />
  );
}

export function Button({ variant = "primary", ...props }: ComponentProps<"button"> & { variant?: "primary" | "secondary" }) {
  const styles =
    variant === "primary"
      ? "bg-slate-900 text-white hover:bg-slate-700"
      : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-100";
  return (
    <button
      {...props}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${styles} ${props.className ?? ""}`}
    />
  );
}

export function Notice({ kind, children }: { kind: "erro" | "ok"; children: ReactNode }) {
  const styles = kind === "erro" ? "border-red-200 bg-atraso-bg text-red-800" : "border-green-200 bg-quitado-bg text-green-800";
  return <p className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>{children}</p>;
}

/** Mostra ?erro= / ?ok= vindos de um redirect de server action. */
export async function FlashMessages({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const { erro, ok } = await searchParams;
  return (
    <>
      {erro && <Notice kind="erro">{erro}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}
    </>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "atraso" | "juros" | "parcelado" | "quitado";
  /** card inteiro vira link (com ↗), como no painel */
  href?: string;
}) {
  const color = {
    default: "text-slate-900",
    atraso: "text-atraso",
    juros: "text-juros",
    parcelado: "text-parcelado",
    quitado: "text-quitado",
  }[tone];
  const body = (
    <>
      <p className="flex items-center justify-between gap-2 text-sm font-medium text-slate-500">
        {label}
        {href && (
          <span aria-hidden className="text-base text-slate-400 group-hover:text-slate-800">
            ↗
          </span>
        )}
      </p>
      <p className={`num mt-1 whitespace-nowrap text-2xl font-bold xl:text-3xl ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </>
  );
  const box = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";
  return href ? (
    <Link href={href} className={`group block ${box} transition-colors hover:border-slate-400`}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}

export function LinkButton({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" }) {
  const styles =
    variant === "primary"
      ? "bg-slate-900 text-white hover:bg-slate-700"
      : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-100";
  return (
    <Link href={href} className={`inline-block rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${styles}`}>
      {children}
    </Link>
  );
}
