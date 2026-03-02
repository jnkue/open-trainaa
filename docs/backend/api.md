# Backend API

FastAPI backend with REST and WebSocket endpoints.

## Commands

```bash
./dev.sh serve        # Start server
./dev.sh install      # Install dependencies
./dev.sh test         # Run tests
./dev.sh add <pkg>    # Add package
```



## Project Structure

```text
src/backend/api/
├── main.py           # FastAPI app entry point
├── routers/          # Endpoint routers
├── models/           # Pydantic models
└── services/         # Business logic
```
## Auto-generated API docs

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Design Patterns

- Router-based organization
- Dependency injection
- Pydantic for validation
- Async/await for I/O operations
- Centralized error handling with custom exception handlers
- CORS configured in `main.py` for allowed origins

## Endpoints

All endpoints are prefixed with `/v1`. See interactive docs at `http://localhost:8000/docs` for full reference.

### Chat

- `WS /ws/` - WebSocket chat connection (real-time AI agent interface)
- `GET/POST /chat/threads/` - Thread management

WebSocket implementation in `api/routers/chat_router.py`. JSON messages for chat interactions with the agent system.

### Activities

- `GET /activities/` - List activities
- `POST /activities/upload/` - Upload FIT files
- `GET /activities/{id}` - Activity details

### Strava

- `/strava/auth/` - OAuth flow
- `/strava/webhook/` - Webhook handling
- `/strava/activities/` - Activity sync

### AI Tools

- `/ai-tools/` - Various AI coaching endpoints

### Training Status

- `/training-status/` - Training load and metrics

### User

- `/user-attributes/` - User profile and preferences

## Authentication

Using Supabase for authentication with JWT tokens and session management. Routes require a valid Supabase JWT token in the Authorization header.

## Testing

TODO