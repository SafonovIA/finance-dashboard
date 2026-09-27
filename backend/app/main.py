import asyncio
import os
import subprocess
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import RedirectResponse, Response

from backend.app.api import router
from backend.app.auth import current_user_id, router as auth_router
from backend.app.config import PROJECT_ROOT, get_settings


settings = get_settings()
frontend_process: subprocess.Popen[bytes] | None = None


async def frontend_is_ready() -> bool:
    try:
        async with httpx.AsyncClient(timeout=1.0) as client:
            response = await client.get(settings.frontend_url)
            return response.status_code < 500
    except httpx.RequestError:
        return False


async def wait_for_frontend() -> None:
    for _ in range(80):
        if await frontend_is_ready():
            return
        await asyncio.sleep(0.5)
    raise RuntimeError("Frontend server did not become ready in time")


def start_frontend() -> subprocess.Popen[bytes]:
    command = (
        "npm run dev -- "
        f"--hostname 127.0.0.1 --port {settings.frontend_port}"
    )
    creation_flags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    return subprocess.Popen(
        command,
        cwd=PROJECT_ROOT,
        shell=True,
        creationflags=creation_flags,
    )


def stop_frontend(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return

    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            check=False,
            capture_output=True,
        )
    else:
        process.terminate()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    global frontend_process

    if settings.start_frontend and not await frontend_is_ready():
        frontend_process = start_frontend()

    if settings.start_frontend:
        await wait_for_frontend()

    yield

    if frontend_process is not None:
        stop_frontend(frontend_process)


app = FastAPI(
    title=settings.app_name,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)
app.include_router(router)
app.include_router(auth_router)


@app.middleware("http")
async def require_login(request: Request, call_next):
    path = request.url.path
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("origin")
        if origin and origin != f"{request.url.scheme}://{request.headers.get('host')}":
            return Response(status_code=403, content="Invalid origin")
    if path.startswith("/api/auth/"):
        return await call_next(request)
    if path.startswith("/api/"):
        user_id = current_user_id(request)
        if user_id is None:
            return Response(status_code=401, media_type="application/json", content='{"detail":"Требуется вход"}')
        request.state.user_id = user_id
    elif request.method in {"GET", "HEAD"} and "text/html" in request.headers.get("accept", ""):
        if path != "/login" and current_user_id(request) is None:
            return RedirectResponse("/login", status_code=303)
    return await call_next(request)


@app.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    include_in_schema=False,
)
async def frontend_proxy(path: str, request: Request) -> Response:
    target_url = f"{settings.frontend_url}/{path}"
    headers = dict(request.headers)
    headers.pop("host", None)

    try:
        async with httpx.AsyncClient(follow_redirects=False, timeout=30.0) as client:
            upstream = await client.request(
                request.method,
                target_url,
                params=request.query_params,
                content=await request.body(),
                headers=headers,
            )
    except httpx.RequestError as error:
        raise HTTPException(status_code=503, detail="Frontend is unavailable") from error

    blocked_headers = {"content-encoding", "content-length", "transfer-encoding", "connection"}
    response_headers = {
        key: value
        for key, value in upstream.headers.items()
        if key.lower() not in blocked_headers
    }
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=response_headers,
        media_type=upstream.headers.get("content-type"),
    )
