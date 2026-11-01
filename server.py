"""GO부동산 강서구 부동산 대시보드 - 로컬 서버
공공데이터포털(국토교통부 실거래가) / 한국부동산원 R-ONE API 프록시 + 캐시 + 정적파일 서빙.
실행: python server.py  →  http://localhost:8765
"""
import json, os, time, threading, urllib.request, urllib.parse
import xml.etree.ElementTree as ET
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from datetime import date

ROOT = os.path.dirname(os.path.abspath(__file__))

# API 키: config.json(깃 제외) 또는 환경변수 DATA_GO_KR_KEY / REB_KEY
_cfg_path = os.path.join(ROOT, 'config.json')
_cfg = json.load(open(_cfg_path, encoding='utf-8')) if os.path.exists(_cfg_path) else {}
DATA_GO_KR_KEY = os.environ.get('DATA_GO_KR_KEY') or _cfg.get('DATA_GO_KR_KEY', '')
REB_KEY = os.environ.get('REB_KEY') or _cfg.get('REB_KEY', '')
if not (DATA_GO_KR_KEY and REB_KEY):
    print('※ API 키가 없습니다. config.example.json 을 config.json 으로 복사해 키를 입력하세요.')
LAWD_CD = '11500'  # 서울 강서구
PORT = 8765

STATIC = os.path.join(ROOT, 'static')
CACHE = os.path.join(ROOT, 'cache')
os.makedirs(CACHE, exist_ok=True)
_locks = {}

MOLIT = {
    'trade': ('RTMSDataSvcAptTrade', 'getRTMSDataSvcAptTrade'),
    'rent': ('RTMSDataSvcAptRent', 'getRTMSDataSvcAptRent'),
}


def http_get(url, timeout=60):
    req = urllib.request.Request(url, headers={'User-Agent': 'GOrealty-dashboard/1.0'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def cached(key, max_age, loader):
    """파일 캐시. max_age=None 이면 영구 캐시."""
    path = os.path.join(CACHE, key + '.json')
    lock = _locks.setdefault(key, threading.Lock())
    with lock:
        if os.path.exists(path) and (max_age is None or time.time() - os.path.getmtime(path) < max_age):
            with open(path, encoding='utf-8') as f:
                return json.load(f)
        try:
            data = loader()
        except Exception:
            if os.path.exists(path):  # API 장애 시 이전 캐시 사용
                with open(path, encoding='utf-8') as f:
                    return json.load(f)
            raise
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
        return data


def num(s):
    s = (s or '').replace(',', '').strip()
    try:
        return float(s) if '.' in s else int(s)
    except ValueError:
        return 0


def load_molit(kind, ym):
    svc, op = MOLIT[kind]
    rows, page = [], 1
    while True:
        q = urllib.parse.urlencode({'serviceKey': DATA_GO_KR_KEY, 'LAWD_CD': LAWD_CD, 'DEAL_YMD': ym,
                                    'numOfRows': 1000, 'pageNo': page}, safe='')
        root = ET.fromstring(http_get(f'https://apis.data.go.kr/1613000/{svc}/{op}?{q}'))
        code = root.findtext('.//resultCode')
        if code not in ('000', '00'):
            raise RuntimeError(root.findtext('.//resultMsg') or root.findtext('.//returnAuthMsg') or 'API error')
        for it in root.iter('item'):
            d = {c.tag: (c.text or '').strip() for c in it}
            r = {
                'apt': d.get('aptNm', ''), 'umd': d.get('umdNm', ''), 'jibun': d.get('jibun', ''),
                'area': num(d.get('excluUseAr')), 'floor': num(d.get('floor')), 'by': num(d.get('buildYear')),
                'date': '%s-%02d-%02d' % (d.get('dealYear'), num(d.get('dealMonth')), num(d.get('dealDay'))),
            }
            if kind == 'trade':
                if d.get('cdealType', '').strip():  # 해제된 거래 제외
                    continue
                r['price'] = num(d.get('dealAmount'))
                r['gbn'] = d.get('dealingGbn', '')
            else:
                r['deposit'] = num(d.get('deposit'))
                r['rent'] = num(d.get('monthlyRent'))
                r['ctype'] = d.get('contractType', '')
            rows.append(r)
        total = int(root.findtext('.//totalCount') or 0)
        if page * 1000 >= total:
            break
        page += 1
    return rows


def molit(kind, ym):
    today = date.today()
    y, m = int(ym[:4]), int(ym[4:])
    months_ago = (today.year - y) * 12 + today.month - m
    # 실거래 신고기한(30일) 감안: 최근 3개월은 6시간마다 갱신, 그 이전은 영구 캐시
    max_age = 6 * 3600 if months_ago <= 3 else None
    return cached(f'{kind}_{ym}', max_age, lambda: load_molit(kind, ym))


def reb(params):
    q = {'KEY': REB_KEY, 'Type': 'json', 'pIndex': 1, 'pSize': 1000}
    q.update({k: params[k] for k in ('STATBL_ID', 'DTACYCLE_CD', 'CLS_ID', 'START_WRTTIME', 'END_WRTTIME',
                                    'WRTTIME_IDTFR_ID', 'ITM_ID') if params.get(k)})
    key = 'reb_' + '_'.join(str(q.get(k, '')) for k in ('STATBL_ID', 'DTACYCLE_CD', 'CLS_ID', 'START_WRTTIME',
                                                         'END_WRTTIME', 'WRTTIME_IDTFR_ID', 'ITM_ID'))

    def load():
        d = json.loads(http_get('https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do?' + urllib.parse.urlencode(q)))
        v = d.get('SttsApiTblData')
        if not isinstance(v, list):
            return []
        return [{'t': r['WRTTIME_IDTFR_ID'], 'desc': r['WRTTIME_DESC'], 'cls': r['CLS_FULLNM'], 'itm': r['ITM_NM'],
                 'v': r['DTA_VAL']} for r in v[1]['row']]
    return cached(key, 6 * 3600, load)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=STATIC, **kw)

    def log_message(self, fmt, *args):
        if '/api/' in (args[0] if args else ''):
            super().log_message(fmt, *args)

    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if not u.path.startswith('/api/'):
            return super().do_GET()
        p = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        try:
            if u.path in ('/api/trade', '/api/rent'):
                ym = p.get('ym', '')
                if not (len(ym) == 6 and ym.isdigit()):
                    return self.send_json({'error': 'ym=YYYYMM 필요'}, 400)
                return self.send_json(molit(u.path[5:], ym))
            if u.path == '/api/reb':
                return self.send_json(reb(p))
            return self.send_json({'error': 'not found'}, 404)
        except Exception as e:
            return self.send_json({'error': str(e)}, 502)


if __name__ == '__main__':
    print(f'GO부동산 강서구 대시보드 → http://localhost:{PORT}')
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
