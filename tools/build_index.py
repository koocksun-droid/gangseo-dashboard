"""단일 파일 index.html 생성 (서버 없이 더블클릭으로 실행).
- CSS/JS/로고/지도경계/시설 데이터를 모두 인라인
- 한국부동산원 지표는 브라우저 직접 호출(CORS)이 막혀 있어 빌드 시점 스냅샷으로 포함
- 국토부 실거래는 페이지에서 공공데이터포털을 직접 호출 (항상 최신)
usage: python tools/build_index.py              → index.html (공개용, 키 없음 · 처음 열 때 입력)
       python tools/build_index.py --with-key   → index_개인용.html (키 포함 · 깃 제외)
"""
import base64, json, os, re, sys
from datetime import date

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
sys.path.insert(0, ROOT)
import server  # noqa: E402  (API 키·부동산원 조회·캐시 재사용)

ST = os.path.join(ROOT, 'static')
read = lambda *p: open(os.path.join(ST, *p), encoding='utf-8').read()

WITH_KEY = '--with-key' in sys.argv
y = date.today().year
WK, MM = (f'{y - 3}01', f'{y}53'), (f'{y - 3}01', f'{y}12')
SERIES = [  # (표, 주기, 지역)  — app.js 의 REB 설정과 동일
    ('T244183132827305', 'WK', 50061), ('T244183132827305', 'WK', 50008),
    ('T247713133046872', 'WK', 50061), ('T247713133046872', 'WK', 50008),
    ('T248163133074619', 'WK', 50014), ('T245423133086632', 'WK', 50014),
    ('A_2024_00045', 'MM', 530030), ('A_2024_00045', 'MM', 500008),
    ('A_2024_00050', 'MM', 530030), ('A_2024_00050', 'MM', 500008),
    ('A_2024_00072', 'MM', 530030), ('T237973129847263', 'MM', 50027),
]
reb, latest = {}, ''
for tbl, cyc, cls in SERIES:
    st, en = WK if cyc == 'WK' else MM
    rows = server.reb({'STATBL_ID': tbl, 'DTACYCLE_CD': cyc, 'CLS_ID': cls, 'START_WRTTIME': st, 'END_WRTTIME': en})
    reb[f'{tbl}|{cyc}|{cls}'] = [{'t': r['t'], 'desc': r['desc'], 'v': r['v']} for r in rows]
    if cyc == 'WK' and rows:
        latest = max(latest, rows[-1]['desc'])
    print(tbl, cyc, cls, len(rows))

embed = {
    'molitKey': server.DATA_GO_KR_KEY if WITH_KEY else '',
    'rebAsOf': latest,
    'data': {n: json.loads(read('data', n)) for n in ('osm_apts.json', 'poi.json', 'gangseo_hjd.geojson')},
    'reb': reb,
}
logo = 'data:image/png;base64,' + base64.b64encode(open(os.path.join(ST, 'logo.png'), 'rb').read()).decode()

html = read('index.html')
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + read('style.css') + '\n</style>')
html = html.replace('src="logo.png"', f'src="{logo}"').replace('href="logo.png"', f'href="{logo}"')
js_embed = 'window.EMBED = ' + json.dumps(embed, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/') + ';'
for name, code in (('listings.js', read('listings.js')), ('app.js', read('app.js'))):
    tag = f'<script src="{name}"></script>'
    assert tag in html, tag
    body = (js_embed + '\n' if name == 'listings.js' else '') + code
    html = html.replace(tag, '<script>\n' + body.replace('</script', '<\\/script') + '\n</script>')
assert not re.search(r'(src|href)="(?!https?:|data:|tel:|#)[^"]+"', html), '인라인 안 된 로컬 파일 참조가 남아 있음'

out = os.path.join(ROOT, 'index_개인용.html' if WITH_KEY else 'index.html')
open(out, 'w', encoding='utf-8').write(html)
print(f'→ {out} ({os.path.getsize(out) / 1024:.0f} KB, 부동산원 지표 기준 {latest})')
