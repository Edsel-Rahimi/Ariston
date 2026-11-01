"""Stage 5 — Publisher.

Writes every consumer-facing artifact to dist/ (published to the `data` branch
by the workflow with a force-push — the branch always holds exactly one
snapshot commit):

  nodes.txt / nodes.b64          master feed: every unique canonical URI
  by-protocol/<p>.txt + .b64     split per protocol
  by-operator/<op>.txt           Iranian-operator split (Phase 3)
  validated.txt / .b64           only endpoints proven alive, best score first
  gold.txt / .b64                tier gold   (score >= 80)
  silver.txt / .b64              tier silver (score >= 55)
  mihomo.yaml                    full Mihomo (Clash.Meta) client config
  singbox.json                   full sing-box client config
  results.json                   rolling health history (feeds the next run)
  stats.json                     machine-readable run stats
  readme-stats(-en).md           fragment injected into the READMEs on main
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

from . import bank as BK
from . import exports as E


def write_b64(path: Path, text: str) -> None:
    path.write_bytes(base64.b64encode(text.encode("utf-8")))


def remark_uri(uri: str, ping_ms: float | None, tier: str | None = None) -> str:
    """Brand remark on every published URI — D9/G2-1: rendered through the
    panel-editable template (``Ariston{-GOLD}-{ping}ms`` by default, which
    reproduces the classic ``Ariston-<ping>ms`` / ``Ariston-GOLD-<ping>ms``
    labels exactly, decision 2026-11-01 #3).  Fails safe to the classic look."""
    base = uri.split("#", 1)[0]
    return f"{base}#{BK.render_remark(BK.REMARK_TPL, ping_ms, tier)}"


def write_stats(path: Path, stats: dict) -> None:
    path.write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")


def write_history(path: Path, results: dict) -> None:
    path.write_text(json.dumps(results, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf-8")


def publish_master(dist: Path, uniq: list[str]) -> None:
    """Master feed + per-protocol splits (always written, validation or not).
    D9/G2-3: the .b64 twins are skipped when the panel turns base64 off."""
    dist.mkdir(exist_ok=True)
    text = "\n".join(uniq) + "\n"
    (dist / "nodes.txt").write_text(text, encoding="utf-8")
    if BK.EXPORTS_BASE64:
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
        if BK.EXPORTS_BASE64:
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
        tier = "gold" if name == "gold" else None  # D6/B: gold = Ariston-GOLD-<ms>
        text = "\n".join(remark_uri(r["uri"], r.get("latency_ms"), tier) for r in selected) + "\n"
        (dist / f"{name}.txt").write_text(text, encoding="utf-8")
        if BK.EXPORTS_BASE64:
            write_b64(dist / f"{name}.b64", text)


def publish_clients(dist: Path, rows: list[dict]) -> dict:
    """Ready-to-import client configs (Mihomo / Clash.Meta + sing-box).
    Built from live-tested endpoints best-first; falls back to the full
    ranked list when validation was skipped.
    D9/G2-3 — panel-tunable selection: each export can be turned off.  Fail-safe:
    if BOTH are off, both are built anyway (an empty shelf helps nobody)."""
    dist.mkdir(exist_ok=True)
    selected = [r for r in rows if r["alive"]] or rows
    ranked = sorted(selected, key=lambda r: -r["score"])
    report = {}
    if BK.EXPORTS_MIHOMO or not BK.EXPORTS_SINGBOX:
        yaml_text, report["mihomo"] = E.to_mihomo(ranked)
        (dist / "mihomo.yaml").write_text(yaml_text, encoding="utf-8")
    else:
        report["mihomo"] = {"built": 0, "skipped": 0, "disabled": True}
    if BK.EXPORTS_SINGBOX or not BK.EXPORTS_MIHOMO:
        sb_text, report["singbox"] = E.to_singbox(ranked)
        (dist / "singbox.json").write_text(sb_text, encoding="utf-8")
    else:
        report["singbox"] = {"built": 0, "skipped": 0, "disabled": True}
    return report


def _fmt_num(n: int) -> str:
    return f"{n:,}"


def publish_operators(dist: Path, by_slug: dict, lat_by_uri: dict | None = None) -> None:
    """Iranian-operator split (Phase 3).  Stable set of files, possibly empty:
    by-operator/<slug>.txt with every classified endpoint (all uniques,
    mirroring by-protocol) — consumers cross-check aliveness themselves.
    lat_by_uri: uri → measured ping (alive endpoints) for brand remarks."""
    lat_by_uri = lat_by_uri or {}
    op_dir = dist / "by-operator"
    op_dir.mkdir(exist_ok=True)
    for slug in ["tci", "mci", "irancell", "rightel", "shatel", "mobinnet",
                 "asiatech", "parsonline", "pishgaman", "respina", "ir-other"]:
        entries = by_slug.get(slug, {}).get("uris", [])
        lines = [remark_uri(u, lat_by_uri.get(u)) for u in entries]
        text = "\n".join(lines) + "\n" if lines else ""
        (op_dir / f"{slug}.txt").write_text(text, encoding="utf-8")


# Localised stat-table labels — one entry per README language.
STATS_LABELS: dict[str, dict[str, str]] = {
    "fa": {
        "last": "🕒 آخرین اجرا", "clean": "🧹 پالایش", "tested": "🧪 تست زنده",
        "healthy": "✅ سالم", "ir": "🇮🇷 روی شبکه‌های ایران",
        "tiers": "🏅 طلا / نقره / برنز", "median": "⚡ تأخیر میانه",
        "clean_v": "{raw} خام ← {uniq} یکتا", "tested_v": "{n} گره دو-موتوره",
        "bank": "🏦 بانک کانفیگ", "bank_src": "🩺 سلامت منابع",
        "bank_v": "{n} خوش‌سابقه · بازگشت {hit}٪ · میانگین سابقه {streak} دور",
        "bank_src_v": "سالم {h} · مشکوک {s} · قرنطینه {q}",
    },
    "en": {
        "last": "🕒 Last run", "clean": "🧹 Cleanup", "tested": "🧪 Live-tested",
        "healthy": "✅ Healthy", "ir": "🇮🇷 On Iranian networks",
        "tiers": "🏅 Gold / Silver / Bronze", "median": "⚡ Median latency",
        "clean_v": "{raw} raw → {uniq} unique", "tested_v": "{n} nodes (dual-engine)",
        "bank": "🏦 Config bank", "bank_src": "🩺 Source health",
        "bank_v": "{n} known-good · hit {hit}% · avg streak {streak} runs",
        "bank_src_v": "healthy {h} · suspect {s} · quarantined {q}",
    },
    "tr": {
        "last": "🕒 Son çalıştırma", "clean": "🧹 Temizlik", "tested": "🧪 Canlı test",
        "healthy": "✅ Sağlıklı", "ir": "🇮🇷 İran şebekelerinde",
        "tiers": "🏅 Altın / Gümüş / Bronz", "median": "⚡ Medyan gecikme",
        "clean_v": "{raw} ham → {uniq} tekil", "tested_v": "{n} düğüm (çift motor)",
        "bank": "🏦 Yapılandırma bankası", "bank_src": "🩺 Kaynak sağlığı",
        "bank_v": "{n} güvenilir · isabet {hit}% · ort. seri {streak} tur",
        "bank_src_v": "sağlıklı {h} · şüpheli {s} · karantina {q}",
    },
    "ru": {
        "last": "🕒 Последний запуск", "clean": "🧹 Очистка", "tested": "🧪 Живая проверка",
        "healthy": "✅ Работают", "ir": "🇮🇷 В иранских сетях",
        "tiers": "🏅 Золото / Серебро / Бронза", "median": "⚡ Медианная задержка",
        "clean_v": "{raw} сырых → {uniq} уникальных", "tested_v": "{n} узлов (два движка)",
        "bank": "🏦 Банк конфигов", "bank_src": "🩺 Здоровье источников",
        "bank_v": "{n} надёжных · попаданий {hit}% · ср. серия {streak}",
        "bank_src_v": "здоровых {h} · подозрительных {s} · карантин {q}",
    },
    "zh": {
        "last": "🕒 最近运行", "clean": "🧹 清洗", "tested": "🧪 实测",
        "healthy": "✅ 可用", "ir": "🇮🇷 位于伊朗网络",
        "tiers": "🏅 金 / 银 / 铜", "median": "⚡ 中位延迟",
        "clean_v": "{raw} 原始 → {uniq} 唯一", "tested_v": "{n} 个节点（双引擎）",
        "bank": "🏦 配置银行", "bank_src": "🩺 源健康度",
        "bank_v": "{n} 个优等 · 命中 {hit}% · 平均连击 {streak} 轮",
        "bank_src_v": "健康 {h} · 可疑 {s} · 隔离 {q}",
    },
}


def render_stats_markdown(stats: dict, lang: str = "fa") -> str:
    """Small markdown fragment injected into the READMEs between markers."""
    L = STATS_LABELS.get(lang, STATS_LABELS["en"])
    v = stats.get("validation") or {}
    sc = stats.get("scoring") or {}
    lat = (v.get("latency_ms") or {}) if not v.get("skipped") else {}
    alive = v.get("alive", 0)
    probed = v.get("probed", 0)
    rate = f"{100.0 * alive / probed:.1f}%" if probed else "—"
    ts = (stats.get("published_at") or stats.get("generated_at") or "").replace("T", " ")[:16]  # D10.2/B2
    ir = (stats.get("operators") or {}).get("classified_iran")
    clean_v = L["clean_v"].format(raw=f"{stats.get('raw', 0):,}", uniq=f"{stats.get('unique', 0):,}")
    tested_v = L["tested_v"].format(n=f"{probed:,}")
    rows = [
        (L["last"], ts + " UTC"),
        (L["clean"], clean_v),
        (L["tested"], tested_v),
        (L["healthy"], f"{alive:,} ({rate})"),
        (L["tiers"], f"{sc.get('gold', 0)} / {sc.get('silver', 0)} / {sc.get('bronze', 0)}"),
        (L["median"], (f"{lat.get('p50')} ms" if lat.get('p50') is not None else "—")),
    ]
    if ir is not None:
        rows.insert(4, (L["ir"], f"{ir:,}"))
    # D7 — the config bank, in every README fragment
    b = stats.get("bank") or {}
    if b:
        bs = b.get("sources") or {}
        rows.append((L["bank"], L["bank_v"].format(
            n=f"{int(b.get('size') or 0):,}",
            hit=(b.get("hit_rate") if b.get("hit_rate") is not None else "—"),
            streak=(b.get("avg_streak") if b.get("avg_streak") is not None else "—"))))
        rows.append((L["bank_src"], L["bank_src_v"].format(
            h=f"{int(bs.get('healthy') or 0):,}", s=f"{int(bs.get('suspect') or 0):,}",
            q=f"{int(bs.get('quarantined') or 0):,}")))
    lines = ["| | |", "|---|---|"] + [f"| {k} | **{val}** |" for k, val in rows]
    return "\n".join(lines)
