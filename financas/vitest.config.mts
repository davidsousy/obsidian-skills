import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    // variáveis do .env / .env.local (chaves do Supabase local para os testes de banco)
    env: loadEnv("test", process.cwd(), ""),
    // Testes de banco (tests/db) precisam do Supabase local e rodam com `npm run test:db`.
    projects: [
      { extends: true, test: { name: "unit", include: ["lib/**/*.test.ts"] } },
      { extends: true, test: { name: "db", include: ["tests/db/**/*.test.ts"], fileParallelism: false } },
    ],
  },
});
