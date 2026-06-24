# UX Simplification — Phase 2 Blueprint

## Before / After Hierarchy

---

## 1. MISSION CONTROL

### Current (590 lines)
```
┌──────────────────────────────────────────────────┐
│  ████████████████████████████████████████████████ │  6-column KPI wall
│  Active   HighRisk   FleetHlth   AvgDelay   ...  │  (equal weight, information overload)
├──────────────────────────────────────────────────┤
│  ████████████████████ │ █████████████████████████ │  Critical Alerts │ AI Recs
├──────────────────────────────────────────────────┤
│  ████████████████████████████████████████████████ │  Fleet Map (small, 1/3 of page)
│  ████████████████████ │ █████████████████████████ │  HighRiskQueue │ ActivityFeed
├──────────────────────────────────────────────────┤
│  ████████████████████████████████████████████████ │  AI Pipeline Monitor
├──────────────────────────────────────────────────┤
│  ████████████████████████████████████████████████ │  System Status
└──────────────────────────────────────────────────┘
```

**Problem:** 7 sections, 3 full rows, 6 equally-weighted KPIs. No visual hierarchy. 3-second briefing impossible.

### Target
```
┌──────────────────────────────────────────────────┐
│  Mission Control                                  │
│  ─────── high-level operational briefing ───────  │
├──────────────────────────────────────────────────┤
│  ▓▓▓▓▓▓▓▓  78%   │  ▓▓▓  12 at risk  │  ▓  3 inc  │  Hero KPI strip (3 items max)
│  Fleet Health    │  Orders At Risk   │  Incidents  │  size: large / medium / small
├──────────────────────────────────────────────────┤
│  ████████████████████████████████████████████████ │  AI Recommendations (expanded)
│  ▶ Recommendation 1 — confidence 92%             │  top 3, actionable, not a list
│  ▶ Recommendation 2 — confidence 87%             │
├──────────────────────────────────────────────────┤
│  ████████████████████████████████████████████████ │  Activity Feed (compact rail)
│  ● Order #A47C2 — risk detected   ● ...           │
│  ● Order #B81F0 — reroute applied  ● ...          │
├──────────────────────────────────────────────────┤
│  ▶ Secondary Metrics (expandable)                  │  collapsed by default
│     Active Drivers   Delivered Today   Avg Delay   │
│     AI Interventions  On-Time Rate    ETA Drift    │
│  ▶ System Status (expandable)                      │  collapsed by default
└──────────────────────────────────────────────────┘
```

**After:** 4 visible sections. Primary focus on the 3 hero KPIs + AI Recs. Everything else tucks away.

**Files to modify:** `src/pages/MissionControl.tsx`

**Changes:**
- Delete `FleetKPIRow` (6 KPIs) → replace with 3-item hero strip
- Delete `HighRiskQueue` → absorb "Orders at Risk" count into hero strip
- Delete `AIPipelineMonitor` (visual novelty, low utility)
- Delete `SystemStatusFooter` → move behind collapsed section
- Keep `AIRecommendationPanel` (improve)
- Keep `ActivityFeed` (compact rail)
- Add collapsible `SecondaryMetrics` section
- Add collapsible `SystemStatus` section

**Complexity:** Medium. ~200-line deletion, ~100-line addition.

---

## 2. OPERATIONS

### Current (282 lines)
```
┌───────────┬──────────────────────────────────────┐
│  KPI wall │                                      │
│  (6 cards)│                                      │
│  floating │              FLEET MAP               │
│  over map │                                      │
│           │                                      │
│           │  [Search] [Filter]                    │
│           │                                      │
│           │   [Legend]  [Active: 15] [At risk:3] │
└───────────┴──────────────────────────────────────┘
```

### Target
```
┌──────────────────────────────────────┬───────────┐
│                                      │ ▶ High     │
│                                      │   Risk     │
│                                      │   Queue    │
│                                      │           │
│              FLEET MAP               │ ● A47C2   │
│              (dispatch view)         │   92%     │
│                                      │ ● B81F0   │
│  [🔍 Search] [▼Filter]              │   87%     │
│                                      │           │
│  ┌────────────────────┐              │ ▶ Selected│
│  │ Vehicle ID: A47C2  │              │   Order   │
│  │ Risk: 92% ⚠        │              │   Card    │
│  │ ETA: 14:32 +12m    │              │           │
│  │ Route: 5 stops     │              │ [ETA]     │
│  └────────────────────┘              │ [Risk]    │
│                                      │ [Route]   │
│  [Legend] [15 active] [3 at risk]    │           │
└──────────────────────────────────────┴───────────┘
  └──────── 70% ──────────┘ └── 30% ──┘
```

**After:** Map takes 70% of screen. Side rail carries risk queue + selected order card. No KPI overlay on map. Floating search/filter are clean UI overlays within map bounds.

**Files to modify:** `src/pages/Operations.tsx`, `src/components/fleet/FleetMap.tsx`

**Changes:**
- `Operations.tsx`: Remove `FleetHealthBar` section. Remove floating KPI overlay (`absolute top-4 left-4... KpiCard` grid). Add 30% side rail.
- `Operations.tsx`: Layout → `flex-row`, map takes `flex-1`, side rail `w-80 shrink-0` with scrollable content.
- `FleetMap.tsx`: Already has header bar. Keep. Map fills remaining space. Legend + active count stays as overlay.
- New side rail content: High Risk Queue (existing component, repurposed) + Selected Order Card (new or extracted from `VehicleDetailsPanel`)

**Complexity:** Medium-High. Layout restructure + component extraction.

---

## 3. ORDERS

### Current detail panel order (DetailPanel in Orders.tsx)
```
┌─ Order Detail Slide-over ─────────────────┐
│  Order Info (driver, status, created)      │  ← informational
│  ──────────────────────────────────────────│
│  ETA  │  Risk Score                        │  ← side by side, ok
│  ──────────────────────────────────────────│
│  SHAP Factors (6 bars)                     │  ← analytical, buried
│  ──────────────────────────────────────────│
│  Route Status (distance, duration, stops)  │  ← operational
│  ──────────────────────────────────────────│
│  Agent Decisions                           │  ← action-oriented, too low
│  ──────────────────────────────────────────│
│  Optimization History                      │  ← nice to have, at bottom
└────────────────────────────────────────────┘
```

### Target
```
┌─ Order Detail Slide-over ─────────────────┐
│  Order A47C2   Driver BRN-332   In Transit │  ← compact header
│  ──────────────────────────────────────────│
│  ╔═══════════════════════════════════════╗ │
│  ║  1. RISK                              ║ │  ← primary concern
│  ║  Score: 92%  (High)  Model: v3.2     ║ │
│  ║  Confidence: 94%                      ║ │
│  ║  ┌─ SHAP Factors ──────────────────┐  ║ │
│  ║  │ ● Delay history        +0.42    │  ║ │
│  ║  │ ● Traffic density      +0.31    │  ║ │
│  ║  │ ● Driver performance   +0.15    │  ║ │
│  ║  └─────────────────────────────────┘  ║ │
│  ╚═══════════════════════════════════════╝ │
│  ╔═══════════════════════════════════════╗ │
│  ║  2. RECOMMENDATION                    ║ │  ← what to DO
│  ║  Reroute via I-78 to avoid congestion ║ │
│  ║  Estimated impact: -18min delay       ║ │
│  ║  Confidence: 87%                      ║ │
│  ║  [Apply Reroute]  [Dismiss]           ║ │
│  ╚═══════════════════════════════════════╝ │
│  ╔═══════════════════════════════════════╗ │
│  ║  3. ROUTE                             ║ │  ← how it gets there
│  ║  5 stops · 142 km · ~2h 15m          ║ │
│  ║  Distance │ Duration │ Solver: solved ║ │
│  ╚═══════════════════════════════════════╝ │
│  ╔═══════════════════════════════════════╗ │
│  ║  4. AGENT DECISIONS                   ║ │  ← what AI did
│  ║  ● 14:32 Reroute applied             ║ │
│  ║  ● 14:15 Risk alert triggered        ║ │
│  ╚═══════════════════════════════════════╝ │
│  ╔═══════════════════════════════════════╗ │
│  ║  5. HISTORY (collapse)                ║ │  ← lowest priority
│  ╚═══════════════════════════════════════╝ │
└────────────────────────────────────────────┘
```

**Fundamental reorder:** Risk → Recommendation → Route → Decisions → History.

The analytical (SHAP) moves INSIDE Risk as supporting evidence. Recommendation gets its own prominent section with CTA buttons. Route moves after recommendation. History collapses.

**Files to modify:** `src/pages/Orders.tsx` (DetailPanel section, lines 609-761)

**Changes:**
- Reorder `SectionCard` blocks: Risk (contains SHAP) → Recommendation → Route → Agent Decisions → History
- Move SHAP factors inside Risk section
- Add Recommendation section (uses prediction data already loaded)
- Add CTA buttons to Recommendation section
- Keep History collapsed by default

**Complexity:** Medium. Mostly reordering + adding recommendation rendering.

---

## 4. AI WORKSPACE

### Current
```
┌─ AI Workspace ────────────────────────────────────┐
│  [Copilot]  [Explainability]  [Agent Ops]          │  ← 3 tabs
├────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────┐  │
│  │  Copilot chat interface  OR  Explain Studio   │  │  ← tab content swaps
│  │  OR  Agent Operations Center                  │  │
│  └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘
```

### Target
```
┌─ AI Workspace ────────────────────────────────────┐
│  AI Analyst           [Explain] [Agent Log]        │  ← minimal mode toggle
├────────────────────────────────────────────────────┤
│                                                     │
│  "What's happening with order A47C2?"               │  ← question area (always visible)
│  ─────────────────────────────────────────────────── │
│                                                     │
│  ╔═══════════════════════════════════════════════╗  │
│  ║  Order A47C2 has a 92% risk of late delivery ║  │  ← answer (appears after)
│  ║  due to traffic congestion on I-95.          ║  │
│  ║                                               ║  │
│  ║  Top factor: delay history (+0.42)           ║  │
│  ║  Confidence: 94%  ·  Model: v3.2             ║  │
│  ╚═══════════════════════════════════════════════╝  │
│                                                     │
│  ┌── Evidence ──────────────────────────────────┐  │  ← progressive reveal
│  │  ● Delay history     Trend: +12% week/week   │  │
│  │  ● Traffic density   Current: 0.78 (high)    │  │
│  │  ● Driver perf       Score: 4.2/5.0          │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌── Recommended Actions ───────────────────────┐  │  ← always last
│  │  ▶ Reroute via I-78  ─18min  [Apply]         │  │
│  │  ▶ Notify customer   ─5min   [Send]          │  │
│  └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘
```

**Key change:** Copilot is the default and primary mode. Explainability and Agent Log are mode toggles in the header, not separate tabs. The conversation is the focus — evidence and actions appear progressively below.

**Files to modify:** `src/pages/AIWorkspace.tsx`, `src/components/copilot/OperationsCopilot.tsx` (or whatever the Copilot component is)

**Changes:**
- Remove 3-tab layout. Default to Copilot conversation.
- Move Explain + Agent Log to minimal mode toggles in header
- Redesign answer rendering to show answer → evidence → actions (progressive reveal)
- Keep existing streaming, cancel, clear functionality

**Complexity:** High. UI redesign of the Copilot response rendering + mode switching.

---

## 5. EXECUTIVE

### Current (delegates to ExecutiveCommandCenter)
```
┌─ Executive Command Center ────────────────────────┐
│  Fleet Overview  │  AI Impact  │  Risk  │  ...    │  ← 4+ metric groups
├────────────────────────────────────────────────────┤
│  Cards: Active, High Risk, Health, ETA Drift...   │  ← metric overload
│  AI Impact: time saved, interventions             │
│  Risk Distribution: pie/bar                       │
│  Operational Health: multiple stats               │
└────────────────────────────────────────────────────┘
```

### Target
```
┌─ Executive ───────────────────────────────────────┐
│  Executive Summary      Last updated: 14:32:15    │
├────────────────────────────────────────────────────┤
│  ╔═══════════════════════════════════════════════╗ │
│  ║  Business Impact                              ║ │  ← 1. What matters
│  ║  ┌─────────────┬──────────────┬───────────┐   ║ │
│  ║  │ Time Saved  │ Cost Avoided │ On-Time % │   ║ │
│  ║  │  142 hrs    │   $12,400    │   94.2%   │   ║ │
│  ║  └─────────────┴──────────────┴───────────┘   ║ │
│  ╚═══════════════════════════════════════════════╝ │
│                                                     │
│  ╔═══════════════════════════════════════════════╗ │
│  ║  Risk Exposure                                ║ │  ← 2. What's wrong
│  ║  ● 12 high risk orders                        ║ │
│  ║  ● 3 SLA breaches today                       ║ │
│  ║  ● Fleet health: 78% (down 3% from yesterday)║ │
│  ╚═══════════════════════════════════════════════╝ │
│                                                     │
│  ╔═══════════════════════════════════════════════╗ │
│  ║  AI Impact                                    ║ │  ← 3. What AI did
│  ║  ▶ 47 interventions today                     ║ │
│  ║  ▶ 23 reroutes applied                        ║ │
│  ║  ▶ 18 risks mitigated                         ║ │
│  ║  ▶ Estimated 34 hours of delays prevented     ║ │
│  ╚═══════════════════════════════════════════════╝ │
└────────────────────────────────────────────────────┘
```

3 clear sections. No metric grid. No dashboard wall. Large typography, generous whitespace, editorial hierarchy.

**Files to modify:** `src/components/executive/ExecutiveCommandCenter.tsx`

**Changes:**
- Remove all grid-based KPI cards. Replace with 3 editorial sections.
- Business Impact: time saved, cost avoided, on-time % (3 hero numbers, large)
- Risk Exposure: narrative format, not cards
- AI Impact: intervention narrative with bullets
- Remove pie charts, bar charts, metric density

**Complexity:** Medium. Restructure the component, delete metric cards, add narrative layout.

---

## 6. SYSTEM HEALTH

### Current (450 lines)
```
All sections are cards in a 3-column grid:
┌──────────┬──────────┬──────────┐
│ Infra    │ Request  │ Predict  │
│ Health   │ Analytic │ Analytic │  ← equal weight, no hierarchy
├──────────┼──────────┼──────────┤
│ WebSock  │ Redis    │ Database │  ← all same card style
├──────────┼──────────┼──────────┤
│ Operational Alerts              │
└─────────────────────────────────┘
```

### Target
```
┌─ System Health ───────────────────────────────────┐
│  ╔═══════════════════════════════════════════════╗ │
│  ║  CRITICAL ALERTS                              ║ │  ← always first, pinned
│  ║  ● DB connection pool at 92% — degrade risk  ║ │
│  ║  ● 2 services degraded                        ║ │
│  ╚═══════════════════════════════════════════════╝ │
│                                                     │
│  ┌── Infrastructure ────────────────────────────┐  │  ← collapsible
│  │  API     Operational   12ms  99.9% avail    │  │
│  │  Redis   Operational   2ms   99.9% avail     │  │
│  │  ...                                         │  │
│  └──────────────────────────────────────────────┘  │
│  ┌── Request Analytics ── (collapsed) ──────────┐  │  ← collapsed by default
│  └──────────────────────────────────────────────┘  │
│  ┌── Prediction Analytics ── (collapsed) ───────┐  │
│  └──────────────────────────────────────────────┘  │
│  ┌── WebSocket ── (collapsed) ──────────────────┐  │
│  └──────────────────────────────────────────────┘  │
│  ┌── Redis ── (collapsed) ──────────────────────┐  │
│  └──────────────────────────────────────────────┘  │
│  ┌── Database ── (collapsed) ───────────────────┐  │
│  └──────────────────────────────────────────────┘  │
```

**Critical alerts always visible and pinned at top.** Everything else collapses behind minimal headers. Infrastructure stays expanded by default (it's the core). Analytics sections collapse.

**Files to modify:** `src/pages/SystemHealthCenter.tsx`

**Changes:**
- Move Alerts section to top of page (before all other sections)
- Add pinned/always-visible state for alerts
- Add collapsible state management for each section (useState)
- Infrastructure stays expanded by default
- All analytics sections collapsed by default
- Add expand/collapse chevron to SectionCard headers

**Complexity:** Medium. Add collapsible state + reorder sections.

---

## File Change Summary

| File | Change Type | Complexity | Lines Changed |
|---|---|---|---|
| `src/pages/MissionControl.tsx` | Simplify content | Medium | ~200 del, ~100 add |
| `src/pages/Operations.tsx` | Layout restructure | High | ~150 del, ~200 add |
| `src/components/fleet/FleetMap.tsx` | Minor UX polish | Low | ~20 add |
| `src/pages/Orders.tsx` | Reorder detail panel | Medium | ~100 reorder + add |
| `src/pages/AIWorkspace.tsx` | Mode toggle redesign | Medium | ~80 rewrite |
| `src/components/copilot/OperationsCopilot.tsx` | Response redesign | High | ~150 rewrite |
| `src/components/executive/ExecutiveCommandCenter.tsx` | Narrative restyle | Medium | ~200 rewrite |
| `src/pages/SystemHealthCenter.tsx` | Collapsible sections | Medium | ~100 add |

**Total estimated complexity:** Medium-High (8 files, ~900 lines change net)

**No new components needed.** All changes reuse existing components with different arrangement, visibility, and styling.

---

## Global Design Rules Applied

| Rule | Status |
|---|---|
| Max 3 primary actions per screen | ✓ Mission: 3 hero KPIs. Operations: 3 map controls. Orders: filter/sort/search |
| Max 1 dominant visual focus per screen | ✓ Mission: AI Recs. Operations: Fleet Map. Orders: Table. AI: Chat |
| No dashboard walls | ✓ Removed KPI grids from Operations, Executive |
| No metric overload | ✓ Executive: 3 narrative sections. Mission: 3 KPIs |
| No equal-weight cards | ✓ Hierarchy through size, spacing, and section type |
| Editorial spacing | ✓ Large hero numbers, narrative format for Executive |
| Generous whitespace | ✓ Collapsible sections, progressive reveal |
| Premium enterprise aesthetics | ✓ Consistent with warm light theme already implemented |
