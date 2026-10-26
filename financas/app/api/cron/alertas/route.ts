import { createClient } from "@supabase/supabase-js";
import { runAlerts, type SendFn } from "@/lib/alerts-job";
import { todayISO } from "@/lib/finance/dates";
import { supabaseSecretKey, supabaseUrl } from "@/lib/supabase/env";

// Chamado todo dia pelo Vercel Cron (vercel.json). Envia avisos de vencimento por e-mail via Resend.
// Sem RESEND_API_KEY, roda em modo simulação (mostra o que seria enviado, sem enviar nem registrar).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "não autorizado" }, { status: 401 });
  }
  const admin = createClient(supabaseUrl()!, supabaseSecretKey()!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL ?? "Finanças da Casa <onboarding@resend.dev>";
  const send: SendFn | undefined = apiKey
    ? async (email) => {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
        });
        if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
      }
    : undefined;

  const url = new URL(request.url);
  const today = url.searchParams.get("data") ?? todayISO(); // ?data=aaaa-mm-dd para testar
  const appUrl = process.env.APP_URL ?? url.origin;
  const result = await runAlerts(admin, today, appUrl, send);
  return Response.json(result);
}
