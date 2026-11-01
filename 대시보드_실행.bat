@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo GO부동산 강서구 대시보드를 시작합니다...
start "" http://localhost:8765
python server.py
pause
