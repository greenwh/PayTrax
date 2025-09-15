@echo off
cd /d "C:\Users\tofm4\OneDrive\Development\Pay Software\Application\PayTrax_v1"
start python -m http.server 8000
timeout /t 2 /nobreak >nul
start http://localhost:8000/index.html


