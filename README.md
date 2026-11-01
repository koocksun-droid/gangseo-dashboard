# GO부동산 · 서울 강서구 아파트 시장 대시보드

공인중개사가 고객 브리핑에 사용하는 서울 강서구 아파트 시장 대시보드입니다.

- 행정동(20개) 선택, 주간/월간 집계, 기간 직접 지정
- 강서구 아파트 TOP 10 (매매·전세·월세, 거래량순/최고가순) → 지도에 위치·평형대별 최근 실거래가 표시
- 추천 매물(샘플) 및 단지별 입지분석: 교통 · 학군 · 상권 · 병원 · 개발계획 · 관공서/공원
- 시장 지표: 주간·월간 아파트 가격지수(강서구 vs 서울), 거래량, 전세가율, 미분양, 매매/전세 수급지수
- 인쇄/PDF 저장, 모바일 화면 지원

## 사용 방법

### 1) 단일 파일 (`index.html`)
`index.html`을 브라우저로 열면 바로 실행됩니다. 처음 열 때 **공공데이터포털 인증키**를 한 번 입력하면 그 브라우저에 저장됩니다.

- 국토교통부 실거래가는 열 때마다 최신 자료를 직접 조회합니다.
- 한국부동산원 지표는 브라우저 직접 호출이 막혀 있어 **빌드 시점 스냅샷**으로 들어 있습니다. 최신화하려면 아래 빌드 명령을 다시 실행하세요.

### 2) 로컬 서버 (부동산원 지표 자동 갱신)
```bash
cp config.example.json config.json   # 키 입력
python server.py                     # http://localhost:8765
```
Windows에서는 `대시보드_실행.bat`을 더블클릭해도 됩니다. Python 3 표준 라이브러리만 사용합니다.

### index.html 다시 만들기
```bash
python tools/build_index.py              # 공개용 index.html (키 없음)
python tools/build_index.py --with-key   # 개인용 index_개인용.html (키 포함, 깃 제외)
```

## 필요한 API 키
- [공공데이터포털](https://www.data.go.kr): 국토교통부 아파트 매매 실거래가 자료, 아파트 전월세 실거래가 자료
- [한국부동산원 R-ONE](https://www.reb.or.kr/r-one): 오픈API 인증키

## 데이터 출처 및 유의사항
- 국토교통부 아파트 매매·전월세 실거래가 (공공데이터포털), 한국부동산원 부동산통계(R-ONE)
- 행정동 경계: [vuski/admdongkor](https://github.com/vuski/admdongkor), 지도·단지·생활시설: © OpenStreetMap contributors (ODbL)
- 실거래는 계약일 기준이며 신고기한(30일)으로 최근 자료는 추가될 수 있습니다.
- 행정동 배정은 단지 좌표 기준이며, OSM에 없는 소규모 단지는 지번이 가까운 단지 위치로 근사합니다.
- 추천 매물은 시연용 **샘플**이며, 개발계획은 추진 단계 정보로 변동될 수 있습니다.

## 구성
```
index.html            단일 파일 버전 (빌드 결과)
server.py             API 프록시 + 캐시 + 정적파일 서버
static/               화면 (index.html, app.js, style.css, listings.js, data/)
tools/prep_osm.py     OSM 원본 → 단지 좌표·생활시설 데이터 생성
tools/build_index.py  단일 파일 index.html 생성
```

문의: GO부동산 · 02-6959-5040 · 010-2733-5040
