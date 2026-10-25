// Custos fixos do seed (outubro/2026) — os mesmos de load_seed_fixed_costs() no banco.

import type { CostCategory, FixedCost } from "./costs";

type Row = [name: string, reais: number, category: CostCategory, approx: boolean, fromNov: boolean, dueDay?: number];

const ROWS: Row[] = [
  ["Aluguel", 4600, "moradia", false, true, 5],
  ["Condomínio", 450, "moradia", false, true, 5],
  ["Alimentação", 1500, "alimentacao", true, false],
  ["Recarga do carro", 1500, "carro", true, false],
  ["Uber da Paola", 1100, "pessoal", false, false],
  ["Terapia", 360, "saude", false, true],
  ["Água", 300, "moradia", true, true],
  ["Cílios da Paola", 220, "pessoal", false, false],
  ["Luz", 180, "moradia", true, true],
  ["Claude Code David", 129, "assinaturas", false, false],
  ["Claude Code Paola", 129, "assinaturas", false, false],
  ["Internet da Paola", 110, "assinaturas", false, false],
  ["Limpeza do carro", 100, "carro", true, false],
  ["Gemini", 99, "assinaturas", false, false],
  ["Futebol", 80, "lazer", false, false],
  ["Netflix", 49, "assinaturas", false, false],
  ["Spotify", 25, "assinaturas", false, false],
];

export function seedFixedCosts(): FixedCost[] {
  return ROWS.map(([name, reais, category, approx, fromNov, dueDay], i) => ({
    id: `fixo-${i + 1}`,
    name,
    amountCents: reais * 100,
    dueDay: dueDay ?? null,
    category,
    ownerUserId: null,
    isApproximate: approx,
    active: true,
    startsOn: fromNov ? "2026-11-01" : null,
  }));
}
