"""Request/response models. These generate the OpenAPI docs and the strict JSON schema sent to the model."""
from __future__ import annotations

from decimal import Decimal
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


class FriendlyQuestion(BaseModel):
    """A question the contractor answers with one tap."""
    model_config = ConfigDict(extra="forbid")
    question: str = Field(description="One short, plain-words question about one thing (max ~12 words).")
    choices: list[str] = Field(description="2-4 short tap answers (1-4 words each), most likely first. "
                                           "Never 'Not sure' or 'Other': the app adds those.")


class Interpretation(BaseModel):
    """What the model returns. Same shape as the team's pilot `interpretation` (plus task_code/evidence),
    except questions carry tap-to-answer choices; `unknown_details` is derived from them in the response."""
    model_config = ConfigDict(extra="forbid")
    trade: Trade
    project_summary_en: str
    project_summary_es: str
    tasks: list[WorkItem]
    excluded_work: list[str]
    future_work: list[str]
    questions: list[FriendlyQuestion] = Field(description="At most 4 questions about details needed to price or do the work.")
    confidence_notes: list[str]


class InterpretationResult(Interpretation):
    unknown_details: list[str] = Field(description="The questions' text (kept for older clients).")

    @classmethod
    def of(cls, i: Interpretation) -> "InterpretationResult":
        return cls(**i.model_dump(), unknown_details=[q.question for q in i.questions])


class InterpretResponse(BaseModel):
    version: Literal[1] = 1
    interpretation: InterpretationResult
    pricing_status: Literal["not_priced"] = "not_priced"
    note: str = "AI draft. Review every task, quantity and specification before pricing."


class CurrentLine(BaseModel):
    """A line already on the draft estimate, referenced by `ref` in proposed updates."""
    model_config = ConfigDict(extra="ignore")
    ref: int = Field(ge=0)
    task_code: str | None = None
    description_en: str
    quantity: float | None = None
    unit: str | None = None


class QuestionAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=1, max_length=500)
    answer: str = Field(min_length=1, max_length=2000)


class RefineRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notes: str = Field(default="", max_length=10_000, description="The original notes/transcript (private).")
    language: Language | None = None
    current_lines: list[CurrentLine] = Field(default_factory=list, max_length=100)
    answers: list[QuestionAnswer] = Field(min_length=1, max_length=20)


class LineUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ref: int = Field(description="ref of the existing line to change.")
    quantity: float | None = Field(description="New quantity if an answer states it; else null.")
    unit: str | None = Field(description="New unit if it changes; else null.")
    reason_en: str = Field(description="Short reason, e.g. 'Answer: run is 80 ft'.")


class Refinement(BaseModel):
    """Changes the contractor's answers imply. The contractor reviews and applies them."""
    model_config = ConfigDict(extra="forbid")
    add: list[WorkItem] = Field(description="New tasks revealed by the answers that are not already on the estimate.")
    update: list[LineUpdate] = Field(description="Quantity/unit changes to existing lines, by ref.")
    exclusions: list[str] = Field(description="New excluded or future work stated in the answers.")
    remaining: list[FriendlyQuestion] = Field(description="Original questions still unanswered plus any essential new ones.")


class RefinementResult(Refinement):
    remaining_questions: list[str] = Field(description="The remaining questions' text (kept for older clients).")

    @classmethod
    def of(cls, r: Refinement) -> "RefinementResult":
        return cls(**r.model_dump(), remaining_questions=[q.question for q in r.remaining])


class RefineResponse(BaseModel):
    version: Literal[1] = 1
    changes: RefinementResult
    pricing_status: Literal["not_priced"] = "not_priced"


MaterialCategory = Literal["electrical", "conduit_fittings", "plumbing", "lumber", "drywall", "paint", "concrete",
                           "hardware", "fixtures", "consumables", "rental", "other"]


class MaterialsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notes: str = Field(default="", max_length=10_000, description="Original notes/transcript (private), for context.")
    language: Language | None = None
    lines: list[CurrentLine] = Field(min_length=1, max_length=100, description="The estimate's line items.")


class Material(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name_en: str
    name_es: str
    category: MaterialCategory
    quantity: float | None = Field(description="From line quantities or stated amounts; else null.")
    unit: str | None
    specifications: list[str] = Field(description="Ratings, sizes, materials exactly as known.")
    for_refs: list[int] = Field(description="refs of the line items this material is for.")
    search_query: str = Field(description="Brand-neutral product terms a store search would match.")
    evidence: Literal["stated", "inferred"]
    note_en: str = Field(description="Short note, e.g. assumption made; empty if none.")


class MaterialsList(BaseModel):
    model_config = ConfigDict(extra="forbid")
    materials: list[Material]
    assumptions: list[str]
    questions: list[str]


class MaterialsResponse(BaseModel):
    version: Literal[1] = 1
    materials_list: MaterialsList
    pricing_status: Literal["not_priced"] = "not_priced"
    note: str = "AI draft. Confirm quantities and specs before buying."


class PriceTaskInput(BaseModel):
    """A work item to price (typically a task from /v1/interpret, possibly edited by the contractor)."""
    model_config = ConfigDict(extra="ignore")
    # Optional with a default: clients may omit null keys (the iOS JSON encoder does).
    task_code: TaskCode | None = None
    description_en: str
    description_es: str = ""
    quantity: float | None = Field(default=None, ge=0)
    unit: str | None = None


class PriceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tasks: list[PriceTaskInput] = Field(min_length=1, max_length=100)
    region_code: str | None = Field(default=None, description="Override the business's pricing region.")
    ai_ballpark: bool = Field(default=False, description=(
        "For lines with no contractor or reference price, let the AI estimate cost inputs (labor hours, local labor "
        "rate, material cost). Code computes the price with the business's markup and labels it preliminary."))


class BallparkLine(BaseModel):
    """A line with no price, sent to the model for a cost-input estimate."""
    ref: int
    task_code: str | None
    description_en: str
    unit: str | None


class BallparkItem(BaseModel):
    """Cost INPUTS for one unit of a line. The model never returns a price; code builds one from these."""
    model_config = ConfigDict(extra="forbid")
    ref: int
    labor_hours_per_unit: float = Field(description="Typical crew hours for ONE unit of the line's unit.")
    labor_rate_per_hour: float = Field(description="Typical hourly labor cost for this trade in the region, "
                                                   "wage plus payroll burden, before overhead and profit.")
    material_cost_per_unit: float = Field(description="Typical contractor cost of materials for one unit, before markup; 0 if none.")
    equipment_cost_per_unit: float = Field(description="Rental/equipment cost for one unit; usually 0.")
    basis_en: str = Field(description="Very short assumption, e.g. '~8 h for 2 people; 200A panel ~$450'.")


class Ballpark(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[BallparkItem]


class PricedLine(BaseModel):
    task_code: str | None
    description_en: str
    description_es: str
    quantity: Decimal | None
    unit: str | None
    unit_price: Decimal | None
    line_total: Decimal | None
    price_source: Literal["contractor", "reference", "ai_estimate", "none"]
    basis: Literal["contractor_price", "cost_build_up", "benchmark_bid", "ai_ballpark", "none"]
    preliminary: bool
    confidence: str
    source_name: str | None
    applies_to: str | None = Field(description="What the reference price covers, e.g. '100A two-pole breaker'.")
    note: str | None
    needs: list[Literal["price", "quantity"]] = Field(description="What the contractor must fill in.")


class PriceResponse(BaseModel):
    region_code: str
    overhead_pct: Decimal
    profit_pct: Decimal
    lines: list[PricedLine]
    subtotal: Decimal = Field(description="Sum of lines that have both a quantity and a price. Tax is added by the app.")
    priced_lines: int
    unpriced_lines: int
    preliminary: bool
    disclaimer: str


class PriceBookEntry(BaseModel):
    task_code: str
    trade: str
    title_en: str
    title_es: str
    unit: str
    your_price: Decimal | None
    reference_price: Decimal | None
    reference_source: str | None
    reference_applies_to: str | None
    reference_preliminary: bool


class PriceBookResponse(BaseModel):
    region_code: str
    overhead_pct: Decimal
    profit_pct: Decimal
    entries: list[PriceBookEntry]


ToolCategory = Literal["power_tool", "hand_tool", "cutting", "measuring", "tester", "ladder", "plumbing_tool",
                       "safety", "storage", "other"]


class ToolsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    images: list[ImageInput] = Field(min_length=1, max_length=10, description="Photos of tools (several per photo is fine).")
    language: Language | None = None


class IdentifiedTool(BaseModel):
    model_config = ConfigDict(extra="forbid")
    photo_index: int = Field(description="0-based index of the photo the tool is in.")
    name_en: str = Field(description="Plain name, e.g. 'Cordless drill', 'Fish tape', '6 ft step ladder'.")
    name_es: str
    brand: str | None = Field(description="Only if clearly visible; else null.")
    model: str | None = Field(description="Only if clearly readable; else null.")
    serial_number: str | None = Field(description="Only if clearly readable on a label; else null. Never guess.")
    category: ToolCategory
    quantity: int = Field(description="How many identical units are visible.")
    note_en: str = Field(description="Short note if unsure (e.g. 'could be an impact driver'); empty if none.")


class ToolsList(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tools: list[IdentifiedTool]


class ToolsResponse(BaseModel):
    version: Literal[1] = 1
    result: ToolsList
    note: str = "AI draft. Check names before saving. Serial numbers are only filled when readable."


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
