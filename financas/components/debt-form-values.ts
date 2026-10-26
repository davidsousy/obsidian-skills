// Valores do formulário de dívida. Fica fora do debt-form.tsx ("use client") para as páginas do
// servidor poderem usar o objeto de verdade (de um módulo de cliente o servidor só recebe uma referência).

import type { DebtKind, DebtStatus } from "@/lib/finance/debts";

export type DebtFormValues = {
  name: string;
  creditor: string;
  kind: DebtKind;
  status: DebtStatus;
  dueDay: string;
  notes: string;
  riskPriority: boolean;
  original: string;
  installment: string;
  installmentsRemaining: string;
  installmentsUnknown: boolean;
  monthlyRate: string;
  principal: string;
  accrualStart: string;
  openAmount: string;
  originalDueDate: string;
  lateFeeRate: string;
  lateInterestRate: string;
};

export const EMPTY_DEBT: DebtFormValues = {
  name: "", creditor: "", kind: "parcelada_sem_juros", status: "em_dia", dueDay: "", notes: "", riskPriority: false,
  original: "", installment: "", installmentsRemaining: "", installmentsUnknown: false, monthlyRate: "", principal: "",
  accrualStart: "", openAmount: "", originalDueDate: "", lateFeeRate: "", lateInterestRate: "",
};
