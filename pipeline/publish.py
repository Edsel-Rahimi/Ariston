"""Stage 5 — Publisher.

Writes every consumer-facing artifact to dist/ (published to the `data` branch
by the workflow with a force-push — the branch always holds exactly one
snapshot commit):

  nodes.txt / nodes.b64          master feed: every unique canonical URI
  by-protocol/<p>.txt + .b64     split per protocol
  validated.txt / .b64           only endpoints proven alive, best score first
  gold.txt / .b64                tier gold   (score >= 80)
  silver.txt / .b64              tier silver (score >= 55)
  results.json                   rolling health history (feeds the next run)
  stats.json                     machine-readable run stats
"""

from __future__ import annotations

import base64
import json
from pathlib import Path


def write_b64(path: Path, text: str) -> None:
    path.write_bytes(base64.b64encode(text.encode("utf-8")))


def write_stats(path: Path, stats: dict) -> None:
    path.write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")


def write_history(path: Path, results: dict) -> None:
    path.write_text(json.dumps(results, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf-8")


def publish_master(dist: Path, uniq: list[str]) -> None:
    """Master feed + per-protocol splits (always written, validation or not)."""
    dist.mkdir(exist_ok=True)
    text = "\n".join(uniq) + "\n"
    (dist / "nodes.txt").write_text(text, encoding="utf-8")
    write_b64(dist / "nodes.b64", text)

    by_protocol: dict[str, int] = {}
    for u in uniq:
        scheme = u.split("://", 1)[0]
        by_protocol[scheme] = by_protocol.get(scheme, 0) + 1

    proto_dir = dist / "by-protocol"
    proto_dir.mkdir(exist_ok=True)
    for scheme in by_protocol:
        lines = "\n".join(u for u in uniq if u.startswith(scheme + "://")) + "\n"
        (proto_dir / f"{scheme}.txt").write_text(lines, encoding="utf-8")
        write_b64(proto_dir / f"{scheme}.b64", lines)


def publish_tiers(dist: Path, rows: list[dict]) -> None:
    """Validated / tier outputs.  Written even when empty so consumers can
    always import a stable path."""
    dist.mkdir(exist_ok=True)
    alive = [r for r in rows if r["alive"]]
    buckets = {
        "validated": alive,
        "gold": [r for r in alive if r["tier"] == "gold"],
        "silver": [r for r in alive if r["tier"] == "silver"],
    }
    for name, selected in buckets.items():
        text = "\n".join(r["uri"] for r in selected) + "\n"
        (dist / f"{name}.txt").write_text(text, encoding="utf-8")
        write_b64(dist / f"{name}.b64", text)
