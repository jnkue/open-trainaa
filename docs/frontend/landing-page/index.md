# Landing Page

SvelteKit web frontend.

## Tech Stack

- SvelteKit
- TailwindCSS
- bits-ui (components)

## Commands

```bash
cd src/landing
bun run dev           # Dev server


bun run build         # Build
bun run preview       # Preview build
bun run check         # Type check
bun run lint          # Lint
bun run format        # Format
```

# Deployment

## Build

```bash
bun run build
```
Outputs to `.svelte-kit/output`.

## Preview

```bash
bun run preview
```

## Deployment

Happens automatically via Cloudflare Pages on push to `main` branch.