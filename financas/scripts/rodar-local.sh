#!/usr/bin/env bash
# Roda o Finanças da Casa no seu computador (Mac ou Linux): banco local (Supabase, via Docker) + app em
# http://localhost:3000. No Mac dá para dar dois cliques em rodar-local.command; no terminal: bash scripts/rodar-local.sh
set -uo pipefail
cd "$(dirname "$0")/.."

SUPABASE=(npx -y supabase@2.122.0)
EXCLUDE="studio,imgproxy,storage-api,realtime,edge-runtime,logflare,vector,supavisor,postgres-meta,mailpit"
PORT="${PORT:-3000}"
MARK="# Gerado por scripts/rodar-local"

pause() { if [ -t 0 ]; then read -r -p "Aperte Enter para fechar..." _; fi; }
fail() { echo; echo "❌ $1"; echo; pause; exit 1; }
step() { echo; echo "▶ $1"; }

step "Conferindo o Node.js"
command -v node >/dev/null 2>&1 || fail "Node.js não encontrado. Instale a versão LTS em https://nodejs.org e rode de novo."
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || fail "Node.js $(node -v) é antigo. Instale a versão LTS em https://nodejs.org."

step "Conferindo o Docker"
command -v docker >/dev/null 2>&1 || fail "Docker não encontrado. Instale o Docker Desktop (https://www.docker.com/products/docker-desktop), abra e rode de novo."
docker info >/dev/null 2>&1 || fail "O Docker está fechado. Abra o Docker Desktop, espere ele dizer que está rodando e rode de novo."

if [ ! -d node_modules ]; then
  step "Instalando as dependências (só na primeira vez, alguns minutos)"
  npm install --no-audit --no-fund || fail "Não foi possível instalar as dependências (confira a internet)."
fi

step "Ligando o banco de dados (na primeira vez baixa ~1 GB e demora alguns minutos)"
# se o banco já estava ligando, o start reclama; a espera abaixo resolve
"${SUPABASE[@]}" start -x "$EXCLUDE" || true
env_out=""
for _ in $(seq 1 60); do
  out=$("${SUPABASE[@]}" status -o env 2>/dev/null) || out=""
  if grep -q '^API_URL=' <<<"$out"; then env_out=$out; break; fi
  sleep 2
done
[ -n "$env_out" ] || fail "O banco não ligou. Confira se o Docker Desktop está aberto e rode de novo."
val() { grep "^$1=" <<<"$env_out" | head -1 | cut -d= -f2- | tr -d '"'; }
api=$(val API_URL)
for _ in $(seq 1 60); do curl -fs -o /dev/null "$api/auth/v1/health" && break; sleep 2; done

wanted="$MARK (banco local). Pode apagar: é recriado quando o app é aberto pelo script.
NEXT_PUBLIC_SUPABASE_URL=$api
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$(val PUBLISHABLE_KEY)
SUPABASE_SECRET_KEY=$(val SECRET_KEY)
DATABASE_URL=$(val DB_URL)"
if [ ! -f .env.local ] || grep -q "^$MARK" .env.local; then
  # só regrava se mudou (mudar o arquivo obriga a compilar de novo)
  [ "$(cat .env.local 2>/dev/null)" = "$wanted" ] || printf '%s\n' "$wanted" > .env.local
else
  echo "  (usando o .env.local que já existe)"
fi

# compila só na primeira vez ou quando algum arquivo mudou
if [ -f .next/BUILD_ID ] && [ -z "$(find app components lib proxy.ts package.json .env.local -newer .next/BUILD_ID -print -quit 2>/dev/null)" ]; then
  step "App já compilado"
else
  step "Preparando o app (cerca de 1 minuto)"
  npm run build || fail "A compilação falhou. Mande um print desta janela."
fi

step "Abrindo o app"
npx next start -p "$PORT" &
server=$!
trap 'kill "$server" 2>/dev/null' EXIT INT TERM
for _ in $(seq 1 60); do
  kill -0 "$server" 2>/dev/null || fail "O app não abriu. Se a porta $PORT estiver ocupada, feche o outro programa ou rode: PORT=3001 bash scripts/rodar-local.sh"
  curl -fs -o /dev/null "http://localhost:$PORT/configurar" && break
  sleep 1
done

ip=$( (ipconfig getifaddr en0 || ipconfig getifaddr en1 || hostname -I 2>/dev/null | awk '{print $1}') 2>/dev/null | head -1)
echo
echo "✅ Pronto! Abra http://localhost:$PORT"
[ -n "$ip" ] && echo "   No celular (mesmo Wi-Fi): http://$ip:$PORT"
echo "   Para desligar: feche esta janela (ou Ctrl+C). Os dados ficam guardados no seu computador."
if command -v open >/dev/null 2>&1; then open "http://localhost:$PORT"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "http://localhost:$PORT" >/dev/null 2>&1 || true; fi
wait "$server"
