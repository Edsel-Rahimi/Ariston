"""Stage 4b — Operator classifier (Phase 3).

Maps endpoints hosted on Iranian networks to their operator, so consumers can
pick domestic routes (often unmetered / better latency inside Iran).

Method (fully offline-capable, zero extra infra):
  1. Download the free ip2asn v4 table (iptoasn.com, ~12 MB, refreshed daily)
     and index it as three sorted arrays -> O(log n) lookup via bisect.
  2. For every canonical URI whose host is a literal IPv4, find its ASN +
     country and map the ASN to a known Iranian operator.
  3. Domain-hosted endpoints are NOT resolved in this version (most are
     CDN-fronted and their origin is not the node itself) — they simply stay
     unclassified, which is the honest answer.

If the table cannot be downloaded the whole stage degrades silently: the run
continues, no operator files are produced beyond the empty stable set, and
stats.json notes the unavailability.
"""

from __future__ import annotations

import bisect
import gzip
import io
import ipaddress
import json
import os
import time
import urllib.request

from .validate import _hostport

IPT2ASN_URL = "https://iptoasn.com/data/ip2asn-v4-u32.tsv.gz"

# ASN -> (file slug, Persian label) — verified against the ip2asn owner column
OPERATORS = {
    58224: ("tci", "مخابرات ایران"),
    197207: ("mci", "همراه اول"),
    44244: ("irancell", "ایرانسل"),
    57218: ("rightel", "رایتل"),
    43395: ("shatel", "شاتل"),
    50810: ("mobinnet", "مبین‌نت"),
    43754: ("asiatech", "آسیاتک"),
    16322: ("parsonline", "پارس آنلاین"),
    34918: ("pishgaman", "پیشگامان"),
    57497: ("pishgaman", "پیشگامان"),
    42337: ("respina", "رسپینا"),
}
# any other IR country-code network lands in this stable bucket
IR_OTHER = ("ir-other", "سایر شبکه‌های ایران")

STABLE_SLUGS = [slug for slug, _ in OPERATORS.values()] + [IR_OTHER[0]]


def _ip_to_int(ip: str) -> int | None:
    try:
        return int(ipaddress.IPv4Address(ip))
    except Exception:
        return None


def load_table() -> dict | None:
    """Download + index the ip2asn table.  Returns None on any failure."""
    try:
        req = urllib.request.Request(IPT2ASN_URL, headers={"User-Agent": "ariston/1.0"})
        raw = urllib.request.urlopen(req, timeout=60).read()
        starts: list[int] = []
        ends: list[int] = []
        asn: list[int] = []
        cc: list[str] = []
        with gzip.open(io.BytesIO(raw), "rt", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                parts = line.rstrip("\n").split("\t")
                if len(parts) < 4:
                    continue
                try:
                    a, b = int(parts[0]), int(parts[1])
                except ValueError:
                    a, b = _ip_to_int(parts[0]), _ip_to_int(parts[1])
                    if a is None or b is None:
                        continue
                starts.append(a)
                ends.append(b)
                asn.append(int(parts[2]) if parts[2].isdigit() else 0)
                cc.append(parts[3].strip().upper())
        return {"starts": starts, "ends": ends, "asn": asn, "cc": cc,
                "rows": len(starts), "downloaded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    except Exception:
        return None


def lookup(table: dict, ip: str) -> tuple[int, str] | None:
    ipi = _ip_to_int(ip)
    if ipi is None:
        return None
    idx = bisect.bisect_right(table["starts"], ipi) - 1
    if idx < 0 or table["ends"][idx] < ipi:
        return None
    return table["asn"][idx], table["cc"][idx]


def _label(asn: int, country: str) -> tuple[str, str] | None:
    if asn in OPERATORS:
        return OPERATORS[asn]
    if country == "IR":
        return IR_OTHER
    return None


def classify(uris: list[str], table: dict | None) -> dict:
    """Classify every IP-literal endpoint.  Returns a summary dict:
    {slug: {"label": ..., "uris": [...]}, ..., "stats": {...}}"""
    by_slug: dict[str, dict] = {}
    ip_literal = resolved = classified = 0
    if table is not None:
        for uri in uris:
            host, _port = _hostport(uri)
            if _ip_to_int(host) is None:
                continue
            ip_literal += 1
            hit = lookup(table, host)
            if not hit:
                continue
            resolved += 1
            lab = _label(hit[0], hit[1])
            if not lab:
                continue
            classified += 1
            slug, label = lab
            by_slug.setdefault(slug, {"label": label, "uris": []})["uris"].append(uri)

    stats = {
        "available": table is not None,
        "table_rows": table["rows"] if table else 0,
        "ip_literal_hosts": ip_literal,
        "in_table": resolved,
        "classified_iran": classified,
        "by_slug": {s: len(by_slug[s]["uris"]) for s in by_slug},
    }
    return {"by_slug": by_slug, "stats": stats}
