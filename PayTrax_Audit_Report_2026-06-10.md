# PayTrax Code Audit Report

**Date:** 2026-06-10
**Auditor:** Claude (Fable 5) — full source review of all 16 JS modules, index.html, sw.js, manifest.json, and the test suite
**Scope:** Correctness, data integrity, tax/compliance logic, persistence, security, code quality
**Test suite status at audit time:** 351/351 passing

Three of the findings below (F1, F4, and the F4 remainder drift) were **empirically verified** by writing temporary integration tests against the existing fixtures — not just inferred from reading. The temporary tests were removed afterward to keep `npm test` green.

---

## Executive Summary

The core tax engine is in good shape: wage-base caps (SS/FUTA/SUTA), the running-remainder rounding strategy, sequential recalculation, deduction date-filtering, and the migration chain are all correctly implemented and well-tested. The architecture is clean and the test suite is real.

However, the audit found **three confirmed functional bugs** in shipped features (PTO tracking is completely inert, the service worker can never install, and the bank-register purge can silently inflate the balance), plus a handful of robustness gaps where bad input corrupts saved data. None of them affect the federal/FICA tax math for the normal workflow, which is why the app "works very well" day to day.

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| F1 | **P1** | PTO accrual and usage never change the PTO balance (dead logic) | Verified by test |
| F2 | **P1** | Service worker install always fails — broken icon paths in `sw.js` | Verified (paths don't exist) |
| F3 | **P1** | Bank purge double-counts unreconciled pre-cutoff transactions | Verified by math trace |
| F4 | **P2** | Tax remainder state corrupts when re-editing the latest period | Verified by test |
| F5 | **P2** | Clearing any numeric settings field saves NaN into all calculations | Code-confirmed |
| F6 | **P2** | Additional Medicare Tax is reported on Form 941 but never withheld | Code-confirmed |
| F7 | **P2** | Every app load retroactively rewrites all historical periods with *current* rates | Design risk |
| F8 | **P3** | Corrupted localStorage bricks startup (no try/catch around JSON.parse) | Code-confirmed |
| F9 | **P3** | Inconsistent XSS hardening — `innerHTML` with unescaped names in ui.js/reports.js | Code-confirmed |
| F10 | **P3** | Backup date set on export but never persisted ("Last backup: Never") | Code-confirmed |
| F11 | **P3** | Form 941/940 PDF exports are placeholder stubs — every value prints "(calculated)" | Code-confirmed |
| F12 | **P3** | Merely browsing to an empty pay period mutates data, saves, and spams the audit log | Code-confirmed |
| F13 | **P3** | Hours/settings validation is advisory only; negative hours accepted | Code-confirmed |
| F14–F20 | **P4** | Minor quality issues (details below) | — |

A companion implementation spec for Sonnet is in **`PayTrax_Fix_Spec.md`**.

---

## P1 — Confirmed Functional Bugs

### F1. PTO accrual and usage are completely inert

**Files:** `js/logic.js:260-273` (PTO block in `recalculatePeriod`), root cause at `js/logic.js:346-351` (`calculatePayFromData`)

`calculatePayFromData()` overwrites `period.hours` with the new hours **before** calling `recalculatePeriod()`. Inside `recalculatePeriod`, the PTO block then compares "original" hours against "new" hours — but both now read from the same object:

- `totalOriginalHours === 0 && hours.regular > 0` is a logical contradiction (they're the same sum), so the accrual branch is **dead code**. `ptoAccrued` is always 0 for any period calculated under current code.
- The balance arithmetic algebraically cancels: `newBalance = ptoBalance + ptoUsed − oldAccrued + oldAccrued − ptoUsed = ptoBalance`. **Using PTO hours never reduces the balance either.**

**Verified:** A scratch test with `ptoAccrualRate: 80, ptoBalance: 40` showed `ptoAccrued: 0` after working 80 regular hours, and the balance stayed exactly 40.00 after using 8 PTO hours.

**Impact:** Pay stubs and PDFs show "PTO Earned: 0.00" and Beginning ≈ Ending balance forever. The employee PTO balance is only ever what was typed manually into the employee form. PTO *pay* (hours × rate) is calculated correctly — only the *balance tracking* is broken. Note: `todo.txt` already suspected dead code in this exact function.

The git history shows this has been broken since the testability refactor (`93edbb4`) moved the hours assignment ahead of the PTO comparison.

### F2. Service worker can never install — offline support and update delivery are broken

**Files:** `sw.js:31-32`, `index.html:19`

`sw.js` caches `./icons/icon-192.png` and `./icons/icon-512.png`, but there is **no `icons/` directory** — icons live in `docs/icons/` (confirmed; `manifest.json` correctly points there). `cache.addAll()` rejects if *any* URL 404s, which **fails the entire `install` event**:

- If no previous SW version ever installed successfully: no offline support at all.
- If an older version did install (when paths were valid): that old SW stays active **forever**, serving the stale cache — new cache versions never activate. This is very likely the root cause of the recurring "browser serves stale modules, must bump SW cache" pain this project has had.

`index.html:19` has the same broken path for `apple-touch-icon`.

### F3. Bank-register purge inflates the balance when unreconciled transactions predate the cutoff

**File:** `js/banking.js:352-407` (`purgeTransactions`), same flawed preview math in `handlePurgeConfirm` (`js/banking.js:96-106`)

The opening-balance calculation sums **all** transactions on or before the cutoff (reconciled or not), but the purge only **removes reconciled** ones. Unreconciled pre-cutoff transactions are kept *and* are baked into the new "Opening Balance" transaction — counted twice.

Math trace: post-purge balance = Σ(after cutoff) + Σ(unreconciled ≤ cutoff) + OpeningBalance(= Σ(all ≤ cutoff)) = original balance **+ Σ(unreconciled ≤ cutoff)**. The register silently drifts from the real bank balance by exactly the unreconciled amount. This only bites when unreconciled items exist before the cutoff, which is why it hasn't been noticed.

---

## P2 — High-Priority Issues

### F4. Remainder state corrupts when re-editing the latest period

**File:** `js/logic.js:353-366` (`calculatePayFromData`)

The full sequential recalculation is only triggered when *later* periods have data. Editing (or re-saving) the **latest** period takes the single-period path, which feeds `employee.taxRemainders` — already containing this same period's own output remainder — back into the same period's calculation. The carry-in from the prior period is unrecoverable at that point.

**Verified:** Calculating period 2 twice with identical hours left different remainder state (`medicare: 0.0025 → 0.0050`, `suta: −0.005 → ~0`) and the period's stored tax object failed a deep-equality check between the two runs. The drift is cent-level and self-heals on the next full recalculation (app reload runs one), but a pay stub printed immediately after an edit can disagree by a cent with the recalculated state after reload — exactly the class of inconsistency the running-remainder design exists to prevent.

### F5. Clearing a numeric settings field persists NaN through every calculation

**Files:** `js/logic.js:428-453` (`updateSettingsFromUI`), `js/main.js:44-57` (`handleSettingsChange`)

`updateSettingsFromUI()` does bare `parseFloat(...)` on ~12 fields with no fallback. `handleSettingsChange()` calls `validation.validateSettings()` but **only logs the errors to console** and proceeds anyway: it regenerates all pay periods, recalculates everything (now NaN), and `saveDataImmediate()`s the corrupted state. One accidentally-cleared field (e.g., Social Security rate) turns every tax figure into NaN, persisted to IndexedDB. The validation module exists and works — it's just not enforced.

### F6. Additional Medicare Tax: reported but never withheld

**Files:** `js/logic.js:242-248` (no additional-Medicare line in the calc) vs `js/reports.js:257-261, 283-284` (941 line 5d)

Settings carry `additionalMedicareThreshold`/`additionalMedicareRate`, and the 941 report adds line 5d (0.9% on wages over $200k) into total tax liability — but `recalculatePeriod()` never withholds it. For any employee crossing the threshold, the 941 "balance due" will be non-zero and actual withholding will be short (an employer liability under IRS rules). With this user's wage levels the practical exposure is zero, but the app presents a setting and a report line that the engine ignores — a completeness/consistency violation. Recommendation: warn-and-document (cheap) or implement withholding (complete); the spec covers both.

### F7. Every app load retroactively rewrites all historical payroll with current rates

**Files:** `js/main.js:425` (`init` → `generatePayPeriods`), `js/logic.js:96-129`

On every startup, `generatePayPeriods()` runs `recalculateAllPeriodsForEmployee()` for every employee, recomputing **all** stored periods from `hours × employee.rate` and current tax settings, and rewriting the matching bank-register transactions. Consequences:

- Change an employee's hourly rate mid-year → **all already-paid periods are silently rewritten** at the new rate on next load. Gross/net/taxes for past, already-deposited payroll no longer match what was actually paid.
- Same for SUTA/FUTA/SS rate changes mid-year.

Deductions were given a `createdDate` guard for exactly this retroactivity problem; rates have no such guard. This is partly by design (it lets you fix mistakes), but for "critical business software" it's a data-integrity hazard the user should at least be warned about. Documented as a design risk; the spec proposes a minimally invasive warning rather than effective-dated rates (a larger feature).

---

## P3 — Medium Issues

### F8. Corrupted localStorage bricks startup
`js/state.js:172` — `JSON.parse(savedData)` is not wrapped in try/catch. If IndexedDB is empty/unavailable and the localStorage payload is corrupt, `loadData()` throws and `init()` never finishes: the app loads with dead UI. One malformed byte = unusable app until the user manually clears storage.

### F9. Inconsistent XSS hardening
`banking.js` was deliberately converted to safe DOM construction "to prevent XSS from imported descriptions" — but the same vectors remain elsewhere: `js/ui.js:255-263` (deduction names via `innerHTML`), `js/ui.js:667-673` (employee names in the quarterly summary table), pay-stub deduction rows (`js/ui.js:337-340`), and employee names/IDs in every HTML report (`js/reports.js`). A malicious or tampered backup JSON executes script on import. Single-user app, so severity is moderate — but the protection is half-applied.

### F10. Backup date never persisted
`js/data-io.js:80` sets `appData.lastBackupDate` but never calls `saveData()`. Unless some other action saves afterward, the compliance widget shows "Last backup: Never" after reload despite a successful export.

### F11. Form 941/940 PDF exports are stubs
`js/pdf-export.js:352-376, 397-417` — every data row prints the literal string `(calculated)`. The buttons look functional and produce a professional-looking but **empty** PDF. Violates the workspace "no half-finished features" rule. (W-2, pay stub, and custom-range PDFs are real.)

### F12. Browsing an empty period mutates data and spams the audit log
`js/logic.js:306-323` — `updateHoursFromPeriod()` returns `true` for any existing period, even with zero hours. `handlePeriodChange` then runs the full `handleHoursChange` pipeline: writes zero-hours into the period, runs the calc, logs "Period Calculated" to the audit trail, and saves. Simply paging through periods generates bogus audit entries (cap is 500 — real history gets pruned by noise) and unnecessary writes.

### F13. Validation is advisory; negative hours accepted
`js/main.js:97-101` — `validateHours()` failures only `console.warn`. The hour inputs (`index.html:76-88`) have no `min="0"`, so a typo like `-8` flows straight into the calculation, producing negative gross/net pay and a negative bank debit. Same advisory-only pattern for settings (see F5).

---

## P4 — Low / Code Quality

- **F14.** `js/pdf-export.js:33` looks up the period by array index (`periods[periodNum - 1]`) while everything else uses `find(p => p.period == periodNum)`. The YTD helpers in `pdf-export.js`, `ui.js:310-315`, and `logic.js:411-419` also assume index = period − 1. Works today because generation guarantees it, but it's a fragile invariant with no guard.
- **F15.** `js/logic.js:582` — `maxHoursPerPeriod = 40` is hardcoded in the quarterly-earnings scheduler while its sibling `minimumWeeklyHours` is configurable (workspace rule: no hardcoded user-defined data).
- **F16.** `js/state.js:18-20` — `SS_WAGE_BASE`/`FUTA_WAGE_BASE`/`SUTA_WAGE_BASE` constants duplicate the literals in `defaultAppData` four lines below; one can drift from the other (they're documented as init-only, but they're exported).
- **F17.** `js/migration.js:18-29` — v2 migration adds `employeeIdPrefix` and `ptoCarryOverLimit`, which nothing in the codebase reads. Dead settings carried in every backup.
- **F18.** `handleSettingsChange` fires a full regenerate-recalculate-save-audit cycle on **every** `change` event in either settings form (including each field of the company address). Harmless at this data size, but each one writes an audit entry — more log noise.
- **F19.** Repo hygiene: `sw.js.bck` and the generated `coverage/` directory are checked in; `start_paytrax_server.bat` lives at root rather than `scripts/`.
- **F20.** Service worker uses cache-first for `index.html` itself; even with F2 fixed, users only get updates after the SW cache name is bumped (already institutional knowledge, noting for completeness; a network-first strategy for navigation requests would remove the foot-gun).

---

## What Was Checked and Found Correct

Worth recording so future audits don't re-litigate:

- **Wage-base caps** (SS/FUTA/SUTA) correctly computed per-period from YTD-before-this-period (`logic.js:198-226`); W-2 box 3, 941 line 5a, and 940 excess-wage math all independently re-derive caps correctly.
- **Running remainder rounding** is mathematically sound for the sequential path (the only flaw is the re-edit path, F4); 941 line 7 "fractions of cents" adjustment correctly equals deposited − unrounded.
- **Migration chain v1→v11** is correct, idempotent per step, and well-tested (27 tests). Fall-through switch is intentional and correct.
- **Deduction date filtering** (`createdDate <= payDate`) correctly prevents retroactive application; percent and fixed types compute correctly.
- **Purge count arithmetic** and opening-balance *dating* are correct (the flaw is only which transactions feed the opening sum, F3).
- **Quarterly earnings target** math (categorization, front-loaded distribution, shortfall) is correct, including the loop-with-cap distribution.
- **Debounced/immediate save split, dirty tracking, beforeunload warning** — correctly implemented.
- **CSV import** parser handles quoted fields/escaped quotes correctly; the ±2-day/±$1 fuzzy match is a reasonable design trade-off (can rarely mis-match two similar legitimate transactions — accepted limitation, not a bug).
- **Flat-percentage federal/state withholding** is a documented design decision (user-entered effective rates), not re-flagged here (see `codex-audit.txt` for the compliance-scope discussion).

---

## Recommendations

1. Apply the fixes in `PayTrax_Fix_Spec.md` in the order given (P1 first; F1/F4 share one structural fix).
2. After any JS change: **bump the SW cache name** — and after F2 is fixed, the bump will actually take effect, which it currently cannot.
3. Add the regression tests specified in the spec (PTO accrual/usage, recalc idempotency, purge balance preservation) — the suite's 351 green tests did not catch F1/F3/F4 because no test exercised these paths.
4. Treat F7 (retroactive recalculation) as a conscious design decision: either accept and document it in the User Manual, or schedule effective-dated rates as a future feature.
