#!/usr/bin/env python3
"""explorer-mcp: minimal, dependency-free Streamable HTTP MCP browser."""

import concurrent.futures
import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import suppress
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

URL = os.getenv("MCP_URL", "https://lex.xlap.pl/mcp")
APP_ORIGIN = os.getenv("APP_ORIGIN", "https://explorer.xlap.pl")
PORT = int(os.getenv("PORT", "8080"))
TIMEOUT = int(os.getenv("MCP_TIMEOUT", "90"))
MAX_REQ = 512 * 1024
MAX_REPLY = 8 * 1024 * 1024
ID = os.getenv("CF_ACCESS_CLIENT_ID", "")
SECRET = os.getenv("CF_ACCESS_CLIENT_SECRET", "")
BEARER = os.getenv("MCP_BEARER_TOKEN", "")
PROTOCOL = os.getenv("MCP_PROTOCOL_VERSION", "2025-06-18")
ROOT = Path(__file__).resolve().parent


def _load_access_token_file():
    token_file = ROOT / ".cf-service-token"
    try:
        lines = token_file.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return {}
    values = {}
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        name, value = stripped.split("=", 1)
        if name.strip() in ("cf_client_id", "cf_client_secret"):
            values[name.strip()] = value.strip()
    return values


_ACCESS_FILE = _load_access_token_file()
if ID in ("", "UNCONFIGURED"):
    ID = _ACCESS_FILE.get("cf_client_id", "")
if SECRET in ("", "UNCONFIGURED"):
    SECRET = _ACCESS_FILE.get("cf_client_secret", "")
del _ACCESS_FILE
try:
    PORTAL_SNAPSHOT = json.loads((ROOT / "cloudflare_registry.json").read_text(encoding="utf-8"))
except (OSError, ValueError):
    PORTAL_SNAPSHOT = {"servers": []}

if urllib.parse.urlsplit(URL).scheme != "https":
    raise RuntimeError("MCP_URL must use https")
if not ((ID and SECRET) or BEARER):
    raise RuntimeError("Missing MCP service token credentials")
if not APP_ORIGIN.startswith("https://"):
    raise RuntimeError("APP_ORIGIN must be https")


class MCPError(Exception):
    def __init__(self, message, status=502):
        self.status = status
        super().__init__(message)


class MCP:
    def __init__(self, url=URL, use_access=True, timeout=TIMEOUT):
        self.url = url
        self.use_access = use_access
        self.timeout = timeout
        if urllib.parse.urlsplit(self.url).scheme != "https":
            raise ValueError("MCP URL must be HTTPS")
        self.lock = threading.RLock()
        self.session = ""
        self.ready = False
        self.seq = 0
        self.tools = []
        self.catalog_at = 0
        self.server_info = {}
        self.last_error = ""
        self.direct_tools = {}
        self.direct_sessions = {}
        self.direct_errors = {}

    def exchange(self, method, params=None, notification=False):
        self.seq += 1
        request_id = self.seq
        payload = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            payload["params"] = params
        if not notification:
            payload["id"] = request_id
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": PROTOCOL,
            "User-Agent": "lex-mcp-explorer/1.0",
        }
        if self.use_access and ID and SECRET:
            headers["CF-Access-Client-Id"] = ID
            headers["CF-Access-Client-Secret"] = SECRET
        if self.use_access and BEARER:
            headers["Authorization"] = "Bearer " + BEARER
        if self.session:
            headers["Mcp-Session-Id"] = self.session
        req = urllib.request.Request(  # noqa: S310 - fixed upstream must use HTTPS
            self.url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:  # noqa: S310 - fixed HTTPS origin
                session = resp.headers.get("Mcp-Session-Id")
                if session:
                    self.session = session
                if notification or resp.status == 202:
                    return {}
                ctype = resp.headers.get("Content-Type", "").lower()
                if "text/event-stream" in ctype:
                    result = self.read_sse(resp, request_id)
                else:
                    raw = resp.read(MAX_REPLY + 1)
                    if len(raw) > MAX_REPLY:
                        raise MCPError("MCP response exceeds 8 MiB", 502)
                    try:
                        result = json.loads(raw)
                    except (ValueError, UnicodeDecodeError):
                        raise MCPError("Invalid JSON response from MCP server") from None
                if not isinstance(result, dict):
                    raise MCPError("Invalid RPC response type")
                if result.get("error") is not None:
                    err = result["error"]
                    msg = (
                        str(err.get("message", "MCP RPC error"))
                        if isinstance(err, dict)
                        else "MCP RPC error"
                    )
                    raise MCPError(msg, 502)
                return result.get("result", {})
        except urllib.error.HTTPError as e:
            raise MCPError("MCP upstream returned HTTP " + str(e.code), 502) from None
        except (urllib.error.URLError, TimeoutError):
            raise MCPError("MCP upstream connection failed or timed out", 502) from None

    @staticmethod
    def read_sse(resp, request_id):
        data = []
        total = 0
        while True:
            line = resp.readline(64 * 1024 + 1)
            total += len(line)
            if total > MAX_REPLY:
                raise MCPError("MCP SSE response exceeds 8 MiB")
            if not line:
                break
            if len(line) > 64 * 1024:
                raise MCPError("MCP SSE line too large")
            s = line.decode("utf-8", errors="replace").rstrip("\r\n")
            if s.startswith("data:"):
                data.append(s[5:].strip())
            elif not s and data:
                try:
                    value = json.loads("\n".join(data))
                except ValueError:
                    data = []
                    continue
                data = []
                if isinstance(value, dict) and value.get("id") == request_id:
                    return value
        if data:
            try:
                value = json.loads("\n".join(data))
                if isinstance(value, dict) and value.get("id") == request_id:
                    return value
            except ValueError:
                pass
        raise MCPError("MCP event stream closed without requested result")

    def ensure_ready(self):
        if self.ready:
            return
        self.session = ""
        hello = self.exchange(
            "initialize",
            {
                "protocolVersion": PROTOCOL,
                "capabilities": {},
                "clientInfo": {"name": "lex_mcp_explorer", "version": "1.0.0"},
            },
        )
        if isinstance(hello, dict):
            self.server_info = hello.get("serverInfo", {})
        self.ready = True
        # Some stateless portals do not accept initialized notifications.
        with suppress(MCPError):
            self.exchange("notifications/initialized", {}, notification=True)

    @staticmethod
    def server_for(tool):
        meta = tool.get("_meta") if isinstance(tool.get("_meta"), dict) else {}
        for field in ("server", "serverName", "serverId", "upstreamServer", "upstream"):
            for obj in (tool, meta):
                v = obj.get(field) if isinstance(obj, dict) else None
                if isinstance(v, str) and v.strip():
                    return v.strip()
                if isinstance(v, dict) and isinstance(v.get("name"), str):
                    return v["name"]
        name = tool.get("name", "")
        if name.startswith("portal_"):
            return "Lex MCP Portal"
        for server in PORTAL_SNAPSHOT.get("servers", []):
            aliases = {
                server.get("id", ""),
                server.get("id", "").lower(),
                server.get("id", "").replace("-", "_"),
                server.get("id", "").replace("-", "_").lower(),
            }
            if any(a and name.lower().startswith(a + "_") for a in aliases):
                return server.get("name") or server.get("id")
        matches = [
            server.get("name") or server.get("id")
            for server in PORTAL_SNAPSHOT.get("servers", [])
            if any(item.get("name") == name for item in server.get("tools", []))
        ]
        if len(matches) == 1:
            return matches[0]
        for delim in ("__", "::", "/", "."):
            if delim in name:
                return name.split(delim, 1)[0]
        return "Nieprzypisane (brak metadanych serwera)"

    def refresh_direct_capabilities(self):
        """Probe registered unauthenticated MCPs without forwarding portal credentials."""
        servers = [
            s
            for s in PORTAL_SNAPSHOT.get("servers", [])
            if s.get("authType") == "unauthenticated"
            and s.get("status") == "ready"
            and isinstance(s.get("hostname"), str)
            and s["hostname"].startswith("https://")
        ]

        def probe(group):
            sid = group["id"]
            try:
                client = MCP(url=group["hostname"], use_access=False, timeout=12)
                client.ensure_ready()
                tools = []
                cursor = None
                seen = set()
                for _ in range(100):
                    result = client.exchange("tools/list", {"cursor": cursor} if cursor else {})
                    if not isinstance(result.get("tools"), list):
                        raise MCPError("Direct MCP tools/list missing tools array")
                    tools.extend(t for t in result["tools"] if isinstance(t, dict))
                    cursor = result.get("nextCursor")
                    if not cursor:
                        break
                    if cursor in seen:
                        raise MCPError("Direct MCP cursor cycle")
                    seen.add(cursor)
                else:
                    raise MCPError("Direct MCP has too many tool pages")
                return sid, client, tools, ""
            except (MCPError, ValueError) as exc:
                return sid, None, [], str(exc)

        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(probe, servers))
        self.direct_sessions = {
            sid: client for sid, client, _, err in results if client and not err
        }
        self.direct_tools = {sid: tools for sid, _, tools, err in results if not err}
        self.direct_errors = {sid: err for sid, _, _, err in results if err}

    def get_catalog(self, force=False, probe_direct=False):
        """Account-wide Cloudflare registry plus verified Lex portal availability."""
        with self.lock:
            if not force and self.catalog_at and time.monotonic() - self.catalog_at < 60:
                return self.make_catalog()
            try:
                self.ensure_ready()
                collected = []
                seen_cursors = set()
                cursor = None
                for _ in range(100):
                    params = {"cursor": cursor} if cursor else {}
                    result = self.exchange("tools/list", params)
                    if not isinstance(result, dict) or not isinstance(result.get("tools"), list):
                        raise MCPError("MCP tools/list returned no tools array")
                    collected.extend(result["tools"])
                    cursor = result.get("nextCursor")
                    if not cursor:
                        break
                    if cursor in seen_cursors:
                        raise MCPError("MCP pagination cursor cycle")
                    seen_cursors.add(cursor)
                else:
                    raise MCPError("MCP tools/list pagination exceeds 100 pages")
                self.tools = [
                    t
                    for t in collected
                    if isinstance(t, dict)
                    and isinstance(t.get("name"), str)
                    and not t["name"].startswith("portal_")
                ]
                self.last_error = ""
            except MCPError as exc:
                # Never imply that a saved Cloudflare tool is callable after a live failure.
                self.last_error = str(exc)
                self.tools = []
                self.ready = False
            if probe_direct:
                self.refresh_direct_capabilities()
            self.catalog_at = time.monotonic()
            return self.make_catalog()

    def make_catalog(self):
        live = {t["name"]: t for t in self.tools}
        definitions = PORTAL_SNAPSHOT.get("servers", [])
        # Bare names may only be used when unique across configured upstreams.
        counts = {}
        for group in definitions:
            for tool in group.get("tools", []):
                name = tool.get("name", "")
                counts[name] = counts.get(name, 0) + 1
        servers = []
        available_total = 0
        for group in definitions:
            server_id = group.get("id", "")
            status = group.get("status", "unknown")
            published = []
            for tool in group.get("tools", []):
                name = tool.get("name", "")
                if not isinstance(name, str) or not name:
                    continue
                candidates = [
                    server_id + "_" + name,
                    server_id.replace("-", "_") + "_" + name,
                    server_id + "__" + name,
                    server_id + "::" + name,
                ]
                if counts[name] == 1:
                    candidates.append(name)
                match = next((c for c in candidates if c in live), None)
                source = live.get(match, {}) if match else {}
                via_lex = bool(match) and status == "ready" and not self.last_error
                via_direct = status == "ready" and any(
                    t.get("name") == name for t in self.direct_tools.get(server_id, [])
                )
                available = via_lex or via_direct
                can_direct = (
                    status == "ready"
                    and group.get("authType") == "unauthenticated"
                    and bool(group.get("hostname"))
                )
                if available:
                    available_total += 1
                published.append(
                    {
                        "name": name,
                        "serverId": server_id,
                        "liveName": match if via_lex else name if via_direct else None,
                        "available": available,
                        "canAttempt": available or can_direct,
                        "route": "lex-portal"
                        if via_lex
                        else "direct"
                        if can_direct
                        else "unconnected",
                        "description": source.get("description") or tool.get("description", ""),
                        "inputSchema": source.get("inputSchema")
                        or tool.get("inputSchema")
                        or {"type": "object", "properties": {}},
                        "annotations": source.get("annotations") or tool.get("annotations") or {},
                    }
                )
            servers.append(
                {
                    "id": server_id,
                    "name": group.get("name") or server_id,
                    "description": group.get("description") or "",
                    "status": status,
                    "portals": group.get("portals", []),
                    "authType": group.get("authType", "unknown"),
                    "authenticationStatus": group.get("authenticationStatus", "unknown"),
                    "hostname": group.get("hostname", ""),
                    "directError": self.direct_errors.get(server_id, ""),
                    "availableTools": sum(t["available"] for t in published),
                    "tools": published,
                }
            )
        return {
            "servers": servers,
            "totalTools": sum(len(s["tools"]) for s in servers),
            "availableTools": available_total,
            "snapshot": bool(self.last_error),
            "liveStatus": "unavailable"
            if self.last_error
            else "partial"
            if available_total < sum(len(s["tools"]) for s in servers)
            else "online",
            "capturedAt": PORTAL_SNAPSHOT.get("capturedAt"),
            "portalModifiedAt": PORTAL_SNAPSHOT.get("configModifiedAt"),
            "codeMode": PORTAL_SNAPSHOT.get("codeMode"),
            "serverInfo": self.server_info,
            "discovery": "Cloudflare account-wide MCP registry snapshot + live Lex tools/list availability",
            "registryCapturedAt": PORTAL_SNAPSHOT.get("capturedAt"),
            "portals": PORTAL_SNAPSHOT.get("portals", []),
            "warning": self.last_error if self.last_error else "",
        }

    def call_tool(self, name, arguments, confirmed, server_id=None):
        with self.lock:
            if not server_id:
                raise MCPError("Server ID required for disambiguation", 400)
            catalog = self.get_catalog()
            server = next((s for s in catalog["servers"] if s["id"] == server_id), None)
            if not server:
                raise MCPError("Server not in Cloudflare registry", 404)
            selected = next((t for t in server["tools"] if t["name"] == name), None)
            if not selected:
                raise MCPError("Tool not configured on selected MCP server", 404)
            if not selected.get("canAttempt"):
                raise MCPError(
                    "Brak autoryzowanej trasy do tego MCP. Narzędzie jest zarejestrowane w Cloudflare, ale nie jest udostępnione sesji Explorera.",
                    503,
                )
            ann = selected.get("annotations") or {}
            if (
                ann.get("destructiveHint") is True or ann.get("readOnlyHint") is not True
            ) and not confirmed:
                raise MCPError("Confirmation required for tool invocation", 409)
            started = time.monotonic()
            try:
                if (
                    selected["available"]
                    and selected["liveName"]
                    and selected["route"] == "lex-portal"
                ):
                    return self.exchange(
                        "tools/call", {"name": selected["liveName"], "arguments": arguments}
                    )
                direct = self.direct_sessions.get(server_id) or MCP(
                    url=server["hostname"], use_access=False
                )
                try:
                    direct.ensure_ready()
                    live_tools = self.direct_tools.get(server_id)
                    if live_tools is None:
                        live = direct.exchange("tools/list", {})
                        live_tools = live.get("tools", [])
                    if not any(t.get("name") == name for t in live_tools):
                        raise MCPError(
                            "Narzędzie nie jest dostępne w aktualnym tools/list serwera źródłowego.",
                            503,
                        )
                    return direct.exchange("tools/call", {"name": name, "arguments": arguments})
                except MCPError as exc:
                    raise MCPError(
                        "Bezpośredni MCP "
                        + server_id
                        + ": "
                        + str(exc)
                        + ". Sprawdź dostęp Cloudflare Access i autoryzację serwera.",
                        503,
                    ) from None
            finally:
                elapsed = int((time.monotonic() - started) * 1000)
                print(
                    json.dumps(
                        {
                            "event": "tools/call",
                            "serverId": server_id,
                            "name": name,
                            "duration_ms": elapsed,
                        },
                        ensure_ascii=False,
                    ),
                    flush=True,
                )


mcp = MCP()


class Handler(BaseHTTPRequestHandler):
    server_version = "LexMCPExplorer/1.0"

    def log_message(self, fmt, *args):
        # Do not log query arguments, access headers or body.
        pass

    def reply(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.secure_headers()
        self.end_headers()
        self.wfile.write(body)

    def secure_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        )
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")

    def do_GET(self):
        path = urllib.parse.urlsplit(self.path).path
        if path == "/healthz":
            return self.reply(200, {"status": "ok"})
        if path == "/api/catalog":
            return self.reply(
                200,
                mcp.get_catalog(
                    force=urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get(
                        "refresh"
                    )
                    == ["1"],
                    probe_direct=True,
                ),
            )
        files = {
            "/": ("index.html", "text/html; charset=utf-8"),
            "/app.js": ("app.js", "text/javascript; charset=utf-8"),
            "/pretty.js": ("pretty.js", "text/javascript; charset=utf-8"),
            "/styles.css": ("styles.css", "text/css; charset=utf-8"),
        }
        if path not in files:
            return self.reply(404, {"error": "Not found"})
        filename, ctype = files[path]
        data = (ROOT / filename).read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.secure_headers()
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if urllib.parse.urlsplit(self.path).path != "/api/call":
            return self.reply(404, {"error": "Not found"})
        origin = self.headers.get("Origin")
        if origin and origin != APP_ORIGIN:
            return self.reply(403, {"error": "Origin not allowed"})
        if self.headers.get("Content-Type", "").split(";")[0].strip().lower() != "application/json":
            return self.reply(415, {"error": "Content-Type must be application/json"})
        try:
            size = int(self.headers.get("Content-Length", "-1"))
        except ValueError:
            size = -1
        if not 0 < size <= MAX_REQ:
            return self.reply(413, {"error": "Invalid or too large request body"})
        try:
            payload = json.loads(self.rfile.read(size))
            name = payload.get("name")
            arguments = payload.get("arguments")
            if not isinstance(name, str) or not re.fullmatch(r"[\w.:\-/]+", name, re.UNICODE):
                return self.reply(400, {"error": "Invalid tool name"})
            if not isinstance(arguments, dict):
                return self.reply(400, {"error": "arguments must be a JSON object"})
            return self.reply(
                200,
                {
                    "result": mcp.call_tool(
                        name,
                        arguments,
                        bool(payload.get("confirmed", False)),
                        payload.get("serverId"),
                    )
                },
            )
        except (ValueError, AttributeError, TypeError):
            return self.reply(400, {"error": "Invalid JSON payload"})
        except MCPError as e:
            return self.reply(e.status, {"error": str(e)})


if __name__ == "__main__":
    print(
        json.dumps(
            {"event": "startup", "port": PORT, "upstreamHost": urllib.parse.urlsplit(URL).hostname}
        ),
        flush=True,
    )
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()  # noqa: S104 - container-local binding
