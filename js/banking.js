/*
  PayTrax Payroll Management
  Copyright (c) 2025 greenwh

  Developed by greenwh with substantial assistance from AI coding tools (Claude, ChatGPT, Gemini).
  This file is original work based on documentation and prompts by greenwh.
  Licensed under the MIT License.
*/
// js/banking.js

import { appData, saveData, saveDataImmediate } from './state.js';
import { generateBasePayPeriods } from './logic.js';
import { fromStorageDate, toDisplayDate } from './utils.js';
import { showToast } from './toast.js';
import { createSnapshot, pushUndo } from './undo.js';
import { logAudit } from './audit.js';

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
    const editButton = event.target.closest('.edit-transaction-btn');
    const saveButton = event.target.closest('.save-transaction-btn');
    const cancelButton = event.target.closest('.cancel-transaction-btn');

    if (deleteButton) {
        const transId = deleteButton.dataset.id;
        const transaction = appData.bankRegister.find(t => t.id === transId);
        if (!transaction) return;

        const snapshot = createSnapshot(transaction);
        const transDesc = transaction.description;

        deleteTransaction(transId);
        displayRegister();
        saveData();
        logAudit('Transaction Deleted', `${transDesc} ($${(transaction.debit || transaction.credit).toFixed(2)})`);

        pushUndo(`Deleted transaction ${transDesc}`, snapshot, (snap) => {
            appData.bankRegister.push(snap);
            displayRegister();
            saveDataImmediate();
            logAudit('Undo', `Restored transaction ${snap.description}`);
        });
    }

    if (reconcileCheckbox) {
        // Prevent default to avoid double-toggle (browser toggles, then we toggle)
        event.preventDefault();
        const transId = reconcileCheckbox.dataset.id;
        toggleTransactionReconciled(transId);
        saveData(); // Save first to ensure data is persisted
        displayRegister(); // Then redraw with correct state
    }

    if (editButton) {
        const transId = editButton.dataset.id;
        enableEditMode(transId);
    }

    if (saveButton) {
        const transId = saveButton.dataset.id;
        saveTransactionEdit(transId);
    }

    if (cancelButton) {
        displayRegister();
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
        showToast('Please select a cutoff date.', 'warning');
        return;
    }

    const { count, openingBalance } = getPurgePreview(cutoffDate);
    if (confirm(`Are you sure you want to permanently delete ${count} reconciled transaction(s) on or before ${cutoffDate}? This cannot be undone.`)) {
        const purgedCount = purgeTransactions(cutoffDate);
        hidePurgeModal();

        const message = openingBalance !== 0
            ? `${purgedCount} transaction(s) have been purged. Opening balance of $${openingBalance.toFixed(2)} created.`
            : `${purgedCount} transaction(s) have been purged.`;
        showToast(message, 'success');
        logAudit('Transactions Purged', `${purgedCount} transactions purged through ${cutoffDate}`);

        displayRegister();
        saveDataImmediate();
    }
}


// --- LOGIC FUNCTIONS ---

function filterTransactions(transactions, filters) {
    let filtered = [...transactions];

    if (filters.startDate) {
        const start = new Date(filters.startDate + 'T00:00:00');
        filtered = filtered.filter(t => fromStorageDate(t.date) >= start);
    }
    if (filters.endDate) {
        const end = new Date(filters.endDate + 'T23:59:59');
        filtered = filtered.filter(t => fromStorageDate(t.date) <= end);
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
    const date = document.getElementById('transDate').value; // Already YYYY-MM-DD from HTML date input
    const desc = document.getElementById('transDesc').value;
    const type = document.getElementById('transType').value;
    const amount = parseFloat(document.getElementById('transAmount').value);
    addTransaction(date, desc, type, amount);
}

export function addTransaction(date, description, type, amount, id = null, silent = false, reconciled = false) {
    if (amount <= 0 || !description || !date) return;
    appData.bankRegister.push({
        id: id || (crypto.randomUUID?.() || 'trans_' + Date.now() + '_' + Math.random().toString(36).slice(2)),
        date, description,
        debit: type === 'debit' ? amount : 0,
        credit: type === 'credit' ? amount : 0,
        reconciled: reconciled
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

function enableEditMode(transId) {
    const transaction = appData.bankRegister.find(t => t.id === transId);
    if (!transaction) return;

    const tbody = document.getElementById('bankRegisterBody');
    const sortedRegister = [...appData.bankRegister].sort((a, b) => fromStorageDate(a.date) - fromStorageDate(b.date));

    const filters = {
        startDate: document.getElementById('filterStartDate').value,
        endDate: document.getElementById('filterEndDate').value,
        description: document.getElementById('filterDescription').value,
        status: document.getElementById('filterStatus').value,
    };
    const transactionsToDisplay = filterTransactions(sortedRegister, filters);

    let runningBalance = 0;
    const balanceMap = new Map();
    sortedRegister.forEach(trans => {
        runningBalance += trans.credit - trans.debit;
        balanceMap.set(trans.id, runningBalance);
    });

    tbody.innerHTML = '';
    transactionsToDisplay.forEach(trans => {
        const row = document.createElement('tr');
        if (trans.reconciled) {
            row.classList.add('reconciled');
        }

        if (trans.id === transId) {
            // Edit mode - build with safe DOM methods
            const dateValue = trans.date; // Already YYYY-MM-DD storage format

            const isDebit = trans.debit > 0;
            const amount = isDebit ? trans.debit : trans.credit;

            const dateTd = document.createElement('td');
            const dateInput = document.createElement('input');
            dateInput.type = 'date';
            dateInput.id = `edit-date-${trans.id}`;
            dateInput.className = 'form-input';
            dateInput.value = dateValue;
            dateInput.style.cssText = 'padding: 5px; width: 150px;';
            dateTd.appendChild(dateInput);

            const descTd = document.createElement('td');
            const descInput = document.createElement('input');
            descInput.type = 'text';
            descInput.id = `edit-desc-${trans.id}`;
            descInput.className = 'form-input';
            descInput.value = trans.description;
            descInput.style.cssText = 'padding: 5px;';
            descTd.appendChild(descInput);

            const amountTd = document.createElement('td');
            amountTd.colSpan = 2;
            const typeSelect = document.createElement('select');
            typeSelect.id = `edit-type-${trans.id}`;
            typeSelect.className = 'form-input';
            typeSelect.style.cssText = 'padding: 5px; width: 100px;';
            const debitOpt = document.createElement('option');
            debitOpt.value = 'debit';
            debitOpt.textContent = 'Debit';
            debitOpt.selected = isDebit;
            const creditOpt = document.createElement('option');
            creditOpt.value = 'credit';
            creditOpt.textContent = 'Credit';
            creditOpt.selected = !isDebit;
            typeSelect.append(debitOpt, creditOpt);
            const amountInput = document.createElement('input');
            amountInput.type = 'number';
            amountInput.id = `edit-amount-${trans.id}`;
            amountInput.className = 'form-input';
            amountInput.value = amount;
            amountInput.step = '0.01';
            amountInput.style.cssText = 'padding: 5px; width: 100px;';
            amountTd.append(typeSelect, amountInput);

            const balanceTd = document.createElement('td');
            balanceTd.textContent = '$' + balanceMap.get(trans.id).toFixed(2);

            const reconcileTd = document.createElement('td');
            reconcileTd.style.textAlign = 'center';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'reconcile-checkbox';
            checkbox.dataset.id = trans.id;
            checkbox.checked = trans.reconciled === true;
            reconcileTd.appendChild(checkbox);

            const actionsTd = document.createElement('td');
            const saveBtn = document.createElement('button');
            saveBtn.className = 'btn btn-success btn-sm save-transaction-btn';
            saveBtn.dataset.id = trans.id;
            saveBtn.textContent = 'Save';
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'btn btn-secondary btn-sm cancel-transaction-btn';
            cancelBtn.textContent = 'Cancel';
            actionsTd.append(saveBtn, cancelBtn);

            row.append(dateTd, descTd, amountTd, balanceTd, reconcileTd, actionsTd);
        } else {
            // Normal display mode - build with safe DOM methods
            const dateTd = document.createElement('td');
            dateTd.textContent = toDisplayDate(trans.date);

            const descTd = document.createElement('td');
            descTd.textContent = trans.description;

            const debitTd = document.createElement('td');
            debitTd.className = 'debit';
            debitTd.textContent = trans.debit > 0 ? '$' + trans.debit.toFixed(2) : '-';

            const creditTd = document.createElement('td');
            creditTd.className = 'credit';
            creditTd.textContent = trans.credit > 0 ? '$' + trans.credit.toFixed(2) : '-';

            const balanceTd = document.createElement('td');
            balanceTd.textContent = '$' + balanceMap.get(trans.id).toFixed(2);

            const reconcileTd = document.createElement('td');
            reconcileTd.style.textAlign = 'center';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'reconcile-checkbox';
            checkbox.dataset.id = trans.id;
            checkbox.checked = trans.reconciled === true;
            reconcileTd.appendChild(checkbox);

            const actionsTd = document.createElement('td');
            const editBtn = document.createElement('button');
            editBtn.className = 'btn btn-primary btn-sm edit-transaction-btn';
            editBtn.dataset.id = trans.id;
            editBtn.textContent = 'Edit';
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-danger btn-sm delete-transaction-btn';
            deleteBtn.dataset.id = trans.id;
            deleteBtn.textContent = 'Delete';
            actionsTd.append(editBtn, deleteBtn);

            row.append(dateTd, descTd, debitTd, creditTd, balanceTd, reconcileTd, actionsTd);
        }
        tbody.appendChild(row);
    });

    const currentBalanceEl = document.getElementById('currentBalance');
    currentBalanceEl.textContent = `$${runningBalance.toFixed(2)}`;
    currentBalanceEl.style.color = runningBalance >= 0 ? '#28a745' : '#dc3545';
}

function saveTransactionEdit(transId) {
    const transaction = appData.bankRegister.find(t => t.id === transId);
    if (!transaction) return;

    const dateInput = document.getElementById(`edit-date-${transId}`).value;
    const descInput = document.getElementById(`edit-desc-${transId}`).value;
    const typeInput = document.getElementById(`edit-type-${transId}`).value;
    const amountInput = parseFloat(document.getElementById(`edit-amount-${transId}`).value);

    if (!dateInput || !descInput || !amountInput || amountInput <= 0) {
        showToast('Please fill in all fields with valid values.', 'warning');
        return;
    }

    transaction.date = dateInput; // HTML date input is already YYYY-MM-DD
    transaction.description = descInput;
    transaction.debit = typeInput === 'debit' ? amountInput : 0;
    transaction.credit = typeInput === 'credit' ? amountInput : 0;

    displayRegister();
    saveData();
}

/**
 * Computes what a purge at the given cutoff would remove: the count of
 * reconciled transactions on or before the cutoff, and the net opening
 * balance of exactly those transactions. The opening balance must equal the
 * net of the transactions actually removed so the register total is
 * identical before and after the purge (audit F3).
 * @param {string} cutoffDateStr - Cutoff date (YYYY-MM-DD)
 * @returns {{count: number, openingBalance: number}}
 */
export function getPurgePreview(cutoffDateStr) {
    const cutoffDate = new Date(cutoffDateStr + 'T23:59:59');
    const txs = appData.bankRegister.filter(t =>
        t.reconciled && fromStorageDate(t.date) <= cutoffDate);
    const openingBalance = txs.reduce((sum, t) => sum + t.credit - t.debit, 0);
    return { count: txs.length, openingBalance };
}

export function purgeTransactions(cutoffDateStr) {
    const originalCount = appData.bankRegister.length;
    const cutoffDate = new Date(cutoffDateStr + 'T23:59:59');

    // Sum only the transactions actually being removed — unreconciled
    // pre-cutoff transactions stay in the register and must not be baked
    // into the opening balance (audit F3)
    const { count, openingBalance } = getPurgePreview(cutoffDateStr);

    if (count === 0) {
        return 0;
    }

    // Calculate date for opening balance (one day after purge date)
    const openingBalanceDate = new Date(cutoffDate);
    openingBalanceDate.setDate(openingBalanceDate.getDate() + 1);
    const year = openingBalanceDate.getFullYear();
    const month = String(openingBalanceDate.getMonth() + 1).padStart(2, '0');
    const day = String(openingBalanceDate.getDate()).padStart(2, '0');
    const openingBalanceDateStr = `${year}-${month}-${day}`;

    // Remove only reconciled transactions on or before cutoff date
    appData.bankRegister = appData.bankRegister.filter(t => {
        const transDate = fromStorageDate(t.date);
        // Keep transaction if: it's after cutoff OR it's not reconciled
        return transDate > cutoffDate || t.reconciled === false;
    });

    // Add opening balance transaction (only if non-zero)
    if (openingBalance !== 0) {
        const openingBalanceTx = {
            id: crypto.randomUUID?.() || 'trans_opening_' + Date.now() + '_' + Math.random().toString(36).slice(2),
            date: openingBalanceDateStr,
            description: 'Opening Balance',
            debit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
            credit: openingBalance > 0 ? openingBalance : 0,
            reconciled: true
        };
        appData.bankRegister.push(openingBalanceTx);
    }

    return originalCount - appData.bankRegister.length + (openingBalance !== 0 ? 1 : 0);
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
        const payDate = fromStorageDate(period.payDate);
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
        showToast('No transactions to export with the current filters.', 'warning');
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

    const sortedRegister = [...appData.bankRegister].sort((a, b) => fromStorageDate(a.date) - fromStorageDate(b.date));
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

        // Build cells using safe DOM methods to prevent XSS from imported descriptions
        const dateTd = document.createElement('td');
        dateTd.textContent = toDisplayDate(trans.date);

        const descTd = document.createElement('td');
        descTd.textContent = trans.description;

        const debitTd = document.createElement('td');
        debitTd.className = 'debit';
        debitTd.textContent = trans.debit > 0 ? '$' + trans.debit.toFixed(2) : '-';

        const creditTd = document.createElement('td');
        creditTd.className = 'credit';
        creditTd.textContent = trans.credit > 0 ? '$' + trans.credit.toFixed(2) : '-';

        const balanceTd = document.createElement('td');
        balanceTd.textContent = '$' + balanceMap.get(trans.id).toFixed(2);

        const reconcileTd = document.createElement('td');
        reconcileTd.style.textAlign = 'center';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'reconcile-checkbox';
        checkbox.dataset.id = trans.id;
        checkbox.checked = trans.reconciled === true;
        reconcileTd.appendChild(checkbox);

        const actionsTd = document.createElement('td');
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-primary btn-sm edit-transaction-btn';
        editBtn.dataset.id = trans.id;
        editBtn.textContent = 'Edit';
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger btn-sm delete-transaction-btn';
        deleteBtn.dataset.id = trans.id;
        deleteBtn.textContent = 'Delete';
        actionsTd.appendChild(editBtn);
        actionsTd.appendChild(deleteBtn);

        row.append(dateTd, descTd, debitTd, creditTd, balanceTd, reconcileTd, actionsTd);
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


// --- CSV IMPORT FUNCTIONS ---

function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

function detectCsvFormat(headerLine) {
    const header = headerLine.toLowerCase();

    // Format 1: Account,Date,Pending?,Description,Category,Check,Credit,Debit
    if (header.includes('account') && header.includes('pending') && header.includes('check')) {
        return 1;
    }
    // Format 2: Date,Description,Original Description,Category,Amount,Status
    if (header.includes('original description') && header.includes('amount') && header.includes('status')) {
        return 2;
    }
    // Format 3: Account Number,Post Date,Check,Description,Debit,Credit
    if (header.includes('account number') && header.includes('post date')) {
        return 3;
    }

    return 0; // Unknown format
}

function parseTransactionFromCsv(row, format) {
    let date, description, debit, credit;

    if (format === 1) {
        // Format 1: Account,Date,Pending?,Description,Category,Check,Credit,Debit
        date = row[1];
        description = row[3];
        credit = Math.abs(parseFloat(row[6]) || 0);
        debit = Math.abs(parseFloat(row[7]) || 0);
    } else if (format === 2) {
        // Format 2: Date,Description,Original Description,Category,Amount,Status
        date = row[0];
        description = row[1];
        const amount = parseFloat(row[4]) || 0;
        if (amount < 0) {
            debit = Math.abs(amount);
            credit = 0;
        } else {
            credit = amount;
            debit = 0;
        }
    } else if (format === 3) {
        // Format 3: Account Number,Post Date,Check,Description,Debit,Credit
        date = row[1];
        description = row[3];
        debit = Math.abs(parseFloat(row[4]) || 0);
        credit = Math.abs(parseFloat(row[5]) || 0);
    } else {
        return null;
    }

    // Normalize date to MM/DD/YYYY format
    const normalizedDate = normalizeDate(date);
    if (!normalizedDate) return null;

    return { date: normalizedDate, description, debit, credit };
}

function normalizeDate(dateStr) {
    if (!dateStr) return null;

    // Format: MM/DD/YYYY or M/D/YYYY → convert to YYYY-MM-DD
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            const month = parts[0].padStart(2, '0');
            const day = parts[1].padStart(2, '0');
            const year = parts[2];
            return `${year}-${month}-${day}`;
        }
    }

    // Format: YYYY-MM-DD → already correct
    if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const year = parts[0];
            const month = parts[1].padStart(2, '0');
            const day = parts[2].padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
    }

    return null;
}

function fuzzyMatchTransaction(newTrans) {
    // Fuzzy match: ±2 days and ±$1
    const newDate = fromStorageDate(newTrans.date);
    const newAmount = newTrans.debit > 0 ? newTrans.debit : newTrans.credit;

    return appData.bankRegister.find(existing => {
        const existingDate = fromStorageDate(existing.date);
        const existingAmount = existing.debit > 0 ? existing.debit : existing.credit;

        // Check date difference (±2 days = 2 * 24 * 60 * 60 * 1000 milliseconds)
        const dateDiff = Math.abs(newDate - existingDate);
        const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;

        // Check amount difference (±$1)
        const amountDiff = Math.abs(newAmount - existingAmount);

        return dateDiff <= twoDaysInMs && amountDiff <= 1;
    });
}

function importCsvTransactions(csvContent, autoReconcile) {
    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
        showToast('CSV file is empty or has no data rows.', 'error');
        return;
    }

    const headerLine = lines[0];
    const format = detectCsvFormat(headerLine);

    if (format === 0) {
        showToast('Unable to detect CSV format. Please ensure the file matches one of the supported formats.', 'error');
        return;
    }

    let addedCount = 0;
    let reconciledCount = 0;
    let skippedCount = 0;

    for (let i = 1; i < lines.length; i++) {
        const row = parseCsvLine(lines[i]);
        const transaction = parseTransactionFromCsv(row, format);

        if (!transaction || (transaction.debit === 0 && transaction.credit === 0)) {
            continue; // Skip invalid or zero-amount transactions
        }

        const existingMatch = fuzzyMatchTransaction(transaction);

        if (existingMatch) {
            if (autoReconcile && !existingMatch.reconciled) {
                existingMatch.reconciled = true;
                reconciledCount++;
            } else {
                skippedCount++;
            }
        } else {
            const type = transaction.debit > 0 ? 'debit' : 'credit';
            const amount = transaction.debit > 0 ? transaction.debit : transaction.credit;
            addTransaction(transaction.date, transaction.description, type, amount, null, true);
            addedCount++;
        }
    }

    displayRegister();
    saveDataImmediate();

    const message = autoReconcile
        ? `Import complete!\n\nAdded: ${addedCount} new transactions\nReconciled: ${reconciledCount} existing transactions\nSkipped: ${skippedCount} duplicates`
        : `Sync complete!\n\nAdded: ${addedCount} new transactions\nSkipped: ${skippedCount} duplicates`;

    showToast(message, 'success');
}

function handleCsvImport(autoReconcile) {
    const fileInput = document.getElementById('csvFileInput');
    const file = fileInput.files[0];

    if (!file) {
        showToast('Please select a CSV file to import.', 'warning');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const csvContent = e.target.result;
        importCsvTransactions(csvContent, autoReconcile);
        fileInput.value = ''; // Clear the file input
    };
    reader.readAsText(file);
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

    // CSV import handlers
    document.getElementById('importCsvSyncBtn').addEventListener('click', () => handleCsvImport(false));
    document.getElementById('importCsvReconcileBtn').addEventListener('click', () => handleCsvImport(true));
}