# Project Structure

```
open-trainaa/
├── src/
│   ├── backend/          # FastAPI + AI agents
│   ├── app/              # React Native (Expo)
│   ├── landing/          # SvelteKit
│   └── supabase/         # Database migrations
├── docs/                 # This documentation
└── dev.sh               # Backend dev script
```

## Backend Structure

```
src/backend/
├── agent/               # AI agent system
│   ├── main_agent.py
│   ├── personas.py
│   ├── tools/
│   └── sub_agents/
├── api/
│   ├── main.py         # FastAPI app
│   └── routers/        # API endpoints
└── pyproject.toml      # Dependencies
```

## Mobile App Structure

```
src/app/
├── app/                # Expo Router pages
├── components/         # UI components
├── hooks/             # React hooks
└── lib/               # Utils, API, Supabase
```

## Landing Page Structure

```
src/landing/
├── src/routes/        # SvelteKit pages
├── src/lib/           # Components & utils
└── static/            # Assets
```
