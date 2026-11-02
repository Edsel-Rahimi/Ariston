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
import argparse, json, math, pathlib
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

STYLE = ("<style>"
         ".p{transform-box:fill-box;transform-origin:center;animation:p 3.6s ease-in-out infinite}"
         "@keyframes p{0%,100%{opacity:.6;transform:scale(1)}50%{opacity:1;transform:scale(1.22)}}"
         ".f{stroke-dasharray:3 9;animation:f 5s linear infinite}@keyframes f{to{stroke-dashoffset:-48}}"
         ".k{animation:k 9s ease-in-out infinite}@keyframes k{0%,100%{opacity:.3}50%{opacity:.65}}"
         ".b{animation:b 2.2s ease-in-out infinite}@keyframes b{0%,100%{opacity:1}50%{opacity:.25}}"
         ".r{opacity:0;animation:r .9s cubic-bezier(.22,.61,.36,1) both}"
         "@keyframes r{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}"
         ".s{animation:s 7s cubic-bezier(.45,0,.2,1) infinite}"
         "@keyframes s{0%{transform:translateX(0);opacity:0}6%{opacity:.9}26%{transform:translateX(var(--sw,1100px));opacity:0}"
         "100%{transform:translateX(var(--sw,1100px));opacity:0}}"
         ".q{animation:q 4.2s ease-in-out infinite}@keyframes q{0%,100%{opacity:.5}12%,32%{opacity:1}}"
         ".o{transform-box:fill-box;transform-origin:center;animation:o 16s linear infinite}"
         "@keyframes o{to{transform:rotate(360deg)}}"
         ".d{opacity:0;animation:d 1s ease-out both}@keyframes d{from{opacity:0}to{opacity:1}}"
         ".w{animation:w 4.9s ease-in-out infinite}@keyframes w{0%,100%{opacity:.55}14%,42%{opacity:1}}"
         ".pk{animation:pk 4s linear infinite}@keyframes pk{from{transform:translateX(0)}to{transform:translateX(250px)}}"
         ".f2{stroke-dasharray:10 14;animation:f 2.4s linear infinite}"
         "@media (prefers-reduced-motion:reduce){*{animation:none!important}.r,.d{opacity:1!important}}"
         "</style>")


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


def sheen(c, x, y, w, h, travel, rx=8):
    """Gold light-band sweeping left→right across the given zone (CSS var --sw)."""
    g = ('<linearGradient id="sh" x1="0" y1="0" x2="1" y2="0">'
         f'<stop offset="0" stop-color="{c.gold}" stop-opacity="0"/>'
         f'<stop offset=".5" stop-color="{c.gold}" stop-opacity=".26"/>'
         f'<stop offset="1" stop-color="{c.gold}" stop-opacity="0"/></linearGradient>')
    band = (f'<rect class="s" style="--sw:{n(travel)}px" x="{x}" y="{y}" '
            f'width="{w}" height="{h}" rx="{rx}" fill="url(#sh)"/>')
    return f'<defs>{g}</defs>{band}'


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
    return {"gold": c.gold, "silver": c.silver, "bronze": c.bronze, "olive": c.olive, "text": c.text, "key": c.key}[k]


# ---------------------------------------------------------------- logo D12.1
# The real ARISTON emblem + wordmark, embedded as vectors from the brand file
# (assets/logo/ariston-logo.svg, viewBox 1254). Theme colors are substituted
# so the mark stays readable on both charcoal and marble.
EMBLEM_W = ("M627 253L608 362L513 455L537 519L341 735Z", "M627 253L646 362L741 455L717 519L913 735Z")
EMBLEM_T = ("M513 455L627 396L741 455L710 486L627 444L549 486Z",   # bronze tier
            "M554 508L627 472L700 508L678 540L627 513L576 540Z",   # silver tier
            "M582 559L627 541L672 559L627 644Z")                    # gold tier
EMBLEM_PT = "M624 644H630V675H624Z"
# EMBLEM bbox: x 341..913 (w 572), y 253..712 (h 459) · wordmark bbox: x 222..1032 (w 810), y 797..873
WORD_D = (
 "M298.345 869.91C293.395 869.58 292.295 868.48 288.445 860.34L261.055 797.86H258.855L235.975 851.87C228.935 867.93 227.615 869.69 222.335 869.91V872.0H244.115V869.91C238.835 869.91 236.635 868.59 236.635 865.4C236.635 864.08 236.965 862.54 237.51500000000001 861.11L242.575 848.24H271.395L275.905 858.8C277.225 861.77 277.995 864.63 277.995 866.17C277.995 868.92 276.125 869.8 270.295 869.91V872.0H298.345ZM244.445 843.73 257.095 813.48 269.855 843.73Z",
 "M428.595 869.91C424.415 869.58 422.21500000000003 868.48 419.02500000000003 864.74L396.365 836.91C410.33500000000004 834.16 416.27500000000003 828.66 416.27500000000003 818.54C416.27500000000003 813.81 414.845 809.74 411.985 806.55C407.805 802.04 398.565 799.18 388.33500000000004 799.18H357.975V801.27C366.115 802.15 367.21500000000003 803.14 367.32500000000005 811.17V858.8C367.21500000000003 868.15 366.225 869.25 357.975 869.91V872.0H388.44500000000005V869.91C379.975 869.36 378.65500000000003 868.04 378.545 860.01V838.34L384.70500000000004 838.12L410.885 872.0H428.595ZM378.545 807.21C378.545 804.13 379.755 803.25 384.15500000000003 803.25C397.90500000000003 803.25 404.285 807.98 404.285 818.32C404.285 823.82 401.975 828.44 398.01500000000004 830.53C392.95500000000004 833.39 389.105 834.05 378.545 834.27Z",
 "M487.45500000000004 872.0H520.125V869.91C511.105 869.69 509.565 868.15 509.345 860.01V811.17C509.565 802.92 510.995 801.6 520.125 801.27V799.18H487.45500000000004V801.27C496.805 801.8199999999999 498.01500000000004 802.92 498.125 811.17V860.01C498.01500000000004 868.37 496.69500000000005 869.58 487.45500000000004 869.91V872.0Z",
 "M627.275 797.64H624.965C624.525 800.06 623.315 801.38 621.445 801.38C620.345 801.38 618.475 800.94 616.605 800.06C612.535 798.52 608.465 797.64 604.835 797.64C600.215 797.64 595.375 799.51 591.745 802.7C587.895 806.11 585.915 810.73 585.915 816.45C585.915 825.25 590.755 831.41 603.075 837.9C610.995 842.19 616.715 846.59 619.465 850.77C620.455 852.2 621.005 854.51 621.005 857.26C621.005 864.52 615.505 869.58 607.475 869.58C597.575 869.58 590.755 863.53 585.255 850.11H582.725L586.025 873.43H588.445C588.5550000000001 871.34 589.875 869.8 591.525 869.8C592.735 869.8 594.605 870.24 596.695 871.01C600.875 872.66 605.385 873.54 609.6750000000001 873.54C622.4350000000001 873.54 632.115 864.85 632.115 853.41C632.115 844.39 626.065 837.35 611.5450000000001 829.43C599.995 823.16 595.375 818.32 595.375 812.27C595.375 806.22 599.995 802.15 606.815 802.15C611.765 802.15 616.385 804.24 620.235 808.2C623.645 811.72 625.1850000000001 814.58 626.945 821.07H629.695Z",
 "M744.985 869.91C735.965 869.47 734.535 868.15 734.425 860.01V803.8H740.365C753.125 804.02 755.435 805.89 757.855 817.88H760.495L759.835 799.18H697.795L697.135 817.88H699.775C702.305 805.89 704.615 804.02 717.265 803.8H723.205V858.8C723.095 868.26 722.105 869.36 712.865 869.91V872.0H744.985Z",
 "M858.1850000000001 797.64C837.1750000000001 797.64 822.215 813.37 822.215 835.59C822.215 845.93 825.735 856.05 831.6750000000001 862.32C838.0550000000001 869.25 847.845 873.54 857.525 873.54C879.195 873.54 894.155 858.25 894.155 836.03C894.155 825.14 890.965 815.68 884.915 809.19C877.985 801.6 868.745 797.64 858.1850000000001 797.64ZM858.1850000000001 801.6C863.245 801.6 868.3050000000001 803.58 872.265 807.1C878.205 812.49 881.615 822.83 881.615 835.92C881.615 842.41 880.2950000000001 850.0 877.985 855.72C876.995 858.47 875.125 861.22 872.595 863.75C868.745 867.6 863.7950000000001 869.58 857.965 869.58C852.905 869.58 847.955 867.6 843.995 864.19C838.385 859.13 834.755 848.02 834.755 835.81C834.755 824.59 837.835 813.92 842.455 808.75C846.745 804.02 852.135 801.6 858.1850000000001 801.6Z",
 "M1031.665 799.18H1005.8149999999999V801.27C1014.615 801.8199999999999 1016.045 803.69 1016.375 815.35V852.42L974.025 799.18H955.215V801.27C959.9449999999999 801.27 961.485 802.15 965.885 807.3199999999999V855.83C965.665 867.49 964.235 869.36 955.215 869.91V872.0H981.0649999999999V869.91C972.595 869.47 970.9449999999999 867.16 970.725 855.83V812.71L1019.345 873.21H1021.215V815.35C1021.545 803.91 1022.975 802.04 1031.665 801.27Z")


def emblem(c, x, y, size, anim=False):
    """The A-shaped filter emblem at (x, y) top-left, `size` px tall."""
    k = size / 459.0
    g = f'<g transform="translate({n(x)} {n(y)}) scale({k:.5f}) translate(-341 -253)">'
    g += ''.join(f'<path d="{d}" fill="{c.gold}"/>' for d in EMBLEM_W)
    g += f'<path d="{EMBLEM_T[0]}" fill="{c.bronze}"/>'
    g += f'<path d="{EMBLEM_T[1]}" fill="{c.silver}"/>'
    g += f'<path d="{EMBLEM_T[2]}" fill="{c.key}"/>'
    pt = f'<path d="{EMBLEM_PT}" fill="{c.gold}"/>'
    dot = f'<circle cx="627" cy="693" r="19" fill="{c.gold}"/>'
    if anim:
        pt = f'<g class="p">{pt}</g>'
        dot = f'<g class="p" style="animation-delay:.7s">{dot}</g>'
    return g + pt + dot + '</g>'


def halo(c, cx, cy, r, dur="18s", op=.5):
    return (f'<circle class="o" style="animation-duration:{dur}" cx="{n(cx)}" cy="{n(cy)}" r="{n(r)}" '
            f'fill="none" stroke="{c.key}" stroke-width="1.2" stroke-dasharray="5 9" opacity="{op}"/>')


def wordmark(c, x, y, w_target, fill=None):
    """ARISTON letterforms from the brand file, `w_target` px wide, (x, y) top-left."""
    k = w_target / 810.0
    d = ''.join(f'<path d="{p}" fill="{fill or c.text}"/>' for p in WORD_D)
    return f'<g transform="translate({n(x)} {n(y)}) scale({k:.5f}) translate(-222 -797)">{d}</g>'


def keymotif(c, cx, cy, s=1.0, col=None, anim=True):
    """Greek-key divider from the brand file, centered on (cx, cy)."""
    col = col or c.key
    g = f'<g transform="translate({n(cx)} {n(cy)}) scale({s:.4f}) translate(-624.5 -940.5)"'
    g += ' class="k"' if anim else ''
    g += '>'
    g += f'<path d="M397 940L567 936L567 944Z" fill="{col}"/>'
    g += f'<path d="M857 940L687 936L687 944Z" fill="{col}"/>'
    g += (f'<path d="M590 916H659V965H590V940H636V951H612V929H647V941H624" '
          f'fill="none" stroke="{col}" stroke-width="6" stroke-linecap="square"/>')
    return g + '</g>'


def chip(c, x, y, w, h, label, value, col, delay=0.0):
    """Small stat chip: EN label on top, outlined value below (staggered fade)."""
    b = f'<g class="d" style="animation-delay:{delay:.2f}s">'
    b += rect(w, h, c.surf, c.line, 12, x, y)
    b += f'<rect x="{x}" y="{y}" width="{w}" height="3" rx="1.5" fill="{col}" opacity=".8"/>'
    b += t(label, INT, 9.5, x + w / 2, y + 20, c.mute, "middle", track=2)
    vp, _ = T(value, CIN, 21, x + w / 2, y + 44, col, "middle")
    b += vp + '</g>'
    return b


# ---------------------------------------------------------------- assets
def banner(c, s=None):
    """D12.1 hero — the real emblem + brand wordmark + greek key + live chips."""
    s = s or {}
    g_ = lambda k: str(s.get(k, "—"))
    w, h = 1280, 380
    pts = [(948, 78), (1030, 132), (1104, 66), (1172, 126), (1236, 82), (1064, 206), (1140, 192), (1218, 182), (956, 196)]
    edges = [(0, 1), (1, 2), (2, 3), (3, 4), (1, 5), (5, 6), (6, 7), (3, 7), (1, 8), (5, 8)]
    cols = [c.gold, c.silver, c.bronze]
    b = rect(w, h, c.bg, c.line, 16)
    b += meander(40, 20, w - 80, c) + meander(40, h - 36, w - 80, c)
    for a, z in edges:
        b += f'<line class="f" x1="{pts[a][0]}" y1="{pts[a][1]}" x2="{pts[z][0]}" y2="{pts[z][1]}" stroke="{c.key}" stroke-width="1.5" opacity=".35"/>'
    for i, (px, py) in enumerate(pts):
        b += node(px, py, 6 if i % 3 == 0 else 4.5, cols[i % 3], round(i * .45, 2))
    # left: the real emblem inside a slow rotating halo
    b += halo(c, 211, 184, 136, "20s")
    b += f'<circle cx="211" cy="184" r="120" fill="{c.surf}" opacity=".55"/>'
    b += emblem(c, 64, 66, 236, True)
    # center: brand wordmark + greek key + taglines
    b += sheen(c, 390, 56, 90, 270, 880)
    b += wordmark(c, 396, 96, 450)
    b += keymotif(c, 621, 208, .85)
    b += t("ἄριστον · THE BEST — TWICE-HOURLY VALIDATED NODE POOL", INT, 14.5, 396, 254, c.mute, track=3)
    b += t("گره‌های سالم، هر ۳۰ دقیقه پالایش می‌شود", VAZ, 19, 396, 301, c.text, rtl=True)
    # right-bottom: live stat chips
    b += chip(c, 758, 272, 150, 58, "GOLD", g_("gold"), c.gold, 0)
    b += chip(c, 924, 272, 150, 58, "ALIVE", g_("validated"), c.olive, .15)
    b += chip(c, 1090, 272, 150, 58, "LAST RUN", g_("updated"), c.silver, .3)
    return svg(w, h, b, c, "Ariston — the best, twice-hourly validated")


def run_card(c, s=None):
    """D12.1 telemetry style — LIVE header, HUD-bracketed tiles, tier accents."""
    s = s or {}
    g = lambda k: str(s.get(k, "—"))
    tiles = [("total", "همه گره‌ها", "ALL UNIQUE", "text"), ("validated", "تأییدشده", "VALIDATED", "olive"),
             ("silver", "رده نقره", "SILVER", "silver"), ("gold", "رده طلا", "GOLD", "gold"),
             ("updated", "آخرین اجرا", "LAST RUN", "key")]
    w, h = 1280, 250
    b = rect(w, h, c.bg, c.line, 16) + meander(40, 18, w - 80, c)
    b += f'<circle class="b" cx="56" cy="63" r="5" fill="{c.olive}"/>'
    b += t("LIVE TELEMETRY — EVERY 30 MIN", INT, 14, 72, 68, c.mute, track=3)
    b += t("آمار زنده — از آخرین اجرای واقعی", VAZ, 19, 1240, 68, c.mute, "end", rtl=True)
    tw, gap = 227, 16
    for i, (k, fa, en, col) in enumerate(tiles):
        x = 40 + i * (tw + gap)
        cc = tier_color(c, col)
        b += f'<g class="r" style="animation-delay:{i * .14:.2f}s">'
        b += rect(tw, 130, c.surf, c.line, 12, x, 86)
        b += f'<rect x="{x + 14}" y="{86}" width="{tw - 28}" height="3" rx="1.5" fill="{cc}" opacity=".85"/>'
        # HUD corner brackets
        for dx, dy, ddx, ddy in ((6, 6, 16, 0), (6, 6, 0, 16), (tw - 6, 6, -16, 0), (tw - 6, 6, 0, 16),
                                 (6, 124, 16, 0), (6, 124, 0, -16), (tw - 6, 124, -16, 0), (tw - 6, 124, 0, -16)):
            b += (f'<path d="M{x + dx + ddx} {86 + dy + ddy}L{x + dx} {86 + dy}" fill="none" '
                  f'stroke="{cc}" stroke-width="1.5" opacity=".45"/>' if (ddx and ddy == 0) or (ddy and ddx == 0) else '')
        val = g(k)
        size = 44 if k != "updated" else 26
        vp, _ = T(val, CIN, size, x + tw / 2, 152, cc, "middle")
        b += vp
        b += t(fa, VAZM, 19, x + tw / 2, 182, c.text, "middle", rtl=True)
        b += t(en, INT, 10.5, x + tw / 2, 202, c.mute, "middle", track=2.5)
        b += '</g>'
    return svg(w, h, b, c, "Latest pipeline run statistics")


def bank_card(c, s=None):
    """D12.1 vault style — rotating dial + the real emblem, ledger tiles right."""
    s = s or {}
    g = lambda k: str(s.get(k, "—"))
    b = rect(1280, 250, c.bg, c.line, 16) + meander(40, 18, 1200, c)
    b += f'<circle class="b" cx="286" cy="63" r="5" fill="{c.gold}"/>'
    b += t("CONFIG BANK · VAULT LEDGER", INT, 14, 302, 68, c.mute, track=3)
    b += t("بانک کانفیگ — حافظه‌ی خط تولید بین اجراها", VAZ, 19, 1240, 68, c.mute, "end", rtl=True)
    # vault dial (left)
    b += f'<circle cx="150" cy="152" r="74" fill="{c.surf}" opacity=".5"/>'
    b += f'<circle cx="150" cy="152" r="74" fill="none" stroke="{c.line}" stroke-width="1.5"/>'
    b += halo(c, 150, 152, 62, "16s", .6)
    b += f'<circle cx="150" cy="152" r="50" fill="none" stroke="{c.key}" stroke-width="1" opacity=".6"/>'
    b += emblem(c, 96, 110, 84, True)
    tiles = [("size", "خوش‌سابقه", "KNOWN-GOOD", "gold"),
             ("hit", "نرخ بازگشت", "HIT RATE", "olive"),
             ("streak", "میانگین سابقه", "AVG STREAK", "silver"),
             ("pass2", "نجات دور دوم", "PASS-2 RESCUED", "bronze"),
             ("src", "منابع سالم / مشکوک", "HEALTHY / SUSPECT", "text")]
    tw, gap = 182, 12
    for i, (k, fa, en, col) in enumerate(tiles):
        x = 292 + i * (tw + gap)
        cc = tier_color(c, col)
        b += f'<g class="r" style="animation-delay:{i * .14:.2f}s">'
        b += rect(tw, 130, c.surf, c.line, 12, x, 86)
        b += f'<rect x="{x}" y="{86}" width="4" height="130" fill="{cc}" opacity=".8"/>'
        val = g(k)
        size = 34 if k == "src" else 40
        vp, _ = T(val, CIN, size, x + tw / 2 + 2, 150, cc, "middle")
        b += vp
        b += t(fa, VAZM, 17, x + tw / 2 + 2, 180, c.text, "middle", rtl=True)
        b += t(en, INT, 9.5, x + tw / 2 + 2, 200, c.mute, "middle", track=1.8)
        b += '</g>'
    return svg(1280, 250, b, c, "Config bank status")


def quickstart(c):
    """D12.1 journey style — three stops on a marching dashed road."""
    w, h = 1280, 290
    steps = [("لینک را کپی کنید", "gold.txt · validated.txt · nodes.txt", "gold"),
             ("در اپ اضافه کنید", "v2rayNG · Hiddify · NekoBox · Streisand", "silver"),
             ("وصل شوید", "UPDATED EVERY 30 MIN", "bronze")]
    b = rect(w, h, c.bg, c.line, 16) + meander(40, 18, w - 80, c)
    cw, gap = 360, 40
    for i, (fa, sub, col) in enumerate(steps):
        x = 60 + i * (cw + gap)
        cc = tier_color(c, col)
        if i:
            b += (f'<line class="f2" x1="{x - gap + 6}" y1="116" x2="{x - 6}" y2="116" '
                  f'stroke="{c.key}" stroke-width="2" opacity=".8"/>')
        cx = x + cw / 2
        b += f'<g class="q" style="animation-delay:{i * 1.4:.2f}s">'
        b += rect(cw, 148, c.surf, c.line, 12, x, 60)
        b += halo(c, cx, 106, 34, f"{14 + i * 4}s", .55)
        b += f'<circle cx="{cx}" cy="106" r="24" fill="none" stroke="{cc}" stroke-width="2"/>'
        b += t(str(i + 1), CIN, 27, cx, 116, cc, "middle")
        b += '</g>'
        b += t(fa, VAZM, 27, cx, 172, c.text, "middle", rtl=True)
        b += t(sub, INT, 12.5, cx, 198, c.mute, "middle", track=1.2)
    b += keymotif(c, w / 2, 252, .6, anim=False)
    b += t("SCAN A QR · IMPORT · CONNECT", INT, 11, w / 2 - 78, 257, c.mute, "end", track=2.5, op=.85)
    b += t("NOTHING TO TRUST — EVERYTHING TO TEST", INT, 11, w / 2 + 78, 257, c.mute, track=2.5, op=.85)
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
        b += f'<g class="q" style="animation-delay:{j * 2.1:.2f}s">'
        b += rect(200, 56, c.surf, c.gold, 28, ex, 236)
        b += t(name, INT, 20, ex + 100, 271, c.gold, "middle", track=1)
        b += '</g>'
    b += f'<path d="M{w/2-260} 214V224H{w/2+260}V214" fill="none" stroke="{c.key}" stroke-width="1.5" opacity=".6"/>'
    b += sheen(c, x0, 92, 70, 112, 1100, rx=12)
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
        b += f'<g class="w" style="animation-delay:{i * .35:.2f}s">'
        b += rect(cw, 56, c.surf, c.line, 28, x, 88)
        b += node(x + 28, 116, 5, cols[i % 3], i * .4)
        b += t(nm, INT, 18, x + 46, 123, c.text)
        b += '</g>'
    return svg(w, h, b, c, "Supported protocols")


def architecture(c):
    w, h = 1280, 300
    st = [("جمع‌آوری", "COLLECT", c.bronze), ("استانداردسازی", "NORMALIZE", c.bronze), ("حذف تکراری", "DEDUPE", c.silver),
          ("آزمون", "TEST", c.silver), ("انتشار", "PUBLISH", c.gold)]
    b = rect(w, h, c.bg, c.line, 16) + meander(40, 18, w - 80, c)
    xs = [140 + i * 250 for i in range(5)]
    for i in range(4):
        b += f'<line class="f" x1="{xs[i] + 36}" y1="130" x2="{xs[i + 1] - 36}" y2="130" stroke="{c.key}" stroke-width="2"/>'
    for k in range(3):
        b += (f'<circle class="pk" style="animation-delay:{k * 1.33:.2f}s" '
              f'cx="{xs[0] + 36}" cy="130" r="4" fill="{c.gold}" opacity=".9"/>')
    for i, (fa, en, col) in enumerate(st):
        x = xs[i]
        b += f'<g class="q" style="animation-delay:{i * .84:.2f}s">'
        b += f'<circle cx="{x}" cy="130" r="30" fill="{c.surf}" stroke="{col}" stroke-width="2"/>'
        b += t(str(i + 1), CIN, 26, x, 139, col, "middle")
        b += '</g>'
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
    b += f'<circle class="o" cx="52" cy="52" r="30" fill="none" stroke="{cc}" stroke-width="1" stroke-dasharray="4 7" opacity=".55"/>'
    b += f'<circle cx="52" cy="52" r="22" fill="none" stroke="{cc}" stroke-width="2"/>' + node(52, 52, 9, cc, 0)
    b += t(en, CIN, 28, 96, 54, cc, track=3)
    b += t(fa + " · " + sub, VAZ, 18, 96, 82, c.text, rtl=True)
    b += sheen(c, 0, 0, 70, h, 380, rx=14)
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
    b += f'<circle class="o" cx="44" cy="50" r="27" fill="none" stroke="{c.key}" stroke-width="1" stroke-dasharray="3 6" opacity=".5"/>'
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


def funnel(c, s=None):
    """Live run funnel — raw → gold, sqrt-scaled bars, staggered rise-in."""
    s = s or {}

    def num(v):
        if isinstance(v, str):
            try:
                v = float(v.replace(",", ""))
            except ValueError:
                return None
        return v if isinstance(v, (int, float)) else None

    rows = [("RAW", "خام", num(s.get("raw")), c.mute),
            ("UNIQUE", "یکتا", num(s.get("unique")), c.silver),
            ("TCP OPEN", "پورت زنده", num(s.get("tcp")), c.olive),
            ("PROBED", "تست‌شده", num(s.get("probed")), c.key),
            ("ALIVE", "زنده", num(s.get("alive")), c.gold),
            ("GOLD", "رده طلا", num(s.get("gold")), c.gold)]
    w, h = 1280, 372
    b = rect(w, h, c.bg, c.line, 16) + meander(40, 18, w - 80, c)
    b += t("RUN FUNNEL — RAW → GOLD", INT, 14, 56, 66, c.mute, track=4)
    b += t("قیف هر اجرا — از خام تا طلا", VAZ, 20, 1224, 66, c.mute, "end", rtl=True)
    x0, xmax, bh, gap = 268, 1168, 30, 13
    vmax = max(float(rows[0][2] or 0), 1.0)
    for i, (en, fa, v, col) in enumerate(rows):
        y = 96 + i * (bh + gap)
        val = f"{int(v):,}" if v is not None else "—"
        frac = math.sqrt(max(float(v or 0), 0.0) / vmax)
        bw = 36 + frac * (xmax - x0 - 36)
        b += t(fa, VAZM, 16, x0 - 20, y + 14, c.text, "end", rtl=True)
        b += t(en, INT, 9, x0 - 20, y + 27, c.mute, "end", track=1.5)
        b += (f'<g class="r" style="animation-delay:{i * .12:.2f}s">'
              f'<rect x="{x0}" y="{y}" width="{n(bw)}" height="{bh}" rx="8" fill="{col}" fill-opacity=".24" '
              f'stroke="{col}" stroke-opacity=".6" stroke-width="1"/></g>')
        b += t(val, CIN, 19, min(x0 + bw + 14, 1230), y + 21, col)
    return svg(w, h, b, c, "Run funnel from raw to gold")


def donut(c, s=None):
    """Live protocol mix — animated donut + legend (raw counts, top-5 + other)."""
    s = s or {}
    protos = [(str(k), int(v)) for k, v in (s.get("protos") or [])]
    if protos:
        rest = sum(v for _, v in protos[5:])
        protos = protos[:5] + ([("other", rest)] if rest else [])
    else:
        protos = [("no data", 1)]
    total = sum(v for _, v in protos) or 1
    w, h = 1280, 330
    b = rect(w, h, c.bg, c.line, 16) + meander(40, 18, w - 80, c)
    b += t("PROTOCOL MIX — LAST RUN", INT, 14, 56, 66, c.mute, track=4)
    b += t("ترکیب پروتکل‌ها — آخرین اجرا", VAZ, 20, 1224, 66, c.mute, "end", rtl=True)
    cx, cy, r, sw = 200, 196, 92, 34
    C = 2 * math.pi * r
    cols = [c.gold, c.silver, c.bronze, c.olive, c.key, c.mute]
    ring, off = "", 0.0
    for i, (nm, v) in enumerate(protos[:6]):
        ln = max(v / total * C - 1.5, 0.6)
        ring += (f'<circle class="d" style="animation-delay:{i * .14:.2f}s" cx="{cx}" cy="{cy}" r="{r}" fill="none" '
                 f'stroke="{cols[i % len(cols)]}" stroke-width="{sw}" '
                 f'stroke-dasharray="{n(ln)} {n(C - ln)}" stroke-dashoffset="{n(-off)}"/>')
        off += v / total * C
    b += f'<g class="o" style="animation-duration:80s">{ring}</g>'
    b += t(f"{total:,}", CIN, 38, cx, cy + 4, c.text, "middle")
    b += t("RAW / RUN", INT, 11, cx, cy + 27, c.mute, "middle", track=2.5)
    lx = 480
    for i, (nm, v) in enumerate(protos[:6]):
        y = 106 + i * 40
        b += f'<rect x="{lx}" y="{y - 13}" width="16" height="16" rx="5" fill="{cols[i % len(cols)]}"/>'
        b += t(nm.upper(), INT, 17, lx + 34, y + 1, c.text, track=1.5)
        b += t(f"{v:,}", CIN, 20, 1150, y + 1, c.text, "end")
        b += t(f"{v / total * 100:.1f}%", INT, 12, 1224, y + 1, c.mute, "end")
    return svg(w, h, b, c, "Protocol mix of the last run")


def all_assets(stats=None):
    A = {"banner": lambda c: banner(c, stats), "run-card": lambda c: run_card(c, stats), "bank-card": lambda c: bank_card(c, stats),
         "quickstart": quickstart, "proof": proof,
         "protocols": protocols, "architecture": architecture, "btn-text": lambda c: btn(c, "text"),
         "btn-b64": lambda c: btn(c, "b64"), "client-mihomo": lambda c: client(c, "mihomo"),
         "client-singbox": lambda c: client(c, "singbox"),
         "funnel": lambda c: funnel(c, stats), "donut": lambda c: donut(c, stats)}
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
