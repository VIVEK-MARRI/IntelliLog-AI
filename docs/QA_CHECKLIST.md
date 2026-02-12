# Quick UI Verification Checklist

Use this checklist to verify all UI components are working correctly.

## RouteOptimizer Page (`/route-optimizer`)

### Upload Section
- [ ] Drag & drop zone visible with upload icon
- [ ] Can select CSV file via file picker
- [ ] Shows file name when uploaded
- [ ] Shows "✓ X orders loaded" in green

### Sync & Optimize Section
- [ ] "Solver Settings" card appears
- [ ] Method selection shows 2 buttons: "OR-Tools" and "Greedy"
- [ ] Active method highlighted (blue for OR-Tools, orange for Greedy)
- [ ] "ML ETA Prediction" toggle visible (emerald when ON)
- [ ] "Real Road Routing (OSRM)" toggle visible (cyan when ON)
- [ ] "Avg Speed" slider shows 10-60 range
- [ ] "Solver Time" slider shows 5-30s range
- [ ] Current values displayed (e.g., "Avg Speed: 30 km/h")

### Execution Section
- [ ] "Sync Orders" button shows count (e.g., "Sync Orders (5/10)")
- [ ] Button disabled until CSV loaded
- [ ] "Run Optimization" button visible and clickable
- [ ] Button text changes to show sync status before optimization

### Results Display
- [ ] "Total Distance" card shows distance in km (after optimization)
- [ ] "Routes Created" card shows number of routes
- [ ] Both cards have animations when appearing
- [ ] Results disappear when uploading new file

### Map & Table
- [ ] Map shows loading state initially
- [ ] Map renders with blue/red pins for drivers/orders
- [ ] Orders table appears below map
- [ ] Table shows columns: Order #, Customer, Address, Weight
- [ ] Table scrollable when many orders

---

## FleetControl Page (`/fleet`)

### Header
- [ ] Title "Fleet Control" displays
- [ ] Live tracking indicator with pulsing green dot
- [ ] Status overview: 4 cards (Total Fleet, Available, On Delivery, Offline)
- [ ] Cards show correct numbers

### Rerouting Indicator (NEW)
- [ ] Cyan background panel appears when active
- [ ] Pulsing dot on left (cyan)
- [ ] Text: "Dynamic Rerouting Active"
- [ ] Shows last update time (e.g., "Last update: 14:32:45")
- [ ] Zap icon on right

### Map
- [ ] Large map takes 2/3 of screen width
- [ ] Shows driver pins (blue)
- [ ] Shows order pins (red)
- [ ] Shows route polylines
- [ ] Badge shows "X Drivers Active"

### Driver List
- [ ] Search box filters drivers by name/phone
- [ ] Status filters (All, Available, Busy, Offline)
- [ ] Driver cards show:
  - [ ] Driver name
  - [ ] Phone icon + number
  - [ ] Status badge (color-coded)
  - [ ] Location coordinates
  - [ ] Vehicle capacity
- [ ] Selected driver highlighted in blue

---

## Dashboard Home (`/`)

### Stats Grid
- [ ] 4 stat cards display:
  - [ ] Fleet Status (blue)
  - [ ] Active Demand (emerald)
  - [ ] Path Efficiency (orange)
  - [ ] System Health (purple)
- [ ] Each shows value and label
- [ ] Hover effect on cards

### Rerouting Status Card (NEW)
- [ ] Visible when routes exist
- [ ] Cyan theme with pulsing dot
- [ ] Text: "AI Rerouting System Active"
- [ ] Shows timestamp: "Last update: HH:MM:SS"
- [ ] Orange "Pending Orders" badge (if any)
- [ ] Gauge icon on right

### Map Section
- [ ] Map shows:
  - [ ] Driver positions (blue)
  - [ ] Order locations (red)
  - [ ] Route polylines
- [ ] "Live Grid Monitor" badge

### AI Routing Engine Panel
- [ ] Shows "Fleet Utilization" with progress bar
- [ ] Shows "Route Compliance" with progress bar
- [ ] "Trigger AI Optimization" button clickable
- [ ] "Analytics Ready" action button

---

## Typography (Global)

- [ ] Body text uses Sora font (modern, clean)
- [ ] Headings use Space Grotesk (professional)
- [ ] Font loads correctly (no fallback Arial visible)
- [ ] Text weights consistent (bold headers, regular body)

---

## API Integration

### Order Sync
- [ ] Click "Sync Orders" → Request sent to `/api/v1/orders/`
- [ ] Network tab shows successful POST responses
- [ ] Sync count increases after sync
- [ ] Toast shows "X orders synced"

### Route Optimization
- [ ] Click "Run Optimization" → Request sent to `/api/v1/routes/optimize`
- [ ] Query parameters visible:
  - `method=ortools` or `greedy`
  - `use_ml=true` or `false`
  - `use_osrm=true` or `false`
  - `avg_speed_kmph=30` (example)
  - `ortools_time_limit=10` (example)
- [ ] Response shows route array
- [ ] Routes rendered on map

### Live Rerouting
- [ ] WebSocket connection to `/api/v1/ws/locations`
- [ ] Network tab shows "101 Switching Protocols"
- [ ] reroute indicator pulsates (if connected)
- [ ] lastRerouteTime updates

---

## Error Handling

- [ ] Invalid CSV → Error message shown
- [ ] No orders uploaded → Sync button disabled
- [ ] Network error → Toast notification
- [ ] Optimization timeout → Graceful completion
- [ ] WebSocket disconnect → Indicator stops, no crash

---

## Accessibility

- [ ] All interactive elements keyboard accessible (Tab key)
- [ ] Buttons have focus states
- [ ] Icons have meaningful alt text (checked in code)
- [ ] Color alone not used to convey information

---

## Performance

- [ ] App loads in <2 seconds
- [ ] Smooth animations (no jank)
- [ ] Map renders with 50+ routes smoothly
- [ ] No memory leaks (DevTools memory tab)
- [ ] CSV with 500 orders uploads in <5s

---

## Cross-Browser Testing

### Chrome/Edge
- [ ] ✅ All features work
- [ ] ✅ WebSocket connects
- [ ] ✅ Animations smooth

### Firefox
- [ ] ✅ All features work
- [ ] ✅ WebSocket connects
- [ ] ✅ Typography displays

### Safari (macOS)
- [ ] ✅ All features work
- [ ] ✅ Tailwind styles apply
- [ ] ✅ Maps render

---

## Mobile Responsiveness

- [ ] Layout works on tablet (iPad)
- [ ] Layout works on mobile (375px width)
- [ ] Touch targets are ≥44x44px
- [ ] No horizontal scroll on mobile
- [ ] Map is usable on mobile

---

## Edge Cases

- [ ] Empty CSV (0 orders) → Shows error
- [ ] CSV with special characters → Parsed correctly
- [ ] Very large coordinates → Handled correctly
- [ ] Zero orders → Optimization skipped
- [ ] No drivers → Graceful failure message
- [ ] Network goes down → Graceful reconnect

---

## Data Persistence

- [ ] Refresh page → Unsaved optimization lost (expected)
- [ ] Sync persists orders in backend (expected)
- [ ] Database saves routes (check with GET /routes/)

---

## Final Sign-Off

**Tested by**: _________________  
**Date**: _________________  
**All checks pass**: ☐ YES  

---

## Notes Section

```
Additional observations or issues found:
_______________________________________________
_______________________________________________
_______________________________________________
```
