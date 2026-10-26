import { redirect } from "next/navigation";

// O app não tem mais tela de login: entra sozinho (veja lib/auto-auth.ts).
export default function EntrarPage() {
  redirect("/painel");
}
