import type { SupabaseClient } from "@supabase/supabase-js";
import type { ISODate } from "@/lib/finance/dates";

export type NegotiationStatus = "aberta" | "aceita" | "recusada";
export type EntryKind = "contato" | "proposta_feita" | "proposta_recebida";

export type NegotiationEntry = {
  id: string;
  occurredOn: ISODate;
  kind: EntryKind;
  amountCents: number | null;
  installments: number | null;
  conditions: string | null;
  status: NegotiationStatus;
  createdBy: string | null;
};

export type Negotiation = {
  id: string;
  status: NegotiationStatus;
  openedOn: ISODate;
  closedOn: ISODate | null;
  entries: NegotiationEntry[];
};

export type DebtRevision = { id: string; reason: string; createdAt: string; snapshot: { debt: Record<string, unknown> } };

export async function loadNegotiations(
  supabase: SupabaseClient,
  debtId: string,
): Promise<{ negotiations: Negotiation[]; revisions: DebtRevision[] }> {
  const [n, r] = await Promise.all([
    supabase
      .from("negotiations")
      .select("*, negotiation_entries(*)")
      .eq("debt_id", debtId)
      .order("created_at", { ascending: false }),
    supabase.from("debt_revisions").select("id, reason, created_at, snapshot").eq("debt_id", debtId).order("created_at"),
  ]);
  if (n.error || r.error) throw new Error((n.error ?? r.error)!.message);
  return {
    negotiations: (n.data ?? []).map((row) => ({
      id: row.id,
      status: row.status,
      openedOn: row.opened_on,
      closedOn: row.closed_on,
      entries: ((row.negotiation_entries ?? []) as Record<string, unknown>[])
        .map((e) => ({
          id: e.id as string,
          occurredOn: e.occurred_on as string,
          kind: e.kind as EntryKind,
          amountCents: e.amount_cents == null ? null : Number(e.amount_cents),
          installments: (e.installments as number) ?? null,
          conditions: (e.conditions as string) ?? null,
          status: e.status as NegotiationStatus,
          createdBy: (e.created_by as string) ?? null,
        }))
        .sort((a, b) => (a.occurredOn < b.occurredOn ? -1 : a.occurredOn > b.occurredOn ? 1 : 0)),
    })),
    revisions: (r.data ?? []).map((x) => ({ id: x.id, reason: x.reason, createdAt: x.created_at, snapshot: x.snapshot })),
  };
}
