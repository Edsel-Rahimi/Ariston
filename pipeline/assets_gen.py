"""Live asset generator — brand-kit edition.

Runs after every pipeline pass. Produces the classical charcoal-and-gold
README artwork (assets/dark/ + assets/light/, 35 assets per theme) plus the
scan-to-subscribe QR cards (assets/qr-*.svg).

Text inside every SVG is shaped with uharfbuzz and converted to outlines
with fontTools, so the artwork renders identically inside <img> on GitHub
with zero external font requests. QR cards are the one exception: they use
system fonts and stay single-theme (marble) because scanners need contrast.

Usage:
    python -m pipeline.assets_gen            # read dist/stats.json
    python -m pipeline.assets_gen --demo     # built-in fallback numbers
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib

from . import brand_svg
from .brand_svg import DARK, LIGHT, all_assets

ROOT = pathlib.Path(__file__).resolve().parent.parent
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
        "validation": {"probed": 13675, "alive": 821,
                       "latency_ms": {"min": 66.3, "p50": 589.0, "p80": 1072.7, "avg": 837.1},
                       "engines": {"xray": "26.10.29", "sing_box": "1.14.4"}},
        "scoring": {"gold": 147, "silver": 584, "bronze": 90},
    }


def brand_stats(s: dict) -> dict:
    """Map the pipeline's stats.json onto the brand run-card contract."""
    ts = (s.get("generated_at") or "")
    try:
        updated = dt.datetime.fromisoformat(ts).strftime("%H:%M UTC")
    except Exception:
        updated = "—"
    v = s.get("validation") or {}
    sc = s.get("scoring") or {}
    return {
        "total": f"{int(s.get('unique') or 0):,}",
        "validated": f"{int(v.get('alive') or 0):,}",
        "silver": f"{int(sc.get('silver') or 0):,}",
        "gold": f"{int(sc.get('gold') or 0):,}",
        "updated": updated,
    }


# ================================================================ QR cards ==
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


# Brand palette (subset needed by the QR card, which must stay scannable)
QR_BG = "#F3ECDD"       # marble
QR_MODULE = "#14110C"   # charcoal
QR_KEY = "#C9A24A"      # deep gold
QR_SUB = "#6E5A3C"      # muted bronze-brown


def build_qr_card(payload: str, title: str, sub: str, fname: str) -> bool:
    got = _qr_path(payload)
    if not got:
        print(f"  ! qrcode unavailable — skipped {fname}")
        return False
    d, n = got
    size, pad, label_h = 188, 20, 58
    box = size + 2 * pad
    h = box + label_h
    scale = size / n
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{box}" height="{h}"
     viewBox="0 0 {box} {h}" role="img" aria-label="{title}">
  <defs>
    <pattern id="mk" width="20" height="14" patternUnits="userSpaceOnUse">
      <path d="M0 14V0H14V10H5V5H9" fill="none" stroke="{QR_KEY}" stroke-width="1.6" opacity=".45"/>
    </pattern>
  </defs>
  <rect width="{box}" height="{h}" rx="12" fill="{QR_BG}"/>
  <rect x="0.5" y="0.5" width="{box - 1}" height="{h - 1}" rx="11.5" fill="none"
        stroke="{QR_KEY}" stroke-opacity=".3" stroke-width="1"/>
  <rect x="{pad}" y="7" width="{box - 2 * pad}" height="6" fill="url(#mk)"/>
  <g transform="translate({pad},{pad + 2}) scale({scale:.5f})">
    <path d="{d}" fill="{QR_MODULE}"/>
  </g>
  <text x="{box / 2}" y="{box + 28}" text-anchor="middle"
        font-family="Georgia, 'Times New Roman', serif" font-size="14" font-weight="700"
        letter-spacing="2.4" fill="{QR_MODULE}">{title}</text>
  <text x="{box / 2}" y="{box + 47}" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="10"
        letter-spacing="1.2" fill="{QR_SUB}">{sub}</text>
</svg>'''
    (ASSETS / fname).write_text(svg, encoding="utf-8")
    print(f"  ✓ {fname}")
    return True


# =================================================================== main ==
def main() -> int:
    ap = argparse.ArgumentParser(prog="ariston-assets")
    ap.add_argument("--demo", action="store_true", help="use fallback numbers")
    ap.add_argument("--skip-qr", action="store_true")
    args = ap.parse_args()

    s = load_stats(demo=args.demo)
    flat = brand_stats(s)
    print(f"  run-card: total={flat['total']} validated={flat['validated']} "
          f"silver={flat['silver']} gold={flat['gold']} updated={flat['updated']}")

    assets = all_assets(flat)
    for theme, pal in ((DARK, "dark"), (LIGHT, "light")):
        out = ASSETS / pal
        out.mkdir(parents=True, exist_ok=True)
        for name, fn in assets.items():
            body = fn(theme)
            (out / f"{name}.svg").write_text(body, encoding="utf-8")
        print(f"  ✓ {len(assets)} assets → assets/{pal}/")

    # retire the old flat single-theme artwork if still present (QRs excluded —
    # they are regenerated right below and must never be swept away)
    LEGACY = {"banner.svg", "run-card.svg", "quickstart.svg", "proof.svg", "protocols.svg",
              "architecture.svg", "btn-text.svg", "btn-b64.svg", "client-mihomo.svg",
              "client-singbox.svg", "tier-gold.svg", "tier-silver.svg", "tier-validated.svg",
              "tier-all.svg", "logo.svg"}
    LEGACY |= {f"lang-{c}{'-on' if on else ''}.svg" for c in ("fa", "en", "tr", "ru", "zh") for on in (False, True)}
    LEGACY |= {f"op-{c}.svg" for c in ("irancell", "mci", "tci", "rightel", "pishgaman", "shatel",
                                       "mobinnet", "asiatech", "parsonline", "respina", "ir-other")}
    for p in sorted(ASSETS.glob("*.svg")):
        if p.name in LEGACY:
            p.unlink()
            print(f"  − removed legacy {p.name}")

    if not args.skip_qr:
        build_qr_card(f"{RAW}/gold.txt", "GOLD TIER", "scan to subscribe", "qr-gold.svg")
        build_qr_card(f"{RAW}/validated.txt", "VALIDATED", "scan to subscribe", "qr-validated.svg")
        build_qr_card(f"{RAW}/nodes.txt", "ALL NODES", "scan to subscribe", "qr-nodes.svg")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
