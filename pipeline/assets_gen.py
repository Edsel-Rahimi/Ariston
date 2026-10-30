"""Live asset generator — runs after every pipeline pass.

Rewritten as the "living README" engine: every visual section of the
README is now a data-driven animated SVG, refreshed each hourly run and
committed to `main` by the stats-amend workflow step.

Produces inside assets/:

  banner.svg            cinematic hero banner (counts baked in)
  lang-*.svg            language selector pills with hand-drawn flags
  run-card.svg          last-run dashboard (funnel + medals + gauge)
  quickstart.svg        3-step start-here infographic
  tier-*.svg            gold/silver/validated/all cards        (assets_cards)
  btn-text/btn-b64      animated TXT / BASE64 buttons           (assets_cards)
  client-*.svg          mihomo.yaml / singbox.json cards        (assets_cards)
  proof.svg             "does it really work" infographic       (assets_cards)
  op-*.svg              11 Iranian-operator cards               (assets_cards)
  protocols.svg         protocol support strip                  (assets_cards)
  architecture.svg      animated five-station pipeline          (assets_cards)
  qr-*.svg              scan-to-subscribe cards (unchanged)

Usage:
    python -m pipeline.assets_gen            # read dist/stats.json
    python -m pipeline.assets_gen --demo     # built-in fallback numbers
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path

from .assets_cards import (
    build_architecture, build_buttons, build_clients, build_operators,
    build_proof, build_protocols, build_tier,
)
from .svgkit import (
    FAINT, GOLD, INK, LINE, LINE_SOFT, MINT, MONO, MUT, PANEL0, PANEL1, SKY,
    TXT, VIOLET, aurora, chip, defs_base, flag, flow_line, fmt, grid,
    live_dot, medal, num, panel, particles, sheen, svg_open, text, wave_rings,
)
from .svgkit import SHEEN_DEF

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
DIST = ROOT / "dist"

REPO = "Edsel-Rahimi/Ariston"
RAW = f"https://raw.githubusercontent.com/{REPO}/data"


def load_stats(demo: bool = False) -> dict:
    if not demo:
        p = DIST / "stats.json"
        if p.exists():
            try:
                return json.loads(p.read_text("utf-8"))
            except Exception:
                pass
    return {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "duration_seconds": 10.2,
        "sources_total": 181, "sources_ok": 181, "sources_failed": {},
        "raw": 98498, "unique": 30702,
        "prefilter": {"output": 13905, "tcp_closed": 16797},
        "validation": {"probed": 13675, "alive": 821,
                       "latency_ms": {"min": 66.3, "p50": 589.0, "p80": 1072.7, "avg": 837.1},
                       "engines": {"xray": "26.10.29", "sing_box": "1.14.4"}},
        "scoring": {"gold": 147, "silver": 584, "bronze": 90},
        "clients": {"mihomo": {"built": 792, "skipped": 29},
                    "singbox": {"built": 821, "skipped": 0}},
        "operators": {"by_slug": {"ir-other": 165, "irancell": 4,
                                  "pishgaman": 2, "respina": 4, "asiatech": 2}},
    }


def _fa_digits(s: str) -> str:
    return s.translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


# ================================================================ banner ==
def build_banner(stats: dict) -> str:
    v = stats.get("validation") or {}
    sc = stats.get("scoring") or {}
    w, h = 1200, 372
    s = svg_open(w, h, label="Ariston — hourly validated node lattice") + defs_base()
    s += f'<rect width="{w}" height="{h}" fill="{INK}"/>'
    s += aurora(w, h, seed=5)
    s += grid(w, h, step=48, opacity=0.05)
    s += particles(w, h, n=26, seed=9)
    s += particles(w, h, n=10, seed=23, col=SKY)

    # ---- right orbital emblem (radar) ----
    ocx, ocy = 995, 176
    s += (f'<g class="spin" style="transform-origin:{ocx}px {ocy}px">'
          f'<circle cx="{ocx}" cy="{ocy}" r="118" fill="none" stroke="{LINE}" stroke-dasharray="3 10"/>'
          f'<circle cx="{ocx}" cy="{ocy}" r="118" fill="none" stroke="{MINT}" stroke-width="1.6" '
          f'stroke-dasharray="60 682" stroke-linecap="round"/></g>')
    s += (f'<g class="spin-rev" style="transform-origin:{ocx}px {ocy}px">'
          f'<circle cx="{ocx}" cy="{ocy}" r="88" fill="none" stroke="{LINE}" stroke-dasharray="2 8"/>'
          f'<circle cx="{ocx - 88}" cy="{ocy}" r="3.2" fill="{SKY}"/>'
          f'<circle cx="{ocx + 62}" cy="{ocy + 62}" r="2.4" fill="{MINT}"/></g>')
    s += (f'<circle cx="{ocx}" cy="{ocy}" r="56" fill="{PANEL1}" stroke="{MINT}" stroke-opacity=".5"/>'
          f'<circle cx="{ocx}" cy="{ocy}" r="56" fill="none" stroke="{MINT}" stroke-opacity=".25" class="pulse-fast" style="r:56">'
          f'<animate attributeName="r" values="56;74" dur="2.6s" repeatCount="indefinite"/>'
          f'<animate attributeName="opacity" values=".4;0" dur="2.6s" repeatCount="indefinite"/></circle>')
    # core glyph (the A-mark)
    s += (f'<g transform="translate({ocx} {ocy}) scale(2.1)">'
          f'<path d="M-7 9 0 -9l7 9M-3.4 3h6.8" stroke="{MINT}" stroke-width="2.4" fill="none" '
          f'stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="40" stroke-dashoffset="40">'
          f'<animate attributeName="stroke-dashoffset" values="40;0" dur="1.6s" fill="freeze"/></path></g>')
    # radar sweep
    s += (f'<g><path d="M{ocx} {ocy} L{ocx + 118} {ocy} A118 118 0 0 0 {ocx + 83} {ocy - 83} Z" fill="url(#gSweep)">'
          f'<animateTransform attributeName="transform" type="rotate" from="0 {ocx} {ocy}" '
          f'to="360 {ocx} {ocy}" dur="5.2s" repeatCount="indefinite"/></path></g>')

    # ---- wordmark ----
    s += text(64, 96, "ARISTON", 46, "url(#gBrand)", anchor="start", weight=800, spacing="7", mono=True)
    s += text(66, 124, "HOURLY DUAL-ENGINE NODE LATTICE", 12, MUT, anchor="start", mono=True, spacing="4.2", weight=600)
    s += text(64, 162, "مخزنِ گره‌های سالم — هر ساعت پالایش می‌شود", 18.5, TXT, anchor="start", weight=700, fa=True)
    s += text(64, 188, "*در یونان باستان Ariston یعنی «بهترین» — هدف ما هم همین یک کلمه است.", 12, FAINT,
              anchor="start", fa=True)

    # ---- protocol chips ----
    cx0 = 64
    for label, col in [("VLESS", MINT), ("VMESS", SKY), ("TROJAN", GOLD),
                       ("SS", VIOLET), ("HY2", "#FF9F43"), ("TUIC", "#FB7185")]:
        c, tw = chip(cx0, 212, label, col)
        s += c
        cx0 += tw + 10

    # ---- KPI capsules ----
    kpis = [
        ("گره زنده", fmt(v.get("alive", 0)), MINT),
        ("رده طلا", fmt(sc.get("gold", 0)), GOLD),
        ("منبع فعال", f"{fmt(stats.get('sources_ok', 0))}/{fmt(stats.get('sources_total', 0))}", SKY),
    ]
    kx = 64
    for label, val, col in kpis:
        s += panel(kx, 252, 168, 62, rx=16, stroke=col)
        s += f'{live_dot(kx + 22, 283, col, 3.6)}'
        s += text(kx + 36, 288, val, 20, col, anchor="start", weight=800, mono=True)
        s += text(kx + 152, 288, label, 12, MUT, anchor="end", fa=True)
        kx += 182

    # ---- baseline ----
    s += flow_line(64, 344, w - 64, 344, MINT, 2.0, slow=True)
    s += text(64, 330, "github.com/Edsel-Rahimi/Ariston", 11.5, FAINT, anchor="start", mono=True)
    ts = (stats.get("generated_at") or "").replace("T", " ")[:16]
    s += text(w - 64, 330, f"LIVE · {ts} UTC", 11.5, FAINT, anchor="end", mono=True)
    s += sheen(0, 0, w, h, dur=7.0)
    s += f"""<defs><linearGradient id="gSweep" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="{MINT}" stop-opacity=".22"/>
      <stop offset="1" stop-color="{MINT}" stop-opacity="0"/></linearGradient></defs>"""
    s += "</svg>"
    return s


# ================================================================= langs ==
LANGS = [
    ("fa", "فارسی", "IR — فارسی", True),
    ("en", "English", "EN — English", False),
    ("tr", "Türkçe", "TR — Türkçe", False),
    ("ru", "Русский", "RU — Русский", False),
    ("zh", "中文", "ZH — 中文", False),
]

FLAG_OF = {"fa": "ir", "en": "gb", "tr": "tr", "ru": "ru", "zh": "cn"}


def build_langs() -> dict[str, str]:
    out = {}
    for code, native, alt, _current in LANGS:
        w, h = 234, 66
        for active in (False, True):
            ring = MINT if active else LINE
            s = svg_open(w, h, f"language: {native}")
            s += f"<defs>{SHEEN_DEF}</defs>"
            s += panel(2, 2, w - 4, h - 4, rx=31, stroke=ring, op=0.98)
            if active:
                s += (f'<rect x="2" y="2" width="{w - 4}" height="{h - 4}" rx="31" fill="{MINT}" fill-opacity=".06"/>')
            s += flag(FLAG_OF[code], 16, 15, 46, 34)
            s += text(78, 39, native, 17.5, TXT, anchor="start", weight=800)
            s += text(w - 16, 39, "↗", 15, MINT if active else MUT, anchor="end", weight=700)
            if active:
                s += (f'<circle cx="{w - 40}" cy="34" r="3" fill="{MINT}" class="pulse-fast"/>')
            s += sheen(0, 0, w, h, dur=4.4, delay=ord(code[-1]) % 3)
            s += "</svg>"
            out[f"lang-{code}-on.svg" if active else f"lang-{code}.svg"] = s
    return out


# ============================================================== run card ==
def build_run_card(stats: dict) -> str:
    v = stats.get("validation") or {}
    pf = stats.get("prefilter") or {}
    sc = stats.get("scoring") or {}
    lm = v.get("latency_ms") or {}
    en = v.get("engines") or {}
    w, h = 1080, 356
    s = svg_open(w, h, "Ariston last run") + defs_base()

    s += panel(2, 2, w - 4, h - 4, rx=22, stroke=LINE)
    s += f'<rect x="2" y="2" width="{w - 4}" height="4" rx="2" fill="url(#gBrand)"/>'

    # header
    s += f'{live_dot(46, 46, MINT)}'
    s += text(62, 52, "آخرین اجرا", 20, TXT, anchor="start", weight=800, fa=True)
    ts = (stats.get("generated_at") or "").replace("T", " ")[:16]
    s += text(176, 52, ts + " UTC", 13.5, MUT, anchor="start", mono=True)
    dur = stats.get("duration_seconds")
    src_ok, src_tot = int(stats.get("sources_ok") or 0), int(stats.get("sources_total") or 0)
    chip_txt = f"{src_ok}/{src_tot} منبع OK · {_fa_digits(f'{dur:.1f}') if dur else '—'} ثانیه"
    s += text(w - 36, 52, chip_txt, 12.5, MINT, anchor="end", weight=700, fa=True)
    s += text(w - 36, 74, "DUAL-ENGINE LIVE SWEEP", 9.5, FAINT, anchor="end", mono=True, spacing="2.6")

    # funnel (sqrt-scaled bars)
    stages = [
        ("خام جمع‌آوری‌شده", stats.get("raw", 0), MUT),
        ("یکتا پس از پالایش", stats.get("unique", 0), SKY),
        ("گذرنده از TCP", pf.get("output", 0), VIOLET),
        ("پروب دو-موتوره", v.get("probed", 0), "#FF9F43"),
        ("زنده", v.get("alive", 0), MINT),
    ]
    bx, by, bw, bh, gap = 200, 104, 470, 21, 15
    mx = max(1, int(stages[0][1] or 1))
    labels_x = w - 36
    for i, (label, val, col) in enumerate(stages):
        y = by + i * (bh + gap)
        frac = (int(val or 1) / mx) ** 0.5
        bwid = max(26, bw * frac)
        s += text(labels_x, y + bh - 4, label, 12.5, MUT, anchor="end", fa=True)
        s += (f'<rect x="{bx}" y="{y}" width="{bw}" height="{bh}" rx="{bh / 2}" fill="{PANEL0}" '
              f'stroke="{LINE_SOFT}"/>')
        s += (f'<rect x="{bx}" y="{y}" width="{bwid:.0f}" height="{bh}" rx="{bh / 2}" fill="{col}26" '
              f'stroke="{col}" stroke-opacity=".7" stroke-width="1.1"/>')
        s += (f'<rect x="{bx + bwid - 5:.0f}" y="{y}" width="5" height="{bh}" rx="2.5" fill="{col}">'
              f'<animate attributeName="opacity" values="1;.3;1" dur="1.8s" repeatCount="indefinite"/></rect>')
        s += text(bx + bwid + 12, y + bh - 5, fmt(val), 13.5, col, anchor="start", weight=800, mono=True)
        if i:
            s += flow_line(bx - 8, y - gap / 2 + 2, bx - 8, y - gap / 2 + 2, col, 0.1)  # tick
    # funnel connector arrows (vertical marching line on the left edge)
    s += flow_line(bx - 14, by + 4, bx - 14, by + 4 * (bh + gap) + bh - 4, MINT, 1.6, slow=True)

    # medals (bottom-left band, counts inline)
    my = 306
    medals = [("gGold", GOLD, sc.get("gold", 0), "طلا"), ("gSilver", "#C9D6EC", sc.get("silver", 0), "نقره"),
              (None, "#F59E0B", sc.get("bronze", 0), "برنز")]
    mx0 = 52
    for grad, col, n, fa in medals:
        if grad:
            s += f'<g>{medal(mx0, my, 17, grad, col)}</g>'
        else:
            s += (f'<circle cx="{mx0}" cy="{my}" r="17" fill="{col}20" stroke="{col}" stroke-width="1.5" '
                  f'filter="url(#fGlow)"/><circle cx="{mx0}" cy="{my}" r="11" fill="none" stroke="{col}" '
                  f'stroke-opacity=".5"/><circle cx="{mx0}" cy="{my}" r="4.5" fill="{col}"/>')
        s += text(mx0 + 28, my + 6, fmt(n), 15.5, col, anchor="start", weight=800, mono=True)
        s += text(mx0 + 28 + len(fmt(n)) * 9.5 + 10, my + 6, fa, 11.5, FAINT, anchor="start", fa=True)
        mx0 += 118

    # gauge
    p50 = lm.get("p50")
    frac = min(1.0, (p50 or 0) / 1500.0)
    gx, gy, gr = 900, 244, 52
    import math as _m
    a = _m.pi * (1 - frac)
    x2, y2 = gx + gr * _m.cos(a), gy - gr * _m.sin(a)
    sweep = _m.pi * gr
    dash = frac * sweep
    s += (f'<path d="M {gx - gr} {gy} A {gr} {gr} 0 0 1 {gx + gr} {gy}" fill="none" stroke="{PANEL0}" '
          f'stroke-width="10" stroke-linecap="round"/>')
    col = MINT if frac < 0.55 else ("#FF9F43" if frac < 0.8 else "#FB7185")
    s += (f'<path d="M {gx - gr} {gy} A {gr} {gr} 0 0 1 {gx + gr} {gy}" fill="none" stroke="{col}" '
          f'stroke-width="10" stroke-linecap="round" stroke-dasharray="0.1 {sweep:.1f}" filter="url(#fGlow)">'
          f'<animate attributeName="stroke-dasharray" values="0.1 {sweep:.1f};{dash:.1f} {sweep:.1f}" '
          f'dur="1.5s" fill="freeze"/></path>')
    s += text(gx, gy - 14, f"{p50:g}" if p50 else "—", 20, col, weight=800, mono=True)
    s += text(gx, gy + 6, "ms · p50", 10.5, FAINT, mono=True)
    s += text(gx, gy + 28, f"p80 {lm.get('p80', 0):g} · avg {lm.get('avg', 0):g}", 10.5, MUT, mono=True)
    s += text(gx, gy + 52, f"xray {en.get('xray', '—')} × sb {en.get('sing_box', '—')}", 10.5, FAINT, mono=True)
    s += flow_line(690, 250, gx - gr - 14, 250, GOLD, 1.8, slow=True)

    s += text(36, h - 16, "ARISTON · LIVE", 11, "url(#gBrand)", anchor="start", weight=800, mono=True, spacing="2.4")
    s += text(w - 36, h - 16, "این کارت هر ساعت از آمار واقعی اجرا بازسازی می‌شود", 11, FAINT, anchor="end", fa=True)
    s += sheen(0, 0, w, h, dur=6.0)
    s += "</svg>"
    return s


# ============================================================ quickstart ==
def build_quickstart(stats: dict) -> str:
    w, h = 1080, 236
    s = svg_open(w, h, "Ariston quick start") + defs_base()
    s += text(w / 2, 36, "شروع سریع — سه قدم", 20, TXT, weight=800, fa=True)
    s += text(w / 2, 58, "QUICK START — COPY, IMPORT, CONNECT", 10.5, MINT, mono=True, weight=700, spacing="3")

    steps = [
        ("۱", "کپی کن", "لینک اشتراکِ ردهٔ دلخواه را کپی کنید", MINT, "copy"),
        ("۲", "ایمپورت کن", "در کلاینت، Subscription → افزودن URL", SKY, "import"),
        ("۳", "وصل شو", "هر ساعت خودکار تازه می‌شود — همین!", GOLD, "bolt"),
    ]
    cw, ch, y0 = 296, 118, 84
    xs = [40, 392, 744]
    for (n, fa, sub, col, icon), x in zip(steps, xs):
        s += panel(x, y0, cw, ch, rx=18, stroke=col)
        s += f'<rect x="{x}" y="{y0}" width="{cw}" height="4" rx="2" fill="{col}" opacity=".8"/>'
        s += (f'<circle cx="{x + 44}" cy="{y0 + 44}" r="21" fill="{col}18" stroke="{col}" stroke-opacity=".8" '
              f'stroke-width="1.5"/>')
        s += text(x + 44, y0 + 52, n, 20, col, weight=800)
        icx, icy = x + cw - 38, y0 + 42
        if icon == "copy":
            s += (f'<rect x="{icx - 10}" y="{icy - 10}" width="13" height="13" rx="3" fill="none" stroke="{col}" stroke-width="1.7"/>'
                  f'<rect x="{icx - 4}" y="{icx - 16}" width="13" height="13" rx="3" fill="none" stroke="{col}" '
                  f'stroke-width="1.7" transform="translate(8 8)"/>')
        elif icon == "import":
            s += (f'<path d="M{icx} {icy - 11} v14 m0 0 l-5 -5 m5 5 l5 -5 M{icx - 9} {icy + 8} h18" '
                  f'fill="none" stroke="{col}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>')
        else:
            s += (f'<path d="M{icx + 2} {icy - 12} l-8 13 h6 l-2 11 l8 -13 h-6 z" fill="none" stroke="{col}" '
                  f'stroke-width="1.7" stroke-linejoin="round"/>'
                  f'<animate attributeName="opacity" values="1;.35;1" dur="1.6s" repeatCount="indefinite"/>')
        s += text(x + 76, y0 + 52, fa, 19, TXT, anchor="start", weight=800, fa=True)
        s += text(x + cw / 2, y0 + 92, sub, 12.5, MUT, fa=True)
        s += text(x + cw / 2, y0 + 112, ["COPY A RAW URL", "PASTE INTO ANY CLIENT", "REFRESHES HOURLY"][xs.index(x)],
                  9, FAINT, mono=True, spacing="2")
    for i in range(2):
        s += flow_line(xs[i] + cw + 6, y0 + ch / 2, xs[i + 1] - 6, y0 + ch / 2, MINT if not i else SKY, 2.2)
    s += text(w / 2, h - 12, "لینک‌ها و QRهای آماده در بخش رده‌ها 👇", 12, FAINT, fa=True)
    s += "</svg>"
    return s


# ================================================================== QRs ===
def _qr_path(payload: str):
    try:
        import qrcode
        from qrcode.image.svg import SvgPathImage
    except ImportError:
        return None
    img = qrcode.make(payload, image_factory=SvgPathImage,
                      error_correction=qrcode.constants.ERROR_CORRECT_M)
    svg = img.to_string().decode()
    vb = svg.split('viewBox="')[1].split('"')[0]
    _, _, w, _h = (float(t) for t in vb.split())
    d = svg.split('d="')[1].split('"')[0]
    return d, int(w)


def build_qr_card(payload: str, title: str, sub: str, fname: str) -> bool:
    got = _qr_path(payload)
    if not got:
        print(f"  ! qrcode unavailable — skipped {fname}")
        return False
    d, n = got
    size, pad, label_h = 188, 20, 56
    box = size + 2 * pad
    h = box + label_h
    scale = size / n
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{box}" height="{h}"
     viewBox="0 0 {box} {h}" role="img" aria-label="{title}">
  <defs><linearGradient id="gTop" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#00E5A0"/><stop offset="1" stop-color="#38BDF8"/></linearGradient></defs>
  <rect width="{box}" height="{h}" rx="18" fill="#F8FAFC"/>
  <rect x="0.6" y="0.6" width="{box - 1.2}" height="{box - 1.2}" rx="17.4" fill="none" stroke="#0A0E1A" stroke-opacity="0.10"/>
  <rect x="0.6" y="0.6" width="{box - 1.2}" height="5" rx="2.5" fill="url(#gTop)"/>
  <g transform="translate({pad},{pad}) scale({scale:.5f})">
    <path d="{d}" fill="#0A0E1A"/>
  </g>
  <text x="{box / 2}" y="{box + 26}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif"
        font-size="14" font-weight="800" letter-spacing="1.6" fill="#0A0E1A">{title}</text>
  <text x="{box / 2}" y="{box + 44}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif"
        font-size="10.5" fill="#64748B">{sub}</text>
</svg>'''
    (ASSETS / fname).write_text(svg, encoding="utf-8")
    print(f"  ✓ {fname}")
    return True


# ================================================================== main ==
def main() -> int:
    ap = argparse.ArgumentParser(prog="ariston-assets")
    ap.add_argument("--demo", action="store_true", help="use fallback numbers")
    ap.add_argument("--skip-qr", action="store_true")
    args = ap.parse_args()

    stats = load_stats(demo=args.demo)
    ASSETS.mkdir(exist_ok=True)

    assets: dict[str, str] = {}
    assets["banner.svg"] = build_banner(stats)
    assets["run-card.svg"] = build_run_card(stats)
    assets["quickstart.svg"] = build_quickstart(stats)
    assets.update(build_langs())
    assets.update(build_tier(stats))
    assets.update(build_buttons(stats))
    assets.update(build_clients(stats))
    assets["proof.svg"] = build_proof(stats)
    assets.update(build_operators(stats))
    assets["protocols.svg"] = build_protocols(stats)
    assets["architecture.svg"] = build_architecture(stats)

    for fname, body in assets.items():
        if not fname.endswith(".svg"):
            fname += ".svg"
        (ASSETS / fname).write_text(body, encoding="utf-8")
        print(f"  ✓ {fname}  ({len(body) // 1024} KB)")

    if not args.skip_qr:
        build_qr_card(f"{RAW}/gold.txt", "GOLD TIER", "scan → subscribe", "qr-gold.svg")
        build_qr_card(f"{RAW}/validated.txt", "VALIDATED", "scan → subscribe", "qr-validated.svg")
        build_qr_card(f"{RAW}/nodes.txt", "ALL NODES", "scan → subscribe", "qr-nodes.svg")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
