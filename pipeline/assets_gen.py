"""Live asset generator — runs after every pipeline pass.

Produces, inside assets/ (committed to `main` by the stats-amend step):

  stats.svg            premium live stat cards (numbers from dist/stats.json)
  qr-gold.svg          scan-to-subscribe card → gold.txt
  qr-validated.svg     scan-to-subscribe card → validated.txt
  qr-nodes.svg         scan-to-subscribe card → nodes.txt

Usage:
    python -m pipeline.assets_gen            # read dist/stats.json
    python -m pipeline.assets_gen --demo     # built-in fallback numbers

The SVGs are hand-templated (no heavy deps); QR codes need the tiny
pure-python `qrcode` package.  When qrcode is unavailable the QR cards
are skipped gracefully — CI installs it explicitly.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
DIST = ROOT / "dist"

REPO = "Edsel-Rahimi/Ariston"
RAW = f"https://raw.githubusercontent.com/{REPO}/data"

INK = "#0A0E1A"        # deep navy — the project background
CARD = "#101728"       # card surface
MUTED = "#64748B"      # slate-500
FAINT = "#475569"      # slate-600
FONT = "Segoe UI, Arial, Helvetica, sans-serif"


# ----------------------------------------------------------------- data ---
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
        "unique": 8771,
        "validation": {"probed": 8713, "alive": 345, "latency_ms": {"p50": 556.1}},
        "scoring": {"gold": 70, "silver": 226, "bronze": 49},
        "operators": {"classified_iran": 52},
    }


# ------------------------------------------------------------ stat cards --
def _card(x: int, label: str, value: str, sub: str, color: str, w: int = 190) -> str:
    h = 128
    return f'''
  <g>
    <rect x="{x}" y="16" width="{w}" height="{h}" rx="16" fill="{CARD}"
          stroke="{color}" stroke-opacity="0.28" stroke-width="1.2"/>
    <rect x="{x}" y="16" width="{w}" height="3.5" rx="1.75" fill="{color}" fill-opacity="0.85"/>
    <text x="{x + w / 2}" y="46" text-anchor="middle" font-family="{FONT}"
          font-size="12.5" font-weight="700" letter-spacing="2.6" fill="{color}">{label}</text>
    <text x="{x + w / 2}" y="90" text-anchor="middle" font-family="{FONT}"
          font-size="34" font-weight="800" fill="#F1F5F9">{value}</text>
    <text x="{x + w / 2}" y="126" text-anchor="middle" font-family="{FONT}"
          font-size="11.5" fill="{MUTED}">{sub}</text>
  </g>'''


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def build_stats_svg(stats: dict) -> str:
    v = stats.get("validation") or {}
    sc = stats.get("scoring") or {}
    probed = int(v.get("probed") or 0)
    alive = int(v.get("alive") or 0)
    gold = int(sc.get("gold") or 0)
    silver = int(sc.get("silver") or 0)
    p50 = (v.get("latency_ms") or {}).get("p50")
    rate = f"{100.0 * alive / probed:.1f}%" if probed else "—"
    ts = (stats.get("generated_at") or "").replace("T", " ")[:16]

    gap = 22
    x0 = 34
    cards = "".join([
        _card(x0 + 0 * (190 + gap), "TESTED", f"{probed:,}", "dual-engine sweep", "#38BDF8"),
        _card(x0 + 1 * (190 + gap), "ALIVE", f"{alive:,}", f"{rate} pass rate", "#00E5A0"),
        _card(x0 + 2 * (190 + gap), "GOLD", f"{gold:,}", "score ≥ 80", "#FBBF24"),
        _card(x0 + 3 * (190 + gap), "SILVER", f"{silver:,}", "score ≥ 55", "#94A3B8"),
        _card(x0 + 4 * (190 + gap), "MEDIAN", (f"{p50:g} ms" if p50 is not None else "—"),
              "latency p50", "#A78BFA"),
    ])
    total_w = x0 + 5 * 190 + 4 * gap + 34
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{total_w}" height="196"
     viewBox="0 0 {total_w} 196" role="img" aria-label="Ariston live statistics">
  <defs>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#00E5A0"/>
      <stop offset="1" stop-color="#38BDF8"/>
    </linearGradient>
  </defs>
{cards}
  <text x="{total_w - 34}" y="180" text-anchor="end" font-family="{FONT}"
        font-size="11.5" fill="{FAINT}">⟳ refreshed hourly · {_esc(ts)} UTC</text>
  <text x="34" y="180" font-family="{FONT}" font-size="11.5" font-weight="700"
        letter-spacing="2" fill="url(#brand)">ARISTON · LIVE</text>
</svg>'''


# -------------------------------------------------------------- QR cards --
def _qr_path(payload: str) -> tuple[str, int] | None:
    try:
        import qrcode
        from qrcode.image.svg import SvgPathImage
    except ImportError:
        return None
    img = qrcode.make(payload, image_factory=SvgPathImage,
                      error_correction=qrcode.constants.ERROR_CORRECT_M)
    svg = img.to_string().decode()
    # extract the path + viewBox from the factory output
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
     viewBox="0 0 {box} {h}" role="img" aria-label="{_esc(title)}">
  <rect width="{box}" height="{h}" rx="18" fill="#F8FAFC"/>
  <rect x="0.6" y="0.6" width="{box - 1.2}" height="{h - 1.2}" rx="17.4"
        fill="none" stroke="#0A0E1A" stroke-opacity="0.10"/>
  <g transform="translate({pad},{pad}) scale({scale:.5f})">
    <path d="{d}" fill="{INK}"/>
  </g>
  <text x="{box / 2}" y="{box + 26}" text-anchor="middle" font-family="{FONT}"
        font-size="14" font-weight="800" letter-spacing="1.6" fill="{INK}">{_esc(title)}</text>
  <text x="{box / 2}" y="{box + 44}" text-anchor="middle" font-family="{FONT}"
        font-size="10.5" fill="{FAINT}">{_esc(sub)}</text>
</svg>'''
    (ASSETS / fname).write_text(svg, encoding="utf-8")
    print(f"  ✓ {fname}")
    return True


# ------------------------------------------------------------------ cli ---
def main() -> int:
    ap = argparse.ArgumentParser(prog="ariston-assets")
    ap.add_argument("--demo", action="store_true", help="use fallback numbers")
    ap.add_argument("--skip-qr", action="store_true")
    args = ap.parse_args()

    stats = load_stats(demo=args.demo)
    ASSETS.mkdir(exist_ok=True)

    out = build_stats_svg(stats)
    (ASSETS / "stats.svg").write_text(out, encoding="utf-8")
    print("  ✓ stats.svg")

    if not args.skip_qr:
        build_qr_card(f"{RAW}/gold.txt", "GOLD TIER", "scan → subscribe", "qr-gold.svg")
        build_qr_card(f"{RAW}/validated.txt", "VALIDATED", "scan → subscribe", "qr-validated.svg")
        build_qr_card(f"{RAW}/nodes.txt", "ALL NODES", "scan → subscribe", "qr-nodes.svg")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
