@echo off
REM Auto-detect current directory (works with any username)
cd /d "%~dp0"
start python -m http.server 8000
timeout /t 2 /nobreak >nul
start http://localhost:8000/index.html


