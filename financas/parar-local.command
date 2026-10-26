#!/usr/bin/env bash
# Mac: dois cliques desliga o banco local (os dados continuam guardados)
exec bash "$(dirname "$0")/scripts/parar-local.sh"
