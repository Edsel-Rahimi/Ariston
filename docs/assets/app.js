/* ARISTON — Mission Control · app.js
   Live data from GitHub data-branch · vanilla JS · RTL-first */
'use strict';

/* ---------------- constants & helpers ---------------- */
const DATA_BASE = 'https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data';
const REPO_URL = 'https://github.com/Edsel-Rahimi/Ariston';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const fmt = n => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const enc = encodeURIComponent;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* brand palette: gold #E8C872 · deep #C9A24A · silver #C0C6CC
   bronze #B87333 · olive #7A8450 · khaki #8A7A55 · sienna #C0654A */
const PROTO_COLORS = {
  vless: '#E8C872', vmess: '#C0C6CC', ss: '#A8946A', ssr: '#8A7A55',
  trojan: '#C9A24A', hy2: '#B87333', hysteria2: '#B87333', hysteria: '#C0654A', tuic: '#C0654A',
};
const ISP_META = {
  irancell: { fa: 'ایرانسل', en: 'IRANCELL' },
  mci: { fa: 'همراه اول', en: 'MCI' },
  tci: { fa: 'مخابرات', en: 'TCI' },
  rightel: { fa: 'رایتل', en: 'RIGHTEL' },
  pishgaman: { fa: 'پیشگامان', en: 'PISHGAMAN' },
  shatel: { fa: 'شاتل', en: 'SHATEL' },
  mobinnet: { fa: 'مبین‌نت', en: 'MOBINNET' },
  asiatech: { fa: 'آسیاتک', en: 'ASIATECH' },
  parsonline: { fa: 'پارس‌آنلاین', en: 'PARSONLINE' },
  respina: { fa: 'رسپینا', en: 'RESPINA' },
  'ir-other': { fa: 'سایر ایران', en: 'IR-OTHER' },
};

/* ---------------- i18n ---------------- */
const I18N = {
  fa: {
    brandSub: 'MISSION CONTROL', live: 'زنده',
    navPipeline: 'خط تولید', navAnalytics: 'تحلیل', navIran: 'اپراتورها', navImport: 'اتصال سریع',
    navExplorer: 'مرورگر گره', navSources: 'منابع', navDownload: 'دانلود',
    heroKicker: '// شبکهٔ رایگان پروکسی — تست دو موتوره، هر ۳۰ دقیقه',
    heroTitle: 'هر نیم‌ساعت، <em>هزاران گره</em> تست می‌شن؛<br>فقط بهترین‌ها می‌مونن.',
    heroDesc: 'هر نیم‌ساعت: جمع می‌کنیم، فیلتر اولیهٔ TCP می‌زنیم، با دو موتور تست می‌کنیم و منتشر می‌کنیم.',
    hcLabel: 'دور بعدی تست',
    probeBatch: '⚡ تست زندهٔ گروهی', sortLat: '↑ مرتب‌سازی: پینگ', sortReset: 'مرتب‌سازی: پیش‌فرض',
    aliveOnly: 'فقط سالم‌ها', probeRun: 'تست', probing: '…', probeDead: 'بی‌پاسخ',
    probeMeta: 'تست زنده از مرورگر خودت — روی پورت‌های TLS', probeDone: 'تست تموم شد',
    kpiAlive: 'گرهٔ سالم', kpiGold: 'ردهٔ طلایی', kpiUnique: 'گرهٔ غیرتکراری در هر دور', kpiSources: 'منبع فعال',
    kpiAliveFoot: 'هر دو موتور تأییدشون کردن', kpiGoldFoot: 'سریع‌ترین و پایدارترین‌ها', kpiUniqueFoot: 'بعد از حذف تکراری‌ها', kpiSourcesFoot: 'توی آخرین دور بدون مشکل بودن',
    bankTitle: 'بانک کانفیگ', bankSub: 'حافظهٔ خط تولید بین اجراها — TTL ۲۸ ساعت',
    bankKnown: 'خوش‌سابقه', bankHit: 'نرخ بازگشت', bankStreak: 'میانگین سابقه', bankPass2: 'نجات دور دوم',
    healthTitle: 'سلامت ۷ روز اخیر — نرخ بازگشت بانک',
    bankHealthy: 'منبع سالم', bankSuspect: 'مشکوک', bankQ: 'قرنطینه', bankFull: 'اسکن کامل شنبه',
    pipelineTitle: 'خط تولید ', pipelineDesc: 'مسیر زندهٔ گره‌ها — هر ذرهٔ نور یه گرهٔ واقعیه.',
    analyticsTitle: 'تحلیل شبکه ', analyticsDesc: 'عددهای همین دور، دست‌نخورده.',
    donutTitle: 'پروتکل‌ها (قبل از فیلتر)', barsTitle: 'سالم‌ها به تفکیک پروتکل', latencyTitle: 'پینگ (ms)', enginesTitle: 'خروجی برای هر اپ',
    enginesNote: 'هر گره با هر دو موتور واقعی تست می‌شه و بعد بسته‌بندی.',
    iranTitle: 'کاوشگر اپراتورهای ایران ', iranScannedSuffix: ' IP بررسی شد',
    importTitle: 'اتصال با یه لمس ', importDesc: 'یه رده انتخاب کن و روی اپت بزن — توی دسکتاپ: کپی یا QR.',
    wireTitle: 'تست پینگ واقعی + کپی با یه کلیک', wirePingAll: 'تست همه', wirePing: 'تست',
    wireNote: 'پینگ از مرورگر خودت اندازه‌گیری می‌شه، پس ممکنه با عددی که سرور ثبت کرده فرق داشته باشه.',
    wireSubs: ['★ ردهٔ طلایی', 'گره‌های سالم', 'کل لیست', 'clash · mihomo', 'sing-box'],
    wireFail: 'بی‌پاسخ',
    qrTitle: 'برای اتصال، اسکن کن', copyLink: 'کپی لینک',
    explorerTitle: 'مرورگر گره ', explorerDesc: 'پینگ واقعی هر گره از آخرین دور + تست زنده. جستجو، فیلتر و کپی.',
    explorerSearch: 'جستجو در تگ، هاست، پروتکل…', explorerLoading: 'در حال بارگذاری لیست گره‌ها…',
    showMore: 'نمایش بیشتر', copyFiltered: 'کپی نتایج فیلترشده (base64)',
    sourcesTitle: 'ماتریس منابع ', sourcesDesc: 'هر نقطه یه منبع؛ قرمز یعنی آخرین دور خطا داشته.',
    sourcesSearch: 'جستجوی شناسهٔ منبع…', legendOk: 'فعال', legendFail: 'خطا',
    downloadTitle: 'مرکز دانلود ', downloadDesc: 'همهٔ خروجی‌های آخرین دور: فایل خام، base64، فرمت مخصوص هر اپ و فایل جدا برای هر پروتکل.',
    faqTitle: 'شفافیت ',
    footerText: 'خط تولید دو موتوره — هر ۳۰ دقیقه، در دقیقهٔ ۰۷ و ۳۷ (UTC).',
    copied: 'کپی شد ✓', copyFail: 'کپی نشد — خودت دستی کپی کن', qrNoLib: 'QR الان در دسترس نیست، ولی لینک کپی شد',
    tierGold: 'طلا', tierValidated: 'تأییدشده', tierAll: 'همهٔ غیرتکراری‌ها',
    subGold: 'فقط ردهٔ طلایی — سریع‌ترین‌ها', subValidated: 'همهٔ گره‌های سالم', subAll: 'کل لیست (بدون تکراری)',
    qrBtn: 'نمایش QR', tapImport: 'باز کردن', copy: 'کپی',
    tipRaw: 'لینک‌های خام، همون‌طور که از منابع اومدن', tipUnique: 'بعد از مرتب‌سازی و حذف تکراری', tipTcp: 'پورت TCP بازی دارن (بقیه توی فیلتر اولیه حذف شدن)', tipProbed: 'با دو موتور واقعی تست شدن', tipAlive: 'تأیید نهایی گرفتن', tipGold: 'سریع و پایدار — ردهٔ طلایی',
    stRaw: 'خام', stUnique: 'غیرتکراری', stTcp: 'پورت باز', stProbed: 'تست‌شده', stAlive: 'سالم', stGold: 'طلا',
    faq: [
      ['چطور اعتبارسنجی می‌شود؟', 'هر گره ابتدا پالایش TCP ارزان می‌گذرد (پورت‌های بسته حذف می‌شوند)، بعد با موتور واقعی xray-core و sing-box تست اتصال و HTTP می‌شود. فقط گره‌هایی که هر دو مرحله را پاس کنند «زنده» می‌شوند و بر اساس تأخیر و پایداری رده‌بندی می‌شوند.'],
      ['رده طلا یعنی چه؟', 'گره‌های طلایی کمترین تأخیر و بالاترین پایداری را در اجراهای اخیر داشته‌اند. اگر فقط یک لینک می‌خواهید، gold.txt را انتخاب کنید؛ برای تنوع بیشتر validated.txt همه گره‌های زنده است.'],
      ['بخش اپراتورها چطور کار می‌کند؟', 'گره‌هایی که IP آن‌ها متعلق به اپراتورهای ایرانی است با جدول ip2asn تشخیص داده می‌شوند و جدا منتشر می‌شوند — برای وقتی که می‌خواهید بدانید کدام کانفیگ روی ایرانسل یا همراه اول کار می‌کند.'],
      ['سلب مسئولیت', 'همه کانفیگ‌ها از منابع عمومی شخص ثالث جمع می‌شوند و بدون هیچ تضمینی ارائه می‌شوند. از این خروجی‌ها فقط برای استفاده شخصی و قانونی استفاده کنید. آریستون هیچ لینکی را نمی‌سازد؛ فقط تست و دسته‌بندی می‌کند.'],
    ],
  },
  en: {
    brandSub: 'MISSION CONTROL', live: 'LIVE',
    navPipeline: 'Pipeline', navAnalytics: 'Analytics', navIran: 'Operators', navImport: 'One-tap',
    navExplorer: 'Node Explorer', navSources: 'Sources', navDownload: 'Download',
    heroKicker: '// FREE PROXY NETWORK — HOURLY DUAL-ENGINE VALIDATION',
    heroTitle: 'Thousands of nodes tested <em>every hour</em> —<br>only the best survive here.',
    heroDesc: 'Ariston harvests configs from hundreds of sources hourly, validates every node with two real engines — xray-core and sing-box — and publishes Gold / Silver / Bronze tiers. This page is the live picture of that network.',
    kpiAlive: 'Alive nodes', kpiGold: 'Gold tier', kpiUnique: 'Unique / run', kpiSources: 'Active sources',
    kpiAliveFoot: 'verified by both engines', kpiGoldFoot: 'fastest & most stable', kpiUniqueFoot: 'after full dedup', kpiSourcesFoot: 'no errors in last run',
    bankTitle: 'Config bank', bankSub: 'pipeline memory between runs — TTL 28h',
    bankKnown: 'known-good', bankHit: 'hit rate', bankStreak: 'avg streak', bankPass2: 'pass-2 rescued',
    healthTitle: 'Last 7 days — bank hit rate',
    bankHealthy: 'healthy sources', bankSuspect: 'suspect', bankQ: 'quarantined', bankFull: 'Saturday full scan',
    pipelineTitle: 'The Pipeline ', pipelineDesc: 'The live data path — light particles are real nodes.',
    analyticsTitle: 'Network analytics ', analyticsDesc: 'This run, measured — nothing in between.',
    donutTitle: 'Protocols — raw', barsTitle: 'Alive by protocol', latencyTitle: 'Latency (ms)', enginesTitle: 'Client exports',
    enginesNote: 'Every node is tested and packaged by two real engines.',
    iranTitle: 'Iran ISP explorer ', iranScannedSuffix: ' IPs scanned',
    importTitle: 'One-tap import ', importDesc: 'Pick a tier, tap a client — desktop: copy.',
    wireTitle: 'Browser ping + one-tap copy', wirePingAll: 'ping all', wirePing: 'ping',
    wireNote: 'Latency is measured from your browser — it differs from server-side numbers depending on your network.',
    wireSubs: ['gold tier', 'alive nodes', 'full pool', 'clash · mihomo', 'sing-box'],
    wireFail: 'no reply',
    qrTitle: 'Scan to import', copyLink: 'Copy link',
    explorerTitle: 'Node explorer ', explorerDesc: 'Real per-node latency from the last run + live probing. Search, filter, copy.',
    explorerSearch: 'Search tag, host, protocol…', explorerLoading: 'Fetching node list…',
    showMore: 'Show more', copyFiltered: 'Copy filtered as base64',
    sourcesTitle: 'Source matrix ', sourcesDesc: 'One dot per source; red = errored.',
    sourcesSearch: 'Search source id…', legendOk: 'healthy', legendFail: 'failed',
    downloadTitle: 'Download center ', downloadDesc: 'Every export of the latest run — raw lists, base64, client formats and per-protocol splits.',
    faqTitle: 'Transparency ',
    footerText: 'Dual-engine pipeline — every 30 minutes at :07 and :37 UTC.',
    copied: 'Copied ✓', copyFail: 'Copy failed — copy manually', qrNoLib: 'QR unavailable — link copied instead',
    tierGold: 'Gold', tierValidated: 'Validated', tierAll: 'All unique',
    subGold: 'gold tier only — the fastest', subValidated: 'every alive node', subAll: 'the full unique pool',
    qrBtn: 'Show QR', tapImport: 'open', copy: 'copy',
    tipRaw: 'raw URIs from sources', tipUnique: 'after normalize + dedup', tipTcp: 'with open TCP port (rest cheaply culled)', tipProbed: 'real-tested by two engines', tipAlive: 'final verified', tipGold: 'fast & stable — gold tier',
    stRaw: 'RAW', stUnique: 'UNIQUE', stTcp: 'TCP OPEN', stProbed: 'PROBED', stAlive: 'ALIVE', stGold: 'GOLD',
    faq: [
      ['How does validation work?', 'Every node first passes a cheap TCP prefilter (closed ports are culled), then a real connection + HTTP test through actual xray-core and sing-box engines. Only nodes passing both stages count as alive, then they are tiered by latency and stability.'],
      ['What does Gold mean?', 'Gold nodes had the lowest latency and best stability across recent runs. If you want a single link, pick gold.txt; for more variety validated.txt contains every alive node.'],
      ['How does the operator section work?', 'Nodes whose IP belongs to Iranian ISPs are detected via a live ip2asn table and published separately — useful when you need to know which config works on Irancell or MCI.'],
      ['Disclaimer', 'All configs are collected from public third-party sources and provided as-is, with no warranty. Use them only for personal, lawful purposes. Ariston does not create any links; it only tests and organizes them.'],
    ],
  },
};
let lang = localStorage.getItem('ariston-lang') || 'fa';
const t = k => (I18N[lang] && I18N[lang][k]) ?? I18N.fa[k] ?? k;

/* ---------------- state ---------------- */
let S = null;            // stats.json
let pipelineStages = []; // [{key,label,val,tip,end}]
let shownTimer = null;

async function fetchText(url) {
  const r = await fetch(url + '?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}
async function fetchJSON(url) {
  return JSON.parse(await fetchText(url));
}

/* ---------------- toast & clipboard ---------------- */
let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 1900);
}
async function copyText(txt) {
  try { await navigator.clipboard.writeText(txt); toast(t('copied')); return true; }
  catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
      toast(t('copied')); return true;
    } catch (e2) { toast(t('copyFail')); return false; }
  }
}

/* ---------------- stats loading ---------------- */
async function loadStats() {
  try {
    S = await fetchJSON(DATA_BASE + '/stats.json');
    renderDynamic();
  } catch (e) {
    console.error('stats load failed', e);
    $('#tickerTrack').innerHTML = '<span>DATA BRANCH UNREACHABLE — retrying in 60s…</span>';
    setTimeout(loadStats, 60000);
  }
}

function stageDefs() {
  const v = S.validation || {};
  const pf = S.prefilter || {};
  const sc = S.scoring || {};
  return [
    { key: 'raw', val: S.raw, label: t('stRaw'), tip: `${fmt(S.raw)} ${t('tipRaw')}` },
    { key: 'unique', val: S.unique, label: t('stUnique'), tip: `${fmt(S.unique)} ${t('tipUnique')}` },
    { key: 'tcp', val: pf.output, label: t('stTcp'), tip: `${fmt(pf.tcp_closed ?? 0)} culled · ${fmt(pf.output)} ${t('tipTcp')}` },
    { key: 'probed', val: v.probed, label: t('stProbed'), tip: `${fmt(v.probed)} ${t('tipProbed')}` },
    { key: 'alive', val: v.alive, label: t('stAlive'), tip: `${fmt(v.alive)} ${t('tipAlive')}` },
    { key: 'gold', val: sc.gold, label: t('stGold'), tip: `${fmt(sc.gold)} ${t('tipGold')}`, end: true },
  ];
}

/* ---------------- render: KPIs / ticker / countdown ---------------- */
function countUp(el, target) {
  if (REDUCED) { el.textContent = fmt(target); return; }
  const start = performance.now(), dur = 900;
  function step(tn) {
    const p = Math.min(1, (tn - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(Math.round((target || 0) * eased));
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function renderKPIs() {
  const v = S.validation || {}, sc = S.scoring || {};
  countUp($('#kpiAlive'), v.alive);
  countUp($('#kpiGold'), sc.gold);
  countUp($('#kpiUnique'), S.unique);
  countUp($('#kpiSources'), S.sources_ok);
  const failedMap = S.sources_failed && typeof S.sources_failed === 'object' ? S.sources_failed : {};
  const failed = Object.values(failedMap).filter(val => val && val !== 'skipped').length;   // reserve pool ≠ failure
  $('#kpiAliveFoot').textContent = `${fmt(v.probed)} probed · p50 ${(v.latency_ms && v.latency_ms.p50) || '—'}ms`;
  $('#kpiGoldFoot').textContent = `${fmt(sc.silver)} silver · ${fmt(sc.bronze)} bronze`;
  $('#kpiUniqueFoot').textContent = `${fmt(S.raw)} raw harvested`;
  $('#kpiSourcesFoot').textContent = failed ? `${failed} failed in last run` : t('kpiSourcesFoot');
}

function relativeAgo(iso) {
  const d = new Date(iso);
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (lang === 'fa') return mins < 60 ? `${mins} دقیقه پیش` : `${Math.round(mins / 60)} ساعت پیش`;
  return mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
}

function renderTicker() {
  const v = S.validation || {}, pf = S.prefilter || {}, sc = S.scoring || {};
  const seg = `RUN <i>${(S.generated_at || '').replace('T', ' ').slice(0, 16)}Z</i>` +
    ` · SOURCES <b>${fmt(S.sources_ok)}/${fmt(S.sources_total)}</b>` +
    ` · RAW <b>${fmt(S.raw)}</b> → UNIQUE <b>${fmt(S.unique)}</b>` +
    ` · TCP CULLED <b>${fmt(pf.tcp_closed)}</b>` +
    ` · PROBED <b>${fmt(v.probed)}</b> → ALIVE <b>${fmt(v.alive)}</b>` +
    ` · GOLD/SILVER/BRONZE <b>${fmt(sc.gold)}/${fmt(sc.silver)}/${fmt(sc.bronze)}</b>` +
    ` · P50 <b>${(v.latency_ms && v.latency_ms.p50) || '—'}ms</b> · `;
  $('#tickerTrack').innerHTML = `<span>${seg}</span><span aria-hidden="true">${seg}</span>`;
}

function tickCountdown() {
  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0, 0);
  const m = next.getMinutes();
  if (m >= 37) { next.setHours(next.getHours() + 1); next.setMinutes(7, 0, 0); }
  else next.setMinutes(m < 7 ? 7 : 37, 0, 0);
  const s = Math.floor((next - now) / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  const dig = $('#hcDigits');
  if (dig) dig.textContent = `${mm}:${ss}`;
  const ring = $('#hcRing');
  if (ring) {
    const C = 2 * Math.PI * 51;
    ring.style.strokeDashoffset = (C * (1 - s / 1800)).toFixed(1);   // 30-minute wheel
  }
}

/* ---------------- render: pipeline ---------------- */
function renderPipeline() {
  pipelineStages = stageDefs();
  const wrap = $('#pipelineStages');
  wrap.innerHTML = '';
  pipelineStages.forEach((st, i) => {
    const div = document.createElement('div');
    div.className = 'pstage' + (st.end ? ' pstage--end' : '');
    div.innerHTML = `<div class="pstage__node"></div><div class="pstage__val" data-stage="${i}">${fmt(st.val)}</div>
      <div class="pstage__label">${st.label}</div><div class="pstage__tip">${st.tip}</div>`;
    wrap.appendChild(div);
  });
  $$('#pipelineStages .pstage__val').forEach((el, i) => countUp(el, (pipelineStages[i] && pipelineStages[i].val) || 0));
  $('#pipelineLegend').innerHTML =
    `<span><b>1</b> collect → <b>2</b> normalize+dedup → <b>3</b> tcp prefilter → <b>4</b> dual-engine probe → <b>5</b> verify → <b>6</b> gold tier</span>`;
  PipelineFX.setStages(pipelineStages.map(s => s.val));
}

/* pipeline particle canvas */
const PipelineFX = (() => {
  const cv = $('#pipelineCanvas');
  const ctx = cv.getContext('2d');
  let vals = [1, 1, 1, 1, 1, 1];
  let W = 0, H = 0, dpr = 1, parts = [], raf = null, visible = false;

  function resize() {
    const r = cv.parentElement.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function stageX(i) { return W * (0.055 + i * (0.89 / 5)); }
  function bandY(i) {
    const ratio = Math.sqrt((vals[i] || 1) / (vals[0] || 1));
    const half = Math.max(7, Math.min(H * 0.30, H * 0.30 * Math.max(ratio, 0.06)));
    return { cy: H * 0.42, half };
  }
  function spawn() {
    return { x: -6, y: H * 0.42 + (Math.random() - 0.5) * 2 * bandY(0).half, v: 0.55 + Math.random() * 0.85, r: 0.8 + Math.random() * 1.5, a: 0.35 + Math.random() * 0.5 };
  }
  function frame() {
    ctx.fillStyle = 'rgba(20,17,12,0.20)';
    ctx.fillRect(0, 0, W, H);
    // guide channel
    ctx.strokeStyle = 'rgba(74,63,39,0.55)';
    ctx.lineWidth = 1;
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const { cy, half } = bandY(i);
        const y = cy + sgn * half;
        i ? ctx.lineTo(stageX(i), y) : ctx.moveTo(stageX(0), y);
      }
      ctx.stroke();
    }
    // stage ticks
    for (let i = 0; i < 6; i++) {
      const { cy, half } = bandY(i);
      ctx.strokeStyle = i === 5 ? 'rgba(232,200,114,0.55)' : 'rgba(192,198,204,0.3)';
      ctx.beginPath();
      ctx.moveTo(stageX(i), cy - half - 4); ctx.lineTo(stageX(i), cy + half + 4);
      ctx.stroke();
    }
    // particles
    if (parts.length < 150 && Math.random() < 0.5) parts.push(spawn());
    ctx.globalCompositeOperation = 'lighter';
    parts = parts.filter(p => {
      p.x += p.v * 1.9;
      // stage crossing death
      for (let i = 1; i < 6; i++) {
        const gx = stageX(i);
        if (p.x >= gx && p.x - p.v * 1.9 < gx) {
          const survive = (vals[i] || 1) / (vals[i - 1] || 1);
          if (Math.random() > survive) { p.a *= 0.25; p.v *= 0.4; }
        }
      }
      // keep inside band
      const { cy, half } = bandY(Math.min(5, Math.floor((p.x / W) * 5.6)));
      if (Math.abs(p.y - cy) > half) p.y += (cy - p.y) * 0.04 + (Math.random() - 0.5) * 1.1;
      const gold = p.x > stageX(5) - 30;
      ctx.fillStyle = gold ? `rgba(232,200,114,${p.a})` : `rgba(192,198,204,${p.a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 7);
      ctx.fill();
      return p.x < W + 8 && p.a > 0.03;
    });
    ctx.globalCompositeOperation = 'source-over';
    raf = requestAnimationFrame(frame);
  }
  function start() {
    resize();
    parts = [];
    ctx.fillStyle = 'rgba(20,17,12,1)';
    ctx.fillRect(0, 0, W, H);
    if (REDUCED) { // static render
      cancelAnimationFrame(raf);
      ctx.fillStyle = 'rgba(20,17,12,1)'; ctx.fillRect(0, 0, W, H);
      frameStatic(); return;
    }
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function frameStatic() {
    ctx.strokeStyle = 'rgba(192,198,204,0.3)';
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const { cy, half } = bandY(i);
        const y = cy + sgn * half;
        i ? ctx.lineTo(stageX(i), y) : ctx.moveTo(stageX(0), y);
      }
      ctx.stroke();
    }
  }
  addEventListener('resize', () => { if (S) start(); });
  new IntersectionObserver(es => {
    visible = es[0].isIntersecting;
    if (!visible && raf) { cancelAnimationFrame(raf); raf = null; }
    else if (visible && !raf && !REDUCED) raf = requestAnimationFrame(frame);
  }, { threshold: 0.05 }).observe(cv.parentElement);
  return { setStages(v) { vals = v; start(); }, start };
})();

/* ---------------- render: analytics ---------------- */
function renderDonut() {
  const bp = S.by_protocol || {};
  const entries = Object.entries(bp).sort((a, b) => b[1] - a[1]);
  const top = entries.slice(0, 6);
  const rest = entries.slice(6).reduce((s, e) => s + e[1], 0);
  if (rest > 0) top.push(['other', rest]);
  const total = entries.reduce((s, e) => s + e[1], 0) || 1;
  const svg = $('#donutSvg');
  const C = 2 * Math.PI * 15.9;
  let off = 0;
  let rings = '';
  const palette = ['#E8C872', '#C0C6CC', '#A8946A', '#C9A24A', '#B87333', '#C0654A', '#6E5F42'];
  top.forEach((e, i) => {
    const frac = e[1] / total;
    const len = frac * C;
    rings += `<circle r="15.9" cx="21" cy="21" fill="none" stroke="${e[0] === 'other' ? '#6E5F42' : (PROTO_COLORS[e[0]] || palette[i])}"
      stroke-width="4.6" stroke-dasharray="${Math.max(0, len - 0.6)} ${C - len + 0.6}" stroke-dashoffset="${-off}" stroke-linecap="butt"/>`;
    off += len;
  });
  rings += `<text class="donut-hole" x="21" y="20.4" text-anchor="middle" fill="#F3ECDD" font-size="4.6" font-weight="600" font-family="Cinzel, Georgia, serif" transform="rotate(90 21 21)">${fmt(total)}</text>
    <text x="21" y="25.4" text-anchor="middle" fill="#83734F" font-size="2.4" transform="rotate(90 21 21)">RAW</text>`;
  svg.innerHTML = rings;
  countUp($('#donutTotal'), total);
  $('#donutLegend').innerHTML = top.map((e, i) =>
    `<div class="donut-legend__item"><span class="donut-legend__sw" style="background:${e[0] === 'other' ? '#6E5F42' : (PROTO_COLORS[e[0]] || palette[i])}"></span>
     <span>${e[0]}</span><span class="donut-legend__v">${fmt(e[1])}</span></div>`).join('');
  // draw-in animation, staggered per segment
  requestAnimationFrame(() => {
    $$('#donutSvg circle').forEach((c, i) => {
      const target = c.getAttribute('stroke-dasharray');
      if (!target || REDUCED) return;
      c.animate([{ strokeDasharray: `0.01 ${C}` }, { strokeDasharray: target }],
        { duration: 950, delay: i * 95, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'both' });
    });
  });
}

function renderBars() {
  const ba = (S.validation && S.validation.by_protocol_alive) || {};
  const entries = Object.entries(ba).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(e => e[1]));
  const total = entries.reduce((s, e) => s + e[1], 0);
  countUp($('#barsTotal'), total);
  $('#aliveBars').innerHTML = entries.map(([k, v]) =>
    `<div class="hbar"><span class="hbar__label">${k}</span>
     <div class="hbar__track"><div class="hbar__fill" data-w="${(v / max * 100).toFixed(1)}" style="background:${PROTO_COLORS[k] || '#C0C6CC'}"></div></div>
     <span class="hbar__val">${fmt(v)}</span></div>`).join('') || '<span class="panel__chip">—</span>';
  requestAnimationFrame(() => $$('#aliveBars .hbar__fill').forEach((f, i) => {
    f.style.transitionDelay = REDUCED ? '0ms' : `${i * 80}ms`;
    f.style.width = f.dataset.w + '%';
  }));
}

function setGauge(svgId, valId, ms, maxRef) {
  const frac = Math.min(1, (ms || 0) / maxRef);
  const r = 40, cx = 50, cy = 50;
  const startA = Math.PI, endA = Math.PI + frac * Math.PI;
  const x2 = cx + r * Math.cos(endA), y2 = cy + r * Math.sin(endA);
  const large = frac > 0.5 ? 1 : 0;
  const col = frac < 0.55 ? '#7A8450' : frac < 0.8 ? '#B87333' : '#C0654A';
  $(svgId).innerHTML = `
    <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="rgba(201,162,74,0.18)" stroke-width="7" stroke-linecap="round"/>
    <path d="M ${cx - r} ${cy} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}" fill="none" stroke="${col}" stroke-width="7" stroke-linecap="round"/>
    <line x1="${cx}" y1="${cy}" x2="${cx + r + 4}" y2="${cy}" stroke="rgba(201,162,74,0.3)" stroke-width="1.5"/>`;
  const sweepC = Math.PI * r;
  const seg = $(svgId).querySelectorAll('path')[1];
  if (seg && !REDUCED) seg.animate(
    [{ strokeDasharray: `0.1 ${sweepC}` }, { strokeDasharray: `${(frac * sweepC).toFixed(1)} ${sweepC}` }],
    { duration: 1100, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'both' });
  $(valId).textContent = ms != null ? Math.round(ms) : '—';
  $(valId).style.color = col;
}

function renderLatency() {
  const lm = (S.validation && S.validation.latency_ms) || {};
  const maxRef = 1500;
  setGauge('#gaugeP50', '#gaugeP50Val', lm.p50, maxRef);
  setGauge('#gaugeP80', '#gaugeP80Val', lm.p80, maxRef);
  const rows = [
    ['min', lm.min], ['avg', lm.avg], ['p50', lm.p50], ['p80', lm.p80],
  ];
  $('#latencyRows').innerHTML = rows.map(([k, v]) =>
    `<div class="mini-row"><span>${k}</span><b>${v != null ? Math.round(v) + ' ms' : '—'}</b></div>`).join('');
  const en = (S.validation && S.validation.engines) || {};
  $('#enginesChip').textContent = `xray ${en.xray || '—'} · sing-box ${en.sing_box || '—'}`;
}

function renderEngines() {
  const cl = S.clients || {};
  const v = S.validation || {};
  const rows = [
    { name: 'mihomo', ok: cl.mihomo ? cl.mihomo.built : 0, tot: (cl.mihomo ? cl.mihomo.built + cl.mihomo.skipped : 0) || (v.alive || 1), col: '#C0C6CC' },
    { name: 'sing-box', ok: cl.singbox ? cl.singbox.built : 0, tot: (cl.singbox ? cl.singbox.built + cl.singbox.skipped : 0) || (v.alive || 1), col: '#E8C872' },
  ];
  $('#engineRows').innerHTML = rows.map(r =>
    `<div class="engine-row"><span class="engine-row__name">${r.name}</span>
     <div class="engine-row__track"><div class="engine-row__fill" data-w="${(r.ok / r.tot * 100).toFixed(1)}" style="background:${r.col}"></div></div>
     <span class="engine-row__val" style="color:${r.col}">${fmt(r.ok)}</span></div>`).join('');
  requestAnimationFrame(() => $$('#engineRows .engine-row__fill').forEach((f, i) => {
    f.style.transitionDelay = REDUCED ? '0ms' : `${i * 90}ms`;
    f.style.width = f.dataset.w + '%';
  }));
}

/* ---------------- render: IR ISP ---------------- */
function renderISP() {
  const op = (S.operators && S.operators.by_slug) || {};
  const order = ['irancell', 'mci', 'tci', 'rightel', 'pishgaman', 'shatel', 'mobinnet', 'asiatech', 'parsonline', 'respina', 'ir-other'];
  const keys = [...order, ...Object.keys(op).filter(k => !order.includes(k))];
  $('#ispGrid').innerHTML = keys.map(k => {
    const m = ISP_META[k] || { fa: k, en: k.toUpperCase() };
    const name = lang === 'fa' ? m.fa : m.en;
    const sub = lang === 'fa' ? m.en : m.fa;
    return `<div class="isp rv">
      <div class="isp__fa">${name}</div><div class="isp__en">${sub}</div>
      <div class="isp__val">${fmt(op[k])}</div>
      <div class="isp__actions">
        <button class="isp__btn" data-isp-copy="${k}" aria-label="copy ${k} list">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
          <span>${t('copy')}</span></button>
        <a class="isp__btn" href="${DATA_BASE}/by-operator/${k}.txt" target="_blank" rel="noopener" aria-label="download ${k} list">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/></svg>
          <span>.txt</span></a>
      </div></div>`;
  }).join('');
  $('#iranScanned').textContent = fmt(S.operators && S.operators.ip_literal_hosts);
  $$('#ispGrid .isp__val').forEach(el => countUp(el, +el.textContent.replace(/[^\d]/g, '') || 0));
  $$('[data-isp-copy]').forEach(b => b.addEventListener('click', async () => {
    const k = b.dataset.ispCopy;
    try { const txt = await fetchText(`${DATA_BASE}/by-operator/${k}.txt`); copyText(txt.trim()); }
    catch (e) { toast(t('copyFail')); }
  }));
}

/* ---------------- render: one-tap import ---------------- */
const TIERS = [
  { id: 'gold', file: 'gold.txt', cls: 'is-gold' },
  { id: 'validated', file: 'validated.txt', cls: '' },
  { id: 'all', file: 'nodes.txt', cls: '' },
];
const CLIENTS = [
  { name: 'v2rayNG', sub: 'Android', logo: 'V2', col: '#C0C6CC', link: u => `v2rayng://install-sub?url=${enc(u)}`, target: 'tier' },
  { name: 'V2Box', sub: 'iOS', logo: 'VB', col: '#E8C872', link: u => `v2box://install-sub?url=${enc(u)}`, target: 'tier' },
  { name: 'Hiddify', sub: 'Android · iOS', logo: 'H', col: '#8A7A55', link: u => `hiddify://import/${enc(u)}`, target: 'tier' },
  { name: 'Streisand', sub: 'iOS · macOS', logo: 'S', col: '#B87333', link: u => `streisand://import/${enc(u)}`, target: 'tier' },
  { name: 'sing-box', sub: 'all platforms', logo: 'SB', col: '#E8C872', link: () => `sing-box://import-remote-profile?url=${enc(DATA_BASE + '/singbox.json')}`, target: 'singbox' },
  { name: 'Clash Meta', sub: 'mihomo core', logo: 'CM', col: '#C9A24A', link: () => `clash://install-config?url=${enc(DATA_BASE + '/mihomo.yaml')}`, target: 'mihomo' },
];
let curTier = 'validated';

function tierURL(id) {
  const tier = TIERS.find(x => x.id === id) || TIERS[1];
  return `${DATA_BASE}/${tier.file}`;
}
function renderImport() {
  $('#tierSelect').innerHTML = TIERS.map(x =>
    `<button class="tier-chip ${x.cls} ${x.id === curTier ? 'is-active' : ''}" data-tier="${x.id}" role="tab" aria-selected="${x.id === curTier}">
      <span class="tier-chip__sw"></span>${t('tier' + x.id.charAt(0).toUpperCase() + x.id.slice(1).replace('validated', 'Validated').replace('all', 'All'))}</button>`).join('') +
    `<button class="tier-chip" id="qrBtn" type="button">${t('qrBtn')}</button>`;
  const url = tierURL(curTier);
  $('#targetUrl').textContent = url;
  $('#clientGrid').innerHTML = CLIENTS.map(c => {
    const href = c.target === 'tier' ? c.link(url) : c.link();
    return `<a class="client rv is-in" href="${href}" data-client="${c.name}" data-url="${href}">
      <span class="client__logo" style="background:${c.col}1f;color:${c.col};border:1px solid ${c.col}44">${c.logo}</span>
      <span><span class="client__name">${c.name}</span><br><span class="client__sub">${c.sub}</span></span>
      <span class="client__copy mono">copy</span>
      <span class="client__go"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14m0 0-6-6m6 6-6 6"/></svg></span></a>`;
  }).join('');
  $$('#tierSelect [data-tier]').forEach(b => b.addEventListener('click', () => { curTier = b.dataset.tier; renderImport(); }));
  $('#qrBtn').addEventListener('click', () => openQR(tierURL(curTier)));
  $$('#clientGrid .client').forEach(a => a.addEventListener('click', e => {
    // mobile: let the deep link fire; desktop: copy instead
    if (matchMedia('(hover:hover) and (pointer:fine)').matches) {
      e.preventDefault();
      copyText(a.dataset.url);
    }
  }));
}

/* QR modal */
function openQR(url) {
  const modal = $('#qrModal');
  $('#qrTarget').textContent = url;
  const holder = $('#qrCanvas');
  if (typeof qrcode === 'function') {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      holder.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch (e) { holder.innerHTML = ''; }
  } else {
    copyText(url);
    toast(t('qrNoLib'));
    return;
  }
  if (typeof modal.showModal === 'function') modal.showModal();
  else modal.setAttribute('open', '');
}
function closeQR() { const m = $('#qrModal'); m.close ? m.close() : m.removeAttribute('open'); }

/* ---------------- wire test — browser ping + one-tap copy ---------------- */
const WIRE_FILES = ['gold.txt', 'validated.txt', 'nodes.txt', 'mihomo.yaml', 'singbox.json'];
const wireState = {};          // file → ms | null | 'run'

async function pingFile(file) {
  const t0 = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${DATA_BASE}/${file}?t=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
    return r.ok ? Math.round(performance.now() - t0) : null;
  } catch (e) { return null; }
  finally { clearTimeout(timer); }
}

function wireClass(ms) {
  if (ms == null) return 'is-fail';
  if (ms < 600) return 'is-fast';
  if (ms < 1500) return 'is-ok';
  return 'is-slow';
}
function wireMsText(ms) {
  if (ms === 'run') return '…';
  if (ms == null) return t('wireFail');
  return ms + ' ms';
}

function renderWire() {
  const subs = t('wireSubs');
  $('#wireRows').innerHTML = WIRE_FILES.map((f, i) => {
    const ms = wireState[f];
    const cls = ms === 'run' || ms === undefined ? '' : wireClass(ms);
    return `<div class="wire-row ${cls}" data-wire="${f}">
      <span class="wire-row__dot" aria-hidden="true"></span>
      <span class="wire-row__name mono">${f}</span>
      <span class="wire-row__sub">${(subs && subs[i]) || ''}</span>
      <span class="wire-row__ms mono">${wireMsText(ms)}</span>
      <button class="wire-row__btn" data-act="ping" ${ms === 'run' ? 'disabled' : ''}>${t('wirePing')}</button>
      <button class="wire-row__btn" data-act="copy">${t('copy')}</button>
    </div>`;
  }).join('');
  updateWireChip();
  $$('#wireRows [data-act="ping"]').forEach(b => b.addEventListener('click', () => runPing(b.closest('[data-wire]').dataset.wire)));
  $$('#wireRows [data-act="copy"]').forEach(b => b.addEventListener('click', () => copyText(`${DATA_BASE}/${b.closest('[data-wire]').dataset.wire}`)));
}

function updateWireChip() {
  const chip = $('#wireChip');
  const done = WIRE_FILES.filter(f => wireState[f] !== undefined && wireState[f] !== 'run');
  if (!done.length) { chip.textContent = '—'; return; }
  const ok = done.filter(f => wireState[f] != null);
  chip.textContent = lang === 'fa' ? `${ok.length} از ${done.length} سالم` : `${ok.length}/${done.length} ok`;
}

async function runPing(file) {
  wireState[file] = 'run';
  const row = document.querySelector(`[data-wire="${file}"]`);
  if (row) {
    row.className = 'wire-row';
    row.querySelector('.wire-row__ms').textContent = '…';
    const b = row.querySelector('[data-act="ping"]');
    if (b) b.disabled = true;
  }
  const ms = await pingFile(file);
  wireState[file] = ms;
  if (row) {
    row.classList.add(wireClass(ms));
    row.querySelector('.wire-row__ms').textContent = wireMsText(ms);
    const b = row.querySelector('[data-act="ping"]');
    if (b) b.disabled = false;
  }
  updateWireChip();
}

async function pingAll(stagger = 220) {
  for (const f of WIRE_FILES) { runPing(f); await new Promise(r => setTimeout(r, stagger)); }
}

function initWire() {
  renderWire();
  $('#wireAll').addEventListener('click', () => pingAll(120));
  let auto = false;
  const io = new IntersectionObserver(es => {
    if (es[0].isIntersecting && !auto) { auto = true; pingAll(280); io.disconnect(); }
  }, { threshold: 0.3 });
  io.observe($('#wirePanel'));
}

/* ---------------- render: node explorer ---------------- */
const Explorer = (() => {
  let loaded = false, loading = false, joining = false;
  let nodes = [];          // {uri, proto, host, port, tag, gold, rec, probe, probeMs}
  let results = null;      // results.json (server-measured history)
  let filterProto = 'all', filterGold = false, q = '';
  let shown = 120, sortByLat = false, aliveOnly = false;

  const PROTO_RE = /^(vmess|vless|trojan|ss|ssr|hysteria2|hy2|hysteria|tuic):\/\//i;
  const TLS_PORTS = new Set([443, 2053, 2083, 2087, 2096, 8443, 4433, 2052, 2082, 2086, 2095]);

  function parseLine(uri, gold) {
    const m = uri.match(PROTO_RE);
    if (!m) return null;
    const proto = m[1].toLowerCase();
    let host = '', tag = '';
    try {
      if (proto === 'vmess') {
        const b64 = uri.slice(8).split('#')[0];
        const json = JSON.parse(decodeURIComponent(escape(atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '=')))));
        host = (json.add || '') + ':' + (json.port || '');
        tag = json.ps || json.remarks || '';
      } else {
        const rest = uri.slice(proto.length + 3);
        const noTag = rest.split('#')[0];
        const atIdx = noTag.lastIndexOf('@');
        const hostPart = atIdx >= 0 ? noTag.slice(atIdx + 1).split(/[/?]/)[0] : noTag.split(/[/?]/)[0];
        host = hostPart.includes(':') ? hostPart.replace(/^\[|\]$/g, '') : hostPart;
        const hash = rest.split('#')[1];
        tag = hash ? decodeURIComponent(hash) : '';
      }
    } catch (e) { /* keep raw */ }
    const port = host.includes(':') ? parseInt(host.split(':').pop(), 10) : 443;
    return { uri, proto, host, port, tag, gold, rec: null, probe: null, probeMs: null };
  }

  /* ---- server-measured history: sha256(uri)[:16] → results.json ---- */
  async function ensureResults() {
    if (results !== null) return results;
    try { results = await fetchJSON(DATA_BASE + '/results.json'); }
    catch (e) { results = false; }
    return results;
  }
  async function uriKey(uri) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(uri));
      return [...new Uint8Array(buf)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) { return null; }
  }
  async function attachRecs() {
    if (joining) return;
    joining = true;
    const res = await ensureResults();
    if (res) {
      for (const n of nodes) {
        const k = await uriKey(n.uri);
        n.rec = (k && res[k]) || null;
      }
      if (loaded) { renderFilters(); renderList(); }
    }
    joining = false;
  }

  async function ensure() {
    if (loaded || loading) return;
    loading = true;
    const listEl = $('#explorerList');
    try {
      const [val, gold] = await Promise.all([fetchText(DATA_BASE + '/validated.txt'), fetchText(DATA_BASE + '/gold.txt')]);
      const goldSet = new Set(gold.trim().split('\n').map(l => l.trim()));
      nodes = val.trim().split('\n').map(l => l.trim()).filter(Boolean)
        .map(l => parseLine(l, goldSet.has(l))).filter(Boolean);
      loaded = true;
      renderFilters(); renderList();
      attachRecs();   // lazy: real per-node latency from the last server run
    } catch (e) {
      listEl.innerHTML = `<div class="explorer__loading">⚠ ${e.message} — <button class="fchip" id="exRetry">retry</button></div>`;
      const b = $('#exRetry'); if (b) b.addEventListener('click', () => { loading = false; ensure(); });
    } finally { loading = false; }
  }

  /* ---- health / latency helpers ---- */
  function latencyOf(n) {
    if (n.probe === 'done') return n.probeMs;
    if (n.rec && n.rec.ok > 0) return Math.round(n.rec.latency_ms || 0) || null;
    return null;
  }
  function aliveState(n) {
    if (n.probe === 'done') return !!n.probeMs;
    if (n.rec) return (n.rec.ok || 0) > 0;
    return null;                       // unknown until history joins
  }
  function latClass(n) {
    if (n.probe === 'run') return 'lat--probing';
    const l = latencyOf(n), a = aliveState(n);
    if (l == null) return a === false ? 'lat--dead' : 'lat--unk';
    if (l < 500) return 'lat--fast';
    if (l < 900) return 'lat--ok';
    if (l < 1400) return 'lat--mid';
    return 'lat--slow';
  }
  function latText(n) {
    if (n.probe === 'run') return t('probing');
    const l = latencyOf(n);
    if (l != null) return l + ' ms';
    return aliveState(n) === false ? t('probeDead') : '—';
  }

  /* ---- browser live probe (TLS ports only — mixed-content limits) ---- */
  async function probeOne(n) {
    n.probe = 'run';
    const t0 = performance.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4500);
    let ok = false;
    try {
      await fetch(`https://${n.host}/ariston-probe`, { mode: 'no-cors', signal: ctrl.signal, cache: 'no-store' });
      ok = true;                       // opaque response = TLS+HTTP handshake completed
    } catch (e) { ok = false; }
    clearTimeout(timer);
    n.probe = 'done';
    n.probeMs = ok ? Math.round(performance.now() - t0) : null;
  }
  async function probeNode(n) {
    n.probe = 'run';
    renderList();
    await probeOne(n);
    renderList();
  }
  async function probeBatch() {
    const pool = filtered().filter(n => TLS_PORTS.has(n.port) && n.probe === null).slice(0, 24);
    if (!pool.length) { $('#probeMeta').textContent = t('probeDone'); return; }
    let done = 0;
    $('#probeMeta').textContent = `0/${pool.length}`;
    const queue = [...pool];
    const worker = async () => {
      while (queue.length) {
        const n = queue.shift();
        await probeOne(n);
        done++;
        const el = $('#probeMeta');
        if (el) el.textContent = `${done}/${pool.length}`;
        if (loaded) renderList();
      }
    };
    await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
    const el = $('#probeMeta');
    if (el) el.textContent = `${t('probeDone')} · ${pool.filter(n => n.probeMs).length}/${pool.length} ✓`;
    if (loaded) renderList();
  }

  function renderFilters() {
    const protos = [...new Set(nodes.map(n => n.proto))];
    $('#explorerFilters').innerHTML =
      `<button class="fchip ${!filterGold ? 'is-active' : ''}" data-f="all">ALL ${fmt(nodes.length)}</button>
       <button class="fchip ${filterGold ? 'is-active' : ''}" data-f="gold">★ GOLD ${fmt(nodes.filter(n => n.gold).length)}</button>` +
      protos.map(p => `<button class="fchip ${filterProto === p ? 'is-active' : ''}" data-p="${p}">${p.toUpperCase()}</button>`).join('');
    $$('#explorerFilters [data-f]').forEach(b => b.addEventListener('click', () => { filterGold = b.dataset.f === 'gold'; shown = 120; renderFilters(); renderList(); }));
    $$('#explorerFilters [data-p]').forEach(b => b.addEventListener('click', () => { filterProto = b.dataset.p; shown = 120; renderFilters(); renderList(); }));
  }

  function filtered() {
    const ql = q.trim().toLowerCase();
    let f = nodes.filter(n =>
      (!filterGold || n.gold) &&
      (filterProto === 'all' || n.proto === filterProto) &&
      (!aliveOnly || aliveState(n) === true) &&
      (!ql || n.uri.toLowerCase().includes(ql) || (n.tag || '').toLowerCase().includes(ql) || (n.host || '').toLowerCase().includes(ql)));
    if (sortByLat) f = [...f].sort((a, b) => {
      const la = latencyOf(a), lb = latencyOf(b);
      if (la == null && lb == null) return 0;
      if (la == null) return 1;
      if (lb == null) return -1;
      return la - lb;
    });
    return f;
  }

  function renderList() {
    if (!loaded) return;
    const f = filtered();
    const slice = f.slice(0, shown);
    const listEl = $('#explorerList');
    listEl.innerHTML = slice.map((n, i) => {
      const lc = latClass(n);
      const dead = aliveState(n) === false;
      const tls = TLS_PORTS.has(n.port);
      return `<div class="nrow ${dead ? 'nrow--dead' : ''}">
        <span class="nrow__proto nrow__proto--${n.proto}">${n.proto}${n.gold ? ' ★' : ''}</span>
        <span class="nrow__host">${n.host || n.uri.slice(0, 46)}</span>
        <span class="nrow__tag" title="${n.tag || ''}">${n.tag || ''}</span>
        <span class="nrow__lat mono ${lc}" title="${n.rec ? `${n.rec.ok || 0}✓ / ${n.rec.fail || 0}✗ · ${Math.round((n.rec.ema || 0) * 100)}%` : ''}">${latText(n)}</span>
        <button class="nrow__probe" data-probe="${i}" ${(!tls || n.probe === 'run') ? 'disabled' : ''}
          title="${tls ? t('probeRun') : 'tls ports only'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2 4.5 13.5H11L9.5 22 19 9.5h-6.5z"/></svg>
        </button>
        <button class="nrow__copy" data-i="${i}" aria-label="copy node">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
        </button></div>`;
    }).join('') || `<div class="explorer__loading">0 — no match</div>`;
    $$('#explorerList .nrow__copy').forEach(b => b.addEventListener('click', () => copyText(f[+b.dataset.i].uri)));
    $$('#explorerList .nrow__probe').forEach(b => b.addEventListener('click', () => probeNode(f[+b.dataset.probe])));
    const aliveKnown = f.filter(n => aliveState(n) !== null).length;
    const aliveN = f.filter(n => aliveState(n) === true).length;
    $('#explorerMeta').textContent = `${lang === 'fa' ? 'نمایش' : 'showing'} ${fmt(slice.length)} / ${fmt(f.length)}` +
      (aliveKnown ? ` · ${lang === 'fa' ? 'سالم' : 'alive'} ${fmt(aliveN)}/${fmt(aliveKnown)}` : '') +
      (filterGold ? ' · ★ GOLD' : '') + (q ? ' · "' + q + '"' : '');
    $('#explorerMore').hidden = shown >= f.length;
    $('#explorerCopy').hidden = f.length === 0;
  }

  function init() {
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { ensure(); io.disconnect(); } }, { rootMargin: '400px' });
    io.observe($('#explorer'));
    $('#explorerSearch').addEventListener('input', e => { q = e.target.value; shown = 120; if (loaded) renderList(); });
    $('#explorerMore').addEventListener('click', () => { shown += 150; renderList(); });
    $('#explorerCopy').addEventListener('click', () => {
      const f = filtered();
      if (!f.length) return;
      copyText(btoa(unescape(encodeURIComponent(f.map(n => n.uri).join('\n')))));
    });
    $('#probeBatch').addEventListener('click', probeBatch);
    $('#sortLat').addEventListener('click', () => {
      sortByLat = !sortByLat;
      $('#sortLat').textContent = sortByLat ? t('sortReset') : t('sortLat');
      shown = 120; if (loaded) renderList();
    });
    $('#aliveOnly').addEventListener('click', () => {
      aliveOnly = !aliveOnly;
      $('#aliveOnly').classList.toggle('is-active', aliveOnly);
      shown = 120; if (loaded) renderList();
    });
  }
  return { init };
})();

/* ---------------- render: source matrix ---------------- */
function renderSources() {
  const bs = S.by_source || {};
  const failed = (S.sources_failed && typeof S.sources_failed === 'object') ? S.sources_failed : {};
  const entries = Object.entries(bs).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(e => e[1]));
  const wrap = $('#dotMatrix');
  wrap.innerHTML = entries.map(([id, raw]) => {
    const size = Math.max(5, Math.min(17, 5 + Math.sqrt(raw / max) * 13));
    const isFail = id in failed;
    return `<span class="sdot ${isFail ? 'sdot--fail' : ''}" style="width:${size}px;height:${size}px" data-id="${id.toLowerCase()}" tabindex="0" role="img"
      aria-label="${id} ${raw}"><span class="sdot__tip"><b>${id}</b> · raw ${fmt(raw)}${isFail ? ' · ' + (failed[id] || 'failed') : ''}</span></span>`;
  }).join('');
  $('#sourcesMeta').textContent = `${fmt(entries.length)} sources · ${fmt(Object.keys(failed).length)} failed · largest: ${entries[0] ? entries[0][0] + ' (' + fmt(entries[0][1]) + ')' : '—'}`;
  const search = $('#sourcesSearch');
  search.oninput = () => {
    const q = search.value.trim().toLowerCase();
    $$('.sdot').forEach(d => d.classList.toggle('sdot--dim', !!q && !d.dataset.id.includes(q)));
  };
}

/* ---------------- render: downloads & FAQ ---------------- */
const DL_FILES = [
  ['gold.txt', '★ gold tier', 'gold'],
  ['silver.txt', 'silver tier', 'silver'],
  ['validated.txt', 'all alive nodes', 'ok'],
  ['nodes.txt', 'full unique pool', 'all'],
  ['mihomo.yaml', 'clash meta / mihomo', 'yaml'],
  ['singbox.json', 'sing-box 1.14+', 'json'],
  ['by-protocol/vless.txt', 'vless split', 'proto'],
  ['by-protocol/vmess.txt', 'vmess split', 'proto'],
  ['by-protocol/trojan.txt', 'trojan split', 'proto'],
  ['by-protocol/ss.txt', 'shadowsocks split', 'proto'],
  ['by-protocol/hy2.txt', 'hysteria2 split', 'proto'],
  ['results.json', 'full run results', 'data'],
];
function renderDownload() {
  $('#dlGrid').innerHTML = DL_FILES.map(([f, sub]) =>
    `<a class="dl rv" href="${DATA_BASE}/${f}" target="_blank" rel="noopener">
      <span class="dl__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/></svg></span>
      <span><span class="dl__name">${f.split('/').pop()}</span><br><span class="dl__sub">${f.includes('/') ? f + ' · ' : ''}${sub}</span></span>
      <span class="dl__arr"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14m0 0 6-6m-6 6-6-6"/></svg></span></a>`).join('');
}
/* ---------------- i18n ---------------- */
function applyI18n() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  $('#langBtn').textContent = lang === 'fa' ? 'EN' : 'فا';
  localStorage.setItem('ariston-lang', lang);
  $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  $$('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  if (S) { renderDynamic(); }
}
function renderBank() {
  const el = $('#bankPanel');
  if (!el) return;
  const b = S.bank;
  if (!b) { el.hidden = true; return; }
  el.hidden = false;
  $('#bankSub').textContent = t('bankSub');
  const p2 = b.pass2 || {}, src = b.sources || {};
  const tiles = [
    [fmt(b.size ?? 0), t('bankKnown')],
    [b.hit_rate != null ? b.hit_rate + '%' : '—', t('bankHit')],
    [b.avg_streak != null ? b.avg_streak : '—', t('bankStreak')],
    [fmt(p2.rescued ?? 0), t('bankPass2')],
  ];
  $('#bankTiles').innerHTML = tiles.map(([v, k]) =>
    `<div class="bank__tile"><b>${v}</b><span>${k.toUpperCase()}</span></div>`).join('');
  const hit = b.hit_rate != null ? ` · ${t('bankHit')} ${b.hit_rate}%` : '';
  $('#bankSrc').innerHTML =
    `<span class="bank__dot bank__dot--h"><i></i>${fmt(src.healthy ?? 0)} ${t('bankHealthy')}</span>` +
    `<span class="bank__dot bank__dot--s"><i></i>${fmt(src.suspect ?? 0)} ${t('bankSuspect')}</span>` +
    `<span class="bank__dot bank__dot--q"><i></i>${fmt(src.quarantined ?? 0)} ${t('bankQ')}</span>` +
    (b.full_scan ? `<span class="bank__dot"><i></i>${t('bankFull')}</span>` : '') + hit;
}
/* D9/U2 — 7-day health sparkline inside the bank panel (absent → hidden) */
function renderHealth() {
  const el = $('#healthStrip');
  if (!el) return;
  const log = Array.isArray(S.health_7d) ? S.health_7d.slice(-7) : [];
  if (!log.length) { el.hidden = true; return; }
  el.hidden = false;
  $('#healthTitle').textContent = t('healthTitle');
  $('#healthBars').innerHTML = log.map(d => {
    const hit = d.hit == null ? null : Math.max(0, Math.min(100, Number(d.hit)));
    const h = hit == null ? 6 : Math.max(6, Math.round(hit * 0.5));
    return `<div class="health__bar"><i style="height:${h}px"${hit == null ? ' class="na"' : ''}></i>` +
      `<span>${String(d.d || '').slice(8)}</span><b>${hit == null ? '—' : hit + '%'}</b></div>`;
  }).join('');
}
function renderDynamic() {
  renderKPIs(); renderTicker(); renderBank(); renderHealth(); renderPipeline(); renderDonut(); renderBars();
  renderLatency(); renderEngines(); renderISP(); renderImport(); renderWire(); renderSources();
  renderDownload(); observeReveals();
}

/* ---------------- reveal on scroll ---------------- */
let revealIO = null;
function observeReveals() {
  if (revealIO) revealIO.disconnect();
  revealIO = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('is-in'); revealIO.unobserve(e.target); }
  }), { threshold: 0.08 });
  $$('.rv:not(.is-in)').forEach(el => revealIO.observe(el));
}

/* ---------------- spotlight hover (cards) ---------------- */
document.addEventListener('pointermove', e => {
  const card = e.target.closest('.kpi, .client');
  if (!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
  card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
}, { passive: true });

/* ---------------- boot ---------------- */
function initChrome() {
  $('#langBtn').addEventListener('click', () => { lang = lang === 'fa' ? 'en' : 'fa'; applyI18n(); });
  $('#qrClose').addEventListener('click', closeQR);
  $('#qrModal').addEventListener('click', e => { if (e.target.id === 'qrModal') closeQR(); });
  $('#qrCopy').addEventListener('click', () => copyText($('#qrTarget').textContent));
  initWire();
  // active-section highlight in the nav
  const secIO = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) $$('.nav__links a').forEach(a =>
      a.classList.toggle('is-active', a.getAttribute('href') === '#' + e.target.id));
  }), { rootMargin: '-38% 0px -56% 0px' });
  $$('main section[id]').forEach(s => secIO.observe(s));
  tickCountdown();
  setInterval(tickCountdown, 1000);
  setInterval(async () => { if (document.visibilityState === 'visible') { try { S = await fetchJSON(DATA_BASE + '/stats.json'); renderDynamic(); } catch (e) {} } }, 5 * 60 * 1000);
  Explorer.init();
}
initChrome();
applyI18n();
loadStats();


