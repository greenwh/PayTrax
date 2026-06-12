# PayTrax Effective-Dated Rates — Implementation Plan

**Date:** 2026-06-12
**Motivation:** Audit finding F7 (`PayTrax_Audit_Report_2026-06-10.md`): changing an employee's hourly rate or the SUTA rate retroactively rewrites every period in the tax year, including already-paid ones. This plan retires that hazard for the rates where mid-year changes realistically occur, while keeping the deterministic recompute-from-inputs architecture intact.
**Baseline:** main @ `2911159` (data v12, 378 tests green).

---

## 1. Scope decision (the most important call in this plan)

### Gets an effective-date history (4 employee fields + 1 setting)

| Field | Why |
|---|---|
| `employee.rate` (hourly) | The most dangerous retroactive rewrite — changes gross/net of already-paid checks |
| `employee.fedTaxRate` | Mid-year withholding adjustments are a normal, legitimate action |
| `employee.stateTaxRate` | Same |
| `employee.localTaxRate` | Same |
| `settings.sutaRate` | States can revise mid-year (the scenario that prompted this) |

### Stays a plain scalar (unchanged behavior, documented)

`socialSecurity`, `medicare`, `futaRate`, all wage bases and thresholds, `overtimeMultiplier`, `holidayMultiplier`, `ptoAccrualRate`.

**Rationale:** these are statutory or structural values that change only on January 1 — a mid-year edit to them is a *typo correction*, and a correction **wants** the existing full-year recalculation. Critically, this scoping means the 941/940 report derivations (`compute941Data` uses SS/Medicare rates; `compute940Data` uses FUTA rate) are **untouched** — verified: the only rate re-derivation in `reports.js` is `settings.futaRate` (lines ~387, ~594) and SS/Medicare in the 941; SUTA deposit reports sum stored `p.taxes.suta` (lines ~87, ~750, ~895). Zero report code changes.

---

## 2. Data model

### History format (shared by all five)

```js
[{ effectiveDate: 'YYYY-MM-DD', value: 25.00 }, ...]  // kept sorted by effectiveDate
```

### Employee (new in v13)

```js
employee.rateHistories = {
    rate:         [{ effectiveDate: '2000-01-01', value: <current rate> }],
    fedTaxRate:   [{ effectiveDate: '2000-01-01', value: <current> }],
    stateTaxRate: [{ effectiveDate: '2000-01-01', value: <current> }],
    localTaxRate: [{ effectiveDate: '2000-01-01', value: <current> }]
}
```

The existing scalar fields (`rate`, `fedTaxRate`, …) are **kept** and mean "value currently in force (as of today)" — same precedent as v12's computed `ptoBalance`. They are re-synced from the histories inside `recalculateAllPeriodsForEmployee()`. All existing display/validation code keeps working; the histories are the source of truth.

### Settings (new in v13)

```js
settings.sutaRateHistory = [{ effectiveDate: '2000-01-01', value: <current sutaRate> }]
```

`settings.sutaRate` likewise remains as the resolved-current scalar.

### Per-period stored rate

`recalculatePeriod()` stores `period.appliedHourlyRate` so pay stubs and PDFs can show the rate that was actually used for that period (today they show `employee.rate`, which would be wrong for historical stubs after a raise).

### Migration v13 (`js/migration.js`)

- For each employee missing `rateHistories`: seed each of the four histories with a single `{ effectiveDate: '2000-01-01', value: <scalar> }` entry ('2000-01-01' matches the v6 deduction-createdDate precedent — "applies to everything").
- Seed `settings.sutaRateHistory` the same way if missing.
- `CURRENT_VERSION = 13`; `case 12:` added to the fall-through switch.
- Update migration tests: chain assertions v12 → v13, adoption test, idempotency test, plus `createTestEmployee`/`createTestSettings` fixtures gain the new fields.

---

## 3. Resolution semantics

New pure helper (in `js/utils.js`, beside `escapeHtml`):

```js
export function resolveRate(history, dateStr, fallback) {
    if (!Array.isArray(history) || history.length === 0) return fallback;
    const sorted = history.slice().sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
    let result = sorted[0].value;                    // dates before first entry use first entry
    for (const entry of sorted) {
        if (entry.effectiveDate <= dateStr) result = entry.value;
        else break;
    }
    return result;
}
```

- **A period uses the rate in force on its `payDate`** (not start/end date). This matches the deduction `createdDate <= payDate` rule and the constructive-receipt principle. Document it: a raise effective July 1 first applies to the period whose *pay date* is on/after July 1.
- String comparison works because dates are `YYYY-MM-DD` (v9 convention) — no Date parsing needed.
- `fallback` is the legacy scalar, making the calc robust even against un-migrated data.

---

## 4. Calculation changes (`js/logic.js`)

All inside `recalculatePeriod()` — the running-remainder, wage-cap, deduction, and PTO logic are untouched (caps key off gross wages; remainders are sequential and already recalculated from scratch):

```js
const hourlyRate = resolveRate(employee.rateHistories?.rate, period.payDate, employee.rate);
const earnings = {
    regular: hours.regular * hourlyRate,
    overtime: hours.overtime * hourlyRate * employee.overtimeMultiplier,
    holiday: hours.holiday * hourlyRate * employee.holidayMultiplier,
    pto: hours.pto * hourlyRate
};
period.appliedHourlyRate = hourlyRate;
// ...
calculateTaxWithRemainder('federal', grossPay * (resolveRate(employee.rateHistories?.fedTaxRate, period.payDate, employee.fedTaxRate) / 100));
// state/local: same pattern
calculateTaxWithRemainder('suta', sutaTaxableWages * (resolveRate(appData.settings.sutaRateHistory, period.payDate, sutaRate) / 100));
```

In `recalculateAllPeriodsForEmployee()`, after the loop, sync the current scalars:

```js
const today = formatDate(new Date());
employee.rate = resolveRate(employee.rateHistories?.rate, today, employee.rate);
// fed/state/local: same; settings.sutaRate synced once in generatePayPeriods()
```

Other consumer: the quarterly-earnings scheduler (`logic.js` ~506) uses `employee.rate` for *projections* — current-rate semantics is correct there; no change needed once the scalar is synced.

---

## 5. UI changes

Principle: **one shared "Changes Effective" date** per form, not four separate pickers — keeps the form sane.

### Employee form (`index.html`, `js/employees.js`, `js/ui.js`, `js/main.js`)

1. Add a "Changes Effective" date input next to the rate fields, **defaulting to today**, only visible when editing an existing employee (new employees just get a '2000-01-01' seed entry — no date question to answer).
2. `saveEmployeeFromForm()` semantics, per rate field: if the form value differs from `resolveRate(history, effectiveDate)`, **upsert** `{ effectiveDate, value }` (replace an entry with the same date, else insert). Unchanged values are a no-op — saving the form without touching rates must not pollute histories.
3. **Rate History table** (same visual pattern as the deductions table): rows of *field / effective date / value / Delete*. Deleting recalculates. Deleting the last remaining entry of a history is forbidden (toast). Editing an entry's value = upsert at the same date — this is how a **full-year correction** is done: fix the original entry instead of adding a new one.
4. After save or history edit: `recalculateAllPeriodsForEmployee(id)` → `saveDataImmediate()` → `logAudit('Rate Changed', ...)` with field, value, and effective date.

### Settings — SUTA (`index.html`, `js/logic.js::updateSettingsFromUI`, `js/main.js::handleSettingsChange`)

1. Small "effective" date input beside the SUTA rate field (default today) + a compact history line/table.
2. Same upsert-if-changed rule inside the settings flow; existing blocking validation applies to the entered value (same 0–15 range).
3. `generatePayPeriods()` already recalculates everyone — no new wiring needed beyond the upsert.

### Display fixes

- `ui.js::renderPayStubUI` (~288–291) and `pdf-export.js::exportPayStubToPDF` (~81–84): use `period.appliedHourlyRate ?? employee.rate` for the per-row rate columns.
- Employee form rate fields display the **current** scalars (already synced) — unchanged.

---

## 6. Tests (write the killer test first)

New file `tests/integration/effective-rates.test.js`:

1. **The F7-retirement test (must fail on current main):** calculate periods 1–13 at $25/hr; add history entry `{July 1, $30}`; recalculate → periods paid before July 1 are **byte-identical** (gross, taxes, remainders, bank register amounts), later periods use $30.
2. Same shape for a SUTA change: pre-boundary `period.taxes.suta` and register entries unchanged; post-boundary at new rate.
3. Withholding change (fedTaxRate) mid-year: old stubs' federal amounts unchanged.
4. Boundary semantics: a period with payDate exactly on the effective date uses the new rate; payDate one day before uses the old.
5. Correction semantics: editing the '2000-01-01' entry's value recalculates the entire year (the old full-year behavior, now opt-in).
6. Idempotency: recalculating twice with a multi-entry history changes nothing.
7. Wage-cap interaction: a mid-year raise that pushes an employee across the SS wage base still caps correctly.

Plus: `resolveRate` unit tests (empty/missing history → fallback, before-first-entry, exact-date, between entries, unsorted input, last entry), migration v13 tests, and updating `createTestAppData` to v13.

Existing 378 tests must stay green — the fallback parameter means fixtures without histories keep working during development.

---

## 7. Implementation phases (in order, suite green after each)

1. **Resolver + migration v13 + fixtures** — pure additions, nothing consumes them yet.
2. **Calculation core** — `recalculatePeriod` resolution, `appliedHourlyRate`, scalar sync; integration tests incl. the F7-retirement test (verify it fails pre-change by stashing, as done for the audit fixes).
3. **UI** — employee form effective date + history table; settings SUTA.
4. **Display** — stub/PDF applied-rate columns.
5. **Docs + ship** — CLAUDE.md (v13, new model), User Manual (replace the scary F7 warning with: *rate changes take effect from their effective date; only edits to an existing history entry recalculate the past; SS/Medicare/FUTA/wage-base edits still apply to the whole year*), bump SW cache to `paytrax-cache-v17`, full suite, commit on a branch.

## 8. Explicitly out of scope

- Histories for SS/Medicare/FUTA, wage bases, thresholds, multipliers, PTO accrual rate (full-year semantics retained and documented)
- Multi-year rate management (the app is single-tax-year; year rollover unchanged)
- Retroactive *hours* protection (hours are per-period inputs; not affected by F7)

## 9. Open questions (defaults chosen; veto before Phase 1)

1. **Effective-date default = today.** Alternative: blank-and-required. Today is the fewest-clicks path for "my rate changed this week."
2. **Histories keyed under one `rateHistories` object** per employee vs. four sibling fields. One object keeps `saveEmployeeFromForm` generic.
3. **Period boundary = pay date.** Alternative: period end date. Pay date matches deductions and constructive receipt.
