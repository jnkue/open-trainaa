# App

React Native (Expo) app for iOS and Android.

## Commands

```bash
cd src/app
bun start              # Dev server
bun run android        # Android
bun run ios            # iOS
bun run web            # Web
bun run lint           # Lint
bun run test           # Tests
```

## Tech Stack

- Expo
- @rn-primitives (UI components)
- React Query (data fetching)
- Expo Router (navigation)
- Supabase (backend integration)

## Project Structure

```text
src/app/
├── app/
│   ├── (tabs)/           # Bottom tab navigation
│   ├── (auth)/           # Auth flow
│   ├── modal.tsx         # Modal screens
│   └── _layout.tsx       # Root layout with providers
├── components/           # UI components
├── hooks/                # Custom hooks
└── lib/                  # API client, Supabase, utils
```

## Guidelines

- Keep components minimal and clean
- Support dark/light mode (theme config in `lib/theme.ts`)
- All text must be localizable -- never hardcode user-facing strings

## Navigation

File-based routing with Expo Router. Bottom tabs for main sections, stack navigation within tabs, and modal presentation for overlays.

## State Management

- **Server state**: React Query for data fetching, caching, background updates, and optimistic updates
- **Global state**: React Context for authentication, user preferences, and theme
- **Local state**: `useState` and `useReducer` at the component level

## API Integration

- REST API client in `lib/api.ts`
- WebSocket for real-time chat
- Supabase client in `lib/supabase.ts`

## Components

Using `@rn-primitives` for base components (Button, Input, Card, Dialog, etc.). UI components reference: <https://reactnativereusables.com>

Custom components live in `components/` organized by feature.

## Troubleshooting

### Metro Bundler Issues

```bash
bun start --clear
```

