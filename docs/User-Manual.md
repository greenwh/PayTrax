# PayTrax User Manual

This manual provides a detailed overview of all features within the PayTrax application.

## Dashboard

The Dashboard is your main hub for running payroll. Its primary function is to select an employee and a pay period to calculate their pay.

*   **Employee & Period Selection:** Use the two dropdowns at the top to select the active employee and pay period. All calculations on the dashboard are based on this selection.
*   **Enter Hours:** Input the hours worked for the selected employee in this period. The system supports Regular, Overtime, PTO, and Holiday hours. Calculations update instantly as you type.
*   **Pay Period Details:** This card gives you an immediate summary of the current calculation, including Gross Pay, total taxes, Net Pay, and the total cost to the employer for this paycheck.
*   **Bank Funds Required:** This widget gives you a high-level projection of upcoming payroll costs to help with cash flow management.
*   **Generate Pay Stub:** After entering hours, click this button to be taken to the `Pay Stub` tab with a printable slip pre-generated for the selected employee and period.

## Settings

This tab is the control center for configuring the entire application. All data is saved automatically when you change a field.

*   **Company Settings:** Configure your company's name, address, and pay schedule. The `Pay Frequency` and `First Pay Period Start Date` are critical for generating the correct pay calendars.
*   **Tax Settings:** Set the global tax rates for Social Security, Medicare, SUTA, and FUTA. You can also define how often you need to deposit taxes for various authorities (e.g., monthly for federal, quarterly for SUTA).
*   **Employee Management:**
    *   To add a new employee, simply fill out the form and click "Save Employee."
    *   To edit an existing employee, select their name from the "Employee List" dropdown. The form will populate with their data. Make your changes and click "Save Employee."
    *   To delete an employee, select them from the list and click the "Delete Employee" button. **Warning:** This action is permanent and will remove the employee and all their associated payroll data.
*   **Data Management:**
    *   **Export Data:** Click to save a full backup of all your application data (settings, employees, pay periods, etc.) to a JSON file on your computer. It's recommended to do this regularly.
    *   **Import Data:** Click to load data from a previously exported backup file. **Warning:** Importing will completely overwrite all existing data in the application.

## Pay Periods

This tab provides a comprehensive table showing all generated pay periods and their corresponding payroll data for the currently selected employee on the Dashboard. It's a great way to see a full-year overview of an employee's pay history.

## Pay Stub

This tab displays a formal, printable pay stub.

1.  First, select an employee and period on the `Dashboard` and enter their hours.
2.  Click the "Generate Pay Stub" button.
3.  You will be brought to this tab, where you can review the detailed pay stub, including current and Year-to-Date (YTD) totals.
4.  Click the `Print Pay Stub` button to open a print-friendly version of the slip.

## Reports

The Reports tab helps you gather data for tax compliance.

1.  Select the `Report Type` from the dropdown (e.g., Tax Deposit, Annual W-2 Data, Form 941 Data).
2.  Additional input fields will appear based on your selection. For example, the Tax Deposit report will ask for a frequency and period.
3.  Click `Generate Report`. A formatted table will appear below with the data you need for your tax forms or deposits.

## Banking

This tab features a simple bank register to help you track your business bank account balance.

*   **Current Balance:** A prominent display of your calculated account balance.
*   **Add New Transaction:** Use this form to manually enter deposits (credits) or withdrawals/expenses (debits).
*   **Filter Transactions:** This powerful tool allows you to find specific transactions easily.
    *   **Date Range:** Select a start and/or end date.
    *   **Description:** Type any part of a description to search for it.
    *   **Status:** Show "All", only "Reconciled", or only "Uncleared" transactions.
    *   Filters are applied instantly as you type or select. Click `Clear Filters` to reset the view.
*   **Register Actions:**
    *   **Export to CSV:** Exports the currently filtered list of transactions to a standard CSV file that can be opened in any spreadsheet program.
    *   **Purge Transactions:** Opens a dialog to permanently delete old, reconciled data. This is useful for keeping your register clean. Select a cutoff date, and all transactions *that have been marked as reconciled* on or before that date will be deleted. **This action cannot be undone.**
*   **Register Table:** A chronological list of all transactions.
    *   Payrolls are automatically added as debits whenever you calculate pay on the Dashboard.
    *   **Reconciled Checkbox:** Click this checkbox to mark a transaction as cleared. This is the core of reconciling your account. Reconciled transactions are grayed out.
    *   You can manually delete any single transaction using the "Delete" button.````

---
Copyright (c) 2025 greenwh. All Rights Reserved.