import { describe, expect, it } from "vitest";
import { isInternalEmail, parsePerson, personByEmail, personCredentials, personPassword, safeReturnPath } from "./auto-auth";

describe("acesso sem login", () => {
  it("pessoa do cookie: Paola só quando escolhida; qualquer outra coisa é David", () => {
    expect(parsePerson("paola")).toBe("paola");
    expect(parsePerson("david")).toBe("david");
    expect(parsePerson(undefined)).toBe("david");
    expect(parsePerson("admin")).toBe("david");
  });

  it("reconhece as contas internas pelo e-mail", () => {
    expect(personByEmail("paola@financas-da-casa.invalid")).toBe("paola");
    expect(personByEmail("david@financas-da-casa.invalid")).toBe("david");
    expect(personByEmail("david@gmail.com")).toBeNull();
    expect(isInternalEmail("teste@financas-da-casa.invalid")).toBe(true);
    expect(isInternalEmail("david@gmail.com")).toBe(false);
    expect(isInternalEmail(undefined)).toBe(false);
  });

  it("senha derivada da chave secreta: estável, diferente por pessoa e por chave", async () => {
    const a = await personPassword("david", "chave-1");
    expect(await personPassword("david", "chave-1")).toBe(a);
    expect(await personPassword("paola", "chave-1")).not.toBe(a);
    expect(await personPassword("david", "chave-2")).not.toBe(a);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await personCredentials("paola", "chave-1")).toEqual({
      email: "paola@financas-da-casa.invalid",
      password: await personPassword("paola", "chave-1"),
    });
  });

  it("sem a chave secreta não inventa senha", async () => {
    await expect(personPassword("david", "")).rejects.toThrow(/chave secreta/);
  });

  it("volta só para caminhos internos", () => {
    expect(safeReturnPath("/dividas?ok=1")).toBe("/dividas?ok=1");
    expect(safeReturnPath(null)).toBe("/painel");
    expect(safeReturnPath("https://outro.site")).toBe("/painel");
    expect(safeReturnPath("//outro.site")).toBe("/painel");
    expect(safeReturnPath("/iniciar?volta=/x")).toBe("/painel");
  });
});
