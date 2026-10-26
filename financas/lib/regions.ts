// Região do banco (Supabase na AWS), lida das variáveis da integração Vercel + Supabase, e a região
// da Vercel mais próxima dela. Funções longe do banco deixam cada página bem mais lenta.

const NEAREST_VERCEL: Record<string, { code: string; city: string }> = {
  "sa-east-1": { code: "gru1", city: "São Paulo" },
  "us-east-1": { code: "iad1", city: "Washington" },
  "us-east-2": { code: "cle1", city: "Cleveland" },
  "us-west-1": { code: "sfo1", city: "São Francisco" },
  "us-west-2": { code: "pdx1", city: "Portland" },
  "ca-central-1": { code: "yul1", city: "Montreal" },
  "eu-west-1": { code: "dub1", city: "Dublin" },
  "eu-west-2": { code: "lhr1", city: "Londres" },
  "eu-west-3": { code: "cdg1", city: "Paris" },
  "eu-central-1": { code: "fra1", city: "Frankfurt" },
  "eu-north-1": { code: "arn1", city: "Estocolmo" },
  "ap-south-1": { code: "bom1", city: "Mumbai" },
  "ap-southeast-1": { code: "sin1", city: "Singapura" },
  "ap-southeast-2": { code: "syd1", city: "Sydney" },
  "ap-northeast-1": { code: "hnd1", city: "Tóquio" },
  "ap-northeast-2": { code: "icn1", city: "Seul" },
};

const POSTGRES_VARS = ["POSTGRES_URL", "POSTGRES_URL_NON_POOLING", "POSTGRES_PRISMA_URL", "POSTGRES_HOST"];

/** Ex.: "sa-east-1" a partir de `...@aws-0-sa-east-1.pooler.supabase.com:6543/...` (null se não der para saber). */
export function databaseRegion(env: Record<string, string | undefined> = process.env): string | null {
  for (const name of POSTGRES_VARS) {
    const match = env[name]?.match(/aws-\d+-([a-z]{2}-[a-z]+-\d)\.pooler\.supabase\.com/);
    if (match) return match[1];
  }
  return null;
}

export function nearestVercelRegion(dbRegion: string): { code: string; city: string } | null {
  return NEAREST_VERCEL[dbRegion] ?? null;
}
