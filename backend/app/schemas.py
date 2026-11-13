"""Request/response models. These generate the OpenAPI docs and the strict JSON schema sent to the model."""
from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from .catalog import CODES

Trade = Literal["electrical", "plumbing", "painting", "concrete", "handyman", "remodel", "cleaning", "other"]
Language = Literal["en", "es"]
TaskCode = Literal[CODES]  # type: ignore[valid-type]


class ImageInput(BaseModel):
    """A job photo, downscaled on the phone (about 1024 px) and sent as base64."""
    model_config = ConfigDict(extra="forbid")
    content_type: Literal["image/jpeg", "image/png"]
    data_base64: str = Field(min_length=100)
    media_id: UUID | None = None


class InterpretRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    description: str = Field(min_length=10, max_length=10_000, description="Contractor's notes or transcript (EN/ES).")
    language: Language | None = Field(default=None, description="Language of the notes, if known.")
    trade_hint: Trade | None = None
    images: list[ImageInput] = Field(default_factory=list, max_length=6)


class WorkItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category: str
    task_code: TaskCode | None = Field(description="Catalog code when the task clearly matches one; else null.")
    description_en: str
    description_es: str
    quantity: float | None = Field(description="Only if stated (or clearly countable in a photo); else null.")
    unit: str | None
    specifications: list[str] = Field(description="Amperage, voltage, sizes, materials exactly as stated.")
    status: Literal["included_now", "allowance_to_confirm"]
    evidence: Literal["stated", "photo", "inferred"] = Field(
        description="stated = said in the notes; photo = seen in a photo; inferred = implied, must be confirmed.")


class Interpretation(BaseModel):
    """Same shape as the team's pilot `interpretation`, plus task_code and evidence on each task."""
    model_config = ConfigDict(extra="forbid")
    trade: Trade
    project_summary_en: str
    project_summary_es: str
    tasks: list[WorkItem]
    excluded_work: list[str]
    future_work: list[str]
    unknown_details: list[str] = Field(description="Short questions for the contractor about missing details.")
    confidence_notes: list[str]


class InterpretResponse(BaseModel):
    version: Literal[1] = 1
    interpretation: Interpretation
    pricing_status: Literal["not_priced"] = "not_priced"
    note: str = "AI draft. Review every task, quantity and specification before pricing."


class TranscribeResponse(BaseModel):
    transcript: str


class ErrorResponse(BaseModel):
    error: str
    message: str


class Member(BaseModel):
    user_id: UUID
    member_id: UUID
    org_id: UUID
    role: str
