@echo off
cd /d "C:\Users\tofm4\OneDrive\Business\Pay Software\Application\gemini_idx_json"
start python -m http.server 8000
timeout /t 2 /nobreak >nul
start http://localhost:8000/PayTrax.html


