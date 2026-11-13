"""One error shape for every response: {"error": "<code>", "message": "<safe text>"}.
Codes match the team's pilot (access_denied, ai_timeout, ai_rate_limited, ai_provider_failed, ...).
Messages never echo request content (transcripts are private)."""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("cop.errors")


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(code)
        self.status, self.code, self.message = status, code, message


def error_body(code: str, message: str) -> dict[str, str]:
    return {"error": code, "message": message}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(error_body(exc.code, exc.message), status_code=exc.status,
                            headers={"Cache-Control": "no-store"})

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # FastAPI's default echoes the offending input; ours lists only field locations.
        fields = sorted({".".join(str(p) for p in err.get("loc", ()) if p != "body") for err in exc.errors()})
        return JSONResponse(error_body("invalid_request", f"Check these fields: {', '.join(fields) or 'body'}"),
                            status_code=400)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "http_error")
        return JSONResponse(error_body(code, str(exc.detail)), status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def unexpected(_: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error: %s", type(exc).__name__)
        return JSONResponse(error_body("internal_error", "Something went wrong. Try again."), status_code=500)
