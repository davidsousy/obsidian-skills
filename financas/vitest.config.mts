import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    // Testes de banco (tests/db) precisam do Supabase local e rodam com `npm run test:db`.
    projects: [
      { extends: true, test: { name: "unit", include: ["lib/**/*.test.ts"] } },
      { extends: true, test: { name: "db", include: ["tests/db/**/*.test.ts"], fileParallelism: false } },
    ],
  },
});
