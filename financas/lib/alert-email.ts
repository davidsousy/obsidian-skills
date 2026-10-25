import type { DueItem } from "@/lib/finance/alerts";
import { formatDateBR } from "@/lib/finance/dates";
import { formatBRL } from "@/lib/finance/money";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** E-mail de aviso de vencimentos (pt-BR). */
export function buildAlertEmail(name: string, items: DueItem[], appUrl: string) {
  const total = items.reduce((s, i) => s + i.amountCents, 0);
  const date = items[0] ? formatDateBR(items[0].dueDate) : "";
  const subject =
    items.length === 1
      ? `Vence em ${date}: ${items[0].name} (${formatBRL(items[0].amountCents)})`
      : `Vencem em ${date}: ${items.length} contas (${formatBRL(total)})`;
  const rows = items
    .map(
      (i) =>
        `<tr><td style="padding:6px 12px 6px 0">${esc(i.name)}</td><td style="padding:6px 0;text-align:right;font-weight:600">${formatBRL(i.amountCents)}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:520px">
<p>Olá, ${esc(name)}!</p>
<p>Estes vencimentos chegam em <strong>${date}</strong>:</p>
<table style="border-collapse:collapse;width:100%">${rows}
<tr><td style="padding:8px 12px 0 0;border-top:1px solid #e2e8f0">Total</td><td style="padding:8px 0 0;border-top:1px solid #e2e8f0;text-align:right;font-weight:700">${formatBRL(total)}</td></tr></table>
<p><a href="${appUrl}/painel" style="display:inline-block;margin-top:16px;background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir o painel</a></p>
<p style="color:#64748b;font-size:12px">Você recebe este aviso porque ativou alertas por e-mail nas Configurações.</p>
</body></html>`;
  const text = `Olá, ${name}!\n\nVencimentos em ${date}:\n${items.map((i) => `- ${i.name}: ${formatBRL(i.amountCents)}`).join("\n")}\nTotal: ${formatBRL(total)}\n\n${appUrl}/painel`;
  return { subject, html, text };
}
