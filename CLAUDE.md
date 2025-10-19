# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PayTrax** is a browser-based payroll management system for small businesses and solo entrepreneurs. It's a **fully client-side Single-Page Application (SPA)** built with vanilla JavaScript (ES6 modules), HTML5, and CSS3. No backend server or build system is required.

**Key Characteristics:**
- Vanilla JavaScript (no frameworks, no TypeScript, no build tools)
- ~2,316 lines of code
- IndexedDB for persistent storage with localStorage fallback
- Progressive Web App (PWA) with offline support via Service Worker
- Privacy-first: 100% client-side, no data leaves the browser
- Deployed as static files (GitHub Pages compatible)

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
js/main.js       → App orchestrator, event handlers, tab management
js/state.js      → Single source of truth (appData object), IndexedDB persistence
js/logic.js      → All payroll calculations, employee management, tax reporting
js/ui.js         → DOM manipulation, view rendering, form management
js/banking.js    → Bank register, reconciliation, filtering, CSV export
js/db.js         → IndexedDB API wrapper
js/data-io.js    → JSON import/export functionality
js/migration.js  → Data versioning (v1→v4 backward compatibility)
js/utils.js      → Helper functions (date formatting, parsing)
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
  version: 4,
  settings: { companyName, taxYear, payFrequency, firstPayPeriodStartDate, ... },
  employees: [{ id, name, ssn, payRate, taxWithholding, ptoBalance, taxRemainders, ... }],
  payPeriods: [{ periodNumber, startDate, endDate, payDate, hours: { employeeId: { regular, overtime, ... } } }],
  bankRegister: [{ date, description, amount, category, reconciled }]
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
| Pay Stubs | `logic.js` + `ui.js` | `getPayStubData()` (HTML printable format) |
| Tax Reporting | `logic.js` | `generateW2Report()`, `generate941Report()`, `generate940Report()`, `generateTaxDepositReport()` |
| Bank Register | `banking.js` | `addTransaction()`, `reconcileTransaction()`, `filterTransactions()`, CSV export |
| Import/Export | `data-io.js` | `importData()`, `exportData()` (with version checking) |
| Backward Compatibility | `migration.js` | Handles v1→v4 data migration sequentially |

## Data Versioning & Migration

**Current Version:** 4

Old backups are automatically migrated when imported. The migration flow in `migration.js` uses a fall-through switch statement ensuring all v1→v4 transformations are applied.

**Version History:**
- v1 → Initial structure
- v2 → Added employeeIdPrefix, ptoCarryOverLimit
- v3 → Added taxRemainders per employee (fractional cent tracking)
- v4 → Added reconciled status for bank transactions

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

## Documentation & References

- **Developer Guide:** `/docs/Developer-Guide.md` (technical details)
- **User Manual:** `/docs/User-Manual.md` (end-user documentation)
- **Quick Start:** `/docs/Quick-Start-Guide.md`
- **README:** `/README.md`
