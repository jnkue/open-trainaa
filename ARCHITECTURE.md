# ARCHITECTURE.md

> Comprehensive architecture reference for the TRAINAA fitness coaching platform.

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [High-Level System Diagram](#2-high-level-system-diagram)
3. [Core Components](#3-core-components)
4. [Data Stores](#4-data-stores)
5. [External Integrations](#5-external-integrations)
6. [Deployment & Infrastructure](#6-deployment--infrastructure)
7. [Security Considerations](#7-security-considerations)
8. [Development & Testing](#8-development--testing)
9. [Future Considerations](#9-future-considerations)
10. [Glossary](#10-glossary)
11. [Project Identification](#11-project-identification)

---

## 1. Project Structure

```
open-trainaa/
├── .github/
│   └── workflows/
│       ├── ci_backend.yml          # Backend lint on PRs
│       ├── ci_frontend.yml         # Frontend lint on PRs
│       ├── deploy_staging.yml      # Deploy to staging on push to main
│       ├── deploy_prod.yml         # Deploy to production + git tag
│       └── deploy_docs.yml         # MkDocs to GitHub Pages
├── docs/                           # MkDocs documentation source
│   ├── backend/
│   │   ├── api.md
│   │   ├── agent-system.md
│   │   ├── integrations.md
│   │   ├── workout-sync.md
│   │   └── docker.md
│   ├── database/
│   │   └── index.md
│   └── frontend/
│       ├── app/index.md
│       └── landing-page/index.md
├── scripts/
│   └── bump-version.sh            # Syncs version across all components
├── src/
│   ├── app/                        # React Native / Expo mobile app
│   │   ├── app/                    # Expo Router screens & layouts
│   │   │   ├── (auth)/             # Login, register, password reset
│   │   │   ├── (tabs)/             # Protected tab navigation
│   │   │   │   ├── activities/     # Activity list & detail
│   │   │   │   ├── calendar/       # Calendar & day detail
│   │   │   │   ├── workouts/       # Workout list, detail, create
│   │   │   │   ├── index.tsx       # Home / training dashboard
│   │   │   │   ├── chat.tsx        # AI coach chat
│   │   │   │   ├── settings.tsx    # App settings
│   │   │   │   ├── connect-strava.tsx
│   │   │   │   ├── connect-garmin.tsx
│   │   │   │   └── connect-wahoo.tsx
│   │   │   └── _layout.tsx         # Root layout with providers
│   │   ├── components/             # UI & feature components
│   │   │   ├── ui/                 # 41 @rn-primitives components
│   │   │   ├── settings/           # Settings section components
│   │   │   ├── training-overview/  # Training dashboard cards
│   │   │   ├── navigation/         # Sidebar (web)
│   │   │   ├── integrations/       # Provider connection UI
│   │   │   ├── ChatInterface.tsx
│   │   │   ├── ActivityMap.tsx
│   │   │   ├── WorkoutBuilder.tsx
│   │   │   ├── FeedbackDialog.tsx
│   │   │   └── ...
│   │   ├── contexts/               # React Context providers
│   │   │   ├── AuthContext.tsx
│   │   │   ├── ThemeContext.tsx
│   │   │   ├── RevenueCatContext.tsx
│   │   │   ├── LanguageContext.tsx
│   │   │   ├── AlertContext.tsx
│   │   │   └── VersionCheckContext.tsx
│   │   ├── hooks/                  # Custom React hooks
│   │   ├── services/               # API client & integration layer
│   │   ├── i18n/                   # Internationalization (en, de, es, fr)
│   │   ├── lib/                    # Colors, theme, storage helpers
│   │   ├── utils/                  # Formatters, parsers, alert utils
│   │   ├── types/                  # TypeScript definitions
│   │   ├── constants/              # App constants & version
│   │   ├── assets/                 # Images, fonts
│   │   ├── android/                # Native Android project
│   │   ├── ios/                    # Native iOS project
│   │   ├── plugins/                # Custom Expo plugins
│   │   ├── app.config.ts           # Expo config
│   │   ├── eas.json                # EAS Build profiles
│   │   ├── package.json
│   │   └── metro.config.js
│   │
│   ├── backend/                    # Python FastAPI backend
│   │   ├── api/                    # FastAPI application
│   │   │   ├── main.py             # App entrypoint, middleware, lifespan
│   │   │   ├── auth.py             # JWT verification via Supabase JWKS
│   │   │   ├── database.py         # Supabase & PostgreSQL config
│   │   │   ├── redis.py            # Redis connection & helpers
│   │   │   ├── version.py          # APP_VERSION, MIN_SUPPORTED_VERSION
│   │   │   ├── routers/
│   │   │   │   ├── activities.py       # Unified activity management
│   │   │   │   ├── chat.py             # WebSocket chat & threads
│   │   │   │   ├── ai_tools.py         # AI-assisted calculations
│   │   │   │   ├── workouts.py         # Workout CRUD & scheduling
│   │   │   │   ├── training_status.py  # Training metrics
│   │   │   │   ├── user_infos.py       # User profile & BYOK keys
│   │   │   │   ├── user_feedback.py    # Session feedback (AI)
│   │   │   │   ├── subscriptions.py    # Subscription tiers
│   │   │   │   ├── invitation_codes.py # Beta invitations
│   │   │   │   ├── push_tokens.py      # Push notification tokens
│   │   │   │   ├── stripe_billing.py   # Stripe checkout/billing
│   │   │   │   ├── revenuecat_webhook.py # In-app purchase hooks
│   │   │   │   ├── strava/             # Strava auth, API, helpers
│   │   │   │   ├── wahoo/              # Wahoo auth, API, webhook
│   │   │   │   └── garmin/             # Garmin auth, API, webhook
│   │   │   ├── services/           # Business logic services
│   │   │   ├── providers/          # External provider abstractions
│   │   │   │   ├── base.py         # Abstract provider interface
│   │   │   │   ├── garmin.py       # Garmin Connect provider
│   │   │   │   └── wahoo.py        # Wahoo provider
│   │   │   ├── models/
│   │   │   │   └── sport_types.py  # 70+ sport type enums, FIT mapping
│   │   │   ├── utils/              # Shared utilities
│   │   │   └── workers/
│   │   │       └── workout_sync_worker.py  # APScheduler background sync
│   │   ├── agent/                  # AI agent system (LangChain/LangGraph)
│   │   │   ├── main_agent.py       # Central orchestrator
│   │   │   ├── query_agent.py      # NL-to-SQL data queries
│   │   │   ├── trainer_agent.py    # Personalized training plans
│   │   │   ├── workout_management_agent.py  # Workout CRUD agent
│   │   │   ├── feedback_agent.py   # Session feedback generation
│   │   │   ├── personas.py         # 4 coaching personalities
│   │   │   ├── system_prompts.py   # Detailed system prompt templates
│   │   │   ├── utils.py            # Stream helpers, LLM init
│   │   │   ├── log.py              # Agent logger
│   │   │   ├── core/
│   │   │   │   ├── singletons.py   # LLM, DB pool, Supabase singletons
│   │   │   │   └── error_handler.py # Typed errors, Sentry integration
│   │   │   ├── tools/
│   │   │   │   ├── tools.py        # 12 @tool-decorated functions
│   │   │   │   └── context_tools.py # Weekly context, athlete overview
│   │   │   └── security/
│   │   │       └── input_validator.py # Prompt injection prevention
│   │   ├── pacer/                  # Workout definition parser
│   │   │   ├── txt_workout_converter.py
│   │   │   └── garmin_workout_converter.py
│   │   ├── python_fit_tool_jnkue/  # Local FIT file parsing library
│   │   ├── tests/                  # Pytest test suite
│   │   ├── Dockerfile
│   │   ├── docker-compose.development.yml
│   │   ├── docker-compose.staging.yml
│   │   ├── docker-compose.production.yml
│   │   ├── traefik.yml             # Traefik reverse proxy config
│   │   ├── pyproject.toml          # UV/Python dependencies
│   │   ├── uv.lock
│   │   └── logging_config.yaml     # Uvicorn log config
│   │
│   ├── landing/                    # SvelteKit landing page
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── +layout.svelte  # Main layout (video bg, nav, footer)
│   │   │   │   ├── +page.svelte    # Hero section with CTAs
│   │   │   │   ├── +page.ts        # SEO metadata
│   │   │   │   ├── contact/        # Contact form (Google Forms)
│   │   │   │   ├── privacy/        # Privacy policy (MD, EN/DE)
│   │   │   │   ├── terms/          # Terms of service (MD, EN/DE)
│   │   │   │   ├── imprint/        # Legal imprint
│   │   │   │   └── assets/         # Assets page
│   │   │   ├── lib/
│   │   │   │   ├── components/
│   │   │   │   │   ├── ui/         # 50+ shadcn-svelte components
│   │   │   │   │   ├── CookieConsentBanner.svelte
│   │   │   │   │   └── Footer.svelte
│   │   │   │   └── i18n/           # 5 languages (en, de, fr, es, it)
│   │   │   └── app.css             # Global styles (OKLch colors)
│   │   ├── static/                 # Videos, images, favicons, manifests
│   │   ├── svelte.config.js        # Cloudflare adapter
│   │   ├── tailwind.config.ts
│   │   ├── wrangler.toml           # Cloudflare Workers config
│   │   └── package.json
│   │
│   └── supabase/                   # Database & auth configuration
│       ├── config.toml             # Supabase local dev config
│       └── migrations/             # 47 SQL migration files
│
├── dev.sh                          # Backend dev convenience script
├── version.config.json             # Central version source (1.1.0)
├── mkdocs.yml                      # Documentation site config
├── CLAUDE.md                       # AI coding assistant instructions
├── CONTRIBUTING.md
├── CHANGELOG.md
├── LICENSE                         # AGPL-3.0
└── README.md
```

---

## 2. High-Level System Diagram

```
                              ┌──────────────────────┐
                              │       USERS           │
                              │  (Athletes/Coaches)   │
                              └──────────┬───────────┘
                                         │
                    ┌────────────────────┬┴────────────────────┐
                    │                    │                      │
                    ▼                    ▼                      ▼
        ┌───────────────────┐ ┌──────────────────┐  ┌─────────────────────┐
        │   Mobile App      │ │   Landing Page   │  │  Fitness Devices    │
        │  (React Native/   │ │  (SvelteKit on   │  │  (Garmin, Wahoo,    │
        │   Expo)           │ │   Cloudflare)    │  │   Strava)           │
        │                   │ │                  │  │                     │
        │  iOS / Android /  │ │  trainaa.com     │  │  Webhooks & OAuth   │
        │  Web              │ │                  │  │                     │
        └────────┬──────────┘ └──────────────────┘  └──────────┬──────────┘
                 │                                              │
                 │  HTTPS / WebSocket                           │ Webhooks
                 │                                              │
        ┌────────▼──────────────────────────────────────────────▼──────────┐
        │                     TRAEFIK (Reverse Proxy)                     │
        │                Auto TLS via Let's Encrypt                       │
        │         staging.trainaa.com / backend.trainaa.com               │
        └────────────────────────────┬────────────────────────────────────┘
                                     │
                 ┌───────────────────┬┴───────────────────┐
                 │                   │                     │
                 ▼                   ▼                     ▼
      ┌─────────────────┐ ┌──────────────────┐  ┌──────────────────┐
      │  FastAPI Backend │ │   Scheduler      │  │     Redis        │
      │  (API + Agents)  │ │  (APScheduler)   │  │   (7-alpine)     │
      │                  │ │                  │  │                  │
      │  /v1/* endpoints │ │  Workout sync    │  │  OAuth PKCE      │
      │  WebSocket chat  │ │  Provider push   │  │  Session cache   │
      │  Rate limiting   │ │                  │  │                  │
      │  2-4 workers     │ │  1 worker        │  │                  │
      └───────┬──────────┘ └────────┬─────────┘  └──────────────────┘
              │                     │
              │     ┌───────────────┘
              │     │
              ▼     ▼
      ┌────────────────────┐     ┌───────────────────────────────┐
      │  Supabase          │     │  AI / LLM Layer               │
      │  (PostgreSQL)      │     │                               │
      │                    │     │  OpenRouter API                │
      │  Activities DB     │     │    └─ Gemini 2.5 Flash        │
      │  Chat History DB   │     │                               │
      │  User Profiles     │     │  LangChain + LangGraph        │
      │  Workouts          │     │    ├─ Main Agent              │
      │  Training Status   │     │    ├─ Query Agent (NL→SQL)    │
      │  Auth (JWT + RLS)  │     │    ├─ Trainer Agent           │
      │                    │     │    ├─ Workout Mgmt Agent      │
      │  Row Level Security│     │    └─ Feedback Agent          │
      └────────────────────┘     │                               │
                                 │  Langfuse (observability)     │
                                 └───────────────────────────────┘

      ┌───────────────────────────────────────────────────────────┐
      │                  EXTERNAL SERVICES                        │
      │                                                           │
      │  Strava API    Garmin Connect    Wahoo API                │
      │  RevenueCat    Stripe            Sentry                   │
      │  PostHog       Expo Updates      Google Analytics         │
      └───────────────────────────────────────────────────────────┘
```

---

## 3. Core Components

### 3.1 Mobile App (React Native / Expo)

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Primary user interface for athletes. Training dashboard, AI coach chat, activity tracking, workout planning, and calendar views. |
| **Technologies** | React Native 0.81, Expo 54, TypeScript, NativeWind (TailwindCSS), Expo Router (file-based routing) |
| **State Management** | React Context (Auth, Theme, Language, Subscriptions, Alerts) + TanStack React Query for server state |
| **UI Library** | @rn-primitives (41 headless components) + custom feature components |
| **Internationalization** | i18next with 4 languages (EN, DE, ES, FR), device locale detection, AsyncStorage persistence |
| **Auth** | Supabase Auth (email/password, Google OAuth, Apple Sign-in) with expo-secure-store for token storage |
| **Subscriptions** | RevenueCat SDK (iOS/Android native), Stripe (web) |
| **Analytics** | PostHog (product analytics + session replay), Sentry (error tracking) |
| **Distribution** | EAS Build (development, staging, production profiles), Expo OTA Updates |

**Key Screens:**
- **Home** - Training status (CTL/ATL/TSB), planned workouts, integrations
- **Chat** - WebSocket AI coach with multiple personas and thread management
- **Activities** - Synced activities with map visualization, pagination, FIT upload
- **Calendar** - Day-by-day training history and upcoming schedule
- **Workouts** - Drag-and-drop workout builder, scheduling, provider sync
- **Settings** - Profile, connections, subscriptions, notifications, API keys

### 3.2 FastAPI Backend

| Attribute | Detail |
|-----------|--------|
| **Purpose** | API server handling authentication, data management, AI agent orchestration, and fitness provider integration. |
| **Technologies** | Python 3.12, FastAPI 0.116, Uvicorn, UV (package manager) |
| **API Prefix** | `/v1` for all endpoints |
| **Version** | 1.1.0 (min supported: 1.0.0) |
| **Workers** | 2 (staging), 4 (production) |
| **Deployment** | Docker container (`python:3.12-slim-trixie`), deployed via GitHub Actions |

**20 Router Modules:**

| Router | Prefix | Purpose |
|--------|--------|---------|
| Chat | `/chat/` | WebSocket agent communication, thread CRUD |
| Activities | `/activities/` | Unified activity management, FIT upload |
| Workouts | `/workouts/` | Workout CRUD, validation, scheduling |
| Training Status | `/training-status/` | Fitness/fatigue/form metrics |
| User Info | `/user-attributes/` | Profile, goals, equipment, BYOK keys |
| User Feedback | `/user-feedback/` | AI-generated session feedback |
| AI Tools | `/ai-tools/` | Max averages, HR calculations |
| Strava Auth/API | `/strava/` | OAuth2 + activity sync |
| Garmin Auth/API/Webhook | `/garmin/` | OAuth2 + activity sync + MFA + webhooks |
| Wahoo Auth/API/Webhook | `/wahoo/` | OAuth2 + activity sync + webhooks |
| Subscriptions | `/subscriptions/` | Tier management, feature limits |
| Stripe Billing | `/stripe/` | Checkout, billing portal |
| RevenueCat Webhook | `/webhooks/revenuecat/` | In-app purchase events |
| Push Tokens | `/push-tokens/` | Device notification registration |
| Invitation Codes | `/invitation-codes/` | Beta access management |

### 3.3 AI Agent System (LangChain / LangGraph)

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Multi-agent AI coaching system providing personalized training advice, data analysis, and workout management. |
| **Framework** | LangChain 0.3 + LangGraph 0.6 |
| **Default LLM** | Google Gemini 2.5 Flash via OpenRouter (temperature 0.0) |
| **Persistence** | AsyncPostgresSaver for chat history with automatic summarization (8000 token limit) |
| **Observability** | Langfuse tracing (optional), Sentry error tracking |

**Agent Architecture:**

| Agent | File | Purpose |
|-------|------|---------|
| **Main Agent** | `main_agent.py` | Central orchestrator. Routes to tools, manages conversation state, injects temporal and training context into system prompt. |
| **Query Agent** | `query_agent.py` | Translates natural language to SQL. Queries 6 database views (session_details, record_summary, sport_statistics, monthly_activity_summary, workouts, workouts_scheduled). Retry logic for query fixes. |
| **Trainer Agent** | `trainer_agent.py` | Creates personalized training plans. Phased workflow: assessment, scheduled workouts review, action plan generation. |
| **Workout Management Agent** | `workout_management_agent.py` | Structured workout CRUD. Validates WORKOUTDEFINITION format with auto-fixing. Integrates with provider sync. |
| **Feedback Agent** | `feedback_agent.py` | Generates personalized session feedback based on training status and athlete context. |

**12 Agent Tools:**
`get_current_datetime`, `get_user_information`, `update_user_information`, `get_long_term_training_strategy`, `update_long_term_training_strategy`, `query_database`, `get_training_status`, `workout_create`, `delete_workouts_by_date`, `modify_workouts_by_date`, `get_scheduled_workouts`, `assess_current_training_week`


### 3.4 Landing Page (SvelteKit)

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Marketing website with hero page, app store links, legal pages, and contact form. |
| **Technologies** | SvelteKit 2 (Svelte 5), TailwindCSS 4.1, shadcn-svelte (50+ UI components), Vite 6 |
| **Internationalization** | svelte-i18n with 5 languages (EN, DE, FR, ES, IT) |
| **Deployment** | Cloudflare Pages via `@sveltejs/adapter-cloudflare` |
| **SEO** | Open Graph, Twitter Cards, JSON-LD (SoftwareApplication schema), hreflang tags, robots.txt |
| **Content** | Markdown-based privacy policy and terms (multi-language) |
| **Analytics** | Google Analytics (GTAG) with cookie consent banner |

### 3.5 Workout Parser (Pacer)

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Parse, validate, and convert structured workout definitions (WORKOUTDEFINITION format). |
| **Location** | `src/backend/pacer/` |
| **Capabilities** | Text-to-structured conversion, Garmin XML conversion, format validation |
| **Format** | Sport type header, warm-up/main/cool-down blocks, duration (10m, 8m30s, 400m), intensity zones (Z1-Z5, %FTP, %HR, watts) |

### 3.6 FIT File Parser

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Parse binary FIT files from fitness devices (Garmin, Wahoo, etc.). |
| **Location** | `src/backend/python_fit_tool_jnkue/` (local path dependency) |
| **Capabilities** | Activity files, course files, workout files. Extracts GPS, heart rate, power, cadence, temperature, and more. |

---

## 4. Data Stores

### 4.1 Supabase PostgreSQL (Primary Database)

| Attribute | Detail |
|-----------|--------|
| **Type** | PostgreSQL 17 (managed via Supabase) |
| **Purpose** | Primary data store for all application data |
| **Migrations** | 47 SQL migration files |
| **Auth** | Supabase Auth with JWT (ES256), refresh token rotation |
| **Security** | Row Level Security (RLS) on all user-facing tables |

**Key Tables:**

| Table | Purpose |
|-------|---------|
| `activities` | Activity container, links to FIT files or provider responses |
| `sessions` | Individual workout sessions with metrics (HR load, speed, watts, cadence) |
| `laps` | Lap-level breakdowns within sessions |
| `records` | Array-based time-series data (GPS, HR, power, speed, temperature) |
| `training_status` | Daily CTL/ATL/TSB, streaks, monotony, strain (calculated daily) |
| `workouts` | Text-based workout templates in WORKOUTDEFINITION format |
| `workouts_scheduled` | Planned workout assignments by date |
| `user_infos` | User profile, goals, equipment, injuries, language, subscription status |
| `chat_history` | Agent conversation logs (90-day auto-cleanup) |
| `threads` | Conversation thread grouping |
| `strava_responses` | Raw Strava API response storage |
| `fit_files` | FIT file metadata with SHA-256 dedup |
| `fitness_providers` | Provider registry (Strava, Garmin, Wahoo, Manual) |
| `user_provider_connections` | OAuth tokens, sync metadata per user per provider |
| `wahoo_tokens` / `garmin_tokens` | Device-specific auth tokens |
| `unified_workout_sync_queue` | Multi-provider workout sync queue |
| `user_feedback` | Session-level feel and RPE feedback |
| `session_custom_data` | Custom session metadata |
| `invitation_codes` | Beta invitation system |
| `push_notifications` | Push notification configuration |
| `subscription_store` | Stripe subscription tracking |

**Database Views:**
`session_details`, `record_summary`, `sport_statistics`, `monthly_activity_summary`, `workouts`, `workouts_scheduled`

### 4.2 Redis

| Attribute | Detail |
|-----------|--------|
| **Type** | Redis 7 Alpine |
| **Purpose** | OAuth PKCE verifier storage (10-min TTL), session caching |
| **Config** | Max 10 connections, 5s socket timeout, appendonly persistence (staging/prod) |
| **Fallback** | Graceful degradation if unavailable |

### 4.3 Supabase Storage

| Attribute | Detail |
|-----------|--------|
| **Type** | S3-compatible object storage (Supabase) |
| **Bucket** | `fit-files` (private, 50 MiB file size limit) |
| **Purpose** | Raw FIT file storage from device uploads |

---

## 5. External Integrations

| Service | Purpose | Integration Method |
|---------|---------|-------------------|
| **Strava** | Activity sync, athlete data | OAuth2 + REST API + Webhooks |
| **Garmin Connect** | Activity sync, workout upload | OAuth2 (with MFA) + REST API + Webhooks |
| **Wahoo** | Activity sync, workout upload | OAuth2 + REST API + Webhooks |
| **OpenRouter** | LLM access (Gemini 2.5 Flash) | REST API with API key (+ BYOK support) |
| **Supabase** | Database, auth, storage | SDK + direct PostgreSQL connections |
| **RevenueCat** | Mobile subscription management | SDK (iOS/Android) + Webhooks |
| **Stripe** | Web billing & checkout | REST API + Webhooks |
| **Sentry** | Error tracking & monitoring | SDK (FastAPI, React Native) |
| **PostHog** | Product analytics & session replay | SDK (React Native) |
| **Langfuse** | LLM observability & tracing | SDK (Python, optional) |
| **Google Analytics** | Landing page analytics | GTAG with consent management |
| **Expo** | OTA updates, build service, push notifications | EAS Build + EAS Update + Push API |
| **Cloudflare** | Landing page hosting & CDN | Pages adapter + Workers |
| **Google Sign-in** | Social authentication | OAuth2 (platform-specific client IDs) |
| **Apple Sign-in** | Social authentication (iOS) | Native authentication |

---

## 6. Deployment & Infrastructure

### Cloud & Hosting

| Component | Provider | Service |
|-----------|----------|---------|
| **Backend API** | Self-hosted VPS | Docker containers behind Traefik |
| **Landing Page** | Cloudflare | Cloudflare Pages |
| **Database** | Supabase | Managed PostgreSQL |
| **Mobile App** | Apple / Google | App Store + Play Store |
| **OTA Updates** | Expo | EAS Update |
| **Documentation** | GitHub | GitHub Pages (MkDocs Material) |
| **Container Registry** | GitHub | GHCR (`ghcr.io/jnkue/trainaabackend`) |

### Docker Architecture

| Container | Workers | Purpose |
|-----------|---------|---------|
| `trainaabackend` | 2 (staging) / 4 (prod) | FastAPI API server |
| `trainaascheduler` | 1 | Background workout sync (APScheduler) |
| `redis` | - | Caching and session storage |
| `traefik` | - | Reverse proxy with auto-TLS (Let's Encrypt) |

**Base Image:** `python:3.12-slim-trixie` with multi-stage build for cache efficiency.

### CI/CD Pipeline (GitHub Actions)

| Workflow | Trigger | Actions |
|----------|---------|---------|
| `ci_backend.yml` | PR to main/production (src/backend/**) | Ruff lint |
| `ci_frontend.yml` | PR to main/production (src/app/**) | Bun lint |
| `deploy_staging.yml` | Push to main | DB migrations, Docker build/push, SSH deploy |
| `deploy_prod.yml` | Push to production | Same as staging + Git tag creation |
| `deploy_docs.yml` | Push to main (docs/**) | MkDocs build, GitHub Pages deploy |

**Staging deploy pipeline:**
1. Generate Supabase signing key from secret
2. Push database migrations via Supabase CLI
3. Build Docker image with version tags
4. Push to GHCR
5. SCP docker-compose + traefik config to server
6. SSH: pull images, docker compose up -d

**Production deploy** adds: semantic Git tag creation (`v$VERSION`).

### Environments

| Environment | API Domain | Workers | Deploy Trigger |
|-------------|-----------|---------|----------------|
| Development | localhost:8000 | 1 | Manual |
| Staging | staging.trainaa.com | 2 | Push to `main` |
| Production | backend.trainaa.com | 4 | Push to `production` |

### Version Management

Central version source: `version.config.json` (currently `1.1.0`).

`scripts/bump-version.sh` syncs the version across:
- `src/backend/pyproject.toml`
- `src/backend/api/version.py`
- `src/app/package.json` + `src/app/constants/version.ts`
- `src/landing/package.json`
- iOS `Info.plist` and Android `build.gradle` (via expo prebuild)

### Monitoring

| Tool | Scope |
|------|-------|
| **Sentry** | Backend errors (FastAPI SDK), mobile crashes (React Native SDK) |
| **PostHog** | Mobile product analytics, session replay |
| **Langfuse** | LLM call tracing, token usage, latency |
| **Health Checks** | `/health` endpoint monitors: chat DB, activity DB, OpenRouter, Supabase, Redis |

---

## 7. Security Considerations

### Authentication

| Method | Scope |
|--------|-------|
| **Supabase JWT** | Primary auth for all API endpoints. ES256/RS256 signing with JWKS endpoint validation. |
| **OAuth2** | Strava, Garmin, Wahoo, Google Sign-in (with PKCE for mobile) |
| **Apple Sign-in** | iOS native authentication |
| **HTTPBearer** | FastAPI dependency (`get_current_user()`) extracts and validates tokens |

### Authorization

- **Row Level Security (RLS):** All user-facing Supabase tables enforce per-user access via RLS policies.
- **Service Role:** Backend uses Supabase service role key to bypass RLS for server-side operations (sync, background jobs).
- **Transitive Access:** Nested resources (laps, records) inherit access control through parent relationships (sessions -> activities).
- **Public Workouts:** Readable by all authenticated users; write restricted to owner.

### Data Protection

| Layer | Method |
|-------|--------|
| **In Transit** | TLS everywhere via Traefik + Let's Encrypt auto-certificates |
| **At Rest** | Supabase managed encryption for PostgreSQL |
| **Field Encryption** | Fernet encryption for user API keys (`FIELD_ENCRYPTION_KEY`) |
| **Token Storage** | OAuth tokens stored server-side; mobile uses `expo-secure-store` |
| **PKCE Verifiers** | Stored in Redis with 10-minute TTL |

### Application Security

| Control | Detail |
|---------|--------|
| **Security Headers** | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, CSP, HSTS |
| **Rate Limiting** | SlowAPI middleware on all endpoints |
| **CORS** | Configured via `FRONTEND_URLS` environment variable |
| **Request Size** | 50 MB limit (for FIT file uploads) |
| **Input Validation** | Prompt injection prevention (security preamble), input sanitization before tool execution |
| **Duplicate Detection** | SHA-256 hashing of FIT files prevents duplicate uploads |

### Secrets Management

- GitHub Actions Secrets for CI/CD (SSH keys, DB passwords, API tokens)
- Environment variables for runtime configuration (never committed)
- `.gitignore` excludes `.env`, `signing_key.json`, `credentials.json`

---

## 8. Development & Testing

### Local Setup

**Prerequisites:** Python 3.12, UV, Bun, Supabase CLI, Docker (optional)

```bash
# 1. Clone and configure
git clone <repo>
cp .env.example .env  # Configure required variables

# 2. Backend
./dev.sh install                    # Install Python dependencies (uv sync)
./dev.sh serve                      # Start API on localhost:8000
./dev.sh serve-with-scheduler       # API + background scheduler

# 3. Mobile app
cd src/app && bun install
bun start                           # Expo dev server
bun run ios                          # iOS simulator
bun run android                      # Android emulator

# 4. Landing page
cd src/landing && bun install
bun run dev                          # SvelteKit dev server

# 5. Local Supabase (optional)
cd src/supabase && supabase start    # Local PostgreSQL + Auth + Studio
```

### Dev Script (`dev.sh`)

| Command | Action |
|---------|--------|
| `serve` | FastAPI on :8000 (no scheduler) |
| `serve-with-scheduler` | FastAPI + APScheduler |
| `scheduler` | Scheduler only on :8001 |
| `install` | `uv sync` |
| `add <pkg>` | `uv add` |
| `test [args]` | `pytest` |
| `lint` | `ruff check` |
| `format` | `ruff format` |
| `docker-build` | Build backend Docker image |
| `docker-dev` | Start dev Docker stack |
| `docker-staging` | Start staging Docker stack |
| `docker-prod` | Start production Docker stack |
| `shell` | Python REPL with project context |
| `bump <version>` | Version bump across all components |

### Testing

| Component | Framework | Command |
|-----------|-----------|---------|
| **Backend** | pytest + pytest-asyncio | `./dev.sh test` |
| **Mobile App** | (lint only currently) | `cd src/app && bun run lint` |
| **Landing** | svelte-check + ESLint + Prettier | `cd src/landing && bun run check && bun run lint` |

### Code Quality

| Tool | Scope | Config |
|------|-------|--------|
| **Ruff** | Backend Python linting & formatting | `pyproject.toml` |
| **ESLint** | Mobile app (TypeScript/React) | `src/app/.eslintrc` |
| **ESLint + Prettier** | Landing page (TypeScript/Svelte) | `src/landing/eslint.config.js` + `.prettierrc` |
| **svelte-check** | Landing page type checking | `tsconfig.json` |
| **TypeScript** | Mobile + Landing strict mode | Per-component `tsconfig.json` |

### Documentation

| System | URL | Source |
|--------|-----|--------|
| **API Docs** | `localhost:8000/docs` (Swagger UI) | Auto-generated from FastAPI |
| **Project Docs** | GitHub Pages | `docs/` directory, built with MkDocs Material |

---

## 9. Future Considerations

### Known Technical Debt

- **Backend tests incomplete:** CI pipeline has placeholder for test execution (`# add tests` comment in `ci_backend.yml`). Current tests cover FIT parsing and workout validation but not API endpoints or agent logic.
- **pytest-asyncio version:** Pinned to 1.1.0 (outdated, current is 0.23+).

### Potential Improvements

- **E2E testing:** No end-to-end test framework for the mobile app.
- **API integration tests:** Backend tests do not cover API endpoints with a test database.
- **Caching layer:** Redis is underutilized beyond PKCE storage; could serve as a query/response cache.
- **Workout format migration:** WORKOUTDEFINITION is a custom text format; a structured JSON schema could improve interoperability.

---

## 10. Glossary

| Term | Definition |
|------|------------|
| **ATL** | Acute Training Load. 7-day exponentially weighted moving average of training stress. Represents recent fatigue. |
| **CTL** | Chronic Training Load. 42-day exponentially weighted moving average of training stress. Represents long-term fitness. |
| **TSB** | Training Stress Balance. CTL minus ATL. Positive = fresh, negative = fatigued. |
| **BYOK** | Bring Your Own Key. Users can provide their own OpenRouter API key for LLM-powered features. |
| **EAS** | Expo Application Services. Build and update infrastructure for React Native apps. |
| **FIT** | Flexible and Interoperable Data Transfer. Binary file format used by Garmin and other fitness devices. |
| **GHCR** | GitHub Container Registry. Hosts the backend Docker images. |
| **HR Load** | Heart Rate Load. Training stress metric derived from heart rate data. |
| **LangGraph** | Framework for building stateful, multi-agent LLM workflows with tool calling. |
| **NativeWind** | TailwindCSS integration for React Native, enabling utility-first styling. |
| **OTA** | Over-the-Air updates. Expo's mechanism for pushing JS bundle updates without app store review. |
| **Pacer** | Internal name for the workout definition parser and validator module. |
| **PKCE** | Proof Key for Code Exchange. OAuth2 extension for securing authorization code flow on mobile. |
| **RLS** | Row Level Security. PostgreSQL feature enforcing per-row access control at the database level. |
| **RPE** | Rate of Perceived Exertion. Subjective measure of training intensity (1-10 scale). |
| **TRAINAA** | The application name. An AI-powered fitness coaching platform. |
| **UV** | Fast Python package manager (by Astral), used in place of pip/poetry. |
| **WORKOUTDEFINITION** | Custom text format for structured workout definitions, parsed by the Pacer module. |

---

## 11. Project Identification

| Field | Value |
|-------|-------|
| **Project Name** | TRAINAA |
| **Repository** | github.com/jnkue/open-trainaa |
| **License** | AGPL-3.0 |
| **Primary Contact** | Janik Uellendahl (janik@trainaa.com) |
| **Current Version** | 1.1.0 |
| **Date of Last Update** | 2026-03-19 |
