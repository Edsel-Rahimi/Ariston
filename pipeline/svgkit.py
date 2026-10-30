"""svgkit — shared primitives for Ariston's animated README SVGs.

Every asset is a self-contained SVG file (no external fonts, no scripts)
animated with a mix of CSS keyframes (inside <style>) and SMIL, both of
which keep working when GitHub serves the file through camo inside <img>.

Design tokens mirror the mission-control aesthetic of docs/:
deep navy glass panels, mint/sky/gold accents, mono numerals.
"""

from __future__ import annotations

import math
import random

# ------------------------------------------------------------ palette ---
INK = "#070C16"
PANEL0 = "#0B1220"
PANEL1 = "#111B31"
PANEL2 = "#15213B"
LINE = "#22335A"
LINE_SOFT = "#16223B"
TXT = "#EAF2FF"
MUT = "#8FA3C8"
FAINT = "#5A6E94"

MINT = "#00E5A0"
SKY = "#38BDF8"
GOLD = "#FBBF24"
SILVER = "#C9D6EC"
BRONZE = "#F59E0B"
ROSE = "#FB7185"
VIOLET = "#A78BFA"
AMBER = "#FF9F43"

FA_SANS = "Vazirmatn, 'Segoe UI', Tahoma, 'Noto Naskh Arabic', sans-serif"
EN_SANS = "'Segoe UI', 'Space Grotesk', Arial, sans-serif"
MONO = "'JetBrains Mono', 'Cascadia Mono', Consolas, 'SF Mono', monospace"


def esc(s: str) -> str:
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def fmt(n) -> str:
    try:
        return f"{int(n):,}"
    except (TypeError, ValueError):
        return str(n)


# ------------------------------------------------------------- styles ---
COMMON_CSS = f"""
  text {{ font-family: {EN_SANS}; }}
  .fa {{ font-family: {FA_SANS}; }}
  .mono {{ font-family: {MONO}; }}
  .flow {{ stroke-dasharray: 7 7; animation: flow 1.1s linear infinite; }}
  .flow-slow {{ stroke-dasharray: 5 9; animation: flow 2.4s linear infinite; }}
  .pulse {{ animation: pulse 2.2s ease-in-out infinite; }}
  .pulse-fast {{ animation: pulse 1.2s ease-in-out infinite; }}
  .blink {{ animation: blink 1.4s steps(2) infinite; }}
  .floaty {{ animation: floaty 4.5s ease-in-out infinite; }}
  .spin {{ animation: spin 14s linear infinite; }}
  .spin-rev {{ animation: spin 22s linear infinite reverse; }}
  @keyframes flow {{ to {{ stroke-dashoffset: -28; }} }}
  @keyframes pulse {{ 0%,100% {{ opacity: .5; }} 50% {{ opacity: 1; }} }}
  @keyframes blink {{ 50% {{ opacity: .25; }} }}
  @keyframes floaty {{ 0%,100% {{ transform: translateY(0); }} 50% {{ transform: translateY(-5px); }} }}
  @keyframes spin {{ to {{ transform: rotate(360deg); }} }}
"""


def svg_open(w: int, h: int, css: str = "", label: str = "Ariston") -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
        f'viewBox="0 0 {w} {h}" role="img" aria-label="{esc(label)}">\n'
        f"<style>{COMMON_CSS}{css}</style>\n"
    )


# ------------------------------------------------------------ defs ------
def defs_base() -> str:
    """Shared gradients/filters every asset can reference."""
    return f"""
  <defs>
    <linearGradient id="gBrand" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="{MINT}"/><stop offset="1" stop-color="{SKY}"/>
    </linearGradient>
    <linearGradient id="gGold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFE9A8"/><stop offset=".5" stop-color="{GOLD}"/><stop offset="1" stop-color="#D97706"/>
    </linearGradient>
    <linearGradient id="gSilver" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F4F8FF"/><stop offset=".55" stop-color="{SILVER}"/><stop offset="1" stop-color="#7C8DB0"/>
    </linearGradient>
    <linearGradient id="gPanel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{PANEL1}"/><stop offset="1" stop-color="{PANEL0}"/>
    </linearGradient>
    <linearGradient id="gVio" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{VIOLET}"/><stop offset="1" stop-color="#6D5AE8"/>
    </linearGradient>
    <filter id="fGlow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="fBlurBig" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="42"/>
    </filter>
    {SHEEN_DEF}
  </defs>"""


def grid(w: int, h: int, step: int = 44, opacity: float = 0.05) -> str:
    out = [f'<g stroke="{LINE_SOFT}" stroke-width="1" opacity="{opacity}">']
    for x in range(0, w + 1, step):
        out.append(f'<line x1="{x}" y1="0" x2="{x}" y2="{h}"/>')
    for y in range(0, h + 1, step):
        out.append(f'<line x1="0" y1="{y}" x2="{w}" y2="{y}"/>')
    out.append("</g>")
    return "".join(out)


def aurora(w: int, h: int, seed: int = 7) -> str:
    """Two drifting blurred colour blobs + faint grid — the ambient backdrop."""
    rnd = random.Random(seed)
    parts = []
    for cx, cy, col, r in [
        (int(w * 0.16), int(h * 0.3), "#0E5C47", int(h * 0.55)),
        (int(w * 0.86), int(h * 0.25), "#123B66", int(h * 0.6)),
        (int(w * 0.52), int(h * 0.95), "#1B2C55", int(h * 0.5)),
    ]:
        dx, dy = rnd.randint(-26, 26), rnd.randint(-14, 14)
        dur = rnd.randint(9, 13)
        parts.append(
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{col}" filter="url(#fBlurBig)" opacity=".55">'
            f'<animate attributeName="cx" values="{cx - dx};{cx + dx};{cx - dx}" dur="{dur}s" repeatCount="indefinite"/>'
            f'<animate attributeName="cy" values="{cy - dy};{cy + dy};{cy - dy}" dur="{dur + 2}s" repeatCount="indefinite"/>'
            "</circle>"
        )
    return "".join(parts)


def particles(w: int, h: int, n: int = 22, seed: int = 3, col: str = MINT) -> str:
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        x = rnd.randint(12, w - 12)
        y0 = rnd.randint(int(h * 0.15), h)
        dur = rnd.randint(6, 12) / 1.0
        r = round(rnd.uniform(1.0, 2.4), 1)
        op = round(rnd.uniform(0.18, 0.5), 2)
        y1 = max(6, y0 - rnd.randint(int(h * 0.35), int(h * 0.8)))
        out.append(
            f'<circle cx="{x}" cy="{y0}" r="{r}" fill="{col}" opacity="{op}">'
            f'<animate attributeName="cy" values="{y0};{y1}" dur="{dur}s" repeatCount="indefinite"/>'
            f'<animate attributeName="opacity" values="0;{op};0" dur="{dur}s" repeatCount="indefinite"/>'
            "</circle>"
        )
    return "".join(out)


# ------------------------------------------------------------ widgets ---
def panel(x, y, w, h, rx=18, stroke=LINE, fill="url(#gPanel)", op: float = 0.92) -> str:
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" '
            f'fill="{fill}" fill-opacity="{op}" stroke="{stroke}" stroke-width="1.2"/>')


def live_dot(x, y, col=MINT, r=4.5):
    return (f'<circle cx="{x}" cy="{y}" r="{r}" fill="{col}">'
            f'<animate attributeName="opacity" values="1;.25;1" dur="1.6s" repeatCount="indefinite"/>'
            f"</circle>"
            f'<circle cx="{x}" cy="{y}" r="{r}" fill="none" stroke="{col}">'
            f'<animate attributeName="r" values="{r};{r + 7}" dur="1.6s" repeatCount="indefinite"/>'
            f'<animate attributeName="opacity" values=".8;0" dur="1.6s" repeatCount="indefinite"/>'
            f"</circle>")


def flow_line(x1, y1, x2, y2, col=MINT, width=2.0, slow=False, curve=0):
    """Connector with marching dashes + a travelling light dot."""
    if curve:
        mx = (x1 + x2) / 2
        d = f"M {x1} {y1} C {mx} {y1}, {mx} {y2}, {x2} {y2}"
    else:
        d = f"M {x1} {y1} L {x2} {y2}"
    dur = 2.6 if slow else 1.7
    dash_cls = "flow-slow" if slow else "flow"
    return (
        f'<path d="{d}" fill="none" stroke="{col}" stroke-opacity=".28" stroke-width="{width}"/>'
        f'<path class="{dash_cls}" d="{d}" fill="none" stroke="{col}" stroke-width="{width}" stroke-linecap="round"/>'
        f'<circle r="2.6" fill="{col}"><animateMotion dur="{dur}s" repeatCount="indefinite" path="{d}"/></circle>'
    )


def text(x, y, s, size=14, fill=TXT, anchor="middle", weight=400, mono=False,
         fa=False, spacing=None, opacity=None, style_extra="") -> str:
    cls = (' class="mono"' if mono else '') + (' class="fa"' if fa else '')
    if mono and fa:
        cls = ' class="mono"'
    sp = f' letter-spacing="{spacing}"' if spacing else ""
    op = f' opacity="{opacity}"' if opacity is not None else ""
    return (f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-size="{size}" '
            f'font-weight="{weight}" fill="{fill}"{sp}{op}{cls} {style_extra}>{esc(s)}</text>')


def num(x, y, s, size=30, col=TXT, anchor="middle", weight=800):
    """Number with a soft brand glow beneath — for KPI values."""
    return (f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-size="{size}" '
            f'font-weight="{weight}" fill="{col}" class="mono" filter="url(#fGlow)">{esc(s)}</text>')


def sheen(x, y, w, h, dur=3.2, delay=0):
    """Light sweep across a card region (SMIL, camo-safe)."""
    return (f'<rect x="{x}" y="{y}" width="34" height="{h}" fill="url(#gSheen)" transform="skewX(-18)">'
            f'<animate attributeName="x" values="{x - 60};{x + w + 30}" dur="{dur}s" begin="{delay}s" repeatCount="indefinite"/>'
            f"</rect>")


SHEEN_DEF = ('<linearGradient id="gSheen" x1="0" y1="0" x2="1" y2="0">'
             '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/>'
             '<stop offset=".5" stop-color="#FFFFFF" stop-opacity=".10"/>'
             '<stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>')


def medal(cx, cy, r, grad, ring, star="#0A0E1A"):
    """Medal disc + star + rotating sparkle rays."""
    rays = "".join(
        f'<line x1="{cx}" y1="{cy - r - 4}" x2="{cx}" y2="{cy - r - 11}" stroke="{ring}" stroke-width="2.4" stroke-linecap="round" '
        f'transform="rotate({a} {cx} {cy})" opacity=".0">'
        f"<animate attributeName=\"opacity\" values=\"0;.9;0\" dur=\"2.8s\" begin=\"{a * 0.012:.2f}s\" repeatCount=\"indefinite\"/>"
        f"</line>"
        for a in range(0, 360, 45)
    )
    return (
        f'<g>{rays}<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#{grad})" stroke="{ring}" stroke-width="1.6" filter="url(#fGlow)"/>'
        f'<circle cx="{cx}" cy="{cy}" r="{r * 0.78}" fill="none" stroke="{star}" stroke-opacity=".35" stroke-width="1.4"/>'
        f'<path transform="translate({cx} {cy}) scale({r / 15:.2f})" fill="{star}" fill-opacity=".85" '
        f'd="M0,-8.2 L2.4,-2.6 L8.4,-2.6 L3.6,1.4 L5.2,7.4 L0,3.9 L-5.2,7.4 L-3.6,1.4 L-8.4,-2.6 L-2.4,-2.6 Z"/></g>'
    )


def check_mark(x, y, s, col=MINT, width=3.0):
    return (f'<path d="M{x - s * 0.55} {y} l{s * 0.4} {s * 0.42} l{s * 0.72} -{s * 0.86}" fill="none" '
            f'stroke="{col}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round" '
            f'filter="url(#fGlow)"><animate attributeName="opacity" values="1;.45;1" dur="2.2s" '
            f'repeatCount="indefinite"/></path>')


def chip(x, y, label, col, w=None, h=26, size=12, fa=False):
    tw = w if w else int(len(label) * (size * 0.62 if not fa else size * 0.66)) + 26
    cx = x + tw / 2
    return (
        f'<g><rect x="{x}" y="{y}" width="{tw}" height="{h}" rx="{h / 2}" fill="{col}14" '
        f'stroke="{col}" stroke-opacity=".45" stroke-width="1.1"/>'
        f'<circle cx="{x + 13}" cy="{y + h / 2}" r="3.4" fill="{col}" class="pulse-fast"/>'
        + text(cx + 5, y + h / 2 + size * 0.36, label, size, col, weight=700, fa=fa, mono=not fa)
        + "</g>",
        tw,
    )


def wave_rings(cx, cy, col, r0=6, n=3, gap=9, dur=2.4, sw=2.2):
    """Expanding broadcast arcs — the 'logo motion' signal effect."""
    out = []
    for i in range(n):
        r = r0 + i * gap
        begin = f"{i * dur / n:.2f}s"
        out.append(
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{col}" stroke-width="{sw}" opacity="0">'
            f'<animate attributeName="opacity" values=".85;0" dur="{dur}s" begin="{begin}" repeatCount="indefinite"/>'
            f'<animate attributeName="r" values="{r0};{r0 + n * gap}" dur="{dur}s" begin="{begin}" repeatCount="indefinite"/>'
            "</circle>"
        )
    out.append(f'<circle cx="{cx}" cy="{cy}" r="{r0 - 1.5}" fill="{col}" filter="url(#fGlow)"/>')
    return "".join(out)


def gauge_arc(cx, cy, r, frac, col, label=None, val=None, max_frac=1.0):
    """Semi-circular gauge with animated sweep-in."""
    frac = max(0.02, min(1.0, frac))
    a = math.pi * (1 - frac)
    x2, y2 = cx + r * math.cos(a), cy - r * math.sin(a)
    large = 1 if frac > 0.5 else 0
    sweep_len = math.pi * r
    dash = frac * sweep_len
    return (
        f'<path d="M {cx - r} {cy} A {r} {r} 0 0 1 {cx + r} {cy}" fill="none" stroke="{LINE_SOFT}" '
        f'stroke-width="9" stroke-linecap="round"/>'
        f'<path d="M {cx - r} {cy} A {r} {r} 0 0 1 {cx + r} {cy}" fill="none" stroke="{col}" '
        f'stroke-width="9" stroke-linecap="round" stroke-dasharray="{dash:.1f} {sweep_len:.1f}" filter="url(#fGlow)">'
        f'<animate attributeName="stroke-dasharray" values="0.1 {sweep_len:.1f};{dash:.1f} {sweep_len:.1f}" dur="1.4s" fill="freeze"/></path>'
    )


def flag(code: str, x: int, y: int, w: int = 44, h: int = 30) -> str:
    """Tiny hand-drawn flags (rounded, ringed) — camo-safe vector art."""
    r = 6
    clip_id = f"fl_{code}"
    base = (f'<clipPath id="{clip_id}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}"/></clipPath>'
            f'<g clip-path="url(#{clip_id})">')
    ring = (f'</g><rect x="{x + .5}" y="{y + .5}" width="{w - 1}" height="{h - 1}" rx="{r}" '
            f'fill="none" stroke="#FFFFFF30" stroke-width="1"/>')

    if code == "ir":  # Iran — tricolour + emblem hint
        return (base
                + f'<rect x="{x}" y="{y}" width="{w}" height="{h / 3}" fill="#239F40"/>'
                + f'<rect x="{x}" y="{y + h / 3}" width="{w}" height="{h / 3}" fill="#F4F7FB"/>'
                + f'<rect x="{x}" y="{y + 2 * h / 3}" width="{w}" height="{h / 3}" fill="#DA0000"/>'
                + f'<circle cx="{x + w / 2}" cy="{y + h / 2}" r="{h * 0.17}" fill="none" stroke="#DA0000" stroke-width="1.6"/>'
                + f'<circle cx="{x + w / 2}" cy="{y + h / 2}" r="1.6" fill="#DA0000"/>'
                + ring)
    if code == "gb":  # UK — simplified union jack
        return (base
                + f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#1E3A8A"/>'
                + f'<path d="M{x} {y} L{x + w} {y + h} M{x + w} {y} L{x} {y + h}" stroke="#F4F7FB" stroke-width="6"/>'
                + f'<path d="M{x} {y} L{x + w} {y + h} M{x + w} {y} L{x} {y + h}" stroke="#DA0000" stroke-width="2.4"/>'
                + f'<path d="M{x + w / 2} {y} V{y + h} M{x} {y + h / 2} H{x + w}" stroke="#F4F7FB" stroke-width="9"/>'
                + f'<path d="M{x + w / 2} {y} V{y + h} M{x} {y + h / 2} H{x + w}" stroke="#DA0000" stroke-width="4.6"/>'
                + ring)
    if code == "tr":  # Turkey — red + crescent + star
        cx, cy = x + w * 0.42, y + h / 2
        return (base
                + f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#DA0000"/>'
                + f'<circle cx="{cx}" cy="{cy}" r="{h * 0.26}" fill="#F4F7FB"/>'
                + f'<circle cx="{cx + h * 0.09}" cy="{cy}" r="{h * 0.21}" fill="#DA0000"/>'
                + f'<path transform="translate({x + w * 0.62} {cy}) scale({h / 34:.2f})" fill="#F4F7FB" '
                f'd="M0,-4.6 L1.4,-1.5 L4.7,-1.5 L2.1,0.8 L3,3.9 L0,2.1 L-3,3.9 L-2.1,0.8 L-4.7,-1.5 L-1.4,-1.5 Z"/>'
                + ring)
    if code == "ru":  # Russia — horizontal tricolour
        return (base
                + f'<rect x="{x}" y="{y}" width="{w}" height="{h / 3}" fill="#F4F7FB"/>'
                + f'<rect x="{x}" y="{y + h / 3}" width="{w}" height="{h / 3}" fill="#1E3A8A"/>'
                + f'<rect x="{x}" y="{y + 2 * h / 3}" width="{w}" height="{h / 3}" fill="#DA0000"/>'
                + ring)
    if code == "cn":  # China — red + stars
        bx, by = x + w * 0.2, y + h * 0.36
        stars = f'<path transform="translate({bx} {by}) scale({h / 30:.2f})" fill="#FFDE00" d="M0,-6 L1.8,-1.9 L6.2,-1.9 L2.7,0.9 L3.9,5.1 L0,2.6 L-3.9,5.1 L-2.7,0.9 L-6.2,-1.9 L-1.8,-1.9 Z"/>'
        for dx, dy, s_ in [(10, -6, 2.0), (13, -1.5, 2.0), (13, 3.5, 2.0), (10, 8, 2.0)]:
            stars += (f'<path transform="translate({bx + dx} {by + dy}) scale({h / 30 * (s_ / 6):.2f})" fill="#FFDE00" '
                      f'd="M0,-6 L1.8,-1.9 L6.2,-1.9 L2.7,0.9 L3.9,5.1 L0,2.6 L-3.9,5.1 L-2.7,0.9 L-6.2,-1.9 L-1.8,-1.9 Z"/>')
        return (base
                + f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#DE2910"/>'
                + stars
                + ring)
    return base + f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{LINE}"/>' + ring
