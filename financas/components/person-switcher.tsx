import { switchPerson } from "@/app/(app)/pessoa-actions";
import { PEOPLE, type Person } from "@/lib/auto-auth";

/** "Usando como: David | Paola" — define quem aparece como responsável pelos lançamentos. */
export function PersonSwitcher({ current }: { current: Person | null }) {
  return (
    <div className="flex items-center gap-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">Usando como</p>
      <div className="flex gap-1">
        {(Object.keys(PEOPLE) as Person[]).map((p) => (
          <form key={p} action={switchPerson}>
            <input type="hidden" name="pessoa" value={p} />
            <button
              type="submit"
              disabled={current === p}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                current === p ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {PEOPLE[p].name}
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
