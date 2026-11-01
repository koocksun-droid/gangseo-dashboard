/* GO부동산 강서구 부동산 대시보드 */
'use strict';

const REB = {
  wkSale: 'T244183132827305', wkJeonse: 'T247713133046872', wkSupply: 'T248163133074619', wkJSupply: 'T245423133086632',
  mmSale: 'A_2024_00045', mmJeonse: 'A_2024_00050', jeonseRatio: 'A_2024_00072', unsold: 'T237973129847263',
  // CLS_ID: 주간표 / 월간표 / 미분양표의 지역 코드가 서로 다름
  wkGangseo: 50061, wkSeoul: 50008, wkSW: 50014, mmGangseo: 530030, mmSeoul: 500008, unsoldGangseo: 50027,
};
const LINE_COLORS = { '2': '#00A84D', '5': '#996CAC', '9': '#BDB092', '공항': '#0090D2', '김포골드': '#A17800', '서해': '#8FC31F' };
const COLORS = { red: '#e31e24', ink: '#231f20', blue: '#2563eb', green: '#0f9d58', gray: '#9a95a0', amber: '#e08a00' };

const S = {
  mode: 'week', from: null, to: null, dong: '', topKind: 'trade', sortBy: 'cnt', sel: null, selListing: null,
  months: {},          // ym -> {trade:[], rent:[]}
  apts: new Map(),     // key -> 단지 정보 (좌표/행정동)
  osm: [], poi: null, hjd: null, charts: {}, map: null, layers: {},
};

// ───────── 유틸 ─────────
const $ = (s) => document.querySelector(s);
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (s) => new Date(s + 'T00:00:00Z');
const addDays = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const todayISO = () => { const n = new Date(); return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`; };
const ymOf = (s) => s.slice(0, 4) + s.slice(5, 7);
const weekStart = (s) => { const d = parse(s); const wd = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - wd); return iso(d); };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const PY = 3.3058;

function monthsBetween(from, to) {
  const out = []; let y = +from.slice(0, 4), m = +from.slice(5, 7);
  const ey = +to.slice(0, 4), em = +to.slice(5, 7);
  while (y < ey || (y === ey && m <= em)) { out.push(`${y}${pad(m)}`); if (++m > 12) { m = 1; y++; } }
  return out;
}
function won(v) { // 만원 → 15억 5,000
  v = Math.round(v);
  if (v >= 10000) { const e = Math.floor(v / 10000), r = v % 10000; return r ? `${e}억 ${r.toLocaleString()}` : `${e}억`; }
  return `${v.toLocaleString()}만`;
}
const eok = (v) => v >= 10000 ? (v / 10000).toFixed(2).replace(/\.?0+$/, '') + '억' : Math.round(v).toLocaleString() + '만';
const wolseStr = (r) => `${eok(r.deposit)}/${r.rent}`;
const pct = (a, b) => (b ? ((a - b) / b) * 100 : null);
function delta(v, unit = '%', digits = 1) {
  if (v === null || v === undefined || !isFinite(v)) return '<span>-</span>';
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : '';
  return `<span class="${cls}">${v > 0 ? '▲' : v < 0 ? '▼' : ''}${Math.abs(v).toFixed(digits)}${unit}</span>`;
}
const supplyPy = (area) => Math.round((area * 1.32) / PY);
function dist(a, b, c, d) { // m
  const R = 6371000, t = Math.PI / 180;
  const x = (d - b) * t * Math.cos(((a + c) / 2) * t), y = (c - a) * t;
  return Math.sqrt(x * x + y * y) * R;
}
const walk = (m) => Math.max(1, Math.round((m * 1.25) / 67));
const distStr = (m) => m < 1500 ? `${Math.round(m / 10) * 10}m · 도보 ${walk(m)}분` : `${(m / 1000).toFixed(1)}km`;
function setStatus(msg, err) { const el = $('#status'); el.textContent = msg; el.className = 'status' + (err ? ' err' : ''); }

async function getJSON(url) {
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || r.statusText);
  return j;
}
async function pool(items, n, fn) {
  const q = [...items]; const run = async () => { while (q.length) await fn(q.shift()); };
  await Promise.all(Array.from({ length: n }, run));
}
// 단일 파일(index.html) 모드: window.EMBED 에 기본데이터·부동산원 스냅샷이 들어있고,
// 국토부 실거래는 브라우저에서 공공데이터포털을 직접 호출 (CORS 허용)
const EMBED = window.EMBED;
const loadData = (name) => (EMBED ? Promise.resolve(EMBED.data[name]) : getJSON('data/' + name));
function reb(tbl, cycle, cls, start, end) {
  if (EMBED) {
    const rows = EMBED.reb[`${tbl}|${cycle}|${cls}`] || [];
    return Promise.resolve(rows.filter((r) => r.t >= String(start) && r.t <= String(end)));
  }
  const q = new URLSearchParams({ STATBL_ID: tbl, DTACYCLE_CD: cycle, CLS_ID: cls, START_WRTTIME: start, END_WRTTIME: end });
  return getJSON('/api/reb?' + q).catch(() => []);
}
const MOLIT = { trade: 'RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade', rent: 'RTMSDataSvcAptRent/getRTMSDataSvcAptRent' };
const numv = (s) => { s = (s || '').replace(/,/g, '').trim(); return s ? +s || 0 : 0; };
async function fetchMolit(kind, ym) {
  const ck = `gs_${kind}_${ym}`;
  const old = ym < ymOf(addDays(todayISO(), -100)); // 3개월 이전 자료는 변동이 거의 없어 브라우저에 보관
  if (old) { try { const c = localStorage.getItem(ck); if (c) return JSON.parse(c); } catch (e) { /* 저장소 사용 불가 */ } }
  const rows = [];
  for (let page = 1; ; page++) {
    const url = `https://apis.data.go.kr/1613000/${MOLIT[kind]}?serviceKey=${EMBED.molitKey}&LAWD_CD=11500&DEAL_YMD=${ym}&numOfRows=1000&pageNo=${page}`;
    const xml = new DOMParser().parseFromString(await (await fetch(url)).text(), 'text/xml');
    const code = xml.querySelector('resultCode')?.textContent;
    if (code !== '000' && code !== '00') throw new Error(xml.querySelector('resultMsg,returnAuthMsg')?.textContent || 'API 오류');
    xml.querySelectorAll('item').forEach((it) => {
      const g = (t) => (it.getElementsByTagName(t)[0]?.textContent || '').trim();
      const r = { apt: g('aptNm'), umd: g('umdNm'), jibun: g('jibun'), area: numv(g('excluUseAr')), floor: numv(g('floor')),
        by: numv(g('buildYear')), date: `${g('dealYear')}-${pad(numv(g('dealMonth')))}-${pad(numv(g('dealDay')))}` };
      if (kind === 'trade') { if (g('cdealType')) return; r.price = numv(g('dealAmount')); r.gbn = g('dealingGbn'); }
      else { r.deposit = numv(g('deposit')); r.rent = numv(g('monthlyRent')); r.ctype = g('contractType'); }
      rows.push(r);
    });
    if (page * 1000 >= +(xml.querySelector('totalCount')?.textContent || 0)) break;
  }
  if (old) { try { localStorage.setItem(ck, JSON.stringify(rows)); } catch (e) { /* 용량 초과 시 무시 */ } }
  return rows;
}
const molit = (kind, ym) => (EMBED ? fetchMolit(kind, ym) : getJSON(`/api/${kind}?ym=${ym}`));
// 공개용 파일에는 키가 없으므로 화면의 입력칸으로 받아 이 브라우저에만 저장
const BUILT_IN_KEY = !!EMBED?.molitKey;
function hasMolitKey() {
  if (!EMBED || EMBED.molitKey) return true;
  try { EMBED.molitKey = localStorage.getItem('gs_molit_key') || ''; } catch (e) { /* 저장소 사용 불가 */ }
  return !!EMBED.molitKey;
}
function showKeyBox(show, msg) {
  $('#keyBox').classList.toggle('hidden', !show);
  $('#keyMsg').textContent = msg || '';
  if (show) $('#keyInput').focus();
}
function saveKey() {
  const k = $('#keyInput').value.trim();
  if (!k) { showKeyBox(true, '인증키를 붙여넣어 주세요.'); return; }
  EMBED.molitKey = k;
  try { localStorage.setItem('gs_molit_key', k); } catch (e) { /* 저장 실패 시 이번 접속에서만 사용 */ }
  $('#keyInput').value = '';
  showKeyBox(false);
  S.months = {}; S.apts.clear();
  apply();
}
function resetKey() {
  try { localStorage.removeItem('gs_molit_key'); } catch (e) { /* 무시 */ }
  EMBED.molitKey = '';
  showKeyBox(true);
}

// ───────── 단지명 매칭 (실거래 단지 ↔ OSM 좌표) ─────────
function norm(s) {
  return s.replace(/아파트/g, '').replace(/e-?편한세상/gi, '이편한세상').replace(/벨리/g, '밸리')
    .replace(/[\s(),.\-·_]/g, '').replace(/제(\d)/g, '$1').toLowerCase();
}
function bigrams(s) { const a = new Set(); for (let i = 0; i < s.length - 1; i++) a.add(s.slice(i, i + 2)); return a; }
function dice(a, b) {
  const A = bigrams(a), B = bigrams(b); if (!A.size || !B.size) return 0;
  let n = 0; A.forEach((x) => { if (B.has(x)) n++; }); return (2 * n) / (A.size + B.size);
}
// 법정동 → 포함될 수 있는 행정동(접두어)
const COMPAT = {
  염창: ['염창', '등촌3'], 등촌: ['등촌'], 화곡: ['화곡', '우장산', '발산'], 가양: ['가양', '등촌3'],
  마곡: ['가양1', '발산', '공항', '방화', '우장산'], 내발산: ['발산', '우장산', '화곡'], 외발산: ['발산', '공항'],
  공항: ['공항'], 과해: ['공항'], 오곡: ['공항'], 오쇠: ['공항'], 방화: ['방화', '공항'], 개화: ['방화'],
};
function matchOSM(apt, umd) {
  const base = umd.replace(/동$/, '');
  const ok = COMPAT[base] ? (o) => COMPAT[base].some((p) => o.hjd.startsWith(p)) : () => true;
  const pool = S.osm.filter(ok);
  const cands = [norm(apt), norm(base + apt), norm(base + apt + '단지')];
  for (const c of cands) { const hit = pool.find((o) => o.nn === c); if (hit) return hit; }
  // 동 이름(화곡·등촌 등)이 공통으로 붙어 점수가 부풀지 않도록 제거 후 비교
  const strip = (s) => (base ? s.split(norm(base)).join('') : s);
  const core = strip(norm(apt.replace(/\(\d[\d-]*\)/g, ''))); // "(919-1)" 같은 지번 표기 제거
  const nums = (s) => (s.match(/\d+/g) || []).join();
  let best = null, bs = 0;
  for (const o of pool) {
    const oc = strip(o.nn);
    let sc = dice(core, oc);
    if (Math.min(core.length, oc.length) >= 4 && (oc.includes(core) || core.includes(oc))) sc = Math.max(sc, 0.75);
    if (nums(core) && nums(oc) && nums(core) !== nums(oc)) sc -= 0.3; // 단지 번호 불일치
    if (sc > bs) { bs = sc; best = o; }
  }
  return bs >= 0.62 ? best : null;
}
function registerApt(r) {
  const key = `${r.apt}|${r.umd}|${r.jibun}`;
  r.key = key;
  if (S.apts.has(key)) return;
  const o = matchOSM(r.apt, r.umd);
  S.apts.set(key, { key, apt: r.apt, umd: r.umd, jibun: r.jibun, by: r.by, lat: o?.lat, lon: o?.lon, hjd: o?.hjd, approx: !o });
}
// OSM 매칭 실패 단지: 같은 법정동에서 지번이 가장 가까운 단지 위치로 근사
function resolveApprox() {
  const known = [...S.apts.values()].filter((a) => !a.approx);
  for (const a of S.apts.values()) {
    if (!a.approx || a.lat) continue;
    const bn = parseInt(a.jibun) || 0;
    let best = null, bd = Infinity;
    for (const k of known) {
      if (k.umd !== a.umd) continue;
      const d = Math.abs((parseInt(k.jibun) || 0) - bn);
      if (d < bd) { bd = d; best = k; }
    }
    if (best) { a.lat = best.lat; a.lon = best.lon; a.hjd = best.hjd; continue; }
    // 그래도 없으면 해당 법정동이 속한 행정동 중심점
    const pre = COMPAT[a.umd.replace(/동$/, '')]?.[0];
    const f = pre && S.hjd.features.find((x) => x.properties.adm_nm.split(' ').pop().startsWith(pre));
    if (f) { const c = L.geoJSON(f).getBounds().getCenter(); a.lat = c.lat; a.lon = c.lng; a.hjd = f.properties.adm_nm.split(' ').pop(); }
  }
}
// 단지명 없이 지번만 신고된 경우 표시용 이름
const aptName = (a) => (/^\(?[\d-]+\)?$/.test(a.apt) ? `${a.umd} ${a.apt.replace(/[()]/g, '')}번지 (단지명 미등록)` : a.apt.replace(',', ' '));

// ───────── 데이터 로드 ─────────
async function loadStatic() {
  const [osm, poi, hjd] = await Promise.all([
    loadData('osm_apts.json'), loadData('poi.json'), loadData('gangseo_hjd.geojson'),
  ]);
  S.osm = osm.map((o) => ({ ...o, nn: norm(o.n) })).filter((o) => (o.nn.match(/[가-힣]/g) || []).length >= 2);
  S.poi = poi; S.hjd = hjd;
  const names = hjd.features.map((f) => f.properties.adm_nm.split(' ').pop()).sort((a, b) => a.localeCompare(b, 'ko'));
  $('#dong').insertAdjacentHTML('beforeend', names.map((n) => `<option>${n}</option>`).join(''));
}
async function ensureMonths(list) {
  const need = list.filter((ym) => !S.months[ym]);
  let done = 0, failed = 0;
  await pool(need, 4, async (ym) => {
    try {
      const [trade, rent] = await Promise.all([molit('trade', ym), molit('rent', ym)]);
      trade.forEach(registerApt); rent.forEach(registerApt);
      S.months[ym] = { trade, rent };
    } catch (e) { failed++; S.lastErr = e.message; console.warn(ym, e); }
    setStatus(`실거래 자료 불러오는 중… ${++done}/${need.length}개월`);
  });
  resolveApprox();
  return failed;
}
const all = (kind) => Object.values(S.months).flatMap((m) => m[kind]);
const aptOf = (r) => S.apts.get(r.key);
function filt(kind, from, to, dong = S.dong) {
  return all(kind).filter((r) => r.date >= from && r.date <= to && (!dong || aptOf(r)?.hjd === dong));
}

// ───────── 기간 ─────────
function defaultRange(mode) {
  const to = todayISO();
  if (mode === 'week') return { from: addDays(weekStart(to), -7 * 11), to };
  const d = parse(to); d.setUTCMonth(d.getUTCMonth() - 11); d.setUTCDate(1);
  return { from: iso(d), to };
}
function prevRange() {
  const span = (parse(S.to) - parse(S.from)) / 86400000;
  const pto = addDays(S.from, -1);
  return { from: addDays(pto, -span), to: pto };
}

// ───────── 렌더: KPI ─────────
async function renderKPIs() {
  const { from, to } = S, p = prevRange();
  const T = filt('trade', from, to), Tp = filt('trade', p.from, p.to);
  const R = filt('rent', from, to), Rp = filt('rent', p.from, p.to);
  const J = R.filter((r) => !r.rent), W = R.filter((r) => r.rent > 0);
  const Jp = Rp.filter((r) => !r.rent), Wp = Rp.filter((r) => r.rent > 0);
  const ppy = (a, f) => avg(a.filter((r) => r.area > 0).map((r) => f(r) / (r.area / PY)));
  const tP = ppy(T, (r) => r.price), tPp = ppy(Tp, (r) => r.price);
  const jP = ppy(J, (r) => r.deposit), jPp = ppy(Jp, (r) => r.deposit);

  const y = +to.slice(0, 4);
  const [wk, wkj, sup, ratio, uns] = await Promise.all([
    reb(REB.wkSale, 'WK', REB.wkGangseo, `${y - 1}01`, `${y}53`),
    reb(REB.wkJeonse, 'WK', REB.wkGangseo, `${y - 1}01`, `${y}53`),
    reb(REB.wkSupply, 'WK', REB.wkSW, `${y - 1}01`, `${y}53`),
    reb(REB.jeonseRatio, 'MM', REB.mmGangseo, `${y - 1}01`, ymOf(to)),
    reb(REB.unsold, 'MM', REB.unsoldGangseo, `${y - 2}01`, ymOf(to)),
  ]);
  const upTo = (rows) => rows.filter((r) => (r.desc.length === 10 ? r.desc : r.t) <= (r.desc.length === 10 ? to : ymOf(to)));
  const last2 = (rows) => { const a = upTo(rows); return [a[a.length - 1], a[a.length - 2]]; };
  const [w1, w0] = last2(wk), [j1, j0] = last2(wkj), [s1] = last2(sup), [r1] = last2(ratio);
  const ua = upTo(uns), u1 = ua[ua.length - 1], u12 = ua[ua.length - 13];
  const per = S.mode === 'week' ? '직전 동기간' : '직전 동기간';
  const area = S.dong || '강서구';

  const tiles = [
    { k: `${area} 매매 거래`, v: T.length.toLocaleString(), u: '건', d: `${per} 대비 ${delta(pct(T.length, Tp.length))}`, red: 1 },
    { k: '매매 평균 3.3㎡당(전용)', v: tP ? Math.round(tP).toLocaleString() : '-', u: '만원', d: `${per} 대비 ${delta(pct(tP, tPp))}`, red: 1 },
    { k: `${area} 전세 거래`, v: J.length.toLocaleString(), u: '건', d: `평균 3.3㎡당 ${jP ? Math.round(jP).toLocaleString() + '만' : '-'} ${delta(pct(jP, jPp))}` },
    { k: `${area} 월세 거래`, v: W.length.toLocaleString(), u: '건', d: W.length ? `평균 ${eok(avg(W.map((r) => r.deposit)))} / ${Math.round(avg(W.map((r) => r.rent)))}만 · ${delta(pct(W.length, Wp.length))}` : '-' },
    { k: '강서구 주간 매매지수', v: w1 ? w1.v.toFixed(2) : '-', u: '', d: w1 ? `${w1.desc} · 전주 대비 ${delta(pct(w1.v, w0?.v), '%', 2)}` : '자료 없음' },
    { k: '강서구 주간 전세지수', v: j1 ? j1.v.toFixed(2) : '-', u: '', d: j1 ? `${j1.desc} · 전주 대비 ${delta(pct(j1.v, j0?.v), '%', 2)}` : '자료 없음' },
    { k: '강서구 전세가율', v: r1 ? r1.v.toFixed(1) : '-', u: '%', d: r1 ? `${r1.desc} · 매매가 대비 전세가` : '자료 없음' },
    { k: '강서구 미분양', v: u1 ? u1.v.toLocaleString() : '-', u: '호', d: u1 ? `${u1.desc} · 1년 전 대비 ${u12 ? delta(u1.v - u12.v, '호', 0) : '-'}` : '자료 없음' },
    { k: '매매수급지수(서남권)', v: s1 ? s1.v.toFixed(1) : '-', u: '', d: s1 ? `${s1.desc} · ${s1.v > 100 ? '<span class="up">매수자 우위</span>' : '<span class="down">매도자 우위</span>'} (기준 100)` : '자료 없음' },
  ];
  if (S.noKey) tiles.slice(0, 4).forEach((t) => { t.v = '-'; t.u = ''; t.d = '인증키 입력 후 표시'; });
  $('#kpis').innerHTML = tiles.map((t) => `<div class="kpi ${t.red ? 'red' : ''}"><div class="k">${t.k}</div>
    <div class="v">${t.v}<small>${t.u}</small></div><div class="d">${t.d}</div></div>`).join('');
}

// ───────── 렌더: 차트 ─────────
Chart.defaults.font.family = "'Noto Sans KR', system-ui, sans-serif";
Chart.defaults.color = '#55505a';
function chart(id, cfg) {
  S.charts[id]?.destroy();
  cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } } } }, cfg.options || {});
  S.charts[id] = new Chart($('#' + id), cfg);
}
const line = (label, data, color, dash) => ({ label, data, borderColor: color, backgroundColor: color, borderWidth: 2,
  pointRadius: 0, pointHoverRadius: 4, tension: 0.25, borderDash: dash ? [5, 4] : [], spanGaps: true });

async function renderIndex() {
  const { to } = S;
  let rows;
  if (S.mode === 'week') {
    const from = S.from < addDays(to, -7 * 12) ? S.from : addDays(to, -7 * 12);
    const st = `${+from.slice(0, 4)}01`, en = `${to.slice(0, 4)}53`;
    rows = await Promise.all([
      reb(REB.wkSale, 'WK', REB.wkGangseo, st, en), reb(REB.wkSale, 'WK', REB.wkSeoul, st, en),
      reb(REB.wkJeonse, 'WK', REB.wkGangseo, st, en), reb(REB.wkJeonse, 'WK', REB.wkSeoul, st, en),
    ]);
    rows = rows.map((a) => a.filter((r) => r.desc >= addDays(from, -6) && r.desc <= to));
    $('#idxTitle').textContent = '주간 아파트 가격지수 (강서구 vs 서울)';
  } else {
    let fm = ymOf(S.from); const tm = ymOf(to);
    if (monthsBetween(S.from, to).length < 12) { const d = parse(to); d.setUTCMonth(d.getUTCMonth() - 11); fm = ymOf(iso(d)); }
    rows = await Promise.all([
      reb(REB.mmSale, 'MM', REB.mmGangseo, fm, tm), reb(REB.mmSale, 'MM', REB.mmSeoul, fm, tm),
      reb(REB.mmJeonse, 'MM', REB.mmGangseo, fm, tm), reb(REB.mmJeonse, 'MM', REB.mmSeoul, fm, tm),
    ]);
    $('#idxTitle').textContent = '월간 아파트 가격지수 (강서구 vs 서울)';
  }
  const labels = [...new Set(rows.flatMap((a) => a.map((r) => r.t)))].sort();
  const lab = (t) => { const r = rows.flat().find((x) => x.t === t); return r.desc.length === 10 ? r.desc.slice(5).replace('-', '/') : `${t.slice(2, 4)}.${t.slice(4)}`; };
  const ser = (a) => labels.map((t) => a.find((r) => r.t === t)?.v ?? null);
  chart('cIndex', { type: 'line', data: { labels: labels.map(lab), datasets: [
    line('강서구 매매', ser(rows[0]), COLORS.red), line('서울 매매', ser(rows[1]), COLORS.red, true),
    line('강서구 전세', ser(rows[2]), COLORS.blue), line('서울 전세', ser(rows[3]), COLORS.blue, true),
  ] }, options: { scales: { y: { ticks: { callback: (v) => v.toFixed(1) } }, x: { ticks: { maxTicksLimit: 12 } } },
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } },
      tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y?.toFixed(2)}` } } } } });
}

function renderVolume() {
  const { from, to } = S;
  const key = S.mode === 'week' ? (r) => weekStart(r.date) : (r) => r.date.slice(0, 7);
  const buckets = [];
  if (S.mode === 'week') for (let d = weekStart(from); d <= to; d = addDays(d, 7)) buckets.push(d);
  else monthsBetween(from, to).forEach((m) => buckets.push(`${m.slice(0, 4)}-${m.slice(4)}`));
  const count = (rows) => { const c = {}; rows.forEach((r) => { const k = key(r); c[k] = (c[k] || 0) + 1; }); return buckets.map((b) => c[b] || 0); };
  const R = filt('rent', from, to);
  $('#volTitle').textContent = `${S.mode === 'week' ? '주간' : '월간'} 거래량 추이 (${S.dong || '강서구'})`;
  chart('cVol', { type: 'bar', data: {
    labels: buckets.map((b) => S.mode === 'week' ? b.slice(5).replace('-', '/') + '주' : `${b.slice(2, 4)}.${b.slice(5)}`),
    datasets: [
      { label: '매매', data: count(filt('trade', from, to)), backgroundColor: COLORS.red, stack: 's' },
      { label: '전세', data: count(R.filter((r) => !r.rent)), backgroundColor: COLORS.blue, stack: 's' },
      { label: '월세', data: count(R.filter((r) => r.rent > 0)), backgroundColor: COLORS.green, stack: 's' },
    ] }, options: { scales: { x: { stacked: true, ticks: { maxTicksLimit: 14 } }, y: { stacked: true } } } });
}

function dongCounts() {
  const c = {}; S.hjd.features.forEach((f) => { c[f.properties.adm_nm.split(' ').pop()] = 0; });
  filt('trade', S.from, S.to, '').forEach((r) => { const h = aptOf(r)?.hjd; if (h in c) c[h]++; });
  return c;
}
function renderDongChart() {
  const c = dongCounts();
  const ent = Object.entries(c).sort((a, b) => b[1] - a[1]);
  chart('cDong', { type: 'bar', data: { labels: ent.map((e) => e[0]), datasets: [{ label: '매매 거래(건)',
    data: ent.map((e) => e[1]), backgroundColor: ent.map((e) => (e[0] === S.dong ? COLORS.red : '#c9c4cc')), borderRadius: 4 }] },
  options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { y: { ticks: { autoSkip: false, font: { size: 11 } } } },
    onClick: (_, els) => { if (els.length) setDong(ent[els[0].index][0]); } } });
}

async function renderSupply() {
  const y = +S.to.slice(0, 4);
  const [a, b] = await Promise.all([
    reb(REB.wkSupply, 'WK', REB.wkSW, `${y - 1}01`, `${y}53`), reb(REB.wkJSupply, 'WK', REB.wkSW, `${y - 1}01`, `${y}53`),
  ]);
  const cut = (rows) => rows.filter((r) => r.desc <= S.to).slice(-26);
  const A = cut(a), B = cut(b);
  const labels = A.map((r) => r.desc.slice(5).replace('-', '/'));
  chart('cSupply', { type: 'line', data: { labels, datasets: [
    line('매매수급지수(서남권)', A.map((r) => r.v), COLORS.red),
    line('전세수급지수(서남권)', labels.map((_, i) => B[i]?.v ?? null), COLORS.blue),
    { ...line('기준선 100 (초과 시 수요 우위)', labels.map(() => 100), COLORS.gray, true), borderWidth: 1 },
  ] }, options: { scales: { x: { ticks: { maxTicksLimit: 10 } } } } });
}

// ───────── 렌더: TOP 10 ─────────
function topRows() {
  const { from, to } = S;
  let rows, val;
  if (S.topKind === 'trade') { rows = filt('trade', from, to); val = (r) => r.price; }
  else { rows = filt('rent', from, to).filter((r) => (S.topKind === 'jeonse' ? !r.rent : r.rent > 0)); val = (r) => (S.topKind === 'jeonse' ? r.deposit : r.rent); }
  const g = new Map();
  rows.forEach((r) => {
    if (!g.has(r.key)) g.set(r.key, { key: r.key, list: [] });
    g.get(r.key).list.push(r);
  });
  const out = [...g.values()].map((x) => {
    const max = x.list.reduce((a, b) => (val(b) > val(a) ? b : a));
    return { ...x, cnt: x.list.length, avg: avg(x.list.map(val)), max, maxV: val(max), apt: aptOf(x.list[0]) };
  });
  out.sort((a, b) => (S.sortBy === 'cnt' ? b.cnt - a.cnt || b.maxV - a.maxV : b.maxV - a.maxV));
  return out.slice(0, 10);
}
function renderTop() {
  const rows = topRows();
  const kindName = { trade: '매매', jeonse: '전세', wolse: '월세' }[S.topKind];
  $('#topTitle').textContent = `${S.dong || '강서구'} 아파트 TOP 10 · ${kindName}`;
  if (!rows.length) { $('#topTbl').innerHTML = '<tr><td class="empty">선택한 기간·지역에 거래가 없습니다.</td></tr>'; return; }
  const fmtAvg = (x) => S.topKind === 'wolse' ? `${eok(avg(x.list.map((r) => r.deposit)))}/${Math.round(x.avg)}` : eok(x.avg);
  const fmtMax = (x) => (S.topKind === 'wolse' ? wolseStr(x.max) : eok(x.maxV)) + `<div class="apt-sub">${Math.round(x.max.area)}㎡ · ${x.max.floor}층</div>`;
  $('#topTbl').innerHTML = `<thead><tr><th>순위</th><th>단지</th><th class="num">거래</th><th class="num">평균${S.topKind === 'wolse' ? '(보증금/월세)' : ''}</th><th class="num">최고가</th></tr></thead>
  <tbody>${rows.map((x, i) => `<tr data-key="${esc(x.key)}" class="${x.key === S.sel ? 'sel' : ''}">
    <td><span class="rank r${i + 1}">${i + 1}</span></td>
    <td><div class="apt-n">${esc(aptName(x.apt))}</div><div class="apt-sub">${esc(x.apt.hjd || x.apt.umd)} · ${x.apt.by || '-'}년식</div></td>
    <td class="num">${x.cnt}건</td><td class="num">${fmtAvg(x)}</td><td class="num">${fmtMax(x)}</td></tr>`).join('')}</tbody>`;
}

// ───────── 렌더: 샘플 매물 ─────────
// 최근 거래 선택: 직거래(가족 간 등 시세 왜곡 가능)는 중개거래가 없을 때만 사용
const newer = (r, cur) => !cur || ((r.gbn === '직거래') === (cur.gbn === '직거래') ? r.date > cur.date : cur.gbn === '직거래');
function keyByName(apt) {
  const ks = [...S.apts.values()].filter((a) => a.apt === apt);
  return ks.find((a) => !a.approx)?.key || ks[0]?.key;
}
function recentFor(key, kind, area) {
  const src = kind === '매매' ? all('trade') : all('rent').filter((r) => (kind === '전세' ? !r.rent : r.rent > 0));
  return src.filter((r) => r.key === key && Math.floor(r.area) === Math.floor(area)).reduce((a, r) => (newer(r, a) ? r : a), null);
}
function renderListings() {
  $('#listings').innerHTML = SAMPLE_LISTINGS.map((l) => {
    const key = keyByName(l.apt);
    const rc = key && recentFor(key, l.type, l.area);
    const price = l.type === '월세' ? `${won(l.price)} / ${l.rent}` : won(l.price);
    const cmp = rc ? `최근 실거래 ${l.type === '매매' ? eok(rc.price) : l.type === '전세' ? eok(rc.deposit) : wolseStr(rc)} (${rc.date.slice(2).replace(/-/g, '.')}, ${rc.floor}층)` : '최근 1년 동일 평형 실거래 없음';
    return `<div class="lst ${S.selListing === l.id ? 'sel' : ''}" data-id="${l.id}">
      <span class="srcl">N 광고(샘플)</span>
      <span class="t ${l.type}">${l.type}</span>
      <div class="nm">${esc(l.apt.replace(',', ''))}</div>
      <div class="pr">${price}</div>
      <div class="meta">전용 ${Math.round(l.area)}㎡ · 공급 ${esc(l.supply)} · ${esc(l.floor)} · ${esc(l.dir)}</div>
      <div class="memo">${esc(l.memo)} · 입주 ${esc(l.moveIn)}</div>
      <div class="cmp">${cmp}</div></div>`;
  }).join('');
}

// ───────── 지도 ─────────
function initMap() {
  S.map = L.map('map', { zoomControl: true, scrollWheelZoom: false }).setView([37.555, 126.835], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(S.map);
  S.layers.apt = L.layerGroup().addTo(S.map);
}
function renderDongLayer() {
  const c = dongCounts(); const max = Math.max(1, ...Object.values(c));
  S.layers.dong?.remove();
  S.layers.dong = L.geoJSON(S.hjd, {
    style: (f) => {
      const n = f.properties.adm_nm.split(' ').pop(), t = c[n] / max, sel = n === S.dong;
      return { color: sel ? COLORS.red : '#ffffff', weight: sel ? 3 : 1.2, fillColor: COLORS.red, fillOpacity: S.sel ? 0.06 : 0.08 + t * 0.5 };
    },
    onEachFeature: (f, layer) => {
      const n = f.properties.adm_nm.split(' ').pop();
      layer.bindTooltip(`${n}<br>${c[n]}건`, { permanent: !S.sel, direction: 'center', className: 'dong-label' });
      layer.on('click', () => setDong(n === S.dong ? '' : n));
    },
  }).addTo(S.map);
  S.layers.dong.bringToBack();
  if (!S.sel) {
    $('#mapTitle').textContent = `${S.dong || '강서구'} 지도`;
    $('#mapSub').textContent = '행정동별 매매 거래량 (클릭 시 동 선택)';
    const target = S.dong ? S.hjd.features.find((f) => f.properties.adm_nm.endsWith(' ' + S.dong)) : S.hjd;
    S.map.fitBounds(L.geoJSON(target).getBounds(), { padding: [10, 10] });
  }
}
function areaGroups(key) {
  const g = {};
  const put = (r, t) => { const a = Math.floor(r.area); g[a] ??= { area: a, t: null, j: null, w: null }; if (newer(r, g[a][t])) g[a][t] = r; };
  all('trade').filter((r) => r.key === key).forEach((r) => put(r, 't'));
  all('rent').filter((r) => r.key === key).forEach((r) => put(r, r.rent ? 'w' : 'j'));
  return Object.values(g).sort((a, b) => a.area - b.area);
}
const dshort = (s) => s.slice(2).replace(/-/g, '.');
function selectApt(key, opts = {}) {
  const a = S.apts.get(key);
  if (!a) return;
  S.sel = key;
  if (!opts.listing) S.selListing = null;
  renderTop(); renderListings(); renderDongLayer();
  const groups = areaGroups(key);
  S.layers.apt.clearLayers();
  $('#mapTitle').textContent = aptName(a);
  $('#mapSub').textContent = `${a.umd} ${a.jibun} · ${a.hjd || ''}${a.approx ? ' · 위치 근사' : ''}`;
  if (!a.lat) { $('#aptPrices').innerHTML = '<p class="empty">위치 정보를 찾지 못했습니다.</p>'; return; }

  const pop = `<div class="pop"><h4>${esc(aptName(a))}</h4><table>${groups.map((g) => `<tr><td><b>${g.area}㎡</b>(${supplyPy(g.area)}평형)</td>
    <td>${g.t ? `<span class="chip t">매</span>${eok(g.t.price)}` : ''}</td><td>${g.j ? `<span class="chip j">전</span>${eok(g.j.deposit)}` : ''}</td>
    <td>${g.w ? `<span class="chip w">월</span>${wolseStr(g.w)}` : ''}</td></tr>`).join('')}</table></div>`;
  L.circle([a.lat, a.lon], { radius: 500, color: COLORS.red, weight: 1, fillOpacity: 0.04, dashArray: '4 4' }).addTo(S.layers.apt);
  L.circle([a.lat, a.lon], { radius: 1000, color: COLORS.ink, weight: 1, fill: false, dashArray: '2 6' }).addTo(S.layers.apt);
  const ic = (e) => L.divIcon({ html: e, className: 'poi-ic', iconSize: [18, 18] });
  const near = (list, r, e) => list.filter((p) => dist(a.lat, a.lon, p.lat, p.lon) < r).forEach((p) =>
    L.marker([p.lat, p.lon], { icon: ic(e) }).bindTooltip(p.n).addTo(S.layers.apt));
  near(S.poi.subway, 1500, '🚇'); near(S.poi.school, 700, '🏫'); near(S.poi.hospital, 1500, '🏥'); near(S.poi.shop, 1200, '🛍️');
  const m = L.marker([a.lat, a.lon], { zIndexOffset: 1000 }).addTo(S.layers.apt).bindPopup(pop, { maxWidth: 420, autoPan: true });
  S.map.setView([a.lat, a.lon], 15);
  m.openPopup();

  $('#aptPrices').innerHTML = `<h3>평형대별 최근 실거래가 <span class="src">(최근 1년 · 중개거래 우선)</span></h3>
  <table class="tbl pp"><thead><tr><th>전용(공급)</th><th class="num">매매</th><th class="num">전세</th><th class="num">월세</th></tr></thead><tbody>
  ${groups.map((g) => `<tr><td><b>${g.area}㎡</b> <span class="apt-sub">약 ${supplyPy(g.area)}평형</span></td>
    <td class="num">${g.t ? `<b>${eok(g.t.price)}</b><div class="apt-sub">${dshort(g.t.date)} · ${g.t.floor}층${g.t.gbn === '직거래' ? ' · 직거래' : ''}</div>` : '-'}</td>
    <td class="num">${g.j ? `<b>${eok(g.j.deposit)}</b><div class="apt-sub">${dshort(g.j.date)} · ${g.j.floor}층</div>` : '-'}</td>
    <td class="num">${g.w ? `<b>${wolseStr(g.w)}</b><div class="apt-sub">${dshort(g.w.date)} · ${g.w.floor}층</div>` : '-'}</td></tr>`).join('')}
  </tbody></table>`;
  renderAnalysis(a);
  if (opts.scroll) $('#map').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ───────── 입지분석 ─────────
function nearest(list, lat, lon, n, pred = () => true) {
  return list.filter(pred).map((p) => ({ ...p, d: dist(lat, lon, p.lat, p.lon) })).sort((a, b) => a.d - b.d).slice(0, n);
}
const li = (name, right, cls = '') => `<li><span class="${cls}">${name}</span><span class="r">${right}</span></li>`;
function renderAnalysis(a) {
  const { lat, lon } = a;
  const P = S.poi;
  const subs = nearest(P.subway, lat, lon, 3);
  const chips = (k) => k.split(',').map((x) => `<span class="line-chip" style="background:${LINE_COLORS[x] || '#777'}">${x}</span>`).join('');
  const schools = ['초', '중', '고'].flatMap((k) => nearest(P.school, lat, lon, 2, (p) => p.k === k));
  const shops = nearest(P.shop, lat, lon, 6);
  const parks = nearest(P.park, lat, lon, 3);
  const hosp = nearest(P.hospital, lat, lon, 5);
  const big = nearest(P.hospital, lat, lon, 1, (p) => p.k === '종합병원')[0];
  const govType = [['구청', /구청|통합신청사/], ['주민센터', /주민센터|행정복지센터/], ['경찰', /경찰서|지구대|파출소/],
    ['소방', /소방/], ['우체국', /우체국/], ['도서관', /도서관/], ['세무서', /세무서/]];
  const gov = govType.map(([t, re]) => [t, nearest(P.gov, lat, lon, 1, (p) => re.test(p.n))[0]]).filter((x) => x[1]);
  const devs = DEV_PLANS.map((p) => ({ ...p, desc: p.d, d: dist(lat, lon, p.lat, p.lon) })).sort((x, y) => x.d - y.d);
  const shop1k = P.shop.filter((p) => dist(lat, lon, p.lat, p.lon) < 1000).length;
  const elem = schools.find((s) => s.k === '초');

  const sum = [];
  if (subs[0]) sum.push(`${subs[0].n} ${subs[0].d < 1500 ? '도보 ' + walk(subs[0].d) + '분' : (subs[0].d / 1000).toFixed(1) + 'km'}${subs[0].d < 600 ? ' 역세권' : ''}`);
  if (elem) sum.push(`${elem.n.replace('서울', '')} 도보 ${walk(elem.d)}분`);
  if (big) sum.push(`${big.n.replace(/\(.*\)/, '')} ${(big.d / 1000).toFixed(1)}km`);
  sum.push(`1km 내 대형상업시설·시장 ${shop1k}곳`);
  if (devs[0].d < 2000) sum.push(`인근 개발호재: ${devs[0].n.split(' (')[0]}`);

  const card = (ic, title, body, score = '') => `<div class="an-card"><h3>${ic} ${title}<span class="score">${score}</span></h3><ul>${body}</ul></div>`;
  $('#analysis').classList.remove('hidden');
  $('#analysis').innerHTML = `
  <div class="an-head"><div><h2>📍 ${esc(aptName(a))} 입지분석</h2>
    <div class="sub">서울 강서구 ${esc(a.umd)} ${esc(a.jibun)} · 행정동 ${esc(a.hjd || '-')} · ${a.by || '-'}년 준공${a.approx ? ' · (위치 근사)' : ''}</div>
    <div class="an-sum">${sum.map((s) => `<span>${esc(s)}</span>`).join('')}</div></div>
    <div class="src">거리: 단지 중심 기준 직선거리, 도보시간은 우회계수 적용 추정치</div></div>
  <div class="an-grid">
    ${card('🚇', '교통', subs.map((s) => li(`${s.n}${chips(s.k)}`, distStr(s.d), s.d < 600 ? 'near' : '')).join('') +
      CBD.map((c) => li(`${c.n} (직선)`, `${(dist(lat, lon, c.lat, c.lon) / 1000).toFixed(1)}km`)).join('') +
      li('주요 간선도로', '공항대로 · 올림픽대로 · 강서로'), subs[0] && subs[0].d < 600 ? '역세권' : '')}
    ${card('🏫', '학군', schools.map((s) => li(`<b>[${s.k}]</b> ${esc(s.n)}`, distStr(s.d), s.k === '초' && s.d < 500 ? 'near' : '')).join('') +
      ACADEMY.map((c) => li(`${c.n}`, `${(dist(lat, lon, c.lat, c.lon) / 1000).toFixed(1)}km`)).join('') +
      li('<span class="apt-sub">배정 학교는 강서양천교육지원청 학구도 확인</span>', ''), elem && elem.d < 500 ? '초품아권' : '')}
    ${card('🛍️', '상권', shops.map((s) => li(esc(s.n), distStr(s.d), s.d < 700 ? 'near' : '')).join('') +
      li('주요 상권', '마곡나루·발산역 · 화곡역 · 강서구청사거리'), `1km 내 ${shop1k}곳`)}
    ${card('🏥', '병원', hosp.map((s) => li(`${esc(s.n)}${s.k === '종합병원' ? ' <span class="apt-sub">종합</span>' : ''}`, distStr(s.d), s.k === '종합병원' && s.d < 2000 ? 'near' : '')).join(''),
      big ? `종합병원 ${(big.d / 1000).toFixed(1)}km` : '')}
    ${card('🏗️', '개발계획', devs.slice(0, 5).map((p) => `<li class="block"><span class="${p.d < 2000 ? 'near' : ''}">${esc(p.n)}</span><span class="st">${esc(p.st)}</span>
      <span class="r" style="float:right">${(p.d / 1000).toFixed(1)}km</span><div class="dd">${p.d < 2000 ? '[인접] ' : ''}${esc(p.desc)}</div></li>`).join(''), '가까운 순')}
    ${card('🏛️', '관공서 · 공원', gov.map(([t, p]) => li(`<b>[${t}]</b> ${esc(p.n)}`, distStr(p.d))).join('') +
      parks.map((p) => li(`<b>[공원]</b> ${esc(p.n)}`, distStr(p.d), p.d < 500 ? 'near' : '')).join(''), parks[0] && parks[0].d < 500 ? '숲세권' : '')}
  </div>`;
}

// ───────── 이벤트 ─────────
function setDong(n) {
  S.dong = n; $('#dong').value = n; S.sel = null; S.selListing = null;
  S.layers.apt.clearLayers(); S.map.closePopup();
  $('#aptPrices').innerHTML = ''; $('#analysis').classList.add('hidden');
  renderAllLocal(); renderKPIs();
}
function renderAllLocal() {
  renderVolume(); renderDongChart(); renderTop(); renderListings(); renderDongLayer();
}
async function apply() {
  S.from = $('#from').value; S.to = $('#to').value;
  if (!S.from || !S.to || S.from > S.to) { setStatus('기간을 올바르게 지정해 주세요.', true); return; }
  const p = prevRange();
  const last12 = (() => { const d = parse(todayISO()); d.setUTCMonth(d.getUTCMonth() - 12); return monthsBetween(iso(d), todayISO()); })();
  const months = [...new Set([...monthsBetween(p.from, S.to), ...last12])].filter((m) => m <= ymOf(todayISO()));
  $('#apply').disabled = true;
  try {
    // 인증키가 없으면 실거래는 건너뛰고 부동산원 지표(파일에 포함)만 표시
    S.noKey = !hasMolitKey();
    showKeyBox(S.noKey);
    let failed = 0;
    if (!S.noKey) {
      failed = await ensureMonths(months);
      if (failed && /SERVICE_KEY|등록되지 않은|인증/i.test(S.lastErr || '')) {
        if (!BUILT_IN_KEY) resetKey();
        $('#keyMsg').textContent = '인증키가 올바르지 않거나 아직 승인되지 않았습니다. 다시 확인해 주세요.';
        S.noKey = true;
      }
    }
    setStatus('지표 계산 중…');
    renderAllLocal();
    await Promise.all([renderKPIs(), renderIndex(), renderSupply()]);
    if (S.sel) selectApt(S.sel);
    const lag = S.to > addDays(todayISO(), -30) ? ' · 최근 30일 거래는 신고기한 내 추가 반영될 수 있습니다.' : '';
    const reb = EMBED ? ` · 부동산원 지표 ${EMBED.rebAsOf} 기준` : '';
    if (S.noKey) setStatus(`부동산원 지표만 표시 중입니다${reb}. 실거래(거래량·TOP 10·실거래가)는 위에 인증키를 입력하면 표시됩니다.`, true);
    else setStatus(`조회기간 ${S.from} ~ ${S.to} (${S.mode === 'week' ? '주간' : '월간'}) · 비교기간 ${p.from} ~ ${p.to}${lag}` +
      reb + (failed ? ` · ${failed}개월 자료 불러오기 실패` : ''), failed > 0);
  } catch (e) {
    setStatus('자료를 불러오지 못했습니다: ' + e.message, true);
  } finally { $('#apply').disabled = false; }
}
function setRange(r) { $('#from').value = r.from; $('#to').value = r.to; }

function bind() {
  $('#dong').onchange = (e) => setDong(e.target.value);
  $('#mode').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    S.mode = b.dataset.v; document.querySelectorAll('#mode button').forEach((x) => x.classList.toggle('on', x === b));
    setRange(defaultRange(S.mode)); apply();
  };
  $('#presets').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const to = todayISO(); let from;
    if (b.dataset.d) from = addDays(to, -(+b.dataset.d - 1));
    else { const d = parse(to); d.setUTCMonth(d.getUTCMonth() - +b.dataset.m); from = addDays(iso(d), 1); }
    setRange({ from, to }); apply();
  };
  $('#apply').onclick = apply;
  $('#print').onclick = () => window.print();
  $('#keySave').onclick = saveKey;
  $('#keyInput').onkeydown = (e) => { if (e.key === 'Enter') saveKey(); };
  if (EMBED && !BUILT_IN_KEY) { $('#keyReset').hidden = false; $('#keyReset').onclick = (e) => { e.preventDefault(); resetKey(); scrollTo(0, 0); }; }
  $('#topTabs').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    S.topKind = b.dataset.v; document.querySelectorAll('#topTabs button').forEach((x) => x.classList.toggle('on', x === b)); renderTop();
  };
  $('#sortBy').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    S.sortBy = b.dataset.v; document.querySelectorAll('#sortBy button').forEach((x) => x.classList.toggle('on', x === b)); renderTop();
  };
  $('#topTbl').onclick = (e) => { const tr = e.target.closest('tr[data-key]'); if (tr) selectApt(tr.dataset.key, { scroll: innerWidth < 1100 }); };
  $('#listings').onclick = (e) => {
    const c = e.target.closest('.lst'); if (!c) return;
    const l = SAMPLE_LISTINGS.find((x) => x.id === c.dataset.id);
    let key = keyByName(l.apt);
    if (!key) { // 최근 실거래가 없는 단지: OSM 좌표로 등록
      const o = matchOSM(l.apt, '');
      if (!o) { setStatus(`${l.apt} 위치를 찾지 못했습니다.`, true); return; }
      key = `${l.apt}||`; S.apts.set(key, { key, apt: l.apt, umd: '', jibun: '', lat: o.lat, lon: o.lon, hjd: o.hjd });
    }
    S.selListing = l.id; selectApt(key, { listing: true, scroll: true });
  };
}

(async function main() {
  setRange(defaultRange('week'));
  bind(); initMap();
  try { await loadStatic(); } catch (e) { setStatus('기본 데이터 로드 실패: ' + e.message, true); return; }
  await apply();
})();
