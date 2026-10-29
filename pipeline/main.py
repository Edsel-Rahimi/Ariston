"""Ariston pipeline orchestrator.

Usage:
    python -m pipeline.main collect     # fetch → normalize → dedupe → publish
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

from . import collect as C
from . import normalize as N
from . import publish as P

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"


def load_sources() -> list[dict]:
    data = json.loads((ROOT / "pipeline" / "sources.json").read_text("utf-8"))
    return data["sources"]


def cmd_collect() -> int:
    started = dt.datetime.now(dt.timezone.utc)
    sources = load_sources()
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

    print(f"[3/4] deduplicating ...")
    uniq, dupes = N.dedupe(canon)
    uniq.sort(key=lambda u: (u.split("://", 1)[0], u))

    by_protocol: dict[str, int] = {}
    for u in uniq:
        scheme = u.split("://", 1)[0]
        by_protocol[scheme] = by_protocol.get(scheme, 0) + 1

    print("[4/4] writing outputs ...")
    DIST.mkdir(exist_ok=True)
    (DIST / "nodes.txt").write_text("\n".join(uniq) + "\n", encoding="utf-8")
    P.write_b64(DIST / "nodes.b64", "\n".join(uniq) + "\n")
    proto_dir = DIST / "by-protocol"
    proto_dir.mkdir(exist_ok=True)
    for scheme, count in by_protocol.items():
        lines = "\n".join(u for u in uniq if u.startswith(scheme + "://")) + "\n"
        (proto_dir / f"{scheme}.txt").write_text(lines, encoding="utf-8")
        P.write_b64(proto_dir / f"{scheme}.b64", lines)

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
    P.write_stats(DIST / "stats.json", stats)

    print("\n── summary ─────────────────────────────")
    print(f"  raw {stats['raw']} → unique {stats['unique']}  "
          f"(dupes: exact {dupes['exact_dupes']}, same-node {dupes['same_node_dupes']})")
    print(f"  protocols: {stats['by_protocol']}")
    if failed:
        print(f"  failed sources: {failed}")
    print(f"  outputs → {DIST}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(prog="ariston")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("collect", help="run the collect-normalize-dedupe cycle")
    args = ap.parse_args()
    if args.cmd == "collect":
        return cmd_collect()
    return 1


if __name__ == "__main__":
    sys.exit(main())
