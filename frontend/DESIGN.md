# Design System: IntelliLog-AI — Enterprise Logistics Intelligence Platform

## 1. Visual Theme & Atmosphere
A premium operational command center with gallery-airy density, confident asymmetric layouts, and fluid spring-physics motion. The atmosphere is authoritative yet refined — like a well-lit Palantir Foundry operations room. Deep navy foundations with high-contrast operational accents. Every pixel communicates "Mission-Critical Logistics Intelligence."

**Design Variance:** 7 | **Motion Intensity:** 6 | **Visual Density:** 5

## 2. Color Palette & Roles

### Neutrals
- **Obsidian** (#0A0F1A) — Primary background (deepest navy-black)
- **Abyss** (#0F1729) — Surface level 01 (card backgrounds)
- **Deep Navy** (#151E2F) — Surface level 02 (elevated surfaces)
- **Slate Blue** (#1E2A45) — Surface level 03 (hover/active states)
- **Steel Grey** (#2A3A5C) — Borders, dividers, subtle structural lines
- **Mist** (#5A6B8A) — Secondary text, metadata, muted labels
- **Cloud** (#94A3B8) — Body text, descriptions
- **Pearl** (#CBD5E1) — Primary text, headings
- **White** (#F1F5F9) — High-emphasis text, active labels

### Operational Accents
- **Success Teal** (#0EA5E9) — On-track, healthy status, positive metrics
- **Warning Amber** (#F59E0B) — At-risk, attention required
- **Critical Red** (#EF4444) — Delayed, critical issues, alerts
- **Info Cyan** (#06B6D4) — Informational, active, processing

### Visual Hierarchy Colors
- **Route Blue** (#3B82F6) — Primary route lines, active paths
- **Glow Blue** (rgba(59,130,246,0.15)) — Subtle glow effects, active indicators
- **Optimization Teal** (#14B8A6) — Optimized routes, efficiency metrics

## 3. Typography Architecture
- **Display:** Geist — Track-tight, weight-driven hierarchy. All caps for labels. Font size range: `text-xs` (10px) to `text-6xl` (60px)
- **Body:** Geist — Relaxed leading (1.6), 65ch max-width. Neutral secondary color (#5A6B8A)
- **Mono:** Geist Mono — For metrics, telemetry data, timestamps, ETA values, coordinates
- **Scale:** `text-[10px]` (micro labels) → `text-xs` (12px, metadata) → `text-sm` (13px, body) → `text-base` (14px, UI text) → `text-lg` (16px) → `text-xl` (18px) → `text-2xl` (20px) → `text-3xl` (24px, KPIs) → `text-4xl` (32px, section titles) → `text-5xl` (40px) → `text-6xl` (48px, hero display)
- **Banned:** Inter, Roboto, system-ui for premium contexts. Serif fonts banned entirely in dashboards.

## 4. Component Stylings

### Buttons
- **Primary:** #3B82F6 fill, #FFFFFF text. 8px radius. Hover: #2563EB. Active: scale-98. With icon: 8px gap.
- **Secondary:** Transparent with 1px #2A3A5C border. Hover: bg #1E2A45.
- **Ghost:** Transparent. Hover: bg #1E2A45.
- **Danger:** #EF4444 fill. Hover: #DC2626.
- **Tactile feedback:** `active:scale-[0.98]` on all buttons. `transition-all duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]`.

### Cards
- **Background:** #0F1729 (Abyss)
- **Border:** 1px #2A3A5C with `rgba(42,58,92,0.3)` subtle tint
- **Radius:** 12px (cards), 8px (inner sections), 6px (small elements)
- **Shadow:** `0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)`
- **Hover:** Slight lift with `translateY(-1px)` and brighter border
- **High-density override:** Replace cards with `border-b` dividers and negative space

### Inputs
- **Background:** #151E2F
- **Border:** 1px #2A3A5C (focus: #3B82F6 ring)
- **Text:** #CBD5E1, placeholder: #5A6B8A
- **Radius:** 8px
- **Label above input**, helper text optional, error text below.
- **No floating labels** — labels always visible above.

### Badges & Tags
- **Radius:** 4px (rounded), 9999px (pill)
- **Text:** 11px/12px, medium weight
- **Background:** Tinted operational color at 15% opacity with matching border at 20%

### Status Indicators
- 8px dot + label pattern. Dot pulses for active/live states.
- Live: animated pulse ring. Static: solid dot.

## 5. Layout Principles
- **Grid-first responsive architecture:** 12-column implicit grid, CSS Grid over Flexbox math
- **Max-width containment:** `max-w-[1440px] mx-auto` for page content
- **Asymmetric splits** for main views (map takes 2/3, side panel takes 1/3 on desktop)
- **Mobile collapse (< 768px):** All multi-column layouts collapse to single column
- **Section padding:** `py-6` to `py-12` — balanced, operational density
- **Viewport height:** Always `min-h-[100dvh]` — never `h-screen`
- **No flexbox percentage math:** Use CSS Grid with `grid-cols-12` and `col-span-*`
- **Generous internal padding:** `p-4` (16px) to `p-6` (24px) for card content

## 6. Motion & Interaction
- **Spring physics** for all interactive elements: `transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]`
- **Route reveal:** Animated drawing of polyline paths on map load/update
- **Vehicle interpolation:** Smooth marker transitions between GPS ping updates using `transition-duration` matching the ping interval
- **KPI count transitions:** Animated number changes using framer-motion `useSpring` or `useTransform`
- **Staggered cascade reveals:** Content sections fade in with `translateY(12px)` to `translateY(0)` sequence
- **Perpetual micro-loops:** Status indicators with gentle pulse animations. Live badges with breathing glow
- **Entry animations:** `opacity-0 translate-y-4` resolving to `opacity-100 translate-y-0` over 600ms
- **Hardware acceleration:** Animate exclusively via `transform` and `opacity`. Never `top`, `left`, `width`, `height`
- **Reduced motion:** All animations respect `prefers-reduced-motion: reduce`

## 7. Logos & Branding
- **Wordmark:** "IntelliLog" in Geist Display (or Satoshi Bold), tracking-tight, all-caps optional
- **Monogram:** Stylized "IL" geometric mark — square with rounded 8px corners, split diagonally (teal/navy)
- **Favicon:** Simplified monogram 32x32

## 8. Anti-Patterns (Banned)
- No emojis anywhere in UI
- No Inter font in any context
- No serif fonts in dashboards or operational UI
- No pure black (#000000) — always use Obsidian #0A0F1A
- No neon/outer glow shadows — use subtle tinted shadows
- No oversaturated accents — max 1 accent color, saturation < 80%
- No excessive gradient text on headers — flat color is premium
- No custom mouse cursors — always system default
- No overlapping elements — clean spatial separation
- No 3-column equal card layouts — always asymmetric
- No generic placeholder data — show real or realistic sample data
- No empty states without guidance — always show how to populate
- No 1px solid gray borders — use tinted subtle borders (#2A3A5C at 50%)
- No center-aligned heroes for high-variance sections
