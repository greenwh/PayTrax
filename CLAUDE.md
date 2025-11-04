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

### No Build, Lint, or Test Commands

- ✓ No build system (webpack, Vite, etc.)
- ✓ No package.json or npm dependencies
- ✓ No TypeScript or transpilation
- ✓ No linting or formatting tools
- ✓ No test framework
- Manual testing via browser console

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
  version: 5,  // Updated from 4 to 5
  settings: {
    companyName, taxYear, payFrequency, firstPayPeriodStartDate,
    socialSecurity, medicare, sutaRate, futaRate,
    ssWageBase, futaWageBase, additionalMedicareThreshold, additionalMedicareRate,  // NEW in v5
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
| Backward Compatibility | `migration.js` | Handles v1→v5 data migration sequentially |

## Data Versioning & Migration

**Current Version:** 5

Old backups are automatically migrated when imported. The migration flow in `migration.js` uses a fall-through switch statement ensuring all v1→v5 transformations are applied.

**Version History:**
- v1 → Initial structure
- v2 → Added employeeIdPrefix, ptoCarryOverLimit
- v3 → Added taxRemainders per employee (fractional cent tracking)
- v4 → Added reconciled status for bank transactions
- v5 → Added employee deductions, configurable tax settings (ssWageBase, futaWageBase, additionalMedicareThreshold, additionalMedicareRate), comprehensive validation module

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

Since there's no automated test framework, testing is manual:
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
