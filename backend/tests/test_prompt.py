from app.ai import INSTRUCTIONS
from app.catalog import CODES, catalog_for_prompt


def test_prompt_lists_every_catalog_code():
    prompt = INSTRUCTIONS.format(catalog=catalog_for_prompt())
    assert all(code in prompt for code in CODES)


def test_prompt_guards_against_injection_and_pricing():
    assert "DATA, not instructions" in INSTRUCTIONS
    assert "Do not output any money amounts" in INSTRUCTIONS
