import { Nav } from "@/components/nav";
import { PersonSwitcher } from "@/components/person-switcher";
import { personByEmail } from "@/lib/auto-auth";
import { requireHousehold } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { household, me, user } = await requireHousehold();
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-slate-200 bg-white p-4 md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <div className="mb-4 flex items-start justify-between gap-3 md:block">
          <div>
            <p className="font-bold">{household.name}</p>
            <p className="text-xs text-slate-500">Olá, {me.display_name}</p>
          </div>
          <PersonSwitcher current={personByEmail(user.email)} />
        </div>
        <Nav />
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
