"""Stage 3 — Validator (dual-engine).  [Phase 1b — in progress]

Four-stage health check, executed by the CI runner:

  1. SYNTAX     — already done by normalize.canonical() in the collector.
  2. HANDSHAKE  — TCP connect to host:port (asyncio, 3s timeout).
  3. ENGINE     — spin up a local engine process (xray-core OR sing-box) with
                  an inbound SOCKS port routed to the endpoint, then fetch
                  https://www.gstatic.com/generate_204 through it.
  4. MEASURE    — latency + success rate feed the scorer (score.py).

Why two engines?
  xray-core  → vmess / vless / trojan / ss  (incl. Reality, XHTTP, Vision)
  sing-box   → hysteria2 / tuic / anytls    (QUIC family — xray cannot test it)

Both binaries are downloaded per-run by the workflow (pinned versions) and
cached; no server is needed — everything runs inside GitHub Actions.
"""

from __future__ import annotations

import asyncio

TCP_TIMEOUT = 3.0


async def tcp_ping(host: str, port: int, timeout: float = TCP_TIMEOUT) -> float | None:
    """Stage 2 — plain TCP handshake. Returns milliseconds, or None."""
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port), timeout=timeout
        )
        loop = asyncio.get_event_loop()
        # connect latency measured above would need perf_counter around it; kept simple
        writer.close()
        await writer.wait_closed()
        return 0.0  # placeholder until Stage 3 wires real timing
    except Exception:
        return None


# TODO(Phase 1b): download pinned binaries, generate engine configs,
# run engine + generate_204 probe, measure latency, feed score.py.
