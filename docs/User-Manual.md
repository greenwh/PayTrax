# PayTrax User Manual

This manual provides a detailed overview of all features within the PayTrax application.

## Dashboard

The Dashboard is your main hub for running payroll. Its primary function is to select an employee and a pay period to calculate their pay.

*   **Employee & Period Selection:** Use the two dropdowns at the top to select the active employee and pay period. All calculations on the dashboard are based on this selection.
*   **Enter Hours:** Input the hours worked for the selected employee in this period. The system supports Regular, Overtime, PTO, and Holiday hours. Calculations update instantly as you type.
*   **Pay Period Details:** This card gives you an immediate summary of the current calculation, including Gross Pay, total taxes, deductions, Net Pay, and the total cost to the employer for this paycheck.
*   **Bank Funds Required:** This widget gives you a high-level projection of upcoming payroll costs to help with cash flow management.
*   **Generate Pay Stub:** After entering hours, click this button to be taken to the `Pay Stub` tab with a printable slip pre-generated for the selected employee and period.

## Settings

This tab is the control center for configuring the entire application. All data is saved automatically when you change a field.

*   **Company Settings:** Configure your company's name, address, phone, and pay schedule. The `Pay Frequency` and `First Pay Period Start Date` are critical for generating the correct pay calendars.
*   **Tax Settings:** Set the global tax rates for Social Security, Medicare, SUTA, and FUTA. Configure wage bases and thresholds (SS Wage Base, FUTA Wage Base, SUTA Wage Base, Additional Medicare Threshold). You can also define how often you need to deposit taxes for various authorities (e.g., monthly for federal, quarterly for SUTA).
*   **⚠️ Retroactive Recalculation Warning:** Changing an employee's hourly rate or any tax rate retroactively recalculates **all** pay periods in the current tax year, including periods that have already been paid. The recalculated figures will no longer match what was actually deposited. **Export a backup before changing rates mid-year.**
*   **Auto Bank Subtraction:** When enabled (the default), payroll calculations automatically create debit transactions in the Bank Register. Uncheck this if you prefer to manage bank transactions manually.
*   **Employee Management:**
    *   To add a new employee, simply fill out the form and click "Save Employee."
    *   To edit an existing employee, select their name from the "Employee List" dropdown. The form will populate with their data. Make your changes and click "Save Employee."
    *   To delete an employee, select them from the list and click the "Delete Employee" button. **Warning:** This action is permanent and will remove the employee and all their associated payroll data.
*   **Employee Deductions:**
    *   Deductions are only available for existing employees (save the employee first).
    *   Click "Add Deduction" to create a recurring deduction such as 401k contributions, health insurance premiums, or garnishments.
    *   Each deduction has a name, amount, and type (fixed dollar amount or percentage of gross pay).
    *   Deductions are date-aware: they only apply to pay periods on or after the date the deduction was created. This prevents retroactive changes to already-processed payroll.
    *   Adding or removing a deduction automatically recalculates all pay periods for that employee.
*   **Data Management:**
    *   **Export Data:** Click to save a full backup of all your application data (settings, employees, pay periods, bank register) to a JSON file on your computer. It's recommended to do this regularly.
    *   **Import Data:** Click to load data from a previously exported backup file. Older backup formats are automatically updated to the current version. **Warning:** Importing will completely overwrite all existing data in the application.

## Pay Periods

This tab provides a comprehensive table showing all generated pay periods and their corresponding payroll data for the currently selected employee on the Dashboard. It's a great way to see a full-year overview of an employee's pay history, including hours, earnings, taxes, deductions, and net pay for each period.

## Pay Stub

This tab displays a formal, printable pay stub.

1.  First, select an employee and period on the `Dashboard` and enter their hours.
2.  Click the "Generate Pay Stub" button.
3.  You will be brought to this tab, where you can review the detailed pay stub, including current and Year-to-Date (YTD) totals for earnings, taxes, and deductions.
4.  Click the `Print Pay Stub` button to open a print-friendly version of the slip.
5.  Click the `Export PDF` button to download the pay stub as a PDF file.

## Reports

The Reports tab helps you gather data for tax compliance. All reports can be exported to CSV for use in spreadsheet applications.

1.  Select the `Report Type` from the dropdown:
    *   **Tax Deposit** — Shows tax liabilities due based on your configured deposit frequencies. Select the deposit frequency and the period to calculate.
    *   **Annual W-2 Data** — Per-employee wage and tax summary for the year, with W-2 box numbers.
    *   **Quarterly Form 941 Data** — Federal payroll tax return data with social security and Medicare wage calculations, fractions-of-cents adjustment, and monthly liability breakdown.
    *   **Annual Form 940 Data** — FUTA tax return data with quarterly liability breakdown.
    *   **Custom Employee Wage Report** — Detailed employee wages for any date range.
    *   **Custom Employer Expense Report** — Employer costs (wages plus employer taxes) for any date range.
2.  Fill in any additional fields (period, date range, employee selection).
3.  Click `Generate Report`. A formatted table will appear with the data you need.
4.  Click `Export to CSV` to download the report data.

**Limitation — Additional Medicare Tax:** PayTrax *reports* wages above the Additional Medicare threshold on the Form 941 report, but it does **not withhold** the Additional Medicare Tax (0.9%) from employee paychecks. If any employee's wages cross the threshold, the 941 report will display a warning, the "Balance Due" line will be non-zero, and actual withholding will be short. Consult your accountant before filing in that situation.

## Banking

This tab features a comprehensive bank register to help you track your business bank account balance.

*   **Current Balance:** A prominent display of your calculated account balance, color-coded green for positive and red for negative.
*   **Add New Transaction:** Use this form to manually enter deposits (credits) or withdrawals/expenses (debits). Select a date, enter a description, choose the type, and enter the amount.
*   **Filter Transactions:** This powerful tool allows you to find specific transactions easily.
    *   **Date Range:** Select a start and/or end date.
    *   **Description:** Type any part of a description to search for it.
    *   **Status:** Show "All", only "Reconciled", or only "Uncleared" transactions.
    *   Filters are applied instantly as you type or select. Click `Clear Filters` to reset the view.
*   **CSV Import:**
    *   Click "Sync" to import new transactions from a bank statement CSV file.
    *   Click "Import & Reconcile" to import and automatically mark matching existing transactions as reconciled.
    *   The system automatically detects the CSV format and fuzzy-matches against existing transactions to avoid duplicates.
*   **Register Actions:**
    *   **Export to CSV:** Exports the currently filtered list of transactions to a standard CSV file.
    *   **Purge Transactions:** Opens a dialog to permanently delete old, reconciled data. Select a cutoff date, and all transactions *that have been marked as reconciled* on or before that date will be deleted. An opening balance entry is automatically created to preserve the running total. **This action cannot be undone.**
*   **Register Table:** A chronological list of all transactions.
    *   Payrolls are automatically added as debits whenever you calculate pay on the Dashboard (if auto-subtraction is enabled).
    *   **Edit:** Click to edit a transaction's date, description, type, or amount inline.
    *   **Reconciled Checkbox:** Click this checkbox to mark a transaction as cleared. Reconciled transactions are grayed out.
    *   **Delete:** Remove any single transaction using the "Delete" button.

---
Copyright (c) 2025 greenwh. Licensed under the [MIT License](../LICENSE).
