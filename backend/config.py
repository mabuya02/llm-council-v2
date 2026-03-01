"""Configuration for the LLM Council."""

import logging
import os

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

DEFAULT_OLLAMA_LOCAL_BASE_URL = "http://localhost:11434"
DEFAULT_OLLAMA_CLOUD_API_URL = "https://ollama.com/api/chat"
VALID_OLLAMA_MODES = {"local", "cloud"}


def _normalize_ollama_mode(raw_mode: str) -> str:
    """Validate ollama mode with a safe local default."""
    mode = (raw_mode or "local").strip().lower()
    if mode not in VALID_OLLAMA_MODES:
        logger.warning("Unknown OLLAMA_MODE=%r. Falling back to 'local'.", raw_mode)
        return "local"
    return mode


def _normalize_ollama_local_base_url(raw_url: str) -> str:
    """Accept base URL or endpoint URL and normalize to local Ollama base URL."""
    normalized = (raw_url or DEFAULT_OLLAMA_LOCAL_BASE_URL).strip().rstrip("/")
    for suffix in ("/api/generate", "/api/chat"):
        if normalized.endswith(suffix):
            return normalized[:-len(suffix)]
    return normalized


OLLAMA_MODE = _normalize_ollama_mode(os.getenv("OLLAMA_MODE", "local"))

OLLAMA_LOCAL_BASE_URL = _normalize_ollama_local_base_url(
    os.getenv("OLLAMA_API_URL", DEFAULT_OLLAMA_LOCAL_BASE_URL)
)
OLLAMA_LOCAL_CHAT_URL = f"{OLLAMA_LOCAL_BASE_URL}/api/chat"
OLLAMA_LOCAL_GENERATE_URL = f"{OLLAMA_LOCAL_BASE_URL}/api/generate"

OLLAMA_CLOUD_API_URL = os.getenv("OLLAMA_CLOUD_API_URL", DEFAULT_OLLAMA_CLOUD_API_URL).strip()
OLLAMA_CLOUD_API_KEY = os.getenv("OLLAMA_CLOUD_API_KEY", "").strip()

_models_from_env = [m.strip() for m in os.getenv("COUNCIL_MODELS", "").split(",") if m.strip()]
COUNCIL_MODELS = _models_from_env or [
    "llama3.2:3b",
    "llama3.1:8b",
]

CHAIRMAN_MODEL = os.getenv("CHAIRMAN_MODEL", COUNCIL_MODELS[0])
TITLE_MODEL = os.getenv("TITLE_MODEL", CHAIRMAN_MODEL)

# Data directory for conversation storage
# On Vercel, the project filesystem is read-only; use /tmp for ephemeral storage.
_default_data_dir = "/tmp/data/conversations" if os.getenv("VERCEL") else "data/conversations"
DATA_DIR = os.getenv("DATA_DIR", _default_data_dir)

# CORS allowed origins (comma-separated)
# On Vercel, allow the deployment URLs by default
_default_cors = "http://localhost:5173,http://localhost:3000"
if os.getenv("VERCEL_URL"):
    _default_cors += f",https://{os.getenv('VERCEL_URL')}"
_cors_raw = os.getenv("CORS_ORIGINS", _default_cors)
CORS_ORIGINS = [o.strip() for o in _cors_raw.split(",") if o.strip()]

# LLM provider (kept for future expansion; only "ollama" supported today)
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "ollama").strip().lower()

# Retry configuration for model queries
MODEL_QUERY_MAX_RETRIES = int(os.getenv("MODEL_QUERY_MAX_RETRIES", "1"))
