import asyncio

from app.quick_electrical import parse_outlet_job
from app.interpret import interpret_description


def counts(sentence):
    job = parse_outlet_job(sentence)
    assert job is not None
    return [task.quantity for task in job.tasks]


def test_five_including_two_gfci_english():
    assert counts("Replace five outlets, two are GFCI") == [3, 2]
    assert counts("Change 5 outlets, 2 GFCI") == [3, 2]


def test_five_including_two_gfci_spanish():
    assert counts("Cambiar cinco tomacorrientes, dos son GFCI") == [3, 2]
    assert counts("Reemplazar 5 tomacorrientes, 2 GFCI") == [3, 2]


def test_five_explicit_standard_plus_two_gfci_not_seven_inferred():
    assert counts("Replace five outlets, three standard outlets and two GFCI") == [3, 2]


def test_explicit_standard_plus_additional_gfci_never_subtracted():
    assert parse_outlet_job("Replace five standard outlets plus two GFCI") is None
    assert parse_outlet_job("Replace five outlets and add two more GFCI") is None


def test_mixed_panel_and_ev_defers_to_general_interpreter():
    assert parse_outlet_job("Replace five outlets, two GFCI, and upgrade panel from 100 to 200A") is None


def test_incomplete_gfci_count_does_not_invent_quantities():
    assert parse_outlet_job("Replace five outlets including some GFCI") is None
    assert parse_outlet_job("Replace five outlets") is None


def test_no_unverified_material_or_labor_prices_in_interpretation():
    job = parse_outlet_job("Replace five outlets, two are GFCI")
    assert job is not None and len(job.tasks) == 2
    assert job.unknown_details
    assert all("cost" not in task.model_dump() for task in job.tasks)


def test_quick_interpretation_works_without_ai_secrets(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    response = asyncio.run(interpret_description("Replace five outlets, two are GFCI"))
    assert [task.quantity for task in response.interpretation.tasks] == [3, 2]
    assert response.pricing_status == "not_priced"
