"""Stage 1 — Collector.

Fetches raw text from every enabled source (HTTP feeds and public Telegram
web previews) and extracts endpoint URIs.  Standard library only.
"""

from __future__ import annotations

import re
import ssl
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
TIMEOUT = 25
SCHEME_RE = r"(?:vmess|vless|trojan|ss|ssr|hysteria2?|hy2|tuic)"
URI_RE = re.compile(SCHEME_RE + r"://[^\s<>\"'\\]+", re.IGNORECASE)
TIMEOUT_RE = re.compile(r"https?://t\.me/\S+", re.IGNORECASE)


def _fetch(url: str) -> str:
    """GET a URL and return decoded text. Raises on any failure."""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=TIMEOUT, context=ssl.create_default_context()) as resp:
        return resp.read(2_000_000).decode("utf-8", "replace")


def _clean(uri: str) -> str:
    uri = uri.replace("&amp;", "&")
    return uri.rstrip(".,;:)'m>]")


def extract_uris(text: str) -> list[str]:
    """Pull endpoint URIs out of any blob of text (HTML or plain)."""
    found = URI_RE.findall(text)
    return [_clean(u) for u in found]


def fetch_source(src: dict) -> tuple[str, str, str | None]:
    """Fetch one source. Returns (id, text, error)."""
    try:
        if src.get("type") == "telegram":
            text = _fetch(f"https://t.me/s/{src['channel']}")
        else:
            text = _fetch(src["url"])
        return src["id"], text, None
    except Exception as exc:  # noqa: BLE001 — a dead source must never kill a run
        return src["id"], "", f"{type(exc).__name__}: {exc}"


def collect_all(sources: list[dict], workers: int = 12) -> dict[str, dict]:
    """Fetch all enabled sources in parallel. Never raises."""
    results: dict[str, dict] = {}
    todo = [s for s in sources if s.get("enabled", True)]
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(fetch_source, s): s["id"] for s in todo}
        for fut in as_completed(futures):
            sid, text, err = fut.result()
            results[sid] = {"ok": err is None, "error": err, "text": text}
    return results
