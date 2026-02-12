# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PayTrax** is a browser-based payroll management system for small businesses and solo entrepreneurs. It's a **fully client-side Single-Page Application (SPA)** built with vanilla JavaScript (ES6 modules), HTML5, and CSS3. No backend server or build system is required.

**Key Characteristics:**
- Vanilla JavaScript (no frameworks, no TypeScript, no build tools)
- ~4,000+ lines of code
- IndexedDB for persistent storage with localStorage fallback
- Progressive Web App (PWA) with offline support via Service Worker
- Privacy-first: 100% client-side, no data leaves the browser
- Deployed as static files (GitHub Pages compatible)
- jsPDF library for PDF export functionality (loaded via CDN)

## Model Selection & Complexity Assessment

**Assessment Date:** [2026-01-11]
**Assessed Model:** Sonnet 4.5
**Complexity Score:** [6.2/10]

**Dimension Breakdown:**
- Data Structure: 6.5/10
- State Management: 7/10
- Integration: 4.5/10
- Edge Cases: 5.5/10
- Reasoning/Algorithms: 7.5/10

**Recommended Model:** [Sonnet]

**Assessment Rationale:**
  ## Model Recommendation

  **Recommended Model: Sonnet 4.5** (Complexity: 6.2/10)

  PayTrax has moderate complexity with sophisticated tax calculation logic (running remainder algorithm, wage base
  limiting) and sequential state dependencies requiring careful handling. The well-documented, modular architecture with
   5,900 lines across 11 ES6 modules is well-suited for Sonnet. Escalate to Opus for architectural overhauls or when
  adding complex multi-entity features. Haiku acceptable only for UI-only changes and documentation updates.

  **Critical areas requiring careful review**: logic.js (tax calculations, sequential recalculation), state management
  (cascading updates), and data migrations (backward compatibility).

  ---
  SUMMARY

  PayTrax is a solid medium-complexity project that fits Sonnet's capabilities well. The running remainder algorithm and
   sequential dependency requirements elevate it above simple CRUD, but the clean modular architecture and excellent
  documentation keep it below Opus territory.

  Primary concern: Lack of automated tests means every change carries regression risk, especially in tax calculations
  where errors have real-world financial consequences. Consider this when evaluating AI-suggested changes to logic.js.


**Key Monitoring Points:**
  1. Running Remainder Algorithm (CRITICAL)
    - File: logic.js:193-199
    - Risk: Breaking this creates accumulating rounding errors
    - Test: Calculate 26 bi-weekly periods, verify taxes match manual calculation
    - Verify: taxRemainders object persists correctly between periods
  2. Sequential Recalculation (CRITICAL)
    - File: logic.js:calculatePay(), recalculateAllPeriodsForEmployee()
    - Risk: Editing Period 1 might not trigger recalc of Periods 2-26
    - Test: Edit Period 1 hours, verify Period 26 tax amounts change
    - Verify: Console shows "Recalculating all periods from Period 1" message
  3. Data Migration (HIGH)
    - File: migration.js
    - Risk: Breaking backward compatibility with older data versions
    - Test: Load v1-v6 test data files, verify migrations apply correctly
    - Verify: appData.version updates to 7 after load
  4. Bank Register Synchronization (MEDIUM)
    - File: banking.js, logic.js
    - Risk: Pay period changes might not update bank register transactions
    - Test: Calculate pay, verify bank register shows debit; edit hours, verify amount updates
    - Verify: autoSubtraction setting controls behavior
  5. Tax Wage Base Limiting (HIGH)
    - File: logic.js:756-759 (Social Security), 947-950 (FUTA)
    - Risk: Incorrect YTD tracking could over-withhold Social Security
    - Test: Employee earning >$168,600/year should stop SS withholding mid-year
    - Verify: Form 941 line 5a matches expected wage base
  6. State Persistence (MEDIUM)
    - File: state.js, db.js
    - Risk: Data loss if IndexedDB and localStorage both fail
    - Test: Disable IndexedDB, verify localStorage fallback works
    - Verify: Browser DevTools shows data in both storage locations

## Getting Started - Development Setup

### Start Development Server

**Option 1: Python (Recommended)**
```bash
python -m http.server 8000
# Access at http://localhost:8000
```

**Option 2: Windows Batch Script**
```bash
./start_paytrax_server.bat
```

**Why Python HTTP Server?** ES6 modules require CORS compliance and cannot run via `file://` protocol directly.

### Automated Testing (NEW)

**Test Framework:** Vitest with browser mode (Playwright)
**Coverage Provider:** Istanbul (works with browser mode)
**Test Files:** 285 tests across utils, validation, db, migration, and integration modules

**Running Tests:**
```bash
npm test                 # Run all tests
npm run test:watch       # Run tests in watch mode
npm run test:ui          # Open Vitest UI dashboard
npm run test:coverage    # Run tests with coverage report
npm run test:unit        # Run unit tests only
npm run test:integration # Run integration tests only
```

**Current Coverage:**
- utils.js: 100% ✅
- validation.js: 88% ✅
- migration.js: 98% ✅
- db.js: 77% ✅
- logic.js: Good coverage via integration tests (payroll calcs, wage caps, tax deposits, reports)

**Important Notes:**
- Tests run in real browser environment (IndexedDB, DOM APIs work)
- Test fixtures available in `tests/fixtures/`
- Integration tests for logic.js require refactoring to reduce DOM coupling
- Manual testing still recommended for UI interactions

### No Build or Lint Commands

- ✓ No build system (webpack, Vite, etc.)
- ✓ No TypeScript or transpilation
- ✓ No linting or formatting tools
- Testing via Vitest (see above)

## Architecture Overview

### Module Structure

All application code is in `/js/` directory using ES6 module imports. Each module has a specific responsibility:

```
js/main.js        → App orchestrator, event handlers, tab management
js/state.js       → Single source of truth (appData object), IndexedDB persistence
js/logic.js       → All payroll calculations, employee management, tax reporting, CSV exports
js/ui.js          → DOM manipulation, view rendering, form management
js/banking.js     → Bank register, reconciliation, filtering, CSV export
js/db.js          → IndexedDB API wrapper
js/data-io.js     → JSON import/export functionality
js/migration.js   → Data versioning (v1→v5 backward compatibility)
js/utils.js       → Helper functions (date formatting, parsing)
js/validation.js  → Comprehensive data validation module (NEW in v5)
```

### State Management Pattern

**Single State Object (appData)** is the single source of truth:
- Located in `state.js`
- Contains: settings, employees, payPeriods, bankRegister
- Persisted to IndexedDB via `saveData()` in state.js
- Loaded on startup via `loadData()`
- Never mutated directly—always through logic.js or ui.js functions

**Data Structure:**
```javascript
appData = {
  version: 8,  // Updated from 7 to 8
  settings: {
    companyName, taxYear, payFrequency, firstPayPeriodStartDate,
    socialSecurity, medicare, sutaRate, futaRate,
    ssWageBase, futaWageBase, sutaWageBase,  // NEW sutaWageBase in v8
    additionalMedicareThreshold, additionalMedicareRate,  // NEW in v5
    taxFrequencies: { federal, futa, suta, state, local },
    ...
  },
  employees: [{
    id, name, idNumber, address, rate, overtimeMultiplier, holidayMultiplier,
    fedTaxRate, stateTaxRate, localTaxRate,
    ptoAccrualRate, ptoBalance,
    taxRemainders: { federal, fica, medicare, state, local, suta, futa },
    deductions: [{ id, name, amount, type }]  // NEW in v5
  }],
  payPeriods: [{
    period, startDate, endDate, payDate,
    hours: { regular, overtime, pto, holiday },
    earnings: { regular, overtime, pto, holiday },
    grossPay, netPay, ptoAccrued,
    taxes: { federal, fica, medicare, state, local, suta, futa, total, unrounded },
    deductions: [...],  // NEW in v5
    totalDeductions     // NEW in v5
  }],
  bankRegister: [{ id, date, description, debit, credit, reconciled }]
}
```

### Data Flow

1. User interacts with UI → event listener in `main.js`
2. Event calls function in `logic.js` (calculations) or `ui.js` (rendering)
3. `appData` is updated
4. `state.js::saveData()` persists to IndexedDB
5. `ui.js` re-renders affected UI sections

### Entry Point

**File:** `index.html` (line 827)
```html
<script type="module" src="./js/main.js"></script>
```

Single module import triggers entire app initialization. Service Worker is registered separately in `index.html`.

## Key Features & Module Mapping

| Feature | Primary Module | Key Functions |
|---------|---|---|
| Payroll Calculations | `logic.js` | `calculatePay()`, `recalculatePeriod()`, `recalculateAllPeriodsForEmployee()` |
| Pay Period Generation | `logic.js` | `generatePayPeriods()` (weekly, bi-weekly, semi-monthly, annual) |
| Employee Management | `logic.js` | `saveEmployeeFromForm()`, `deleteEmployee()` |
| **Employee Deductions** | `logic.js` + `ui.js` | `addDeduction()`, `deleteDeduction()`, `calculateDeductions()`, `renderDeductionsTable()` **NEW v5** |
| Pay Stubs | `logic.js` + `ui.js` | `getPayStubData()` (HTML printable format, includes deductions) |
| Tax Reporting (Generic) | `logic.js` | `generateW2Report()`, `generate941Report()`, `generate940Report()`, `generateTaxDepositReport()` **Updated v5** |
| **CSV Export** | `logic.js` | `exportW2ReportToCSV()`, `export941ReportToCSV()`, `export940ReportToCSV()`, `exportDateRangeEmployeeReportToCSV()` **NEW v5** |
| Bank Register | `banking.js` | `addTransaction()`, `reconcileTransaction()`, `filterTransactions()`, CSV export |
| Import/Export | `data-io.js` | `importData()`, `exportData()` (with version checking) |
| **Data Validation** | `validation.js` | `validateEmployee()`, `validateHours()`, `validateSettings()`, `validateTransaction()`, `validateDeduction()` **NEW v5** |
| Backward Compatibility | `migration.js` | Handles v1→v8 data migration sequentially |

## Data Versioning & Migration

**Current Version:** 8

Old backups are automatically migrated when imported. The migration flow in `migration.js` uses a fall-through switch statement ensuring all v1→v8 transformations are applied.

**Version History:**
- v1 → Initial structure
- v2 → Added employeeIdPrefix, ptoCarryOverLimit
- v3 → Added taxRemainders per employee (fractional cent tracking)
- v4 → Added reconciled status for bank transactions
- v5 → Added employee deductions, configurable tax settings (ssWageBase, futaWageBase, additionalMedicareThreshold, additionalMedicareRate), comprehensive validation module
- v6 → Added createdDate to deductions for retroactive filtering
- v7 → Added autoSubtraction setting for bank register toggle
- v8 → Added sutaWageBase setting ($25,000 OK default), wage base cap enforcement at calculation time

## PWA & Offline Support

**Service Worker (`sw.js`):**
- Cache-first strategy with network fallback
- Cache name: `paytrax-cache-v4`
- All app assets are cached for offline functionality
- Full app works without internet connection

**Web App Manifest (`manifest.json`):**
- Enables installation on iOS/Android as standalone app
- Theme color: `#2c3e50`
- Icons: 192x192 and 512x512 (including maskable variants)

## Common Development Tasks

### Adding a New Payroll Feature
1. Add state properties to `appData` in `state.js`
2. Implement calculation logic in `logic.js`
3. Add UI controls in `index.html` and event handlers in `main.js`
4. Update `ui.js` to render the new data
5. If data structure changes, increment `appData.version` and add migration in `migration.js`

### Modifying Employee Data Structure
1. Update employee object in `logic.js::addEmployee()`
2. Add migration in `migration.js` if needed (increment version)
3. Update UI rendering in `ui.js` to display/edit new fields

### Adding Tax Calculations
1. Implement calculation in `logic.js` (use existing tax functions as reference)
2. Store tax rates in `appData.settings`
3. Add UI controls in `index.html` for input
4. Add the new tax to the running remainder logic in `calculatePay()` and `recalculatePeriod()`
5. Ensure the tax is added to the employee's `taxRemainders` object initialization
6. **CRITICAL:** Use `Math.round(totalToConsider * 100) / 100` for rounding, NOT `toFixed(2)` or banker's rounding

### Exporting New Report Format
1. Add export function to `data-io.js` or `banking.js`
2. Call from appropriate UI button handler in `main.js`
3. Use browser's `Blob` + download link pattern for file generation

## Testing Strategy

### Automated Testing

PayTrax now has comprehensive automated testing with Vitest. Run tests before and after making changes to ensure nothing breaks.

**Quick Start:**
```bash
npm test              # Run all tests (285 tests pass)
npm run test:coverage # Check coverage and identify gaps
```

**Test Organization:**
- `tests/unit/` - Unit tests for individual modules (utils, validation, db, migration)
- `tests/integration/` - Integration tests for cross-module functionality (logic.js)
- `tests/fixtures/` - Test data factories and sample data (v1, v6 JSON)
- `tests/setup.js` - Global test setup (IndexedDB cleanup)

**What's Tested:**
- ✅ utils.js - Date formatting, parsing (100% coverage)
- ✅ validation.js - All validation functions (88% coverage)
- ✅ migration.js - All 8 data migrations (98% coverage)
- ✅ db.js - IndexedDB operations (77% coverage)
- ✅ logic.js - Payroll calcs, wage base caps, tax deposits, reports, deductions, sequential recalc
- ❌ ui.js - Not tested (requires E2E testing)
- ❌ main.js - Not tested (entry point, event orchestration)

**Adding New Tests:**

See `tests/integration/running-remainder.test.js` for an example integration test template. Key patterns:
- Use `beforeEach()` to reset `appData` state
- Use test fixtures (`createTestEmployee`, `createTestSettings`) for consistent data
- Test critical business logic isolated from UI
- Verify state changes, not DOM mutations

**Limitations:**

logic.js has tight coupling to DOM elements (e.g., `document.getElementById()` calls), making it difficult to test without refactoring. Consider:
1. Extracting pure calculation functions
2. Passing data as parameters instead of reading from DOM
3. Separating business logic from UI updates

### Manual Testing

For UI interactions and visual verification:
- Open DevTools → Console for debugging
- Use `console.log(appData)` to inspect state
- Test in both desktop and mobile browsers
- Clear IndexedDB to test from fresh start: DevTools → Application → IndexedDB → Delete

## Important Notes

### IndexedDB vs localStorage
- IndexedDB is primary storage (larger capacity)
- localStorage is fallback (for older browsers)
- Check `db.js` for storage implementation details

### Fractional Cent Tracking (taxRemainders)
- Payroll calculations can produce fractional cents due to rounding
- `taxRemainders` object tracks these for each employee and tax type
- **Running Remainder Strategy:** Fractional cents carry forward from one pay period to the next
- **Critical Requirement:** Pay periods MUST be calculated in strict chronological sequence (Period 1→2→3...)
- **Automatic Safeguards:**
  - `generatePayPeriods()` triggers sequential recalculation after settings changes
  - `calculatePay()` detects editing of earlier periods and triggers full recalculation
  - `recalculateAllPeriodsForEmployee()` resets remainders and processes periods sequentially
- **Rounding Method:** Uses standard currency rounding (`Math.round(x * 100) / 100`) NOT banker's rounding
- See `logic.js::calculatePay()` and `logic.js::recalculateAllPeriodsForEmployee()` for implementation

### Pay Period Generation
- Generated from `appData.settings.firstPayPeriodStartDate` and `payFrequency`
- Must handle fiscal year vs calendar year appropriately
- See `logic.js::generatePayPeriods()` for algorithm

### Git & Deployment
- Clean git history, ready for GitHub Pages
- Deployment is simply pushing to `gh-pages` branch (static files)
- No build step required

## Version 5 Enhancements (2025)

### Employee Deductions System
- **Purpose:** Allow pre-tax and post-tax deductions from employee paychecks
- **Types:** Fixed dollar amount or percentage of gross pay
- **Examples:** 401k, health insurance, union dues, garnishments
- **Implementation:**
  - `logic.js::addDeduction(employeeId, name, amount, type)` - Add new deduction
  - `logic.js::deleteDeduction(employeeId, deductionId)` - Remove deduction
  - `logic.js::calculateDeductions(employee, grossPay)` - Calculate total deductions
  - Deductions are stored in employee object: `deductions: [{ id, name, amount, type }]`
  - Calculated deductions stored in pay period: `deductions: [...]`, `totalDeductions: number`
  - Net pay calculation: `netPay = grossPay - employeeTaxes - totalDeductions`
- **UI:** Deductions section in employee form (only visible when editing existing employees)
- **Auto-recalculation:** Adding/removing deductions triggers `recalculateAllPeriodsForEmployee()`

### Configurable Tax Settings
- **Previous:** Tax wage bases and thresholds were hardcoded constants
- **Now:** All tax values configurable in settings:
  - `ssWageBase` (Social Security Wage Base) - default $168,600
  - `futaWageBase` (FUTA Wage Base) - default $7,000
  - `additionalMedicareThreshold` - default $200,000
  - `additionalMedicareRate` - default 0.9%
- **Benefits:**
  - Adapt to annual IRS updates without code changes
  - Support for different jurisdictions/years
  - All reports (W-2, 941, 940) use configurable values
- **UI:** "Tax Wage Limits & Thresholds" section in settings tab

### Generic, Year-Agnostic Tax Reports
- **Previous:** Form 941 and 940 had hardcoded line numbers tied to 2025 forms
- **Now:** Reports use descriptive labels instead of form line numbers
  - Example: "Taxable social security wages (subject to $168,600 limit)" instead of "Line 5a"
  - Dynamic insertion of configurable values into descriptions
  - Reports adapt to any year without code changes
- **Benefits:**
  - Reports remain valid even if IRS changes form layouts
  - Self-explanatory data that maps to current forms
  - Easier to understand for users

### CSV Export Functionality
- **Reports with CSV Export:**
  - W-2 Annual Report (`exportW2ReportToCSV()`)
  - Form 941 Quarterly Report (`export941ReportToCSV()`)
  - Form 940 Annual Report (`export940ReportToCSV()`)
  - Custom Employee Wage Report (`exportDateRangeEmployeeReportToCSV()`)
- **Features:**
  - One-click export button appears when report is generated
  - Proper CSV formatting with headers
  - Escaped quotes for text fields
  - Date-stamped filenames
  - Ready for Excel, Google Sheets, QuickBooks
- **Implementation:**
  - Export functions in `logic.js`
  - `downloadCSV(csvContent, filename)` helper function
  - Dynamic export buttons in `ui.js::renderReportUI()`
  - Delegated event listener in `main.js`

### Comprehensive Data Validation Module
- **Module:** `js/validation.js`
- **Validation Functions:**
  - `validateNumber(value, fieldName, min, max, required)` - Numeric field validation
  - `validateString(value, fieldName, minLength, maxLength, required)` - Text validation
  - `validateDate(value, fieldName, required, minDate, maxDate)` - Date validation
  - `validateEmployee(employeeData)` - Complete employee form validation
  - `validateHours(hours)` - Pay period hours validation (max 168 hours)
  - `validateSettings(settings)` - Company settings validation
  - `validateTransaction(transaction)` - Bank transaction validation
  - `validateDeduction(deduction)` - Employee deduction validation
- **Error Handling:**
  - `ValidationError` class for structured errors
  - `displayValidationErrors(errors, elementId)` - User-friendly error display
  - Returns array of errors for batch validation
- **Status:** Module created, ready for integration into form submissions

### External Libraries
- **jsPDF:** PDF generation library (v2.5.1)
- **jsPDF-AutoTable:** Table plugin for jsPDF (v3.5.31)
- **Loading:** CDN scripts in `index.html` before `main.js`
- **Purpose:** PDF export functionality for reports and pay stubs
- **Status:** Library loaded and available globally via `window.jspdf`

## Documentation & References

- **Developer Guide:** `/docs/Developer-Guide.md` (technical details)
- **User Manual:** `/docs/User-Manual.md` (end-user documentation)
- **Quick Start:** `/docs/Quick-Start-Guide.md`
- **README:** `/README.md`
