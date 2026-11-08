@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo [1/3] 최신 실거래·부동산원 자료를 받아 index.html 을 만듭니다...
python tools\build_index.py --with-data --out index.html
if errorlevel 1 goto fail
echo [2/3] 키가 포함되지 않았는지 확인합니다...
python -c "import json,sys;k=json.load(open('config.json',encoding='utf-8'));h=open('index.html',encoding='utf-8').read();sys.exit(1 if (k['DATA_GO_KR_KEY'] in h or k['REB_KEY'] in h) else 0)"
if errorlevel 1 goto fail
echo [3/3] GitHub에 올립니다...
git add index.html
git commit -m "자료 갱신 %date%"
git push
echo 완료! 1~2분 뒤 https://koocksun-droid.github.io/gangseo-dashboard/ 에 반영됩니다.
goto end
:fail
echo 실패했습니다. 위 메시지를 확인해 주세요.
:end
if "%1"=="" pause
