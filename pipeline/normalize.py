"""Stage 2 — Normalizer + Deduper.

Turns raw URIs into a canonical form so that the same endpoint coming from
different sources collapses into one entry, then de-duplicates.

Canonicalization rules
----------------------
* scheme + host lowercased
* cosmetic fields dropped: names/tags (ps / #fragment / remarks / group)
* query params sorted; ports normalized to plain integers
* vmess: re-encoded from sorted JSON keys
* legacy base64 `ss://` blobs rebuilt as SIP002

Every function returns None on anything it cannot parse — a single broken
line must never stop the pipeline.
"""

from __future__ import annotations

import base64
import hashlib
import json
import re
from urllib.parse import parse_qsl, urlencode, urlsplit

URL_SCHEMES = {"vless", "trojan", "tuic", "hysteria", "hysteria2", "hy2"}
ALL_SCHEMES = URL_SCHEMES | {"vmess", "ss", "ssr"}

# fields that actually describe a vmess endpoint (ps = display name → dropped)
_VMESS_KEYS = ("v", "add", "port", "id", "aid", "scy", "net", "type",
               "host", "path", "tls", "sni", "alpn", "fp")


def _b64decode(text: str) -> str:
    pad = "=" * (-len(text) % 4)
    return base64.b64decode(text.replace("-", "+").replace("_", "/") + pad).decode("utf-8", "replace")


def try_b64_blob(text: str) -> list[str]:
    """If the payload is one big base64 blob, decode it to URI lines."""
    stripped = text.strip()
    if not stripped or "\n" in stripped[:120] or "://" in stripped[:200]:
        return []
    if not re.fullmatch(r"[A-Za-z0-9+/=_-]+", stripped):
        return []
    try:
        decoded = _b64decode(stripped)
    except Exception:
        return []
    return [ln.strip() for ln in decoded.splitlines() if ln.split("://", 1)[0].lower() in ALL_SCHEMES]


# ---------------------------------------------------------------- vmess ----
def _canonical_vmess(uri: str) -> tuple[str, str] | None:
    raw = uri[len("vmess://"):].strip()
    try:
        data = json.loads(_b64decode(raw))
        if not isinstance(data, dict):
            return None
    except Exception:
        return None
    add = str(data.get("add", "")).strip()
    try:
        port = str(int(str(data.get("port", "")).strip() or 0))
    except ValueError:
        port = str(data.get("port", "")).strip()
    ident = str(data.get("id", "")).strip().lower()
    if not add or not port or not ident:
        return None
    slim = {}
    for key in _VMESS_KEYS:
        val = data.get(key)
        if val in (None, ""):
            continue
        slim[key] = str(val).strip()
    slim["add"], slim["port"], slim["id"] = add, port, ident
    slim["v"] = slim.get("v", "2")
    enc = base64.b64encode(json.dumps(slim, sort_keys=True, ensure_ascii=False).encode()).decode()
    net = slim.get("net", "tcp")
    return f"vmess://{enc}", f"vmess|{add.lower()}|{port}|{net}"


# ------------------------------------------------------- ss (SIP002) ------
def _canonical_ss(uri: str) -> tuple[str, str] | None:
    body = uri[len("ss://"):].partition("#")[0]   # drop display tag
    query = ""
    if "@" in body:
        userinfo, _, rest = body.rpartition("@")
        hostport, _, query = rest.partition("?")
        if not hostport:
            return None
    else:
        # legacy: ss://base64(method:pass@host:port)
        try:
            decoded = _b64decode(body)
        except Exception:
            return None
        userinfo, _, hostport = decoded.rpartition("@")
        if not hostport:
            return None
    userinfo = re.sub(r"\s", "", userinfo)
    host = (urlsplit(f"//{hostport}").hostname or "").lower().rstrip(".")
    try:
        port = urlsplit(f"//{hostport}").port
    except ValueError:
        return None
    if not host or not port:
        return None
    enc_user = base64.b64encode(userinfo.encode()).decode().rstrip("=")
    qs = urlencode(sorted(parse_qsl(query, keep_blank_values=True)), safe=":/@")
    canon = f"ss://{enc_user}@{host}:{port}" + (f"?{qs}" if qs else "")
    return canon, f"ss|{host}|{port}"


# ------------------------------------------------------------ ssr --------
def _canonical_ssr(uri: str) -> tuple[str, str] | None:
    try:
        decoded = _b64decode(uri[len("ssr://"):].strip())
    except Exception:
        return None
    main, _, params = decoded.partition("/?")
    parts = main.split(":")
    if len(parts) < 6:
        return None
    host = ":".join(parts[:-5]).lower().rstrip(".")     # IPv6 hosts contain colons
    port, proto, method, obfs, _pass = parts[-5:]
    keep = {}
    for kv in params.split("&"):
        if "=" in kv:
            k, v = kv.split("=", 1)
            if k in ("obfsparam", "protoparam"):
                keep[k] = v                              # functional params only
    tail = urlencode(sorted(keep.items())) if keep else ""
    inner = f"{host}:{port}:{proto}:{method}:{obfs}:{_pass}"
    if tail:
        inner += f"/?{tail}"
    enc = base64.b64encode(inner.encode()).decode().rstrip("=")
    return f"ssr://{enc}", f"ssr|{host}|{port}"


# --------------------------------------------- generic URL-based schemes --
def _canonical_url(uri: str) -> tuple[str, str] | None:
    scheme, _, rest = uri.partition("://")
    scheme = scheme.lower()
    rest, _, _frag = rest.partition("#")             # drop display tag
    try:
        u = urlsplit(f"//{rest}")
        hostname = (u.hostname or "").lower().rstrip(".")
        port = u.port
    except ValueError:
        return None
    if not hostname:
        return None
    netloc = u.netloc
    userinfo = netloc.rsplit("@", 1)[0] if "@" in netloc else ""
    hostpart = f"[{hostname}]" if ":" in hostname else hostname
    if port:
        hostpart += f":{port}"
    qs = urlencode(sorted(parse_qsl(u.query, keep_blank_values=True)), safe=":/@+")
    canon = f"{scheme}://{userinfo + '@' if userinfo else ''}{hostpart}" + (f"?{qs}" if qs else "")
    params = dict(parse_qsl(u.query, keep_blank_values=True))
    net = params.get("type", "")
    sec = params.get("security", "")
    node = f"{scheme}|{hostname}|{port or ''}|{net}|{sec}"
    return canon, node


def canonical(uri: str) -> tuple[str, str] | None:
    """Return (canonical_uri, node_key) or None if unparseable."""
    scheme = uri.split("://", 1)[0].lower()
    try:
        if scheme == "vmess":
            return _canonical_vmess(uri)
        if scheme == "ss":
            return _canonical_ss(uri)
        if scheme == "ssr":
            return _canonical_ssr(uri)
        if scheme in URL_SCHEMES:
            return _canonical_url(uri)
    except Exception:
        return None
    return None


# ------------------------------------------------------------- dedupe ----
def dedupe(items: list[tuple[str, str]]) -> tuple[list[str], dict]:
    """Two-level dedupe: exact canonical hash, then host|port identity."""
    seen_hash: set[str] = set()
    seen_node: dict[str, str] = {}
    uniq: list[str] = []
    dupes_hash = dupes_node = 0
    for canon, node in items:
        h = hashlib.sha256(canon.encode()).hexdigest()[:16]
        if h in seen_hash:
            dupes_hash += 1
            continue
        if node in seen_node:
            dupes_node += 1
            continue
        seen_hash.add(h)
        seen_node[node] = canon
        uniq.append(canon)
    return uniq, {"exact_dupes": dupes_hash, "same_node_dupes": dupes_node}
