# Developer's Guide

This guide provides technical information for maintaining and extending the PayTrax application.

## File Structure & Core Concepts

The application is built with a modular vanilla JavaScript architecture. Understanding the role of each file is key to making changes.

*   `index.html`: The single entry point and container for the application's UI.
*   `style.css`: Contains all styling for the application.
*   `/js/main.js`: The **orchestrator**. It handles high-level event listeners (user actions) and calls functions from other modules to initialize the app and manage tab-level operations.
*   `/js/state.js`: The **single source of truth**. It defines the `appData` object structure, contains default values, and manages saving/loading data to IndexedDB. Includes debounced save (`saveData()`) and immediate save (`saveDataImmediate()`) for critical operations. Runs data migrations automatically on load when the stored version is older than the current version.
*   `/js/logic.js`: The **payroll calculation engine**. Contains core business logic for payroll calculations, pay period generation, and the running remainder tax algorithm. Re-exports functions from `employees.js` and `reports.js` for backward compatibility.
*   `/js/employees.js`: **Employee management**. Contains employee CRUD operations (`saveEmployeeFromForm`, `deleteEmployee`) and deduction management (`addDeduction`, `updateDeduction`, `deleteDeduction`, `calculateDeductions`).
*   `/js/reports.js`: **Tax reporting and CSV exports**. Contains all report generation (W-2, 941, 940, tax deposit, date-range reports) and their corresponding CSV export functions.
*   `/js/banking.js`: The **banking module**. Contains all logic and UI functions for the bank register, including adding transactions, filtering, reconciliation, CSV import/export, and purging.
*   `/js/ui.js`: The **primary view manager**. Contains functions that manipulate the DOM for non-banking tabs, such as populating dropdowns, updating tables, and rendering reports.
*   `/js/data-io.js`: Handles the import and export of the `appData` object to and from JSON files.
*   `/js/db.js`: A low-level module for interacting with the IndexedDB API.
*   `/js/migration.js`: Contains the logic for upgrading the `appData` object structure from older versions. Migrations run both during JSON import and on IndexedDB load. Also defines `CURRENT_VERSION`.
*   `/js/utils.js`: **Date utilities and helpers**. Contains `formatDate`/`toStorageDate` (Date → YYYY-MM-DD), `fromStorageDate` (YYYY-MM-DD → Date at noon local), `toDisplayDate` (YYYY-MM-DD → M/D/YYYY for UI), `fromLegacyDate` (M/D/YYYY → YYYY-MM-DD), and `parseDateInput` for report period parsing.
*   `/js/validation.js`: **Data validation module**. Contains validators for employees, hours, settings, transactions, and deductions with structured error reporting.
*   `/js/pdf-export.js`: **PDF generation** using jsPDF. Generates printable pay stubs and reports.

## State Management

The application is state-driven. The entire application's state is held within the `appData` object defined in `state.js`.

*   **Rule 1:** To change what's on the screen, you must first change the data in the `appData` object.
*   **Rule 2:** After changing `appData`, call the relevant rendering function (from `ui.js` or `banking.js`) to update the screen.
*   **Rule 3:** Call `saveData()` (debounced, 300ms) for routine changes, or `saveDataImmediate()` (returns Promise) for critical operations like employee changes, settings updates, or purges.

### Save Persistence

*   `saveData()` — Debounced with 300ms delay. Multiple rapid saves coalesce into one write.
*   `saveDataImmediate()` — Bypasses debounce, writes immediately. Returns a Promise. Used for critical operations.
*   `isDirty()` — Returns `true` if there are unsaved changes. Used by the `beforeunload` handler to warn users before leaving.

## Date Format Convention

All dates are stored in **YYYY-MM-DD** format (ISO 8601). This was standardized in v9.

*   **Storage:** `YYYY-MM-DD` strings everywhere in `appData` (pay period dates, bank register dates, deduction created dates).
*   **Display:** Converted to `M/D/YYYY` for the UI using `toDisplayDate()`.
*   **Parsing:** Use `fromStorageDate(dateStr)` to convert to a Date object. This uses noon local time (`T12:00:00`) to avoid UTC midnight timezone day-boundary issues.
*   **HTML inputs:** Native `<input type="date">` returns `YYYY-MM-DD` — store directly without conversion.

## Data Versioning & Migration

To ensure backward compatibility with older data, the application uses a versioning system. The current version is **9**, defined as `CURRENT_VERSION` in `migration.js`.

**Important:** Migrations run in two places:
1. **On IndexedDB load** — `loadData()` in `state.js` checks the stored version and runs `migrateData()` automatically.
2. **On JSON import** — `data-io.js` runs `migrateData()` when importing older backup files.

When a change is made that alters the structure of the `appData` object, the developer must:

1.  **Increment `CURRENT_VERSION`** in `js/migration.js`:
    ```javascript
    // js/migration.js
    export const CURRENT_VERSION = 10; // Was previously 9
    ```

2.  **Add New Properties to Default State:** In `js/state.js`, add the new data property to the `defaultAppData` object so that new users get the updated structure.

3.  **Write Migration Function:** In `js/migration.js`, write a new function named `migrateToV10` (matching the new version number). This function takes the `data` object and performs the necessary transformations. It must end by setting `data.version = 10;`.

    *Example (v9 — date format standardization):*
    ```javascript
    function migrateToV9(data) {
        console.log("Running migration to v9...");

        function convertDate(dateStr) {
            if (!dateStr || typeof dateStr !== 'string') return dateStr;
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
            }
            return dateStr;
        }

        // Convert pay period dates and bank register dates...
        data.version = 9;
    }
    ```

4.  **Update the Migration Path:** Add a new `case` to the `switch` statement inside `migrateData()`. Cases use fall-through so older data migrates through all intermediate versions:

    ```javascript
    export function migrateData(data) {
        const importVersion = data.version || 1;
        switch (importVersion) {
            case 1: migrateToV2(data);
            case 2: migrateToV3(data);
            // ... all intermediate cases ...
            case 8: migrateToV9(data);
            case 9: migrateToV10(data); // Add the new case here
                break;
        }
        return data;
    }
    ```

### Version History

| Version | Changes |
|---------|---------|
| v1 | Initial structure |
| v2 | Added employeeIdPrefix, ptoCarryOverLimit |
| v3 | Added taxRemainders per employee (fractional cent tracking) |
| v4 | Added reconciled status for bank transactions |
| v5 | Added employee deductions, configurable tax settings |
| v6 | Added createdDate to deductions for retroactive filtering |
| v7 | Added autoSubtraction setting for bank register toggle |
| v8 | Added sutaWageBase setting, wage base cap enforcement |
| v9 | Standardized all dates to YYYY-MM-DD storage format |

## Module Dependencies

```
main.js ─┬─→ logic.js ──→ employees.js (re-exported)
         │              ──→ reports.js   (re-exported)
         │              ──→ banking.js   (addTransaction)
         ├─→ banking.js ──→ logic.js     (generateBasePayPeriods)
         ├─→ ui.js ─────→ logic.js      (getPayStubData, reports)
         └─→ state.js ──→ migration.js  (migrateData, CURRENT_VERSION)
                        ──→ db.js        (IndexedDB operations)
```

Note: `logic.js` re-exports all functions from `employees.js` and `reports.js`, so existing `import * as logic` consumers continue to work without changes.

## Testing

**Framework:** Vitest with browser mode (Playwright)
**Test count:** 301 tests across 11 test files

```bash
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:ui          # Vitest UI dashboard
npm run test:coverage    # Coverage report
```

Test fixtures are in `tests/fixtures/`. Use `createTestEmployee()` and `createTestSettings()` factories for consistent test data.

---
Copyright (c) 2025 greenwh. Licensed under the [MIT License](../LICENSE).
