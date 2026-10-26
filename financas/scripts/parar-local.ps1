# Desliga o banco local (Supabase no Docker). Os dados continuam guardados para a proxima vez.
Set-Location (Join-Path $PSScriptRoot "..")
npx -y supabase@2.122.0 stop
Write-Host ""
Write-Host "Banco desligado. Os dados continuam guardados; para abrir de novo, use o rodar-local.bat." -ForegroundColor Green
