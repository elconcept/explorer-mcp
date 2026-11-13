"""Tests of portal catalog canonical mapping, live capabilities, and HTTP security."""

import json
import unittest
import urllib.request

import app

# A fresh public checkout has no private Cloudflare registry.
if not app.PORTAL_SNAPSHOT.get("servers"):
    from pathlib import Path

    app.PORTAL_SNAPSHOT = json.loads(
        (Path(__file__).parent / "tests" / "registry_unit_fixture.json").read_text(encoding="utf-8")
    )


class ExplorerTests(unittest.TestCase):
    def test_portal_canonical_catalog(self):
        m = app.MCP()
        self.assertGreaterEqual(len(app.PORTAL_SNAPSHOT["servers"]), 1)
        m.ready = True
        m.tools = [
            {"name": "portal_list_servers", "inputSchema": {"type": "object"}},
            {"name": "mcp-prawmi_search_rulings", "inputSchema": {"type": "object"}},
            {"name": "krs_get_entity", "inputSchema": {"type": "object"}},
        ]
        m.catalog_at = app.time.monotonic()
        d = m.get_catalog()
        expected = [s["id"] for s in app.PORTAL_SNAPSHOT["servers"]]
        self.assertEqual([s["id"] for s in d["servers"]], expected)
        self.assertEqual(
            d["totalTools"], sum(len(s["tools"]) for s in app.PORTAL_SNAPSHOT["servers"])
        )
        self.assertNotIn("Lex MCP Portal", [s["name"] for s in d["servers"]])
        self.assertFalse(
            any(t["name"].startswith("portal_") for s in d["servers"] for t in s["tools"])
        )
        self.assertEqual(d["availableTools"], 2)
        a = next(s for s in d["servers"] if s["id"] == "mcp-prawmi")
        b = next(s for s in d["servers"] if s["id"] == "krs")
        self.assertEqual(
            next(t for t in a["tools"] if t["name"] == "search_rulings")["liveName"],
            "mcp-prawmi_search_rulings",
        )
        self.assertEqual(
            next(t for t in b["tools"] if t["name"] == "get_entity")["liveName"], "krs_get_entity"
        )

    def test_pagination_and_portal_tool_filtering(self):
        m = app.MCP()
        calls = []

        def exchange(method, params=None, notification=False):
            calls.append(method)
            if method == "initialize":
                return {"serverInfo": {"name": "Lex portal"}}
            if method == "tools/list":
                if not params or "cursor" not in params:
                    return {
                        "tools": [
                            {"name": "portal_toggle_servers"},
                            {"name": "mcp-prawmi_search_rulings"},
                        ],
                        "nextCursor": "next",
                    }
                return {"tools": [{"name": "mcp-ustawy_przepis"}]}
            return {}

        m.exchange = exchange
        catalog = m.get_catalog()
        self.assertEqual(catalog["availableTools"], 2)
        self.assertEqual(calls.count("tools/list"), 2)
        self.assertEqual(len(m.tools), 2)
        self.assertEqual(len(catalog["servers"]), len(app.PORTAL_SNAPSHOT["servers"]))

    def test_server_aware_calls_and_unavailable_rejection(self):
        m = app.MCP()
        m.ready = True
        m.tools = [
            {"name": "mcp-prawmi_search_rulings", "annotations": {"readOnlyHint": True}},
            {"name": "mcp-prawmi_verify_ruling", "annotations": {"readOnlyHint": False}},
        ]
        m.catalog_at = app.time.monotonic()
        called = []

        def exchange(method, params=None, notification=False):
            called.append((method, params))
            return {"content": [{"type": "text", "text": "ok"}]}

        m.exchange = exchange
        with self.assertRaisesRegex(app.MCPError, "Server ID required"):
            m.call_tool("search_rulings", {"query": "test"}, False)
        with self.assertRaisesRegex(app.MCPError, "Brak autoryzowanej"):
            m.call_tool("get_article", {}, True, "mcp-prawmi")
        with self.assertRaisesRegex(app.MCPError, "Confirmation"):
            m.call_tool("verify_ruling", {"case_number": "X"}, False, "mcp-prawmi")
        self.assertIn(
            "content", m.call_tool("verify_ruling", {"case_number": "X"}, True, "mcp-prawmi")
        )
        self.assertIn("content", m.call_tool("search_rulings", {"query": "X"}, False, "mcp-prawmi"))
        self.assertEqual(called[-1][1]["name"], "mcp-prawmi_search_rulings")
        with self.assertRaisesRegex(app.MCPError, "not configured"):
            m.call_tool("portal_toggle_servers", {}, True, "mcp-prawmi")

    def test_server_collision_does_not_route_wrong_upstream(self):
        m = app.MCP()
        m.ready = True
        m.tools = [{"name": "mcp-prawmi_search_rulings"}]
        m.catalog_at = app.time.monotonic()
        m.exchange = lambda *args, **kwargs: {"ok": True}
        with self.assertRaisesRegex(app.MCPError, "Brak autoryzowanej"):
            m.call_tool("search", {"query": "a"}, True, "saos")

    def test_account_registry_memberships_and_direct_route(self):
        from unittest.mock import patch

        m = app.MCP()
        m.ready = True
        m.tools = []
        m.catalog_at = app.time.monotonic()
        catalog = m.get_catalog()
        self.assertGreaterEqual(len(catalog["servers"]), 15)
        self.assertEqual({p["name"] for p in catalog["portals"]}, {"lex-prawo", "ai-admin-tools"})
        self.assertNotIn("uodo", {s["id"] for s in catalog["servers"]})
        self.assertIn("mcp-uodo", {s["id"] for s in catalog["servers"]})
        krs = next(s for s in catalog["servers"] if s["id"] == "krs")
        self.assertIn("lex-prawo", [p["name"] for p in krs["portals"]])
        self.assertFalse(krs["availableTools"])
        self.assertTrue(next(t for t in krs["tools"] if t["name"] == "get_entity")["canAttempt"])

        class FakeDirect:
            def __init__(self):
                self.calls = []

            def ensure_ready(self):
                pass

            def exchange(self, method, params=None):
                self.calls.append((method, params))
                if method == "tools/list":
                    return {"tools": [{"name": "get_entity"}]}
                return {"content": [{"type": "text", "text": "KRS OK"}]}

        direct = FakeDirect()
        with patch.object(app, "MCP", return_value=direct) as constructor:
            result = m.call_tool("get_entity", {"krs": "0000000000"}, False, "krs")
        constructor.assert_called_once_with(url=krs["hostname"], use_access=False)
        self.assertEqual(result["content"][0]["text"], "KRS OK")
        self.assertEqual(
            direct.calls[-1],
            ("tools/call", {"name": "get_entity", "arguments": {"krs": "0000000000"}}),
        )

    def test_health_and_assets(self):
        for path in ("/healthz", "/", "/app.js", "/pretty.js", "/styles.css"):
            with urllib.request.urlopen("http://127.0.0.1:8080" + path, timeout=3) as response:
                self.assertEqual(response.status, 200)
                if path == "/healthz":
                    self.assertEqual(json.loads(response.read())["status"], "ok")


if __name__ == "__main__":
    unittest.main()
