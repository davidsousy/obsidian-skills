# Finanças da Casa

Gestão financeira pessoal do David e da Paola, com foco em quitar as dívidas até uma data-alvo.
Next.js (App Router) + TypeScript + Tailwind + Supabase (Postgres, Auth, RLS) + Recharts + Resend.
A proposta aprovada está em [`docs/PROPOSTA.md`](docs/PROPOSTA.md).

## Módulos

- [x] 1. Login + casa (criar, entrar por convite, configurações, RLS)
- [x] 2. Dívidas + pagamentos (seed de outubro/2026: R$ 42.344,00)
- [x] 3. Custos fixos e variáveis (seed: R$ 10.931,00 por mês)
- [x] 4. Renda (Uber diário com ganho por hora bruto e líquido, entradas da Paola, médias 30/90 dias)
- [x] 5. Plano / data-alvo (renda necessária por fases, viabilidade, horas de Uber, data viável, avalanche, calendário)
- [x] 6. Simulador (renda extra, horas de Uber, cortar custos, quitar agora, negociação com desconto)
- [x] 7. Negociações (contatos e propostas; aceitar converte a dívida mantendo o histórico)
- [x] 8. Alertas (na tela: vencimentos em 7 dias, atrasos, juros > pago; e-mail N dias antes via Resend)

## Rodar localmente

Pré-requisitos: Node 22 e Docker.

```bash
npm install
npm run db:start          # sobe o Supabase local (via npx supabase@2.122.0) e aplica as migrações
cp .env.example .env.local
# preencha NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY e SUPABASE_SECRET_KEY com as chaves mostradas pelo db:start
npm run dev               # http://localhost:3000
```

Primeiro acesso: crie a conta, crie a casa e mande o **código de convite** (Configurações) para o outro membro.
Em Dívidas e em Custos há botões para carregar os dados combinados de outubro/2026.

## Testes

```bash
npm test          # cálculos (lib/finance): juros do agiota, avalanche, renda necessária, viabilidade, horas de Uber…
npm run test:db   # RLS, funções SQL e job de alertas contra o Supabase local
npm run typecheck
npm run lint
```

## Publicar (Supabase + Vercel + Resend)

### Jeito rápido (um link)

[![Deploy com Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdavidsousy%2Fobsidian-skills%2Ftree%2Fapp-financas%2Ffinancas&project-name=financas-da-casa&repository-name=financas-da-casa&products=%5B%7B%22type%22%3A%22integration%22%2C%22protocol%22%3A%22storage%22%2C%22productSlug%22%3A%22supabase%22%2C%22integrationSlug%22%3A%22supabase%22%7D%5D)

1. Clique no botão, entre na Vercel e confirme. Ele cria um repositório só com o app (`financas-da-casa`) e o projeto na Vercel.
2. No mesmo fluxo, aceite criar o **Supabase** (região São Paulo, plano Free). As variáveis do banco são preenchidas sozinhas.
   Se essa etapa não aparecer: depois do deploy, vá em *Storage → Create Database → Supabase* e faça *Redeploy*.
3. Quando o deploy terminar, abra o Supabase (Vercel → Storage → Supabase → *Open in Supabase*):
   - **SQL Editor:** cole o conteúdo de [`supabase/setup.sql`](supabase/setup.sql) e clique em *Run* (uma vez só);
   - **Authentication → Sign In / Providers → Email:** desligue **Confirm email**. O envio de e-mail gratuito do
     Supabase só entrega para a equipe do projeto (2 por hora), então sem isso a Paola não consegue criar a conta.
     Os dados continuam protegidos: só entra na casa quem tem o código de convite;
   - **Authentication → URL Configuration:** coloque a URL do app (`https://….vercel.app`) em *Site URL*.
4. Pronto: abra a URL, crie a conta e crie a casa. Mande o código de convite (Configurações) para a outra pessoa.

### Jeito manual

1. **Supabase** — crie um projeto em supabase.com (região São Paulo) e rode `supabase/setup.sql` no SQL Editor
   (ou `npx supabase@2.122.0 link --project-ref <ref> && npx supabase@2.122.0 db push`). Em *Authentication →
   URL Configuration*, coloque a URL da Vercel em *Site URL*, e desligue *Confirm email* (ou configure um SMTP próprio).
2. **Vercel** — importe o repositório com *Root Directory* `financas` e configure as variáveis abaixo.
3. **Resend** (opcional, e-mails) — verifique um domínio e gere uma API key. Sem domínio verificado, o Resend
   só entrega para o e-mail dono da conta.

| Variável | Onde pegar |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API (a integração da Vercel já cria) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ou `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API Keys (a integração já cria a *anon*) |
| `SUPABASE_SECRET_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API Keys — só servidor (a integração já cria a *service_role*) |
| `CRON_SECRET` | qualquer texto longo e aleatório (e-mails de alerta) |
| `RESEND_API_KEY` | Resend → API Keys |
| `ALERT_FROM_EMAIL` | ex.: `Finanças da Casa <alertas@seudominio.com.br>` |
| `APP_URL` | URL pública do app na Vercel |

O cron diário está em `vercel.json` (11:00 UTC = 08:00 em São Paulo) e chama `/api/cron/alertas`
com `Authorization: Bearer $CRON_SECRET`. Sem `RESEND_API_KEY` a rota só simula e devolve o que enviaria.
Variáveis `NEXT_PUBLIC_*` só valem depois de um novo deploy (*Deployments → Redeploy*).

## Regras de cálculo (resumo)

- **Dinheiro em centavos** e datas no fuso de São Paulo.
- **Agiota:** juros do mês = principal × taxa, lançados uma vez por mês (sem juros sobre juros); pagamento abate
  primeiro os juros em aberto e o excedente reduz o principal. O saldo inclui os juros do mês ainda não pagos.
- **Conta em atraso com taxa:** multa única + juros simples ao mês sobre o valor original.
- **Parceladas:** cada pagamento abate o saldo; parcelas restantes = saldo ÷ parcela (arredondado para cima).
  Sem nº de parcelas informado (carro), conta só a parcela do mês e ela é obrigatória todo mês no plano.
- **Plano:** começa no mês seguinte. Em cada mês paga os mínimos (fixos, variáveis, parcelas, juros dos agiotas),
  completa a reserva e manda o excedente pela ordem avalanche (agiotas por taxa → prioridade de risco
  aluguel/condomínio/luz/água → com juros/multa → sem juros pelo menor saldo), ou pela ordem manual.
- **Renda necessária:** em cada mês, o maior entre o mínimo do mês e a renda-base (a menor que quita tudo até a
  data-alvo). Viabilidade compara a renda média real com o mês mais pesado: viável com folga ≥ margem
  (padrão 10%), apertado entre 0 e a margem, inviável abaixo.
- **Renda média real:** 90 dias; com 30+ dias de histórico usa o período coberto; antes disso, a estimativa das
  Configurações. Gastos variáveis: média dos últimos meses completos (até 3), ou a estimativa.
- **Uber:** líquido/h = bruto/h − custo do carro (categoria *carro*: recarga + limpeza) rateado pelas horas
  (ou dias) rodados por mês nos últimos 30 dias.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `lib/finance/` | motor de cálculo: funções puras e testadas (dívidas, custos, renda, plano, simulador, alertas) |
| `lib/*-data.ts` | leitura do banco e conversão para os tipos do motor |
| `supabase/migrations/` | schema, RLS e funções SQL |
| `tests/db/` | testes de RLS e funções SQL (um usuário de fora da casa não lê nem grava nada) |
| `app/(app)/` | telas internas (exigem login e casa) |
| `app/api/cron/alertas/` | job diário de e-mails |
