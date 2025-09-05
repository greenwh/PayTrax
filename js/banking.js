/*
  PayTrax Payroll Management
  Copyright (c) 2025 greenwh

  Developed by greenwh with substantial assistance from AI coding tools (Claude, ChatGPT, Gemini 2.5 Pro).
  This file is original work based on documentation and prompts by greenwh.
  Licensed under the MIT License.
*/
// js/banking.js

import { appData, saveData } from './state.js';
import { generateBasePayPeriods } from './logic.js';

// --- EVENT HANDLER FUNCTIONS (Internal to this module) ---

/**
 * Handles the submission of a new bank transaction.
 * @param {Event} event - The form submission event.
 */
function handleTransactionFormSubmit(event) {
    event.preventDefault();
    addTransactionFromForm();
    displayRegister();
    saveData();
    document.getElementById('transactionForm').reset();
}

/**
 * Handles deleting a bank transaction from the register.
 * @param {Event} event - The click event.
 */
function handleDeleteTransaction(event) {
    const deleteButton = event.target.closest('.delete-transaction-btn');
    if (deleteButton) {
        // This confirmation will be made conditional in a future phase
        if (confirm('Are you sure you want to delete this transaction?')) {
            const transId = deleteButton.dataset.id;
            deleteTransaction(transId);
            displayRegister();
            saveData();
        }
    }
}


// --- LOGIC FUNCTIONS (formerly in logic.js) ---

/**
 * Adds a transaction to the bank register from the UI form.
 */
function addTransactionFromForm() {
    const date = document.getElementById('transDate').value;
    const desc = document.getElementById('transDesc').value;
    const type = document.getElementById('transType').value;
    const amount = parseFloat(document.getElementById('transAmount').value);
    const dateParts = date.split('-');
    const formattedDate = `${dateParts[1]}/${dateParts[2]}/${dateParts[0]}`;
    addTransaction(formattedDate, desc, type, amount);
}

/**
 * Adds a transaction to the bank register in the appData state.
 * @param {string} date - The transaction date.
 * @param {string} description - The transaction description.
 * @param {string} type - 'debit' or 'credit'.
 * @param {number} amount - The transaction amount.
 * @param {string|null} id - An optional unique ID for the transaction.
 * @param {boolean} silent - If true, does not trigger a saveData call.
 */
export function addTransaction(date, description, type, amount, id = null, silent = false) {
    if (amount <= 0 || !description || !date) return;
    appData.bankRegister.push({ 
        id: id || `trans_${new Date().getTime()}`,
        date, description, 
        debit: type === 'debit' ? amount : 0, 
        credit: type === 'credit' ? amount : 0 
    });
}

/**
 * Deletes a transaction from the bank register.
 * @param {string} transId - The ID of the transaction to delete.
 */
function deleteTransaction(transId) {
    appData.bankRegister = appData.bankRegister.filter(t => t.id !== transId);
}

/**
 * Calculates bank fund projections based on historical payroll data.
 * @returns {object} - Projections for this month, next month, and average hours.
 */
function getBankProjections() {
    const allPayPeriodsWithData = [].concat.apply([], Object.values(appData.payPeriods)).filter(p => p.grossPay > 0);
    if (allPayPeriodsWithData.length === 0) {
        return { thisMonthRequired: 0, nextMonthRequired: 0, avgHours: 0 };
    }

    const totalCost = allPayPeriodsWithData.reduce((sum, p) => sum + p.grossPay + p.taxes.suta + p.taxes.futa + p.taxes.fica + p.taxes.medicare, 0);
    const avgCostPerPeriod = totalCost / allPayPeriodsWithData.length;
    const totalHours = allPayPeriodsWithData.reduce((sum, p) => sum + Object.values(p.hours).reduce((a, b) => a + b, 0), 0);
    const avgHours = totalHours / allPayPeriodsWithData.length;

    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();
    const nextMonth = (currentMonth + 1) % 12;
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;

    const basePeriods = generateBasePayPeriods();
    let thisMonthPeriods = 0;
    let nextMonthPeriods = 0;

    basePeriods.forEach(period => {
        const payDate = new Date(period.payDate);
        if (payDate.getMonth() === currentMonth && payDate.getFullYear() === currentYear && payDate >= currentDate) {
            thisMonthPeriods++;
        }
        if (payDate.getMonth() === nextMonth && payDate.getFullYear() === nextYear) {
            nextMonthPeriods++;
        }
    });

    return {
        thisMonthRequired: thisMonthPeriods * avgCostPerPeriod,
        nextMonthRequired: nextMonthPeriods * avgCostPerPeriod,
        avgHours: avgHours
    };
}

/**
 * Calculates the current balance of the bank register.
 * @returns {number} The current total balance.
 */
export function getCurrentBankBalance() {
    return appData.bankRegister.reduce((balance, trans) => balance + trans.credit - trans.debit, 0);
}


// --- UI FUNCTIONS (formerly in ui.js) ---

/**
 * Renders the bank register table from the appData.
 */
export function displayRegister() {
    const tbody = document.getElementById('bankRegisterBody');
    tbody.innerHTML = '';
    let balance = 0;
    
    // Sort transactions by date before rendering
    const sortedRegister = [...appData.bankRegister].sort((a, b) => new Date(a.date) - new Date(b.date));

    sortedRegister.forEach(trans => {
        balance += trans.credit - trans.debit;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${trans.date}</td><td>${trans.description}</td>
            <td class="debit">${trans.debit > 0 ? '$' + trans.debit.toFixed(2) : '-'}</td>
            <td class="credit">${trans.credit > 0 ? '$' + trans.credit.toFixed(2) : '-'}</td>
            <td>$${balance.toFixed(2)}</td>
            <td><button class="btn btn-danger btn-sm delete-transaction-btn" data-id="${trans.id}">Delete</button></td>
        `;
        tbody.appendChild(row);
    });
    
    const currentBalanceEl = document.getElementById('currentBalance');
    currentBalanceEl.textContent = `$${balance.toFixed(2)}`;
    currentBalanceEl.style.color = balance >= 0 ? '#28a745' : '#dc3545';
}

/**
 * Updates the bank fund projection widgets on the dashboard.
 */
export function updateBankProjectionsUI() {
    const { thisMonthRequired, nextMonthRequired, avgHours } = getBankProjections();
    document.getElementById('thisMonthRequired').textContent = thisMonthRequired.toFixed(2);
    document.getElementById('nextMonthRequired').textContent = nextMonthRequired.toFixed(2);
    document.getElementById('projectedHours').textContent = avgHours.toFixed(1);
}

/**
 * Displays an alert modal for insufficient bank funds.
 * @param {number} balance - The current negative balance.
 */
export function showInsufficientFundsModal(balance) {
    const modal = document.getElementById('insufficientFundsModal');
    const balanceEl = document.getElementById('modalBalance');
    if (modal && balanceEl) {
        balanceEl.textContent = `$${balance.toFixed(2)}`;
        modal.style.display = 'flex'; // Use flex for centering
        setTimeout(() => modal.classList.add('visible'), 10); // Trigger transition
    }
}

/**
 * Hides the insufficient funds modal.
 */
export function hideInsufficientFundsModal() {
    const modal = document.getElementById('insufficientFundsModal');
    if (modal) {
        modal.classList.remove('visible');
        // Wait for transition to finish before hiding
        setTimeout(() => modal.style.display = 'none', 300);
    }
}


// --- INITIALIZATION ---

/**
 * Sets up all the event listeners for the banking module.
 */
export function initBanking() {
    document.getElementById('transactionForm').addEventListener('submit', handleTransactionFormSubmit);
    document.getElementById('bankRegisterBody').addEventListener('click', handleDeleteTransaction);
    document.getElementById('closeModalBtn').addEventListener('click', hideInsufficientFundsModal);
    document.getElementById('insufficientFundsModal').addEventListener('click', (event) => {
        if (event.target.id === 'insufficientFundsModal') {
            hideInsufficientFundsModal();
        }
    });
}