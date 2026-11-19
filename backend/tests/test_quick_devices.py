"""No-cost mixed device interpretation must never silently skip work or price it."""
import asyncio

from app.quick_devices import parse_mixed_device_job
from app.interpret import interpret_description


def test_english_existing_wiring_three_device_types_without_openai(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    phrase = "Need to replace two switches, two regular outlets, wiring is already in place, and three GFCIs."
    structured = asyncio.run(interpret_description(phrase))
    tasks = structured.interpretation.tasks
    assert [int(t.quantity) for t in tasks] == [2, 2, 3]
    assert [t.description_en for t in tasks] == [
        "Replace standard wall switches",
        "Replace standard receptacles",
        "Replace GFCI receptacles",
    ]
    assert structured.pricing_status == "not_priced"
    assert all(t.unit == "each" for t in tasks)
    assert all("cost" not in t.model_dump() for t in tasks)
    assert phrase not in structured.interpretation.project_summary_en


def test_spanish_device_word_order():
    phrase = "Cambiar dos switches, dos outlets regulares y tres GFCIs. El cableado ya existe."
    parsed = parse_mixed_device_job(phrase)
    assert parsed is not None
    assert [int(t.quantity) for t in parsed.tasks] == [2, 2, 3]


def test_outlet_only_existing_parser_remains_responsible():
    assert parse_mixed_device_job("Replace five outlets, two GFCI. Existing wiring.") is None


def test_ambiguous_or_extra_work_must_not_be_silently_discarded():
    for speech in [
        "Replace two switches, two regular outlets and GFCIs. Wiring is already in place.",
        "Replace two switches, two regular outlets, three GFCIs and add a ceiling light. Existing wiring.",
        "Replace two switches, two regular outlets and three GFCIs with new wiring.",
        "Replace two switches, two regular outlets, three GFCIs, and five outlets. Existing wiring.",
        "Replace two switches, two regular outlets, three GFCIs and upgrade the electrical panel. Existing wiring.",
        "Install two switches, two regular outlets, three GFCIs. Existing wiring.",
        "Replace two switches, two regular outlets and three GFCIs.",
    ]:
        assert parse_mixed_device_job(speech) is None, speech


def test_duplicate_conflicting_switch_counts_are_rejected():
    speech = "Replace two switches and three switches, two regular outlets and three GFCIs. Existing wiring."
    assert parse_mixed_device_job(speech) is None
