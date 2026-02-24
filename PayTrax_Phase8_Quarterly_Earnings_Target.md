# PayTrax Addendum: Quarterly Earnings Target Dashboard Widget

**Prepared:** February 24, 2026
**Depends on:** Phases 1–7 complete
**For:** Claude Code Opus execution

---

## Purpose

Add a dashboard widget that helps the operator plan weekly hours to meet a configurable quarterly gross earnings target per employee. The primary use case is achieving SSA quarterly work credit minimums ($1,810 for 2025, $1,890 for 2026 — this changes annually), but the feature is generic enough for any quarterly gross pay goal.

The widget answers one question: **"How many hours should I schedule for the next pay period to stay on track for the quarterly target?"**

---

## Pre-Flight

Before starting, read and understand:

1. `state.js` — Current `defaultAppData.settings` structure and `CURRENT_VERSION`
2. `logic.js` (or `payroll-calc.js` if renamed in Phase 4) — `generateBasePayPeriods()` and how pay periods map to quarters by `payDate`
3. `ui.js` — How the dashboard tab currently renders
4. `migration.js` — The migration chain and how to add a new version
5. `utils.js` — Date parsing and formatting utilities

Run the full test suite. Confirm all tests pass before proceeding.

---

## New Settings

### 2 New Fields in `appData.settings`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `quarterlyEarningsTarget` | number | `1890` | Gross pay target per quarter per employee, in dollars |
| `minimumWeeklyHours` | number | `20` | Floor for scheduled hours per pay period — the algorithm will never recommend fewer than this |

### Implementation

- [ ] Add both fields to `defaultAppData.settings` in `state.js`
- [ ] Increment `CURRENT_VERSION`
- [ ] Write migration function (e.g., `migrateToV10` or next available version) in `migration.js`:
  ```javascript
  // Add quarterly earnings target settings
  if (!data.settings.quarterlyEarningsTarget) {
      data.settings.quarterlyEarningsTarget = 1890;
  }
  if (!data.settings.minimumWeeklyHours) {
      data.settings.minimumWeeklyHours = 20;
  }
  ```
- [ ] Register the migration in the `migrateData()` switch chain
- [ ] Add UI inputs for both fields in `index.html` inside the Settings tab, under a new heading **"Quarterly Earnings Target"** placed after the Tax Settings section:
  ```html
  <h4>Quarterly Earnings Target</h4>
  <div class="form-grid">
      <div class="form-group">
          <label class="form-label">Quarterly Earnings Target ($)</label>
          <input type="number" id="quarterlyEarningsTarget" class="form-input" 
                 placeholder="1890" step="0.01" min="0">
      </div>
      <div class="form-group">
          <label class="form-label">Minimum Weekly Hours</label>
          <input type="number" id="minimumWeeklyHours" class="form-input" 
                 placeholder="20" step="0.5" min="0" max="40">
      </div>
  </div>
  ```
- [ ] Wire these inputs into `updateSettingsFromUI()` (logic.js) and `populateSettingsForm()` (ui.js) following the pattern of existing settings fields
- [ ] If `validateSettings()` exists and is wired (Phase 5), add validation: target ≥ 0, min hours ≥ 0 and ≤ 40

### Verification

- [ ] Run full test suite
- [ ] Load PayTrax with existing data — confirm migration adds both fields with defaults
- [ ] Change values in Settings, reload — confirm they persist
- [ ] Confirm no existing functionality is affected

**GATE: All tests pass. New settings persist correctly.**

---

## Calculation Logic

### New Function: `calculateQuarterlyEarningsStatus(employeeId)`

Create this function in `logic.js` (or `payroll-calc.js`). It computes everything the dashboard widget needs for one employee's current quarter.

**Location:** Export from the calculation module alongside existing report generators.

```javascript
/**
 * Calculates quarterly earnings progress and recommended hours for an employee.
 * 
 * @param {string} employeeId - The employee ID
 * @returns {object} Quarterly earnings status
 */
export function calculateQuarterlyEarningsStatus(employeeId) {
    // Returns object described below
}
```

### Algorithm

**Step 1 — Identify the current quarter:**
- Use today's date to determine the quarter (Q1 = Jan–Mar, Q2 = Apr–Jun, Q3 = Jul–Sep, Q4 = Oct–Nov)
- The quarter boundary is based on **pay date**, consistent with how 941 reports assign periods to quarters

**Step 2 — Gather all pay periods for this employee in the current quarter:**
- Filter `appData.payPeriods[employeeId]` to periods whose `payDate` falls within the current quarter
- Sort by period number ascending

**Step 3 — Separate completed vs. remaining periods:**
- A period is "completed" if `grossPay > 0` (hours have been entered and calculated)
- A period is "remaining" if `grossPay === 0` AND its `payDate` is today or in the future
- Periods with `grossPay === 0` and `payDate` in the past are "missed" — count them but don't include in remaining capacity

**Step 4 — Calculate progress:**
```
quarterGross    = sum of grossPay for all completed periods in the quarter
quarterHours    = sum of regular + overtime + pto + holiday hours for completed periods
target          = appData.settings.quarterlyEarningsTarget
remaining       = target - quarterGross
```

**Step 5 — Calculate recommended hours for remaining periods:**
```
rate               = employee.rate
remainingPeriods   = count of remaining periods (future, not yet worked)
minHours           = appData.settings.minimumWeeklyHours

if remaining <= 0:
    // Target already met — recommend minimum hours for all remaining periods
    recommendedHours = minHours (for each remaining period)
    
else if remainingPeriods === 0:
    // No periods left — target cannot be met this quarter
    shortfall = remaining
    
else:
    // Calculate hours needed per period to close the gap
    hoursNeeded = Math.ceil(remaining / rate)  // total hours still needed (whole hours)
    extraHours  = hoursNeeded - (remainingPeriods * minHours)
    
    if extraHours <= 0:
        // Minimum hours across all remaining periods already exceeds target
        // All remaining periods at minHours, except first period gets the fractional extra
        // Actually: just recommend minHours for all, but flag that target will be met at minimum
        
    else:
        // Distribute extra hours across remaining periods, front-loaded
        // Each period can absorb at most (some reasonable max - minHours) extra hours
        // Build the schedule:
        hoursPerPeriod = []
        hoursStillNeeded = hoursNeeded
        for each remaining period:
            periodHours = Math.min(
                Math.ceil(hoursStillNeeded / periodsLeft),  // spread evenly across what's left
                reasonable_max  // don't exceed 40 hrs/week
            )
            periodHours = Math.max(periodHours, minHours)  // never below floor
            hoursPerPeriod.push(periodHours)
            hoursStillNeeded -= periodHours
            periodsLeft--
```

**Important nuance on the front-loading distribution:**

The algorithm should produce the same pattern as the manual analysis — give extra hours to the earliest remaining periods first. The approach:

1. Start with all remaining periods at `minHours`
2. Calculate `extraHoursNeeded = hoursNeeded - (remainingPeriods × minHours)`
3. If `extraHoursNeeded <= 0`, all periods stay at `minHours`
4. If `extraHoursNeeded > 0`, distribute +1 hour to periods starting from the first, until extras are consumed. If extras exceed `remainingPeriods` (meaning +1 each isn't enough), loop again adding another +1 to each from the front.
5. Cap at 40 hours per period. If the target is unreachable even at 40 hrs/period, flag a shortfall.

This produces schedules like: `[22, 22, 22, 22, 22, 22, 22, 22, 22, 21, 21, 21]` — the heavier periods up front, lighter ones at the end.

### Return Object

```javascript
{
    quarter: "Q1",                          // Current quarter label
    quarterStart: "2026-01-01",             // Quarter start date
    quarterEnd: "2026-03-31",               // Quarter end date
    target: 1890.00,                        // From settings
    
    // Progress
    completedPeriods: 5,                    // Periods with hours entered
    totalPeriodsInQuarter: 12,              // Total periods with payDate in this quarter
    remainingPeriods: 7,                    // Periods still available to work
    missedPeriods: 0,                       // Past periods with no hours
    
    quarterGross: 797.50,                   // Gross pay earned so far this quarter
    quarterHours: 110,                      // Hours worked so far this quarter
    remaining: 1092.50,                     // Dollars still needed (0 if target met)
    percentComplete: 42.2,                  // (quarterGross / target) × 100
    
    // Recommendation
    targetMet: false,                       // true if quarterGross >= target
    targetReachable: true,                  // false if can't reach target even at max hours
    shortfall: 0,                           // Dollars short if unreachable
    
    nextPeriodHours: 22,                    // Recommended hours for the NEXT unworked period
    nextPeriodNumber: 6,                    // Period number of the next unworked period
    nextPeriodPayDate: "1/11/2026",         // Pay date of next period (display format)
    
    // Full schedule for remaining periods
    schedule: [
        { period: 6, payDate: "2/11/2026", hours: 22 },
        { period: 7, payDate: "2/18/2026", hours: 22 },
        { period: 8, payDate: "2/25/2026", hours: 21 },
        // ...
    ],
    
    // Projected outcome
    projectedQuarterGross: 1892.25,         // quarterGross + (sum of schedule × rate)
    projectedQuarterHours: 261              // quarterHours + sum of scheduled hours
}
```

### Implementation Checklist

- [ ] Implement `calculateQuarterlyEarningsStatus()` in the calculation module
- [ ] Helper: `getQuarterForDate(date)` — returns `{ quarter: "Q1", start: Date, end: Date }` for any given date. Place in `utils.js`.
- [ ] Handle edge case: no pay periods exist for the employee (return a sensible empty/default status)
- [ ] Handle edge case: employee starts mid-quarter (fewer total periods, adjust accordingly)
- [ ] Handle edge case: target is 0 (feature effectively disabled — skip recommendations)
- [ ] Write tests:
  - [ ] Known scenario: 12-period quarter, $7.25 rate, $1,890 target, 20-hour minimum, 0 completed → schedule should be [22×9, 21×3] totaling 261 hours
  - [ ] Partially completed: 5 periods done at 22 hrs each → recalculate remaining 7 periods
  - [ ] Target already met: 10 periods at 22 hrs → `targetMet: true`, remaining periods at `minHours`
  - [ ] Unreachable: only 1 period left, need $500 more, 40-hr cap → `targetReachable: false`, `shortfall` populated
  - [ ] 14-period quarter at 20-hr minimum already exceeds target → all periods at `minHours`, `targetMet` note
  - [ ] Zero target → minimal/disabled response

### Verification

- [ ] Run full test suite
- [ ] Manually verify against the known 2026 schedule:
  - Q1 (12 periods): should produce [22×9, 21×3] = 261 hrs = $1,892.25
  - Q2 (13 periods): should produce [21×1, 20×12] = 261 hrs = $1,892.25
  - Q3 (14 periods): should produce [20×14] = 280 hrs = $2,030.00 (exceeds at minimum)
  - Q4 (13 periods): should produce [21×1, 20×12] = 261 hrs = $1,892.25

**GATE: All tests pass. Calculation matches known-good manual analysis.**

---

## Dashboard Widget

### UI Location

Add this widget to the Dashboard tab in `index.html`, visible when an employee is selected. Place it prominently — this is the primary planning tool the operator uses to decide hours for the next pay period.

### Widget Structure

The widget should have two visual sections:

**Section 1: Quarter Progress Summary**

A compact status display showing:

```
┌─────────────────────────────────────────────────────┐
│  Q1 2026 Earnings Target — ASHLEY GREEN             │
│                                                     │
│  Target: $1,890.00    Earned: $797.50 (42.2%)       │
│  ████████░░░░░░░░░░░░░  Remaining: $1,092.50        │
│                                                     │
│  Periods: 5 of 12 complete · 7 remaining            │
│  Hours worked: 110 · Projected total: 261           │
└─────────────────────────────────────────────────────┘
```

- Progress bar: green fill proportional to `percentComplete`
- If `targetMet`: bar is full green, text reads "✓ Target Met — $X earned"
- If `!targetReachable`: bar shows yellow/amber warning, "⚠ Target unreachable — $X shortfall"

**Section 2: Next Period Recommendation**

The key actionable output:

```
┌─────────────────────────────────────────────────────┐
│  NEXT PERIOD: #6 (Pay date: 2/11/2026)              │
│  Recommended hours: 22                              │
│                                                     │
│  Remaining schedule:                                │
│  P6: 22  P7: 22  P8: 21  P9: 21  P10: 21           │
│  P11: 21  P12: 20                                   │
│                                                     │
│  Projected quarter total: $1,892.25 (261 hrs)       │
└─────────────────────────────────────────────────────┘
```

- The "Recommended hours" value should be visually prominent (larger font or bold)
- The remaining schedule shows all remaining periods as compact `P#: hrs` pairs
- If target is already met, this section shows: "Target met. Schedule remaining periods at minimum (20 hrs)."

### Styling

- Follow existing PayTrax CSS patterns (`.card`, `.card-header`, `.card-body`)
- Progress bar: simple CSS bar (no libraries) using a div-within-div pattern
- Colors: green for on-track/met, amber for tight, red for unreachable
- The widget should be responsive and not break at narrow viewport widths

### Implementation Checklist

- [ ] Add the widget HTML structure to `index.html` inside the Dashboard tab content area
- [ ] Create rendering function `renderQuarterlyEarningsWidget(status)` in `ui.js`
  - Takes the return object from `calculateQuarterlyEarningsStatus()`
  - Builds the DOM content for both sections
  - Handles all states: on track, target met, unreachable, no data
- [ ] Wire the widget to update when:
  - The Dashboard tab is selected/shown
  - An employee is selected (if employee selector exists on dashboard)
  - Hours are entered/changed for any period (the status changes as periods complete)
  - Settings are changed (target or minimum hours updated)
- [ ] If no employee exists, show a placeholder: "Add an employee to see quarterly earnings tracking."
- [ ] If `quarterlyEarningsTarget` is 0, hide the widget entirely (feature disabled)
- [ ] Add CSS for the progress bar and recommendation display — keep it minimal, using existing PayTrax style variables where possible

### Verification

- [ ] Run full test suite
- [ ] Visual check: load PayTrax with the 2026 backup data, navigate to Dashboard
- [ ] Verify the widget shows correct Q1 2026 data (assuming some periods are completed)
- [ ] Change the target in Settings to $1,500, return to Dashboard — verify the widget updates
- [ ] Change minimum hours to 15, verify the schedule recalculates
- [ ] Set target to 0, verify widget hides
- [ ] Test with no employees — verify placeholder message

**GATE: All tests pass. Widget renders correctly. Recommendations match manual calculations.**

---

## Summary of Files Modified

| File | Changes |
|------|---------|
| `state.js` | Add `quarterlyEarningsTarget` and `minimumWeeklyHours` to defaults, increment version |
| `migration.js` | Add migration for new settings fields |
| `logic.js` | Add `calculateQuarterlyEarningsStatus()` function |
| `utils.js` | Add `getQuarterForDate()` helper |
| `ui.js` | Add `renderQuarterlyEarningsWidget()`, wire settings form for new fields |
| `index.html` | Add settings inputs, add dashboard widget HTML structure |
| Test files | Add tests for calculation function and quarter helper |

No existing calculation logic is modified. No existing data structures change shape. The migration only adds new fields with defaults.

---

## Appendix: Quarter-to-Pay-Period Mapping

PayTrax assigns pay periods to quarters based on `payDate`, not `startDate` or `endDate`. This is consistent with IRS Form 941 reporting — wages are reported in the quarter the employee is paid, not the quarter the work was performed.

For 2026 with weekly pay, Wednesday paydays, and `daysUntilPayday = 3` (period ends Sunday, paid Wednesday):

| Quarter | Pay Date Range | Periods | Min-20 Gross |
|---------|---------------|---------|-------------|
| Q1 | 1/7 – 3/25 | 12 | $1,740.00 |
| Q2 | 4/1 – 6/24 | 13 | $1,885.00 |
| Q3 | 7/1 – 9/30 | 14 | $2,030.00 |
| Q4 | 10/7 – 12/30 | 13 | $1,885.00 |

The uneven distribution (12/13/14/13 = 52) means the algorithm must dynamically count periods per quarter rather than assuming 13.
