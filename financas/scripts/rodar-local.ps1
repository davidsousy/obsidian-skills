# Roda o Financas da Casa no seu computador (Windows): banco local (Supabase, via Docker) + app em
# http://localhost:3000. Use o rodar-local.bat (dois cliques), que chama este arquivo.
$ErrorActionPreference = "Continue"
Set-Location (Join-Path $PSScriptRoot "..")

$supabase = @("-y", "supabase@2.122.0")
$exclude = "studio,imgproxy,storage-api,realtime,edge-runtime,logflare,vector,supavisor,postgres-meta,mailpit"
$port = 3000
$mark = "# Gerado por scripts/rodar-local"

function Fail($msg) { Write-Host ""; Write-Host "X $msg" -ForegroundColor Red; Write-Host ""; exit 1 }
function Step($msg) { Write-Host ""; Write-Host "> $msg" -ForegroundColor Cyan }

Step "Conferindo o Node.js"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "Node.js nao encontrado. Instale a versao LTS em https://nodejs.org e rode de novo." }
if ([int](node -p "process.versions.node.split('.')[0]") -lt 20) { Fail "Seu Node.js e antigo. Instale a versao LTS em https://nodejs.org." }

Step "Conferindo o Docker"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail "Docker nao encontrado. Instale o Docker Desktop (https://www.docker.com/products/docker-desktop), abra e rode de novo." }
docker info *> $null
if ($LASTEXITCODE -ne 0) { Fail "O Docker esta fechado. Abra o Docker Desktop, espere ele dizer que esta rodando e rode de novo." }

if (-not (Test-Path "node_modules")) {
  Step "Instalando as dependencias (so na primeira vez, alguns minutos)"
  npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Fail "Nao foi possivel instalar as dependencias (confira a internet)." }
}

Step "Ligando o banco de dados (na primeira vez baixa ~1 GB e demora alguns minutos)"
# se o banco ja estava ligando, o start reclama; a espera abaixo resolve
npx @supabase start -x $exclude
$envOut = $null
for ($i = 0; $i -lt 60; $i++) {
  $out = @(npx @supabase status -o env 2>$null)
  if ($LASTEXITCODE -eq 0 -and ($out | Where-Object { $_ -match '^API_URL=' })) { $envOut = $out; break }
  Start-Sleep -Seconds 2
}
if (-not $envOut) { Fail "O banco nao ligou. Confira se o Docker Desktop esta aberto e rode de novo." }
function Val($name) {
  $line = $envOut | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
  return ($line -replace "^$name=", "") -replace '"', ''
}
$api = Val "API_URL"
for ($i = 0; $i -lt 60; $i++) {
  try { Invoke-WebRequest -UseBasicParsing "$api/auth/v1/health" -TimeoutSec 5 | Out-Null; break } catch { Start-Sleep -Seconds 2 }
}

$wanted = @(
  "$mark.ps1 (banco local). Pode apagar: e recriado quando o app e aberto pelo script.",
  "NEXT_PUBLIC_SUPABASE_URL=$api",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$(Val 'PUBLISHABLE_KEY')",
  "SUPABASE_SECRET_KEY=$(Val 'SECRET_KEY')",
  "DATABASE_URL=$(Val 'DB_URL')"
)
$envFile = Join-Path (Get-Location) ".env.local"
if (-not (Test-Path $envFile) -or (Get-Content $envFile -TotalCount 1) -like "$mark*") {
  # so regrava se mudou (mudar o arquivo obriga a compilar de novo)
  $current = if (Test-Path $envFile) { (Get-Content $envFile) -join "`n" } else { "" }
  if ($current -ne ($wanted -join "`n")) { [IO.File]::WriteAllLines($envFile, $wanted) }
} else {
  Write-Host "  (usando o .env.local que ja existe)"
}

# compila so na primeira vez ou quando algum arquivo mudou
$buildId = ".next\BUILD_ID"
$stale = $true
if (Test-Path $buildId) {
  $built = (Get-Item $buildId).LastWriteTime
  $newer = Get-ChildItem -Recurse -File -Path app, components, lib, proxy.ts, package.json, .env.local -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -gt $built } | Select-Object -First 1
  $stale = [bool]$newer
}
if ($stale) {
  Step "Preparando o app (cerca de 1 minuto)"
  npm run build
  if ($LASTEXITCODE -ne 0) { Fail "A compilacao falhou. Mande um print desta janela." }
} else {
  Step "App ja compilado"
}

Step "Abrindo o app"
$ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object -First 1 -ExpandProperty IPAddress
Write-Host ""
Write-Host "Pronto! Abra http://localhost:$port" -ForegroundColor Green
if ($ip) { Write-Host "   No celular (mesmo Wi-Fi): http://${ip}:$port" }
Write-Host "   Para desligar: feche esta janela. Os dados ficam guardados no seu computador."
# abre o navegador quando o app responder
Start-Job -ArgumentList $port -ScriptBlock {
  param($p)
  for ($i = 0; $i -lt 90; $i++) {
    try { Invoke-WebRequest -UseBasicParsing "http://localhost:$p/diagnostico" -TimeoutSec 5 | Out-Null; break } catch { Start-Sleep -Seconds 1 }
  }
  Start-Process "http://localhost:$p"
} | Out-Null
npx next start -p $port
