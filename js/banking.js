/*
  PayTrax Payroll Management
  Copyright (c) 2025 greenwh

  Developed by greenwh with substantial assistance from AI coding tools (Claude, ChatGPT, Gemini).
  This file is original work based on documentation and prompts by greenwh.
  Licensed under the MIT License.
*/
// js/banking.js

import { appData, saveData } from './state.js';
import { generateBasePayPeriods } from './logic.js';

// --- EVENT HANDLER FUNCTIONS (Internal to this module) ---

function handleTransactionFormSubmit(event) {
    event.preventDefault();
    addTransactionFromForm();
    displayRegister();
    saveData();
    document.getElementById('transactionForm').reset();
}

function handleRegisterClick(event) {
    const deleteButton = event.target.closest('.delete-transaction-btn');
    const reconcileCheckbox = event.target.closest('.reconcile-checkbox');

    if (deleteButton) {
        if (confirm('Are you sure you want to delete this transaction?')) {
            const transId = deleteButton.dataset.id;
            deleteTransaction(transId);
            displayRegister();
            saveData();
        }
    }

    if (reconcileCheckbox) {
        const transId = reconcileCheckbox.dataset.id;
        toggleTransactionReconciled(transId);
        displayRegister();
        saveData();
    }
}

function handleClearFilters() {
    document.getElementById('filterForm').reset();
    displayRegister();
}

function handlePurgeConfirm() {
    const cutoffDateEl = document.getElementById('purgeCutoffDate');
    const cutoffDate = cutoffDateEl.value;
    if (!cutoffDate) {
        alert('Please select a cutoff date.');
        return;
    }

    const count = getPurgeableCount(cutoffDate);
    if (confirm(`Are you sure you want to permanently delete ${count} reconciled transaction(s) on or before ${cutoffDate}? This cannot be undone.`)) {
        const purgedCount = purgeTransactions(cutoffDate);
        hidePurgeModal();
        alert(`${purgedCount} transaction(s) have been purged.`);
        displayRegister();
        saveData();
    }
}


// --- LOGIC FUNCTIONS ---

function filterTransactions(transactions, filters) {
    let filtered = [...transactions];

    if (filters.startDate) {
        const start = new Date(filters.startDate + 'T00:00:00');
        filtered = filtered.filter(t => new Date(t.date) >= start);
    }
    if (filters.endDate) {
        const end = new Date(filters.endDate + 'T23:59:59');
        filtered = filtered.filter(t => new Date(t.date) <= end);
    }
    if (filters.description) {
        const searchTerm = filters.description.toLowerCase();
        filtered = filtered.filter(t => t.description.toLowerCase().includes(searchTerm));
    }
    if (filters.status === 'reconciled') {
        filtered = filtered.filter(t => t.reconciled === true);
    }
    if (filters.status === 'uncleared') {
        filtered = filtered.filter(t => t.reconciled === false);
    }

    return filtered;
}

function addTransactionFromForm() {
    const date = document.getElementById('transDate').value;
    const desc = document.getElementById('transDesc').value;
    const type = document.getElementById('transType').value;
    const amount = parseFloat(document.getElementById('transAmount').value);
    const dateParts = date.split('-');
    const formattedDate = `${dateParts[1]}/${dateParts[2]}/${dateParts[0]}`;
    addTransaction(formattedDate, desc, type, amount);
}

export function addTransaction(date, description, type, amount, id = null, silent = false) {
    if (amount <= 0 || !description || !date) return;
    appData.bankRegister.push({ 
        id: id || `trans_${new Date().getTime()}`,
        date, description, 
        debit: type === 'debit' ? amount : 0, 
        credit: type === 'credit' ? amount : 0,
        reconciled: false
    });
}

function deleteTransaction(transId) {
    appData.bankRegister = appData.bankRegister.filter(t => t.id !== transId);
}

function toggleTransactionReconciled(transId) {
    const transaction = appData.bankRegister.find(t => t.id === transId);
    if (transaction) {
        transaction.reconciled = !transaction.reconciled;
    }
}

function purgeTransactions(cutoffDateStr) {
    const originalCount = appData.bankRegister.length;
    const cutoffDate = new Date(cutoffDateStr + 'T23:59:59');
    
    appData.bankRegister = appData.bankRegister.filter(t => {
        return new Date(t.date) > cutoffDate || t.reconciled === false;
    });

    return originalCount - appData.bankRegister.length;
}

function getPurgeableCount(cutoffDateStr) {
    const cutoffDate = new Date(cutoffDateStr + 'T23:59:59');
    return appData.bankRegister.filter(t => new Date(t.date) <= cutoffDate && t.reconciled === true).length;
}

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

export function getCurrentBankBalance() {
    return appData.bankRegister.reduce((balance, trans) => balance + trans.credit - trans.debit, 0);
}


// --- UI & DATA MANAGEMENT FUNCTIONS ---

function exportTransactionsToCSV() {
    const filters = {
        startDate: document.getElementById('filterStartDate').value,
        endDate: document.getElementById('filterEndDate').value,
        description: document.getElementById('filterDescription').value,
        status: document.getElementById('filterStatus').value,
    };
    
    const transactionsToExport = filterTransactions(appData.bankRegister, filters);

    if (transactionsToExport.length === 0) {
        alert('No transactions to export with the current filters.');
        return;
    }

    let csvContent = "Date,Description,Debit,Credit,Reconciled\n";
    transactionsToExport.forEach(t => {
        const description = `"${t.description.replace(/"/g, '""')}"`;
        const row = [t.date, description, t.debit, t.credit, t.reconciled].join(',');
        csvContent += row + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    const date = new Date().toISOString().slice(0, 10);
    link.setAttribute("download", `PayTrax_Register_Export_${date}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export function displayRegister() {
    const tbody = document.getElementById('bankRegisterBody');
    tbody.innerHTML = '';

    const filters = {
        startDate: document.getElementById('filterStartDate').value,
        endDate: document.getElementById('filterEndDate').value,
        description: document.getElementById('filterDescription').value,
        status: document.getElementById('filterStatus').value,
    };

    const sortedRegister = [...appData.bankRegister].sort((a, b) => new Date(a.date) - new Date(b.date));
    const transactionsToDisplay = filterTransactions(sortedRegister, filters);

    let runningBalance = 0;
    const balanceMap = new Map();
    sortedRegister.forEach(trans => {
        runningBalance += trans.credit - trans.debit;
        balanceMap.set(trans.id, runningBalance);
    });

    transactionsToDisplay.forEach(trans => {
        const row = document.createElement('tr');
        if (trans.reconciled) {
            row.classList.add('reconciled');
        }

        row.innerHTML = `
            <td>${trans.date}</td><td>${trans.description}</td>
            <td class="debit">${trans.debit > 0 ? '$' + trans.debit.toFixed(2) : '-'}</td>
            <td class="credit">${trans.credit > 0 ? '$' + trans.credit.toFixed(2) : '-'}</td>
            <td>$${balanceMap.get(trans.id).toFixed(2)}</td>
            <td style="text-align: center;">
                <input type="checkbox" class="reconcile-checkbox" data-id="${trans.id}" ${trans.reconciled ? 'checked' : ''}>
            </td>
            <td><button class="btn btn-danger btn-sm delete-transaction-btn" data-id="${trans.id}">Delete</button></td>
        `;
        tbody.appendChild(row);
    });
    
    const currentBalanceEl = document.getElementById('currentBalance');
    const finalBalance = runningBalance;
    currentBalanceEl.textContent = `$${finalBalance.toFixed(2)}`;
    currentBalanceEl.style.color = finalBalance >= 0 ? '#28a745' : '#dc3545';
}

export function updateBankProjectionsUI() {
    const { thisMonthRequired, nextMonthRequired, avgHours } = getBankProjections();
    document.getElementById('thisMonthRequired').textContent = thisMonthRequired.toFixed(2);
    document.getElementById('nextMonthRequired').textContent = nextMonthRequired.toFixed(2);
    document.getElementById('projectedHours').textContent = avgHours.toFixed(1);
}

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('visible'), 10);
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('visible');
        setTimeout(() => modal.style.display = 'none', 300);
    }
}

export function showInsufficientFundsModal(balance) {
    showModal('insufficientFundsModal');
    const balanceEl = document.getElementById('modalBalance');
    if (balanceEl) {
        balanceEl.textContent = `$${balance.toFixed(2)}`;
    }
}

function hideInsufficientFundsModal() {
    hideModal('insufficientFundsModal');
}

function showPurgeModal() {
    showModal('purgeTransactionsModal');
    document.getElementById('purgeCutoffDate').valueAsDate = new Date();
}

function hidePurgeModal() {
    hideModal('purgeTransactionsModal');
}


// --- INITIALIZATION ---

export function initBanking() {
    document.getElementById('transactionForm').addEventListener('submit', handleTransactionFormSubmit);
    document.getElementById('bankRegisterBody').addEventListener('click', handleRegisterClick);
    
    document.getElementById('filterForm').addEventListener('input', displayRegister);
    document.getElementById('clearFiltersBtn').addEventListener('click', handleClearFilters);

    document.getElementById('exportCsvBtn').addEventListener('click', exportTransactionsToCSV);
    document.getElementById('openPurgeModalBtn').addEventListener('click', showPurgeModal);

    document.getElementById('closePurgeModalBtn').addEventListener('click', hidePurgeModal);
    document.getElementById('cancelPurgeBtn').addEventListener('click', hidePurgeModal);
    document.getElementById('confirmPurgeBtn').addEventListener('click', handlePurgeConfirm);
    
    document.getElementById('closeModalBtn').addEventListener('click', hideInsufficientFundsModal);
    document.getElementById('insufficientFundsModal').addEventListener('click', (event) => {
        if (event.target.id === 'insufficientFundsModal') {
            hideInsufficientFundsModal();
        }
    });
}