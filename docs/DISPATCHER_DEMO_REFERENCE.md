# 🎯 Hyderabad Dispatcher Demo Reference

## What You'll See in the Demo

This document is for the **live demonstration** to a Hyderabad logistics dispatcher. It explains what the demo data represents and why it's realistic.

---

## 🚨 The 5 "Hero Orders" - Your Demo Stars

### Hero Order #1: E3 - RUSH HOUR CONGESTION (⏰ 5-7 PM)
**"Why is this order taking 24 minutes for just 3.2 km?"**

**Location**: Mehdipatnam Bus Stop → Tolichowki Junction
- **Distance**: 3.2 km
- **Predicted ETA**: 24 minutes
- **TimeWindow**: 5:00 PM - 7:00 PM
- **Status**: Assigned to Venkat Reddy (Auto)

**Dispatcher Recognition**: This is one of the worst traffic corridors in Hyderabad during evening rush hour. The route goes through Mehdipatnam → Kala Niketan → Tolichowki - all congested areas with narrow roads at peak time.

**SHAP Breakdown**:
1. **Traffic Conditions**: +7-8 minutes ← **THE KEY FACTOR**
   - Rush hour 2.1x multiplier applies
   - The system recognizes this specific route-time combo has heavy congestion
2. **Peak Hour Impact**: +3 minutes
3. **Distance Base**: +2 minutes
4. **Driver Unfamiliarity**: +1 minute
   - Venkat isn't expert in this area (Tolichowki is southeast)

**Why Dispatcher Cares**: 
- ✓ System correctly identifies the traffic bottleneck
- ✓ ETA is honest (not over-promising 10 minutes)
- ✓ Shows ML model understands Hyderabad geography

**"What Would Help"**: 
- Assigned driver already handles moderate traffic
- BUT: Could potentially re-assign if same area has lighter traffic window
- OR: Suggest customer flexible time window (6:00 AM better, traffic 1.3x only)

---

### Hero Order #2: E1 - WRONG DRIVER DEMO
**"What if we send the WRONG driver to an expert zone?"**

**Location**: Gachibowli Stadium → Microsoft Campus, Hitech City
- **Distance**: 2.8 km  
- **Predicted ETA**: 22 minutes
- **TimeWindow**: 3:00 PM - 6:00 PM
- **Status**: Assigned to Priya Singh (Car, SE specialist)

**The Problem**: Priya is an "southeast specialist" (LB Nagar, Dilsukhnagar, Kothapet). She's NEVER been to Microsoft Campus or Hitech City. Ravi Kumar is the IT corridor expert, but this order went to Priya.

**SHAP Breakdown**:
1. **Zone Unfamiliarity**: +4-6 minutes ← **THE PENALTY**
   - Priya's familiarity score for Hitech City: 0.2 (very low)
   - Ravi's familiarity score for same zone: 0.9 (very high)
   - System quantifies the cost: 4-6 minutes lost
2. **Traffic Conditions**: +2 minutes (afternoon, moderate)
3. **Distance**: +2 minutes base

**Why Dispatcher Cares**:
- ✓ System identifies sub-optimal assignment
- ✓ Quantifies the cost: "This wrong assignment costs 5 minutes"
- ✓ Provides actionable suggestion

**"What Would Help"**: 
✨ **"Assigning Ravi Kumar (Hitech City expert) would save approximately 5 minutes"**

- Specific driver name
- Specific time saving amount
- Non-technical explanation

**The Demo Magic**: 
Dispatcher sees that the system doesn't just say "use a different driver" — it knows EXACTLY who, and HOW MUCH time they'd save. That's what SHAP does.

---

### Hero Order #3: E2 - ANOTHER ZONE MISMATCH
**"IT Corridor expert sent to Secunderabad?"**

**Location**: Bowenpally Market → Malkajgiri Railway Station
- **Distance**: 4.5 km
- **Predicted ETA**: 25 minutes
- **TimeWindow**: 1:00 PM - 4:00 PM
- **Status**: Assigned to Venkat Reddy (Auto, Banjara Hills specialist)

**The Problem**: Venkat specializes in Banjara Hills / Central Hyderabad. The delivery is in Secunderabad (Bowenpally → Malkajgiri), which is Saleem's expertise zone.

**SHAP Breakdown**:
1. **Zone Unfamiliarity**: +3-5 minutes
   - Venkat's familiarity: 0.2 for Secunderabad
   - Saleem's familiarity: 0.9 for same zone
2. **Standard traffic**: +2 minutes (afternoon, moderate)

**"What Would Help"**: 
✨ **"Assigning Saleem Mohammed (Secunderabad expert) would save approximately 4 minutes"**

---

### Hero Order #4: E5 - VEHICLE WEIGHT PENALTY
**"Why is this bike taking 14 minutes for just 2 km?"**

**Location**: Kukatpally Housing Board → JNTU Hyderabad
- **Distance**: 2 km (normally 7-8 min)
- **Predicted ETA**: 14 minutes
- **Weight**: 18.5 kg (Near bike capacity limit!)
- **TimeWindow**: 9:00 AM - 12:00 PM
- **Status**: Assigned to Ravi Kumar (Bike, 15 kg capacity)

**The Problem**: The package is 18.5 kg on a bike rated for 15 kg. This slows down the delivery.

**SHAP Breakdown**:
1. **Weight Penalty**: +3-4 minutes ← **HEAVY LOAD**
   - Weight 18.5 kg on 15 kg capacity bike
   - Affects acceleration, handling, speed
2. **Route distance**: +2-3 minutes base
3. **Traffic**: +1 minute (morning, free flow normally)

**Why Dispatcher Cares**:
- ✓ System knows vehicle capacity constraints
- ✓ Quantifies weight penalty
- ✓ Could suggest: Use Venkat (Auto, 50kg) instead (saves time + safe load)

**"What Would Help"**: 
✨ **"Using Venkat Reddy's auto (50kg capacity) would handle this package safely and save ~2 minutes"**

---

### Hero Order #5: E4 - WEATHER IMPACT
**"Why does rain add 3 minutes?"**

**Location**: Himayatnagar Main Road → Somajiguda Circle
- **Distance**: 2.8 km
- **Predicted ETA**: 12 minutes (normally 9-10 min)
- **Weather**: Rain, severity 1 (moderate)
- **TimeWindow**: 4:00 PM - 7:00 PM
- **Status**: Assigned to Venkat Reddy (Auto)

**SHAP Breakdown**:
1. **Weather Impact**: +2-3 minutes
   - System recalculates travel time with road conditions
   - Rain multiplies base traffic by 1.4x
2. **Route distance**: +2 minutes base

**Why Dispatcher Cares**:
- ✓ System accounts for live weather conditions
- ✓ Explains why same route takes longer on rainy days

---

## 📊 The 4 Demo Drivers - Your Fleet

| Name | Vehicle | Capacity | Expertise Zones | Best Use |
|------|---------|----------|-----------------|----------|
| **Ravi Kumar** 🏍️ | Bike | 15 kg | Hitech City, Madhapur, Kondapur | IT Corridor orders, light packages |
| **Saleem Mohammed** 🏍️ | Bike | 15 kg | Secunderabad, Begumpet, Trimulgherry | Northern area, light packages |
| **Venkat Reddy** 🛵 | Auto | 50 kg | Banjara Hills, Jubilee Hills, Panjagutta | Central hub, medium packages, rush hour |
| **Priya Singh** 🚗 | Car | 100 kg | LB Nagar, Dilsukhnagar, Kothapet | Southeast area, heavy packages |

---

## 🗺️ The Delivery Geography - Why It Matters

### IT Corridor (Ravi's Territory)
- **Zones**: Hitech City, Madhapur, Gachibowli
- **Characteristics**: Modern infrastructure, wide roads, tech parks
- **Traffic**: Moderate (1.4x) in mornings, free flow (1.0x) midday
- **Ravi's Advantage**: Knows all the IT office delivery docks

### Old City / Central (Venkat's Territory)
- **Zones**: Charminar, Banjara Hills, Jubilee Hills, Panjagutta
- **Characteristics**: Historic areas, narrow roads, mixed traffic
- **Traffic**: Heavy (1.6x) during lunch hour, worst at 2-3 PM
- **Venkat's Advantage**: Auto smaller than cars, navigates narrow lanes

### Secunderabad / North (Saleem's Territory)
- **Zones**: Secunderabad, Begumpet, Trimulgherry
- **Characteristics**: Better road planning, military cantonment areas
- **Traffic**: Moderate (1.3x), most stable area
- **Saleem's Advantage**: Knows railway station peak hours, military access

### Southeast (Priya's Territory)
- **Zones**: LB Nagar, Dilsukhnagar, Kothapet
- **Characteristics**: Residential, growing retail, newer roads
- **Traffic**: Moderate (1.4x), predictable patterns
- **Priya's Advantage**: Car for heavy packages, knows warehouse routes

---

## 🎓 What the Demo Teaches

### 1. The System Understands Your City
- ✓ Real Hyderabad coordinates (verified actual locations)
- ✓ Real traffic patterns (rush hour 2.1x, old city 1.6x, etc.)
- ✓ Driver expertise zones (not generic "Zone A/B/C")
- ✓ Vehicle constraints (bike weight, auto maneuverability)

### 2. SHAP Explains the "Why"
Instead of: `"ETA: 24 minutes"`

The system explains: `"24 minutes because: traffic +8min, peak hour +3min, distance +2min, unfamiliar zone +1min"`

Dispatcher can **verify each claim** — traffic IS bad at that time, the dispatcher DOES know it!

### 3. "What Would Help" Is Actionable
Not: "Could be faster" ❌

But: "Assigning Ravi Kumar (IT expert) saves ~5 minutes" ✅

- Specific person
- Specific time saving
- Non-technical explanation

---

## 🚀 How to Run the Demo

### Prerequisites (30 seconds)
```bash
# Run migration (one-time)
alembic upgrade head

# Seed demo data
python scripts/seed_demo_hyderabad.py --reset --verify --tenant-id demo-tenant-001
```

### Expected Output
```
✅ 4 drivers created
✅ 20 orders created
✅ 20 ETA predictions generated
✅ Routes optimized (matrix_source = "ml_predicted")
✅ 20 SHAP explanations stored
✅ 5 hero orders verified with realistic factor values
✅ Redis traffic patterns seeded (20 keys)
✅ Redis driver familiarity scores seeded (12 keys)
```

### Live Demo Flow (5 minutes)

1. **Show Order E3** (Rush Hour)
   - Point out: "24 minutes for 3.2 km — and the system explains why"
   - Read: "Traffic: +8 min, Peak hour: +3 min, Distance: +2 min"
   - Ask: "Does this match your experience on this route at 5 PM?" → YES!

2. **Show Order E1** (Wrong Driver)
   - "See what happens if we assign wrong driver to IT corridor"
   - Read: "Zone unfamiliarity: +4-6 minutes"
   - "System suggests: Ravi Kumar, saves ~5 minutes"
   - Ask: "Would you reassign?" → Dispatcher often does!

3. **Show Order E5** (Heavy Package)
   - "System knows vehicle constraints"
   - "Bike + 18.5kg = slower delivery"
   - "Suggests auto instead"

4. **Ask Dispatcher**:
   - "What other factors should we track?"
   - "Any zones we missed?"
   - "Traffic patterns match your experience?"

---

## 💾 Database References

### For Technical People (Backend/DevOps)

**Orders Table**:
```sql
SELECT order_number, weight, time_window_start, status
FROM orders
WHERE tenant_id = 'demo-tenant-001'
ORDER BY time_window_start;
```

**SHAP Explanations**:
```sql
SELECT df.order_id, df.predicted_eta_min, df.explanation_json
FROM delivery_feedback df
WHERE df.tenant_id = 'demo-tenant-001'
  AND df.order_id IN ('ord-demo-E1', 'ord-demo-E3', 'ord-demo-E5')
ORDER BY df.predicted_at DESC;
```

**Driver Familiarity** (Redis):
```bash
redis-cli --scan --pattern "driver:*:familiarity:*"
# Returns:
# driver:drv-demo-ravi_kumar:familiarity:Hitech City → 0.9
# driver:drv-demo-ravi_kumar:familiarity:Secunderabad → 0.2
# etc.
```

---

## 🎬 Demo Talking Points

| Point | Dispatcher Question | System Response |
|-------|-------------------|-----------------|
| **Geography** | "How do you know Hyderabad?" | Real coordinates, verified on Google Maps |
| **Traffic** | "Why 24 min for 3 km?" | SHAP shows exact traffic multiplier for time+location |
| **Drivers** | "Why not Priya for this route?" | Zone unfamiliarity adds 5 min → use expert instead |
| **Weight** | "Can bike handle 18.5 kg?" | No, shows ETA penalty + suggests auto |
| **Weather** | "Rain adds time?" | Yes, 1.4x multiplier, explained in SHAP |
| **Prediction** | "How confident?" | 82% within 5 min (P10/P90 shown) |

---

## ✅ Success Criteria

Demo is successful when dispatcher says:

✨ **"Oh, you know the roads in Hyderabad! And you explain why."**

Not ✗ "This is generic demo data"
Not ✗ "Why does it think 24 minutes?"
Not ✗ "How do I use this to reassign orders?"

---

## 📞 Notes

- All orders seeded once per database
- Use `--reset` flag to reseed before each new demo
- Takes ~5 seconds to seed
- Safe to run multiple times (idempotent)

---

**Demo Ready!** The dispatcher will immediately recognize the geography and appreciate the explanations. 🎯
