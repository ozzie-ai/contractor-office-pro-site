"""Small, deterministic speech fast path for unambiguous outlet-only jobs.

This is a narrow correctness guard, not the general trade interpreter. Anything
outside the recognized grammar falls back to the AI interpreter.
"""
from __future__ import annotations

import re
import unicodedata

from .interpret import Interpretation, InterpretedTask

NUMBER_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "un": 1, "uno": 1, "una": 1, "dos": 2, "tres": 3,
    "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7,
    "ocho": 8, "nueve": 9, "diez": 10,
}

NUMBER = r"(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)"
OUTLETS = r"(?:outlets?|receptacles?|tomacorrientes?|enchufes?|contactos?)"


def ascii_lower(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", value.lower()) if not unicodedata.combining(c))


def amount(raw: str) -> int | None:
    if raw.isdigit():
        return int(raw)
    return NUMBER_WORDS.get(raw)


def unique_count(matches: list[re.Match[str]]) -> int | None:
    values = {amount(match.group(1)) for match in matches}
    if None in values or len(values) != 1:
        return None
    return values.pop()


def parse_outlet_job(description: str) -> Interpretation | None:
    text = ascii_lower(description)
    # Do not consume mixed jobs, upgrades, panel work, or ambiguous future scopes.
    if re.search(r"\b(panel|breaker|circuit|circuito|cargador|charger|evse|shower|bathroom|cocina|kitchen|feeder|subpanel)\b", text):
        return None
    if not re.search(r"\b(replace|change|swap|replacing|reemplazar|reemplazamos|cambiar|cambiaremos|cambiando)\b", text):
        return None
    if not re.search(OUTLETS, text) or not re.search(r"\bgfci(?:s)?\b", text):
        return None
    if re.search(r"\b(add|adding|agregar|adicionales|additional|plus|mas)\b", text):
        return None

    # "five outlets, two GFCI" means five total with two GFCI.
    total_matches = list(re.finditer(rf"\b{NUMBER}\s+(?:existing\s+|old\s+|viejos?\s+)?{OUTLETS}\b", text))
    standard_matches = list(re.finditer(rf"\b{NUMBER}\s+(?:standard|regular|normal(?:es)?|comunes?)\s+{OUTLETS}\b", text))
    gfci_matches = list(re.finditer(rf"\b{NUMBER}\s+(?:are\s+|son\s+|of\s+them\s+are\s+)?gfci(?:s)?\b", text))
    # Also allow "two GFCI outlets" / "dos tomacorrientes GFCI"
    gfci_matches += list(re.finditer(rf"\b{NUMBER}\s+gfci(?:s)?\s+{OUTLETS}\b", text))
    gfci_matches += list(re.finditer(rf"\b{NUMBER}\s+{OUTLETS}\s+gfci(?:s)?\b", text))

    # A match for a GFCI-specific outlet must NOT count as total outlets.
    total_matches = [match for match in total_matches
                     if not re.match(r"\s+gfci", text[match.end():match.end() + 10])]
    total = unique_count(total_matches) if total_matches else None
    standard = unique_count(standard_matches) if standard_matches else None
    gfci = unique_count(gfci_matches) if gfci_matches else None
    if gfci is None or gfci < 1 or gfci > 100:
        return None
    if standard is not None and not (0 < standard <= 100):
        return None
    if standard is not None and total is not None:
        if standard + gfci != total:
            return None
    elif total is not None:
        standard = total - gfci
    elif standard is not None:
        total = standard + gfci
    else:
        return None
    if standard is None or standard < 0 or total is None or total > 100:
        return None

    tasks: list[InterpretedTask] = []
    if standard:
        tasks.append(InterpretedTask(
            category="electrical", description_en="Replace standard receptacles",
            description_es="Reemplazar tomacorrientes estándar", quantity=standard,
            unit="each", specifications=["Existing outlets; wiring condition to verify"],
            status="included_now", task_code=None,
        ))
    tasks.append(InterpretedTask(
        category="electrical", description_en="Replace GFCI receptacles",
        description_es="Reemplazar tomacorrientes GFCI", quantity=gfci,
        unit="each", specifications=["Confirm circuit compatibility and protection"],
        status="included_now", task_code=None,
    ))
    return Interpretation(
        trade="electrical",
        project_summary_en=f"Replace {total} receptacles: {standard} standard and {gfci} GFCI.",
        project_summary_es=f"Reemplazar {total} tomacorrientes: {standard} estandar y {gfci} GFCI.",
        tasks=tasks, excluded_work=[], future_work=[],
        unknown_details=["Confirm existing wiring, box/plate conditions, and any required permits."],
        confidence_notes=["Quantities explicitly described; materials and labor are not priced."],
    )
