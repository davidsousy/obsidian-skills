import { redirect } from "next/navigation";

// A lista de todas as dívidas agora é a "Composição da dívida total".
export default function DividasPage() {
  redirect("/composicao");
}
