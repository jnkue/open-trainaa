#!/bin/bash

# Development helper script for TRAINAA backend
# This script provides convenient commands for local development

set -e  # Exit on error

BACKEND_DIR="src/backend"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper function for colored output
log_info() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

# Change to backend directory
cd "$BACKEND_DIR" || {
    log_error "Failed to change to $BACKEND_DIR directory"
    exit 1
}

case "$1" in
    serve)
        log_info "Starting FastAPI server (API only, scheduler disabled)..."
        RUN_SCHEDULER=false uv run python3 -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000 --log-config logging_config.yaml
        ;;

    serve-with-scheduler)
        log_info "Starting FastAPI server with scheduler enabled..."
        RUN_SCHEDULER=true uv run python3 -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000 --log-config logging_config.yaml
        ;;

    scheduler)
        log_info "Starting scheduler service only..."
        RUN_SCHEDULER=true uv run python3 -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8001 --log-config logging_config.yaml
        ;;

    install)
        log_info "Installing/syncing dependencies..."
        uv sync
        ;;

    add)
        if [ -z "$2" ]; then
            log_error "Please specify a package to add"
            echo "Usage: ./dev.sh add <package>"
            exit 1
        fi
        log_info "Adding package: $2"
        uv add "$2"
        ;;

    test)
        log_info "Running tests..."
        uv run pytest "${@:2}"
        ;;

    lint)
        log_info "Running linter..."
        uv run ruff check .
        ;;

    format)
        log_info "Formatting code..."
        uv run ruff format .
        ;;

    docker-build)
        log_info "Building Docker image..."
        cd ../..
        docker build -f src/backend/Dockerfile -t trainaabackend:latest .
        ;;

    docker-dev)
        log_info "Starting development Docker Compose services..."
        docker-compose -f docker-compose.development.yml up "${@:2}"
        ;;

    docker-staging)
        log_info "Starting staging Docker Compose services..."
        docker-compose -f docker-compose.staging.yml up "${@:2}"
        ;;

    docker-prod)
        log_info "Starting production Docker Compose services..."
        docker-compose -f docker-compose.production.yml up "${@:2}"
        ;;

    shell)
        log_info "Starting Python shell with project context..."
        uv run python3
        ;;

    bump)
        cd ../..  # Back to repo root
        if [ -z "$2" ]; then
            log_error "Please specify a version"
            echo "Usage: ./dev.sh bump <version> [--min-supported <min-version>]"
            exit 1
        fi
        log_info "Bumping version to $2..."
        ./scripts/bump-version.sh "${@:2}"
        ;;

    *)
        echo "TRAINAA Backend Development Helper"
        echo ""
        echo "Usage: ./dev.sh <command> [options]"
        echo ""
        echo "Commands:"
        echo "  serve                  Start FastAPI server (scheduler disabled)"
        echo "  serve-with-scheduler   Start FastAPI server with scheduler enabled"
        echo "  scheduler             Start scheduler service only (on port 8001)"
        echo "  install               Install/sync dependencies"
        echo "  add <package>         Add new dependency"
        echo "  test [args]           Run tests (with optional pytest args)"
        echo "  lint                  Run linter"
        echo "  format                Format code"
        echo "  docker-build          Build Docker image"
        echo "  docker-dev [args]     Start development Docker Compose"
        echo "  docker-staging [args] Start staging Docker Compose"
        echo "  docker-prod [args]    Start production Docker Compose"
        echo "  shell                 Start Python shell"
        echo "  bump <version>        Bump version across all components"
        echo ""
        echo "Examples:"
        echo "  ./dev.sh serve                    # Start API server without scheduler"
        echo "  ./dev.sh serve-with-scheduler     # Start API server with scheduler"
        echo "  ./dev.sh scheduler                # Start scheduler service only"
        echo "  ./dev.sh install                  # Install dependencies"
        echo "  ./dev.sh add httpx                # Add httpx package"
        echo "  ./dev.sh test                     # Run all tests"
        echo "  ./dev.sh test tests/test_api.py   # Run specific test file"
        echo "  ./dev.sh docker-dev -d            # Start dev services in background"
        echo "  ./dev.sh bump 1.0.4               # Bump all versions to 1.0.4"
        echo "  ./dev.sh bump 1.0.4 --min-supported 1.0.1  # Also update min supported"
        echo ""
        exit 1
        ;;
esac
