# CLAUDE.md

## Repository Structure

This is a multi-component fitness coaching application called "trainaa" with the following structure:
- **`src/backend/`**: Python FastAPI backend with AI agent system
- **`src/app/`**: React Native (Expo) mobile application
- **`src/landing/`**: SvelteKit landing page/web frontend
- **`src/supabase/`**: Database migrations and configuration

## Development Commands

### Backend (Python/FastAPI)
The backend uses UV for Python package management. All dependencies are managed in `src/backend/pyproject.toml`.

```bash
# Using the dev.sh script from repository root:
./dev.sh serve          # Start FastAPI server
./dev.sh install        # Install/sync dependencies
./dev.sh test           # Run tests
./dev.sh add <package>  # Add new dependency

# Or directly from src/backend:
cd src/backend
uv run python3 -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000 --log-config logging_config.yaml
uv sync                 # Sync dependencies
uv add <package>        # Add new package
```

### Mobile App (React Native/Expo)
```bash
cd src/app
bun start              # Start Expo development server
bun run android        # Start Android emulator
bun run ios           # Start iOS simulator
bun run web           # Start web version
bun run lint          # Run linting
```

### Landing Page (SvelteKit)
```bash
cd src/landing
bun run dev           # Start development server
bun run build         # Build for production
bun run check         # Type checking
bun run lint          # Run linting and formatting
bun run format        # Format code with Prettier
```

## Architecture Overview

### Backend Agent System
The backend features a sophisticated AI agent system built with LangChain:

- **Main Agent** (`src/backend/agent/main_agent.py`): Central orchestrator that routes requests to specialized sub-agents
- **Specialized Agents**:
  - **Query Agent**: Handles data analysis and fitness metrics queries
  - **Trainer Agent**: Provides AI coaching and training plan generation
  - **Workout Management Agent**: Manages structured workouts and training schedules
- **Agent Personas** (`src/backend/agent/personas.py`): Different coaching personalities (Simon, Isabella, David, Julian)
- **Tools** (`src/backend/agent/tools/`): Custom tools for fitness data processing, FIT file parsing, and external API integrations

### FastAPI Backend Structure
- **Main Entry Point**: `src/backend/fastapi/main.py` - FastAPI app with comprehensive API documentation
- **API Prefix**: All endpoints are prefixed with `/v1`
- **Key Router Modules**:
  - `chat_router`: WebSocket chat and thread management (`/ws/`, `/chat/threads/`)
  - `strava_auth_router` & `strava_api_router`: Strava OAuth and API integration (`/strava/`)
  - `activities_router`: Unified activity management (`/activities/`)
  - `ai_tools_router`: AI coaching tools (`/ai-tools/`)
  - `training_status_router`: Training status tracking (`/training-status/`)
  - `user_infos_router`: User profile management (`/user-attributes/`)

### Data Integration
- **Multi-Provider Support**: Strava, Garmin (planned) for activity synchronization
- **FIT File Processing**: Direct upload and parsing of fitness device files
- **Database**: Supabase/PostgreSQL with comprehensive activity and user data models

### Frontend Applications
- **Mobile App**: React Native with Expo, using native UI components and fitness tracking features
- **Landing Page**: SvelteKit with modern web technologies and responsive design
- **Shared Features**: Both frontends integrate with the same FastAPI backend for consistent functionality

## Key Dependencies

### Backend
- **FastAPI**: Web framework with automatic API documentation
- **LangChain**: AI agent framework with Anthropic Claude integration
- **Supabase**: Database and authentication
- **pytest**: Testing framework
- **uv**: Fast Python package manager (replaces pip/poetry)

### Mobile App
- **Expo**: React Native development platform
- **@rn-primitives**: UI component library
- **React Query**: Data fetching and caching
- **Supabase**: Backend integration

### Landing Page
- **SvelteKit**: Full-stack web framework
- **TailwindCSS**: Utility-first CSS framework
- **bits-ui**: Svelte component library

## Environment Setup

1. Copy `.env.example` to `.env` and configure required variables
2. Backend: Run `./dev.sh install` from repository root (or `cd src/backend && uv sync`)
3. Mobile: Run `cd src/app && bun install`
4. Landing: Run `cd src/landing && bun install`

## Development Workflow

When working on this codebase:
1. Use the `./dev.sh` script for all backend operations from the repository root
2. Backend dependencies are managed via UV in `src/backend/pyproject.toml`
3. The `python_fit_tool` package is included as a local path dependency
4. The FastAPI server runs on port 8000 with auto-reload enabled
5. Mobile app uses Expo for hot reloading and easy device testing
6. All components share the same backend API for consistency
7. Test changes across both mobile and web frontends when modifying backend APIs

## Documentation

- FastAPI docs available at `/docs` when server is running
- Additional documentation in `/docs/` directory
- MkDocs configuration in `mkdocs.yml` for documentation site



## App Development Notes
- Do not use emojis in design
- Keep the design minimalistic and clean and in line with the existing pages
- Always keep dark and light mode in mind
- Every text should be localizable
