"""Protocol-level unit tests with deterministic Streamable HTTP fake responses."""

import io
import json
import unittest
from unittest import mock
from urllib.error import HTTPError

import app


class Reply:
    def __init__(self, payload=b"", content_type="application/json", session_id=None, status=200):
        if isinstance(payload, dict):
            payload = json.dumps(payload).encode("utf-8")
        self.stream = io.BytesIO(payload)
        self.status = status
        self.headers = {"Content-Type": content_type}
        if session_id:
            self.headers["Mcp-Session-Id"] = session_id

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def read(self, limit=-1):
        return self.stream.read(limit)

    def readline(self, limit=-1):
        return self.stream.readline(limit)


class ProtocolTests(unittest.TestCase):
    def test_json_rpc_http_headers_and_session(self):
        observed = []
        response = Reply(
            {"jsonrpc": "2.0", "id": 1, "result": {"protocolVersion": "2025-06-18"}},
            session_id="server-session",
        )

        def fake_open(request, timeout):
            observed.append(request)
            self.assertLessEqual(timeout, 90)
            return response

        m = app.MCP()
        with mock.patch.object(app.urllib.request, "urlopen", side_effect=fake_open):
            self.assertIn("protocolVersion", m.exchange("initialize", {}))
        req = observed[0]
        self.assertEqual(req.full_url, "https://lex.xlap.pl/mcp")
        self.assertEqual(json.loads(req.data)["method"], "initialize")
        self.assertEqual(req.get_header("Cf-access-client-id"), app.ID)
        self.assertEqual(req.get_header("Cf-access-client-secret"), app.SECRET)
        self.assertEqual(m.session, "server-session")

    def test_sse_frames_with_comments_and_multiple_ids(self):
        data = (
            b": keepalive\n\n"
            b"event: message\n"
            b'data: {"jsonrpc":"2.0","id":99,"result":{"incorrect":true}}\n\n'
            b"event: message\n"
            b'data: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"ok"}]}}\n\n'
        )
        m = app.MCP()
        with mock.patch.object(
            app.urllib.request,
            "urlopen",
            return_value=Reply(data, "text/event-stream"),
        ):
            result = m.exchange("tools/call", {"name": "safe", "arguments": {}})
        self.assertEqual(result["content"][0]["text"], "ok")

    def test_json_rpc_error_is_not_success(self):
        m = app.MCP()
        with (
            mock.patch.object(
                app.urllib.request,
                "urlopen",
                return_value=Reply(
                    {
                        "jsonrpc": "2.0",
                        "id": 1,
                        "error": {"code": -32601, "message": "unknown tool"},
                    }
                ),
            ),
            self.assertRaisesRegex(app.MCPError, "unknown tool"),
        ):
            m.exchange("tools/call", {})

    def test_http_errors_hide_response_body_and_credentials(self):
        m = app.MCP()
        err = HTTPError(app.URL, 403, "Forbidden", {}, io.BytesIO(b"secrets"))
        with mock.patch.object(app.urllib.request, "urlopen", side_effect=err):  # noqa: SIM117
            with self.assertRaisesRegex(app.MCPError, "HTTP 403") as caught:
                m.exchange("tools/list", {})
        self.assertNotIn("secrets", str(caught.exception))
        self.assertNotIn(app.ID, str(caught.exception))

    def test_invalid_json_and_oversized_sse(self):
        m = app.MCP()
        with (
            mock.patch.object(
                app.urllib.request,
                "urlopen",
                return_value=Reply(b"<html>redirect</html>"),
            ),
            self.assertRaisesRegex(app.MCPError, "Invalid JSON"),
        ):
            m.exchange("tools/list", {})
        m = app.MCP()
        with (
            mock.patch.object(
                app.urllib.request,
                "urlopen",
                return_value=Reply(b"data: " + b"x" * 65537 + b"\n\n", "text/event-stream"),
            ),
            self.assertRaisesRegex(app.MCPError, "line too large"),
        ):
            m.exchange("tools/list", {})

    def test_pagination_cycle_fails_closed(self):
        m = app.MCP()
        m.ready = True
        m.exchange = lambda method, params=None, notification=False: {
            "tools": [],
            "nextCursor": "same",
        }
        catalog = m.get_catalog(force=True)
        self.assertIn("cursor cycle", catalog["warning"])
        self.assertEqual(catalog["availableTools"], 0)


if __name__ == "__main__":
    unittest.main()
