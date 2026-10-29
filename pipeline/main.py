"""Ariston pipeline orchestrator.

Usage:
    python -m pipeline.main collect     # fetch → normalize → dedupe → publish
    python -m pipeline.main run         # collect + live validation + scoring
    python -m pipeline.main run --no-validate   # force-skip validation
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import sys
from pathlib import Path

from . import collect as C
from . import geo as G
from . import normalize as N
from . import publish as P
from . import score as S
from . import validate as V

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"


def load_sources() -> list[dict]:
    data = json.loads((ROOT / "pipeline" / "sources.json").read_text("utf-8"))
    return data["sources"]


def _hours_since(iso: str | None) -> float | None:
    if not iso:
        return None
    try:
        delta = dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(iso)
        return max(0.0, delta.total_seconds() / 3600.0)
    except Exception:
        return None


# ------------------------------------------------------------- stage 1+2 --
def collect_phase(sources: list[dict]) -> tuple[list[str], dict]:
    """Fetch → normalize → dedupe.  Returns (unique_uris, collect_stats)."""
    started = dt.datetime.now(dt.timezone.utc)
    print(f"[1/4] fetching {len(sources)} sources ...")
    fetched = C.collect_all(sources)

    raw_uris: list[str] = []
    per_source: dict[str, int] = {}
    failed: dict[str, str] = {}
    for src in sources:
        sid = src["id"]
        res = fetched.get(sid, {"ok": False, "text": "", "error": "skipped"})
        if not res["ok"]:
            failed[sid] = res["error"] or "unknown"
            per_source[sid] = 0
            continue
        uris = C.extract_uris(res["text"])
        if not uris:                      # whole-payload base64 sources
            uris = N.try_b64_blob(res["text"])
        per_source[sid] = len(uris)
        raw_uris.extend(uris)
        print(f"      {sid:<14} {len(uris):>6} uris")

    print(f"[2/4] normalizing {len(raw_uris)} raw uris ...")
    canon = [c for c in (N.canonical(u) for u in raw_uris) if c]

    print("[3/4] deduplicating ...")
    uniq, dupes = N.dedupe(canon)
    uniq.sort(key=lambda u: (u.split("://", 1)[0], u))

    by_protocol: dict[str, int] = {}
    for u in uniq:
        scheme = u.split("://", 1)[0]
        by_protocol[scheme] = by_protocol.get(scheme, 0) + 1

    stats = {
        "generated_at": started.isoformat(timespec="seconds"),
        "duration_seconds": round((dt.datetime.now(dt.timezone.utc) - started).total_seconds(), 1),
        "sources_total": len(sources),
        "sources_ok": len(sources) - len(failed),
        "sources_failed": failed,
        "raw": len(raw_uris),
        "canonical": len(canon),
        "unique": len(uniq),
        "dupes": dupes,
        "by_protocol": dict(sorted(by_protocol.items(), key=lambda kv: -kv[1])),
        "by_source": per_source,
    }
    return uniq, stats


# ------------------------------------------------------------- stage 3+4 --
def validate_phase(uniq: list[str], skip: bool = False) -> tuple[dict, dict, dict]:
    """Health sweep.  Returns (history, validation_summary, per_node)."""
    prev: dict = {}
    rp = DIST / "results.json"
    if rp.exists():
        try:
            prev = json.loads(rp.read_text("utf-8"))
        except Exception:
            prev = {}

    if skip or not V.engines_available():
        reason = "disabled by flag" if skip else "engine binaries not found"
        print(f"[3/4] validation SKIPPED ({reason})")
        summary = {"skipped": True, "reason": reason,
                   "probed": 0, "alive": 0, "dead": 0, "unsupported": 0}
        return dict(prev), summary, {}

    print(f"[3/4] validating {len(uniq)} endpoints "
          f"(xray {V._engine_versions().get('xray')}, "
          f"sing-box {V._engine_versions().get('sing_box')}, "
          f"concurrency {V.ENV_CONCURRENCY}) ...")
    return V.validate_all(uniq, prev)


def score_phase(uniq: list[str], history: dict, per_node: dict) -> list[dict]:
    """Merge live results with history into per-node scores."""
    rows: list[dict] = []
    for uri in uniq:
        h = hashlib.sha256(uri.encode()).hexdigest()[:16]
        info = per_node.get(uri)
        hist = history.get(h) or {}
        alive = bool(info and info["alive"])
        latency = info["latency_ms"] if alive else None
        rate = info["success_rate"] if info else None
        age = _hours_since(hist.get("last_ok"))
        if alive and age is None:
            age = 0.0                                   # just proven alive
        sc = S.total(latency, rate, age, uri)
        rows.append({
            "uri": uri, "hash": h, "score": sc,
            "tier": S.tier(sc) if alive else None,
            "alive": alive,
            "latency_ms": info["latency_ms"] if info else None,
        })
    rows.sort(key=lambda r: -r["score"])
    return rows


# ------------------------------------------------------------------ cli ---
def cmd_collect() -> int:
    sources = load_sources()
    uniq, stats = collect_phase(sources)
    print("[4/4] writing outputs ...")
    P.publish_master(DIST, uniq)
    P.write_stats(DIST / "stats.json", stats)
    _print_summary(stats)
    return 0


def cmd_run(skip_validation: bool = False) -> int:
    sources = load_sources()
    uniq, stats = collect_phase(sources)

    history, vsummary, per_node = validate_phase(uniq, skip=skip_validation)
    stats["validation"] = vsummary

    rows = score_phase(uniq, history, per_node)
    tiers = {"gold": sum(1 for r in rows if r["alive"] and r["tier"] == "gold"),
             "silver": sum(1 for r in rows if r["alive"] and r["tier"] == "silver"),
             "bronze": sum(1 for r in rows if r["alive"] and r["tier"] == "bronze")}
    stats["scoring"] = tiers

    print("[4/4] writing outputs ...")
    P.publish_master(DIST, uniq)
    P.publish_tiers(DIST, rows)
    stats["clients"] = P.publish_clients(DIST, rows)
    (DIST / "readme-stats.md").write_text(P.render_stats_markdown(stats, "fa"), encoding="utf-8")
    (DIST / "readme-stats-en.md").write_text(P.render_stats_markdown(stats, "en"), encoding="utf-8")

    print("[4b/4] classifying Iranian operator networks ...")
    table = G.load_table()
    geo = G.classify(uniq, table)
    stats["operators"] = geo["stats"]
    P.publish_operators(DIST, geo["by_slug"])          # all classified (like by-protocol)

    P.write_stats(DIST / "stats.json", stats)
    P.write_history(DIST / "results.json", history)
    _print_summary(stats)
    return 0


def _print_summary(stats: dict) -> None:
    v = stats.get("validation", {})
    print("\n── summary ─────────────────────────────")
    print(f"  raw {stats['raw']} → unique {stats['unique']}  "
          f"(dupes: exact {stats['dupes']['exact_dupes']}, "
          f"same-node {stats['dupes']['same_node_dupes']})")
    print(f"  protocols: {stats['by_protocol']}")
    if v and not v.get("skipped"):
        lat = v.get("latency_ms") or {}
        print(f"  health: probed {v['probed']} → alive {v['alive']} "
              f"(dead {v['dead']}, unsupported {v['unsupported']})")
        print(f"  latency ms: p50 {lat.get('p50')} · p80 {lat.get('p80')} "
              f"· avg {lat.get('avg')}")
        print(f"  tiers: gold {stats.get('scoring', {}).get('gold', 0)} · "
              f"silver {stats.get('scoring', {}).get('silver', 0)} · "
              f"bronze {stats.get('scoring', {}).get('bronze', 0)}")
        if v.get("fail_reasons"):
            top = dict(list(v["fail_reasons"].items())[:4])
            print(f"  top fail reasons: {top}")
    elif v:
        print(f"  validation skipped ({v.get('reason')})")
    cl = stats.get("clients") or {}
    if cl:
        print(f"  clients: mihomo {cl.get('mihomo', {}).get('built')} proxies "
              f"(skipped {cl.get('mihomo', {}).get('skipped')}) · "
              f"singbox {cl.get('singbox', {}).get('built')} outbounds "
              f"(skipped {cl.get('singbox', {}).get('skipped')})")
    op = stats.get("operators") or {}
    if op:
        if op.get("available"):
            ir = op.get("classified_iran", 0)
            top = dict(sorted((op.get("by_slug") or {}).items(), key=lambda kv: -kv[1])[:4])
            print(f"  operators: {ir} nodes on Iranian networks | top: {top}")
        else:
            print("  operators: ip2asn table unavailable — skipped")
    if stats.get("sources_failed"):
        print(f"  failed sources: {stats['sources_failed']}")
    print(f"  outputs → {DIST}")
    return None


def main() -> int:
    ap = argparse.ArgumentParser(prog="ariston")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("collect", help="fetch-normalize-dedupe only (no probing)")
    run_p = sub.add_parser("run", help="full pipeline: collect + validate + score")
    run_p.add_argument("--no-validate", action="store_true",
                       help="skip the health sweep even if engines exist")
    args = ap.parse_args()
    if args.cmd == "collect":
        return cmd_collect()
    if args.cmd == "run":
        return cmd_run(skip_validation=args.no_validate)
    return 1


if __name__ == "__main__":
    sys.exit(main())
