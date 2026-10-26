#!/usr/bin/env bash
# Desliga o banco local (Supabase no Docker). Os dados continuam guardados para a próxima vez.
cd "$(dirname "$0")/.."
npx -y supabase@2.122.0 stop
echo
echo "✅ Banco desligado. Os dados continuam guardados; para abrir de novo, use rodar-local."
if [ -t 0 ]; then read -r -p "Aperte Enter para fechar..." _; fi
