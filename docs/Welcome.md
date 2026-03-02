# Welcome to the TRAINAA DEVELOPER DOCS
## Overview

TRAINAA is a multi-component application with the following main parts:

1. **Mobile App** - React Native (Expo) application
2. **Backend** - Python FastAPI server with AI agent system
3. **Database** - Supabase (PostgreSQL)

4. **Landing Page** - SvelteKit web frontend

## Quickstart

### Prerequisites

- Python 3.12+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [Bun](https://bun.sh/) (JS runtime)


### Supabase

1. Create a Supabase project and database at [supabase.com](https://supabase.com/) or a local supabase instance with the [Supabase CLI](https://supabase.com/docs/guides/cli).

=== "Option 1: Local Supabase instance"

    ```bash
    ## Option 1 if using local supabase instance
    cd src/supabase
    supabase start
    supabase gen signing-key --algorithm ES256
    supabase migration up
    ```

=== "Option 2: Supabase Cloud"

    ```bash
    ## Option 2 if using Supabase cloud
    cd src/supabase
    supabase link --project-ref your-project-ref
    supabase migration up
    ```

### Backend Server

Create a `.env` file in the `src/backend` directory based on the provided `.env.example` and fill in the required environment variables.

Run from root directory:
```bash
./dev.sh install      # Install backend dependencies
./dev.sh serve        # Start development server
```

### App

Create a `.env` file in the `src/app` directory based on the provided `.env.example` and fill in the required environment variables.

```bash
bun install           # Install app dependencies
bun start              # Start Expo development server

# For mobile emulators
bun run android        # Start Android emulator
bun run ios           # Start iOS simulator
```




## Contributing

We welcome contributions from the community! If you're interested in contributing to TRAINAA, please check out our [Contributing Guide](getting-started/contributing.md) for guidelines on how to get involved.


## Docs

to start the docs run:

```bash

# create venv and activate it
python -m venv .venv
source .venv/bin/activate
# install requierements from /docs/requirements.txt
pip install -r requirements.txt
# then run from the root directory
mkdocs serve
```