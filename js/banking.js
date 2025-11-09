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
    const editButton = event.target.closest('.edit-transaction-btn');
    const saveButton = event.target.closest('.save-transaction-btn');
    const cancelButton = event.target.closest('.cancel-transaction-btn');

    if (deleteButton) {
        if (confirm('Are you sure you want to delete this transaction?')) {
            const transId = deleteButton.dataset.id;
            deleteTransaction(transId);
            displayRegister();
            saveData();
        }
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

function enableEditMode(transId) {
    const transaction = appData.bankRegister.find(t => t.id === transId);
    if (!transaction) return;

    const tbody = document.getElementById('bankRegisterBody');
    const sortedRegister = [...appData.bankRegister].sort((a, b) => new Date(a.date) - new Date(b.date));

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
            // Edit mode
            const dateFormatted = trans.date.includes('/') ? trans.date.split('/') : ['', '', ''];
            const dateValue = dateFormatted.length === 3 ?
                `${dateFormatted[2]}-${dateFormatted[0].padStart(2, '0')}-${dateFormatted[1].padStart(2, '0')}` : '';

            const isDebit = trans.debit > 0;
            const amount = isDebit ? trans.debit : trans.credit;

            row.innerHTML = `
                <td><input type="date" id="edit-date-${trans.id}" class="form-input" value="${dateValue}" style="padding: 5px; width: 150px;"></td>
                <td><input type="text" id="edit-desc-${trans.id}" class="form-input" value="${trans.description}" style="padding: 5px;"></td>
                <td colspan="2">
                    <select id="edit-type-${trans.id}" class="form-input" style="padding: 5px; width: 100px;">
                        <option value="debit" ${isDebit ? 'selected' : ''}>Debit</option>
                        <option value="credit" ${!isDebit ? 'selected' : ''}>Credit</option>
                    </select>
                    <input type="number" id="edit-amount-${trans.id}" class="form-input" value="${amount}" step="0.01" style="padding: 5px; width: 100px;">
                </td>
                <td>$${balanceMap.get(trans.id).toFixed(2)}</td>
                <td style="text-align: center;">
                    <input type="checkbox" class="reconcile-checkbox" data-id="${trans.id}" ${trans.reconciled ? 'checked' : ''}>
                </td>
                <td>
                    <button class="btn btn-success btn-sm save-transaction-btn" data-id="${trans.id}">Save</button>
                    <button class="btn btn-secondary btn-sm cancel-transaction-btn">Cancel</button>
                </td>
            `;
        } else {
            // Normal display mode
            row.innerHTML = `
                <td>${trans.date}</td><td>${trans.description}</td>
                <td class="debit">${trans.debit > 0 ? '$' + trans.debit.toFixed(2) : '-'}</td>
                <td class="credit">${trans.credit > 0 ? '$' + trans.credit.toFixed(2) : '-'}</td>
                <td>$${balanceMap.get(trans.id).toFixed(2)}</td>
                <td style="text-align: center;">
                    <input type="checkbox" class="reconcile-checkbox" data-id="${trans.id}" ${trans.reconciled ? 'checked' : ''}>
                </td>
                <td>
                    <button class="btn btn-primary btn-sm edit-transaction-btn" data-id="${trans.id}">Edit</button>
                    <button class="btn btn-danger btn-sm delete-transaction-btn" data-id="${trans.id}">Delete</button>
                </td>
            `;
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
        alert('Please fill in all fields with valid values.');
        return;
    }

    const dateParts = dateInput.split('-');
    const formattedDate = `${dateParts[1]}/${dateParts[2]}/${dateParts[0]}`;

    transaction.date = formattedDate;
    transaction.description = descInput;
    transaction.debit = typeInput === 'debit' ? amountInput : 0;
    transaction.credit = typeInput === 'credit' ? amountInput : 0;

    displayRegister();
    saveData();
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
            <td>
                <button class="btn btn-primary btn-sm edit-transaction-btn" data-id="${trans.id}">Edit</button>
                <button class="btn btn-danger btn-sm delete-transaction-btn" data-id="${trans.id}">Delete</button>
            </td>
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

    // Try various date formats
    let parsedDate;

    // Format: MM/DD/YYYY or M/D/YYYY
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            const month = parts[0].padStart(2, '0');
            const day = parts[1].padStart(2, '0');
            const year = parts[2];
            return `${month}/${day}/${year}`;
        }
    }

    // Format: YYYY-MM-DD
    if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const year = parts[0];
            const month = parts[1].padStart(2, '0');
            const day = parts[2].padStart(2, '0');
            return `${month}/${day}/${year}`;
        }
    }

    return null;
}

function fuzzyMatchTransaction(newTrans) {
    // Fuzzy match: ±2 days and ±$1
    const newDate = new Date(newTrans.date);
    const newAmount = newTrans.debit > 0 ? newTrans.debit : newTrans.credit;

    return appData.bankRegister.find(existing => {
        const existingDate = new Date(existing.date);
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
        alert('CSV file is empty or has no data rows.');
        return;
    }

    const headerLine = lines[0];
    const format = detectCsvFormat(headerLine);

    if (format === 0) {
        alert('Unable to detect CSV format. Please ensure the file matches one of the supported formats.');
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
    saveData();

    const message = autoReconcile
        ? `Import complete!\n\nAdded: ${addedCount} new transactions\nReconciled: ${reconciledCount} existing transactions\nSkipped: ${skippedCount} duplicates`
        : `Sync complete!\n\nAdded: ${addedCount} new transactions\nSkipped: ${skippedCount} duplicates`;

    alert(message);
}

function handleCsvImport(autoReconcile) {
    const fileInput = document.getElementById('csvFileInput');
    const file = fileInput.files[0];

    if (!file) {
        alert('Please select a CSV file to import.');
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