"""Settings from environment variables (backend/.env in development). Secrets never leave the server."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


def load_env_file(path: Path = ENV_FILE) -> None:
    """Minimal .env loader: KEY=value lines; real environment variables take precedence."""
    if not path.exists():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


@dataclass(frozen=True)
class Settings:
    openai_api_key: str
    supabase_url: str
    supabase_service_key: str
    openai_model: str = "gpt-6-luna"
    openai_transcribe_model: str = "gpt-transcribe"
    max_description_chars: int = 10_000
    max_audio_bytes: int = 25 * 1024 * 1024
    max_images: int = 6
    max_image_bytes: int = 2 * 1024 * 1024
    ai_requests_per_hour: int = 60

    @classmethod
    def from_env(cls) -> "Settings":
        load_env_file()
        missing = [k for k in ("OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY") if not os.environ.get(k)]
        if missing:
            raise RuntimeError(f"Missing environment variables: {', '.join(missing)}")
        return cls(
            openai_api_key=os.environ["OPENAI_API_KEY"],
            supabase_url=os.environ["SUPABASE_URL"].rstrip("/"),
            supabase_service_key=os.environ["SUPABASE_SERVICE_ROLE_KEY"],
            openai_model=os.environ.get("OPENAI_MODEL") or cls.openai_model,
            openai_transcribe_model=os.environ.get("OPENAI_TRANSCRIBE_MODEL") or cls.openai_transcribe_model,
        )
