# PayTrax Fix Specification

**Companion to:** `PayTrax_Audit_Report_2026-06-10.md` (read it first — finding IDs F1–F13 below refer to it)
**Target implementer:** Claude Sonnet
**Ground rules (from workspace + project CLAUDE.md):**
- Run `npm test` before starting (must be 351 passing) and after every phase.
- Write regression tests for every fix in this spec — that's mandatory, not optional.
- **Bump the service-worker cache name in `sw.js` once at the end** (any JS change requires it).
- Use `Math.round(x * 100) / 100` for currency rounding — never `toFixed()` for math, never banker's rounding.
- Dates: `YYYY-MM-DD` storage, `toDisplayDate()` for display, `fromStorageDate()` for parsing.
- Data structure changes require bumping `CURRENT_VERSION` in `js/migration.js` and adding a migration.
- Do not refactor beyond what each phase specifies.

Implement the phases **in order**. Phases 1–3 are required. Phase 4 items are independent of each other and of Phases 1–3 (except where noted); implement all of them. Phase 5 is documentation.

---

## Phase 1 — Fix the service worker (F2) — trivial, do first

**Files:** `sw.js`, `index.html`

1. In `sw.js`, change the two icon entries in `urlsToCache`:
   - `'./icons/icon-192.png'` → `'./docs/icons/icon-192.png'`
   - `'./icons/icon-512.png'` → `'./docs/icons/icon-512.png'`
2. In `index.html` line 19, change `href="icons/icon-192.png"` → `href="docs/icons/icon-192.png"`.
3. Make the install resilient so one missing asset can never again brick all caching. Replace the bare `cache.addAll(urlsToCache)` with individual adds that tolerate failures:
   ```js
   caches.open(CACHE_NAME).then(cache =>
     Promise.allSettled(urlsToCache.map(url => cache.add(url)))
   )
   ```
4. Bump `CACHE_NAME` to `paytrax-cache-v16` now (it will be bumped again at the end if other phases change JS — final bump only needs to happen once; just make sure the shipped value is one higher than any previously deployed value).

**Verification:** serve with `python -m http.server 8000`, open DevTools → Application → Service Workers: the new SW must install and activate; Cache Storage must contain the JS modules and both icons. No automated test required (SW not covered by vitest browser mode), but state in your summary that you manually verified install succeeds.

---

## Phase 2 — Structural fix: always recalculate sequentially (F4), then rebuild PTO on top of it (F1)

These two fixes share one structural change, so they are a single phase. **Order matters: do 2A before 2B.**

### 2A. Always run the full sequential recalculation (fixes F4)

**File:** `js/logic.js`, `calculatePayFromData()` (lines ~353–366)

Remove the `hasLaterPeriodsWithData` conditional entirely. After storing the hours into the period, **always** call `recalculateAllPeriodsForEmployee(employeeId)`:

```js
// Store the hours into the period
period.hours = { ... };  // unchanged

// Always recalculate from Period 1 so tax remainders and PTO are derived
// from a clean state — single-period recalc consumes its own previous
// remainder output and drifts (see audit F4).
recalculateAllPeriodsForEmployee(employeeId);

return appData.payPeriods[employeeId].find(p => p.period == periodNum);
```

Performance is a non-issue: ≤ 53 periods per employee, and the app already does exactly this on every startup.

`recalculatePeriod()` stays exported (tests and `recalculateAllPeriodsForEmployee` use it), but `calculatePayFromData` must no longer call it directly.

**Regression test (new, in `tests/integration/sequential-recalc.test.js` or a new file):**
- Calculate period 1, then calculate period 2, snapshot `period2.taxes` and `employee.taxRemainders` (deep copy).
- Call `calculatePayFromData` again for period 2 with **identical hours**.
- Assert the period's `taxes` object and `employee.taxRemainders` are deeply equal to the snapshots. (This test fails on current code — that's the bug.)

### 2B. Rebuild PTO tracking (fixes F1)

The current PTO block in `recalculatePeriod()` (lines ~260–273) is dead/cancelling logic — delete it entirely and replace with a derived model. The key insight: because of the bug, `employee.ptoBalance` has *never* been modified by calculations, so its current value is a trustworthy user-entered starting balance — the migration below exploits that.

#### Data model changes

1. **New employee field:** `ptoStartingBalance` (number, hours). This is what the user edits. `employee.ptoBalance` remains as the **computed** current balance (kept so all existing display code keeps working).
2. **New period field:** `ptoBalanceAfter` (number) — the running balance as of the end of that period. Also keep the existing `period.ptoAccrued`.
3. **Migration v12** in `js/migration.js`:
   ```js
   function migrateToV12(data) {
       console.log("Running migration to v12...");
       if (Array.isArray(data.employees)) {
           data.employees.forEach(emp => {
               if (emp.ptoStartingBalance === undefined) {
                   // Pre-v12 calculations never changed ptoBalance (audit F1),
                   // so the stored value is the user-entered starting balance.
                   emp.ptoStartingBalance = emp.ptoBalance || 0;
               }
           });
       }
       data.version = 12;
   }
   ```
   - Set `CURRENT_VERSION = 12`.
   - Add `case 11: migrateToV12(data);` to the switch in `migrateData()` (before the `break`).
   - Add `ptoStartingBalance: 0` to new-employee creation in `js/employees.js` and to `tests/fixtures/sample-employees.js`.
   - Update the migration unit tests (`tests/unit/migration.test.js`): v11→v12 case, and confirm the full v1→v12 chain ends at version 12.

#### Calculation changes

In **`recalculateAllPeriodsForEmployee()`** (`js/logic.js`), derive PTO alongside the remainder reset:

```js
// Reset tax remainders (existing code) ...
employee.taxRemainders = { ... };

// Derive PTO from scratch
let ptoBalance = employee.ptoStartingBalance || 0;
const sortedPeriods = periods.slice().sort((a, b) => a.period - b.period);
const periodsInYear = sortedPeriods.length;

sortedPeriods.forEach(period => {
    const totalHours = period.hours ? Object.values(period.hours).reduce((a, b) => a + b, 0) : 0;
    if (totalHours > 0) {
        recalculatePeriod(employeeId, period.period);
        // Accrue only on periods with worked (regular/overtime) hours — same
        // rule the original (dead) branch intended.
        const worked = (period.hours.regular || 0) + (period.hours.overtime || 0) > 0;
        const accrued = worked && periodsInYear > 0
            ? employee.ptoAccrualRate / periodsInYear
            : 0;
        ptoBalance = ptoBalance + accrued - (period.hours.pto || 0);
        period.ptoAccrued = accrued;
        period.ptoBalanceAfter = Math.round(ptoBalance * 100) / 100;
    } else {
        period.ptoAccrued = 0;
        period.ptoBalanceAfter = Math.round(ptoBalance * 100) / 100;
    }
});

employee.ptoBalance = Math.round(ptoBalance * 100) / 100;
```

Then **delete the entire PTO block from `recalculatePeriod()`** (the `originalPtoUsed`/`currentPtoBalance`/`totalOriginalHours` section, lines ~260–273) and the `period.ptoAccrued = ptoAccruedThisPeriod;` assignment that goes with it (`period.ptoAccrued` is now owned by the loop above). `recalculatePeriod` must no longer touch `employee.ptoBalance`.

> Note: after 2A, `recalculatePeriod` is *only* ever called from inside `recalculateAllPeriodsForEmployee`, so moving PTO ownership up one level is safe. Some existing tests call `recalculatePeriod` directly — they don't assert on PTO, but re-run the suite to confirm.

#### Form / UI changes

1. `js/employees.js::saveEmployeeFromForm()`: read the form's PTO balance field into `ptoStartingBalance` (not `ptoBalance`). When editing an existing employee, preserve the computed `ptoBalance` the same way `taxRemainders`/`deductions` are preserved (it will be recomputed on the next recalc anyway, which `handleSettingsChange`/`handleEmployeeFormSubmit` flows already trigger via `generatePayPeriods()` — verify: `handleEmployeeFormSubmit` does **not** currently trigger a recalc; add `logic.recalculateAllPeriodsForEmployee(employeeId)` after `logic.saveEmployeeFromForm()` for the edit path so a changed starting balance takes effect immediately).
2. `js/ui.js::renderEmployeeFormForEdit()`: populate the form field from `employee.ptoStartingBalance` (`.toFixed(2)` as currently done), not from `ptoBalance`.
3. `index.html`: change the label "Current PTO Balance (hours)" → "Starting PTO Balance (hours)".
4. Pay-stub PTO section, `js/ui.js::renderPayStubUI()` (lines ~347–355): use period-level values so historical stubs are correct, not just the latest:
   ```js
   const ptoUsed = period.hours.pto || 0;
   const ptoEarned = period.ptoAccrued || 0;
   const ptoEnd = period.ptoBalanceAfter ?? employee.ptoBalance;
   const ptoBegin = (ptoEnd - ptoEarned) + ptoUsed;
   ```
5. Same change in `js/pdf-export.js::exportPayStubToPDF()` (lines ~176–179).

#### Regression tests (new file `tests/integration/pto.test.js`)

Using the existing fixture pattern (`createTestEmployee`, `createTestSettings`, bi-weekly 2024, `generatePayPeriods()` in `beforeEach`):
1. Employee with `ptoAccrualRate: 80, ptoStartingBalance: 40` works 80 regular hours in period 1 → `period.ptoAccrued` ≈ `80 / 26` (use `toBeCloseTo`), `employee.ptoBalance` ≈ `40 + 80/26`.
2. Same employee uses 8 PTO hours in period 2 → balance ≈ `40 + 2×(80/26) − 8` (period 2 has regular hours too, e.g. 72 regular + 8 PTO). Assert `period2.ptoBalanceAfter` matches.
3. Recalculating the same period twice with identical hours leaves `employee.ptoBalance` unchanged (idempotency).
4. Editing period 1's hours after period 3 is calculated → balances re-derive correctly (assert final balance from first principles).
5. A period with only holiday hours does **not** accrue PTO; a period with regular hours does.
6. Migration test: v11 data with `ptoBalance: 25` → after `migrateData`, `ptoStartingBalance === 25` and `version === 12`.

---

## Phase 3 — Bank purge balance corruption (F3)

**File:** `js/banking.js` — `purgeTransactions()` (lines ~352–407) and `handlePurgeConfirm()` (lines ~85–119)

**Principle:** the opening-balance transaction must equal the net of the transactions actually **removed**, so the register's total balance is identical before and after the purge.

1. In `purgeTransactions()`, replace the opening-balance computation (the `for...of sortedRegister` loop with `break`) with a sum over **only the purged set**:
   ```js
   let openingBalance = 0;
   for (const t of txsToPurge) {
       openingBalance += t.credit - t.debit;
   }
   ```
   (`txsToPurge` is already computed and already filters to `reconciled && date <= cutoff`.) Everything else — the removal filter, the opening-balance transaction creation and dating, the return count — stays as is.
2. Extract that into a small exported helper so the confirm dialog shows the same number:
   ```js
   export function getPurgePreview(cutoffDateStr) {
       const cutoffDate = new Date(cutoffDateStr + 'T23:59:59');
       const txs = appData.bankRegister.filter(t =>
           t.reconciled && fromStorageDate(t.date) <= cutoffDate);
       const openingBalance = txs.reduce((sum, t) => sum + t.credit - t.debit, 0);
       return { count: txs.length, openingBalance };
   }
   ```
   Use it in both `handlePurgeConfirm()` (replacing its duplicated loop *and* `getPurgeableCount`) and `purgeTransactions()`.

**Regression test (new file `tests/integration/banking-purge.test.js`):**
- Build a register with: reconciled tx before cutoff (+1000 credit, −200 debit), **unreconciled** tx before cutoff (−150 debit), tx after cutoff (−50 debit).
- Compute total balance before purge; run the purge; assert: (a) total balance after === total balance before (this fails on current code by exactly 150), (b) unreconciled pre-cutoff tx still present, (c) opening-balance tx equals +800.
- Note: `purgeTransactions` is module-private; export it for testing (consistent with how other modules expose logic functions) or test through `getPurgePreview` + a newly exported `purgeTransactions`.

---

## Phase 4 — Robustness fixes (independent items)

### 4.1 Enforce settings validation; stop NaN persistence (F5)

**Files:** `js/logic.js::updateSettingsFromUI()`, `js/main.js::handleSettingsChange()`

1. In `updateSettingsFromUI()`, give every bare `parseFloat`/`parseInt` a fallback to the **current stored value** so a transiently empty field can't inject NaN:
   ```js
   const num = (v, fallback) => { const n = parseFloat(v); return isNaN(n) ? fallback : n; };
   appData.settings.socialSecurity = num(document.getElementById('socialSecurity').value, appData.settings.socialSecurity);
   // ... same pattern for all numeric fields including taxYear (parseInt) and daysUntilPayday
   ```
2. In `handleSettingsChange()`, make validation blocking:
   ```js
   logic.updateSettingsFromUI();
   const settingsErrors = validation.validateSettings(appData.settings);
   if (settingsErrors.length > 0) {
       validation.displayValidationErrors(settingsErrors);
       ui.displaySettings(); // restore the form to the last valid persisted state
       return;               // do NOT regenerate periods or save
   }
   // existing: generatePayPeriods, handleEmployeeChange, saveDataImmediate, logAudit
   ```
   Caveat: `validateSettings` requires `firstPayPeriodStartDate`; on a fresh install that field is legitimately empty until the user sets it. To avoid blocking initial setup, skip the blocking return when `appData.employees.length === 0 && !appData.settings.firstPayPeriodStartDate` (warn-only in that state), or relax that one field to warn-only. Choose the simpler and note it in the summary.

**Test:** unit test for the new fallback behavior — call `updateSettingsFromUI` is DOM-bound, so instead test indirectly: assert `validateSettings` flags NaN (already covered) and add an integration test that a settings object containing `socialSecurity: NaN` is rejected by `validateSettings` (NaN currently fails `isNaN(parseFloat(NaN))` → error returned — verify).

### 4.2 Make hours validation blocking + input guards (F13)

**Files:** `js/main.js::handleHoursChange()`, `index.html`

1. Add `min="0"` to the four hour inputs (`index.html` lines ~76–88).
2. In `handleHoursChange()`, if `validateHours(hours)` returns errors: `validation.displayValidationErrors(hoursErrors)` and `return` **before** `logic.calculatePay()`. (Negative or >168-total entries no longer reach the engine.)

**Test:** extend `tests/unit/validation.test.js` if negative-hours coverage is missing (it likely exists; verify).

### 4.3 Don't mutate data when browsing empty periods (F12)

**File:** `js/logic.js::updateHoursFromPeriod()` (lines ~306–323)

Return `true` only when the period actually has hours:

```js
const totalHours = period.hours ? Object.values(period.hours).reduce((a, b) => a + b, 0) : 0;
return totalHours > 0;
```

(The input fields are already populated/cleared above this line; `handlePeriodChange` falls through to `ui.updateDashboardUI` when `false` — verify the dashboard correctly shows the empty period.) This removes the spurious "Period Calculated" audit entries, the pointless saves, and the zero-hour writes when paging through periods.

### 4.4 Harden startup against corrupt localStorage (F8)

**File:** `js/state.js::loadData()` (line ~172)

Wrap the localStorage read:
```js
try {
    loadedData = JSON.parse(savedData);
} catch (e) {
    console.error('Corrupt localStorage data; starting with defaults.', e);
    loadedData = null;
}
```
(IndexedDB load is already promise-guarded upstream; defaults path already exists.)

**Test:** unit test in `tests/unit/` — seed `localStorage.setItem('PayTraxData', '{not json')`, ensure IndexedDB store is empty, call `loadData()`, assert it resolves and `appData` matches defaults.

### 4.5 Persist the backup date (F10)

**File:** `js/data-io.js::exportData()`

After the download is triggered (around line 100), add `saveData();` (the debounced save is fine here — import `saveData` from state.js). Also call `ui.refreshComplianceSummary()`? **No** — data-io must not import ui (keeps layering clean); instead, in `js/main.js`, the export button handler should call `ui.refreshComplianceSummary()` after `exportData()` returns. Wrap: change the listener to `() => { exportData(); ui.refreshComplianceSummary(); }`.

### 4.6 Escape HTML in remaining innerHTML sinks (F9)

**Files:** `js/utils.js`, `js/ui.js`, `js/reports.js`

1. Add to `js/utils.js`:
   ```js
   export function escapeHtml(str) {
       if (str === null || str === undefined) return '';
       return String(str)
           .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
           .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
   }
   ```
2. Apply it to every user-controlled string interpolated into `innerHTML`:
   - `js/ui.js::renderDeductionsTable()` — `ded.name`
   - `js/ui.js::renderPayStubUI()` — deduction names in the itemized table (or convert those rows to `createElement`/`textContent`, matching banking.js style)
   - `js/ui.js::renderAllEmployeesQuarterlySummary()` — `emp.name`
   - `js/reports.js` — `emp.name`, `emp.idNumber`, and `employeeName` in `generateW2Report`, `generateDateRangeEmployeeReport`, `generateDateRangeEmployerReport`
   - `js/ui.js::renderReportUI()` — `periodStr`/date strings injected into export-button `data-*` attributes (escape or build buttons via `createElement` with `dataset`)
   Do **not** touch numeric interpolations; do not refactor banking.js (already safe).
3. **Test:** unit test for `escapeHtml` in `tests/unit/utils.test.js`.

### 4.7 Additional Medicare Tax — warn, don't silently misreport (F6)

**Decision: Option B (warn + document), not full withholding implementation.** Rationale: implementing employee-side Additional Medicare withholding adds a new tax field through the entire pipeline (period schema, remainders, stubs, all reports, migration) for a scenario this deployment will not hit (threshold $200k/yr). The 941 report is *correct* below the threshold (line 5d = 0).

1. In `js/reports.js::generate941Report()`, when `line5d_col1 > 0`, prepend a visible warning to the report HTML:
   ```html
   <div class="alert alert-danger">Warning: wages above the Additional Medicare threshold were detected.
   PayTrax does not withhold Additional Medicare Tax (0.9%); the amounts on the "Additional Medicare"
   lines were NOT withheld from employees and the Balance Due line will be non-zero.
   Consult your accountant before filing.</div>
   ```
2. Add the same limitation note to `docs/User-Manual.md` (tax reports section) and the "Important Notes" section of `CLAUDE.md`.

### 4.8 Real data in 941/940 PDF exports (F11)

**Files:** `js/reports.js`, `js/pdf-export.js`

1. In `js/reports.js`, extract the calculation halves of `generate941Report()` and `generate940Report()` into exported pure functions:
   - `compute941Data(periodStr)` → returns `{ title, line1, line2, line3, line5a_col1, line5a_col2, line5c_col1, line5c_col2, line5d_col1, line5d_col2, line5e, line6, line7, line10, line12, line13, monthlyLiabilities, error }` (set `error` instead of returning HTML alerts when input/data is invalid).
   - `compute940Data(yearStr)` → `{ year, line3, line4, line5, line6, line7, line8, line12, line13, line17, quarterlyLiabilities, error }`.
   The existing `generate941Report`/`generate940Report` become thin HTML renderers over these — **the rendered HTML output must remain byte-identical for valid inputs** (the alert messages for invalid input may stay as-is).
2. In `js/pdf-export.js::export941ReportToPDF()` / `export940ReportToPDF()`, import the compute functions and replace every `'(calculated)'` placeholder with the real formatted values (`$x.toFixed(2)`, same labels as the HTML report). If `error` is set, `showToast(error, 'warning')` and return without generating a PDF.
3. **Test:** integration tests asserting `compute941Data`/`compute940Data` return the same numbers currently embedded in the HTML (reuse scenarios from `tests/integration/tax-reports.test.js`).

---

## Phase 5 — Documentation and cleanup

1. **CLAUDE.md:** update — current data version 12, new PTO model (`ptoStartingBalance` + derived `ptoBalance`/`ptoBalanceAfter`), v12 migration entry in Version History, the "always full sequential recalc" behavior of `calculatePayFromData`, the Additional Medicare limitation, and the corrected SW icon paths.
2. **Retroactive recalculation (F7) — documentation only, no code:** add a prominent note to `docs/User-Manual.md` and CLAUDE.md: *changing an employee's hourly rate or any tax rate retroactively recalculates ALL periods in the current tax year, including already-paid ones; export a backup before changing rates mid-year.* (Effective-dated rates are a future feature — do not implement.)
3. Delete `sw.js.bck`.
4. Add `coverage/` to `.gitignore` (do not delete the directory contents in this pass if untracked status is unclear — check `git status` first; if `coverage/` is tracked, `git rm -r --cached coverage/`).
5. **Final step:** bump `CACHE_NAME` in `sw.js` (single final value, e.g. `paytrax-cache-v16` if Phase 1's bump is the only one, otherwise `v17`) and run the full suite one last time.

---

## Acceptance Checklist

- [ ] `npm test` green; **new tests added**: recalc idempotency (2A), PTO suite ≥ 6 tests (2B), purge balance preservation (3), corrupt-localStorage startup (4.4), `escapeHtml` (4.6), 941/940 compute functions (4.8), v12 migration
- [ ] Service worker installs and activates cleanly on localhost (manually verified)
- [ ] `CURRENT_VERSION === 12`; v11 backup imports cleanly; v1 test fixture (`tests/fixtures/test-data-v1.json`) still migrates end-to-end
- [ ] Recalculating the same period twice produces byte-identical taxes and remainders
- [ ] PTO: accrual appears on stubs, usage decrements balance, balance idempotent under recalc
- [ ] Purge with mixed reconciled/unreconciled history preserves the register total exactly
- [ ] Clearing a settings field then tabbing away: error shown, no NaN saved, form restored
- [ ] Negative hours rejected with a toast; browsing empty periods writes nothing to the audit log
- [ ] 941/940 PDFs contain real numbers matching the HTML report
- [ ] HTML report output for 941/940 unchanged for valid inputs (diff before/after)
- [ ] `sw.js.bck` gone; SW cache name bumped exactly once in the final state

## Explicitly Out of Scope (do not implement)

- Full Additional Medicare withholding (per 4.7 decision)
- Effective-dated employee rates (F7 — documented instead)
- IRS Pub 15-T bracket withholding (design decision, see `codex-audit.txt`)
- Pre-tax deduction treatment, network-first SW strategy, fuzzy-match tuning (F20 etc.)
