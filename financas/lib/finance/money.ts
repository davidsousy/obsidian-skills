// Dinheiro é sempre representado em centavos inteiros (number seguro até ~R$ 90 trilhões).
// Nunca fazer conta com float de reais.

export type Cents = number;

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const plain = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 123456 → "R$ 1.234,56" (espaço normal, não o NBSP do Intl). */
export function formatBRL(cents: Cents): string {
  return brl.format(cents / 100).replace(/ /g, " ");
}

/** 123456 → "1.234,56" */
export function formatAmount(cents: Cents): string {
  return plain.format(cents / 100);
}

/**
 * Converte o que o usuário digitou em centavos.
 * Aceita "1.234,56", "1234,56", "1234.56", "R$ 1.234", "1234". Retorna null se inválido.
 */
export function parseBRL(input: string): Cents | null {
  let s = input.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!s) return null;
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);

  if (s.includes(",")) {
    // formato brasileiro: ponto = milhar, vírgula = decimal
    if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(s)) return null;
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.234" ou "1.234.567" sem vírgula: pontos são separadores de milhar
    s = s.replace(/\./g, "");
  } else if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    return null;
  }

  const [int, dec = ""] = s.split(".");
  const cents = Number(int) * 100 + Number(dec.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/** Arredonda meio centavo para longe do zero (ex.: juros calculados com taxa). */
export function roundCents(value: number): Cents {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/** principal × taxa (taxa em fração: 0.4 = 40%), arredondado ao centavo. */
export function applyRate(cents: Cents, rate: number): Cents {
  return roundCents(cents * rate);
}

/** "40" ou "40,5" (percentual digitado) → 0.4 / 0.405. */
export function parsePercent(input: string): number | null {
  const s = input.trim().replace("%", "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s) / 100;
}

/** 0.4 → "40%"; 0.125 → "12,5%" */
export function formatPercent(rate: number): string {
  return `${(rate * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}
