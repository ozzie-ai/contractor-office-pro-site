"""Narrow deterministic interpretation for clearly counted existing-wiring device swaps.

Mixed electrical jobs with switches cannot use the outlet-only fast path. This
parser returns a complete scope only when each device type/count is explicit.
No monetary price is ever inferred here.
"""
from __future__ import annotations

import re

from .interpret import Interpretation, InterpretedTask
from .quick_electrical import NUMBER, OUTLETS, amount, ascii_lower

SWITCHES = r"(?:switches?|interruptores?|apagadores?)"
STANDARD = r"(?:standard|regular|normales?|regulares?|comunes?)"
GFCI = r"(?:gfcis?|gfis?)"


def _unique(matches: list[re.Match[str]]) -> int | None:
    nums = {amount(m.group(1)) for m in matches}
    if len(nums) != 1 or None in nums:
        return None
    value = nums.pop()
    return value if value is not None and 1 <= value <= 100 else None


def parse_mixed_device_job(description: str) -> Interpretation | None:
    s = ascii_lower(description)
    # Refuse electrical panels, service changes, new circuits and wiring,
    # additions, dimmers or other non-device work. They need a full review.
    if re.search(
        r"\b(?:panel|breaker|subpanel|service|upgrade|circuit(?:s|os)?|"
        r"feeder|rewire|re-wir(?:e|ing)|dimmer|light(?:s|ing)?|lighting|"
        r"fixture|permit|inspection|ceiling|kitchen|bathroom|plumbing|"
        r"adding|additional|plus|agregar|anadir|instalar|install)\b", s
    ):
        return None
    if re.search(r"\b(?:new wiring|new wire|cableado nuevo|cables nuevos|"
                 r"run wiring|cablear)\b", s):
        return None
    if not re.search(r"\b(?:replace|replacing|change|changing|swap|"
                     r"reemplazar|reemplazando|cambiar|cambiando)\b", s):
        return None
    if not re.search(r"\b(?:existing wiring|wiring (?:is )?already "
                     r"(?:in place|exists|there)|wiring ready exists|"
                     r"already wired|cableado existente|cableado ya existe|"
                     r"cables existentes|cableado listo)\b", s):
        return None

    # Separate explicit regular outlets from GFCI. "Five outlets, two GFCI"
    # is handled by the existing outlet-only parser and not by this path.
    switches = list(re.finditer(
        rf"\b{NUMBER}\s+(?:(?:existing|regular|standard)\s+)?{SWITCHES}\b", s
    ))
    regular = list(re.finditer(
        rf"\b{NUMBER}\s+{STANDARD}\s+{OUTLETS}\b", s
    )) + list(re.finditer(
        rf"\b{NUMBER}\s+{OUTLETS}\s+{STANDARD}\b", s
    ))
    gfci = list(re.finditer(
        rf"\b{NUMBER}\s+{GFCI}(?:\s+{OUTLETS})?\b", s
    )) + list(re.finditer(
        rf"\b{NUMBER}\s+{OUTLETS}\s+{GFCI}\b", s
    ))

    switches_qty = _unique(switches) if switches else None
    regular_qty = _unique(regular) if regular else None
    gfci_qty = _unique(gfci) if gfci else None
    if any(v is None for v in (switches_qty, regular_qty, gfci_qty)):
        return None

    # Prevent scope loss: if dictation contains an additional numbered
    # outlet or switch type, this narrow path must not quietly omit it.
    matched = [*switches, *regular, *gfci]
    masked = list(s)
    for m in matched:
        masked[m.start():m.end()] = " " * (m.end() - m.start())
    rest = "".join(masked)
    if re.search(rf"\b{NUMBER}\s+(?:\w+\s+){{0,2}}(?:{OUTLETS}|{SWITCHES})\b", rest):
        return None

    tasks = [
        InterpretedTask(
            category="electrical",
            description_en="Replace standard wall switches",
            description_es="Reemplazar interruptores de pared normales",
            quantity=switches_qty, unit="each", specifications=[
                "Existing wiring to be verified", "Confirm switch type and cover plates"
            ], status="included_now", task_code=None,
        ),
        InterpretedTask(
            category="electrical",
            description_en="Replace standard receptacles",
            description_es="Reemplazar tomacorrientes normales",
            quantity=regular_qty, unit="each", specifications=[
                "Existing wiring to be verified", "Confirm device/box/plate condition"
            ], status="included_now", task_code=None,
        ),
        InterpretedTask(
            category="electrical",
            description_en="Replace GFCI receptacles",
            description_es="Reemplazar tomacorrientes GFCI",
            quantity=gfci_qty, unit="each", specifications=[
                "Existing wiring to be verified", "Confirm circuit and GFCI compatibility"
            ], status="included_now", task_code=None,
        ),
    ]
    total_receptacles = regular_qty + gfci_qty
    return Interpretation(
        trade="electrical",
        project_summary_en=f"Replace {switches_qty} switches and {total_receptacles} receptacles ({regular_qty} standard and {gfci_qty} GFCI).",
        project_summary_es=f"Reemplazar {switches_qty} interruptores y {total_receptacles} tomacorrientes ({regular_qty} normales y {gfci_qty} GFCI).",
        tasks=tasks, excluded_work=["New branch circuits, wiring runs and drywall repairs are not included."],
        future_work=[],
        unknown_details=["Verify existing wiring, switch/device ratings, boxes, plates and permit requirements."],
        confidence_notes=["The three device quantities were explicitly dictated; prices were not determined."],
    )
