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
import os
import sys
from pathlib import Path

from . import bank as BK
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


# D6/C — the Saturday full scan (checklist #2): «شنبه ۲۴:۰۰ تهران» —
# Tehran is UTC+3:30 year-round (no DST), so Saturday 24:00 = Sunday 00:00
# Tehran = Saturday 20:30 UTC (workflow cron "30 20 * * 6").  The window
# tolerates up to ~2h of Actions-queue delay.
TEHRAN_TZ = dt.timezone(dt.timedelta(hours=3, minutes=30), name="Asia/Tehran")


def _is_full_scan_window() -> bool:
    t = dt.datetime.now(TEHRAN_TZ)
    return t.weekday() == 6 and t.hour in (0, 1)   # Sunday 00–01 Tehran


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
            "tier": S.tier(sc, BK.TIER_GOLD_MIN, BK.TIER_SILVER_MIN) if alive else None,
            "alive": alive,
            "latency_ms": info["latency_ms"] if info else None,
        })
    rows.sort(key=lambda r: -r["score"])
    return rows


# ------------------------------------------------------------------ cli ---
def cmd_collect() -> int:
    sources = load_sources()
    uniq, stats = collect_phase(sources)
    # D10.2/B2 — publish-stamp clock (same contract as cmd_run below)
    stats["published_at"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    print("[4/4] writing outputs ...")
    P.publish_master(DIST, uniq)
    P.write_stats(DIST / "stats.json", stats)
    _print_summary(stats)
    return 0


def cmd_run(skip_validation: bool = False, full: bool = False) -> int:
    # D8/H — panel knobs first (fail-safe: any error → built-in defaults).
    pcfg = BK.load_pipeline_cfg()
    eff = BK.apply_cfg(pcfg)
    if eff.get("force_full_scan"):
        full = True
    if eff.get("skip_test"):
        skip_validation = True
    full = full or os.environ.get("ARISTON_FULL") == "1" or _is_full_scan_window()
    if eff.get("skip_test"):
        print("[0/4] ⚠ PANEL SKIP_TEST — collect-only run (no engine tests, exports frozen)")

    # D6/C — the config bank: yesterday's memory for today's run.
    bank = BK.load_bank(dist_path=DIST / "bank.json")
    print(f"[0/4] config bank: {len(bank.get('entries') or {})} entries, "
          f"{len(bank.get('sources') or {})} source records"
          f"{' · FULL SCAN (شنبه ۲۴:۰۰ تهران)' if full else ''}")

    src_all = load_sources()
    sources, quarantined_skipped = BK.filter_sources(src_all, bank, full)
    if quarantined_skipped:
        print(f"      source health: {len(quarantined_skipped)} quarantined "
              f"sources sit this one out (full scan re-invites them)")

    uniq, stats = collect_phase(sources)
    stats["sources_skipped_quarantine"] = len(quarantined_skipped)

    # D8/EH — bank resurrection: proven configs whose source vanished get a
    # seat in this run's test queue again (golden rule intact — they must pass
    # this run's engines like everyone else).
    rescued_uris, rescue_stats = BK.resurrect(bank, set(uniq))
    if rescued_uris:
        uniq.extend(rescued_uris)
        print(f"[2a/4] bank rescue: {rescue_stats['picked']} orphaned proven configs "
              f"re-enter the queue (of {rescue_stats['candidates']} candidates)")
    stats["rescue"] = rescue_stats

    # D10/G5 — panel filter stage (protocols · keywords · geo).  Empty knobs =
    # a pure pass-through; any filter only *shrinks* today's queue.
    try:
        geo_on = BK.csv_tokens(BK.GEO_ALLOW) or BK.csv_tokens(BK.GEO_DENY)
        table = G.load_table() if geo_on else None
        lookup = (lambda ip: (G.lookup(table, ip) or (None, None))[1]) if (geo_on and table) else None
        uniq, fstats = BK.filter_uniq(uniq, lookup)
        stats["filter"] = fstats
        if fstats["out"] != fstats["in"]:
            print(f"[2a/4] panel filters: {fstats['in']:,} → {fstats['out']:,} "
                  f"(proto {fstats['proto_dropped']} · deny {fstats['deny_dropped']} · "
                  f"allow {fstats['allow_dropped']} · geo {fstats['geo_dropped']})")
        elif geo_on and not fstats["geo_available"]:
            print("[2a/4] panel geo filter: table unavailable — filter skipped (fail-safe)")
    except Exception as exc:   # a broken filter stage must never kill the run
        stats["filter"] = {"error": type(exc).__name__}
        print(f"[2a/4] panel filters: skipped ({type(exc).__name__})")

    # D6/C — fold this run's source health into the ledger.
    failed_ids = list((stats.get("sources_failed") or {}).keys())
    ok_ids = [s["id"] for s in sources if s["id"] not in set(failed_ids)]
    bank = BK.merge_sources(bank, ok_ids, stats.get("sources_failed") or {})

    # Cheap TCP sweep first: closed ports can never pass an engine test.
    # UDP-family (Hysteria2/TUIC) and SSR pass through untouched.
    # The Saturday full scan skips this shortcut on purpose (checklist #2).
    probe_list = uniq
    if not skip_validation and V.engines_available():
        if full:
            print("[2b/4] full scan — TCP prefilter skipped (شنبه ۲۴:۰۰)")
            stats["prefilter"] = {"skipped_full_scan": True, "output": len(uniq)}
        else:
            print(f"[2b/4] TCP prefilter on {len(uniq)} endpoints ...")
            probe_list, pre = V.tcp_prefilter(uniq)
            stats["prefilter"] = pre
            print(f"       tcp_open {pre['tcp_open']:,} · pass-through {pre['pass_through']:,}"
                  f" · tcp_closed {pre['tcp_closed']:,} → {pre['output']:,} to engines")

    # D6/C — smart prioritization: banked-good endpoints are probed first.
    if not skip_validation and V.engines_available():
        before = len(probe_list)
        probe_list = BK.prioritized(probe_list, bank)
        print(f"[2c/4] bank prioritization: "
              f"{len(BK.bank_good_hashes(bank))} banked-good → front of the queue "
              f"({before} endpoints kept)")

    history, vsummary, per_node = validate_phase(probe_list, skip=skip_validation)
    stats["validation"] = vsummary

    rows = score_phase(uniq, history, per_node)
    tiers = {"gold": sum(1 for r in rows if r["alive"] and r["tier"] == "gold"),
             "silver": sum(1 for r in rows if r["alive"] and r["tier"] == "silver"),
             "bronze": sum(1 for r in rows if r["alive"] and r["tier"] == "bronze")}
    # D8/H: in skip_test runs there is no honest tier number → publish absence,
    # not zeros (consumers treat a missing scoring as «nothing happened»).
    if not skip_validation:
        stats["scoring"] = tiers
    tiers_map = tiers if isinstance(tiers, dict) else {}

    # D6/C — fold the run into the bank and publish it for the next one.
    # When validation was skipped (--no-validate / missing engines / panel
    # skip_test) the bank is left untouched — a run that tested nothing must
    # not punish anyone.
    alive_hashes = {info["hash"] for info in per_node.values() if info.get("alive")}
    alive_now = vsummary.get("alive") if isinstance(vsummary, dict) else None
    bank_hits = len(alive_hashes & set(BK.bank_good_hashes(bank).keys()))
    if isinstance(vsummary, dict) and not vsummary.get("skipped"):
        uris_by_hash = {hashlib.sha256(u.encode()).hexdigest()[:16]: u for u in uniq}
        bank = BK.merge_run(bank, history, alive_hashes, alive_now, uris_by_hash)
    # D8/EH — rescue telemetry: how many resurrected configs came back alive
    rescue_alive = 0
    if rescued_uris:
        rescue_hashes = {hashlib.sha256(u.encode()).hexdigest()[:16] for u in rescued_uris}
        rescue_alive = len(alive_hashes & rescue_hashes)
    src_sum = BK.source_summary(bank)
    bank["meta"]["last_run_duration_s"] = stats.get("duration_seconds")
    # D7 — engineer-readable bank telemetry (surfaced in stats.json → bot /
    # mini app / channel / README bank-card): streaks + hit-rate + latency.
    ent = bank.get("entries") or {}
    streaks = [int(e.get("streak", 0) or 0) for e in ent.values()]
    ms_vals = [e["ms"] for e in ent.values() if isinstance(e.get("ms"), (int, float))]
    bank_avg_ms = round(sum(ms_vals) / len(ms_vals)) if ms_vals else None
    bank["meta"]["avg_streak"] = round(sum(streaks) / len(streaks), 1) if streaks else 0.0
    bank["meta"]["best_streak"] = max(streaks) if streaks else 0
    stats["bank"] = {
        "size": len(ent),
        "banked_alive_hits": bank_hits,
        "pass2": (vsummary or {}).get("pass2") if isinstance(vsummary, dict) else None,
        "sources": {**src_sum["counts"], "skipped_this_run": len(src_sum["skipped"])},
        "full_scan": full,
        "alive_delta": (alive_now - (bank["meta"].get("prev_alive") or 0))
                       if alive_now is not None else None,
        "avg_streak": bank["meta"]["avg_streak"],
        "best_streak": bank["meta"]["best_streak"],
        "hit_rate": (round(100.0 * bank_hits / alive_now, 1)
                     if alive_now and isinstance(alive_now, (int, float)) else None),
        "avg_ms": bank_avg_ms,
        # D8/EH — resurrection telemetry (surfaced by bot/panel/Pages)
        "rescue": {**rescue_stats, "alive": rescue_alive} if rescued_uris else rescue_stats,
    }
    print(f"[3c/4] bank: {stats['bank']['size']} entries · hits {bank_hits} · "
          f"pass2 {stats['bank']['pass2']} · sources {stats['bank']['sources']}")

    # D9/U2 — daily health log: one row per Tehran day (hit_rate / alive / gold),
    # kept 14 days inside bank.meta (persists on the data branch) and the last 8
    # published as stats.health_7d for the mini-app + Pages sparklines.
    # Skip-test runs append nothing (no honest numbers) but still republish the
    # existing log so consumers never lose the chart.
    try:
        today = dt.datetime.now(TEHRAN_TZ).date().isoformat()
        hlog = [x for x in (bank.get("meta") or {}).get("health_log") or []
                if isinstance(x, dict) and x.get("d") and x["d"] != today][-13:]
        if not skip_validation and alive_now is not None:
            hlog.append({"d": today,
                         "hit": stats["bank"]["hit_rate"],
                         "alive": alive_now,
                         "gold": (tiers or {}).get("gold")})
        bank.setdefault("meta", {})["health_log"] = hlog
        stats["health_7d"] = hlog[-8:]
    except Exception:
        stats["health_7d"] = (bank.get("meta") or {}).get("health_log") or []

    print("[4/4] writing outputs ...")
    P.publish_master(DIST, uniq)
    if not skip_validation:
        P.publish_tiers(DIST, rows)
        stats["clients"] = P.publish_clients(DIST, rows)
    else:
        # D8/H skip_test: engine results are absent → never overwrite the
        # live export files with empty lists.  The workflow prefetched the
        # previous snapshot's exports into dist/, so they ride along frozen.
        print("[4/4] skip_test: tier/client exports left frozen (previous snapshot)")
    (DIST / "readme-stats.md").write_text(P.render_stats_markdown(stats, "fa"), encoding="utf-8")
    for code, fname in [("en", "readme-stats-en.md"), ("tr", "readme-stats-tr.md"),
                        ("ru", "readme-stats-ru.md"), ("zh", "readme-stats-zh.md")]:
        (DIST / fname).write_text(P.render_stats_markdown(stats, code), encoding="utf-8")

    print("[4b/4] classifying Iranian operator networks ...")
    table = G.load_table()
    geo = G.classify(uniq, table)
    stats["operators"] = geo["stats"]
    lat_by_uri = {r["uri"]: r["latency_ms"] for r in rows if r.get("latency_ms") is not None}
    P.publish_operators(DIST, geo["by_slug"], lat_by_uri)  # all classified (like by-protocol)
    # D8/U5 — per-config operator map (sha16(canonical uri) → slug) for the bot's
    # operator chips.  Small, additive, and safe to ignore by every consumer.
    op_by_hash = {}
    for slug, info in (geo.get("by_slug") or {}).items():
        for uri in info.get("uris") or []:
            op_by_hash[hashlib.sha256(uri.encode()).hexdigest()[:16]] = slug
    (DIST / "operators.json").write_text(
        json.dumps(op_by_hash, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # D8/H — publish the effective knob set (transparency + the worker uses it
    # to confirm/reset «force full scan» requests from the panel).
    stats["pipeline_cfg"] = {**eff, "requested": pcfg or {}}
    # D10.2/B2 — the «last run» clock for the bot / admin panel / mini-app
    # measures from the moment this snapshot was finalized, not from collect
    # start.  Runs take 15-25 min and Actions slots get skipped, so counting
    # from generated_at (start stamp) made the panel say «57 دقیقه پیش» right
    # after the bot had announced «تست جدید تموم شد».  Additive field — every
    # consumer falls back to generated_at when it is absent.
    stats["published_at"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    P.write_stats(DIST / "stats.json", stats)
    P.write_history(DIST / "results.json", history)
    # D6/C — the bank rides to the data branch with the rest of dist/
    (DIST / "bank.json").write_text(
        json.dumps(bank, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (DIST / "sources-health.json").write_text(
        json.dumps({"generated_at": stats.get("generated_at"),
                    "sources": bank.get("sources") or {}},
                   ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    _print_summary(stats)
    return 0


def _print_summary(stats: dict) -> None:
    v = stats.get("validation", {})
    print("\n── summary ─────────────────────────────")
    print(f"  raw {stats['raw']} → unique {stats['unique']}  "
          f"(dupes: exact {stats['dupes']['exact_dupes']}, "
          f"same-node {stats['dupes']['same_node_dupes']})")
    pre = stats.get("prefilter")
    if pre:
        if pre.get("skipped_full_scan"):
            print("  tcp prefilter: skipped (Saturday full scan)")
        else:
            print(f"  tcp prefilter: open {pre['tcp_open']} · pass-through {pre['pass_through']}"
                  f" · closed {pre['tcp_closed']} → {pre['output']} probed by engines")
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
    run_p.add_argument("--full", action="store_true",
                       help="Saturday-style full scan: no TCP prefilter, quarantined "
                            "sources re-invited (also auto-on for Sat 24:00 Tehran)")
    args = ap.parse_args()
    if args.cmd == "collect":
        return cmd_collect()
    if args.cmd == "run":
        return cmd_run(skip_validation=args.no_validate, full=args.full)
    return 1


if __name__ == "__main__":
    sys.exit(main())
