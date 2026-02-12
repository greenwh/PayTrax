# PayTrax Critical Fix: Enforce Wage Base Caps at Calculation Time

## Problem Statement

The payroll calculation function (`recalculatePeriod` in `logic.js`) applies FICA (Social Security), FUTA, and SUTA taxes as flat percentages of gross pay every period with no regard for YTD cumulative wages. The statutory wage base caps (`ssWageBase`, `futaWageBase`) exist in settings but are never consulted during calculation. Additionally, no SUTA wage base setting exists at all — Oklahoma has a configurable SUTA taxable wage base ($25,000 for 2026).

The downstream report generators (941, 940, W-2) already apply caps retroactively when building reports, so annual/quarterly summary numbers are correct. But the per-period tax amounts stored in each pay period record (`p.taxes.fica`, `p.taxes.futa`, `p.taxes.suta`) are wrong once an employee exceeds any wage base. This causes:

- **Tax deposit reports** to overstate amounts owed (they sum raw per-period taxes)
- **Bank register entries** to overstate payroll cost (they include over-calculated employer taxes)
- **Employee FICA withholding** to continue past the SS wage base

This is a **critical fix**. PayTrax is a production payroll system. Every change must preserve existing data integrity, maintain the running-remainder rounding strategy, and not break the report generators that already handle caps in their own logic.

-----

## Architecture Overview (Read Before Coding)

### Calculation Flow

There are two paths into payroll calculation:

1. **Single period** — `calculatePayFromData()` (line 294) → `recalculatePeriod()` (line 163)
1. **Full sequential recalculation** — `recalculateAllPeriodsForEmployee()` (line 128) resets `taxRemainders` to zero, then calls `recalculatePeriod()` for each period in order

Path 2 is triggered automatically when editing an earlier period that has later periods with data (line 322). It is also triggered on settings changes and pay period regeneration.

### Key Function: `recalculatePeriod()` (logic.js, line 163)

This is the ONLY function that computes taxes. Lines 203-209 are the problem:

```javascript
calculateTaxWithRemainder('fica', grossPay * (socialSecurity / 100));
calculateTaxWithRemainder('medicare', grossPay * (medicare / 100));
calculateTaxWithRemainder('suta', grossPay * (sutaRate / 100));
calculateTaxWithRemainder('futa', grossPay * (futaRate / 100));
```

These must be modified to compute taxable wages (capped by wage base minus YTD) before applying the rate.

### Running Remainder System

The `calculateTaxWithRemainder` helper (line 194) handles fractional-cent accumulation across periods. It takes a raw tax amount, adds the prior remainder, rounds to the nearest cent, and stores the new remainder. This system must continue to work correctly — the input to it simply needs to change from `grossPay * rate` to `taxableWages * rate` where `taxableWages` respects the cap.

### YTD Wage Computation Strategy

The `recalculatePeriod` function has access to `appData.payPeriods[employeeId]` — the full array of all periods for that employee. To determine YTD gross wages prior to the current period, sum `grossPay` from all earlier periods in the same tax year that have been calculated (grossPay > 0).

**This is safe in both calculation paths:**

- In single-period mode, all prior periods already have their final `grossPay` values stored.
- In sequential recalculation mode, `recalculateAllPeriodsForEmployee` processes periods in order, so by the time period N is calculated, periods 1 through N-1 have already been recalculated with correct `grossPay`.

This is the same pattern already used by `generate941Report` (line 904-914) and `generate940Report` (line 1025-1038).

-----

## Changes Required

### 1. Add SUTA Wage Base Setting

**File: `state.js`**

Add `sutaWageBase: 25000` to `defaultAppData.settings` (line 34, near `sutaRate`).

Also add an exported constant `SUTA_WAGE_BASE = 25000` alongside the existing `SS_WAGE_BASE` and `FUTA_WAGE_BASE` constants (lines 17-18).

Add backward-compatibility check in `loadData()` (after line 136, following the pattern of ssWageBase/futaWageBase checks):

```javascript
if (appData.settings.sutaWageBase === undefined) {
    appData.settings.sutaWageBase = defaultAppData.settings.sutaWageBase;
}
```

**File: `migration.js`**

Increment `CURRENT_VERSION` in `state.js` from 7 to 8.

Add `migrateToV8` function following the established pattern:

```javascript
function migrateToV8(data) {
    console.log("Running migration to v8...");
    if (data.settings && data.settings.sutaWageBase === undefined) {
        data.settings.sutaWageBase = 25000;
    }
    data.version = 8;
}
```

Add case 7 to the switch in `migrateData()` (line 174):

```javascript
case 7:
    migrateToV8(data);
    // Fall-through is intentional for future migrations
    break;
```

**File: `index.html`**

Add a SUTA Wage Base input field in the “Tax Wage Limits & Thresholds” section (after line 216, following the FUTA Wage Base field):

```html
<div class="form-group">
    <label class="form-label">SUTA Wage Base ($)</label>
    <input type="number" id="sutaWageBase" class="form-input" value="25000" step="1" min="1">
</div>
```

**File: `logic.js`**

Add to `updateSettingsFromUI()` (after line 678):

```javascript
appData.settings.sutaWageBase = parseFloat(document.getElementById('sutaWageBase').value);
```

**File: `ui.js`**

Add to the settings population function (after line 50):

```javascript
document.getElementById('sutaWageBase').value = settings.sutaWageBase;
```

-----

### 2. Enforce Wage Base Caps in `recalculatePeriod()` (THE CORE FIX)

**File: `logic.js`, function `recalculatePeriod()` starting at line 163**

**Before the tax calculations (before line 203), add YTD wage computation:**

```javascript
// Compute YTD gross wages BEFORE this period for wage base cap enforcement
const year = new Date(period.payDate).getFullYear();
const allPeriodsForEmployee = appData.payPeriods[employeeId] || [];
let ytdGrossBeforeThisPeriod = 0;

allPeriodsForEmployee.forEach(p => {
    if (p.period < period.period
        && new Date(p.payDate).getFullYear() === year
        && p.grossPay > 0) {
        ytdGrossBeforeThisPeriod += p.grossPay;
    }
});

// Retrieve wage base settings
const ssWageBase = appData.settings.ssWageBase || 168600;
const futaWageBase = appData.settings.futaWageBase || 7000;
const sutaWageBase = appData.settings.sutaWageBase || 25000;

// Calculate taxable wages for each capped tax type
// If YTD already exceeds the cap, taxable wages for this period = 0
// If this period's gross crosses the cap, only the portion below the cap is taxable
function getTaxableWages(ytdBefore, currentGross, wageBase) {
    if (ytdBefore >= wageBase) return 0;
    return Math.min(currentGross, wageBase - ytdBefore);
}

const ssTaxableWages = getTaxableWages(ytdGrossBeforeThisPeriod, grossPay, ssWageBase);
const futaTaxableWages = getTaxableWages(ytdGrossBeforeThisPeriod, grossPay, futaWageBase);
const sutaTaxableWages = getTaxableWages(ytdGrossBeforeThisPeriod, grossPay, sutaWageBase);
```

**Then modify lines 203-209 to use taxable wages instead of gross pay for capped taxes:**

```javascript
calculateTaxWithRemainder('federal', grossPay * (employee.fedTaxRate / 100));      // NO cap — unchanged
calculateTaxWithRemainder('state', grossPay * (employee.stateTaxRate / 100));       // NO cap — unchanged
calculateTaxWithRemainder('local', grossPay * (employee.localTaxRate / 100));       // NO cap — unchanged
calculateTaxWithRemainder('fica', ssTaxableWages * (socialSecurity / 100));         // CAPPED by SS wage base
calculateTaxWithRemainder('medicare', grossPay * (medicare / 100));                 // NO cap — unchanged (Additional Medicare has its own threshold; the base Medicare rate has no cap)
calculateTaxWithRemainder('suta', sutaTaxableWages * (sutaRate / 100));             // CAPPED by SUTA wage base
calculateTaxWithRemainder('futa', futaTaxableWages * (futaRate / 100));             // CAPPED by FUTA wage base
```

**IMPORTANT NOTES:**

- Medicare has NO wage base cap. The Additional Medicare Tax (0.9%) kicks in above $200,000 but the base 1.45% applies to all wages. Do NOT cap Medicare.
- Federal, state, and local income tax withholding have no wage base caps. Do NOT change those lines.
- The `calculateTaxWithRemainder` function itself does NOT change. Only the values fed into it change.
- The `getTaxableWages` helper should be a local function within `recalculatePeriod`, not exported.

-----

### 3. Update Bank Register Calculation

**File: `logic.js`, line 247**

The bank register entry (line 247) currently uses:

```javascript
const totalPayrollCost = grossPay + rounded.suta + rounded.futa + rounded.fica + rounded.medicare;
```

This will now automatically be correct because `rounded.suta`, `rounded.futa`, and `rounded.fica` will already reflect the capped amounts from the modified calculation above. **No change needed to this line** — it self-corrects once the upstream tax amounts are right.

Similarly, `employeeTaxes` on line 214 and `netPay` on line 219 will automatically be correct.

-----

### 4. Review Report Generators (Likely No Changes Needed, But Verify)

The report generators already apply their own wage base cap logic for summary reporting. Now that per-period amounts will also be capped, verify that the reports don’t double-apply caps.

**941 Report (`generate941Report`, line 869):**

- Lines 925-928 compute `line5a_col1` (taxable SS wages) using YTD tracking against `ssWageBase`. This is for the **wage** amount on Form 941 Line 5a Column 1 — it should stay as-is because it’s computing total taxable wages, not tax amounts.
- Line 939 computes `rounded941TaxThisPeriod` from `p.taxes.federal + (p.taxes.fica * 2) + (p.taxes.medicare * 2)`. Since `p.taxes.fica` will now be capped at calculation time, this will produce correct deposit totals. No double-counting.
- **Verify:** Line 956 computes `line5a_col2 = line5a_col1 * ficaTotalRate`. This independently recalculates the tax from capped wages. Compare this against the sum of `p.taxes.fica * 2` across the quarter — they should now closely match (within rounding). Previously they diverged. This is the desired outcome.

**940 Report (`generate940Report`, line 1012):**

- Lines 1035-1038 compute taxable FUTA wages per period with YTD tracking. This computes the **tax from wages**, not from stored `p.taxes.futa`.
- Check whether the 940 report uses `p.taxes.futa` anywhere for its totals. If it only uses its own YTD-tracked calculation, no change needed.

**W-2 Report (`generateW2Report`, line 829):**

- Line 849 sums `p.taxes.fica` across all periods for Box 4 (SS tax withheld). Since `p.taxes.fica` will now be capped, Box 4 will automatically be correct. Previously it would have been overstated if an employee exceeded the SS wage base.
- Lines 841-847 independently compute `ssWages` for Box 3 using YTD tracking. This stays as-is.
- **Verify:** Box 4 (sum of `p.taxes.fica`) should closely match Box 3 (`ssWages`) × 6.2%. Previously it would have been higher.

**Tax Deposit Report (`generateTaxDepositReportFromData`, line 700):**

- Line 761: `case 'futa': totalLiability += p.taxes.futa;` — this directly sums per-period amounts. With the fix, these will now be correct. No change needed.
- Line 762: same for SUTA.
- Line 753-756: Federal payroll sums `p.taxes.fica * 2`. Will now be correct automatically.

**PDF Export (`pdf-export.js`):**

- Search for any references to `p.taxes.futa`, `p.taxes.fica`, `p.taxes.suta` and verify they’ll work correctly with capped values. The 940 PDF export (line 384) uses its own YTD calculation like the HTML version.

-----

### 5. Import Constant in logic.js

`logic.js` line 9 currently imports:

```javascript
import { appData, SS_WAGE_BASE, FUTA_WAGE_BASE } from './state.js';
```

Add `SUTA_WAGE_BASE` to this import if you create the constant. However, since the code should prefer `appData.settings.sutaWageBase` (the configurable value) with the constant as fallback, this import is optional but maintains consistency with how `SS_WAGE_BASE` and `FUTA_WAGE_BASE` are used throughout.

-----

## Testing Checklist

After implementing, verify ALL of the following:

### Calculation Tests

1. **Fresh payroll run** — Enter hours for an employee in Period 1. Verify FICA, FUTA, SUTA taxes appear correctly.
1. **YTD under all caps** — Run several periods where YTD stays below $7,000. All taxes should calculate normally.
1. **FUTA cap hit** — Continue running periods until YTD exceeds $7,000. Verify `p.taxes.futa` drops to $0.00 for the period that crosses the cap (only the below-cap portion should be taxed). Verify all subsequent periods show $0.00 FUTA.
1. **SUTA cap hit** — Continue until YTD exceeds $25,000. Same verification as FUTA.
1. **SS cap** — Would need wages over $176,100 (2025) to test fully. At minimum, verify the logic path is correct by temporarily setting `ssWageBase` to a low test value, running payroll, and confirming FICA stops.
1. **Cap crossing period** — When gross for a period straddles the cap (e.g., YTD is $6,800 and gross is $500, so $200 is taxable for FUTA), verify the math: FUTA should be 0.6% × $200 = $1.20, not 0.6% × $500 = $3.00.
1. **Edit earlier period** — Edit Period 1 hours to a different value. Verify all subsequent periods are recalculated and caps are still correctly applied.
1. **Running remainders preserved** — After recalculation, verify fractional-cent remainders accumulate correctly and don’t produce rounding drift.

### Report Tests

1. **Tax Deposit Report** — Generate a deposit report for a period after the FUTA cap was hit. Verify FUTA shows $0.00 (or correct partial amount for the crossing period).
1. **941 Report** — Generate for a quarter. Verify Line 5a column 2 (SS tax) closely matches the sum of `p.taxes.fica * 2` for that quarter’s periods. Previously these diverged.
1. **940 Report** — Generate for the year. Verify totals are consistent.
1. **W-2 Report** — Generate for the year. Verify Box 4 ≈ Box 3 × 6.2%.
1. **Bank Register** — Verify payroll debit entries reflect capped tax amounts, not over-calculated amounts.

### Migration Tests

1. **Import old backup** — Import the existing `PayTrax_Backup_2026-01-01.json` (version 7). Verify migration adds `sutaWageBase: 25000` to settings and stamps version 8.
1. **Recalculate after import** — After importing, trigger a full recalculation (e.g., change and save settings). Verify all historical periods are recalculated with caps applied.

### UI Tests

1. **Settings form** — Verify SUTA Wage Base field appears in the “Tax Wage Limits & Thresholds” section, loads correctly, and saves correctly.
1. **Change wage base** — Modify the SUTA wage base in settings, save, and verify recalculation reflects the new value.

-----

## Files Modified (Summary)

|File          |Changes                                                                                                                                                                        |
|--------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|`state.js`    |Add `SUTA_WAGE_BASE` constant, add `sutaWageBase` to `defaultAppData.settings`, add backward-compat check in `loadData()`, increment `CURRENT_VERSION` to 8                    |
|`migration.js`|Add `migrateToV8()`, add case 7 to switch                                                                                                                                      |
|`logic.js`    |Add YTD computation + `getTaxableWages` helper + capped tax lines in `recalculatePeriod()`. Add `sutaWageBase` to `updateSettingsFromUI()`. Optionally import `SUTA_WAGE_BASE`.|
|`index.html`  |Add SUTA Wage Base input field in settings                                                                                                                                     |
|`ui.js`       |Add `sutaWageBase` to settings population                                                                                                                                      |

-----

## What NOT to Change

- **Do NOT modify the `calculateTaxWithRemainder` helper function.** It works correctly; only its inputs change.
- **Do NOT add wage base cap logic to report generators.** They already handle it independently for summary purposes. With per-period amounts now correct, the reports will naturally produce consistent results.
- **Do NOT change Medicare calculation.** Base Medicare (1.45%) has no wage base cap. Additional Medicare (0.9% above $200,000) is a separate concern already handled in the 941 report.
- **Do NOT change federal, state, or local income tax withholding.** These have no wage base caps.
- **Do NOT modify the bank register `addTransaction` call on line 247.** It automatically reflects corrected tax amounts.
- **Do NOT change `employeeTaxes` calculation on line 214 or `netPay` on line 219.** These derive from the `rounded` object which will now contain correct values.
- **Do NOT alter the `taxRemainders` reset in `recalculateAllPeriodsForEmployee` (line 136).** The sequential processing already handles remainder accumulation correctly.