#!/usr/bin/env python3
"""Ariston brand SVG generator.

All text is converted to outlines (fonts live in assets/fonts, OFL licensed),
so the SVGs look identical inside <img> on GitHub with no external fonts.
Every asset is written twice: assets/dark/NAME.svg and assets/light/NAME.svg.

  pip install fonttools uharfbuzz
  python pipeline/brand_svg.py                      # static assets
  python pipeline/brand_svg.py --stats stats.json   # + live run-card
stats.json: {"total":0,"validated":0,"silver":0,"gold":0,"updated":"07:00 UTC"}
"""
import argparse, json, pathlib
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = ROOT / "assets" / "fonts"
RAW = "https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data"


def n(v):
    s = f"{v:.1f}"
    return s[:-2] if s.endswith(".0") else s


class Font:
    def __init__(self, fname):
        p = FONTS / fname
        self.tt = TTFont(p)
        self.gs = self.tt.getGlyphSet()
        self.order = self.tt.getGlyphOrder()
        self.upem = self.tt["head"].unitsPerEm
        self.font = hb.Font(hb.Face(hb.Blob.from_file_path(str(p))))

    def shape(self, text, size, x, y, anchor="start", rtl=False, track=0.0):
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        if rtl:
            buf.direction, buf.script, buf.language = "rtl", "Arab", "fa"
        hb.shape(self.font, buf, {"kern": True, "liga": True})
        k = size / self.upem
        gi, gp = buf.glyph_infos, buf.glyph_positions
        total = sum(p.x_advance for p in gp) * k + track * max(len(gi) - 1, 0)
        cx = x if anchor == "start" else x - total / 2 if anchor == "middle" else x - total
        pen = SVGPathPen(self.gs, ntos=n)
        for i, p in zip(gi, gp):
            tp = TransformPen(pen, (k, 0, 0, -k, cx + p.x_offset * k, y - p.y_offset * k))
            self.gs[self.order[i.codepoint]].draw(tp)
            cx += p.x_advance * k + track
        return pen.getCommands(), total


F = {}


def font(name):
    if name not in F:
        F[name] = Font(name)
    return F[name]


class P:  # palette
    def __init__(s, **k): s.__dict__.update(k)


DARK = P(name="dark", bg="#14110C", surf="#1E1A13", line="#4A3F27", text="#F3ECDD", mute="#A8946A",
         gold="#E8C872", silver="#C0C6CC", bronze="#B87333", olive="#7A8450", key="#C9A24A", onfill="#14110C")
LIGHT = P(name="light", bg="#F5EFE2", surf="#FBF7EE", line="#D9CDB0", text="#2B2118", mute="#6E5A3C",
          gold="#7A5C14", silver="#5F6772", bronze="#8F4F1A", olive="#556034", key="#9A7418", onfill="#FBF7EE")


def T(txt, fnt, size, x, y, fill, anchor="start", rtl=False, track=0.0, op=None):
    d, w = font(fnt).shape(txt, size, x, y, anchor, rtl, track)
    o = f' opacity="{op}"' if op else ""
    return f'<path d="{d}" fill="{fill}"{o}/>', w


def t(*a, **k):
    return T(*a, **k)[0]


CIN, INT, VAZ, VAZM = "Cinzel-SemiBold.ttf", "Inter-Medium.ttf", "Vazirmatn-Regular.ttf", "Vazirmatn-Medium.ttf"

STYLE = ("<style>.p{transform-box:fill-box;transform-origin:center;animation:p 3.6s ease-in-out infinite}"
         "@keyframes p{0%,100%{opacity:.6;transform:scale(1)}50%{opacity:1;transform:scale(1.22)}}"
         ".f{stroke-dasharray:3 9;animation:f 5s linear infinite}@keyframes f{to{stroke-dashoffset:-48}}"
         ".k{animation:k 9s ease-in-out infinite}@keyframes k{0%,100%{opacity:.3}50%{opacity:.65}}"
         "@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>")


def svg(w, h, body, c, title):
    pat = (f'<pattern id="mk" width="20" height="14" patternUnits="userSpaceOnUse">'
           f'<path d="M0 14V0H14V10H5V5H9" fill="none" stroke="{c.key}" stroke-width="2"/></pattern>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'role="img" aria-label="{title}"><title>{title}</title><defs>{pat}</defs>{STYLE}{body}</svg>')


def rect(w, h, fill, stroke=None, r=12, x=0, y=0):
    s = f' stroke="{stroke}" stroke-width="1"' if stroke else ""
    return f'<rect x="{x + .5}" y="{y + .5}" width="{w - 1}" height="{h - 1}" rx="{r}" fill="{fill}"{s}/>'


def meander(x, y, w, c):
    return f'<rect class="k" x="{x}" y="{y}" width="{w}" height="14" fill="url(#mk)"/>'


def node(cx, cy, r, fill, delay=None):
    if delay is None:
        return f'<circle cx="{n(cx)}" cy="{n(cy)}" r="{r}" fill="{fill}"/>'
    return f'<circle class="p" style="animation-delay:{delay}s" cx="{n(cx)}" cy="{n(cy)}" r="{r}" fill="{fill}"/>'


def mark(c, x, y, size, anim=False):
    k = size / 120
    d = (lambda s: s) if anim else (lambda s: None)
    return (f'<g transform="translate({n(x)} {n(y)}) scale({k:.4f})">'
           f'<path d="M20 100L33 72L60 14L87 72L100 100M33 72H87" fill="none" stroke="{c.gold}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>'
           + node(60, 14, 8, c.gold, 0 if anim else None)
           + node(33, 72, 5.5, c.silver, .6 if anim else None) + node(87, 72, 5.5, c.silver, .9 if anim else None)
           + node(60, 72, 3.5, c.silver)
           + node(20, 100, 6, c.bronze, 1.4 if anim else None) + node(100, 100, 6, c.bronze, 1.7 if anim else None)
           + '</g>')


def tier_color(c, k):
    return {"gold": c.gold, "silver": c.silver, "bronze": c.bronze, "olive": c.olive, "text": c.text}[k]


# ---------------------------------------------------------------- assets
def banner(c):
    w, h = 1280, 340
    pts = [(930, 70), (1020, 130), (1100, 62), (1170, 122), (1235, 78), (1050, 205), (1130, 190), (1215, 180), (940, 190)]
    edges = [(0, 1), (1, 2), (2, 3), (3, 4), (1, 5), (5, 6), (6, 7), (3, 7), (1, 8), (5, 8)]
    cols = [c.gold, c.silver, c.bronze]
    b = rect(w, h, c.bg, c.line, 16)
    b += meander(40, 22, w - 80, c) + meander(40, h - 36, w - 80, c)
    for a, z in edges:
        b += f'<line class="f" x1="{pts[a][0]}" y1="{pts[a][1]}" x2="{pts[z][0]}" y2="{pts[z][1]}" stroke="{c.key}" stroke-width="1.5" opacity=".45"/>'
    for i, (px, py) in enumerate(pts):
        b += node(px, py, 6 if i % 3 == 0 else 4.5, cols[i % 3], round(i * .45, 2))
    b += mark(c, 64, 92, 150, True)
    b += t("ARISTON", CIN, 84, 250, 176, c.gold, track=14)
    b += t("ἄριστον  ·  THE BEST", INT, 20, 254, 220, c.mute, track=5)
    b += t("HOURLY-VALIDATED NODE POOL", INT, 15, 254, 252, c.text, track=4, op=.8)
    b += t("گره‌های سالم، هر ساعت پالایش می‌شود", VAZ, 24, 1216, 276, c.text, "end", rtl=True)
    return svg(w, h, b, c, "Ariston — hourly validated nodes")


def run_card(c, s=None):
    s = s or {}
    g = lambda k: str(s.get(k, "—"))
    tiles = [("total", "همه گره‌ها", "ALL UNIQUE", "text"), ("validated", "تأییدشده", "VALIDATED", "olive"),
             ("silver", "رده نقره", "SILVER", "silver"), ("gold", "رده طلا", "GOLD", "gold"),
             ("updated", "آخرین اجرا", "LAST RUN", "text")]
    w, h = 1280, 230
    b = rect(w, h, c.bg, c.line, 16) + meander(40, 18, w - 80, c)
    b += node(56, 62, 5, c.olive, 0)
    b += t("LATEST RUN · LIVE STATS", INT, 14, 72, 67, c.mute, track=3)
    b += t("آمار زنده — از آخرین اجرای واقعی", VAZ, 20, 1240, 67, c.mute, "end", rtl=True)
    tw, gap = 227, 16
    for i, (k, fa, en, col) in enumerate(tiles):
        x = 40 + i * (tw + gap)
        b += rect(tw, 112, c.surf, c.line, 12, x, 88)
        val = g(k)
        size = 50 if k != "updated" else 30
        b += t(val, CIN, size, x + tw / 2, 144, tier_color(c, col), "middle")
        b += t(fa, VAZM, 20, x + tw / 2, 174, c.text, "middle", rtl=True)
        b += t(en, INT, 11, x + tw / 2, 192, c.mute, "middle", track=2.5)
    return svg(w, h, b, c, "Latest pipeline run statistics")


def quickstart(c):
    w, h = 1280, 270
    steps = [("لینک را کپی کنید", "gold.txt · validated.txt · nodes.txt", "gold"),
             ("در اپ اضافه کنید", "v2rayNG · Hiddify · NekoBox · Streisand", "silver"),
             ("وصل شوید", "UPDATED EVERY HOUR", "bronze")]
    b = rect(w, h, c.bg, c.line, 16) + meander(40, 18, w - 80, c)
    cw, gap = 380, 30
    for i, (fa, sub, col) in enumerate(steps):
        x = 40 + i * (cw + gap)
        b += rect(cw, 170, c.surf, c.line, 12, x, 58)
        if i:
            b += f'<line class="f" x1="{x - gap + 4}" y1="143" x2="{x - 4}" y2="143" stroke="{c.key}" stroke-width="2"/>'
        cx = x + cw / 2
        b += f'<circle cx="{cx}" cy="98" r="22" fill="none" stroke="{tier_color(c, col)}" stroke-width="2"/>'
        b += t(str(i + 1), CIN, 26, cx, 107, tier_color(c, col), "middle")
        b += t(fa, VAZM, 28, cx, 168, c.text, "middle", rtl=True)
        b += t(sub, INT, 13, cx, 200, c.mute, "middle", track=1.2)
    return svg(w, h, b, c, "Quick start in three steps")


def proof(c):
    w, h = 1280, 340
    layers = [("۱", "اتصال", "REACHABLE"), ("۲", "دست‌دهی", "HANDSHAKE"), ("۳", "ترافیک واقعی", "REAL TRAFFIC")]
    b = rect(w, h, c.bg, c.line, 16) + meander(40, 18, w - 80, c)
    b += t("سه لایه آزمون، دو موتور مستقل", VAZM, 26, w / 2, 76, c.text, "middle", rtl=True)
    tw, gap = 340, 40
    x0 = (w - 3 * tw - 2 * gap) / 2
    for i, (num, fa, en) in enumerate(layers):
        x = x0 + i * (tw + gap)
        b += rect(tw, 96, c.surf, c.line, 12, x, 100)
        if i:
            b += f'<line class="f" x1="{x - gap + 6}" y1="148" x2="{x - 6}" y2="148" stroke="{c.key}" stroke-width="2"/>'
        col = [c.bronze, c.silver, c.gold][i]
        b += node(x + 40, 148, 16, col, i * .5)
        b += t(fa, VAZM, 24, x + 76, 146, c.text, rtl=True)
        b += t(en, INT, 12, x + 76, 172, c.mute, track=2.5)
    for j, name in enumerate(["xray-core", "sing-box"]):
        ex = w / 2 + (j - .5) * 240 - 100
        b += rect(200, 56, c.surf, c.gold, 28, ex, 236)
        b += t(name, INT, 20, ex + 100, 271, c.gold, "middle", track=1)
    b += f'<path d="M{w/2-260} 214V224H{w/2+260}V214" fill="none" stroke="{c.key}" stroke-width="1.5" opacity=".6"/>'
    return svg(w, h, b, c, "Three-layer validation with two engines")


def protocols(c):
    w, h = 1280, 170
    names = ["VLESS", "VMESS", "TROJAN", "SS", "SSR", "HY2", "TUIC"]
    b = rect(w, h, c.bg, c.line, 16) + meander(40, 18, w - 80, c)
    b += t("SUPPORTED PROTOCOLS", INT, 13, 56, 70, c.mute, track=4)
    cw, gap = 158, 14
    x0 = (w - 7 * cw - 6 * gap) / 2
    cols = [c.gold, c.silver, c.bronze]
    for i, nm in enumerate(names):
        x = x0 + i * (cw + gap)
        b += rect(cw, 56, c.surf, c.line, 28, x, 88)
        b += node(x + 28, 116, 5, cols[i % 3], i * .4)
        b += t(nm, INT, 18, x + 46, 123, c.text)
    return svg(w, h, b, c, "Supported protocols")


def architecture(c):
    w, h = 1280, 300
    st = [("جمع‌آوری", "COLLECT", c.bronze), ("استانداردسازی", "NORMALIZE", c.bronze), ("حذف تکراری", "DEDUPE", c.silver),
          ("آزمون", "TEST", c.silver), ("انتشار", "PUBLISH", c.gold)]
    b = rect(w, h, c.bg, c.line, 16) + meander(40, 18, w - 80, c)
    xs = [140 + i * 250 for i in range(5)]
    for i in range(4):
        b += f'<line class="f" x1="{xs[i] + 36}" y1="130" x2="{xs[i + 1] - 36}" y2="130" stroke="{c.key}" stroke-width="2"/>'
    for i, (fa, en, col) in enumerate(st):
        x = xs[i]
        b += f'<circle cx="{x}" cy="130" r="30" fill="{c.surf}" stroke="{col}" stroke-width="2"/>'
        b += t(str(i + 1), CIN, 26, x, 139, col, "middle")
        b += t(fa, VAZM, 22, x, 205, c.text, "middle", rtl=True)
        b += t(en, INT, 12, x, 232, c.mute, "middle", track=3)
    b += node(xs[4], 130, 36, "none") .replace('fill="none"', f'fill="none" stroke="{c.gold}" stroke-width="1" opacity=".5"').replace('r="36"', 'r="38"')
    return svg(w, h, b, c, "Five-station pipeline")


def tier(c, key):
    meta = {"gold": ("GOLD", "رده طلا", "بهترین کیفیت", "gold"), "silver": ("SILVER", "رده نقره", "کیفیت خوب", "silver"),
            "validated": ("VALIDATED", "تأییدشده", "متعادل · پیشنهادی", "olive"), "all": ("ALL NODES", "همه گره‌ها", "تمام گره‌های یکتا", "text")}
    en, fa, sub, col = meta[key]
    w, h = 420, 104
    cc = tier_color(c, col)
    b = rect(w, h, c.surf, c.line, 14)
    b += f'<circle cx="52" cy="52" r="22" fill="none" stroke="{cc}" stroke-width="2"/>' + node(52, 52, 9, cc, 0)
    b += t(en, CIN, 28, 96, 54, cc, track=3)
    b += t(fa + " · " + sub, VAZ, 18, 96, 82, c.text, rtl=True)
    return svg(w, h, b, c, f"Tier {en.title()}")


def btn(c, kind):
    w, h = 104, 40
    b = rect(w, h, c.bg, c.key, 20)
    b += t("متن", VAZM, 18, w / 2, 27, c.gold, "middle", rtl=True) if kind == "text" else t("Base64", INT, 15, w / 2, 26, c.gold, "middle")
    return svg(w, h, b, c, "Text" if kind == "text" else "Base64")


def client(c, kind):
    nm, sub = ("Clash Verge · Mihomo", "mihomo.yaml") if kind == "mihomo" else ("sing-box · SFI · SFA", "singbox.json")
    w, h = 340, 100
    b = rect(w, h, c.surf, c.line, 14) + node(44, 50, 7, c.gold, 0) + node(44, 50, 18, "none").replace('fill="none"', f'fill="none" stroke="{c.key}" stroke-width="1.5"')
    b += t(sub, INT, 24, 84, 48, c.gold) + t(nm, INT, 14, 84, 76, c.mute, track=1.5)
    return svg(w, h, b, c, sub)


OPS = [("irancell", "ایرانسل"), ("mci", "همراه اول"), ("tci", "مخابرات"), ("rightel", "رایتل"), ("pishgaman", "پیشگامان"),
       ("shatel", "شاتل"), ("mobinnet", "مبین‌نت"), ("asiatech", "آسیاتک"), ("parsonline", "پارس‌آنلاین"),
       ("respina", "رسپینا"), ("ir-other", "سایر شبکه‌های ایران")]


def operator(c, code, fa):
    w, h = 250, 64
    b = rect(w, h, c.surf, c.line, 12) + node(28, 32, 6, c.olive, (len(code) % 5) * .5)
    b += t(fa, VAZM, 20, 48, 31, c.text, rtl=True) + t(code.upper(), INT, 11, 48, 50, c.mute, track=2.5)
    return svg(w, h, b, c, fa)


LANGS = [("fa", "فارسی", True), ("en", "English", False), ("tr", "Türkçe", False), ("ru", "Русский", False), ("zh", "中文", False)]


def lang(c, code, label, on):
    w, h = 104, 36
    fill, col = (c.gold, c.onfill) if on else (c.bg, c.mute)
    b = rect(w, h, fill, c.key if not on else c.gold, 18)
    if code == "zh":
        b += f'<text x="{w/2}" y="24" text-anchor="middle" font-size="15" fill="{col}" font-family="Noto Sans SC,PingFang SC,Microsoft YaHei,sans-serif">{label}</text>'
    elif code == "fa":
        b += t(label, VAZM, 16, w / 2, 24, col, "middle", rtl=True)
    else:
        b += t(label, INT, 14, w / 2, 24, col, "middle")
    return svg(w, h, b, c, label)


def all_assets(stats=None):
    A = {"banner": banner, "run-card": lambda c: run_card(c, stats), "quickstart": quickstart, "proof": proof,
         "protocols": protocols, "architecture": architecture, "btn-text": lambda c: btn(c, "text"),
         "btn-b64": lambda c: btn(c, "b64"), "client-mihomo": lambda c: client(c, "mihomo"),
         "client-singbox": lambda c: client(c, "singbox")}
    for k in ("gold", "silver", "validated", "all"):
        A[f"tier-{k}"] = (lambda kk: lambda c: tier(c, kk))(k)
    for code, fa in OPS:
        A[f"op-{code}"] = (lambda cd, f: lambda c: operator(c, cd, f))(code, fa)
    for code, label, on in LANGS:
        A[f"lang-{code}-on"] = (lambda cd, lb: lambda c: lang(c, cd, lb, True))(code, label)
        A[f"lang-{code}"] = (lambda cd, lb: lambda c: lang(c, cd, lb, False))(code, label)
    return A


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "assets"))
    ap.add_argument("--stats")
    ap.add_argument("--only", help="comma separated asset names, e.g. run-card")
    a = ap.parse_args()
    stats = json.load(open(a.stats)) if a.stats else None
    only = set(a.only.split(",")) if a.only else None
    out = pathlib.Path(a.out)
    for c in (DARK, LIGHT):
        d = out / c.name
        d.mkdir(parents=True, exist_ok=True)
        for name, fn in all_assets(stats).items():
            if only and name not in only:
                continue
            (d / f"{name}.svg").write_text(fn(c), encoding="utf-8")
    print("done")


if __name__ == "__main__":
    main()
