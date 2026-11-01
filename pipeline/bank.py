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

D8/EH — Bank resurrection (approved by the owner, 2026-11-01):

- Proven entries (streak ≥ ``RESCUE_MIN_STREAK``) also store their ``uri``.
  The bank grows from a pure report-card into a report-card + spare key.
- When a banked config's source vanishes (channel deleted the post, the
  aggregator rotated its list), ``resurrect()`` re-injects the stored URI
  into this run's test queue — golden rule intact: it must pass THIS run's
  engine test before it is published, exactly like everything else.
- D8/H — panel-driven knobs: the pipeline reads a small JSON config from the
  bot worker (``/api/pipeline-cfg``) so the admin panel can tune TTL, pass-2,
  quarantine and rescue without a redeploy.  Every loader fails safe: any
  error → built-in defaults, the run never breaks because of the knob file.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import re
import urllib.request

BANK_VERSION = 1
BANK_URL = os.environ.get(
    "ARISTON_BANK_URL",
    "https://raw.githubusercontent.com/Edsel-Rahimi/Ariston/data/bank.json")

# ------------------------------------------------------------ live knobs --
# Defaults (env-overridable, panel-overridable — see load_pipeline_cfg below).
# Every knob is re-read at call time from these module globals, so the panel
# can tune the pipeline without a redeploy; a broken knob file changes nothing.
BANK_TTL_HOURS = float(os.environ.get("ARISTON_BANK_TTL", "28"))   # checklist #1

# Borderline failure reasons that earn exactly one second-chance probe.
PASS2_REASONS = {"timeout", "probe-error", "engine-boot", "no-socks"}
# ARISTON_PASS2=0 stays the hard kill-switch (CONTINUITY playbook wins over the panel).
PASS2_ENABLED = os.environ.get("ARISTON_PASS2", "1") != "0"
PASS2_TIMEOUT_FACTOR = float(os.environ.get("ARISTON_PASS2_FACTOR", "2.0"))

SUSPECT_AFTER = 2        # consecutive failed fetches → suspect
QUARANTINE_AFTER = 3     # consecutive failed fetches → quarantined
QUARANTINE_DAYS = 7.0    # checklist #2: the Saturday full scan is their way back
MIN_STREAK_PRIORITY = 1  # «خوش‌سابقه» threshold for queue prioritization

# D8/EH — bank resurrection knobs (panel-tunable, env defaults)
RESCUE_ENABLED = os.environ.get("ARISTON_RESCUE", "1") != "0"  # hard kill-switch
RESCUE_MIN_STREAK = int(os.environ.get("ARISTON_RESCUE_MIN_STREAK", "5"))
RESCUE_MAX = int(os.environ.get("ARISTON_RESCUE_MAX", "1500"))  # per-run test budget
RESCUE_URI_CAP = 4000   # bank-size guard: at most this many stored URIs

# D9/U2 — smart TTL: proven configs (high streak) earn a longer lifetime.
# Factor grows linearly with streak up to SMART_TTL_MAX_STREAK → SMART_TTL_MAX_X,
# then everything is clamped to SMART_TTL_ABS (hours) — never shorter than base.
SMART_TTL_ENABLED = True
SMART_TTL_MAX_STREAK = 40   # streak that reaches the full multiplier
SMART_TTL_MAX_X = 2.0       # ×bank_ttl_hours at (and beyond) that streak
SMART_TTL_ABS = 72.0        # absolute ceiling in hours (clamp, checklist U2)

# D10/G5 — panel phase 3: tier thresholds · protocol allow-list · black/white
# keywords · strictness (pass-2 dial) · geo country filter.  Every list is a
# comma-separated string; EMPTY = feature off (classic behavior, fail-safe).
TIER_GOLD_MIN = 80
TIER_SILVER_MIN = 55
PROTO_ALLOW = ""
DENY_KW = ""
ALLOW_KW = ""
STRICTNESS = 0  # 0 normal · 1 pass-2 retries only true timeouts · 2 pass-2 off
GEO_ALLOW = ""
GEO_DENY = ""

# D9/G2-1 — the brand remark template (panel-editable).
#   {-GOLD} → "-GOLD" for the gold tier, "" otherwise
#   {ping}  → rounded latency in ms (the whole "-{ping}" chunk disappears when no ping)
DEFAULT_REMARK_TPL = "Ariston{-GOLD}-{ping}ms"
REMARK_TPL = os.environ.get("ARISTON_REMARK_TPL", DEFAULT_REMARK_TPL)

# D9/G2-3 — which client exports to build (all default on = today's behavior)
EXPORTS_MIHOMO = os.environ.get("ARISTON_EXPORT_MIHOMO", "1") != "0"
EXPORTS_SINGBOX = os.environ.get("ARISTON_EXPORT_SINGBOX", "1") != "0"
EXPORTS_BASE64 = os.environ.get("ARISTON_EXPORT_B64", "1") != "0"

# ------------------------------------------------------------ pipeline cfg --
# whitelist: key → (parser, low, high) — anything else / out of range is ignored
_PCFG_INT = "int"
_PCFG_FLOAT = "float"
_PCFG_BOOL = "bool"
_PCFG_STR = "str"
_PCFG_CSV = "csv"   # comma-separated token list — empty string = off (fail-safe)
PCFG_SPEC = {
    "bank_ttl_hours":      (_PCFG_FLOAT, 6.0, 72.0),
    "pass2_enabled":       (_PCFG_BOOL, None, None),
    "pass2_factor":        (_PCFG_FLOAT, 1.0, 3.0),
    "suspect_after":       (_PCFG_INT, 1, 10),
    "quarantine_after":    (_PCFG_INT, 2, 20),
    "quarantine_days":     (_PCFG_FLOAT, 1.0, 30.0),
    "min_streak_priority": (_PCFG_INT, 1, 10),
    "rescue_enabled":      (_PCFG_BOOL, None, None),
    "rescue_min_streak":   (_PCFG_INT, 2, 20),
    "rescue_max":          (_PCFG_INT, 0, 5000),
    "skip_test":           (_PCFG_BOOL, None, None),
    "force_full_scan":     (_PCFG_BOOL, None, None),
    # D9/G2 — panel phase 2 knobs (remark template · exports selection · smart TTL)
    "remark_tpl":          (_PCFG_STR, None, None),
    "exports_mihomo":      (_PCFG_BOOL, None, None),
    "exports_singbox":     (_PCFG_BOOL, None, None),
    "exports_base64":      (_PCFG_BOOL, None, None),
    "smart_ttl":           (_PCFG_BOOL, None, None),
    # D10/G5 — panel phase 3: filters & strictness (all fail-safe defaults)
    "gold_min":            (_PCFG_INT, 50, 95),
    "silver_min":          (_PCFG_INT, 25, 79),
    "proto_allow":         (_PCFG_CSV, None, None),
    "deny_kw":             (_PCFG_CSV, None, None),
    "allow_kw":            (_PCFG_CSV, None, None),
    "strictness":          (_PCFG_INT, 0, 2),
    "geo_allow":           (_PCFG_CSV, None, None),
    "geo_deny":            (_PCFG_CSV, None, None),
}
PCFG_DEFAULTS = {
    "bank_ttl_hours": BANK_TTL_HOURS, "pass2_enabled": PASS2_ENABLED,
    "pass2_factor": PASS2_TIMEOUT_FACTOR, "suspect_after": SUSPECT_AFTER,
    "quarantine_after": QUARANTINE_AFTER, "quarantine_days": QUARANTINE_DAYS,
    "min_streak_priority": MIN_STREAK_PRIORITY, "rescue_enabled": RESCUE_ENABLED,
    "rescue_min_streak": RESCUE_MIN_STREAK, "rescue_max": RESCUE_MAX,
    "skip_test": False, "force_full_scan": False,
    "remark_tpl": REMARK_TPL, "exports_mihomo": EXPORTS_MIHOMO,
    "exports_singbox": EXPORTS_SINGBOX, "exports_base64": EXPORTS_BASE64,
    "smart_ttl": SMART_TTL_ENABLED,
    "gold_min": TIER_GOLD_MIN, "silver_min": TIER_SILVER_MIN,
    "proto_allow": PROTO_ALLOW, "deny_kw": DENY_KW, "allow_kw": ALLOW_KW,
    "strictness": STRICTNESS, "geo_allow": GEO_ALLOW, "geo_deny": GEO_DENY,
}

def _clamp(key: str, v):
    kind, lo, hi = PCFG_SPEC[key]
    try:
        if kind == _PCFG_BOOL:
            return bool(v) if isinstance(v, bool) else (str(v).lower() in ("1", "true", "yes", "on"))
        if kind == _PCFG_STR:
            s = re.sub(r"[#\r\n\t]", " ", str(v or "")).strip()
            if len(s) < 3 or not re.search(r"[A-Za-z\u0600-\u06FF]", s):
                return None   # junk/empty/number-only → dropped, default stays
            return s[:48]
        if kind == _PCFG_CSV:
            # lowercase word list; anything but [a-z0-9:._*-] acts as a separator;
            # the result is a clean comma-separated list — junk → '' (= feature off)
            s = re.sub(r"[^a-z0-9:._*\-]", " ", str(v or "").lower())
            out, seen = [], set()
            for t in s.split():
                if t not in seen:
                    seen.add(t)
                    out.append(t)
            return ",".join(out)[:400]
        if kind == _PCFG_INT:
            v = int(float(v))
        elif kind == _PCFG_FLOAT:
            v = float(v)
        else:
            return None
        if lo is not None:
            v = max(lo, v)
        if hi is not None:
            v = min(hi, v)
        return v
    except Exception:
        return None


def load_pipeline_cfg(url=None, timeout=5.0) -> dict:
    """Panel-tunable knobs, fetched from the bot worker (no secrets inside).
    Order of precedence: panel JSON > env default (already in globals) > code.
    ANY error → {} (run continues exactly like today — the worker is an
    improvement layer, never a single point of failure, same as bank.json)."""
    url = url or os.environ.get("ARISTON_PIPELINE_CFG_URL", "").strip()
    if not url:
        return {}
    try:
        req = urllib.request.Request(
            url + ("?t=" + str(int(dt.datetime.now().timestamp()))),
            headers={"user-agent": "ariston-pipeline"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.loads(r.read().decode("utf-8"))
        if not isinstance(data, dict) or not isinstance(data.get("pipeline"), dict):
            return {}
        out = {}
        for key, val in data["pipeline"].items():
            if key in PCFG_SPEC:
                c = _clamp(key, val)
                if c is not None:
                    out[key] = c
        return out
    except Exception:
        return {}


def apply_cfg(pcfg: dict) -> dict:
    """Push the (validated) panel cfg into the module globals.  Returns the
    effective cfg dict — main.py publishes it in stats.json for transparency.
    Defense in depth: every value is re-clamped here, so even a corrupted
    caller can never inject a broken knob into the run."""
    global BANK_TTL_HOURS, PASS2_ENABLED, PASS2_TIMEOUT_FACTOR
    global SUSPECT_AFTER, QUARANTINE_AFTER, QUARANTINE_DAYS, MIN_STREAK_PRIORITY
    global RESCUE_ENABLED, RESCUE_MIN_STREAK, RESCUE_MAX
    global REMARK_TPL, EXPORTS_MIHOMO, EXPORTS_SINGBOX, EXPORTS_BASE64, SMART_TTL_ENABLED
    global TIER_GOLD_MIN, TIER_SILVER_MIN, PROTO_ALLOW, DENY_KW, ALLOW_KW
    global STRICTNESS, GEO_ALLOW, GEO_DENY
    eff = dict(PCFG_DEFAULTS)
    for key, val in (pcfg or {}).items():
        if key in PCFG_SPEC:
            c = _clamp(key, val)
            if c is not None:
                eff[key] = c
    BANK_TTL_HOURS = float(eff["bank_ttl_hours"])
    PASS2_ENABLED = bool(eff["pass2_enabled"])
    PASS2_TIMEOUT_FACTOR = float(eff["pass2_factor"])
    SUSPECT_AFTER = int(eff["suspect_after"])
    QUARANTINE_AFTER = int(eff["quarantine_after"])
    QUARANTINE_DAYS = float(eff["quarantine_days"])
    MIN_STREAK_PRIORITY = int(eff["min_streak_priority"])
    RESCUE_ENABLED = bool(eff["rescue_enabled"])
    RESCUE_MIN_STREAK = int(eff["rescue_min_streak"])
    RESCUE_MAX = int(eff["rescue_max"])
    REMARK_TPL = str(eff["remark_tpl"]) or DEFAULT_REMARK_TPL
    EXPORTS_MIHOMO = bool(eff["exports_mihomo"])
    EXPORTS_SINGBOX = bool(eff["exports_singbox"])
    EXPORTS_BASE64 = bool(eff["exports_base64"])
    SMART_TTL_ENABLED = bool(eff["smart_ttl"])
    # D10/G5 — tier thresholds keep their sane order (silver strictly below gold)
    g, s = int(eff["gold_min"]), int(eff["silver_min"])
    if s >= g:
        s = g - 1
    TIER_GOLD_MIN, TIER_SILVER_MIN = g, max(0, s)
    PROTO_ALLOW = str(eff["proto_allow"] or "")
    DENY_KW = str(eff["deny_kw"] or "")
    ALLOW_KW = str(eff["allow_kw"] or "")
    STRICTNESS = int(eff["strictness"])
    GEO_ALLOW = str(eff["geo_allow"] or "")
    GEO_DENY = str(eff["geo_deny"] or "")
    return eff


def csv_tokens(csv_str: str) -> list[str]:
    """Split a panel csv knob into clean lowercase tokens ('' → [])."""
    return [t for t in re.split(r"[,:]", str(csv_str or "")) if t.strip()]


def filter_uniq(uris: list[str], geo_lookup=None) -> tuple[list[str], dict]:
    """D10/G5 — panel filter stage, applied right after collect+rescue.
    Reads the module globals (PROTO_ALLOW / DENY_KW / ALLOW_KW / GEO_*), so it
    always sees the effective (clamped) knobs.  All four filters are OFF by
    default → the function is a pure pass-through and stats show zeros.
    ``geo_lookup(ip) -> country-code | None`` comes from geo.lookup + the
    ip2asn table; domain-hosted endpoints stay unfiltered (honest fail-safe)."""
    proto = set(csv_tokens(PROTO_ALLOW))
    deny = [k.lower() for k in csv_tokens(DENY_KW)]
    allow = [k.lower() for k in csv_tokens(ALLOW_KW)]
    geo_a = {c.upper() for c in csv_tokens(GEO_ALLOW)}
    geo_d = {c.upper() for c in csv_tokens(GEO_DENY)}
    geo_on = bool(geo_a or geo_d) and callable(geo_lookup)
    stats = {"in": len(uris), "proto_dropped": 0, "deny_dropped": 0,
             "allow_dropped": 0, "geo_dropped": 0, "geo_available": geo_on,
             "out": 0}
    if not (proto or deny or allow or geo_on):
        stats["out"] = stats["in"]
        return uris, stats
    out: list[str] = []
    for u in uris:
        scheme = u.split("://", 1)[0].lower()
        if proto and scheme not in proto:
            stats["proto_dropped"] += 1
            continue
        low = u.lower()
        if deny and any(k in low for k in deny):
            stats["deny_dropped"] += 1
            continue
        if allow and not any(k in low for k in allow):
            stats["allow_dropped"] += 1
            continue
        if geo_on:
            cc = None
            try:
                from .validate import _hostport
                host, _p = _hostport(u)
                if host:
                    cc = geo_lookup(host)   # None for domains / unknown IPs
            except Exception:
                cc = None
            if cc is not None:
                if geo_d and cc in geo_d:
                    stats["geo_dropped"] += 1
                    continue
                if geo_a and cc not in geo_a:
                    stats["geo_dropped"] += 1
                    continue
        out.append(u)
    stats["out"] = len(out)
    return out, stats


def render_remark(tpl: str | None, ping_ms, tier: str | None = None) -> str:
    """D9/G2-1 — panel-editable remark template → the final brand label.
    Fails safe: any weird input renders the classic ``Ariston[-GOLD]-<ms>ms``.
    ``#`` is stripped so the template can never break the URI fragment."""
    t = str(tpl or REMARK_TPL or DEFAULT_REMARK_TPL)
    t = t.replace("{-GOLD}", "-GOLD" if tier == "gold" else "")
    if isinstance(ping_ms, (int, float)) and ping_ms is not None:
        t = t.replace("{ping}", str(int(round(ping_ms))))
    else:
        t = re.sub(r"-?\{ping\}(ms)?", "", t)   # no ping → the whole «-{ping}ms» chunk goes
    t = t.replace("#", "").strip().strip("-").strip() or "Ariston"
    return t[:48]


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
    """hash → streak, for entries believed good (streak ≥ MIN_STREAK_PRIORITY)."""
    out = {}
    for h, e in (bank.get("entries") or {}).items():
        try:
            s = int(e.get("streak", 0))
        except Exception:
            s = 0
        if s >= max(1, MIN_STREAK_PRIORITY):
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
              alive_now: int | None, uris_by_hash: dict[str, str] | None = None
              ) -> dict:
    """Fold this run's results into the bank.

    - alive → streak+1, fails=0, fresh last_ok/ms
    - banked but dead this run → streak=0, fails+1 (kept for the second
      chances; the TTL decides when it finally leaves)
    - not banked and dead → not our business (results.json already tracks it)
    - TTL: no pass for BANK_TTL_HOURS → dropped (checklist #1)
    - D8/EH resurrection: once an entry proves itself for RESCUE_MIN_STREAK
      consecutive runs its ``uri`` is stored too (the «spare key»), so a later
      run can still test it even if every source that carried it disappears.
    """
    now = dt.datetime.now(dt.timezone.utc)
    prev_entries = bank.get("entries") or {}
    uris_by_hash = uris_by_hash or {}
    entries: dict[str, dict] = {}
    for h in set(prev_entries) | set(results.keys()):
        old = prev_entries.get(h) or {}
        e = results.get(h) or {}
        if h in alive_hashes:
            # alive this run → promoted (streak+1, fresh last_ok)
            ms = e.get("latency_ms") if e.get("latency_ms") is not None else old.get("ms")
            streak = int(old.get("streak", 0)) + 1
            entry = {"streak": streak, "fails": 0,
                     "last_ok": e.get("last_ok") or _now(),
                     "last_tested": e.get("last_tested") or old.get("last_tested"),
                     "ms": ms}
            # spare key: keep the uri once the config is proven (and never lose it)
            uri = uris_by_hash.get(h) or old.get("uri")
            if uri and streak >= max(1, RESCUE_MIN_STREAK):
                entry["uri"] = uri
            elif old.get("uri"):
                entry["uri"] = old["uri"]  # already stored → keep, streak drop is not a fire
            entries[h] = entry
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
                # D9/U2 — smart TTL: high streaks earn a longer lifetime
                # (linear up to SMART_TTL_MAX_X, absolute ceiling SMART_TTL_ABS).
                ttl = BANK_TTL_HOURS
                if SMART_TTL_ENABLED:
                    try:
                        streak = min(int(e.get("streak", 0) or 0), SMART_TTL_MAX_STREAK)
                        ttl = min(BANK_TTL_HOURS * (1.0 + streak / SMART_TTL_MAX_STREAK
                                                    * (SMART_TTL_MAX_X - 1.0)), SMART_TTL_ABS)
                    except Exception:
                        ttl = BANK_TTL_HOURS
                if age_h > max(BANK_TTL_HOURS, ttl):
                    continue
            except Exception:
                pass
        else:
            continue
        kept[h] = e
    # bank-size guard: too many spare keys → keep the ones with the best streak
    with_uri = [(int(e.get("streak", 0) or 0), h) for h, e in kept.items() if e.get("uri")]
    if len(with_uri) > RESCUE_URI_CAP:
        with_uri.sort(reverse=True)
        drop = {h for _, h in with_uri[RESCUE_URI_CAP:]}
        for h in drop:
            kept[h].pop("uri", None)
    meta = bank.get("meta") or {}
    bank["entries"] = kept
    bank["meta"] = {
        "updated_at": _now(),
        "ttl_hours": BANK_TTL_HOURS,
        "last_alive": alive_now,
        "prev_alive": meta.get("last_alive"),
        "last_run_duration_s": (bank.get("meta") or {}).get("last_run_duration_s"),
        "health_log": meta.get("health_log"),   # D9/U2 — 7-day health history rides along
    }
    return bank


# ------------------------------------------------------------- D8/EH rescue --

def resurrect(bank: dict, collected_uris: set[str]) -> tuple[list[str], dict]:
    """Bank resurrection: proven configs whose URI is stored in the bank but
    which NO source delivered this run (deleted post, rotated list, dead
    source) get re-injected into the test queue.  The golden rule is intact:
    what comes back must pass THIS run's engine test, same as everyone else.

    Returns (extra_uris, telemetry).  Any doubt → empty list (classic run)."""
    empty: dict = {"candidates": 0, "picked": 0, "enabled": RESCUE_ENABLED}
    if not RESCUE_ENABLED:
        return [], empty
    try:
        collected_hashes = set()
        for u in collected_uris:
            collected_hashes.add(hashlib.sha256(u.encode()).hexdigest()[:16])
        cands = []
        for h, e in (bank.get("entries") or {}).items():
            uri = e.get("uri")
            if not uri or h in collected_hashes:
                continue
            try:
                s = int(e.get("streak", 0) or 0)
            except Exception:
                s = 0
            if s < max(1, RESCUE_MIN_STREAK):
                continue
            cands.append((-s, h, uri))
        cands.sort()  # best streak first
        picked = [u for _, _, u in cands[:max(0, RESCUE_MAX)]]
        return picked, {"candidates": len(cands), "picked": len(picked),
                        "enabled": True}
    except Exception:
        return [], {**empty, "error": True}


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
