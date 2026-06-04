# IntelliLog-AI Frontend — Developer Quick Reference

## Quick Start

### Installation
```bash
cd c:\vivek\Intelligent logistics_ai\frontend
npm install
npm run dev
```

### Build & Deploy
```bash
npm run build      # Production build
npm run type-check # TypeScript validation
npm run lint       # ESLint validation
```

---

## Using the New Components

### Operations Copilot
```tsx
import { OperationsCopilot } from '@/components/copilot'

// Add to Dashboard or main app layout
<OperationsCopilot />  // Floating button auto-rendered
```

**Features:**
- Floating button (bottom-right, z-40)
- Click to expand chat interface
- Ask about delays, risks, performance, routes
- Expandable for full response details

### Dashboard Intelligence
```tsx
import { DashboardIntelligence } from '@/components/intelligence'

// Render in a page or modal
<DashboardIntelligence />
```

**Tabs:**
- Usage Analytics (widget usage, response times)
- Workflow Insights (efficiency, overrides, success rate)
- Optimization Recommendations (ROI matrix)

### Toast Notifications
```tsx
import { useToast } from '@/components/notifications'

const MyComponent = () => {
  const { addToast, removeToast } = useToast()
  
  // Add toast
  addToast({
    type: 'success',
    title: 'Order Created',
    message: 'Order #123 created successfully',
    duration: 3000  // auto-dismiss after 3s
  })
  
  // Manually remove
  removeToast(toastId)
}
```

**Toast Types:** `'success' | 'error' | 'warning' | 'info'`  
**Duration:** 0 = manual only, default = 5000ms

### Modal System
```tsx
import { useModal, Modal, ConfirmModal, AlertModal } from '@/components/modals'

const MyComponent = () => {
  const modal = useModal()
  
  // Confirm modal
  return (
    <>
      <button onClick={modal.open}>Delete</button>
      <ConfirmModal
        isOpen={modal.isOpen}
        onClose={modal.close}
        onConfirm={async () => { /* handle confirm */ }}
        variant="danger"
        title="Delete Order?"
      />
    </>
  )
}
```

**Modal Types:**
- `Modal` - Base modal with customizable content
- `ConfirmModal` - Confirm/Cancel with async support
- `AlertModal` - Info/Success/Warning/Error variants
- `OrderDetailModal` - Displays order with risk analysis

### Custom Hooks

#### useWebSocket
```tsx
const { isConnected, send, disconnect } = useWebSocket(
  url,
  onMessage,
  tenantId,
  token
)

// Send message
send({ type: 'order_update', data: {...} })
```

#### useFleetData
```tsx
const {
  ordersArray,
  highRiskOrders,
  delayedOrders,
  fleetStats,
  selectedOrderId,
  connectionStatus
} = useFleetData()
```

#### useDashboardMetrics
```tsx
const {
  metrics,
  fleetHealth,
  priorityRecommendations,
  criticalMetrics,
  isLoading
} = useDashboardMetrics()

// Refetch on demand
metrics?.refetch()
```

#### useOrders
```tsx
const {
  orders,
  createOrder,
  updatePosition,
  isLoading
} = useOrders()
```

#### usePredictions
```tsx
const {
  modelInfo,
  modelMetrics,
  featureImportance,
  isLoading,
  getPrediction,
  getBatchPredictions
} = usePredictions()
```

---

## Using Utilities

### Risk Utilities
```tsx
import {
  getRiskLevel,      // 'low' | 'medium' | 'high'
  getRiskColor,      // 'text-green-400' etc.
  getRiskLabel,      // 'Low Risk', 'High Risk', etc.
  classifyRiskFactor // 'increases' | 'decreases'
} from '@/utils'

const level = getRiskLevel(riskScore)  // 0-100 score
const color = getRiskColor(riskScore)
```

### Map Helpers
```tsx
import {
  calculateDistance,    // Haversine formula
  calculateBounds,      // Get bounds from coords
  clusterPoints,        // Proximity-based clustering
  isWithinBounds        // Check point in bounds
} from '@/utils'

const distanceKm = calculateDistance(lat1, lng1, lat2, lng2)
const clusters = clusterPoints(orders, thresholdKm)
```

### Dashboard Utils
```tsx
import {
  getDefaultPreferences,
  getWidgetVisibilityForMode,
  calculateDashboardMetrics,
  formatTimeRange
} from '@/utils'

const prefs = getDefaultPreferences()
const visibility = getWidgetVisibilityForMode('executive')
const range = formatTimeRange('today')
```

### Analytics Utils
```tsx
import {
  calculateBehaviorScore,
  generateWorkflowInsights,
  detectAnomalies,
  calculateTrend
} from '@/utils'

const score = calculateBehaviorScore(metrics)
const trend = calculateTrend([23, 25, 26, 28, 30])  // { direction: 'up', momentum: 9.09 }
```

### Performance Utils
```tsx
import {
  calculateVirtualRange,
  useDebounce,
  useThrottle,
  OptimizedCollection
} from '@/utils'

// Virtual scrolling
const { start, end } = calculateVirtualRange(scrollTop, height, 60, 5)

// Collection with O(1) lookups
const collection = new OptimizedCollection()
collection.add({ id: '123', ...data })
const item = collection.get('123')  // O(1)
```

### Accessibility Utils
```tsx
import {
  getContrast,
  meetsWCAGContrast,
  getFocusableElements,
  announceToScreenReader
} from '@/utils'

// Check color contrast
const contrast = getContrast([255, 100, 50], [255, 255, 255])
const isCompliant = meetsWCAGContrast(rgb1, rgb2)  // AA threshold

// Announce to screen reader
announceToScreenReader('Order created successfully', 'polite')
```

---

## Constants Reference

```tsx
import { 
  API_CONFIG,
  REACT_QUERY_CONFIG,
  MAP_CONFIG,
  RISK_CONFIG,
  PERFORMANCE_CONFIG,
  TOAST_CONFIG,
  DATE_FORMAT,
  ORDER_STATUSES,
  ALERT_TYPES,
  COLORS,
  WS_EVENTS
} from '@/utils'

// Usage
API_CONFIG.BASE_URL
RISK_CONFIG.HIGH_ALERT_THRESHOLD  // 85
PERFORMANCE_CONFIG.TABLE_PAGE_SIZE  // 50
```

---

## Common Patterns

### Handling Async Operations with Toast
```tsx
const { addToast } = useToast()
const { createOrder } = useOrders()

const handleCreate = async () => {
  try {
    await createOrder(data)
    addToast({
      type: 'success',
      title: 'Created',
      message: 'Order created successfully',
      duration: 3000
    })
  } catch (error) {
    addToast({
      type: 'error',
      title: 'Error',
      message: error.message,
      duration: 5000
    })
  }
}
```

### Modal with Async Confirmation
```tsx
const [isProcessing, setIsProcessing] = useState(false)

<ConfirmModal
  onConfirm={async () => {
    setIsProcessing(true)
    try {
      await apiCall()
    } finally {
      setIsProcessing(false)
    }
  }}
  isProcessing={isProcessing}
/>
```

### Virtual Scrolling for Large Lists
```tsx
const [scrollTop, setScrollTop] = useState(0)
const { start, end } = calculateVirtualRange(
  scrollTop,
  containerHeight,
  60,  // itemHeight
  5    // bufferSize
)

const visibleItems = orders.slice(start, end)
```

### Performance Optimization Pattern
```tsx
// Memoize derived state
const criticalMetrics = useMemo(() => ({
  totalOrders: orders.size,
  delayedOrders: orders.values().filter(o => o.delay_minutes > 0).length,
  // ... other computations
}), [orders])

// Memoize callback
const handleSelect = useCallback((id: string) => {
  fleetStore.setSelectedOrder(id)
}, [])
```

---

## File Organization

```
frontend/
├── src/
│   ├── components/
│   │   ├── copilot/              (Part 1)
│   │   ├── intelligence/         (Part 2)
│   │   ├── notifications/        (Part 3)
│   │   ├── modals/               (Part 4)
│   │   ├── fleet/
│   │   ├── orders/
│   │   ├── predictions/
│   │   ├── agent/
│   │   ├── insights/
│   │   ├── layout/
│   │   └── shared/
│   ├── hooks/                    (Part 5)
│   ├── utils/                    (Part 6 + 8 + 9)
│   ├── types/
│   ├── api/
│   ├── store/
│   ├── pages/
│   ├── App.tsx
│   └── main.tsx
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
└── PROGRESS.md
```

---

## Testing Components

### Manual Testing Checklist
- [ ] Import component
- [ ] Render with required props
- [ ] Check for TypeScript errors
- [ ] Verify styling (dark theme)
- [ ] Test keyboard navigation
- [ ] Test screen reader (NVDA/JAWS)
- [ ] Check responsive behavior
- [ ] Verify no console errors

### Common Issues & Solutions

**Issue:** useToast hook not found
- **Solution:** Wrap app with ToastProvider (check index in notifications/)

**Issue:** Modal focus trap not working
- **Solution:** Ensure modal has focusable elements (buttons, inputs, etc.)

**Issue:** Virtual scrolling shows blank space
- **Solution:** Check itemHeight matches actual DOM element height (60px default)

**Issue:** WebSocket reconnection loop
- **Solution:** Check exponential backoff config, verify tenant_id and token

**Issue:** Performance degradation with 500+ orders
- **Solution:** Verify virtual scrolling is active, check React Query cache settings

---

## Performance Tips

1. **Use useMemo for derived states** — Prevents recalculation
2. **Use useCallback for callbacks** — Prevents function recreation
3. **Batch WebSocket updates** — Use createUpdateBatcher
4. **Use OptimizedCollection for lookups** — O(1) instead of O(n)
5. **Enable virtual scrolling** — For tables with 100+ items
6. **Monitor bundle size** — Keep `dist/` < 500KB gzipped

---

## Accessibility Checklist

For every new component:
- [ ] ARIA labels on interactive elements
- [ ] Keyboard navigation (Tab, Enter, Escape)
- [ ] Color contrast ≥ 4.5:1 (normal text)
- [ ] Focus indicator visible
- [ ] Screen reader compatible
- [ ] Error messages associated with inputs
- [ ] Live regions for dynamic content

---

## Deployment Checklist

- [ ] Environment variables configured (.env)
- [ ] API endpoint verified
- [ ] WebSocket URL correct
- [ ] Build succeeds: `npm run build`
- [ ] No console errors
- [ ] Bundle size checked
- [ ] Type checking passes
- [ ] ESLint passes
- [ ] Accessibility audit passed

---

## Resources

- **TypeScript:** `src/types/api.ts` (400+ lines of interfaces)
- **Components:** `src/components/*/` directories
- **Hooks:** `src/hooks/index.ts`
- **Utils:** `src/utils/index.ts`
- **Constants:** `src/utils/constants.ts`
- **Documentation:** `PROGRESS.md`, `ENTERPRISE_COMPLETION.md`, `VALIDATION_CHECKLIST.md`

---

**Last Updated:** 2024-2026  
**Version:** 1.0  
**Status:** Production-Ready ✅
