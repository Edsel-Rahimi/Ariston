"""assets_cards — card-style animated SVG builders for the Ariston README.

Split out of assets_gen.py to keep both files reviewable.  Everything here
is data-driven: counts/versions come from dist/stats.json, so each hourly
pipeline run refreshes the numbers inside the artwork.
"""

from __future__ import annotations

import random

from .svgkit import (
    AMBER, BRONZE, FAINT, GOLD, INK, LINE, LINE_SOFT, MINT, MONO, MUT, PANEL0,
    PANEL1, ROSE, SHEEN_DEF, SILVER, SKY, TXT, VIOLET, aurora, check_mark,
    chip, defs_base, esc, flow_line, fmt, grid, live_dot, medal, num, panel,
    particles, sheen, svg_open, text, wave_rings,
)

RAW = "https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data"


def _open(w, h, label, extra_css=""):
    return (svg_open(w, h, extra_css, label) + defs_base()
            .replace("</defs>", SHEEN_DEF + "\n  </defs>"))


# ======================================================== tier cards =====
TIER_META = [
    ("gold",      "طلا",       "GOLD",      "سریع‌ترین و پایدارترین‌ها — امتیاز ≥ ۸۰", GOLD,   "gGold",   "medal"),
    ("silver",    "نقره",      "SILVER",    "کیفیت خوب با تنوع بیشتر — امتیاز ≥ ۵۵",  SILVER, "gSilver", "medal"),
    ("validated", "تأییدشده",  "VALIDATED", "همین اجرا تستِ زنده‌ی دو-موتوره را پاس کردند", MINT, None, "check"),
    ("all",       "همه",       "ALL",       "تمام گره‌های یکتا — بدون تست", VIOLET, "gVio", "stack"),
]


def _fancy_medal(cx, cy, r, kind, col, grad):
    if kind == "medal":
        return medal(cx, cy, r, grad, col)
    if kind == "check":
        return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{col}16" stroke="{col}" stroke-width="1.6" filter="url(#fGlow)"/>'
                f'<circle cx="{cx}" cy="{cy}" r="{r * 0.8:.0f}" fill="none" stroke="{col}" stroke-opacity=".4"/>'
                + check_mark(cx, cy + r * 0.04, r * 0.72, col, 3.6))
    # stack (all)
    out = f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{col}14" stroke="{col}" stroke-width="1.6" filter="url(#fGlow)"/>'
    for i, dy in enumerate([7, 0, -7]):
        op = 0.9 - i * 0.25
        out += (f'<rect x="{cx - r * 0.5:.0f}" y="{cy + dy - 4}" width="{r}" height="8" rx="4" '
                f'fill="{col}" fill-opacity="{op}" transform="rotate(-14 {cx} {cy + dy})"/>')
    return out


def build_tier(stats: dict) -> dict[str, str]:
    sc = stats.get("scoring") or {}
    v = stats.get("validation") or {}
    counts = {
        "gold": sc.get("gold", 0),
        "silver": sc.get("silver", 0),
        "validated": v.get("alive", 0),
        "all": stats.get("unique", 0),
    }
    out = {}
    for key, fa, en, desc, col, grad, kind in TIER_META:
        w, h = 470, 176
        s = _open(w, h, f"Ariston tier {en}", f"""
  .tw {{ animation: tw 3s ease-in-out infinite; }}
  @keyframes tw {{ 0%,100% {{ opacity:.15 }} 50% {{ opacity:.9 }} }}
""")
        s += aurora(w, h, seed=hash(key) % 99)
        s += panel(2, 2, w - 4, h - 4, rx=20, stroke=col)
        s += (f'<rect x="2" y="2" width="{w - 4}" height="4" rx="2" fill="{col}" opacity=".85"/>')
        rnd = random.Random(key)
        for _ in range(6):  # twinkling dust
            x, y = rnd.randint(30, w - 30), rnd.randint(24, h - 24)
            s += (f'<circle cx="{x}" cy="{y}" r="1.4" fill="{col}" class="tw" '
                  f'style="animation-delay:{rnd.uniform(0, 2):.1f}s"/>')
        s += _fancy_medal(64, 90, 34, kind, col, grad)
        s += text(120, 64, fa, 21, TXT, anchor="start", weight=800, fa=True)
        s += text(120, 88, en, 12.5, col, anchor="start", weight=700, mono=True, spacing="3")
        s += text(120, 118, desc, 13, MUT, anchor="start", fa=True)
        s += text(120, 148, f"{counts[key]:,}", 24, col, anchor="start", weight=800, mono=True)
        s += text(120 + (len(f"{counts[key]:,}") * 15.5) + 12, 148, "گره", 13, FAINT, anchor="start", fa=True)
        s += text(w - 26, h - 22, "باز کردن فایل ↜", 12, col, anchor="end", fa=True, opacity=.85)
        s += sheen(0, 0, w, h, dur=4.2, delay=hash(key) % 3)
        s += "</svg>"
        out[f"tier-{key}.svg"] = s
    return out


# ======================================================== buttons ========
def build_buttons(stats: dict) -> dict[str, str]:
    out = {}
    specs = {
        "btn-text": ("متن", "TXT", MINT, "lines"),
        "btn-b64":  ("بیس‌۶۴", "BASE64", SKY, "code"),
    }
    for fname, (fa, en, col, icon) in specs.items():
        w, h = 196, 58
        s = svg_open(w, h, f"Ariston {en} button")
        s += f"""<defs>{SHEEN_DEF}</defs>
  <rect x="3" y="3" width="{w - 6}" height="{h - 6}" rx="26" fill="{col}12"/>
  <rect x="3" y="3" width="{w - 6}" height="{h - 6}" rx="26" fill="none" stroke="{col}" stroke-opacity=".55" stroke-width="1.4"/>
  <rect x="3" y="3" width="{w - 6}" height="{h - 6}" rx="26" fill="none" stroke="{col}" stroke-width="1.6"
        stroke-dasharray="12 22" class="flow">
    <animate attributeName="stroke-dashoffset" values="0;-68" dur="2.2s" repeatCount="indefinite"/>
  </rect>"""
        # icon
        icx, icy = 34, h / 2
        s += f'<circle cx="{icx}" cy="{icy}" r="14" fill="{col}1E" stroke="{col}" stroke-opacity=".6"/>'
        if icon == "lines":
            for i, lw in enumerate([12, 8, 10]):
                s += (f'<line x1="{icx - 6}" y1="{icy - 5 + i * 5}" x2="{icx - 6 + lw}" y2="{icy - 5 + i * 5}" '
                      f'stroke="{col}" stroke-width="2.1" stroke-linecap="round"/>')
        else:
            s += text(icx, icy + 4.5, "64", 12.5, col, weight=800, mono=True)
        s += text(w / 2 + 14, h / 2 - 4, fa, 14, TXT, weight=800, fa=True)
        s += text(w / 2 + 14, h / 2 + 14, en, 9.5, col, weight=700, mono=True, spacing="2.4")
        s += "</svg>"
        out[fname] = s
    return out


# ======================================================== clients ========
def build_clients(stats: dict) -> dict[str, str]:
    cl = stats.get("clients") or {}
    specs = [
        ("client-mihomo", "mihomo.yaml", "Mihomo · Clash.Meta · Clash Verge",
         "گروه انتخابِ خودکارِ بهترین‌ها", SKY, cl.get("mihomo", {}), "M"),
        ("client-singbox", "singbox.json", "sing-box · SFA · SFI",
         "سلکتور + تستِ خودکار اتصال", MINT, cl.get("singbox", {}), "SB"),
    ]
    out = {}
    for fname, file, platforms, sub_fa, col, st, glyph in specs:
        built = (st or {}).get("built", 0)
        w, h = 470, 158
        s = _open(w, h, f"Ariston {file}")
        s += aurora(w, h, seed=len(fname))
        s += panel(2, 2, w - 4, h - 4, rx=20, stroke=col)
        s += f'<rect x="2" y="2" width="{w - 4}" height="4" rx="2" fill="{col}" opacity=".85"/>'
        # glyph tile
        s += (f'<rect x="26" y="42" width="62" height="62" rx="16" fill="{col}14" stroke="{col}" '
              f'stroke-opacity=".55" stroke-width="1.4"/>')
        s += text(57, 84, glyph, 24, col, weight=800, mono=True)
        s += text(110, 58, file, 19, TXT, anchor="start", weight=800, mono=True)
        s += text(110, 84, platforms, 12, MUT, anchor="start", mono=True, spacing="1")
        s += text(110, 110, sub_fa, 13.5, TXT, anchor="start", fa=True, opacity=.9)
        # built count + open hint
        s += f'{live_dot(114, 134, col, 3.4)}'
        s += text(126, 138, f"{built:,} گره زنده داخل فایل", 12, FAINT, anchor="start", fa=True)
        s += text(w - 88, 88, "باز کردن", 13, col, anchor="end", weight=700, fa=True)
        s += (f'<g><path d="M{w - 106} 83 h-22 m0 0 l7 -7 m-7 7 l7 7" stroke="{col}" stroke-width="2.2" '
              f'fill="none" stroke-linecap="round" stroke-linejoin="round">'
              f'<animate attributeName="opacity" values=".4;1;.4" dur="1.8s" repeatCount="indefinite"/></path></g>')
        s += sheen(0, 0, w, h, dur=4.6, delay=len(fname) % 3)
        s += "</svg>"
        out[fname] = s
    return out


# ======================================================== proof ==========
def build_proof(stats: dict) -> str:
    v = stats.get("validation") or {}
    probed, alive = int(v.get("probed") or 0), int(v.get("alive") or 0)
    rate = f"{100.0 * alive / probed:.1f}%" if probed else "—"
    w, h = 1080, 318
    s = _open(w, h, "Ariston proof")
    s += aurora(w, h)
    s += text(w / 2, 40, "واقعاً کار می‌کند؟ — جوابِ اندازه‌گرفته‌شده", 22, TXT, weight=800, fa=True)
    s += text(w / 2, 64, "MEASURED, NOT ESTIMATED", 11, MINT, weight=700, mono=True, spacing="3.4")

    stages = [
        ("L1", "استانداردسازی", "قابل تحلیل است؟ یکتاست؟ مسیر شبکه‌ای دارد؟", "بدون شبکه", MINT, "funnel"),
        ("L2", "راه‌اندازی", "هندشیکِ پروتکل واقعاً جواب می‌دهد؟", "xray-core + sing-box", SKY, "plug"),
        ("L3", "پروب واقعی", "درخواست HTTP از میان گره جواب ۲۰۴ می‌گیرد؟", "SOCKS5 + generate_204", GOLD, "radar"),
    ]
    cw, ch, y0 = 300, 158, 92
    xs = [30, 390, 750]
    for (badge, fa, q, cost, col, icon), x in zip(stages, xs):
        s += panel(x, y0, cw, ch, rx=18, stroke=col)
        s += f'<rect x="{x}" y="{y0}" width="4" height="{ch}" rx="2" fill="{col}" opacity=".8"/>'
        s += (f'<rect x="{x + 18}" y="{y0 + 16}" width="44" height="24" rx="12" fill="{col}18" stroke="{col}" '
              f'stroke-opacity=".6"/><text x="{x + 40}" y="{y0 + 33}" text-anchor="middle" font-size="12.5" '
              f'font-weight="800" fill="{col}" class="mono">{badge}</text>')
        # mini icon
        icx, icy = x + cw - 34, y0 + 28
        if icon == "funnel":
            s += (f'<path d="M{icx - 11} {icy - 9} h22 l-8 9 v9 l-6 4 v-13 z" fill="none" stroke="{col}" '
                  f'stroke-width="1.8" stroke-linejoin="round"/>')
        elif icon == "plug":
            s += (f'<path d="M{icx - 8} {icy - 10} v7 M{icx + 8} {icy - 10} v7 M{icx - 9} {icy - 3} h18 v6 '
                  f'a9 9 0 0 1 -18 0 z M{icx} {icy + 13} v6" fill="none" stroke="{col}" stroke-width="1.8" '
                  f'stroke-linecap="round" stroke-linejoin="round"/>')
        else:
            s += wave_rings(icx, icy, col, r0=4, n=3, gap=6, dur=2.0, sw=1.8)
        s += text(x + cw / 2, y0 + 72, fa, 17, TXT, weight=800, fa=True)
        s += text(x + cw / 2, y0 + 100, q, 12.5, MUT, fa=True)
        s += text(x + cw / 2, y0 + 130, "هزینه: " + cost, 11.5, col, fa=True, opacity=.9)
    for i in range(2):
        x1 = xs[i] + cw + 4
        x2 = xs[i + 1] - 4
        s += flow_line(x1, y0 + ch / 2, x2, y0 + ch / 2, MINT if i == 0 else SKY, 2.2)

    # bottom strip: dual-engine venn + live numbers
    yb = 288
    s += flow_line(xs[2] + cw / 2, y0 + ch + 4, 990, yb - 30, GOLD, 2.0, slow=True, curve=1)
    s += text(56, yb - 26, "پروب دو-موتوره در آخرین اجرا", 12.5, MUT, anchor="start", fa=True)
    s += text(56, yb - 2, f"{probed:,} probed → {alive:,} alive · {rate}", 16, TXT, anchor="start", weight=800, mono=True)
    s += text(56, yb + 22, f"engine sweep · {esc(str((v.get('engines') or {}).get('xray', '')))} × "
             f"{esc(str((v.get('engines') or {}).get('sing_box', '')))}", 11.5, FAINT, anchor="start", mono=True)
    vx, vy, r = 990, 268, 27
    s += (f'<circle cx="{vx - 11}" cy="{vy}" r="{r}" fill="{MINT}" fill-opacity=".16" stroke="{MINT}" '
          f'stroke-opacity=".8" stroke-width="1.4" class="pulse"/>')
    s += (f'<circle cx="{vx + 11}" cy="{vy}" r="{r}" fill="{SKY}" fill-opacity=".16" stroke="{SKY}" '
          f'stroke-opacity=".8" stroke-width="1.4" class="pulse" style="animation-delay:.6s"/>')
    s += text(vx, vy + 4, "✓", 14, TXT, weight=800)
    s += text(vx - 12, vy + r + 14, "xray", 9.5, MINT, mono=True)
    s += text(vx + 14, vy + r + 14, "sing-box", 9.5, SKY, mono=True)
    s += "</svg>"
    return s


# ======================================================== operators ======
OPS = [
    ("irancell",  "ایرانسل",        "IRANCELL",   "#FFB300", "rings"),
    ("mci",       "همراه اول",      "MCI",        "#5B8CFF", "double"),
    ("tci",       "مخابرات",        "TCI",        "#3B82F6", "double"),
    ("rightel",   "رایتل",          "RIGHTEL",    "#FF5470", "rings"),
    ("pishgaman", "پیشگامان",       "PISHGAMAN",  "#2FD574", "sun"),
    ("shatel",    "شاتل",           "SHATEL",     "#22D3EE", "waves"),
    ("mobinnet",  "مبین‌نت",        "MOBINNET",   "#A78BFA", "waves"),
    ("asiatech",  "آسیاتک",         "ASIATECH",   "#38BDF8", "rings"),
    ("parsonline","پارس‌آنلاین",    "PARSONLINE", "#34D399", "sun"),
    ("respina",   "رسپینا",         "RESPINA",    "#FF9F43", "double"),
    ("ir-other",  "سایر شبکه‌های ایران", "IR-OTHER", MINT, "globe"),
]


def _emblem(kind, col, cx, cy):
    if kind == "globe":
        return (f'<circle cx="{cx}" cy="{cy}" r="20" fill="none" stroke="{col}" stroke-width="1.6" opacity=".9">'
                f'<animate attributeName="opacity" values=".5;1;.5" dur="3s" repeatCount="indefinite"/></circle>'
                f'<ellipse cx="{cx}" cy="{cy}" rx="9" ry="20" fill="none" stroke="{col}" stroke-width="1.2" opacity=".7"/>'
                f'<line x1="{cx - 20}" y1="{cy}" x2="{cx + 20}" y2="{cy}" stroke="{col}" stroke-width="1.2" opacity=".7"/>'
                f'<line x1="{cx - 17}" y1="{cy - 10}" x2="{cx + 17}" y2="{cy - 10}" stroke="{col}" stroke-width="1" opacity=".5"/>'
                f'<line x1="{cx - 17}" y1="{cy + 10}" x2="{cx + 17}" y2="{cy + 10}" stroke="{col}" stroke-width="1" opacity=".5"/>'
                f'<circle cx="{cx}" cy="{cy}" r="4" fill="{col}" filter="url(#fGlow)"/>')
    base = wave_rings(cx, cy, col, r0=5, n=3, gap=9, dur=2.6, sw=2.2)
    if kind == "double":
        base += f'<circle cx="{cx}" cy="{cy}" r="12" fill="none" stroke="{col}" stroke-width="1.4" opacity=".55"/>'
    elif kind == "sun":
        for a in range(0, 360, 45):
            base += (f'<line x1="{cx + 15}" y1="{cy}" x2="{cx + 19}" y2="{cy}" stroke="{col}" stroke-width="1.8" '
                     f'stroke-linecap="round" transform="rotate({a} {cx} {cy})" opacity=".7"/>')
    elif kind == "waves":
        for i, dy in enumerate([-6, 0, 6]):
            base += (f'<path d="M{cx - 12} {cy + dy} q6 -5 12 0 t12 0" fill="none" stroke="{col}" '
                     f'stroke-width="1.7" stroke-linecap="round" opacity="{0.9 - i * 0.25}"/>')
    return base


def build_operators(stats: dict) -> dict[str, str]:
    by = (stats.get("operators") or {}).get("by_slug") or {}
    out = {}
    for slug, fa, en, col, kind in OPS:
        n = int(by.get(slug) or 0)
        w, h = 352, 134
        s = _open(w, h, f"Ariston {en} operator")
        s += panel(2, 2, w - 4, h - 4, rx=18, stroke=col)
        s += f'<rect x="{w - 6}" y="2" width="4" height="{h - 4}" rx="2" fill="{col}" opacity=".8"/>'
        s += _emblem(kind, col, 52, 62)
        s += text(96, 44, fa, 16.5, TXT, anchor="start", weight=800, fa=True)
        s += text(96, 66, en, 10.5, col, anchor="start", weight=700, mono=True, spacing="2.2")
        s += text(w - 26, 68, f"{n:,}", 23, col, anchor="end", weight=800, mono=True)
        s += text(w - 26, 90, "گره", 11.5, FAINT, anchor="end", fa=True)
        s += text(w - 22, h - 18, "باز کردن فایل ↜", 11.5, col, anchor="end", fa=True, opacity=.85)
        s += sheen(0, 0, w, h, dur=4.4, delay=len(slug) % 4)
        s += "</svg>"
        out[f"op-{slug}"] = s
    return out


# ======================================================== protocols ======
PROTOS = [
    ("VLESS", MINT, "vision · reality · xhttp"),
    ("VMESS", SKY, None),
    ("TROJAN", GOLD, None),
    ("SS", VIOLET, "shadowsocks · 2022"),
    ("HY2", AMBER, "hysteria2"),
    ("TUIC", ROSE, None),
    ("SSR", FAINT, None),
]


def build_protocols(stats: dict) -> str:
    w, h = 1080, 196
    s = _open(w, h, "Ariston protocols")
    s += text(w / 2, 34, "پروتکل‌های پشتیبانی‌شده", 19, TXT, weight=800, fa=True)
    s += text(w / 2, 56, "COLLECTED + DUAL-ENGINE TESTED", 10, MINT, mono=True, weight=700, spacing="3")
    tw, gap, x0, y0, th = 142, 9, 16, 74, 86
    for i, (name, col, note) in enumerate(PROTOS):
        x = x0 + i * (tw + gap)
        s += panel(x, y0, tw, th, rx=14, stroke=col)
        s += (f'<rect x="{x}" y="{y0}" width="{tw}" height="{th}" rx="14" fill="none" stroke="{col}" '
              f'stroke-width="1.1" opacity="0">'
              f'<animate attributeName="opacity" values="0;.8;0" dur="4.9s" begin="{i * 0.7:.1f}s" repeatCount="indefinite"/></rect>')
        s += f'<circle cx="{x + tw / 2}" cy="{y0 + 30}" r="15" fill="{col}16" stroke="{col}" stroke-opacity=".7"/>'
        s += text(x + tw / 2, y0 + 35, name[:2] if len(name) > 2 else name, 12.5, col, weight=800, mono=True)
        s += text(x + tw / 2, y0 + 60, name, 12, TXT, weight=800, mono=True, spacing="1.4")
        # collect + test rows
        s += text(x + 12, y0 + 78, "جمع‌آوری", 9.5, MUT, anchor="start", fa=True)
        s += check_mark(x + tw - 22, y0 + 75, 5, MINT, 2.0)
    s += text(w / 2, y0 + th + 20, "همه جمع‌آوری می‌شوند · همه جز SSR تست دو-موتوره می‌شوند", 11, FAINT, fa=True)
    s += "</svg>"
    return s


# ======================================================== architecture ===
def _glyph(kind, col, cx, cy):
    if kind == "sat":
        return (f'<circle cx="{cx}" cy="{cy}" r="11" fill="none" stroke="{col}" stroke-width="1.7"/>'
                f'<path d="M{cx - 15} {cy + 13} q15 12 30 0" fill="none" stroke="{col}" stroke-width="1.7" stroke-linecap="round"/>'
                f'<path d="M{cx - 10} {cy + 20} q10 8 20 0" fill="none" stroke="{col}" stroke-width="1.4" stroke-linecap="round" opacity=".6"/>')
    if kind == "funnel":
        return (f'<path d="M{cx - 12} {cy - 10} h24 l-9 10 v9 l-6 4 v-13 z" fill="none" stroke="{col}" '
                f'stroke-width="1.7" stroke-linejoin="round"/>')
    if kind == "shield":
        return (f'<path d="M{cx} {cy - 12} l11 4 v8 c0 7 -5 11 -11 13 c-6 -2 -11 -6 -11 -13 v-8 z" '
                f'fill="none" stroke="{col}" stroke-width="1.7" stroke-linejoin="round"/>'
                + check_mark(cx - 5, cy + 1, 6, col, 2.0))
    if kind == "medal":
        return (f'<circle cx="{cx}" cy="{cy - 2}" r="9" fill="none" stroke="{col}" stroke-width="1.7"/>'
                f'<path d="M{cx - 5} {cy + 6} l-3 8 M{cx + 5} {cy + 6} l3 8" stroke="{col}" stroke-width="1.7" stroke-linecap="round"/>')
    if kind == "pkg":
        return (f'<path d="M{cx} {cy - 12} l12 6 v13 l-12 6 l-12 -6 v-13 z M{cx - 12} {cy - 6} l12 6 l12 -6 M{cx} {cy} v13" '
                f'fill="none" stroke="{col}" stroke-width="1.6" stroke-linejoin="round"/>')
    return ""


def build_architecture(stats: dict) -> str:
    v = stats.get("validation") or {}
    pf = stats.get("prefilter") or {}
    sc = stats.get("scoring") or {}
    w, h = 1150, 470
    s = _open(w, h, "Ariston architecture", """
  .st { }
""")
    s += aurora(w, h)
    s += grid(w, h, step=52, opacity=0.045)
    s += text(w - 40, 44, "معماری — پنج ایستگاه، یک خروجی زنده", 21, TXT, anchor="end", weight=800, fa=True)
    s += text(w - 40, 68, "FIVE STATIONS, ONE LIVE OUTPUT", 10.5, MINT, anchor="end", mono=True, weight=700, spacing="3")
    # cron badge
    s += panel(30, 22, 226, 40, rx=20, stroke=GOLD)
    s += f'{live_dot(54, 42, GOLD, 4)}'
    s += text(70, 47, "هر ساعت رأس 07:00 UTC", 13, GOLD, anchor="start", weight=700, fa=True)

    stations = [
        ("sat", "جمع‌آوری", "COLLECTOR", fmt(stats.get("raw", 0)), "خام از منابع", MINT),
        ("funnel", "استانداردسازی", "NORMALIZER", fmt(stats.get("unique", 0)), "یکتا · بدون تکرار", SKY),
        ("shield", "اعتبارسنجی", "VALIDATOR", fmt(v.get("probed", 0)), "پروب دو-موتوره", VIOLET),
        ("medal", "امتیازدهی", "SCORER", fmt(v.get("alive", 0)), "زنده و رده‌بندی‌شده", GOLD),
        ("pkg", "انتشار", "PUBLISHER", "07:00", "data branch · هر ساعت", ROSE),
    ]
    cw, ch, y0 = 196, 148, 122
    xs = [30 + i * (cw + 27) for i in range(5)]
    for (icon, fa, en, val, sub, col), x in zip(stations, xs):
        s += panel(x, y0, cw, ch, rx=18, stroke=col)
        s += f'<rect x="{x}" y="{y0}" width="{cw}" height="4" rx="2" fill="{col}" opacity=".8"/>'
        s += _glyph(icon, col, x + cw / 2, y0 + 38)
        s += text(x + cw / 2, y0 + 74, fa, 16, TXT, weight=800, fa=True)
        s += text(x + cw / 2, y0 + 92, en, 9.5, col, mono=True, weight=700, spacing="2.2")
        s += text(x + cw / 2, y0 + 120, val, 17, col, weight=800, mono=True)
        s += text(x + cw / 2, y0 + 138, sub, 10.5, FAINT, fa=True)
    for i in range(4):
        s += flow_line(xs[i] + cw + 3, y0 + ch / 2 - 8, xs[i + 1] - 3, y0 + ch / 2 - 8,
                       [MINT, SKY, VIOLET, GOLD][i], 2.2)

    # inputs feeding the collector
    for i, (src, yy) in enumerate([("GitHub feeds", y0 + 18), ("Telegram channels", y0 + 62)]):
        yy2 = y0 + 18 + i * 44
        s += panel(30, 86 + i * 0, 0, 0)  # no-op keep shape simple
    s += text(xs[0] + cw / 2, y0 - 12, "GitHub · Telegram · ۱۸۱ منبع", 11.5, MUT, fa=True)

    # outputs panel
    oy, oh = 312, 130
    s += panel(30, oy, w - 60, oh, rx=18, stroke=LINE)
    s += text(w - 54, oy + 30, "خروجی‌های هر اجرا", 15, TXT, anchor="end", weight=800, fa=True)
    s += text(w - 54, oy + 50, "PUBLISHED EVERY RUN", 9, FAINT, anchor="end", mono=True, spacing="2")
    files = [
        ("gold.txt", GOLD), ("silver.txt", SILVER), ("validated.txt", MINT), ("nodes.txt", VIOLET),
        ("mihomo.yaml", SKY), ("singbox.json", MINT), ("by-operator/", AMBER), ("results.json", FAINT),
    ]
    fx, fy = 54, oy + 34
    for i, (f, col) in enumerate(files):
        col_x = fx + (i % 4) * 190
        col_y = fy + (i // 4) * 42
        s += (f'<rect x="{col_x}" y="{col_y}" width="176" height="30" rx="9" fill="{col}10" stroke="{col}" '
              f'stroke-opacity=".45" stroke-width="1.1"/>')
        s += (f'<rect x="{col_x + 10}" y="{col_y + 8}" width="14" height="14" rx="3" fill="none" stroke="{col}" '
              f'stroke-width="1.4"/>')
        s += text(col_x + 32, col_y + 20, f, 11.5, col, anchor="start", weight=700, mono=True)
    # flowing data into outputs
    s += flow_line(xs[4] + cw / 2, y0 + ch + 3, w - 320, oy - 2, ROSE, 2.0, slow=True, curve=1)
    s += f'{particles(w, h, n=14, seed=11, col=SKY)}'
    s += text(40, h - 18, "gather → normalize → validate → score → publish", 11, FAINT, anchor="start", mono=True)
    s += text(w - 40, h - 18, "نگهداری در شاخهٔ data — بدون بادکردن تاریخچه", 11, FAINT, anchor="end", fa=True)
    s += "</svg>"
    return s
