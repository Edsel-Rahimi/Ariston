"""D6/C — Config Bank: the pipeline's memory between runs.

Design (approved by the owner, 2026-11-01 — the «بَنک کانفیگ آرِستون» proposal):

- ``bank.json`` lives on the ``data`` branch and is loaded at the start of
  every run (the workflow prefetches it to ``dist/bank.json``; this module
  falls back to a direct HTTP fetch, cache-busted).
- The bank NEVER serves a config that did not pass the current run's test —
  the golden rule of the pipeline stays intact.  It only:
    (a) reorders the engine queue so known-good endpoints are probed first
        (smart prioritization),
    (b) funds the second pass: borderline failures (timeout / probe-error /
        engine-boot / no-socks) get exactly one retry with a doubled timeout,
    (c) tracks per-source health (healthy / suspect / quarantined) so dead
        sources stop burning fetch time every 30 minutes.
- TTL: an entry with no pass for ``BANK_TTL_HOURS`` (28h — checklist #1) is
  dropped, so the bank refreshes itself naturally.
- Fail-safety: every loader here returns a usable empty structure on any
  error — a broken or missing bank degrades to the classic pipeline, never
  to a failed run.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import urllib.request

BANK_VERSION = 1
BANK_TTL_HOURS = float(os.environ.get("ARISTON_BANK_TTL", "28"))   # checklist #1
BANK_URL = os.environ.get(
    "ARISTON_BANK_URL",
    "https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/bank.json")

# Borderline failure reasons that earn exactly one second-chance probe.
PASS2_REASONS = {"timeout", "probe-error", "engine-boot", "no-socks"}
PASS2_TIMEOUT_FACTOR = float(os.environ.get("ARISTON_PASS2_FACTOR", "2.0"))

SUSPECT_AFTER = 2        # consecutive failed fetches → suspect
QUARANTINE_AFTER = 3     # consecutive failed fetches → quarantined
QUARANTINE_DAYS = 7.0    # checklist #2: the Saturday full scan is their way back


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def empty_bank() -> dict:
    return {"version": BANK_VERSION, "entries": {}, "sources": {},
            "meta": {"updated_at": _now(), "ttl_hours": BANK_TTL_HOURS}}


def load_bank(dist_path=None) -> dict:
    """dist/bank.json (prefetched by CI) → HTTP fallback → empty bank."""
    try:
        if dist_path is not None:
            p = str(dist_path)
            if os.path.isfile(p) and os.path.getsize(p) > 0:
                data = json.loads(open(p, encoding="utf-8").read())
                if isinstance(data, dict) and isinstance(data.get("entries", {}), dict):
                    return {**empty_bank(), **data}
        req = urllib.request.Request(BANK_URL + ("?t=" + str(int(dt.datetime.now().timestamp()))),
                                     headers={"user-agent": "ariston-pipeline"})
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read().decode("utf-8"))
        if isinstance(data, dict) and isinstance(data.get("entries", {}), dict):
            return {**empty_bank(), **data}
    except Exception:
        pass
    return empty_bank()


def bank_good_hashes(bank: dict) -> dict[str, int]:
    """hash → streak, for entries believed good (streak > 0)."""
    out = {}
    for h, e in (bank.get("entries") or {}).items():
        try:
            s = int(e.get("streak", 0))
        except Exception:
            s = 0
        if s > 0:
            out[h] = s
    return out


def prioritized(uris: list[str], bank: dict) -> list[str]:
    """(a) Smart prioritization — banked-good endpoints first (streak desc),
    everything else keeps its protocol-sorted order."""
    good = bank_good_hashes(bank)
    if not good or not uris:
        return uris
    from hashlib import sha256
    head: list[tuple[int, int, str]] = []
    tail: list[str] = []
    for i, u in enumerate(uris):
        h = sha256(u.encode()).hexdigest()[:16]
        s = good.get(h)
        if s:
            head.append((-s, i, u))
        else:
            tail.append(u)
    if not head:
        return uris
    head.sort()
    return [u for _, _, u in head] + tail


def merge_run(bank: dict, results: dict, alive_hashes: set[str],
              alive_now: int | None) -> dict:
    """Fold this run's results into the bank.

    - alive → streak+1, fails=0, fresh last_ok/ms
    - banked but dead this run → streak=0, fails+1 (kept for the second
      chances; the TTL decides when it finally leaves)
    - not banked and dead → not our business (results.json already tracks it)
    - TTL: no pass for BANK_TTL_HOURS → dropped (checklist #1)
    """
    now = dt.datetime.now(dt.timezone.utc)
    prev_entries = bank.get("entries") or {}
    entries: dict[str, dict] = {}
    for h in set(prev_entries) | set(results.keys()):
        old = prev_entries.get(h) or {}
        e = results.get(h) or {}
        if h in alive_hashes:
            # alive this run → promoted (streak+1, fresh last_ok)
            ms = e.get("latency_ms") if e.get("latency_ms") is not None else old.get("ms")
            entries[h] = {"streak": int(old.get("streak", 0)) + 1, "fails": 0,
                          "last_ok": e.get("last_ok") or _now(),
                          "last_tested": e.get("last_tested") or old.get("last_tested"),
                          "ms": ms}
        elif h in prev_entries and e:
            # banked but dead in THIS run → demoted, failure counted
            entries[h] = {**old, "streak": 0,
                          "fails": int(old.get("fails", 0)) + 1,
                          "last_tested": e.get("last_tested") or old.get("last_tested")}
        elif h in prev_entries:
            # banked and untested this run (source down / pruned history) →
            # kept exactly as-is — the TTL, not the test queue, decides its fate
            entries[h] = old
    kept: dict[str, dict] = {}
    for h, e in entries.items():
        lo = e.get("last_ok")
        if lo:
            try:
                age_h = (now - dt.datetime.fromisoformat(lo)).total_seconds() / 3600.0
                if age_h > BANK_TTL_HOURS:
                    continue
            except Exception:
                pass
        else:
            continue
        kept[h] = e
    meta = bank.get("meta") or {}
    bank["entries"] = kept
    bank["meta"] = {
        "updated_at": _now(),
        "ttl_hours": BANK_TTL_HOURS,
        "last_alive": alive_now,
        "prev_alive": meta.get("last_alive"),
        "last_run_duration_s": (bank.get("meta") or {}).get("last_run_duration_s"),
    }
    return bank


# --------------------------------------------------------- source health --

def merge_sources(bank: dict, ok_ids: list[str], failed: dict[str, str]) -> dict:
    """(c) Source health ledger: healthy → suspect (2 misses) → quarantined
    (3+ misses, 7 days).  A success instantly restores healthy."""
    now_dt = dt.datetime.now(dt.timezone.utc)
    src: dict = dict(bank.get("sources") or {})
    for sid in ok_ids:
        src[sid] = {"status": "healthy", "consecutive_fails": 0,
                    "last_ok": _now(), "last_error": None,
                    "quarantine_until": None}
    for sid, err in (failed or {}).items():
        s = src.get(sid) or {}
        cf = int(s.get("consecutive_fails", 0)) + 1
        rec = {"consecutive_fails": cf, "last_ok": s.get("last_ok"),
               "last_error": str(err or "unknown")[:64],
               "quarantine_until": s.get("quarantine_until")}
        if cf >= QUARANTINE_AFTER:
            rec["status"] = "quarantined"
            rec["quarantine_until"] = (now_dt +
                                       dt.timedelta(days=QUARANTINE_DAYS)
                                       ).isoformat(timespec="seconds")
        elif cf >= SUSPECT_AFTER:
            rec["status"] = "suspect"
        else:
            rec["status"] = "healthy"
        src[sid] = rec
    # expired quarantines step down to suspect (the next success heals them)
    for sid, s in src.items():
        if s.get("status") == "quarantined" and s.get("quarantine_until"):
            try:
                if dt.datetime.fromisoformat(s["quarantine_until"]) <= now_dt:
                    s["status"] = "suspect"
            except Exception:
                s["status"] = "suspect"
    bank["sources"] = src
    return bank


def source_summary(bank: dict) -> dict:
    """Counts + the ids skipped this run (quarantined & unexpired)."""
    now_dt = dt.datetime.now(dt.timezone.utc)
    counts = {"healthy": 0, "suspect": 0, "quarantined": 0}
    skipped: list[str] = []
    for sid, s in (bank.get("sources") or {}).items():
        st = s.get("status") or "healthy"
        counts[st] = counts.get(st, 0) + 1
        if st == "quarantined":
            try:
                if dt.datetime.fromisoformat(s.get("quarantine_until")) > now_dt:
                    skipped.append(sid)
            except Exception:
                skipped.append(sid)
    return {"counts": counts, "skipped": sorted(skipped)}


def filter_sources(sources: list[dict], bank: dict, full_scan: bool
                   ) -> tuple[list[dict], list[str]]:
    """Quarantined sources sit out normal runs; the Saturday full scan
    (checklist #2) re-invites everyone so they can earn their way back."""
    if full_scan:
        return sources, []
    skip = set(source_summary(bank)["skipped"])
    if not skip:
        return sources, []
    return [s for s in sources if s["id"] not in skip], sorted(skip)
