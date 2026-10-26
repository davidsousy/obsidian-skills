import { describe, expect, it } from "vitest";
import { databaseRegion, nearestVercelRegion } from "./regions";

describe("região do banco", () => {
  it("lê a região do host do pooler do Supabase", () => {
    const env = { POSTGRES_URL: "postgres://postgres.abc:segredo@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require" };
    expect(databaseRegion(env)).toBe("sa-east-1");
    expect(databaseRegion({ POSTGRES_URL_NON_POOLING: "postgres://x@aws-1-us-east-1.pooler.supabase.com:5432/postgres" })).toBe("us-east-1");
  });

  it("sem as variáveis da integração não dá para saber", () => {
    expect(databaseRegion({})).toBeNull();
    expect(databaseRegion({ POSTGRES_HOST: "db.abc.supabase.co" })).toBeNull();
  });

  it("aponta a região da Vercel mais próxima", () => {
    expect(nearestVercelRegion("sa-east-1")).toEqual({ code: "gru1", city: "São Paulo" });
    expect(nearestVercelRegion("us-east-1")?.code).toBe("iad1");
    expect(nearestVercelRegion("xx-nowhere-9")).toBeNull();
  });
});
