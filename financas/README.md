# Finanças da Casa

Gestão financeira pessoal do David e da Paola, com foco em quitar as dívidas até uma data-alvo.
Next.js (App Router) + TypeScript + Tailwind + Supabase. A proposta aprovada está em [`docs/PROPOSTA.md`](docs/PROPOSTA.md).

## Rodar localmente

Pré-requisitos: Node 22 e Docker.

```bash
npm install
npm run db:start          # sobe o Supabase local e aplica as migrações
cp .env.example .env.local
# cole em NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY a "Publishable key" mostrada pelo `db:start`
npm run dev               # http://localhost:3000
```

Na primeira vez: crie a conta, crie a casa e mande o **código de convite** (em Configurações) para o outro membro.

## Testes

```bash
npm test          # cálculos (lib/finance) — não precisa de banco
npm run test:db   # RLS e funções SQL contra o Supabase local
npm run typecheck
npm run lint
```

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `lib/finance/` | motor de cálculo: funções puras, dinheiro em centavos, datas no fuso de São Paulo |
| `lib/supabase/` | clients do Supabase (servidor e proxy de sessão) |
| `supabase/migrations/` | schema, RLS e funções SQL |
| `tests/db/` | testes de RLS (um usuário de fora da casa não lê nem grava nada) |
| `app/(app)/` | telas internas (exigem login e casa) |

## Etapas

- [x] 1. Login + casa (criar, entrar por convite, configurações, RLS)
- [x] 2. Dívidas + pagamentos (seed de outubro/2026: R$ 42.344,00)
- [x] 3. Custos (seed: R$ 10.931,00 por mês)
- [ ] 4. Renda
- [ ] 5. Plano / data-alvo
- [ ] 6. Simulador
- [ ] 7. Negociações
- [ ] 8. Alertas
