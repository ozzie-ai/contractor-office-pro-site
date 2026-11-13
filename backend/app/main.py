"""ContractorOfficePro backend. Run: uvicorn app.main:create_app --factory --reload"""

import base64
import binascii
import logging
from dataclasses import dataclass
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, File, Form, Header, UploadFile

from .ai import Interpreter, OpenAIInterpreter, OpenAITranscriber, Transcriber
from .auth import Authenticator, JWKSKeyProvider, SupabaseMemberDirectory
from .config import Settings
from .errors import ApiError, install_error_handlers
from .ratelimit import RateLimiter
from .schemas import ErrorResponse as ErrorModel
from .schemas import InterpretRequest, InterpretResponse, Member, TranscribeResponse

AUDIO_TYPES = {"audio/m4a", "audio/mp4", "audio/x-m4a", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/webm", "audio/aac"}
ERRORS = {code: {"model": ErrorModel} for code in (400, 401, 403, 429, 502, 504)}


@dataclass
class Services:
    settings: Settings
    auth: Authenticator
    interpreter: Interpreter
    transcriber: Transcriber
    limiter: RateLimiter


def live_services() -> Services:
    settings = Settings.from_env()
    http = httpx.AsyncClient()
    return Services(
        settings=settings,
        auth=Authenticator(settings.supabase_url, JWKSKeyProvider(settings.supabase_url),
                           SupabaseMemberDirectory(settings, http)),
        interpreter=OpenAIInterpreter(settings),
        transcriber=OpenAITranscriber(settings),
        limiter=RateLimiter(settings.ai_requests_per_hour),
    )


def create_app(services: Services | None = None) -> FastAPI:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    svc = services or live_services()
    app = FastAPI(
        title="ContractorOfficePro API",
        version="0.1.0",
        description="AI interprets contractor notes into structured work. Code prices it (coming next). "
                    "Every response is a draft for the contractor to review.",
    )
    install_error_handlers(app)

    async def current_member(authorization: Annotated[str | None, Header()] = None) -> Member:
        return await svc.auth.member(authorization)

    def validate_images(request: InterpretRequest) -> None:
        for image in request.images:
            try:
                size = len(base64.b64decode(image.data_base64, validate=True))
            except (binascii.Error, ValueError):
                raise ApiError(400, "image_invalid", "A photo couldn't be read.") from None
            if size > svc.settings.max_image_bytes:
                raise ApiError(400, "image_too_large", "Photos must be under 2 MB. Resize before sending.")

    @app.get("/health", tags=["meta"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/v1/interpret", response_model=InterpretResponse, responses=ERRORS, tags=["ai"],
              summary="Turn contractor notes (+ optional photos) into structured work items")
    async def interpret(request: InterpretRequest, member: Annotated[Member, Depends(current_member)]) -> InterpretResponse:
        validate_images(request)
        svc.limiter.check(member.user_id)
        return InterpretResponse(interpretation=await svc.interpreter.interpret(request))

    @app.post("/v1/transcribe", response_model=TranscribeResponse, responses=ERRORS, tags=["ai"],
              summary="Transcribe a voice memo (EN/ES)")
    async def transcribe(
        member: Annotated[Member, Depends(current_member)],
        audio: Annotated[UploadFile, File(description="m4a/mp3/wav/webm, up to 25 MB")],
        language: Annotated[str | None, Form(pattern="^(en|es)$")] = None,
    ) -> TranscribeResponse:
        content_type = (audio.content_type or "").lower()
        if content_type not in AUDIO_TYPES:
            raise ApiError(400, "audio_invalid", "Send an m4a, mp3, wav or webm recording.")
        data = await audio.read(svc.settings.max_audio_bytes + 1)
        if len(data) > svc.settings.max_audio_bytes:
            raise ApiError(400, "audio_too_large", "Recordings must be under 25 MB.")
        if len(data) < 100:
            raise ApiError(400, "audio_invalid", "The recording is empty.")
        svc.limiter.check(member.user_id)
        text = await svc.transcriber.transcribe(data, audio.filename or "memo.m4a", content_type, language)
        return TranscribeResponse(transcript=text)

    return app
