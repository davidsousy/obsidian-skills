import { randomUUID } from "node:crypto";
import pg from "pg";

// Testes de banco rodam contra o Supabase local (`npx supabase start`).
export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export function connect(): pg.Client {
  return new pg.Client({ connectionString: DATABASE_URL });
}

/** Cria um usuário direto em auth.users (como superusuário). */
export async function createUser(db: pg.Client, label: string): Promise<string> {
  const id = randomUUID();
  await db.query(
    `insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data)
     values ($1, $2, 'authenticated', 'authenticated', '{}', '{}')`,
    [id, `${label}-${id.slice(0, 8)}@teste.local`],
  );
  return id;
}

export async function deleteUsers(db: pg.Client, ids: string[]): Promise<void> {
  await db.query(
    `delete from households where id in (select household_id from household_members where user_id = any($1))`,
    [ids],
  );
  await db.query(`delete from auth.users where id = any($1)`, [ids]);
}

/**
 * Executa `fn` como o usuário `userId` (role authenticated + JWT claims), exatamente como o
 * PostgREST faz. `null` = visitante anônimo. A transação é sempre confirmada se `fn` não falhar.
 */
export async function asUser<T>(
  db: pg.Client,
  userId: string | null,
  fn: (q: (sql: string, params?: unknown[]) => Promise<pg.QueryResult>) => Promise<T>,
): Promise<T> {
  await db.query("begin");
  try {
    if (userId) {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: "authenticated" }),
      ]);
    } else {
      await db.query("set local role anon");
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ role: "anon" }),
      ]);
    }
    const result = await fn((sql, params) => db.query(sql, params));
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}
