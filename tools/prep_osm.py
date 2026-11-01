"""OSM 원본(Overpass 결과)에서 강서구 아파트 좌표/생활편의시설 데이터 생성.
usage: python prep_osm.py osm_apt.json poi.json poi2.json  (출력: ../static/data/)"""
import json, sys, os, re

OUT = os.path.join(os.path.dirname(__file__), '..', 'static', 'data')
hjd = json.load(open(os.path.join(OUT, 'gangseo_hjd.geojson'), encoding='utf-8'))

def in_ring(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]; xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside

def which_dong(lon, lat):
    for f in hjd['features']:
        g = f['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        for p in polys:
            if in_ring(lon, lat, p[0]):
                return f['properties']['adm_nm'].split()[-1]
    return None

def center(e):
    c = e.get('center') or e
    return c['lat'], c['lon']

# 아파트 단지
apts = {}
for e in json.load(open(sys.argv[1], encoding='utf-8'))['elements']:
    n = e['tags'].get('name', '')
    if not n or '상가' in n or '오피스텔' in n or '관리' in n:
        continue
    lat, lon = center(e)
    d = which_dong(lon, lat)
    if not d:
        continue
    if n not in apts or e['type'] != 'node':
        apts[n] = {'n': n, 'lat': round(lat, 5), 'lon': round(lon, 5), 'hjd': d}
json.dump(list(apts.values()), open(os.path.join(OUT, 'osm_apts.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('apts', len(apts))

# 생활편의시설
LINES = {
    '송정': ['5'], '마곡': ['5'], '발산': ['5'], '우장산': ['5'], '화곡': ['5'], '까치산': ['5', '2'],
    '개화산': ['5'], '방화': ['5'], '김포공항': ['5', '9', '공항', '김포골드', '서해'],
    '개화': ['9'], '공항시장': ['9'], '신방화': ['9'], '마곡나루': ['9', '공항'], '양천향교': ['9'],
    '가양': ['9'], '증미': ['9'], '등촌': ['9'], '염창': ['9'], '신목동': ['9'], '신정네거리': ['2'],
}
poi = {'subway': [], 'school': [], 'hospital': [], 'shop': [], 'gov': [], 'park': []}
seen = set()
def add(cat, name, lat, lon, kind=''):
    key = (cat, re.sub(r'\(.*?\)|\s', '', name))
    if key in seen:
        return
    seen.add(key)
    poi[cat].append({'n': name, 'lat': round(lat, 5), 'lon': round(lon, 5), 'k': kind})

# 주요 시설 보강 (OSM 개별 검색 좌표)
CURATED = [
    ('hospital', '이대서울병원(상급종합)', 37.55726, 126.8362, '종합병원'),
    ('hospital', '미즈메디병원', 37.55209, 126.8359, '병원'),
    ('hospital', '부민병원', 37.55687, 126.85102, '종합병원'),
    ('hospital', '뉴강서성심병원', 37.57331, 126.80879, '병원'),
    ('hospital', '메디힐병원', 37.53722, 126.8275, '병원'),
    ('shop', 'NC백화점 강서점', 37.55995, 126.84058, 'department_store'),
    ('shop', '홈플러스 강서점', 37.55852, 126.85401, 'supermarket'),
    ('shop', '홈플러스 가양점', 37.56425, 126.85006, 'supermarket'),
    ('shop', '이마트 트레이더스 마곡점', 37.56108, 126.82473, 'supermarket'),
    ('shop', '롯데몰 김포공항', 37.56236, 126.80297, 'mall'),
    ('shop', '코엑스 마곡', 37.56591, 126.82567, 'mall'),
    ('shop', '강서농수산물도매시장', 37.55163, 126.82003, 'market'),
    ('shop', '이마트 신월점', 37.53977, 126.82881, 'supermarket'),
    ('gov', '강서구청', 37.55096, 126.84961, 'townhall'),
    ('gov', '강서구 통합신청사(마곡, 건립)', 37.56145, 126.82343, 'townhall'),
    ('gov', '강서세무서', 37.56215, 126.82155, 'tax'),
    ('gov', '서울강서우체국', 37.56526, 126.84101, 'post_office'),
    ('gov', '강서소방서', 37.55799, 126.86012, 'fire_station'),
    ('gov', '강서구민회관', 37.55313, 126.84422, 'townhall'),
    ('park', '서울식물원', 37.57107, 126.83278, '공원'),
]
for c in CURATED:
    add(*c)

for e in json.load(open(sys.argv[2], encoding='utf-8'))['elements']:
    t = e['tags']; n = t.get('name')
    if not n:
        continue
    lat, lon = center(e)
    if t.get('railway') == 'station':
        base = re.sub(r'역$', '', n)
        if base in LINES:
            add('subway', base + '역', lat, lon, ','.join(LINES[base]))
    elif t.get('amenity') == 'school':
        for suf, k in (('초등학교', '초'), ('중학교', '중'), ('고등학교', '고')):
            if n.endswith(suf):
                add('school', n, lat, lon, k)
    elif t.get('amenity') == 'hospital' and ('병원' in n) and '요양' not in n:
        add('hospital', n.split(' (')[0], lat, lon, '병원')
    elif not re.search('[가-힣]', n) or re.search('휴대폰|자동차|Duty|다이소|^현대$|^홈마트$', n):
        continue
    elif t.get('shop') in ('mall', 'department_store') or t.get('amenity') == 'marketplace' or \
            (t.get('shop') == 'supermarket' and re.search('이마트|홈플러스|롯데마트|트레이더스|코스트코', n) and '24' not in n):
        add('shop', n, lat, lon, t.get('shop') or 'market')
    elif t.get('leisure') == 'park' and ('공원' in n or '식물원' in n):
        add('park', n, lat, lon, '공원')
    elif t.get('amenity') in ('townhall', 'police', 'fire_station', 'post_office', 'library') and \
            re.search('구청|주민센터|행정복지센터|경찰서|지구대|소방서|우체국|도서관', n):
        add('gov', n, lat, lon, t.get('amenity'))

json.dump(poi, open(os.path.join(OUT, 'poi.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print({k: len(v) for k, v in poi.items()})
