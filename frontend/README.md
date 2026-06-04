# IntelliLog-AI Frontend

AI-Powered Logistics Operations Command Center

## Project Structure

```
src/
├── api/                    # API clients and WebSocket management
│   ├── client.ts          # HTTP client with authentication
│   ├── websocket.ts       # WebSocket manager with reconnection logic
│   ├── orders.ts          # Order REST endpoints
│   └── predictions.ts     # ML predictions and intelligence endpoints
├── components/            # React components
│   ├── shared/           # Reusable UI components (Spinner, Badges, Cards)
│   ├── layout/           # App structure (Shell, Sidebar)
│   ├── fleet/            # Fleet operations (FleetMap)
│   ├── orders/           # Order management (OrderTable)
│   ├── agent/            # Agent decision logs
│   ├── insights/         # Operational intelligence components
│   ├── copilot/          # AI assistant components
│   └── intelligence/     # Dashboard intelligence features
├── pages/                 # Full-page components
│   ├── Dashboard.tsx     # Main operations command center (LIVE)
│   ├── OrderDetail.tsx   # Single order detail view (LIVE)
│   └── Login.tsx         # Authentication page (LIVE)
├── store/                 # Zustand state management
│   ├── authStore.ts      # Authentication state
│   └── fleetStore.ts     # Real-time fleet state
├── types/                 # TypeScript interfaces
│   └── api.ts            # Complete API type definitions
├── utils/                 # Utility functions (formatters, helpers)
├── App.tsx               # Main router configuration (LIVE)
├── main.tsx              # React 18 entry point (LIVE)
└── index.css             # Global styles and animations (LIVE)
```

## Tech Stack

- **React 18** — UI framework
- **TypeScript 5.2** — Type safety
- **Vite 5.0** — Build tool
- **TailwindCSS 3.3** — Utility-first styling (dark theme)
- **Zustand 4.4** — Global state management
- **React Query 3.39** — Server state management
- **Leaflet 1.9 + react-leaflet 4.2** — Real-time fleet mapping
- **Recharts 2.10** — Operational visualizations
- **React Router DOM 6.20** — Client-side routing

## Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Type check
npm run type-check

# Lint
npm run lint
```

## Features

### ✅ Implemented (Live)

**Pages**:
- Dashboard — Split-screen operations command center (60% map, 40% intelligence)
- OrderDetail — Single order tracking with risk analysis
- Login — Email/password authentication

**Components**:
- FleetMap — Real-time Leaflet visualization with position updates
- OrderTable — High-performance order list with sorting
- RiskExplainer — SHAP feature importance visualization
- MetricCard — Operational metrics display
- RiskBadge — Risk score visualization
- DecisionLog — Live agent decision history
- FleetHealthCard — Fleet health scoring
- OperationsInsights — Operational intelligence summary
- AppShell — Main layout wrapper
- Sidebar — Navigation with mode toggle

**State Management**:
- authStore — Authentication with token persistence
- fleetStore — Real-time fleet data with WebSocket integration

**API**:
- HTTP client with retry logic and error handling
- WebSocket manager with exponential backoff reconnection
- Orders endpoint
- Predictions endpoint

### 🔄 WebSocket Real-Time Updates

The frontend maintains a live WebSocket connection receiving:
- Order position updates (lat/lng, speed, risk_score)
- Agent decisions (alerts, reroutes, optimizations)
- Route updates (waypoints, waypoint changes)
- ETA updates (revised arrival times)
- Heartbeat (every 25s with auto-reconnect)

### 📊 Dashboard Features

**Operations Mode** (default):
- Real-time fleet map with risk-based coloring
- High-risk order alerts with pulsing markers
- Active orders table with sorting (by risk, ETA, driver)
- Operational intelligence (metrics, delay causes, recommendations)
- Live agent decision log (50-decision buffer)
- Fleet health score with trending

**Executive Mode**:
- Today's performance metrics (orders processed, on-time rate, avg delay)
- Top AI recommendations with confidence scores
- Executive summary view (simplified, KPI-focused)

### 🎨 Design System

**Dark Theme**:
- Background: `slate-900`
- Cards: `slate-800`
- Borders: `slate-700`

**Risk-Based Colors**:
- Green (#22c55e): Low risk (<0.3)
- Amber (#f59e0b): Moderate (0.3-0.7)
- Red (#ef4444): High (>0.7)

**Animations**:
- `marker-pulse` — Pulsing effect for high-risk markers (2s)
- `status-pulse` — Connection status indicator (2s)
- No consumer animations (GSAP/Framer Motion) — operations-first

## Configuration

### Environment Variables

Create `.env` file:

```
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
VITE_TENANT_ID=your-tenant-id
```

### Proxy Configuration

Vite proxy is configured in `vite.config.ts`:
- `/api/*` → `http://localhost:8000/api/*`

## Performance

- **OrderTable**: Virtualization-ready for 100+ orders
- **FleetMap**: Leaflet marker updates via native `.setLatLng()` (no React re-renders)
- **WebSocket**: Sub-second latency on position updates
- **State**: Zustand stores prevent unnecessary re-renders
- **Code Splitting**: Manual chunks (react-vendor, map-vendor, charts, state)

## Type Safety

- **Strict Mode**: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`
- **No `any` types**: All interfaces fully defined in `types/api.ts`
- **Path Aliases**: `@/*` points to `src/`

## Next Steps

1. **Install dependencies**: `npm install`
2. **Configure API**: Set `VITE_API_URL` in `.env`
3. **Start dev server**: `npm run dev`
4. **Login**: Use demo credentials (demo@intelliglobal.com / demo123)
5. **View Dashboard**: Interact with fleet map and order management

## Contributing

All components follow enterprise patterns:
- TypeScript strict mode
- Minimal props drilling (Zustand for global state)
- Reusable component library
- Tailwind utilities only (no custom CSS except animations)
- Comprehensive error handling

## License

© 2024 IntelliLog-AI. All rights reserved.
