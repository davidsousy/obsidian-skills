@echo off
rem Dois cliques: desliga o banco local (os dados continuam guardados)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\parar-local.ps1"
pause
