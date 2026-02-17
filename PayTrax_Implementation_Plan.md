# PayTrax Improvement Plan — Claude Code Implementation Guide

**Prepared:** February 16, 2026
**For:** Claude Code Opus execution
**Context:** PayTrax is the production payroll system for LifeLink Family Services LLC (EIN 39-2394456), a single-member Oklahoma LLC. This system calculates tax withholding, employer contributions, and generates data used to prepare federal (941, 940, W-2) and state filings. Every change carries compliance, financial, and legal risk. Treat this codebase with the gravity of production financial software.

**Working Rule:** Before executing ANY change in any phase, run the full existing test suite and confirm it passes. After EVERY change, run the full test suite again. If any test fails, stop and diagnose before proceeding.

---

## Pre-Flight: Understand the Codebase

Before touching anything, read and internalize these files in order:

1. `state.js` — State shape, defaults, persistence, constants
2. `logic.js` — Core calculation engine (the heart of PayTrax)
3. `validation.js` — Input validation framework
4. `migration.js` — Data schema versioning chain (v1→v8)
5. `banking.js` — Bank register, CSV import, reconciliation
6. `main.js` — Event wiring, initialization
7. `ui.js` — DOM rendering
8. `utils.js` — Date formatting and period parsing
9. `data-io.js` — JSON import/export
10. `db.js` — IndexedDB wrapper
11. `pdf-export.js` — PDF generation
12. `index.html` — UI structure
13. `paytrax-wage-cap-fix.md` — Documents a critical prior fix; explains the running-remainder system and wage base cap architecture

Also read: `info.txt` (business identity), `PayTrax_Backup_2026-01-01.json` (real production data — use as reference, never modify).

---

## Phase 0: Test Coverage Audit

**Status:** Automated testing has been implemented. This phase verifies completeness, not builds from scratch.

**Goal:** Confirm the existing test suite covers all mission-critical calculation paths. Identify and fill any gaps.

### 0.1 — Inventory Existing Tests

- [ ] Locate the test directory and test runner configuration
- [ ] List every test file and summarize what each tests
- [ ] Map test coverage against the critical functions listed in 0.2–0.4
- [ ] Report: "These critical paths ARE covered / These critical paths are NOT covered"

### 0.2 — Core Calculation Coverage Check

Verify tests exist for each of these. If a test is missing, write it.

**`recalculatePeriod()` (logic.js ~line 163):**
- [ ] Basic calculation: known hours × known rate = expected gross, expected taxes, expected net
- [ ] All 7 tax types computed correctly: federal, state, local, fica, medicare, suta, futa
- [ ] Running remainder: verify fractional cents accumulate correctly across 2+ sequential periods
- [ ] Running remainder: verify that `recalculateAllPeriodsForEmployee()` resets remainders and produces identical results to a fresh sequential calculation

**Wage base cap enforcement (`getTaxableWages` pattern):**
- [ ] SS cap: period where YTD is below cap → full gross is FICA-taxable
- [ ] SS cap: period where YTD crosses the $168,600 cap → only the portion below cap is taxable
- [ ] SS cap: period where YTD already exceeds cap → FICA taxable wages = $0, FICA tax = $0
- [ ] FUTA cap: same three scenarios against $7,000 base
- [ ] SUTA cap: same three scenarios against $25,000 base (Oklahoma)
- [ ] Verify caps are independent: employee can hit FUTA cap while still below SUTA cap

**Deductions (`calculateDeductions()`):**
- [ ] Fixed deduction applied correctly
- [ ] Percentage deduction applied correctly (percentage of gross)
- [ ] `createdDate` filtering: deduction created AFTER the pay date is NOT applied
- [ ] `createdDate` filtering: deduction with no `createdDate` (legacy data) IS applied to all periods
- [ ] Multiple deductions sum correctly

**Period generation (`generateBasePayPeriods()`):**
- [ ] Weekly frequency generates correct number of periods for a year
- [ ] Pay dates offset by `daysUntilPayday` from end date
- [ ] Year boundary: periods don't extend beyond the tax year

### 0.3 — Report Generator Coverage Check

Verify tests exist for each. If missing, write them.

**`generate941Report()`:**
- [ ] Quarterly totals match sum of per-period values
- [ ] Line 5a (SS wages) respects the SS wage base cap
- [ ] Line 5c (Medicare wages) = total gross (no cap)
- [ ] Federal payroll tax = federal WH + (FICA × 2) + (Medicare × 2) — employer + employee shares
- [ ] Fractions-of-cents adjustment (line 7) = deposited taxes minus unrounded taxes
- [ ] Monthly liability breakdown sums to quarterly total

**`generate940Report()`:**
- [ ] Annual FUTA taxable wages respect the $7,000 per-employee cap
- [ ] Excess wages (line 5) = total wages minus taxable wages per employee exceeding cap
- [ ] Quarterly liability breakdown present when total > $500

**`generateW2Report()`:**
- [ ] Box 1 (wages) = total gross
- [ ] Box 3 (SS wages) capped at SS wage base
- [ ] Box 4 (SS tax withheld) = employee FICA only (not employer share)
- [ ] Box 5 (Medicare wages) = total gross (no cap)
- [ ] Box 6 (Medicare tax) = employee Medicare only

### 0.4 — Edge Case Coverage Check

- [ ] Zero-hour period produces $0 across all fields
- [ ] Employee with all tax rates set to 0%
- [ ] Deduction that would make net pay negative — verify behavior is defined
- [ ] `calculatePayFromData()` with invalid employee ID returns null
- [ ] `calculatePayFromData()` with invalid period number returns null

### 0.5 — Deliverable

Produce a brief summary: "Test coverage audit complete. X tests existed, Y gaps identified, Z tests added. All tests pass."

**GATE: Do not proceed to Phase 1 until all tests in 0.2–0.4 exist and pass.**

---

## Phase 1: Eliminate Calculation Duplication

**Context:** There are two near-identical implementations of the payroll tax calculation:

1. `recalculatePeriod()` (logic.js ~line 163) — the "pure" version that reads from stored period data
2. `recalculateSinglePeriodFromUI()` (logic.js ~line 394) — reads hours from DOM, identical tax math

This duplication is the single most dangerous pattern in the codebase. If a tax law changes and one copy is updated but not the other, PayTrax silently produces wrong numbers depending on which code path executes.

### 1.1 — Verify Dead Code Status

- [ ] Search the ENTIRE codebase (all .js and .html files) for any reference to `recalculateSinglePeriodFromUI`
- [ ] Check: Is it called from any function? Is it referenced in any event handler? Is it exported?
- [ ] **Expected result:** It should be dead code — `calculatePay()` calls `calculatePayFromData()`, which calls `recalculatePeriod()` or `recalculateAllPeriodsForEmployee()`. The UI function should never be reached.
- [ ] If it IS called somewhere, STOP and report — we need to understand the call path before removing it

### 1.2 — Remove Dead Code

- [ ] If confirmed dead: delete the entire `recalculateSinglePeriodFromUI()` function (~lines 394–521)
- [ ] Run full test suite — all tests must pass
- [ ] Verify the active calculation path is: `calculatePay()` → `calculatePayFromData()` → `recalculatePeriod()` (single period) or `recalculateAllPeriodsForEmployee()` → `recalculatePeriod()` (sequential)

### 1.3 — Verification

- [ ] Run full test suite
- [ ] Load the PayTrax backup data and verify at least 3 pay periods produce identical calculated values to what's stored in the backup (compare grossPay, taxes.fica, taxes.futa, taxes.suta, netPay)

**GATE: All tests pass. No calculation output has changed.**

---

## Phase 2: Data Integrity & Persistence Hardening

**Context:** `saveData()` is async (IndexedDB writes) but is called without `await` in most places throughout `main.js`. This means data can be lost if the browser closes before the write completes, and race conditions can occur on rapid interactions.

### 2.1 — Audit All saveData() Call Sites

- [ ] Search the entire codebase for every call to `saveData()`
- [ ] For each call site, determine: Is it awaited? Is it in an async function? Could it race with another save?
- [ ] Produce a list of all non-awaited save calls

### 2.2 — Implement Save Queue / Debounce

The goal is NOT to make every handler async (that would require rewriting all event handlers). Instead:

- [ ] Implement a debounced save mechanism in `state.js`: when `saveData()` is called, it sets a short timer (e.g., 300ms). If called again before the timer fires, the timer resets. When the timer fires, the actual async write executes.
- [ ] This ensures rapid changes (e.g., typing in hours fields) produce one write, not many
- [ ] The debounced save should still be callable with `await` for critical paths (import, export, delete operations) using a `saveDataImmediate()` variant
- [ ] Add error handling: if the write fails, show a non-blocking warning to the user (a simple CSS-styled div, not `alert()`)

### 2.3 — Unsaved Changes Warning

- [ ] Add a `dirty` flag in state that's set to `true` whenever `appData` is modified and `false` when a save completes
- [ ] Add a `beforeunload` event listener that warns the user if `dirty === true`

### 2.4 — Data Validation on Load

- [ ] In `loadData()`, after loading from IndexedDB or localStorage, add basic structural validation:
  - `appData.settings` exists and is an object
  - `appData.employees` exists and is an array
  - `appData.payPeriods` exists and is an object
  - `appData.bankRegister` exists and is an array
- [ ] If validation fails, log the error and prompt the user to import from their last JSON backup rather than silently using broken data

### 2.5 — Verification

- [ ] Run full test suite
- [ ] Manually verify: open PayTrax, make a change, verify the save completes (check IndexedDB via browser dev tools)
- [ ] Verify: rapidly click through several periods entering hours — confirm no data loss and no console errors

**GATE: All tests pass. Save mechanism is robust.**

---

## Phase 3: Date Handling Standardization

**Context:** Dates are stored as `M/D/YYYY` strings, created via `formatDate()` using UTC methods, but parsed back with `new Date(dateString)` which uses local time. This can cause off-by-one-day errors in timezone edge cases. Pay dates are used for tax period assignment (which month/quarter), so this is a compliance risk.

### 3.1 — Audit Current Date Usage

- [ ] Search the codebase for all `new Date(` calls that parse stored date strings
- [ ] Identify which ones could produce incorrect results due to timezone interpretation
- [ ] List the date fields that are stored: `payPeriods[].startDate`, `payPeriods[].endDate`, `payPeriods[].payDate`, `bankRegister[].date`, `deductions[].createdDate`
- [ ] Note: `createdDate` on deductions is already stored as `YYYY-MM-DD` (ISO format)

### 3.2 — Create Consistent Date Utilities

- [ ] In `utils.js`, add:
  - `toStorageDate(date)` → converts Date object to `YYYY-MM-DD` string
  - `fromStorageDate(dateStr)` → parses `YYYY-MM-DD` string to Date object (noon local time to avoid day-boundary issues)
  - `toDisplayDate(dateStr)` → converts `YYYY-MM-DD` to `M/D/YYYY` for user display
  - `fromLegacyDate(dateStr)` → converts `M/D/YYYY` to `YYYY-MM-DD` (for migration)
- [ ] All new date parsing goes through these functions — no more raw `new Date()` on date strings anywhere in the codebase

### 3.3 — Data Migration

- [ ] Increment `CURRENT_VERSION` in `state.js`
- [ ] Write a new migration function (e.g., `migrateToV9`) in `migration.js`:
  - Convert all `payPeriods[].startDate`, `endDate`, `payDate` from `M/D/YYYY` to `YYYY-MM-DD`
  - Convert all `bankRegister[].date` from `MM/DD/YYYY` to `YYYY-MM-DD`
  - Leave `deductions[].createdDate` as-is (already ISO)
- [ ] Register the migration in the `migrateData()` switch chain
- [ ] Update `defaultAppData` and `generateBasePayPeriods()` to use the new format

### 3.4 — Update All Consumers

- [ ] Update `formatDate()` in `utils.js` to output `YYYY-MM-DD`
- [ ] Update all display rendering (ui.js, banking.js, pdf-export.js) to use `toDisplayDate()` when showing dates to the user
- [ ] Update all date comparisons in `logic.js`, `banking.js` to use `fromStorageDate()` for parsing
- [ ] Update CSV export/import to handle both old and new formats on import, output new format on export
- [ ] Update `parseDateInput()` to work with the new storage format

### 3.5 — Verification

- [ ] Run full test suite — all tests must pass (update test fixtures if they contain hardcoded date strings)
- [ ] Load the PayTrax backup (which will trigger migration), verify all dates display correctly
- [ ] Verify 941 report quarterly boundaries still assign pay periods to the correct quarter
- [ ] Export a new JSON backup and confirm dates are in ISO format

**GATE: All tests pass. Dates are stored unambiguously. Reports assign periods to correct quarters.**

---

## Phase 4: Module Decomposition

**Context:** `logic.js` is 1,592 lines containing payroll calculations, employee CRUD, deduction management, settings management, report generation, and CSV exports. `banking.js` is 751 lines mixing business logic, DOM manipulation, and CSV parsing. Breaking these into focused modules improves maintainability and reduces the risk of accidental changes to calculation code when modifying reports or UI.

**Critical rule:** This phase involves ZERO logic changes. Every function moves exactly as-is. The test suite proves nothing changed.

### 4.1 — Extract Report Generators

- [ ] Create `reports.js`
- [ ] Move these functions from `logic.js` to `reports.js`:
  - `generateTaxDepositReportFromData()`
  - `generateTaxDepositReport()`
  - `generateW2Report()`
  - `generate941Report()`
  - `generate940Report()`
  - `generateDateRangeEmployeeReport()`
  - `generateDateRangeEmployerReport()`
  - All `export*ToCSV()` functions
  - `downloadCSV()` helper
- [ ] Add necessary imports in `reports.js` (appData, state constants, utils)
- [ ] Update imports in `main.js`, `ui.js`, or anywhere these functions were imported from `logic.js`
- [ ] Run full test suite — all tests must pass

### 4.2 — Extract Employee & Deduction Management

- [ ] Create `employees.js`
- [ ] Move from `logic.js`:
  - `saveEmployeeFromForm()`
  - `deleteEmployee()`
  - `addDeduction()`
  - `updateDeduction()`
  - `deleteDeduction()`
  - `calculateDeductions()`
- [ ] Update imports everywhere
- [ ] Run full test suite — all tests must pass

### 4.3 — Split Banking Module

- [ ] Create `banking-csv.js` — move from `banking.js`:
  - `parseCsvLine()`
  - `detectCsvFormat()`
  - `parseTransactionFromCsv()`
  - `normalizeDate()`
  - `fuzzyMatchTransaction()`
  - `importCsvTransactions()`
  - `handleCsvImport()`
- [ ] Keep core banking logic and UI in `banking.js` (it's already reasonably cohesive otherwise)
- [ ] Update imports
- [ ] Run full test suite — all tests must pass

### 4.4 — Rename Core Module

- [ ] Rename `logic.js` → `payroll-calc.js` (or keep `logic.js` if renaming is disruptive to existing imports/docs)
- [ ] At this point, the core calculation file should contain only:
  - `generateBasePayPeriods()`
  - `generatePayPeriods()`
  - `recalculateAllPeriodsForEmployee()`
  - `recalculatePeriod()`
  - `calculatePayFromData()`
  - `calculatePay()`
  - `updateHoursFromPeriod()`
  - `getPayStubData()`
  - `updateSettingsFromUI()`
- [ ] Run full test suite — all tests must pass

### 4.5 — Verification

- [ ] Run full test suite
- [ ] Load PayTrax with backup data, navigate every tab, verify everything renders and functions
- [ ] Generate a 941 report, W-2 report, and custom date range report — verify output

**GATE: All tests pass. All functionality works. No logic changed — only file organization.**

---

## Phase 5: Security & Validation Hardening

### 5.1 — HTML Sanitization

- [ ] Search the entire codebase for `innerHTML` assignments that include any variable data
- [ ] For each instance, determine if the data could contain user input or imported data
- [ ] Replace dangerous patterns with safe alternatives:
  - Use `textContent` for plain text
  - Use DOM creation methods (`createElement`, `appendChild`) for structured content
  - For report HTML generation (which builds tables from calculated data, not user input), these are lower risk but should still use safe construction where practical
- [ ] Special attention to `banking.js` — transaction descriptions from CSV imports are inserted via `innerHTML`

### 5.2 — Integrate Settings Validation

- [ ] Wire `validateSettings()` from `validation.js` into the settings change handler
- [ ] If validation fails, show errors and revert the setting to its previous value
- [ ] Prevent saving settings with: negative tax rates, zero wage bases, tax year outside reasonable range (2020–2030)

### 5.3 — Surface Hours Validation to User

- [ ] In `handleHoursChange()` (main.js), the hours validation currently logs warnings to console only
- [ ] Display validation warnings in a visible but non-blocking way (e.g., a yellow warning div below the hours inputs)

### 5.4 — Robust ID Generation

- [ ] Replace all instances of `emp_${new Date().getTime()}` and `ded_${new Date().getTime()}` and `trans_${new Date().getTime()}` with `crypto.randomUUID()`
- [ ] Verify `crypto.randomUUID()` is available (it's in all modern browsers; add a polyfill fallback if needed)
- [ ] No data migration needed — existing IDs remain as-is, only new IDs use the new format

### 5.5 — Fix Encoding Bug

- [ ] In `validation.js` line 306, replace the mojibake `â€¢` with a proper bullet character `•` or use a simple dash `-`

### 5.6 — Verification

- [ ] Run full test suite
- [ ] Enter a transaction with description containing `<b>test</b>` — verify it displays as literal text, not bold
- [ ] Try entering invalid settings values — verify they're rejected
- [ ] Create a new employee — verify the ID format is a UUID

**GATE: All tests pass. No XSS vectors. Validation catches bad input.**

---

## Phase 6: Hardcoded Constants Cleanup

**Context:** `state.js` exports `SS_WAGE_BASE = 168600`, `FUTA_WAGE_BASE = 7000`, `SUTA_WAGE_BASE = 25000` as module-level constants AND stores the same values in `appData.settings`. The calculation code uses `appData.settings.ssWageBase || SS_WAGE_BASE` as a fallback pattern. This dual-source creates confusion about which is the source of truth and makes tax year transitions error-prone.

### 6.1 — Audit Constant Usage

- [ ] Search for all references to `SS_WAGE_BASE`, `FUTA_WAGE_BASE`, `SUTA_WAGE_BASE` across the codebase
- [ ] List where each is used: logic.js, pdf-export.js, state.js, reports, etc.
- [ ] Identify any location that uses the constant directly instead of reading from `appData.settings`

### 6.2 — Establish Single Source of Truth

- [ ] `appData.settings` is the authoritative source for all tax parameters
- [ ] The module-level constants in `state.js` become ONLY defaults for `defaultAppData` initialization — they should never be imported by other modules
- [ ] Remove all `import { SS_WAGE_BASE, ... } from './state.js'` in other modules
- [ ] Replace all `appData.settings.ssWageBase || SS_WAGE_BASE` fallback patterns with just `appData.settings.ssWageBase` (the loadData function already ensures these settings exist via backward compatibility logic)
- [ ] In `pdf-export.js`, replace the imported `SS_WAGE_BASE` and `FUTA_WAGE_BASE` constants with reads from `appData.settings`

### 6.3 — Verification

- [ ] Run full test suite
- [ ] Change the SS wage base in PayTrax settings to a test value (e.g., $100,000), calculate a period, verify the cap applies at the new value — not the old hardcoded constant
- [ ] Change it back to the correct value

**GATE: All tests pass. Settings are the single source of truth for all tax parameters.**

---

## Phase 7: 2026 Tax Year Readiness

**Context:** PayTrax needs current-year rates. This is a compliance priority.

### 7.1 — Verify Current Rates

Before making changes, confirm the correct 2026 values. Search the web or IRS.gov for each:

- [ ] Social Security wage base for 2026 (expected: $176,100)
- [ ] Social Security tax rate for 2026 (expected: 6.2% each, employer and employee)
- [ ] Medicare tax rate for 2026 (expected: 1.45% each)
- [ ] Additional Medicare threshold (expected: $200,000)
- [ ] Additional Medicare rate (expected: 0.9%)
- [ ] FUTA tax rate after credit (expected: 0.6%)
- [ ] FUTA wage base (expected: $7,000)
- [ ] Oklahoma is NOT on the FUTA credit reduction list for 2026
- [ ] Oklahoma SUTA taxable wage base for 2026 (check OESC)
- [ ] Oklahoma new employer SUTA rate for 2026

### 7.2 — Update Defaults

- [ ] Update `defaultAppData.settings.ssWageBase` in `state.js` to the confirmed 2026 value
- [ ] Update any other defaults that changed
- [ ] Update the module-level constants (if they still exist after Phase 6) to match
- [ ] These only affect NEW installations — existing data keeps its configured values

### 7.3 — Verification

- [ ] Run full test suite (update test fixtures if they assert specific wage base values)
- [ ] Verify existing 2025 data in PayTrax is NOT affected (the settings for 2025 are already saved in the data)
- [ ] For 2026 payroll: verify the settings tab shows the correct values

**GATE: All tests pass. 2026 rates confirmed and applied.**

---

## Phase 8: User Experience Improvements (Lower Priority)

These are quality-of-life improvements. Execute as time permits.

### 8.1 — Replace alert() with Toast Notifications

- [ ] Create a simple toast notification component (CSS + JS)
- [ ] Color-coded: success (green), warning (amber), error (red)
- [ ] Auto-dismiss after 5 seconds, stackable
- [ ] Replace all `alert()` calls throughout the codebase
- [ ] Run full test suite

### 8.2 — Undo for Destructive Operations

- [ ] Before employee delete, store a snapshot of the employee + their pay periods
- [ ] Show an "Undo" option (toast notification with button) for 30 seconds
- [ ] If undo is clicked, restore the snapshot
- [ ] Same pattern for transaction delete

### 8.3 — Audit Trail

- [ ] Add `appData.auditLog = []` to the data schema (new migration version)
- [ ] Log significant events: employee added/deleted, settings changed, data imported/exported, period calculated
- [ ] Each entry: `{ timestamp, action, details }`
- [ ] Display in a collapsible section on the Settings tab or a new tab
- [ ] Retention: keep last 500 entries, auto-prune older

### 8.4 — Dashboard Compliance Summary

- [ ] Add a section to the Dashboard tab showing:
  - Next estimated filing deadline
  - YTD wages, YTD employer taxes, YTD employee taxes
  - Periods with hours entered vs. total periods
  - Last backup date

---

## Execution Notes for Claude Code

**Branching strategy:** If working in git, create a branch for each phase. Merge only after the gate passes.

**Test-first discipline:** Every phase begins and ends with a full test run. If any test breaks, diagnose and fix before continuing.

**No combined phases:** Do NOT combine structural refactoring (Phase 4) with calculation logic changes (Phase 6). Complete and verify one phase before starting the next.

**Backup before migration:** Before executing any data migration (Phase 3, Phase 8.3), export a JSON backup of the current data. If migration produces unexpected results, the backup is the recovery path.

**Recommended order:** Phase 0 → 1 → 2 → 6 → 7 → 3 → 5 → 4 → 8

Phase 6 (constants cleanup) before Phase 7 (2026 rates) because establishing single-source-of-truth for tax parameters makes the rate update cleaner.

---

## Appendix: Key Architecture Facts

**Calculation flow:**
```
User enters hours → handleHoursChange() → calculatePay() → calculatePayFromData()
  → If later periods exist: recalculateAllPeriodsForEmployee() → recalculatePeriod() × N
  → If no later periods: recalculatePeriod() × 1
```

**Running remainder system:** `calculateTaxWithRemainder(taxName, rawAmount)` adds the previous remainder, rounds to nearest cent, stores the new remainder. This ensures YTD totals match penny-exact multiplication over many periods.

**Wage base caps:** `getTaxableWages(ytdBefore, currentGross, wageBase)` returns `Math.min(currentGross, wageBase - ytdBefore)` or 0 if already over. Applied to FICA, FUTA, SUTA before the tax rate.

**Data persistence:** IndexedDB primary → localStorage fallback. Single key `appState` stores the entire `appData` object. No server, no cloud.

**Date format (current):** `M/D/YYYY` strings for pay periods and bank register. `YYYY-MM-DD` for deduction `createdDate`. Phase 3 standardizes everything to ISO.

**Data version:** Currently v8. Each migration in `migration.js` increments version and adds new fields with backward-compatible defaults. The `migrateData()` function uses fall-through switch for sequential upgrades.
