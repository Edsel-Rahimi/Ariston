"""Stage 5 — Publisher.  [Phase 2 — stub]

Planned outputs (all neutral filenames, published to the `data` branch):

  dist/nodes.txt            one canonical URI per line (master feed)
  dist/nodes.b64            base64 of the master feed (single-file import)
  dist/by-protocol/*.txt    split per protocol + .b64 companions
  dist/by-tier/*.txt        gold / silver / bronze       (Phase 2)
  dist/stats.json           machine-readable run stats
  README badge table        auto-updated on main       (Phase 2)
  Clash.Meta / sing-box JSON renders                    (Phase 2)
"""

from __future__ import annotations

import base64
import json
from pathlib import Path


def write_b64(path: Path, text: str) -> None:
    path.write_bytes(base64.b64encode(text.encode("utf-8")))


def write_stats(path: Path, stats: dict) -> None:
    path.write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")


# TODO(Phase 2): tier split, Clash.Meta + sing-box renders, README auto-update.
