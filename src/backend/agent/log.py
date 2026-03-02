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

# Configure logging format
if ENVIRONMENT == "development":
    LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
else:
    LOG_FORMAT = (
        "%(asctime)s | %(name)s | %(levelname)s | %(message)s | %(pathname)s:%(lineno)d"
    )

# Create formatters
formatter = logging.Formatter(LOG_FORMAT, datefmt="%Y-%m-%d %H:%M:%S")

# Get or create agent logger (singleton pattern)
LOGGER = logging.getLogger("pacer-agent")

# Prevent propagation to root logger to avoid duplicate logs
LOGGER.propagate = False

# Only configure if not already configured (prevent duplicate initialization)
if not LOGGER.handlers:
    LOGGER.setLevel(getattr(logging, LOG_LEVEL.upper()))

    # File handler with appropriate rotation (100MB files, keep 10 backups)
    file_handler = RotatingFileHandler(
        os.path.join(LOG_DIR, "pacer-agent.log"),
        maxBytes=100 * 1024 * 1024,  # 100MB
        backupCount=10,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    LOGGER.addHandler(file_handler)

    # Console handler for stdout
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    LOGGER.addHandler(console_handler)

    # Reduce noise from third-party libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.WARNING)
    logging.getLogger("anthropic").setLevel(logging.WARNING)

    LOGGER.info(
        f"Agent logging initialized: environment={ENVIRONMENT}, level={LOG_LEVEL}, directory={LOG_DIR}"
    )
