"""Stage 3 — Validator (dual-engine).

Proves that an endpoint is actually usable from the runner, in four steps:

  1. ROUTE   — pick the engine that speaks the endpoint's protocol:
                 xray-core  → vmess / vless (incl. Reality, XHTTP) / trojan / plain ss
                 sing-box   → hysteria2 / tuic / ss with a transport plugin
               (ssr has no modern engine — counted as unsupported)
  2. CONFIG  — render a one-shot engine config: loopback SOCKS inbound routed
               to the endpoint outbound.
  3. BOOT    — launch the engine process, poll until the SOCKS port accepts.
  4. PROBE   — speak raw SOCKS5 (RFC 1928, hand-rolled, stdlib-only) through
               the loopback port and fetch /generate_204 from a rotation of
               reachability targets. Latency = first status line back.

Only the Python standard library is used. The engine binaries themselves are
downloaded per-run by the workflow (pinned versions) and cached; nothing here
talks to the network except through the tested endpoint's local SOCKS port.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import socket
import struct
import subprocess
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from queue import Queue
from urllib.parse import parse_qsl, unquote, urlsplit

# ------------------------------------------------------------------ knobs --
ENV_XRAY = os.environ.get("ARISTON_XRAY", "bin/xray")
ENV_SINGBOX = os.environ.get("ARISTON_SINGBOX", "bin/sing-box")
ENV_CONCURRENCY = int(os.environ.get("ARISTON_CONCURRENCY", "24"))
ENV_TIMEOUT = float(os.environ.get("ARISTON_TIMEOUT", "4.5"))   # seconds / node
ENV_PORT_BASE = int(os.environ.get("ARISTON_PORT_BASE", "21000"))
ENV_MAX_NODES = int(os.environ.get("ARISTON_MAX_NODES", "0"))   # 0 = no cap
# TCP prefilter (cheap connect sweep BEFORE the expensive engine spins)
ENV_TCP_CONCURRENCY = int(os.environ.get("ARISTON_TCP_CONCURRENCY", "256"))
ENV_TCP_TIMEOUT = float(os.environ.get("ARISTON_TCP_TIMEOUT", "2.0"))

BOOT_DEADLINE = 2.0        # seconds to wait for the engine's SOCKS port
PRUNE_DAYS = 14            # drop history entries unseen this long
HISTORY_CAP = 50_000       # hard cap on stored history entries

# probe targets rotate per node (some free nodes block one resolver/CDN)
PROBE_TARGETS = [
    ("www.gstatic.com", "/generate_204"),
    ("cp.cloudflare.com", "/generate_204"),
    ("connect.rom.miui.com", "/generate_204"),
]

# networks xray cannot speak on this build (unix-socket / exotic transports)
_XRAY_UNSAFE_NETS = {"kcp", "mkcp", "quic", "domainsocket", "soundsocket"}


# --------------------------------------------------------------- helpers ---
def _b64(text: str) -> str:
    pad = "=" * (-len(text) % 4)
    return base64.b64decode(text.replace("-", "+").replace("_", "/") + pad).decode("utf-8", "replace")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _scheme(uri: str) -> str:
    return uri.split("://", 1)[0].lower()


def _query(uri: str) -> dict:
    """Query params of a URI (works for vmess b64-JSON URIs too — empty there)."""
    rest = uri.split("://", 1)[1] if "://" in uri else uri
    _, _, query = rest.partition("?")
    return {k: v for k, v in parse_qsl(query, keep_blank_values=True)}


def _hostport(uri: str) -> tuple[str, int]:
    try:
        u = urlsplit(f"//{uri.split('://', 1)[1].partition('?')[0].partition('#')[0]}")
        host = (u.hostname or "").rstrip(".")
        return host, u.port or 0
    except ValueError:                      # malformed IPv6 / junk netloc
        return "", 0


def _bool(v: str | None) -> bool:
    return str(v or "").strip().lower() in ("1", "true", "yes")


# ---------------------------------------------------------- TCP prefilter --
# A full engine boot costs ~2-5 s of CPU/process churn per node.  Most dead
# endpoints can be dismissed for the price of one TCP connect: if the port
# refuses connections, no engine will ever bring it up.  UDP-family protocols
# (Hysteria2 / TUIC / ...) are passed through untouched — TCP says nothing
# about them.
_TCP_JUDGED_SCHEMES = ("vless", "vmess", "trojan", "ss")


def tcp_reachable(uri: str) -> bool | None:
    """True / False for TCP-family endpoints; None = don't judge (UDP, SSR)."""
    if _scheme(uri) not in _TCP_JUDGED_SCHEMES:
        return None
    host, port = _hostport(uri)
    if not host or not (0 < port < 65536):
        return False                      # nothing to even connect to
    try:
        with socket.create_connection((host, port), timeout=ENV_TCP_TIMEOUT):
            return True
    except OSError:
        return False


def tcp_prefilter(uris: list[str]) -> tuple[list[str], dict]:
    """Drop endpoints whose TCP port is closed; everything else passes.

    Returns (kept_uris, stats).  UDP-family and unroutable-engine URIs are
    never dropped here — downstream stages own their verdicts.
    """
    keep = [False] * len(uris)
    stats = {"input": len(uris), "tcp_open": 0, "tcp_closed": 0,
             "pass_through": 0}
    with ThreadPoolExecutor(max_workers=max(1, ENV_TCP_CONCURRENCY)) as pool:
        for i, verdict in enumerate(pool.map(tcp_reachable, uris)):
            if verdict is True:
                keep[i] = True
                stats["tcp_open"] += 1
            elif verdict is None:
                keep[i] = True            # not judgeable over TCP
                stats["pass_through"] += 1
            else:
                stats["tcp_closed"] += 1
    kept = [u for u, k in zip(uris, keep) if k]
    stats["output"] = len(kept)
    return kept, stats


# ------------------------------------------------- engine routing table ----
def engine_for(uri: str) -> str | None:
    """'xray' | 'sing-box' | None (unroutable on this build)."""
    scheme = _scheme(uri)
    if scheme in ("vless", "vmess", "trojan"):
        q = _query(uri)
        net = (q.get("type") or q.get("net") or "tcp").lower()
        if net in _XRAY_UNSAFE_NETS:
            return None
        return "xray"
    if scheme == "ss":
        q = _query(uri)
        if "plugin=" in uri.split("?", 1)[-1]:
            return "sing-box"
        net = (q.get("type") or "tcp").lower()
        if net in _XRAY_UNSAFE_NETS:
            return None
        return "xray"
    if scheme in ("hysteria2", "hy2", "tuic"):
        return "sing-box"
    return None


# ------------------------------------------------ xray outbound builders ---
def _xray_stream(q: dict, default_host: str) -> dict | None:
    """streamSettings for vless/vmess/trojan/ss. None = unsupported."""
    net = (q.get("type") or q.get("net") or "tcp").lower()
    st: dict = {"network": "tcp"}

    if net == "ws":
        ws = {"path": q.get("path") or "/"}
        if q.get("host"):
            ws["headers"] = {"Host": q["host"]}
        st["network"], st["wsSettings"] = "ws", ws
    elif net == "httpupgrade":
        st["network"], st["httpupgradeSettings"] = "httpupgrade", {
            "path": q.get("path") or "/", "host": q.get("host") or ""}
    elif net in ("grpc", "gun"):
        st["network"], st["grpcSettings"] = "grpc", {
            "serviceName": q.get("serviceName") or q.get("path") or "",
            "multiMode": False}
    elif net in ("h2", "http") and (q.get("security") or "tls"):
        st["network"], st["httpSettings"] = "h2", {
            "path": q.get("path") or "/",
            "host": [q["host"]] if q.get("host") else []}
    elif net in ("splithttp", "xhttp"):
        st["network"], st["xhttpSettings"] = "xhttp", {
            "path": q.get("path") or "/", "host": q.get("host") or "",
            "mode": q.get("mode") or "auto"}
    elif net == "tcp":
        if (q.get("headerType") or "").lower() == "http":
            hdr = {"type": "http", "path": q.get("path") or "/"}
            if q.get("host"):
                hdr["host"] = [q["host"]]
            st["tcpSettings"] = {"header": hdr}
    else:
        return None                                   # kcp / quic / exotic

    sec = (q.get("security") or "").lower()
    if sec == "tls" or (sec == "" and net == "h2"):
        st["security"] = "tls"
        tls = {"serverName": q.get("sni") or q.get("host") or default_host,
               "allowInsecure": _bool(q.get("allowInsecure") or q.get("insecure")),
               "fingerprint": q.get("fp") or "chrome"}
        if q.get("alpn"):
            tls["alpn"] = [a.strip() for a in q["alpn"].split(",") if a.strip()]
        st["tlsSettings"] = tls
    elif sec == "reality":
        st["security"] = "reality"
        st["realitySettings"] = {
            "serverName": q.get("sni") or default_host,
            "fingerprint": q.get("fp") or "chrome",
            "publicKey": q.get("pbk") or "",
            "shortId": q.get("sid") or "",
            "spiderX": q.get("spx") or "/"}
    elif sec not in ("", "none"):
        return None
    return st


def _xray_outbound(uri: str) -> dict | None:
    scheme = _scheme(uri)
    host, port = _hostport(uri)
    q = _query(uri)
    out: dict = {"tag": "out"}

    if scheme == "vless":
        user = {"id": unquote(uri.split("://", 1)[1].split("@", 1)[0]),
                "encryption": "none", "level": 0}
        if q.get("flow"):
            user["flow"] = q["flow"]
        out["protocol"] = "vless"
        out["settings"] = {"vnext": [{"address": host, "port": port, "users": [user]}]}

    elif scheme == "vmess":
        try:
            data = json.loads(_b64(uri.split("://", 1)[1].strip()))
        except Exception:
            return None
        host, port = str(data.get("add", "")), int(str(data.get("port", "0")) or 0)
        if not host or not port:
            return None
        q = {k: str(data.get(k, "") or "") for k in
             ("net", "type", "host", "path", "tls", "sni", "alpn", "fp", "scy")}
        q["security"] = "tls" if str(data.get("tls", "")).lower() == "tls" else ""
        out["protocol"] = "vmess"
        out["settings"] = {"vnext": [{"address": host, "port": port, "users": [{
            "id": str(data.get("id", "")), "alterId": int(str(data.get("aid", "0")) or 0),
            "security": q.get("scy") or "auto", "level": 0}]}]}

    elif scheme == "trojan":
        out["protocol"] = "trojan"
        out["settings"] = {"servers": [{
            "address": host, "port": port,
            "password": unquote(uri.split("://", 1)[1].split("@", 1)[0])}]}
        if "security=" not in q:                        # trojan implies TLS
            q = dict(q, security="tls")

    elif scheme == "ss":
        try:
            userinfo = uri.split("://", 1)[1].split("@", 1)[0]
            try:
                method, _, password = _b64(userinfo).partition(":")
            except Exception:
                method, _, password = unquote(userinfo).partition(":")
            if not password:
                return None
        except Exception:
            return None
        out["protocol"] = "shadowsocks"
        out["settings"] = {"servers": [{
            "address": host, "port": port,
            "method": method.strip(), "password": password}]}

    else:
        return None

    stream = _xray_stream(q, host)
    if stream is None:
        return None
    out["streamSettings"] = stream
    return out


def _xray_config(outbound: dict, socks_port: int) -> dict:
    return {
        "log": {"loglevel": "error"},
        "inbounds": [{
            "tag": "in", "listen": "127.0.0.1", "port": socks_port,
            "protocol": "socks", "settings": {"udp": False}}],
        "outbounds": [outbound, {"protocol": "freedom", "tag": "direct"}],
    }


# --------------------------------------------- sing-box outbound builders --
def _singbox_outbound(uri: str) -> dict | None:
    scheme = _scheme(uri)
    host, port = _hostport(uri)
    if not host or not port:
        return None
    q = _query(uri)
    out: dict = {"tag": "out"}

    if scheme in ("hysteria2", "hy2"):
        password = unquote(uri.split("://", 1)[1].split("@", 1)[0].partition("?")[0])
        tls = {"enabled": True,
               "insecure": _bool(q.get("insecure") or q.get("allowInsecure")),
               "server_name": q.get("sni") or q.get("peer") or "",
               "alpn": ["h3"]}
        out = {"type": "hysteria2", "server": host, "server_port": port,
               "password": password, "tls": tls}
        if (q.get("obfs") or "").lower() == "salamander" and q.get("obfs-password"):
            out["obfs"] = {"type": "salamander", "password": q["obfs-password"]}

    elif scheme == "tuic":
        cred = unquote(uri.split("://", 1)[1].split("@", 1)[0].partition("?")[0])
        uuid, _, pwd = cred.partition(":")
        out = {"type": "tuic", "server": host, "server_port": port,
               "uuid": uuid, "password": pwd,
               "congestion_control": q.get("congestion_control") or "bbr",
               "tls": {"enabled": True, "insecure": _bool(q.get("insecure") or q.get("allowInsecure")),
                       "server_name": q.get("sni") or "", "alpn": q.get("alpn", "h3").split(",")}}

    elif scheme == "ss":
        try:
            userinfo = uri.split("://", 1)[1].split("@", 1)[0]
            try:
                method, _, password = _b64(userinfo).partition(":")
            except Exception:
                method, _, password = unquote(userinfo).partition(":")
            if not password:
                return None
        except Exception:
            return None
        out = {"type": "shadowsocks", "server": host, "server_port": port,
               "method": method.strip(), "password": password}
        plugin_raw = q.get("plugin") or ""
        if plugin_raw:
            name, _, opts = plugin_raw.partition(";")
            plugin = {"obfs-local": "obfs-local", "simple-obfs": "obfs-local",
                      "v2ray-plugin": "v2ray-plugin"}.get(name.strip(), name.strip())
            out["plugin"], out["plugin_opts"] = plugin, opts

    else:
        return None
    return out


def _singbox_config(outbound: dict, socks_port: int) -> dict:
    return {
        "log": {"level": "error", "timestamp": False},
        "inbounds": [{
            "type": "socks", "tag": "in",
            "listen": "127.0.0.1", "listen_port": socks_port}],
        "outbounds": [outbound],
    }


# ------------------------------------------------------- SOCKS5 RFC 1928 ---
def socks5_probe(port: int, target: tuple[str, str], deadline: float) -> tuple[bool, float, str]:
    """Hand-rolled SOCKS5 + HTTP generate_204 probe. Returns (ok, ms, reason)."""
    host, path = target
    t0 = time.perf_counter()
    try:
        s = socket.create_connection(("127.0.0.1", port), timeout=deadline)
        s.settimeout(deadline)
        s.sendall(b"\x05\x01\x00")                       # greet, no auth
        if s.recv(2)[:2] != b"\x05\x00":
            raise OSError("socks-greeting")
        hb = host.encode("idna" if host.isascii() else "utf-8")
        s.sendall(b"\x05\x01\x00\x03" + bytes([len(hb)]) + hb + struct.pack(">H", 80))
        reply = s.recv(4)
        if len(reply) < 4 or reply[1] != 0:
            raise OSError("socks-connect")
        s.recv(64)                                       # drain bound address
        s.sendall((f"GET {path} HTTP/1.1\r\nHost: {host}\r\n"
                   f"User-Agent: AristonHealth/1.0\r\nConnection: close\r\n\r\n").encode())
        buf = b""
        while b"\r\n" not in buf:
            chunk = s.recv(256)
            if not chunk:
                break
            buf += chunk
        ms = (time.perf_counter() - t0) * 1000.0
        status_line = buf.split(b"\r\n", 1)[0]           # "HTTP/1.1 204 No Content"
        parts = status_line.split(b" ", 2)
        ok = len(parts) > 1 and parts[1] == b"204"
        s.close()
        return (ok, ms, "ok" if ok else "http-status")
    except socket.timeout:
        return (False, (time.perf_counter() - t0) * 1000.0, "timeout")
    except Exception as exc:
        return (False, (time.perf_counter() - t0) * 1000.0,
                "probe-error" if "socks" not in str(exc) else str(exc)[:32])


# ------------------------------------------------------------ engine run ---
def _engine_versions() -> dict:
    vers = {}
    for name, path in (("xray", ENV_XRAY), ("sing_box", ENV_SINGBOX)):
        try:
            r = subprocess.run([path, "version"], capture_output=True, text=True, timeout=10)
            first = (r.stdout or r.stderr).splitlines()[0] if (r.stdout or r.stderr) else ""
            # Xray  → "Xray 26.10.29 (Xray, ...) 0afec66 (go1.27.3 ...)"
            # sing-box → "sing-box version 1.14.4"
            vers[name] = first.split()[1] if name == "xray" else first.split()[-1]
        except Exception:
            vers[name] = None
    return vers


def engines_available() -> bool:
    x, s = os.path.isfile(ENV_XRAY), os.path.isfile(ENV_SINGBOX)
    return bool(x and s) and bool(_engine_versions().get("xray"))


def _wait_socks(port: int, proc: subprocess.Popen) -> bool:
    deadline = time.monotonic() + BOOT_DEADLINE
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            return False                                  # engine died on boot
        try:
            s = socket.create_connection(("127.0.0.1", port), timeout=0.15)
            s.close()
            return True
        except OSError:
            time.sleep(0.04)
    return False


class _Slot:
    """A pre-allocated loopback port + reusable config file."""
    __slots__ = ("idx", "port", "path")

    def __init__(self, idx: int, tmpdir: str):
        self.idx = idx
        self.port = ENV_PORT_BASE + idx
        self.path = os.path.join(tmpdir, f"cfg{idx}.json")


def test_one(uri: str, engine: str, slot: _Slot, target: tuple[str, str]) -> dict:
    """Boot engine for one endpoint, probe through it, tear down. ~4-6 s."""
    scheme = _scheme(uri)
    try:
        if engine == "xray":
            outbound = _xray_outbound(uri)
            if outbound is None:
                return {"uri": uri, "alive": False, "latency_ms": None, "reason": "bad-config"}
            cfg = _xray_config(outbound, slot.port)
            argv = [ENV_XRAY, "run", "-c", slot.path]
        else:
            outbound = _singbox_outbound(uri)
            if outbound is None:
                return {"uri": uri, "alive": False, "latency_ms": None, "reason": "bad-config"}
            cfg = _singbox_config(outbound, slot.port)
            argv = [ENV_SINGBOX, "run", "-c", slot.path]

        with open(slot.path, "w", encoding="utf-8") as fh:
            json.dump(cfg, fh)

        proc = subprocess.Popen(argv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            if not _wait_socks(slot.port, proc):
                return {"uri": uri, "alive": False, "latency_ms": None,
                        "reason": "engine-boot" if proc.poll() is not None else "no-socks"}
            ok, ms, reason = socks5_probe(slot.port, target, ENV_TIMEOUT)
            return {"uri": uri, "alive": ok, "latency_ms": round(ms, 1) if ok else None,
                    "reason": reason if not ok else "ok"}
        finally:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=0.7)
                except subprocess.TimeoutExpired:
                    proc.kill()
    except Exception as exc:                              # never crash the pool
        return {"uri": uri, "alive": False, "latency_ms": None,
                "reason": f"error:{type(exc).__name__}"}


# ------------------------------------------------------------- main sweep --
def validate_all(uris: list[str], prev: dict | None = None) -> tuple[dict, dict, dict]:
    """Run the full health sweep.

    Returns (results, summary, per_node) where
      results  — history store for the *next* run  (hash → entry)
      summary  — aggregate numbers for stats.json
      per_node — {canonical_uri: {score inputs}} for the scorer/publisher
    """
    prev = prev or {}
    now_iso = _now()
    if ENV_MAX_NODES and len(uris) > ENV_MAX_NODES:
        step = len(uris) / ENV_MAX_NODES   # evenly spaced → protocol-diverse sample
        uris = [uris[int(i * step)] for i in range(ENV_MAX_NODES)]

    engines = _engine_versions()
    concurrency = max(1, ENV_CONCURRENCY)
    done = 0
    _lock = threading.Lock()

    with tempfile.TemporaryDirectory(prefix="ariston-") as tmpdir:
        slots: Queue = Queue()
        for i in range(concurrency):
            slots.put(_Slot(i, tmpdir))

        outcomes: list[dict] = [None] * len(uris)         # type: ignore[list-item]
        routing = [(u, engine_for(u)) for u in uris]
        routable = [(i, u, eng) for i, (u, eng) in enumerate(routing) if eng]
        per_engine = {"xray": 0, "sing-box": 0}
        for _, _, eng in routable:
            per_engine[eng] += 1

        def work(job: tuple[int, str, str]) -> None:
            nonlocal done
            idx, uri, eng = job
            slot = slots.get()
            try:
                target = PROBE_TARGETS[idx % len(PROBE_TARGETS)]   # rotate per node
                outcomes[idx] = test_one(uri, eng, slot, target)
            finally:
                with _lock:
                    done += 1
                    if done % 250 == 0 or done == len(routable):
                        print(f"      probed {done}/{len(routable)} ...")
                slots.put(slot)

        started = time.monotonic()
        if routable:
            with ThreadPoolExecutor(max_workers=concurrency) as pool:
                list(pool.map(work, routable))

    # ------- merge into history ------------------------------------------
    results: dict = {}
    pruned = 0
    cutoff_days = PRUNE_DAYS
    for h, entry in prev.items():
        try:                                              # prune stale history
            age = (datetime.now(timezone.utc) -
                   datetime.fromisoformat(entry["last_tested"])).days
            if age <= cutoff_days:
                results[h] = entry
            else:
                pruned += 1
        except Exception:
            pruned += 1
    if len(results) > HISTORY_CAP:
        keep = sorted(results.items(), key=lambda kv: kv[1].get("last_tested", ""),
                      reverse=True)[:HISTORY_CAP]
        results = dict(keep)

    reasons: dict[str, int] = {}
    alive_by_scheme: dict[str, int] = {}
    total_by_scheme: dict[str, int] = {}
    latencies: list[float] = []
    alive = dead = unsupported = 0
    per_node: dict[str, dict] = {}

    for i, (uri, eng) in enumerate(routing):
        scheme = _scheme(uri)
        total_by_scheme[scheme] = total_by_scheme.get(scheme, 0) + 1
        res = outcomes[i]
        if eng is None or res is None:
            unsupported += 1
            reasons["unsupported" if eng is None else "missing"] = \
                reasons.get("unsupported" if eng is None else "missing", 0) + 1
            continue
        h = hashlib.sha256(uri.encode()).hexdigest()[:16]
        old = prev.get(h, {})
        ok = bool(res["alive"])
        ok_n = int(old.get("ok", 0)) + (1 if ok else 0)
        fail_n = int(old.get("fail", 0)) + (0 if ok else 1)
        ema = 1.0 if ok else 0.0
        if old.get("ema") is not None:
            ema = 0.7 * float(old["ema"]) + 0.3 * ema
        entry = {"ok": ok_n, "fail": fail_n, "latency_ms": res["latency_ms"],
                 "ema": round(ema, 3),
                 "last_tested": now_iso,
                 "last_ok": now_iso if ok else old.get("last_ok")}
        results[h] = entry
        per_node[uri] = {"hash": h, "alive": ok, "latency_ms": res["latency_ms"],
                         "success_rate": (ok_n + 1) / (ok_n + fail_n + 2)}
        reasons[res["reason"]] = reasons.get(res["reason"], 0) + 1
        if ok:
            alive += 1
            alive_by_scheme[scheme] = alive_by_scheme.get(scheme, 0) + 1
            latencies.append(float(res["latency_ms"]))
        else:
            dead += 1

    latencies.sort()
    def pct(p: float) -> float | None:
        return latencies[min(len(latencies) - 1, int(len(latencies) * p))] if latencies else None

    summary = {
        "engines": engines,
        "probed": len(routable),
        "alive": alive,
        "dead": dead,
        "unsupported": unsupported,
        "engine_routes": per_engine,
        "fail_reasons": dict(sorted(reasons.items(), key=lambda kv: -kv[1])),
        "by_protocol_total": dict(sorted(total_by_scheme.items(), key=lambda kv: -kv[1])),
        "by_protocol_alive": dict(sorted(alive_by_scheme.items(), key=lambda kv: -kv[1])),
        "latency_ms": {"min": latencies[0] if latencies else None,
                       "p50": pct(0.5), "p80": pct(0.8),
                       "avg": round(sum(latencies) / len(latencies), 1) if latencies else None},
        "concurrency": concurrency,
        "duration_seconds": round(time.monotonic() - started, 1),
        "history_pruned": pruned,
    }
    return results, summary, per_node
