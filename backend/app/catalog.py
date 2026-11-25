"""Shared task catalog the AI maps work onto. Extends the team's seed (database/seed/001_original_tasks.sql).
Adding a trade means adding rows here (later: the trade_tasks table), not code."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CatalogTask:
    code: str
    trade: str
    title_en: str
    title_es: str
    unit: str
    guidance: str = ""


CATALOG: tuple[CatalogTask, ...] = (
    CatalogTask("ELEC.PANEL.UPGRADE", "electrical", "Electrical panel / service upgrade",
                "Actualización de panel / servicio eléctrico", "job",
                "Replacing the main panel/service. Put old and new amperage in specifications."),
    CatalogTask("ELEC.CIRCUIT.TRANSFER", "electrical", "Transfer existing branch circuit to new panel",
                "Transferir circuito existente a panel nuevo", "each",
                "Existing circuits moved/reconnected to a new panel, including onto new breakers. Quantity = number of existing circuits."),
    CatalogTask("ELEC.CIRCUIT.NEW", "electrical", "New branch circuit (breaker + wiring)",
                "Circuito nuevo (breaker y cableado)", "each",
                "A new circuit INCLUDES its breaker; do not also list ELEC.BREAKER.ONLY for it."),
    CatalogTask("ELEC.WIRE.RUN", "electrical", "Wire run", "Tendido de cable", "linear ft",
                "Length of cable/conduit run for a circuit, in feet."),
    CatalogTask("ELEC.EV.CHARGER.INSTALL", "electrical", "Install EV charger", "Instalar cargador de vehículo eléctrico",
                "each", "Mounting and connecting the charging unit. Charger current is not the breaker rating."),
    CatalogTask("ELEC.BREAKER.ONLY", "electrical", "Install breaker only (no new wiring)",
                "Instalar únicamente breaker (sin cableado nuevo)", "each",
                "Breaker installed now with no circuit, e.g. reserved for future work."),
    CatalogTask("ELEC.BREAKER.REPLACE", "electrical", "Replace damaged breaker", "Reemplazar breaker dañado", "each"),
    CatalogTask("ELEC.GFCI", "electrical", "Install GFCI receptacle", "Instalar tomacorriente GFCI", "each"),
    CatalogTask("ELEC.RECESSED.LIGHT", "electrical", "Install recessed ceiling light", "Instalar luz empotrada de techo", "each"),
    CatalogTask("ELEC.PERMIT", "electrical", "Electrical permit allowance", "Permiso eléctrico", "job"),
    CatalogTask("PLUMB.FAUCET.REPLACE", "plumbing", "Replace existing faucet", "Reemplazar grifo existente", "each"),
    CatalogTask("PAINT.INTERIOR.SF", "painting", "Interior painting", "Pintura interior", "sq ft"),
    CatalogTask("CONCRETE.SLAB.CY", "concrete", "Place concrete slab", "Colocar losa de concreto", "cu yd"),
    CatalogTask("HANDY.GENERAL.HR", "handyman", "General handyman labor", "Trabajos varios por hora", "hr"),
    CatalogTask("REMODEL.BATH.JOB", "remodel", "Bathroom renovation scope review", "Revisión de remodelación de baño", "job",
                "Use only as a placeholder; prefer listing individual tasks."),
    CatalogTask("CLEAN.RESIDENTIAL.SF", "cleaning", "Residential cleaning area", "Área de limpieza residencial", "sq ft"),
)

CODES: tuple[str, ...] = tuple(t.code for t in CATALOG)
BY_CODE: dict[str, CatalogTask] = {t.code: t for t in CATALOG}


def catalog_for_prompt() -> str:
    lines = [f"- {t.code} | {t.title_en} | unit: {t.unit}" + (f" | {t.guidance}" if t.guidance else "") for t in CATALOG]
    return "\n".join(lines)
