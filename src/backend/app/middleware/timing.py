"""Request timing middleware (ADR-007).

Records request duration in X-Request-Duration-Ms header on every response.
Propagates a UUID4 correlation ID via X-Request-ID header and contextvars.
Optionally logs to api_request_log table when settings.enable_request_logging is True.

Observability must never break requests — all DB logging is wrapped in try/except.
"""

import time
import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings

# ContextVar so any code in the same request can read the correlation ID.
request_id_var: ContextVar[str] = ContextVar("request_id", default="")


class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Generate or propagate correlation ID
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        ctx_var_reset = request_id_var.set(request_id)

        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000.0

        response.headers["X-Request-Duration-Ms"] = f"{duration_ms:.2f}"
        response.headers["X-Request-ID"] = request_id

        if settings.enable_request_logging:
            await self._log_request(request, response, duration_ms, request_id)

        request_id_var.reset(ctx_var_reset)
        return response

    @staticmethod
    async def _log_request(
        request: Request, response: Response, duration_ms: float, request_id: str
    ) -> None:
        """Persist request metrics to api_request_log. Failures are silently ignored."""
        try:
            from sqlalchemy import text

            from app.db.session import async_session

            request_size = int(request.headers.get("content-length", 0)) or None
            response_size = (
                int(response.headers.get("content-length", 0))
                if response.headers.get("content-length")
                else None
            )

            async with async_session() as session:
                await session.execute(
                    text(
                        "INSERT INTO api_request_log "
                        "(method, path, status_code, duration_ms, request_size, response_size, request_id) "
                        "VALUES (:method, :path, :status_code, :duration_ms, :request_size, :response_size, :request_id)"
                    ),
                    {
                        "method": request.method,
                        "path": str(request.url.path)[:500],
                        "status_code": response.status_code,
                        "duration_ms": duration_ms,
                        "request_size": request_size,
                        "response_size": response_size,
                        "request_id": request_id,
                    },
                )
                await session.commit()
        except Exception:
            pass  # Observability must not break requests
