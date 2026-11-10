@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo ===== %date% %time% =====
echo [0/3] GitHub 최신 내용을 받습니다...
git pull --rebase -q
echo [1/3] 최신 실거래·부동산원 자료를 받아 index.html 을 만듭니다...
python tools\build_index.py --with-data --out index.html
if errorlevel 1 goto fail
echo [2/3] 키가 포함되지 않았는지 확인합니다...
python -c "import json,sys;k=json.load(open('config.json',encoding='utf-8'));h=open('index.html',encoding='utf-8').read();sys.exit(1 if (k['DATA_GO_KR_KEY'] in h or k['REB_KEY'] in h) else 0)"
if errorlevel 1 goto fail
echo [3/3] GitHub에 올립니다...
git add index.html
git diff --cached --quiet && (echo 변경된 자료가 없어 업로드를 건너뜁니다.) && goto end
git commit -q -m "자료 갱신 %date%"
git push -q
if errorlevel 1 goto fail
echo 완료! 1~2분 뒤 https://koocksun-droid.github.io/gangseo-dashboard/ 에 반영됩니다.
goto end
:fail
echo 실패했습니다. 위 메시지를 확인해 주세요.
git checkout -- index.html 2> nul
:end
if "%1"=="" pause
