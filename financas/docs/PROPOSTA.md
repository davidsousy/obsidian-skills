# Proposta — Sistema de Gestão Financeira e Quitação de Dívidas

> Etapa 1 de 8: schema, RLS, telas e arquitetura do motor de cálculo.
> **Nada foi implementado ainda.** Aguardando aprovação e as respostas da seção 7.

---

## 1. Conferência do seed (antes de tudo)

Somando a tabela do seed como está, o total dá **R$ 40.769**, não R$ 42.344.
A diferença é **R$ 1.575 = juros de outubro dos agiotas** (3.000 × 40% = 1.200 + 1.500 × 25% = 375).

| Grupo | Cálculo | Total |
|---|---|---:|
| Em atraso | 6.000 + 4.600 + 900 + 790 + 480 + 280 + 220 | 13.270 |
| Agiotas — principal | 3.000 + 1.500 | 4.500 |
| Agiotas — juros de outubro (vencem 30/10) | 1.200 + 375 | 1.575 |
| Cartão do sogro | 3.333 × 3 | 9.999 |
| Empréstimo do amigo | 1.250 × 4 | 5.000 |
| Distrato Gabriel / Interage | 1.500 × 3 | 4.500 |
| Parcela do carro (só a do mês) | 3.500 × 1 | 3.500 |
| **Total** | | **42.344** ✅ |

Ou seja: **saldo do agiota = principal + juros do mês ainda não pagos**. É assim que vou modelar,
salvo se você disser o contrário (pergunta 1).

Custos fixos: 4.600 + 450 + 1.500 + 1.500 + 1.100 + 360 + 300 + 220 + 180 + 129 + 129 + 110 + 100 + 99 + 80 + 49 + 25 = **R$ 10.931** ✅

---

## 2. Arquitetura

```
financas/                     ← app Next.js (subpasta deste repositório)
├─ app/                       ← App Router (rotas em pt-BR: /painel, /dividas, /custos, /renda, /plano, /simulador, /configuracoes)
├─ lib/finance/               ← MOTOR DE CÁLCULO: funções puras, sem I/O, 100% testadas (Vitest)
│   ├─ money.ts               ← dinheiro em centavos (inteiros) + formatação R$ 1.234,56
│   ├─ dates.ts               ← America/Sao_Paulo, dd/mm/aaaa, "mês de referência"
│   ├─ debts/                 ← regras por tipo (parcelada, parcelada c/ juros, agiota, conta em atraso)
│   ├─ payments.ts            ← divisão do pagamento (juros → principal; parcelas cobertas)
│   ├─ income.ts              ← médias móveis 30/90 d, ganho/hora bruto e líquido do Uber
│   ├─ avalanche.ts           ← simulação mês a mês (mínimos → reserva → excedente por prioridade)
│   ├─ plan.ts                ← renda necessária, viabilidade, horas de Uber, data viável mais próxima
│   └─ scenarios.ts           ← aplica um cenário "e se" sobre um snapshot, sem tocar no banco
├─ lib/supabase/              ← clients (server/browser), tipos gerados
├─ supabase/migrations/       ← schema + RLS + funções SQL
├─ supabase/seed.sql          ← dados de outubro/2026
└─ app/api/cron/alertas/      ← rota chamada pelo Vercel Cron → Resend
```

Princípios:
- **Dinheiro sempre em centavos (`bigint`)** no banco e no TS — nada de float. Taxas em `numeric(7,4)` (0,4000 = 40%).
- **Uma única fonte de verdade para regras de cálculo**: `lib/finance` (TypeScript). O banco guarda fatos
  (dívidas, pagamentos, juros lançados); o saldo atual é *cacheado* na dívida e recalculado pela mesma lib
  sempre que entra um pagamento. Gravações que mexem em mais de uma tabela vão por função SQL (`rpc`) numa transação.
- Plano e simulador rodam a mesma função `simulate()` — o simulador só muda a entrada.

---

## 3. Schema do banco

Convenções: toda tabela de dados tem `id uuid pk`, `household_id uuid not null`, `created_at`, `created_by uuid`.
Valores `*_cents bigint`. Datas `date` (sem hora) no fuso de São Paulo.

### 3.1 Casa e membros

**`households`** — a "casa"
| coluna | tipo | obs. |
|---|---|---|
| name | text | "Casa David & Paola" |
| target_date | date null | data-alvo sem dívidas |
| reserve_target_cents | bigint | padrão 100000 (R$ 1.000) |
| reserve_balance_cents | bigint | quanto da reserva já existe |
| tight_margin_pct | numeric | limite entre "viável" e "apertado" (padrão 10%) |
| car_cost_allocation | enum `por_hora` \| `por_dia` | rateio do custo do carro no Uber |
| invite_code | text unique | para o 2º membro entrar na casa |

**`household_members`** — PK (`household_id`, `user_id`)
| coluna | tipo | obs. |
|---|---|---|
| user_id | uuid → auth.users | |
| display_name | text | "David", "Paola" |
| email_alerts | boolean | padrão true |
| alert_days_before | smallint | padrão 3 |

"Responsável/quem gastou/quem lançou" referencia `user_id`; **`null` = casa**.

### 3.2 Dívidas

**`debts`**
| coluna | tipo | obs. |
|---|---|---|
| name, creditor | text | |
| kind | enum `parcelada_sem_juros` \| `parcelada_com_juros` \| `juros_sobre_principal` \| `conta_em_atraso` | |
| status | enum `em_dia` \| `em_atraso` \| `em_negociacao` \| `quitada` | |
| original_cents | bigint | valor original |
| balance_cents | bigint | saldo atual (cache, recalculado pela lib) |
| due_day | smallint null | dia de vencimento |
| notes | text | |
| *parceladas* installment_cents, installments_remaining, installments_known | bigint, int null, bool | `installments_known=false` → "A informar" (carro) |
| *com juros / agiota* monthly_rate | numeric(7,4) null | |
| *agiota* principal_cents | bigint null | |
| *atraso* original_due_date, late_fee_rate, late_interest_rate | date, numeric, numeric | multa e juros opcionais |
| risk_priority | boolean | "prioridade de risco" (aluguel, condomínio, luz, água) |
| priority_override | int null | ordem manual na avalanche (null = automática) |
| version | int | trava otimista (os dois editando ao mesmo tempo) |

**`debt_interest_charges`** — juros/multa lançados por mês (agiota e conta em atraso com taxa). Gerados pelo cron mensal
ou ao abrir o sistema no mês novo (idempotente por `debt_id + reference_month`).
| reference_month (date, 1º dia) | base_cents | rate | amount_cents | paid_cents |

**`debt_payments`**
| coluna | tipo | obs. |
|---|---|---|
| debt_id | uuid | |
| paid_on | date | |
| amount_cents | bigint | total pago |
| interest_cents | bigint | parte que foi juros (agiota/atraso) |
| principal_cents | bigint | parte que abateu principal/saldo |
| installments_covered | int | parcelas quitadas por esse pagamento |
| created_by | uuid | quem lançou |

Função `register_payment(...)` (SQL, `security invoker`): insere o pagamento, baixa os `debt_interest_charges`
do mês, atualiza `balance_cents`, `principal_cents`, `installments_remaining` e `status` (→ `quitada` se zerar),
tudo numa transação com checagem de `version`. A divisão juros/principal é calculada pela lib e validada no SQL.

**`debt_revisions`** — snapshot (`jsonb`) da dívida antes de cada mudança de formato (ex.: negociação aceita
transforma "conta em atraso" em "parcelada"). Mantém o histórico sem duplicar a dívida.

### 3.3 Negociações

**`negotiations`** — uma por rodada de negociação de uma dívida: `debt_id`, `status` (`aberta`/`aceita`/`recusada`), `opened_on`, `closed_on`.

**`negotiation_entries`** — linha do tempo: `occurred_on`, `kind` (`contato` \| `proposta_feita` \| `proposta_recebida`),
`amount_cents`, `conditions` (texto), `status` (`aberta`/`aceita`/`recusada`), `created_by`.

Aceitar uma proposta chama `accept_proposal(entry_id, novo_formato jsonb)`: grava `debt_revisions`, converte a dívida
(novo `kind`, parcela, parcelas, taxa), fecha a negociação e muda o status da dívida para `em_dia`.

### 3.4 Custos e gastos

**`fixed_costs`**: `name`, `amount_cents`, `due_day` null, `category` enum (`moradia`, `alimentacao`, `carro`, `assinaturas`, `saude`, `pessoal`, `lazer`),
`owner_user_id` null (= casa), `is_approximate`, `active`, `starts_on`, `ends_on` null.

**`variable_expenses`**: `spent_on`, `amount_cents`, `category` (mesmo enum + `outros`), `description`, `spent_by` (user_id).

View `v_variable_monthly` → total por mês × categoria (base do comparativo com a média dos últimos 3 meses).

### 3.5 Renda

**`uber_days`**: `worked_on` (unique por casa+dia), `gross_cents`, `hours numeric(5,2)`, `created_by`.

**`income_entries`** (Paola e outras): `received_on`, `amount_cents`, `source` enum (`salario` \| `outros`), `description`, `earner_user_id`.

View `v_income_daily` (une as duas fontes) → base para médias móveis de 30/90 dias por fonte e total.

### 3.6 Plano, simulador e alertas

- O **plano não é gravado**: é calculado na hora a partir do estado atual (dívidas + custos + médias de renda + configurações).
  Só a data-alvo, a reserva e a ordem de prioridade ficam salvas.
- **`scenarios`** (opcional): `name`, `params jsonb` — salva um cenário do simulador para comparar depois. Nunca altera dados reais.
- **`alert_log`**: `user_id`, `source_type` (`debt`/`fixed_cost`), `source_id`, `due_date`, `sent_at` — unique em
  (`user_id`, `source_type`, `source_id`, `due_date`) para não mandar o mesmo e-mail duas vezes.

### 3.7 RLS

```sql
create function is_household_member(h uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members
                 where household_id = h and user_id = auth.uid());
$$;

-- em TODAS as tabelas de dados (debts, debt_payments, fixed_costs, uber_days, ...):
alter table debts enable row level security;
create policy "membros leem"      on debts for select using (is_household_member(household_id));
create policy "membros inserem"   on debts for insert with check (is_household_member(household_id));
create policy "membros alteram"   on debts for update using (is_household_member(household_id))
                                                  with check (is_household_member(household_id));
create policy "membros apagam"    on debts for delete using (is_household_member(household_id));
```

- `households`: select/update só para membros; insert por qualquer usuário autenticado (vira membro via função `create_household`).
- `household_members`: select para membros da mesma casa; entrada só via `join_household(invite_code)` (security definer).
- `created_by` / `spent_by` preenchidos por default `auth.uid()` (não confiamos no cliente).
- O cron de e-mail usa a *service role* só no servidor (rota protegida por `CRON_SECRET`).
- Teste automatizado de RLS: um terceiro usuário fora da casa não lê nem grava nada.

---

## 4. Motor de cálculo (como vou implementar as regras)

**Agiota (juros sobre principal)** — todo mês, no vencimento: `juros = principal × taxa`. Pagamento abate primeiro
os juros em aberto, o excedente reduz o principal. Exibe juros pagos por mês e acumulado.
Ex. seed: Agiota 1 paga R$ 2.000 em 30/10 → 1.200 de juros, 800 de principal → novembro: juros de 2.200 × 40% = 880.

**Avalanche (`simulate`)** — loop mês a mês até zerar ou até 120 meses:
1. Renda do mês − custos fixos − média de gastos variáveis = disponível.
2. Paga mínimos: parcelas do mês, juros do mês dos agiotas.
3. Completa a reserva até a meta.
4. Excedente segue a ordem de prioridade:
   **agiotas por taxa (40% → 25%) → prioridade de risco → contas em atraso com multa → demais (sem juros)**.
   `priority_override` (ordem manual) prevalece sobre tudo.
5. Saída: mês a mês (quanto foi para cada dívida), data de quitação de cada dívida, total de juros pagos.

**Renda necessária** — busca binária pelo menor valor mensal *constante* de renda em que `simulate()` zera todas as
dívidas até a data-alvo. Mostrado decomposto em: custos fixos + média variáveis + parcelas + juros projetados +
extra para quitar + reserva. Como a simulação já reabate o principal, os juros dos agiotas caem sozinhos.

**Viabilidade** — compara com a renda média real dos últimos 90 dias:
`folga ≥ 10%` → viável · `0 a 10%` → apertado · `< 0` → inviável; mostra a diferença em R$/mês.

**Horas de Uber** — `diferença ÷ ganho líquido por hora` → horas/mês e horas/dia (dias trabalhados por mês = média real).

**Data viável mais próxima** — roda `simulate()` com a renda média real e devolve o mês em que tudo zera.

Testes (Vitest) para cada item acima, incluindo os números do seed como casos fixos.

---

## 5. Telas

| # | Rota | Conteúdo |
|---|---|---|
| 0 | `/entrar`, `/criar-casa`, `/entrar-na-casa` | login e-mail/senha, criar casa, entrar com código de convite |
| 1 | `/painel` | total de dívidas · total em atraso · juros pagos no mês · renda do mês × necessária · próximos vencimentos (7 dias) · barra de progresso até a data-alvo · card **"Quanto preciso ganhar"** · alertas (atraso, juros > pago) |
| 2 | `/dividas` | lista agrupada (**Em atraso** · **Agiotas** · **Parceladas** · Quitadas, recolhido) com saldo grande e cor de status; botão "Registrar pagamento" em cada linha |
| 2a | `/dividas/[id]` | detalhe: dados, gráfico de saldo, histórico de pagamentos (com quem lançou), juros pagos por mês, aba **Negociações** (linha do tempo + aceitar proposta) |
| 3 | `/custos` | abas **Fixos** (lista por categoria, total, "aprox." marcado) e **Variáveis** (lançamento rápido em 1 linha, total do mês por categoria × média dos últimos 3 meses) |
| 4 | `/renda` | lançamento diário do Uber (data, bruto, horas) e da Paola; médias 30/90 d por fonte e total; gráfico de ganho/hora bruto × líquido |
| 5 | `/plano` | escolha da data-alvo · selo viável/apertado/inviável · diferença R$/mês · horas extras de Uber · data viável mais próxima · ordem de quitação (arrastar para reordenar) · calendário mês a mês |
| 6 | `/simulador` | controles (renda +R$, horas +, cortar custo fixo, quitar dívida agora, negociação com desconto) · plano atual × cenário lado a lado (data, juros economizados, renda necessária) |
| 7 | `/configuracoes` | reserva (meta e saldo), limite de "apertado", rateio do carro, alertas por usuário, membros e código de convite |

Visual: Tailwind, fundo claro, números grandes (`tabular-nums`), cores de status
**vermelho** = em atraso · **laranja** = juros altos (agiota) · **amarelo** = parcelado · **verde** = quitado.
Desktop-first com sidebar; em telas menores a sidebar vira menu e as tabelas viram cartões.

---

## 6. Ordem de implementação (cada etapa termina com testes + conferência do seed)

1. Auth + casa (criar/entrar, RLS)
2. Dívidas + pagamentos (seed bate R$ 42.344)
3. Custos (seed bate R$ 10.931)
4. Renda
5. Plano / data-alvo
6. Simulador
7. Negociações
8. Alertas (tela + e-mail via Resend + Vercel Cron)

---

## 7. Perguntas — regras de cálculo (preciso da sua decisão)

Entre parênteses, o que farei se você aprovar sem mudar.

1. **Saldo do agiota inclui os juros do mês em aberto?** É o que faz o total bater R$ 42.344. (Sim.)
2. **Juros do agiota não pagos no mês**: acumulam sem gerar juros sobre juros, ou são somados ao principal? (Acumulam à parte, sem capitalizar.)
   E um abatimento de principal no meio do mês só reduz os juros do mês seguinte? (Sim — juros calculados sobre o principal no dia do vencimento.)
3. **Conta em atraso com taxa**: multa única (%) + juros simples mensais sobre o valor original? (Sim. No seed nenhuma tem taxa, então os saldos ficam fixos.)
4. **Parcelada com juros**: saldo = parcela × restantes ou valor presente (quanto custaria quitar hoje)? (Mostro os dois; o plano usa parcela × restantes.)
5. **Parcela do carro sem saldo informado**: no plano, trato como R$ 3.500/mês obrigatórios até a data-alvo (não quitável antecipadamente), com aviso "informe o saldo"? (Sim.)
6. **Renda necessária**: valor mensal constante (igual todo mês) calculado pela simulação, com a reserva montada logo no início? (Sim.)
7. **Faixas de viabilidade**: viável com folga ≥ 10%, apertado entre 0 e 10%, inviável abaixo de 0? (Sim, editável nas configurações.)
8. **Uber**: o "valor bruto" é o que o app repassa (já sem a taxa da Uber)? Custo do carro por hora = (recarga + limpeza do mês) ÷ horas rodadas nos últimos 30 dias? A parcela do carro fica fora desse custo (ela já é dívida)? (Sim para as três.)
9. **Desempate na avalanche**: dentro da prioridade de risco, ordem aluguel → condomínio → luz → água; entre dívidas sem juros, menor saldo primeiro? (Sim.)
10. **Dívidas "em negociação"** (aluguel antigo, Vivo) entram no plano pelo valor cheio até a proposta ser aceita? (Sim.)
11. **Custos fixos x atrasados**: o aluguel de R$ 4.600 dos custos fixos vale a partir de novembro (o de outubro é a dívida em atraso)? Mesmo raciocínio para condomínio, água, luz e terapia. (Sim.)
12. **Gastos variáveis sem histórico**: no começo não há média. Uso uma estimativa que você informa (quanto?) até haver 1 mês de lançamentos? (Sim — preciso do valor; senão uso R$ 0 com aviso.)
13. **Renda sem histórico**: a renda média real de 90 dias começa vazia. Você quer lançar o histórico recente do Uber e da Paola, ou informar uma média inicial? (Média inicial informada nas configurações até haver 30 dias de dados.)

## 8. Perguntas — infraestrutura

- **Onde fica o código?** Este repositório é um fork de `obsidian-skills`. Proponho a subpasta `financas/` na branch atual;
  se preferir um repositório próprio, crie-o e eu adiciono à sessão.
- **Supabase/Vercel/Resend**: você já tem projetos/contas? Para rodar local uso o Supabase CLI (Docker). Para e-mail, o Resend
  precisa de um domínio verificado — você tem um? (Se não, uso o remetente de teste `onboarding@resend.dev`, que só envia para o e-mail da conta.)
- **Internet Vivo (em atraso) e "Internet da Paola 110" (custo fixo)** são contratos diferentes? (Vou assumir que sim.)
