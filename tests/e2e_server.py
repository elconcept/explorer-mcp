#!/usr/bin/env python3
"""Isolated MCP fixture for UI browser E2E. It cannot reach real upstream."""

import json
import os
import sys
from pathlib import Path

os.environ.setdefault("MCP_URL", "https://lex.xlap.pl/mcp")
os.environ.setdefault("CF_ACCESS_CLIENT_ID", "E2E_TEST_ONLY")
os.environ.setdefault("CF_ACCESS_CLIENT_SECRET", "E2E_TEST_ONLY")
os.environ.setdefault("PORT", "8090")
os.environ["APP_ORIGIN"] = "https://explorer.xlap.pl"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app  # noqa: E402

# Match the isolated HTTP origin only inside the fixture; production remains HTTPS-only.
app.APP_ORIGIN = os.getenv("E2E_ORIGIN", "http://lex-mcp-explorer-e2e:8090")

TOOLS = [
    {
        "name": "e2e__search",
        "description": "Return searched text",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Szukana fraza"},
                "court_filter": {"type": "string", "enum": ["SN", "NSA", "WSA"]},
                "limit": {"type": "integer", "default": 3, "minimum": 1, "maximum": 10},
                "skip_external": {"type": "boolean", "default": False},
            },
            "required": ["query"],
        },
        "annotations": {"readOnlyHint": True},
    },
    {
        "name": "e2e__mutate",
        "description": "Simulated write that requires confirmation",
        "inputSchema": {
            "type": "object",
            "properties": {"text": {"type": "string"}},
            "required": ["text"],
        },
        "annotations": {"readOnlyHint": False, "destructiveHint": True},
    },
    {
        "name": "e2e__fail",
        "description": "Return isError in MCP tool result",
        "inputSchema": {"type": "object", "properties": {}},
        "annotations": {"readOnlyHint": True},
    },
]


def fixture_exchange(method, params=None, notification=False):
    if method == "initialize":
        return {"serverInfo": {"name": "E2E Fixture MCP"}}
    if method == "notifications/initialized":
        return {}
    if method == "tools/list":
        if params and params.get("cursor"):
            return {"tools": TOOLS[1:]}
        return {"tools": TOOLS[:1], "nextCursor": "second-page"}
    if method == "tools/call":
        name, args = params["name"], params["arguments"]
        if name == "e2e__search":
            return {
                "content": [{"type": "text", "text": "WYNIK: " + str(args.get("query", ""))}],
                "structuredContent": dict(args),
                "isError": False,
            }
        if name == "e2e__mutate":
            return {"content": [{"type": "text", "text": "WYKONANO: " + str(args.get("text", ""))}]}
        if name == "e2e__fail":
            return {"isError": True, "content": [{"type": "text", "text": "FAIL FROM MCP"}]}
    raise app.MCPError("Unknown fixture request", 400)


app.PORTAL_SNAPSHOT = {
    "capturedAt": "fixture",
    "codeMode": "off",
    "servers": [{"id": "e2e", "name": "E2E fixture", "status": "ready", "tools": TOOLS}],
}

app.mcp.exchange = fixture_exchange
app.mcp.ready = False
print(json.dumps({"event": "e2e_fixture", "port": int(os.environ["PORT"])}), flush=True)
app.ThreadingHTTPServer(("0.0.0.0", int(os.environ["PORT"])), app.Handler).serve_forever()  # noqa: S104 - isolated test network
