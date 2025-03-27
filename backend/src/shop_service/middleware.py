import asyncio

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


class TimeoutMiddleware:
    def __init__(self, app, timeout: int = 60):
        self.app = app
        self.timeout = timeout

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        try:
            await asyncio.wait_for(self.app(scope, receive, send), timeout=self.timeout)
        except asyncio.TimeoutError:
            response = JSONResponse(status_code=504, content={"error": "Request timed out"})
            await response(scope, receive, send)
