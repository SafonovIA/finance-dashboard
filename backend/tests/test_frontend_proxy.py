import unittest
from unittest.mock import patch

import httpx
from starlette.requests import Request

from backend.app import main


class FrontendProxyTests(unittest.IsolatedAsyncioTestCase):
    async def test_preserves_compressed_response_and_encoding(self):
        compressed_body = b"\x8b\x02\x80compressed-html"

        class RawStream(httpx.AsyncByteStream):
            async def __aiter__(self):
                yield compressed_body

        def upstream_response(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.url.path, "/login")
            return httpx.Response(
                200,
                headers={"content-type": "text/html", "content-encoding": "br"},
                stream=RawStream(),
            )

        real_client = httpx.AsyncClient

        def mock_client(*args, **kwargs):
            return real_client(*args, transport=httpx.MockTransport(upstream_response), **kwargs)

        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        request = Request({
            "type": "http",
            "method": "GET",
            "scheme": "https",
            "server": ("localhost", 443),
            "path": "/login",
            "headers": [(b"accept-encoding", b"br, gzip, deflate")],
            "query_string": b"",
        }, receive)
        with patch.object(main.httpx, "AsyncClient", side_effect=mock_client):
            response = await main.frontend_proxy("login", request)

        self.assertEqual(response.body, compressed_body)
        self.assertEqual(response.headers["content-encoding"], "br")
        self.assertEqual(response.headers["content-type"], "text/html")
