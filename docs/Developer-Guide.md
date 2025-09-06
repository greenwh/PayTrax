# Developer's Guide

This guide provides technical information for maintaining and extending the PayTrax application.

## File Structure & Core Concepts

The application is built with a modular vanilla JavaScript architecture. Understanding the role of each file is key to making changes.

*   `PayTrax.html`: The single entry point and container for the application's UI.
*   `style.css`: Contains all styling for the application.
*   `/js/main.js`: The **orchestrator**. It handles high-level event listeners (user actions) and calls functions from other modules to initialize the app and manage tab-level operations.
*   `/js/state.js`: The **single source of truth**. It defines the `appData` object structure, contains default values, and manages saving/loading data to IndexedDB. All data modifications happen by changing the `appData` object.
*   `/js/logic.js`: The **payroll brain**. Contains business logic specifically for payroll calculations, pay period generation, employee data management, and reporting.
*   `/js/banking.js`: The **banking brain**. Contains all logic and UI functions for the bank register, including adding transactions, filtering, reconciliation, exporting, and purging.
*   `/js/ui.js`: The **primary view manager**. Contains functions that manipulate the DOM for non-banking tabs, such as populating dropdowns, updating tables, and showing modals.
*   `/js/data-io.js`: Handles the import and export of the `appData` object to and from JSON files.
*   `/js/db.js`: A low-level module for interacting with the IndexedDB API.
*   `/js/migration.js`: Contains the logic for upgrading the `appData` object structure from older versions during a data import.
*   `/js/utils.js`: A collection of **helper functions** (like `formatDate` and `parseDateInput`) used by various other modules to avoid code duplication.

## State Management

The application is state-driven. The entire application's state is held within the `appData` object defined in `state.js`.

*   **Rule 1:** To change what's on the screen, you must first change the data in the `appData` object.
*   **Rule 2:** After changing `appData`, call the relevant rendering function (from `ui.js` or `banking.js`) to update the screen.
*   **Rule 3:** Call `saveData()` from `state.js` after any significant state change to persist it.

## Data Versioning & Migration

To ensure backward compatibility with older data backups, the application uses a versioning system. When a change is made that alters the structure of the `appData` object, the developer must perform the following steps:

1.  **Increment Version Constant:** In `js/state.js`, increment the `CURRENT_VERSION` constant. For example:
    ```javascript
    // js/state.js
    export const CURRENT_VERSION = 5; // Was previously 4
    ```
2.  **Add New Properties to Default State:** In `js/state.js`, add the new data property to the `defaultAppData` object so that new users get the updated structure.

3.  **Write Migration Script:** In `js/migration.js`, write a new function named `migrateToV_X_` (where `X` is the new version number). This function takes the `data` object as an argument and must perform the necessary transformations. Crucially, the function must end by setting `data.version = X;`.

    *Example from the project (v3):*
    ```javascript
    // js/migration.js
    function migrateToV3(data) {
        console.log("Running migration to v3...");
        if (data.employees && Array.isArray(data.employees)) {
            data.employees.forEach(emp => {
                if (emp.taxRemainders === undefined) {
                    emp.taxRemainders = { 
                        federal: 0, fica: 0, medicare: 0, state: 0, 
                        local: 0, suta: 0, futa: 0 
                    };
                }
            });
        }
        data.version = 3; // Stamp the data with its new version
    }
    ```
    *Example from the project (v4):*
    ```javascript
    // js/migration.js
    function migrateToV4(data) {
        console.log("Running migration to v4...");
        if (data.bankRegister && Array.isArray(data.bankRegister)) {
            data.bankRegister.forEach(t => {
                if (t.reconciled === undefined) {
                    t.reconciled = false;
                }
            });
        }
        data.version = 4; // Stamp the data with its new version
    }
    ```

4.  **Update the Migration Path:** In `js/migration.js`, add a new `case` to the `switch` statement inside the `migrateData` function. The cases are designed to fall through, ensuring that a very old backup can be brought up-to-date through a series of sequential migrations.

    ```javascript
    // js/migration.js
    export function migrateData(data) {
        const importVersion = data.version || 1;
        switch (importVersion) {
            case 1:
                migrateToV2(data);
            case 2:
                migrateToV3(data);
            case 3:
                migrateToV4(data); // Add the new case here
                break; 
        }
        return data;
    }

---
Copyright (c) 2025 greenwh. All Rights Reserved.