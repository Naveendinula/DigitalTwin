import os
from pathlib import Path

# Base directory is the directory containing this file (backend/)
BASE_DIR = Path(__file__).resolve().parent

# Data Directories
UPLOAD_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "output"

# Database Paths
EC_DB_PATH = BASE_DIR / "prac-database.csv"
DB_PATH = Path(os.getenv("DB_PATH", str(BASE_DIR / "maintenance.db")))

# Environment
APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
IS_DEV_ENV = APP_ENV in {"dev", "development", "local", "test"}

# Auth / JWT configuration
DEFAULT_SECRET_KEY = "dev-secret-change-me-in-production-please-use-a-strong-random-key"
SECRET_KEY = os.getenv(
    "SECRET_KEY",
    DEFAULT_SECRET_KEY,
)
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
CMMS_CREDENTIALS_KEY = os.getenv("CMMS_CREDENTIALS_KEY", SECRET_KEY)
CMMS_WEBHOOK_SHARED_SECRET = os.getenv(
    "CMMS_WEBHOOK_SHARED_SECRET",
    "dev-cmms-webhook-secret-change-me",
)

# Cookie configuration
ACCESS_COOKIE_NAME = os.getenv("ACCESS_COOKIE_NAME", "access_token")
REFRESH_COOKIE_NAME = os.getenv("REFRESH_COOKIE_NAME", "refresh_token")
CSRF_COOKIE_NAME = os.getenv("CSRF_COOKIE_NAME", "csrf_token")
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax")
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").strip().lower() == "true"

# Upload limits
MAX_IFC_UPLOAD_MB = int(os.getenv("MAX_IFC_UPLOAD_MB", "500"))
MAX_FM_SIDECAR_UPLOAD_MB = int(os.getenv("MAX_FM_SIDECAR_UPLOAD_MB", "20"))
MAX_IFC_UPLOAD_BYTES = MAX_IFC_UPLOAD_MB * 1024 * 1024
MAX_FM_SIDECAR_UPLOAD_BYTES = MAX_FM_SIDECAR_UPLOAD_MB * 1024 * 1024


def _parse_origins(raw: str) -> list[str]:
    values = [value.strip() for value in raw.split(",")]
    return [value for value in values if value]


FRONTEND_ORIGINS = _parse_origins(
    os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000",
    )
)

if not IS_DEV_ENV and SECRET_KEY == DEFAULT_SECRET_KEY:
    raise RuntimeError("Insecure configuration: set SECRET_KEY for non-development environments.")

if not IS_DEV_ENV and not COOKIE_SECURE:
    raise RuntimeError("Insecure configuration: COOKIE_SECURE must be true outside development.")

if "*" in FRONTEND_ORIGINS:
    raise RuntimeError("Insecure CORS configuration: wildcard origins are not allowed.")

# LLM / OpenRouter
OPENROUTER_API_KEY = os.getenv(
    "OPENROUTER_API_KEY",
    "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",
)
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "stepfun/step-3.5-flash:free")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions"

# Ensure directories exist
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
