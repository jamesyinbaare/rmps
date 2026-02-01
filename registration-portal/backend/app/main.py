from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
import json
import logging
import uvicorn
from fastapi import FastAPI, status, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware
import time
from app.dependencies.database import get_sessionmanager, initialize_db
from app.initial_data import ensure_system_admin_user
from app.routers import (
    auth,
    public,
    admin,
    school,
    private,
    permissions,
    api_keys,
    credits,
    api_verification,
    dashboard_verification,
)
from app.config import logging_settings, settings
from starlette.types import ASGIApp

SENSITIVE_KEYS = {"password", "token", "authorization"}


class CustomFormatter(logging.Formatter):
    def __init__(self, use_json: bool = False, *args: Any, **kwargs: Any):
        super().__init__(*args, **kwargs)
        self.use_json = use_json

        self.default_attrs = set(vars(logging.LogRecord("", 0, "", 0, "", (), None)).keys())

    def format(self, record: logging.LogRecord) -> str:
        extra = {
            k: ("***" if k.lower() in SENSITIVE_KEYS else v)
            for k, v in record.__dict__.items()
            if k not in self.default_attrs
        }

        if self.use_json:
            payload = {
                "timestamp": self.formatTime(record),
                "level": record.levelname,
                "logger": record.name,
                "message": record.getMessage(),
                **extra,
            }

            if record.exc_info:
                payload["exception"] = self.formatException(record.exc_info)

            return json.dumps(payload, default=str)

        # ---- TEXT FORMAT ----
        base = super().format(record)
        if extra:
            extra_info = " ".join(f"{k}={v}" for k, v in extra.items())
            return f"{base} | {extra_info}"

        return base


def setup_logging() -> None:
    root = logging.getLogger()

    if getattr(root, "_configured", False):
        return

    root._configured = True

    root.setLevel(logging_settings.LOG_LEVEL)

    handler = logging.StreamHandler()

    formatter = CustomFormatter(
        use_json=logging_settings.LOG_FORMAT == "json",
        fmt="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    handler.setFormatter(formatter)
    handler.setLevel(logging.NOTSET)

    root.handlers.clear()
    root.addHandler(handler)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Lifespan context for application startup and shutdown."""

    # Configure logging FIRST
    setup_logging()


    import os
    if os.getenv("DEBUG") == "true":
        import debugpy
        debugpy.listen(("0.0.0.0", 5678))
        #debugpy.wait_for_client()

    # Startup: Initialize database
    sessionmanager = get_sessionmanager()
    async with initialize_db(sessionmanager):
        # Ensure SYSTEM_ADMIN user exists
        async with sessionmanager.session() as session:
            await ensure_system_admin_user(session)
        yield
    # Shutdown handled by context manager


app = FastAPI(title="Examination Registration Portal", lifespan=lifespan)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp):
        super().__init__(app)
        self.logger = logging.getLogger("http")

    async def dispatch(self, request: Request, call_next):
        if request.url.path in {"/health", "/metrics"}:
            return await call_next(request)

        start_time = time.monotonic()

        try:
            response = await call_next(request)
            duration_ms = (time.monotonic() - start_time) * 1000

            self.logger.info(
                "request completed",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "duration_ms": round(duration_ms, 2),
                },
            )
            return response

        except Exception as exc:
            duration_ms = (time.monotonic() - start_time) * 1000

            self.logger.error(
                "request failed",
                exc_info=exc,
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "duration_ms": round(duration_ms, 2),
                },
            )

            if logging_settings.ENV == "dev":
                raise

            return Response(
                content="Internal server error",
                status_code=500,
            )


app.add_middleware(RequestLoggingMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=settings.cors_allow_methods,
    allow_headers=settings.cors_allow_headers,
    expose_headers=settings.cors_expose_headers,
)

# Include routers
app.include_router(auth.router)
app.include_router(public.router)
app.include_router(admin.router)
app.include_router(school.router)
app.include_router(private.router)
app.include_router(permissions.router)
app.include_router(api_keys.router)
app.include_router(credits.router)
app.include_router(api_verification.router)
app.include_router(dashboard_verification.router)


@app.get("/health", status_code=status.HTTP_200_OK)
def health() -> dict[str, str]:
    return {"status": "healthy"}


@app.get("/", status_code=status.HTTP_200_OK)
def test() -> dict[str, Any]:
    return {"success": True, "service": "registration-portal"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)  # Different port from main system
