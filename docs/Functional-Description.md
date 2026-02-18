# PAYTRAX FUNCTIONAL DESCRIPTION

PayTrax is a standalone, browser-based payroll management system designed for small businesses. It operates entirely on the client-side, meaning it doesn't require a server or internet connection after the initial page load. All data is stored locally in the user's browser, making it a private and self-contained tool.

## Core Architecture and Concepts

The application is built on a few key principles:

*   **Single Source of Truth:** The entire state of the application (all settings, employee data, pay periods, etc.) is held within a single JavaScript object called `appData` (defined in `js/state.js`).
*   **Modular Design:** The JavaScript code is logically split into modules, each with a distinct responsibility:
    *   `main.js`: The central controller that initializes the application and orchestrates events.
    *   `state.js`: Manages the `appData` object, handles debounced and immediate saving/loading, and runs data migrations on startup.
    *   `logic.js`: Contains core business logic for **payroll calculations**, pay period generation, and the running remainder tax algorithm.
    *   `employees.js`: Manages **employee CRUD operations** and **deduction calculations** (fixed amount and percentage-based).
    *   `reports.js`: Generates **tax reports** (W-2, 941, 940, tax deposit, custom date-range) and **CSV exports**.
    *   `banking.js`: A dedicated module containing all logic and UI functions for the **bank register**, including CSV import with auto-reconciliation.
    *   `ui.js`: Manages DOM manipulation for all non-banking tabs.
    *   `utils.js`: Date utilities for converting between storage format (YYYY-MM-DD), display format (M/D/YYYY), and Date objects.
    *   `validation.js`: Data validation for employees, hours, settings, transactions, and deductions.
    *   `pdf-export.js`: PDF generation for pay stubs and reports using jsPDF.
    *   `db.js`: A dedicated module for handling data persistence using IndexedDB.
    *   `data-io.js` & `migration.js`: These handle data portability (importing/exporting JSON backups) and ensuring that older data (v1 through v8) can be migrated to the current structure (v9).
*   **Event-Driven Calculation:** The application feels dynamic because calculations are triggered by user input events, which update the state and trigger a UI refresh.
*   **Robust Data Persistence:** The application saves data using a debounced save mechanism (300ms) for routine changes and an immediate save for critical operations. Data is persisted to IndexedDB with a graceful fallback to localStorage. An unsaved-changes warning appears if the user tries to leave with pending changes.

## Functional Breakdown by Tab

### Dashboard

This is the primary workspace for running payroll. The user selects an employee and period, enters hours, and sees all pay, tax, and cost calculations update in real-time. This action also automatically creates a debit transaction in the banking module (when the auto-subtraction setting is enabled). The dashboard also shows bank fund projections for upcoming payroll costs.

### Settings

This is the configuration hub for the entire application, including:
*   **Company Settings:** Name, address, phone, tax year, pay frequency, and first pay period start date.
*   **Tax Settings:** Social Security, Medicare, SUTA, FUTA rates, configurable wage bases and thresholds, and tax deposit frequencies.
*   **Employee Management:** Add, edit, and delete employees with rates, multipliers, tax withholding, and PTO settings.
*   **Employee Deductions:** For existing employees, configure recurring deductions (401k, health insurance, etc.) as fixed amounts or percentages of gross pay. Deductions are date-aware and only apply to pay periods on or after their creation date.
*   **Auto Bank Subtraction:** Toggle whether payroll calculations automatically create debit transactions in the bank register.
*   **Data Management:** Export/Import the complete application data as JSON backup files.

### Pay Periods & Pay Stub

These tabs provide read-only views of payroll results. `Pay Periods` shows a year-long history for an employee, while `Pay Stub` generates a professional, printable payslip for a specific pay run with current and YTD totals. Pay stubs can be exported to PDF.

### Reports

A powerful compliance section that aggregates payroll data into several key financial reports:
*   **Tax Deposit Schedules** — by configurable frequency (weekly, monthly, quarterly, annual)
*   **Annual W-2 Data** — per-employee wage and tax summary
*   **Quarterly Form 941 Data** — federal payroll tax return data with monthly liability breakdown
*   **Annual Form 940 Data** — FUTA tax return data with quarterly liability breakdown
*   **Custom Date-Range Reports** — employee wage reports and employer expense reports for any date range

All reports can be exported to CSV for use in spreadsheet applications.

### Banking

This module functions as a comprehensive bank register.

*   **Core Ledger:** Displays a running balance and a chronological list of all transactions. Payroll debits are added automatically when auto-subtraction is enabled.
*   **Reconciliation:** Users can click a checkbox on any transaction to mark it as "reconciled," which visually grays it out and prepares it for potential purging.
*   **Inline Editing:** Transactions can be edited in-place by clicking the Edit button.
*   **Filtering:** A filter bar allows the user to instantly narrow down the transaction list by a date range, text in the description, or by its reconciled status (All, Reconciled, or Uncleared).
*   **CSV Import:** Import bank statement CSV files with automatic format detection (supports multiple bank formats). Imported transactions are fuzzy-matched against existing entries to avoid duplicates, with optional auto-reconciliation.
*   **Data Management:**
    *   **Export:** The user can export the currently filtered view of the register to a CSV file.
    *   **Purge:** A safe mechanism allows the user to permanently delete all reconciled transactions up to a chosen date, automatically creating an opening balance entry to preserve the running total.

---
Copyright (c) 2025 greenwh. Licensed under the [MIT License](../LICENSE).
