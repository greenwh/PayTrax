/*
  PayTrax Payroll Management
  Copyright (c) 2025 greenwh

  Developed by greenwh with substantial assistance from AI coding tools (Claude, ChatGPT, Gemini).
  This file is original work based on documentation and prompts by greenwh.
  Licensed under the MIT License.
*/
// js/main.js

// --- MODULE IMPORTS ---
import { appData, loadData, saveData, saveDataImmediate, isDirty } from './state.js';
import * as ui from './ui.js';
import * as logic from './logic.js';
import * as banking from './banking.js'; // Import the new banking module
import { importData, exportData } from './data-io.js';
import * as pdfExport from './pdf-export.js';
import * as validation from './validation.js';
import { showToast } from './toast.js';
import { createSnapshot, pushUndo } from './undo.js';
import { logAudit, getAuditLog, clearAuditLog } from './audit.js';

// --- EVENT HANDLER FUNCTIONS ---
// These functions connect user actions to the application's logic and UI updates.

/**
 * Handles clicks on the main navigation tabs.
 * @param {Event} event - The click event.
 */
function handleTabClick(event) {
    const tabButton = event.target.closest('.nav-tab');
    if (tabButton && tabButton.dataset.tab) {
        ui.showTab(tabButton.dataset.tab, tabButton);
        if (tabButton.dataset.tab === 'dashboard') {
            ui.refreshQuarterlyEarningsWidget();
            ui.refreshComplianceSummary();
        }
    }
}

/**
 * Handles changes to any of the settings fields.
 */
async function handleSettingsChange() {
    const settingsBefore = JSON.parse(JSON.stringify(appData.settings));
    logic.updateSettingsFromUI();

    // Validate settings after reading from UI — invalid settings must not be
    // recalculated against or persisted (audit F5). During initial setup
    // (no employees, no start date yet) validation is warn-only so the user
    // can fill in the form incrementally.
    const settingsErrors = validation.validateSettings(appData.settings);
    if (settingsErrors.length > 0) {
        const isInitialSetup = appData.employees.length === 0 && !appData.settings.firstPayPeriodStartDate;
        if (isInitialSetup) {
            console.warn('Settings validation warnings (initial setup):', settingsErrors);
        } else {
            validation.displayValidationErrors(settingsErrors);
            appData.settings = settingsBefore; // roll back the in-memory state
            ui.displaySettings();              // restore the form to the last valid state
            return;
        }
    }

    logic.generatePayPeriods();
    handleEmployeeChange(); // Refresh dropdowns and data (also refreshes quarterly widget)
    await saveDataImmediate();
    logAudit('Settings Changed', `Company: ${appData.settings.companyName}, Year: ${appData.settings.taxYear}`);
}

/**
 * Handles the main employee selection dropdown change.
 */
function handleEmployeeChange() {
    const employeeId = document.getElementById('currentEmployee').value;
    ui.populatePeriodDropdown(employeeId);
    ui.displayPayPeriods(employeeId);
    handlePeriodChange();
    ui.refreshQuarterlyEarningsWidget();
    ui.refreshComplianceSummary();
}

/**
 * Handles the pay period selection dropdown change.
 */
function handlePeriodChange() {
    const employeeId = document.getElementById('currentEmployee').value;
    const periodNum = document.getElementById('currentPeriod').value;
    const needsRecalc = logic.updateHoursFromPeriod(employeeId, periodNum);
    if (needsRecalc) {
        handleHoursChange();
    } else {
        ui.updateDashboardUI(employeeId, periodNum);
    }
}

/**
 * Handles changes to any of the hour input fields on the dashboard.
 */
function handleHoursChange() {
    // Validate hours input
    const hours = {
        regular: parseFloat(document.getElementById('regularHours').value) || 0,
        overtime: parseFloat(document.getElementById('overtimeHours').value) || 0,
        pto: parseFloat(document.getElementById('ptoHours').value) || 0,
        holiday: parseFloat(document.getElementById('holidayHours').value) || 0
    };

    const hoursErrors = validation.validateHours(hours);
    if (hoursErrors.length > 0) {
        // Invalid hours (negative, >168 total) must not reach the engine (audit F13)
        validation.displayValidationErrors(hoursErrors);
        return;
    }

    logic.calculatePay();
    const employeeId = document.getElementById('currentEmployee').value;
    const periodNum = document.getElementById('currentPeriod').value;
    const emp = appData.employees.find(e => e.id === employeeId);
    if (emp && periodNum) {
        logAudit('Period Calculated', `${emp.name} Period ${periodNum}`);
    }
    ui.updateDashboardUI(employeeId, periodNum);
    ui.displayPayPeriods(employeeId);
    banking.updateBankProjectionsUI(); // Delegated to banking module
    banking.displayRegister(); // Delegated to banking module
    ui.refreshQuarterlyEarningsWidget();
    ui.refreshComplianceSummary();
    saveData();
    const currentBalance = banking.getCurrentBankBalance(); // Delegated
    if (currentBalance < 0) {
        banking.showInsufficientFundsModal(currentBalance); // Delegated
    }
}

/**
 * Handles the submission of the employee form (add/edit).
 * @param {Event} event - The form submission event.
 */
async function handleEmployeeFormSubmit(event) {
    event.preventDefault();

    // Gather employee data from form
    const employeeData = {
        name: document.getElementById('employeeName').value,
        rate: parseFloat(document.getElementById('hourlyRate').value) || 0,
        overtimeMultiplier: parseFloat(document.getElementById('overtimeRate').value) || 1.5,
        holidayMultiplier: parseFloat(document.getElementById('holidayRate').value) || 2.0,
        fedTaxRate: parseFloat(document.getElementById('federalTax').value) || 0,
        stateTaxRate: parseFloat(document.getElementById('stateTax').value) || 0,
        localTaxRate: parseFloat(document.getElementById('localTax').value) || 0,
        ptoAccrualRate: parseFloat(document.getElementById('ptoAccrualRate').value) || 0,
        ptoBalance: parseFloat(document.getElementById('ptoBalance').value) || 0
    };

    // Validate employee data
    const errors = validation.validateEmployee(employeeData);
    if (errors.length > 0) {
        validation.displayValidationErrors(errors);
        return; // Prevent saving if validation fails
    }

    const editedEmployeeId = document.getElementById('employeeId').value;
    const isEdit = !!editedEmployeeId;
    logic.saveEmployeeFromForm();
    if (isEdit) {
        // Re-derive PTO and remainders so a changed starting balance or rate
        // takes effect immediately
        logic.recalculateAllPeriodsForEmployee(editedEmployeeId);
    }
    ui.populateEmployeeDropdowns();
    ui.resetEmployeeForm();
    await saveDataImmediate();
    logAudit(isEdit ? 'Employee Edited' : 'Employee Added', employeeData.name);
}

/**
 * Handles the employee selection in the settings tab for editing.
 */
function handleEditEmployeeSelect() {
    const employeeId = document.getElementById('employeeList').value;
    ui.renderEmployeeFormForEdit(employeeId);
}

/**
 * Handles deleting an employee.
 */
async function handleDeleteEmployee() {
    const employeeId = document.getElementById('employeeId').value;
    if (!employeeId) return;

    const employee = appData.employees.find(e => e.id === employeeId);
    if (!employee) return;

    const snapshot = createSnapshot({
        employee,
        payPeriods: appData.payPeriods[employeeId] || []
    });
    const employeeName = employee.name;

    logic.deleteEmployee();
    ui.populateEmployeeDropdowns();
    ui.resetEmployeeForm();
    await saveDataImmediate();
    logAudit('Employee Deleted', employeeName);

    pushUndo(`Deleted ${employeeName}`, snapshot, async (snap) => {
        appData.employees.push(snap.employee);
        appData.payPeriods[snap.employee.id] = snap.payPeriods;
        ui.populateEmployeeDropdowns();
        ui.resetEmployeeForm();
        await saveDataImmediate();
        logAudit('Undo', `Restored employee ${snap.employee.name}`);
    });
}

/**
 * Handles adding a deduction to an employee.
 */
async function handleAddDeduction() {
    const employeeId = document.getElementById('employeeId').value;
    if (!employeeId) {
        showToast('Please save the employee first before adding deductions.', 'warning');
        return;
    }

    const name = document.getElementById('deductionName').value.trim();
    const amount = parseFloat(document.getElementById('deductionAmount').value);
    const type = document.getElementById('deductionType').value;

    // Validate deduction data
    const deductionData = { name, amount, type };
    const errors = validation.validateDeduction(deductionData);
    if (errors.length > 0) {
        validation.displayValidationErrors(errors);
        return;
    }

    const success = logic.addDeduction(employeeId, name, amount, type);
    if (success) {
        ui.renderDeductionsTable(employeeId);
        // Clear the form
        document.getElementById('deductionName').value = '';
        document.getElementById('deductionAmount').value = '';
        document.getElementById('deductionType').value = 'fixed';

        // Trigger recalculation of all periods for this employee
        logic.recalculateAllPeriodsForEmployee(employeeId);
        await saveDataImmediate();
        logAudit('Deduction Added', `${name} (${type}: ${amount}) for ${appData.employees.find(e => e.id === employeeId)?.name || employeeId}`);
    }
}

/**
 * Handles deleting a deduction (delegated event handler).
 * @param {Event} event - The click event
 */
async function handleDeleteDeduction(event) {
    const deleteButton = event.target.closest('.delete-deduction-btn');
    if (!deleteButton) return;

    const deductionId = deleteButton.dataset.deductionId;
    const employeeId = document.getElementById('employeeId').value;

    const employee = appData.employees.find(e => e.id === employeeId);
    if (!employee) return;

    const deduction = employee.deductions.find(d => d.id === deductionId);
    if (!deduction) return;

    const snapshot = createSnapshot(deduction);
    const deductionName = deduction.name;

    const success = logic.deleteDeduction(employeeId, deductionId);
    if (success) {
        ui.renderDeductionsTable(employeeId);
        logic.recalculateAllPeriodsForEmployee(employeeId);
        await saveDataImmediate();

        logAudit('Deduction Deleted', `${deductionName} from ${employee.name}`);

        pushUndo(`Deleted deduction ${deductionName}`, snapshot, async (snap) => {
            const emp = appData.employees.find(e => e.id === employeeId);
            if (emp) {
                emp.deductions.push(snap);
                ui.renderDeductionsTable(employeeId);
                logic.recalculateAllPeriodsForEmployee(employeeId);
                await saveDataImmediate();
                logAudit('Undo', `Restored deduction ${snap.name}`);
            }
        });
    }
}

/**
 * Handles deleting a rate-history entry (delegated event handler).
 * The last entry of a history cannot be deleted.
 * @param {Event} event - The click event
 */
async function handleDeleteRateEntry(event) {
    const deleteButton = event.target.closest('.delete-rate-entry-btn');
    if (!deleteButton) return;

    const field = deleteButton.dataset.rateField;
    const effectiveDate = deleteButton.dataset.effectiveDate;
    const employeeId = document.getElementById('employeeId').value;

    const employee = appData.employees.find(e => e.id === employeeId);
    if (!employee) return;

    const success = logic.deleteRateHistoryEntry(employeeId, field, effectiveDate);
    if (!success) {
        showToast('Cannot delete the only remaining entry for this rate.', 'warning');
        return;
    }

    logic.recalculateAllPeriodsForEmployee(employeeId);
    ui.renderRateHistoryTable(employeeId);
    ui.renderEmployeeFormForEdit(employeeId); // refresh current-rate fields
    await saveDataImmediate();
    logAudit('Rate Entry Deleted', `${employee.name}: ${field} entry effective ${effectiveDate}`);
}

/**
 * Handles generating the pay stub.
 */
function handleGeneratePayStub() {
    const employeeId = document.getElementById('currentEmployee').value;
    const periodNum = document.getElementById('currentPeriod').value;
    if (!employeeId || !periodNum) {
        showToast('Please select an employee and pay period first.', 'warning');
        return;
    }
    ui.renderPayStubUI(employeeId, periodNum);
    ui.showTab('paystub', document.querySelector('[data-tab="paystub"]'));
}

// --- INITIALIZATION ---

/**
 * Sets up all the event listeners for the application.
 */
function setupEventListeners() {
    // Navigation
    document.querySelector('.nav-tabs').addEventListener('click', handleTabClick);

    // Dashboard
    document.getElementById('currentEmployee').addEventListener('change', handleEmployeeChange);
    document.getElementById('currentPeriod').addEventListener('change', handlePeriodChange);
    document.getElementById('regularHours').addEventListener('change', handleHoursChange);
    document.getElementById('overtimeHours').addEventListener('change', handleHoursChange);
    document.getElementById('ptoHours').addEventListener('change', handleHoursChange);
    document.getElementById('holidayHours').addEventListener('change', handleHoursChange);
    document.getElementById('generatePayStubBtn').addEventListener('click', handleGeneratePayStub);

    // Settings
    document.getElementById('companySettingsForm').addEventListener('change', handleSettingsChange);
    document.getElementById('taxSettingsForm').addEventListener('change', handleSettingsChange);
    document.getElementById('employeeForm').addEventListener('submit', handleEmployeeFormSubmit);
    document.getElementById('employeeList').addEventListener('change', handleEditEmployeeSelect);
    document.getElementById('newEmployeeBtn').addEventListener('click', ui.resetEmployeeForm);
    document.getElementById('deleteEmployeeBtn').addEventListener('click', handleDeleteEmployee);
    document.getElementById('importDataBtn').addEventListener('click', importData);
    document.getElementById('exportDataBtn').addEventListener('click', () => {
        exportData();
        ui.refreshComplianceSummary();
    });

    // Deductions Management
    document.getElementById('addDeductionBtn').addEventListener('click', handleAddDeduction);
    document.getElementById('deductionsTableBody').addEventListener('click', handleDeleteDeduction);
    document.getElementById('rateHistoryTableBody').addEventListener('click', handleDeleteRateEntry);
    
    // Reports
    document.getElementById('reportType').addEventListener('change', ui.toggleReportInputs);
    document.getElementById('generateReportBtn').addEventListener('click', ui.renderReportUI);

    // NEW: Add a delegated event listener to the static 'reports' tab container
    document.getElementById('reports').addEventListener('change', (event) => {
        // This will only trigger the function if the changed element was the frequency dropdown
        if (event.target.id === 'reportTaxFrequency') {
            ui.toggleReportInputs();
        }
    });

    // Delegated event listeners for CSV and PDF export buttons
    document.getElementById('reportOutput').addEventListener('click', (event) => {
        if (event.target.id === 'exportReportCSVBtn') {
            const reportType = event.target.dataset.reportType;
            const period = event.target.dataset.period;
            const start = event.target.dataset.start;
            const end = event.target.dataset.end;
            const employeeId = event.target.dataset.employee;

            switch (reportType) {
                case 'w2':
                    logic.exportW2ReportToCSV(period);
                    break;
                case '941':
                    logic.export941ReportToCSV(period);
                    break;
                case '940':
                    logic.export940ReportToCSV(period);
                    break;
                case 'daterange-employee':
                    logic.exportDateRangeEmployeeReportToCSV(start, end, employeeId);
                    break;
                case 'daterange-employer':
                    logic.exportDateRangeEmployerReportToCSV(start, end, employeeId);
                    break;
            }
        }

        if (event.target.id === 'exportReportPDFBtn') {
            const reportType = event.target.dataset.reportType;
            const period = event.target.dataset.period;
            const start = event.target.dataset.start;
            const end = event.target.dataset.end;
            const employeeId = event.target.dataset.employee;
            const reportSubType = event.target.dataset.subtype;

            switch (reportType) {
                case 'w2':
                    pdfExport.exportW2ReportToPDF(period);
                    break;
                case '941':
                    pdfExport.export941ReportToPDF(period);
                    break;
                case '940':
                    pdfExport.export940ReportToPDF(period);
                    break;
                case 'daterange':
                    pdfExport.exportCustomReportToPDF(start, end, employeeId, reportSubType);
                    break;
            }
        }
    });
    
    // Pay Stub
    document.getElementById('printPayStubBtn').addEventListener('click', ui.printPayStub);
    document.getElementById('exportPayStubPDFBtn').addEventListener('click', () => {
        const employeeId = document.getElementById('currentEmployee').value;
        const periodNum = document.getElementById('currentPeriod').value;
        if (!employeeId || !periodNum) {
            showToast('Please select an employee and pay period first.', 'warning');
            return;
        }
        pdfExport.exportPayStubToPDF(employeeId, periodNum);
    });

    // Audit Log
    document.getElementById('auditLogToggle').addEventListener('click', () => {
        const body = document.getElementById('auditLogBody');
        const arrow = document.getElementById('auditLogArrow');
        const isHidden = body.style.display === 'none';
        body.style.display = isHidden ? 'block' : 'none';
        arrow.textContent = isHidden ? '\u25BC' : '\u25B6';
        if (isHidden) ui.renderAuditLog();
    });

    document.getElementById('clearAuditLogBtn').addEventListener('click', () => {
        clearAuditLog();
        ui.renderAuditLog();
        showToast('Audit log cleared.', 'success');
    });

    // Banking event listeners are now handled within the banking module
}

/**
 * Main application initialization function.
 */
async function init() {
    await loadData(); // Await data loading before proceeding
    ui.displaySettings();
    ui.populateEmployeeDropdowns();
    logic.generatePayPeriods(); // This modifies state based on loaded settings
    banking.displayRegister(); // Delegated to banking module
    ui.toggleReportInputs();
    banking.updateBankProjectionsUI(); // Delegated to banking module
    setupEventListeners();
    banking.initBanking(); // Initialize event listeners for the banking module
    handleEmployeeChange(); // Set initial dashboard state
}

// Warn user about unsaved changes before leaving
window.addEventListener('beforeunload', (event) => {
    if (isDirty()) {
        event.preventDefault();
        event.returnValue = ''; // Required for Chrome < 119 and older browsers
    }
});

// Start the application once the window is loaded
window.addEventListener('load', init);