"""Stage 4 — Scorer.

score = 0.40 * latency + 0.30 * success_rate + 0.15 * freshness + 0.15 * protocol

Each component is 0..100.  When a component is unknown (e.g. latency before
Stage 3 is wired) the weights re-normalize over the known components only.
"""

from __future__ import annotations

WEIGHTS = {"latency": 0.40, "success": 0.30, "freshness": 0.15, "protocol": 0.15}

# protocol strength prior (higher = more modern / more resistant)
PROTOCOL_BONUS = {
    "hysteria2": 90, "hy2": 90, "hysteria": 85, "tuic": 85,
    "vless": 60, "vmess": 55, "trojan": 55, "ss": 40, "ssr": 20,
}


def latency_score(ms: float) -> float:
    if ms <= 150:
        return 100.0
    if ms <= 300:
        return 80.0
    if ms <= 600:
        return 55.0
    if ms <= 1000:
        return 30.0
    return 10.0


def protocol_score(uri: str) -> float:
    scheme = uri.split("://", 1)[0].lower()
    base = PROTOCOL_BONUS.get(scheme, 20.0)
    if scheme == "vless" and "security=reality" in uri:
        base = 100.0
    elif scheme == "vless" and "security=tls" in uri:
        base = 60.0
    return float(base)


def freshness_score(age_hours: float, ttl_hours: float = 72.0) -> float:
    """100 when just seen, linearly decaying to 0 at TTL."""
    return max(0.0, 100.0 * (1.0 - age_hours / ttl_hours))


def total(
    latency_ms: float | None = None,
    success_rate: float | None = None,   # 0..1
    age_hours: float | None = None,
    uri: str = "",
) -> float:
    parts: dict[str, float] = {}
    if latency_ms is not None:
        parts["latency"] = latency_score(latency_ms)
    if success_rate is not None:
        parts["success"] = max(0.0, min(1.0, success_rate)) * 100.0
    if age_hours is not None:
        parts["freshness"] = freshness_score(age_hours)
    if uri:
        parts["protocol"] = protocol_score(uri)
    if not parts:
        return 0.0
    wsum = sum(WEIGHTS[k] for k in parts)
    return round(sum(WEIGHTS[k] * v for k, v in parts.items()) / wsum, 1)


def tier(score: float) -> str:
    if score >= 80:
        return "gold"
    if score >= 55:
        return "silver"
    return "bronze"
