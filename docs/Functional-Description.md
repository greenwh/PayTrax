# PAYTRAX FUNCTIONAL DESCRIPTION

PayTrax is a standalone, browser-based payroll management system designed for small businesses. It operates entirely on the client-side, meaning it doesn't require a server or internet connection after the initial page load. All data is stored locally in the user's browser, making it a private and self-contained tool.

## Core Architecture and Concepts

The application is built on a few key principles:

*   **Single Source of Truth:** The entire state of the application (all settings, employee data, pay periods, etc.) is held within a single JavaScript object called `appData` (defined in `js/state.js`).
*   **Modular Design:** The JavaScript code is logically split into modules, each with a distinct responsibility:
    *   `main.js`: The central controller that initializes the application and orchestrates events.
    *   `state.js`: Manages the `appData` object and handles saving/loading.
    *   `logic.js`: Contains the business logic for **payroll calculations** and report generation.
    *   `banking.js`: A dedicated module containing all logic and UI functions for the **bank register**.
    *   `ui.js`: Manages DOM manipulation for all non-banking tabs.
    *   `db.js`: A dedicated module for handling data persistence using IndexedDB.
    *   `data-io.js` & `migration.js`: These handle data portability (importing/exporting JSON backups) and ensuring that older backup files can be updated to the latest data structure, a crucial feature for long-term usability.
*   **Event-Driven Calculation:** The application feels dynamic because calculations are triggered by user input events, which update the state and trigger a UI refresh.
*   **Robust Data Persistence:** The application intelligently saves all data to the browser's IndexedDB, with a graceful fallback to localStorage.

## Functional Breakdown by Tab

### Dashboard

This is the primary workspace for running payroll. The user selects an employee and period, enters hours, and sees all pay, tax, and cost calculations update in real-time. This action also automatically creates a debit transaction in the banking module.

### Settings

This is the configuration hub for the entire application, including Company, Tax, and Employee data. All changes are saved automatically. Users can also perform data backups (Export) and restores (Import) from this tab.

### Pay Periods & Pay Stub

These tabs provide read-only views of payroll results. `Pay Periods` shows a year-long history for an employee, while `Pay Stub` generates a professional, printable payslip for a specific pay run with current and YTD totals.

### Reports

A powerful compliance section that aggregates payroll data into several key financial reports, including data summaries for W-2, 941, and 940 tax forms, as well as custom date-range reports.

### Banking

This module functions as a comprehensive bank register.

*   **Core Ledger:** Displays a running balance and a chronological list of all transactions. Payroll debits are added automatically.
*   **Reconciliation:** Users can click a checkbox on any transaction to mark it as "reconciled," which visually grays it out and prepares it for potential purging.
*   **Filtering:** A filter bar allows the user to instantly narrow down the transaction list by a date range, text in the description, or by its reconciled status (All, Reconciled, or Uncleared).
*   **Data Management:**
    *   **Export:** The user can export the currently filtered view of the register to a CSV file.
    *   **Purge:** A safe mechanism allows the user to permanently delete all reconciled transactions up to a chosen date, helping to keep the register manageable over time.
    
---
Copyright (c) 2025 greenwh. All Rights Reserved.