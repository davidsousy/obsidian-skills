import { redirect } from "next/navigation";

// A casa é criada automaticamente no primeiro acesso (veja lib/bootstrap.ts).
export default function CasaPage() {
  redirect("/painel");
}
