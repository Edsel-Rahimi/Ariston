"""Stage 5b — Client config exporters (Phase 2).

Renders ranked, live-tested endpoints into ready-to-import client configs:

  dist/mihomo.yaml    full Mihomo (Clash.Meta) config: mixed-port, DNS,
                      proxy-groups (Ariston select + Auto url-test) + proxies
  dist/singbox.json   full sing-box config: mixed inbound, selector + urltest,
                      one outbound per endpoint

Both builders consume the canonical URI list ordered by score (best first) and
share the exact parsing already proven inside validate.py. Everything is
stdlib-only; the tiny YAML emitter quotes every scalar, so no dependency and
no injection surprises.
"""

from __future__ import annotations

import base64
import json
from urllib.parse import parse_qsl, unquote, urlsplit

from . import bank as BK
from .validate import _b64, _hostport, _query, _scheme, _singbox_outbound

PROBE_URL = "http://www.gstatic.com/generate_204"


_UTLS_FP = {"chrome", "firefox", "safari", "ios", "android", "edge",
            "360", "qq", "random", "randomized", "randomizednoalpn"}


def _fp(v: str | None) -> str:
    v = (v or "chrome").strip().lower()
    return v if v in _UTLS_FP else "chrome"


def _valid_reality(pbk: str, sid: str) -> bool:
    """X25519 pubkey = 43-char base64url (32 bytes); short_id = hex, <= 16 chars.
    sing-box rejects malformed keys at config-load time, so filter early."""
    if not pbk or not (40 <= len(pbk) <= 44):
        return False
    try:
        if len(base64.urlsafe_b64decode(pbk.replace("-", "+").replace("_", "/") + "=" * (-len(pbk) % 4))) != 32:
            return False
    except Exception:
        return False
    if sid and (len(sid) > 16 or any(c not in "0123456789abcdefABCDEF" for c in sid)):
        return False
    return True


# ------------------------------------------------------------ tiny utils ---
def _name(scheme: str, host: str, port: int, seen: dict) -> str:
    host = (host or "host").replace(".", "-")
    host = "".join(ch for ch in host if ch.isalnum() or ch == "-")[:24] or "host"
    base = f"{scheme}-{host}-{port}"
    n = seen.get(base, 0) + 1
    seen[base] = n
    return base if n == 1 else f"{base}-{n}"


def _brand_name(ping_ms: float | None, seen: dict, tier: str | None = None) -> str:
    """D4: proxy names carry the brand + measured ping: `Ariston-812ms`
    (`Ariston-GOLD-812ms` for the gold tier — decision 2026-11-01 #3),
    duplicates disambiguated (`Ariston-812ms-2`).
    D9/G2-1: rendered through the panel-editable remark template (fails safe
    to the classic label), so the panel controls client-config names too."""
    base = BK.render_remark(BK.REMARK_TPL, ping_ms, tier)
    n = seen.get(base, 0) + 1
    seen[base] = n
    return base if n == 1 else f"{base}-{n}"


def _y(v) -> str:
    """YAML scalar: quote every string, keep ints/bools bare."""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    s = str(v).replace("\\", "\\\\").replace('"', '\\"')
    return f'"{s}"'


# ------------------------------------------------ mihomo (Clash.Meta) ------
def _mihomo_proxy(uri: str, name: str) -> dict | None:
    scheme = _scheme(uri)
    host, port = _hostport(uri)
    q = _query(uri)
    p: dict = {"name": name, "server": host, "port": port, "udp": True}

    if scheme == "vless":
        p.update({"type": "vless", "uuid": unquote(uri.split("://", 1)[1].split("@", 1)[0]),
                  "cipher": "none", "network": (q.get("type") or "tcp").lower()})
        if q.get("flow"):
            p["flow"] = q["flow"]
    elif scheme == "vmess":
        try:
            d = json.loads(_b64(uri.split("://", 1)[1].strip()))
        except Exception:
            return None
        host, port = str(d.get("add", "")), int(str(d.get("port", "0")) or 0)
        if not host or not port:
            return None
        p.update({"type": "vmess", "server": host, "port": port,
                  "uuid": str(d.get("id", "")), "alterId": int(str(d.get("aid", "0")) or 0),
                  "cipher": str(d.get("scy") or "auto"),
                  "network": str(d.get("net") or "tcp")})
        q = {k: str(d.get(k, "") or "") for k in ("host", "path", "tls", "sni", "fp", "type")}
    elif scheme == "trojan":
        p.update({"type": "trojan",
                  "password": unquote(uri.split("://", 1)[1].split("@", 1)[0]),
                  "network": (q.get("type") or "tcp").lower()})
        p["sni"] = q.get("sni") or q.get("host") or ""
        p["skip-cert-verify"] = (q.get("allowInsecure") or q.get("insecure")) in ("1", "true")
        if not p["sni"]:
            p.pop("sni")
    elif scheme == "ss":
        userinfo = uri.split("://", 1)[1].split("@", 1)[0]
        try:
            method, _, password = _b64(userinfo).partition(":")
        except Exception:
            method, _, password = unquote(userinfo).partition(":")
        if not password:
            return None
        p.update({"type": "ss", "cipher": method.strip(), "password": password})
        plugin_raw = q.get("plugin") or ""
        if plugin_raw:
            pname, _, opts = plugin_raw.partition(";")
            kv = dict(x.split("=", 1) for x in opts.split(";") if "=" in x)
            if pname.strip() in ("obfs-local", "simple-obfs"):
                p["plugin"] = "obfs"
                p["plugin-opts"] = {"mode": kv.get("obfs", "http"), "host": kv.get("obfs-host", "")}
            elif pname.strip() == "v2ray-plugin":
                p["plugin"] = "v2ray-plugin"
                p["plugin-opts"] = {"mode": kv.get("mode", "websocket")}
        return p
    elif scheme == "ssr":
        try:
            dec = _b64(uri.split("://", 1)[1].strip())
            main, _, params = dec.partition("/?")
            parts = main.split(":")
            h = ":".join(parts[:-5]).rstrip(".")
            prt, proto, method, obfs, pwd = parts[-5:]
            kv = dict(x.split("=", 1) for x in params.split("&") if "=" in x)
            try:
                pwd = _b64(pwd)
            except Exception:
                pass
        except Exception:
            return None
        p.update({"type": "ssr", "server": h, "port": int(prt), "cipher": method,
                  "password": pwd, "protocol": proto, "obfs": obfs})
        if kv.get("protoparam"):
            p["protocol-param"] = kv["protoparam"]
        if kv.get("obfsparam"):
            p["obfs-param"] = kv["obfsparam"]
        return p
    elif scheme in ("hysteria2", "hy2"):
        p.update({"type": "hysteria2",
                  "password": unquote(uri.split("://", 1)[1].split("@", 1)[0].partition("?")[0]),
                  "sni": q.get("sni") or q.get("peer") or "",
                  "skip-cert-verify": (q.get("insecure") or q.get("allowInsecure")) in ("1", "true")})
        if not p["sni"]:
            p.pop("sni")
        if (q.get("obfs") or "").lower() == "salamander" and q.get("obfs-password"):
            p.update({"obfs": "salamander", "obfs-password": q["obfs-password"]})
        return p
    elif scheme == "tuic":
        cred = unquote(uri.split("://", 1)[1].split("@", 1)[0].partition("?")[0])
        uuid, _, pwd = cred.partition(":")
        p.update({"type": "tuic", "uuid": uuid, "password": pwd,
                  "congestion-controller": q.get("congestion_control") or "bbr",
                  "sni": q.get("sni") or "", "alpn": [a for a in q.get("alpn", "h3").split(",") if a]})
        if not p["sni"]:
            p.pop("sni")
        return p
    else:
        return None

    # shared: TLS / Reality / transport for vless / vmess / trojan
    sec = (q.get("security") or "").lower()
    if sec == "reality" and not _valid_reality(q.get("pbk") or "", q.get("sid") or ""):
        return None
    if scheme == "trojan":
        sec = sec or "tls"
    net = (q.get("type") or q.get("net") or "tcp").lower()
    if sec == "tls":
        p["tls"] = True
        sni = q.get("sni") or q.get("host") or ""
        if sni:
            p["servername"] = sni
        if (q.get("allowInsecure") or q.get("insecure")) in ("1", "true"):
            p["skip-cert-verify"] = True
        if q.get("fp"):
            p["client-fingerprint"] = _fp(q["fp"])
    elif sec == "reality":
        p["tls"] = True
        p["servername"] = q.get("sni") or ""
        p["client-fingerprint"] = _fp(q.get("fp"))
        p["reality-opts"] = {"public-key": q.get("pbk") or "", "short-id": q.get("sid") or ""}
        if q.get("flow"):
            p["flow"] = q["flow"]
    if net == "ws":
        p["network"] = "ws"
        w = {"path": q.get("path") or "/"}
        if q.get("host"):
            w["headers"] = {"Host": q["host"]}
        p["ws-opts"] = w
    elif net == "grpc":
        p["network"] = "grpc"
        p["grpc-opts"] = {"grpc-service-name": q.get("serviceName") or q.get("path") or ""}
    elif net == "httpupgrade":
        p["network"] = "httpupgrade"
        p["httpupgrade-opts"] = {"path": q.get("path") or "/", "host": q.get("host") or ""}
    elif net in ("h2", "http"):
        p["network"] = "h2"
        p["h2-opts"] = {"path": q.get("path") or "/", "host": [q["host"]] if q.get("host") else []}
    elif net in ("kcp", "mkcp", "quic", "domainsocket", "soundsocket", "splithttp", "xhttp"):
        return None
    return p


def _emit_yaml_block(p: dict, indent: str = "  ") -> str:
    lines = [f"{indent}- name: {_y(p.pop('name'))}"]
    scalar_keys = ("type", "server", "port", "uuid", "alterId", "cipher", "password",
                   "tls", "network", "flow", "servername", "client-fingerprint",
                   "skip-cert-verify", "udp", "sni", "obfs", "obfs-password", "plugin",
                   "congestion-controller", "protocol", "protocol-param", "obfs-param")
    nested = ("reality-opts", "ws-opts", "grpc-opts", "httpupgrade-opts", "h2-opts", "plugin-opts")
    for k in scalar_keys:
        if k in p:
            lines.append(f"{indent}  {k}: {_y(p[k])}")
    for k in nested:
        if k in p:
            lines.append(f"{indent}  {k}:")
            for kk, vv in p[k].items():
                if isinstance(vv, list):
                    lines.append(f"{indent}    {kk}:")
                    for item in vv:
                        lines.append(f"{indent}      - {_y(item)}")
                else:
                    lines.append(f"{indent}    {kk}: {_y(vv)}")
    if "alpn" in p:
        lines.append(f"{indent}  alpn:")
        for a in p["alpn"]:
            lines.append(f"{indent}    - {_y(a)}")
    for k, v in p.items():                                  # anything left over
        if isinstance(v, dict):
            continue
        lines.append(f"{indent}  {k}: {_y(v)}")
    return "\n".join(lines)


def to_mihomo(rows: list[dict]) -> tuple[str, dict]:
    """rows = [{'uri':..., 'alive': bool, 'score':..., 'latency_ms':...}] best-first."""
    proxies, names, seen = [], [], {}
    skipped = 0
    for r in rows:
        name = _brand_name(r.get("latency_ms"), seen, r.get("tier"))
        p = _mihomo_proxy(r["uri"], name)
        if p is None:
            skipped += 1
            continue
        names.append(p["name"])
        proxies.append(_emit_yaml_block(p))
    limit = min(len(names), 120)
    head = [
        "# Mihomo / Clash.Meta config - generated hourly by the Ariston pipeline",
        f"# {len(names)} live-tested endpoints, ranked by health score (best first)",
        "mixed-port: 7890",
        "allow-lan: false",
        "mode: rule",
        "log-level: warning",
        "ipv6: true",
        "dns:",
        "  enable: true",
        "  nameserver:",
        '    - "8.8.8.8"',
        '    - "1.1.1.1"',
        "proxies:",
    ]
    groups = [
        "",
        "proxy-groups:",
        '  - name: "Ariston"',
        "    type: select",
        "    proxies:",
        '      - "Auto"',
    ]
    groups += [f"      - {_y(n)}" for n in names[:limit]]
    groups += [
        '  - name: "Auto"',
        "    type: url-test",
        f'    url: "{PROBE_URL}"',
        "    interval: 600",
        "    tolerance: 50",
        "    proxies:",
    ]
    groups += [f"      - {_y(n)}" for n in names[:limit]]
    tail = ["", "rules:", '  - "MATCH,Ariston"', ""]
    return "\n".join(head + proxies + groups + tail), {"built": len(names), "skipped": skipped}


# ------------------------------------------------------------- sing-box ----
def _sb_tls(q: dict, host: str) -> dict | None:
    sec = (q.get("security") or "").lower()
    if sec == "reality":
        if not _valid_reality(q.get("pbk") or "", q.get("sid") or ""):
            return None
        return {"enabled": True, "server_name": q.get("sni") or host,
                "utls": {"enabled": True, "fingerprint": _fp(q.get("fp"))},
                "reality": {"enabled": True, "public_key": q.get("pbk") or "",
                            "short_id": q.get("sid") or ""}}
    if sec == "tls":
        t = {"enabled": True, "server_name": q.get("sni") or q.get("host") or host,
             "utls": {"enabled": True, "fingerprint": _fp(q.get("fp"))}}
        if (q.get("allowInsecure") or q.get("insecure")) in ("1", "true"):
            t["insecure"] = True
        if q.get("alpn"):
            t["alpn"] = [a.strip() for a in q["alpn"].split(",") if a.strip()]
        return t
    return None


def _sb_transport(q: dict) -> dict | None:
    net = (q.get("type") or q.get("net") or "tcp").lower()
    if net == "ws":
        tr = {"type": "ws", "path": q.get("path") or "/"}
        if q.get("host"):
            tr["headers"] = {"Host": q["host"]}
        return tr
    if net == "grpc":
        return {"type": "grpc", "service_name": q.get("serviceName") or q.get("path") or ""}
    if net == "httpupgrade":
        return {"type": "httpupgrade", "path": q.get("path") or "/", "host": q.get("host") or ""}
    if net in ("h2", "http"):
        return {"type": "http", "path": q.get("path") or "/",
                "host": [q["host"]] if q.get("host") else []}
    if net in ("kcp", "mkcp", "quic", "domainsocket", "soundsocket", "splithttp", "xhttp"):
        return None
    return None                                            # plain tcp


def _sb_outbound(uri: str, tag: str) -> dict | None:
    """sing-box outbound for vless/vmess/trojan/plain-ss; reuses validate.py
    builders for hysteria2/tuic/ss-with-plugin."""
    scheme = _scheme(uri)
    host, port = _hostport(uri)
    q = _query(uri)
    ob: dict = {"tag": tag}

    if scheme == "vless":
        ob.update({"type": "vless", "server": host, "server_port": port,
                   "uuid": unquote(uri.split("://", 1)[1].split("@", 1)[0])})
        if q.get("flow") and q["flow"] == "xtls-rprx-vision":
            ob["flow"] = q["flow"]                      # sing-box accepts vision only
    elif scheme == "vmess":
        try:
            d = json.loads(_b64(uri.split("://", 1)[1].strip()))
        except Exception:
            return None
        host, port = str(d.get("add", "")), int(str(d.get("port", "0")) or 0)
        if not host or not port:
            return None
        q = {k: str(d.get(k, "") or "") for k in ("host", "path", "tls", "sni", "fp", "type")}
        q["security"] = "tls" if str(d.get("tls", "")).lower() == "tls" else ""
        ob.update({"type": "vmess", "server": host, "server_port": port,
                   "uuid": str(d.get("id", "")), "security": str(d.get("scy") or "auto"),
                   "alter_id": int(str(d.get("aid", "0")) or 0)})
    elif scheme == "trojan":
        ob.update({"type": "trojan", "server": host, "server_port": port,
                   "password": unquote(uri.split("://", 1)[1].split("@", 1)[0])})
        q = dict(q, security=q.get("security") or "tls")
    elif scheme == "ss":
        inner = _singbox_outbound(uri)                      # handles b64 + plugin
        if inner is None:
            return None
        inner["tag"] = tag
        return inner
    elif scheme in ("hysteria2", "hy2", "tuic"):
        inner = _singbox_outbound(uri)
        if inner is None:
            return None
        inner["tag"] = tag
        return inner
    else:
        return None

    tls = _sb_tls(q, host)
    if tls:
        ob["tls"] = tls
    tr = _sb_transport(q)
    if tr:
        ob["transport"] = tr
    if scheme == "vless" and not tls and (q.get("security") or "") == "":
        pass
    return ob


def to_singbox(rows: list[dict]) -> tuple[str, dict]:
    seen: dict = {}
    outbounds, tags = [], []
    skipped = 0
    for r in rows:
        uri = r["uri"]
        tag = _brand_name(r.get("latency_ms"), seen, r.get("tier"))
        ob = _sb_outbound(uri, tag)
        if ob is None:
            skipped += 1
            continue
        tags.append(tag)
        outbounds.append(ob)
    limit = min(len(tags), 120)
    selector = {"type": "selector", "tag": "Ariston", "outbounds": ["Auto"] + tags[:limit],
                "default": "Auto"}
    urltest = {"type": "urltest", "tag": "Auto", "outbounds": tags[:limit],
               "url": PROBE_URL, "interval": "10m", "tolerance": 50}
    cfg = {
        "log": {"level": "warn", "timestamp": False},
        "inbounds": [{"type": "mixed", "tag": "in", "listen": "127.0.0.1",
                      "listen_port": 2080}],
        "outbounds": [selector, urltest] + outbounds,
        "route": {"final": "Ariston", "auto_detect_interface": True},
    }
    return json.dumps(cfg, ensure_ascii=False, indent=1), {"built": len(outbounds), "skipped": skipped}
