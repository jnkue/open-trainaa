import logging
import os
import sys
from logging.handlers import RotatingFileHandler

# Get environment and set appropriate log level
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
LOG_LEVEL = os.getenv("LOG_LEVEL", "DEBUG" if ENVIRONMENT == "development" else "INFO")

# Create logs directory
LOG_DIR = os.getenv("LOG_DIR", "logs")
os.makedirs(LOG_DIR, exist_ok=True)

# Configure logging format - structured for production, readable for development
if ENVIRONMENT == "development":
    LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

else:
    LOG_FORMAT = (
        "%(asctime)s | %(name)s | %(levelname)s | %(message)s | %(pathname)s:%(lineno)d"
    )

# Create formatters
formatter = logging.Formatter(LOG_FORMAT, datefmt="%Y-%m-%d %H:%M:%S")

# File handler with appropriate rotation (100MB files, keep 10 backups)
file_handler = RotatingFileHandler(
    os.path.join(LOG_DIR, "pacer-fastapi.log"),
    maxBytes=100 * 1024 * 1024,  # 100MB
    backupCount=10,
    encoding="utf-8",
)
file_handler.setFormatter(formatter)

# Console handler for stdout (important for containerized deployments)
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(formatter)

# Configure root logger
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper()),
    handlers=[file_handler, console_handler],
    format=LOG_FORMAT,
    datefmt="%Y-%m-%d %H:%M:%S",
)

# Create application logger
LOGGER = logging.getLogger("pacer-fastapi")
LOGGER.setLevel(getattr(logging, LOG_LEVEL.upper()))

logging.getLogger("hpack.hpack").setLevel(logging.WARNING)
logging.getLogger("hpack").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)

# Reduce noise from third-party libraries in production
if ENVIRONMENT == "production":
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("asyncio").setLevel(logging.WARNING)

LOGGER.info(
    f"Logging initialized: environment={ENVIRONMENT}, level={LOG_LEVEL}, directory={LOG_DIR}"
)
