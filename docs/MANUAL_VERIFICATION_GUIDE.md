# Manual Verification Guide - SHAP Translation Layer

**Purpose:** Verify that the frontend translation layer completely eliminates raw Python field names from the Hyderabad dispatcher demo.

**Audience:** Senior engineers validating the SHAP explainability implementation before live demo.

**Success Criteria:** A non-technical dispatcher reading the SHAP explanation panel should see ONLY plain English text. Zero underscores. Zero field names visible anywhere.

---

## Pre-Verification Setup

### 1. Ensure Database & Backend Running

```bash
# Terminal 1: Start backend API
cd c:\vivek\IntelliLog-AI
python -m src.api.main

# Confirm: API listening on http://localhost:8000
```

### 2. Ensure Frontend Running

```bash
# Terminal 2: Start frontend dev server
cd c:\vivek\IntelliLog-AI
npm run dev

# Confirm: Frontend running on http://localhost:3000
```

### 3. Apply Alembic Migrations

```bash
# Terminal 3: Apply migrations
cd c:\vivek\IntelliLog-AI
alembic upgrade head

# Confirms driver table has vehicle_type + zone_expertise fields
```

### 4. Seed Demo Data

```bash
# Terminal 3: Run seeding script
python scripts/seed_demo_hyderabad.py --reset --tenant-id demo-tenant-001

# Confirms:
# - 4 demo drivers created with zone expertise
# - 20 realistic orders seeded
# - 5 "hero" orders E1-E5 with SHAP explanations
# - Redis populated with driver + traffic patterns
```

**Expected Output:**
```
✓ Creating demo drivers...
✓ Seeding 20 delivery orders...
✓ Generating SHAP explanations...
✓ Storing in PostgreSQL...
✓ Populating Redis cache...
Demo data seeding complete!
```

---

## Verification Steps

### Step 1: Open Dashboard & Navigate to Order E3

1. Open browser: `http://localhost:3000`
2. Login as demo user (credentials in seeding script output)
3. Navigate to **Dispatcher View** → **Orders**
4. Find **Order E3** (Mehdipatnam → Tolichowki delivery)
   - Expected: Rush hour delivery, 3.2 km, ~24 min ETA
   - Should show SHAP explanation card

### Step 2: Read Every Visible Word in SHAP Explanation Panel

Open the SHAP explanation card for Order E3. You will see these sections:

#### Section 2A: Compact Mode (Top Factor Pill)
**What you should see:**
```
Expected ETA: ~24 minutes

🔴 Top Factor: Rush hour
Impact: +8 minutes
```

**What you should NOT see:**
- ❌ `is_peak_hour` (raw field name)
- ❌ Any underscore character `_`
- ❌ `current_traffic_ratio`, `driver_zone`, etc.

#### Section 2B: Expanded View - Top 3 Factors
**What you should see:**
```
Top Factors Adding Time:

1. Rush hour
   Heavy congestion combined with peak delivery hours
   Impact: +8 min

2. Current traffic conditions
   Heavy congestion on route
   Impact: +6 min

3. Delivery distance
   Medium distance (3.2 km) for area
   Impact: +2 min
```

**What you should NOT see:**
- ❌ `is_peak_hour`, `current_traffic_ratio`, `distance_km` (raw names)
- ❌ Any underscore character in ANY field
- ❌ Numbers like "1.67" (raw traffic value)
- ❌ Technical abbreviations

#### Section 2C: "What Would Help"
**What you should see:**
```
💡 What Would Help:
• Reschedule to off-peak hours if possible
• Consider alternate route through outer ring
• Driver familiarization with Mehdipatnam area
```

**What you should NOT see:**
- ❌ `current_traffic_ratio`, `distance_km`, etc.
- ❌ Any field name with underscore
- ❌ Raw variable names

#### Section 2D: Full Factor List (Expanded)
**What you should see:**
```
All Contributing Factors:

✓ Rush hour
  Off-peak would save ~8 min
  
✓ Driver zone familiarity  
  Driver unfamiliar with area adding ~2 min
  
✓ Weather conditions
  Clear weather
  
✓ Package weight
  Heavy package (18.5 kg)
  Impact: +1 min
```

**What you should NOT see:**
- ❌ `is_peak_hour`, `driver_zone_familiarity`, `weather_severity`, etc.
- ❌ Any underscore: `_ratio`, `_km`, `_encoded`
- ❌ Raw field names anywhere

### Step 3: Underscore Search (Critical Verification)

This is the definitive test. Search the entire SHAP explanation panel for underscores:

1. **Method A: Browser DevTools**
   - Press `F12` (Open DevTools)
   - Press `Ctrl+F` (Find)
   - Search for: `_`
   - **Expected:** Zero results in SHAP explanation panel content
   - **Failure:** Any `_` found = translation layer incomplete

2. **Method B: Manual Visual Scan**
   - Read every visible word on SHAP card
   - Look specifically for: `_ratio`, `_km`, `_encoded`, `_familiarity`, `_severity`, `_hour`
   - **Expected:** None found
   - **Failure:** Any underscore-separated name visible = failure

3. **Method C: Browser Inspect Element**
   - Right-click on SHAP explanation card → **Inspect**
   - Search HTML source for forbidden patterns:
     ```
     current_traffic_ratio
     driver_zone_familiarity
     is_peak_hour
     weather_severity
     distance_km
     vehicle_type_encoded
     ```
   - **Expected:** Patterns found ONLY in `data-*` attributes, NOT in visible text
   - **Failure:** Any pattern in text content = risk of display

### Step 4: Test Multiple Orders

Repeat Step 1-3 for orders **E1, E2, E4, E5** to confirm translation works across all scenarios:

| Order | Scenario | Expected Visible Text | Should NOT See |
|-------|----------|----------------------|-----------------|
| E1 | Off-peak, familiar driver | "Off-peak hours saving time" | `is_peak_hour` |
| E2 | Long distance, clear weather | "Longer distance (18.5 km)" | `distance_km` |
| E3 | Rush hour, unfamiliar driver | "Rush hour" + "unfamiliar" | All underscores |
| E4 | Heavy rain, traffic | "Heavy rain slowing traffic" | `weather_severity` |
| E5 | Weekend, familiar driver | "Weekend delivery" + "familiarized" | `zone_familiarity` |

---

## Failure Analysis

If underscores or field names appear, diagnose the issue:

### Issue: Field names visible in factor labels
**Cause:** ETAExplanationCard.tsx not using `getFeatureLabel()` helper
**Fix:** Check line 130, ensure: `{getFeatureLabel(topFactor.feature)}`

### Issue: Field names visible in impact descriptions
**Cause:** Component using raw `factor.sentence` instead of `getImpactDescription()`
**Fix:** Check line 195, ensure description uses helpers

### Issue: Underscores in "what would help"
**Cause:** Backend validation (`_validate_explanation`) not removing bad suggestions
**Fix:** Check `shap_explainer.py` line 365, ensure `_validate_explanation()` is called

### Issue: JSON contains clean text but UI displays raw names
**Cause:** Frontend component rendering issue, not translation layer issue
**Fix:** Verify component imports at line 2 of ETAExplanationCard.tsx

---

## Testing-Focused Verification

### Run TypeScript Tests
```bash
# Terminal: Run SHAP label translation tests
npm run test -- tests/test_shap_labels.ts

# Expected: All tests pass
# Key tests to verify:
# ✓ getFeatureLabel returns human-readable label for known fields
# ✓ getImpactDescription produces output without underscores
# ✓ formatImpactMinutes handles positive/negative correctly
# ✓ isSafeForDisplay rejects text with underscores
# ✓ integration: no underscores in visible text
```

### Run Python Tests
```bash
# Terminal: Run SHAP validation tests
pytest tests/test_shap_explainability.py -v

# Expected: All validation tests pass
# Key tests to verify:
# ✓ test_no_raw_field_names_in_factors
# ✓ test_no_raw_field_names_in_summaries
# ✓ test_no_raw_field_names_in_what_would_help
# ✓ test_no_underscores_in_visible_text
# ✓ test_multiple_order_generation
```

---

## Verification Checklist

- [ ] **Backend running**: API healthy at localhost:8000
- [ ] **Frontend running**: Dashboard loads at localhost:3000
- [ ] **Database migrations applied**: `alembic upgrade head` succeeded
- [ ] **Demo data seeded**: `seed_demo_hyderabad.py` completed successfully
- [ ] **Order E3 loads**: SHAP explanation card visible
- [ ] **No field names in labels**: "Rush hour" visible, NOT `is_peak_hour`
- [ ] **No field names in descriptions**: "Heavy congestion" visible, NOT `current_traffic_ratio`
- [ ] **No field names in suggestions**: "Reschedule to off-peak" visible, NOT underscore patterns
- [ ] **Underscore search returns zero**: Browser Ctrl+F search for `_` finds zero in text
- [ ] **All orders E1-E5 pass**: Each hero order shows clean English only
- [ ] **TypeScript tests pass**: `npm run test -- tests/test_shap_labels.ts`
- [ ] **Python tests pass**: `pytest tests/test_shap_explainability.py -v`

---

## Success Confirmation

✅ **Verification Successful When:**
1. Every visible word in SHAP explanation is plain English
2. Zero underscores appear in any text field
3. Zero field names (`current_traffic_ratio`, `driver_zone_familiarity`, etc.) visible anywhere
4. All automated tests pass
5. Non-technical person can read SHAP explanation without confusion

---

## Addressing Dispatcher Concerns

If the dispatcher sees this SHAP explanation:

**"Your ETA of 24 minutes is predicted because:**
- **Rush hour** is adding 8 minutes
- **Heavy traffic on this route** is adding 6 minutes
- **3.2 km delivery distance** adds 2 minutes

**What would help:** Consider rescheduling, checking an alternate route, or assigning a driver more familiar with this area."

**They should think:**
- ✅ "These are real, understandable factors"
- ✅ "I can take action on these (reschedule, change route, reassign)"
- ✅ "This system understands my business"

**They should NOT think:**
- ❌ "What is `current_traffic_ratio`?"
- ❌ "What does `driver_zone_familiarity` mean?"
- ❌ "This looks like technical jargon"

---

## Troubleshooting

### Problem: SHAP card shows "Loading..."
**Solution:** Wait 5 seconds, then refresh page. Check backend logs for errors.

### Problem: SHAP card throws error "Missing translation"
**Solution:** Check `shapLabels.ts` SHAP_FEATURE_LABELS map is complete. Add missing field to map.

### Problem: Component shows field name, but tests pass
**Solution:** Tests may not cover that specific scenario. Check:
1. Component actually receives data from API
2. Component uses helper functions (don't just import them)
3. All rendering paths updated (compact + expanded views)

### Problem: Backend returns sentence with underscore
**Solution:** Backend validation (`_validate_explanation`) not working:
1. Verify method added to `shap_explainer.py`
2. Verify it's called before returning explanation
3. Check FORBIDDEN_PATTERNS list includes all patterns

---

## Demo Readiness Checklist

Before showing to Hyderabad dispatcher:

- [ ] All verification steps completed successfully
- [ ] All tests passing (TypeScript + Python)
- [ ] No errors in browser console for SHAP component
- [ ] All 5 hero orders display correctly
- [ ] Dispatcher reading explanation sees ONLY business-friendly English
- [ ] Demo script rehearsed with Order E3 as primary showcase
- [ ] Backup plan ready if SHAP card fails to load

---

## Contact & Support

- **Frontend Component:** `src/frontend/components/ETAExplanationCard.tsx`
- **Translation Utility:** `src/frontend/src/utils/shapLabels.ts`
- **Backend Validation:** `src/ml/models/shap_explainer.py`
- **Test Files:** 
  - `tests/test_shap_labels.ts` (TypeScript)
  - `tests/test_shap_explainability.py` (Python)

For issues, check these files in order of likelihood:
1. Component not using helpers (check imports, usage)
2. Helpers not mapping all fields (check SHAP_FEATURE_LABELS)
3. Backend sending malformed sentences (check backend validation)
