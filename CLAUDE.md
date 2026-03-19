# CLAUDE.md

Monorepo with 4 components. See [ARCHITECTURE.md](ARCHITECTURE.md) for full details.

## Commands

```bash
# Backend (from repo root, uses UV + Python 3.12)
./dev.sh serve                # FastAPI on :8000
./dev.sh test [args]          # pytest
./dev.sh lint                 # ruff check
./dev.sh format               # ruff format
./dev.sh bump <version>       # Sync version across all components

# Mobile app (uses bun, not npm/yarn)
cd src/app && bun start       # Expo dev server
cd src/app && bun run lint

# Landing page (uses bun)
cd src/landing && bun run dev
cd src/landing && bun run check && bun run lint
```

## Code Style & Conventions

- Backend linting: ruff (configured in `pyproject.toml`)
- Mobile/Landing linting: eslint + prettier
- All API endpoints prefixed with `/v1`
- Database migrations in `src/supabase/migrations/`
- Version source of truth: `version.config.json` (use `./dev.sh bump` to update)

## Design Rules

- No emojis in UI
- Minimalistic, clean design consistent with existing pages
- Always support both dark and light mode
- All user-facing text must use the i18n system (`react-i18next` in app, `svelte-i18n` in landing)
- Keep docs (`docs/` + `ARCHITECTURE.md`) updated when changing architecture
