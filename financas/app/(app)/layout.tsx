import { Nav } from "@/components/nav";
import { requireHousehold } from "@/lib/session";
import { signOut } from "../entrar/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { household, me } = await requireHousehold();
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-slate-200 bg-white p-4 md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <div className="mb-4 flex items-center justify-between md:block">
          <div>
            <p className="font-bold">{household.name}</p>
            <p className="text-xs text-slate-500">Olá, {me.display_name}</p>
          </div>
          <form action={signOut} className="md:mt-2">
            <button className="text-xs text-slate-500 underline">Sair</button>
          </form>
        </div>
        <Nav />
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
