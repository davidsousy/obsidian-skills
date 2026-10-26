@echo off
rem Dois cliques: liga o banco local e abre o app em http://localhost:3000
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\rodar-local.ps1"
pause
