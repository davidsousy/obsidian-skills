# Finanças da Casa

Gestão financeira pessoal do David e da Paola, com foco em quitar as dívidas até uma data-alvo.
Next.js (App Router) + TypeScript + Tailwind + Supabase (Postgres, Auth, RLS) + Recharts + Resend.
A proposta aprovada está em [`docs/PROPOSTA.md`](docs/PROPOSTA.md).

## Telas

Menu principal (como no documento "Finanças David"): **Painel · Em atraso · Agiotas · Parceladas · Custos fixos ·
Resumo do mês**, com a meta **zerar atrasos e agiotas** (quanto falta e % do principal pago) no menu lateral.
Em "Mais": Calendário de vencimentos, Renda, Plano, Simulador e Configurações.

- **Painel:** total de dívidas, em atraso, agiotas e custos fixos (cada card ↗ abre a tela); custos por categoria
  (essencial × dá para cortar: moradia, alimentação, carro e saúde são essenciais); próximo vencimento; vencimentos
  dos próximos 30 dias; dívidas em atraso com o total; progresso das dívidas (% já pago, sem o carro: pago /
  parcelado / atrasos e agiotas); juros dos agiotas. Clique em qualquer conta para pagar ou editar.
- **Composição da dívida total** (`/composicao`): rosca por tipo e todas as dívidas (antes era a tela Dívidas).
- **Calendário de vencimentos** e **Resumo do mês** (renda, custos fixos, gastos variáveis, dívidas pagas, sobra ou
  falta, renda necessária do Plano, parcelas e juros do mês, pagamentos lançados) navegam por mês (`?mes=aaaa-mm`).
- Vencimentos em até 7 dias ficam destacados; "+ Nova dívida" em Em atraso, Agiotas e Parceladas já abre com o tipo
  certo; enquanto uma tela carrega aparece "Carregando…".

## Módulos

- [x] 1. Casa + acesso (sem tela de login por enquanto: o app entra sozinho como David ou Paola; RLS por casa)
- [x] 2. Dívidas + pagamentos (seed de outubro/2026: R$ 42.344,00)
- [x] 3. Custos fixos e variáveis (seed: R$ 10.931,00 por mês)
- [x] 4. Renda (Uber diário com ganho por hora bruto e líquido, entradas da Paola, médias 30/90 dias)
- [x] 5. Plano / data-alvo (renda necessária por fases, viabilidade, horas de Uber, data viável, avalanche, calendário)
- [x] 6. Simulador (renda extra, horas de Uber, cortar custos, quitar agora, negociação com desconto)
- [x] 7. Negociações (contatos e propostas; aceitar converte a dívida mantendo o histórico)
- [x] 8. Alertas (na tela: vencimentos em 7 dias, atrasos, juros > pago; e-mail N dias antes via Resend)

## Rodar localmente

**Para usar no seu computador (sem programar):** siga [`COMO-RODAR-NO-COMPUTADOR.md`](COMO-RODAR-NO-COMPUTADOR.md) —
dois cliques em `rodar-local.bat` (Windows) ou `rodar-local.command` (Mac). O script confere Node e Docker, liga o
Supabase local, gera o `.env.local`, compila (só quando algo mudou) e abre http://localhost:3000; mostra também o
endereço para abrir no celular na mesma rede. `parar-local` desliga o banco sem apagar os dados.

Para desenvolver — pré-requisitos: Node 22 e Docker.

```bash
npm install
npm run db:start          # sobe o Supabase local (via npx supabase@2.122.0) e aplica as migrações
cp .env.example .env.local
# preencha NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY e SUPABASE_SECRET_KEY com as chaves mostradas pelo db:start
npm run dev               # http://localhost:3000
```

Primeiro acesso: abra o app. Ele cria sozinho as contas internas de David e Paola, a casa e os dados combinados
de outubro/2026 (dívidas e custos fixos), com uma data-alvo inicial que dá para mudar no Plano.

## Sem login (modo atual)

- Não há tela de login: o app entra sozinho e o seletor **Usando como: David | Paola** (barra lateral) define
  quem aparece como responsável pelos lançamentos. A escolha fica salva no navegador.
- Por baixo, David e Paola são duas contas do Supabase Auth com e-mails `@financas-da-casa.invalid` (que não
  recebem nada) e senhas derivadas da chave secreta do Supabase, que só existe no servidor. Assim o RLS e o
  "lançado por" continuam funcionando.
- Se o banco já tinha uma casa (criada pelo login antigo), as contas internas entram nela; nada é duplicado.
- **Atenção:** sem login, qualquer pessoa com o link do app vê e altera os dados. Não divulgue o link.
- `/diagnostico` mostra o que está configurado (variáveis, tabelas, contas, casa, região) e o erro do primeiro
  acesso, se houver.

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
   Se o botão der erro na Vercel, use este link sem o Supabase e adicione o banco depois pelo *Storage*:
   [link reserva](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdavidsousy%2Fobsidian-skills%2Ftree%2Fapp-financas%2Ffinancas&project-name=financas-da-casa&repository-name=financas-da-casa).
3. Quando o deploy terminar, abra o Supabase (Vercel → Storage → Supabase → *Open in Supabase*) → **SQL Editor**,
   cole o conteúdo de [`supabase/setup.sql`](supabase/setup.sql) e clique em *Run* (pode rodar de novo sem problema).
   **Ou**, no Supabase: *Project Settings → Integrations → GitHub* → conecte o repositório `financas-da-casa`
   (diretório do Supabase `.`, branch de produção `main`, *Deploy to production* ligado). A cada push no `main` o
   Supabase aplica sozinho as migrações de `supabase/migrations` (todas podem rodar de novo sem erro).
   O `/diagnostico` mostra qual projeto do Supabase o app usa: precisa ser o mesmo conectado ao GitHub.
4. Pronto: abra a URL. O app já abre no Painel. Se algo faltar, `/diagnostico` diz o quê.

### Jeito manual

1. **Supabase** — crie um projeto em supabase.com (região São Paulo) e rode `supabase/setup.sql` no SQL Editor
   (ou `npx supabase@2.122.0 link --project-ref <ref> && npx supabase@2.122.0 db push`).
2. **Vercel** — importe o repositório com *Root Directory* `financas` e configure as variáveis abaixo.
3. **Resend** (opcional, e-mails) — verifique um domínio e gere uma API key. Sem domínio verificado, o Resend
   só entrega para o e-mail dono da conta.

| Variável | Onde pegar |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API (a integração da Vercel já cria) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ou `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API Keys (a integração já cria a *anon*) |
| `SUPABASE_SECRET_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API Keys — só servidor (a integração já cria a *service_role*); obrigatória no modo sem login |
| `CRON_SECRET` | qualquer texto longo e aleatório (e-mails de alerta) |
| `RESEND_API_KEY` | Resend → API Keys |
| `ALERT_FROM_EMAIL` | ex.: `Finanças da Casa <alertas@seudominio.com.br>` |
| `APP_URL` | URL pública do app na Vercel |
| `ALERT_EMAILS` | e-mails que recebem os alertas, separados por vírgula (ex.: `voce@gmail.com,paola@gmail.com`) |

O cron diário está em `vercel.json` (11:00 UTC = 08:00 em São Paulo) e chama `/api/cron/alertas`
com `Authorization: Bearer $CRON_SECRET`. Sem `RESEND_API_KEY` a rota só simula e devolve o que enviaria.
No modo sem login, os alertas vão para `ALERT_EMAILS`, com a antecedência e o liga/desliga das Configurações.
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
| `lib/finance/` | motor de cálculo: funções puras e testadas (dívidas, custos, renda, plano, simulador, alertas, painel) |
| `lib/*-data.ts` | leitura do banco e conversão para os tipos do motor |
| `supabase/migrations/` | schema, RLS e funções SQL |
| `tests/db/` | testes de RLS e funções SQL (um usuário de fora da casa não lê nem grava nada) |
| `app/(app)/` | telas internas (o proxy entra sozinho como David ou Paola; `/iniciar` prepara contas e casa) |
| `lib/auto-auth.ts`, `lib/bootstrap.ts` | modo sem login: contas internas e primeiro acesso |
| `app/api/cron/alertas/` | job diário de e-mails |
