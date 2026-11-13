"""Live accuracy check: run the team's speech scenarios through the real model and check the structured result.
Usage: .venv/bin/python -m evals.run_scenarios [--runs 2] [--vision]   (costs a fraction of a cent)"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import struct
import zlib
from pathlib import Path

from app.ai import OpenAIInterpreter
from app.config import Settings
from app.schemas import Interpretation, InterpretRequest

HERE = Path(__file__).parent


def text_of(task) -> str:
    return " ".join([task.description_en, *task.specifications]).lower()


def has_amps(task, amps: int) -> bool:
    return re.search(rf"\b{amps}\s*-?\s*(a\b|amp)", text_of(task)) is not None


def with_code(i: Interpretation, code: str):
    return [t for t in i.tasks if t.task_code == code]


def qty(tasks) -> float | None:
    return sum(t.quantity or 0 for t in tasks) if tasks and all(t.quantity is not None for t in tasks) else None


def forty_amp_circuits(i):
    return [t for t in with_code(i, "ELEC.CIRCUIT.NEW") + with_code(i, "ELEC.BREAKER.ONLY") if has_amps(t, 40)]


def later(i: Interpretation, *words: str) -> bool:
    blob = " ".join(i.future_work + i.excluded_work).lower()
    return any(w in blob for w in words)


def check(case_id: str, i: Interpretation) -> list[str]:
    c: list[tuple[str, bool]] = []
    panel = with_code(i, "ELEC.PANEL.UPGRADE")
    if case_id.startswith(("ELEC", "MIXED")):
        c.append(("one 40A circuit/breaker (counted once)", len(forty_amp_circuits(i)) == 1))
    if case_id == "ELEC-001":
        c += [("wire run 100 ft", qty(with_code(i, "ELEC.WIRE.RUN")) == 100),
              ("2 damaged 20A breakers replaced", qty(with_code(i, "ELEC.BREAKER.REPLACE")) == 2
               and all(has_amps(t, 20) for t in with_code(i, "ELEC.BREAKER.REPLACE"))),
              ("1 GFCI", qty(with_code(i, "ELEC.GFCI")) == 1),
              ("charger not given 40A charging current", not any(has_amps(t, 40) for t in with_code(i, "ELEC.EV.CHARGER.INSTALL")))]
    if case_id == "ELEC-002":
        c += [("charger 32A", any("32" in text_of(t) for t in with_code(i, "ELEC.EV.CHARGER.INSTALL"))),
              ("wire run 80 ft", qty(with_code(i, "ELEC.WIRE.RUN")) == 80),
              ("3 damaged 15A breakers", qty(with_code(i, "ELEC.BREAKER.REPLACE")) == 3)]
    if case_id == "ELEC-003":
        c += [("wire run 100 ft", qty(with_code(i, "ELEC.WIRE.RUN")) == 100),
              ("no invented breaker replacements", not with_code(i, "ELEC.BREAKER.REPLACE")),
              ("1 GFCI", qty(with_code(i, "ELEC.GFCI")) == 1)]
    if case_id in ("PANEL-001", "MIXED-001", "MIXED-002"):
        c += [("panel 100A → 200A", len(panel) == 1 and has_amps(panel[0], 200) and "100" in text_of(panel[0])),
              ("20 circuits transferred", qty(with_code(i, "ELEC.CIRCUIT.TRANSFER")) == 20)]
    if case_id == "PANEL-001":
        c += [("100A breaker only, now", any(has_amps(t, 100) and t.status == "included_now" for t in with_code(i, "ELEC.BREAKER.ONLY"))),
              ("feeder/subpanel is later", later(i, "feeder", "subpanel", "sub-panel", "alimentador")),
              ("no new circuits invented", not with_code(i, "ELEC.CIRCUIT.NEW"))]
    if case_id in ("MIXED-001", "MIXED-002"):
        c.append(("EV wire run ~100 ft", qty(with_code(i, "ELEC.WIRE.RUN")) == 100))
    if case_id == "MIXED-001":
        c.append(("no reserved 100A breaker invented", not any(has_amps(t, 100) for t in with_code(i, "ELEC.BREAKER.ONLY"))))
    if case_id == "MIXED-002":
        c += [("100A breaker reserved now", qty([t for t in with_code(i, "ELEC.BREAKER.ONLY") if has_amps(t, 100)]) == 1),
              ("subpanel is future work", later(i, "subpanel", "sub-panel", "subpanel", "feeder", "alimentador")),
              ("no subpanel install in tasks", not any("subpanel" in text_of(t) and t.task_code != "ELEC.BREAKER.ONLY"
                                                       and t.status == "included_now" for t in i.tasks))]
    return [("PASS " if ok else "FAIL ") + name for name, ok in c]


def tiny_png(rgb=(220, 30, 30), size=64) -> bytes:
    raw = b"".join(b"\x00" + bytes(rgb) * size for _ in range(size))
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)) + \
        chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


async def vision_probe(interpreter: OpenAIInterpreter) -> None:
    import base64
    r = await interpreter._client.responses.create(  # noqa: SLF001 - one-off capability probe
        model=interpreter._model, store=False, max_output_tokens=50,
        input=[{"role": "user", "content": [
            {"type": "input_text", "text": "What single color fills this image? Answer with one word."},
            {"type": "input_image", "detail": "low", "image_url": "data:image/png;base64," + base64.b64encode(tiny_png()).decode()}]}])
    print(f"vision probe ({interpreter._model}): {r.output_text.strip()!r}")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=2)
    parser.add_argument("--vision", action="store_true")
    parser.add_argument("--show", help="print full JSON for this case id")
    args = parser.parse_args()
    interpreter = OpenAIInterpreter(Settings.from_env())
    if args.vision:
        await vision_probe(interpreter)
    cases = json.loads((HERE / "team_scenarios.json").read_text())["cases"]
    total = passed = 0
    for case in cases:
        results = await asyncio.gather(*[interpreter.interpret(InterpretRequest(description=case["voice"], language="es"))
                                         for _ in range(args.runs)])
        for run, interpretation in enumerate(results, 1):
            lines = check(case["id"], interpretation)
            total += len(lines); passed += sum(l.startswith("PASS") for l in lines)
            print(f"\n{case['id']} run {run}: " + ("all pass" if all(l.startswith("PASS") for l in lines) else ""))
            for line in lines:
                if line.startswith("FAIL"):
                    print("   ", line)
            if args.show == case["id"] and run == 1:
                print(interpretation.model_dump_json(indent=2))
    print(f"\n{passed}/{total} checks passed ({args.runs} runs per case)")


if __name__ == "__main__":
    asyncio.run(main())
