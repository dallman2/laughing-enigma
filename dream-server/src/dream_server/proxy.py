"""CORS proxy — fetches arbitrary URLs server-side, bypassing browser CORS."""

from __future__ import annotations

import httpx
from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel

router = APIRouter()


class ProxyRequest(BaseModel):
    url: str


@router.post("/api/proxy-fetch")
async def proxy_fetch(request: ProxyRequest) -> Response:
    """Fetch a URL server-side, bypassing browser CORS restrictions.

    Used by the frontend to load models from hosts that don't set
    Access-Control-Allow-Origin headers (Kaggle, TFHub, private repos, etc.).
    """
    async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
        resp = await client.get(request.url)
        return Response(
            content=resp.content,
            media_type=resp.headers.get("content-type", "application/octet-stream"),
            headers={"Access-Control-Allow-Origin": "*"},
        )
