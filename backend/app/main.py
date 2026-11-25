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
from .catalog import BY_CODE, CATALOG
from .config import Settings
from .pricing import PricingRepository, SupabasePricingRepository, apply_ballpark, ballpark_requests, price_tasks
from .errors import ApiError, install_error_handlers
from .ratelimit import RateLimiter
from .schemas import ErrorResponse as ErrorModel
from .schemas import InterpretationResult, RefinementResult
from .schemas import (InterpretRequest, InterpretResponse, Member, PriceBookEntry, PriceBookResponse, PriceRequest,
                      PriceResponse, PriceTaskInput, RefineRequest, RefineResponse, TranscribeResponse,
                      MaterialsRequest, MaterialsResponse, ToolsRequest, ToolsResponse)

AUDIO_TYPES = {"audio/m4a", "audio/mp4", "audio/x-m4a", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/webm", "audio/aac"}
log = logging.getLogger("cop.api")
ERRORS = {code: {"model": ErrorModel} for code in (400, 401, 403, 429, 502, 504)}


@dataclass
class Services:
    settings: Settings
    auth: Authenticator
    interpreter: Interpreter
    transcriber: Transcriber
    limiter: RateLimiter
    pricing: PricingRepository


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
        pricing=SupabasePricingRepository(settings, http),
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

    def validate_images(request: InterpretRequest | ToolsRequest) -> None:
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
        return InterpretResponse(interpretation=InterpretationResult.of(await svc.interpreter.interpret(request)))

    @app.post("/v1/refine", response_model=RefineResponse, responses=ERRORS, tags=["ai"],
              summary="Turn the contractor's answers to the AI's questions into proposed estimate changes")
    async def refine(request: RefineRequest, member: Annotated[Member, Depends(current_member)]) -> RefineResponse:
        svc.limiter.check(member.user_id)
        return RefineResponse(changes=RefinementResult.of(await svc.interpreter.refine(request)))

    @app.post("/v1/materials", response_model=MaterialsResponse, responses=ERRORS, tags=["ai"],
              summary="Draft a bill of materials (materials only, no prices) from an estimate's lines")
    async def materials(request: MaterialsRequest, member: Annotated[Member, Depends(current_member)]) -> MaterialsResponse:
        svc.limiter.check(member.user_id)
        return MaterialsResponse(materials_list=await svc.interpreter.materials(request))

    @app.post("/v1/tools/identify", response_model=ToolsResponse, responses=ERRORS, tags=["ai"],
              summary="List the tools seen in photos (for the contractor's tool inventory)")
    async def identify_tools(request: ToolsRequest, member: Annotated[Member, Depends(current_member)]) -> ToolsResponse:
        validate_images(request)
        svc.limiter.check(member.user_id)
        return ToolsResponse(result=await svc.interpreter.identify_tools(request))

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

    @app.post("/v1/estimate/price", response_model=PriceResponse, responses=ERRORS, tags=["pricing"],
              summary="Price work items: your price book, then regional references, then (opt-in) an AI ballpark")
    async def price(request: PriceRequest, member: Annotated[Member, Depends(current_member)]) -> PriceResponse:
        codes = {t.task_code for t in request.tasks if t.task_code}
        inputs = await svc.pricing.inputs(member.org_id, codes, request.region_code)
        priced = price_tasks(request.tasks, inputs)
        missing = ballpark_requests(priced)
        if request.ai_ballpark and missing:
            trades = {BY_CODE[t.task_code].trade for t in request.tasks if t.task_code in BY_CODE}
            try:
                svc.limiter.check(member.user_id)
                ballpark = await svc.interpreter.ballpark(missing, priced.region_code, next(iter(trades)) if len(trades) == 1 else None)
            except ApiError as exc:
                # The deterministic prices still stand; the unpriced lines just stay "needs price".
                log.warning("ballpark skipped: %s", exc.code)
            else:
                priced = apply_ballpark(priced, ballpark, inputs.org)
        return priced

    @app.get("/v1/pricebook", response_model=PriceBookResponse, responses=ERRORS, tags=["pricing"],
             summary="Catalog with your prices and the reference price for your region")
    async def pricebook(member: Annotated[Member, Depends(current_member)], region_code: str | None = None) -> PriceBookResponse:
        inputs = await svc.pricing.inputs(member.org_id, {t.code for t in CATALOG}, region_code)
        mine = price_tasks([PriceTaskInput(task_code=t.code, description_en=t.title_en) for t in CATALOG], inputs)
        reference_only = price_tasks([PriceTaskInput(task_code=t.code, description_en=t.title_en) for t in CATALOG],
                                     type(inputs)(org=inputs.org, region_chain=inputs.region_chain,
                                                  observations=inputs.observations))
        entries = [PriceBookEntry(
            task_code=t.code, trade=t.trade, title_en=t.title_en, title_es=t.title_es, unit=t.unit,
            your_price=own.unit_price if own.price_source == "contractor" else None,
            reference_price=ref.unit_price, reference_source=ref.source_name, reference_applies_to=ref.applies_to,
            reference_preliminary=ref.preliminary,
        ) for t, own, ref in zip(CATALOG, mine.lines, reference_only.lines)]
        return PriceBookResponse(region_code=inputs.region_chain[0], overhead_pct=inputs.org.overhead,
                                 profit_pct=inputs.org.profit, entries=entries)

    return app
