/*
  PayTrax Payroll Management
  Copyright (c) 2025 greenwh

  Developed by greenwh with substantial assistance from AI coding tools (Claude, ChatGPT, Gemini 2.5 Pro).
  This file is original work based on documentation and prompts by greenwh.
  Licensed under the MIT License.
*/
// js/main.js

// --- MODULE IMPORTS ---
import { loadData, saveData } from './state.js';
import * as ui from './ui.js';
import * as logic from './logic.js';
import { importData, exportData } from './data-io.js';

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
    }
}

/**
 * Handles changes to any of the settings fields.
 */
function handleSettingsChange() {
    logic.updateSettingsFromUI();
    logic.generatePayPeriods();
    handleEmployeeChange(); // Refresh dropdowns and data
    saveData();
}

/**
 * Handles the main employee selection dropdown change.
 */
function handleEmployeeChange() {
    const employeeId = document.getElementById('currentEmployee').value;
    ui.populatePeriodDropdown(employeeId);
    ui.displayPayPeriods(employeeId);
    handlePeriodChange();
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
    logic.calculatePay();
    const employeeId = document.getElementById('currentEmployee').value;
    const periodNum = document.getElementById('currentPeriod').value;
    ui.updateDashboardUI(employeeId, periodNum);
    ui.displayPayPeriods(employeeId);
    ui.updateBankProjectionsUI();
    ui.displayRegister();
    saveData();
    const currentBalance = logic.getCurrentBankBalance();
    if (currentBalance < 0) {
        ui.showInsufficientFundsModal(currentBalance);
    }
}

/**
 * Handles the submission of the employee form (add/edit).
 * @param {Event} event - The form submission event.
 */
function handleEmployeeFormSubmit(event) {
    event.preventDefault();
    logic.saveEmployeeFromForm();
    ui.populateEmployeeDropdowns();
    ui.resetEmployeeForm();
    saveData();
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
function handleDeleteEmployee() {
    if (confirm('Are you sure you want to delete this employee and all their payroll data?')) {
        logic.deleteEmployee();
        ui.populateEmployeeDropdowns();
        ui.resetEmployeeForm();
        saveData();
    }
}

/**
 * Handles generating the pay stub.
 */
function handleGeneratePayStub() {
    const employeeId = document.getElementById('currentEmployee').value;
    const periodNum = document.getElementById('currentPeriod').value;
    if (!employeeId || !periodNum) {
        alert('Please select an employee and pay period first.');
        return;
    }
    ui.renderPayStubUI(employeeId, periodNum);
    ui.showTab('paystub', document.querySelector('[data-tab="paystub"]'));
}

/**
 * Handles the submission of a new bank transaction.
 * @param {Event} event - The form submission event.
 */
function handleTransactionFormSubmit(event) {
    event.preventDefault();
    logic.addTransactionFromForm();
    ui.displayRegister();
    saveData();
    document.getElementById('transactionForm').reset();
}

/**
 * Handles deleting a bank transaction from the register.
 * @param {Event} event - The click event.
 */
function handleDeleteTransaction(event) {
    const deleteButton = event.target.closest('.delete-transaction-btn');
    if (deleteButton && confirm('Are you sure you want to delete this transaction?')) {
        const transId = deleteButton.dataset.id;
        logic.deleteTransaction(transId);
        ui.displayRegister();
        saveData();
    }
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
    document.getElementById('exportDataBtn').addEventListener('click', exportData);
    
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
    
    document.getElementById('generateReportBtn').addEventListener('click', ui.renderReportUI);

    // Banking
    document.getElementById('transactionForm').addEventListener('submit', handleTransactionFormSubmit);
    document.getElementById('bankRegisterBody').addEventListener('click', handleDeleteTransaction);
    
    // Pay Stub
    document.getElementById('printPayStubBtn').addEventListener('click', ui.printPayStub);

    // Modal closing
    document.getElementById('closeModalBtn').addEventListener('click', ui.hideInsufficientFundsModal);
    document.getElementById('insufficientFundsModal').addEventListener('click', (event) => {
        if (event.target.id === 'insufficientFundsModal') {
            ui.hideInsufficientFundsModal();
        }
    });
}

/**
 * Main application initialization function.
 */
async function init() {
    await loadData(); // Await data loading before proceeding
    ui.displaySettings();
    ui.populateEmployeeDropdowns();
    logic.generatePayPeriods(); // This modifies state based on loaded settings
    ui.displayRegister();
    ui.toggleReportInputs();
    ui.updateBankProjectionsUI();
    setupEventListeners();
    handleEmployeeChange(); // Set initial dashboard state
}

// Start the application once the window is loaded
window.addEventListener('load', init);