/*
  PayTrax Payroll Management
  Copyright (c) 2025 greenwh

  Developed by greenwh with substantial assistance from AI coding tools (Claude, ChatGPT, Gemini).
  This file is original work based on documentation and prompts by greenwh.
  Licensed under the MIT License.
*/
import { appData, SS_WAGE_BASE, FUTA_WAGE_BASE } from './state.js';
import { formatDate, parseDateInput } from './utils.js';
import { addTransaction } from './banking.js'; // Import from new banking module

// --- PAYROLL & PAY PERIODS ---

/**
 * Generates the base structure for pay periods for a given year and frequency.
 * @returns {Array} An array of pay period objects.
 */
export function generateBasePayPeriods() {
    const { taxYear, payFrequency, firstPayPeriodStartDate, daysUntilPayday } = appData.settings;
    const periods = [];
    
    if (!firstPayPeriodStartDate) return [];
    
    let currentDate = new Date(firstPayPeriodStartDate + 'T00:00:00');
    let periodCount = 0;
    const maxPeriods = (payFrequency === 'weekly' || payFrequency === 'bi-weekly') ? 53 : (payFrequency === 'semi-monthly' ? 24 : 12);

    while (currentDate.getFullYear() <= taxYear && periodCount < maxPeriods) {
        periodCount++;
        const startDate = new Date(currentDate);
        let endDate;

        switch (payFrequency) {
            case 'weekly':
                endDate = new Date(startDate);
                endDate.setDate(startDate.getDate() + 6);
                currentDate.setDate(currentDate.getDate() + 7);
                break;
            case 'bi-weekly':
                endDate = new Date(startDate);
                endDate.setDate(startDate.getDate() + 13);
                currentDate.setDate(currentDate.getDate() + 14);
                break;
            case 'semi-monthly':
                if (startDate.getDate() === 1) {
                    endDate = new Date(startDate.getFullYear(), startDate.getMonth(), 15);
                    currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), 16);
                } else {
                    endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
                    currentDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);
                }
                break;
            case 'monthly':
                endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
                currentDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);
                break;
        }
        
        if (endDate.getFullYear() > taxYear) break;

        const payDate = new Date(endDate);
        payDate.setDate(payDate.getDate() + (daysUntilPayday || 0));

        periods.push({ period: periodCount, startDate: formatDate(startDate), endDate: formatDate(endDate), payDate: formatDate(payDate) });
    }

    return periods.map(p => ({
        ...p,
        hours: { regular: 0, overtime: 0, pto: 0, holiday: 0 },
        earnings: { regular: 0, overtime: 0, pto: 0, holiday: 0 },
        grossPay: 0, netPay: 0, ptoAccrued: 0,
        taxes: {
            federal: 0, fica: 0, medicare: 0, state: 0, local: 0, suta: 0, futa: 0, total: 0,
            unrounded: { federal: 0, fica: 0, medicare: 0, state: 0, local: 0, suta: 0, futa: 0 }
        },
        deductions: [],
        totalDeductions: 0
    }));
}

/**
 * Generates pay periods for all employees, preserving existing data where possible.
 * After generating, recalculates all periods in sequence to ensure tax remainders are correct.
 */
export function generatePayPeriods() {
    const basePeriods = generateBasePayPeriods();
    appData.employees.forEach(emp => {
        const existingData = appData.payPeriods[emp.id] || [];
        appData.payPeriods[emp.id] = basePeriods.map((newPeriod) => {
            // Primary match: exact date match (for when settings haven't changed since last save)
            let oldPeriod = existingData.find(p =>
                p.period === newPeriod.period &&
                p.startDate === newPeriod.startDate
            );

            // Secondary match: period number AND pay date year matches tax year
            // This handles year-boundary pay periods (e.g., work week starts Dec 29, 2025
            // but pay date is Jan 7, 2026 - this belongs to tax year 2026)
            if (!oldPeriod) {
                oldPeriod = existingData.find(p => {
                    if (p.period !== newPeriod.period) return false;
                    // Parse pay date year - stored in M/D/YYYY format
                    const payDateParts = p.payDate.split('/');
                    const payDateYear = parseInt(payDateParts[2], 10);
                    return payDateYear === appData.settings.taxYear;
                });
            }

            const totalHours = oldPeriod && oldPeriod.hours ? Object.values(oldPeriod.hours).reduce((a, b) => a + b, 0) : 0;
            if (oldPeriod && totalHours > 0) {
                return { ...oldPeriod, startDate: newPeriod.startDate, endDate: newPeriod.endDate, payDate: newPeriod.payDate };
            }
            return { ...newPeriod };
        });

        // After preserving old data, recalculate all periods in sequence to fix remainders
        recalculateAllPeriodsForEmployee(emp.id);
    });
}

/**
 * Recalculates all pay periods for an employee in strict chronological sequence
 * to ensure tax remainders accumulate correctly.
 * This is critical for the running remainder strategy to work properly.
 * @param {string} employeeId - The ID of the employee
 */
export function recalculateAllPeriodsForEmployee(employeeId) {
    const employeeIndex = appData.employees.findIndex(e => e.id === employeeId);
    if (employeeIndex === -1) return;

    const employee = appData.employees[employeeIndex];
    const periods = appData.payPeriods[employeeId] || [];

    // Reset tax remainders to start fresh
    employee.taxRemainders = {
        federal: 0, fica: 0, medicare: 0, state: 0, local: 0, suta: 0, futa: 0
    };

    // Sort periods by period number to ensure sequential processing
    const sortedPeriods = periods.slice().sort((a, b) => a.period - b.period);

    // Recalculate each period in sequence
    sortedPeriods.forEach(period => {
        const totalHours = period.hours ? Object.values(period.hours).reduce((a, b) => a + b, 0) : 0;

        // Only recalculate periods that have hours entered
        if (totalHours > 0) {
            recalculatePeriod(employeeId, period.period);
        }
    });
}

/**
 * Recalculates a single pay period using the hours already stored in that period.
 * This function does NOT read from UI - it uses stored period data.
 * Used by recalculateAllPeriodsForEmployee to process periods sequentially.
 * @param {string} employeeId - The ID of the employee
 * @param {number} periodNum - The period number to recalculate
 */
function recalculatePeriod(employeeId, periodNum) {
    const employeeIndex = appData.employees.findIndex(e => e.id === employeeId);
    if (employeeIndex === -1) return;

    const employee = appData.employees[employeeIndex];
    const period = appData.payPeriods[employeeId].find(p => p.period == periodNum);
    if (!period || !period.hours) return;

    // Ensure taxRemainders object exists
    if (!employee.taxRemainders) {
        employee.taxRemainders = { federal: 0, fica: 0, medicare: 0, state: 0, local: 0, suta: 0, futa: 0 };
    }

    const hours = period.hours; // Use existing hours from the period
    const payDate = period.payDate; // Get pay date for deduction filtering

    const earnings = {
        regular: hours.regular * employee.rate,
        overtime: hours.overtime * employee.rate * employee.overtimeMultiplier,
        holiday: hours.holiday * employee.rate * employee.holidayMultiplier,
        pto: hours.pto * employee.rate
    };

    const grossPay = Object.values(earnings).reduce((sum, val) => sum + val, 0);
    const { socialSecurity, medicare, sutaRate, futaRate } = appData.settings;

    // Running Remainder Calculation Logic
    const unrounded = {};
    const rounded = {};
    const newRemainders = {};

    const calculateTaxWithRemainder = (taxName, calculation) => {
        const previousRemainder = employee.taxRemainders[taxName] || 0;
        unrounded[taxName] = calculation;
        const totalToConsider = unrounded[taxName] + previousRemainder;
        // Round half up for currency (not banker's rounding)
        rounded[taxName] = Math.round(totalToConsider * 100) / 100;
        newRemainders[taxName] = totalToConsider - rounded[taxName];
    };

    calculateTaxWithRemainder('federal', grossPay * (employee.fedTaxRate / 100));
    calculateTaxWithRemainder('state', grossPay * (employee.stateTaxRate / 100));
    calculateTaxWithRemainder('local', grossPay * (employee.localTaxRate / 100));
    calculateTaxWithRemainder('fica', grossPay * (socialSecurity / 100));
    calculateTaxWithRemainder('medicare', grossPay * (medicare / 100));
    calculateTaxWithRemainder('suta', grossPay * (sutaRate / 100));
    calculateTaxWithRemainder('futa', grossPay * (futaRate / 100));

    // Update the employee's stored remainders for the next pay run
    appData.employees[employeeIndex].taxRemainders = newRemainders;

    const employeeTaxes = rounded.federal + rounded.state + rounded.local + rounded.fica + rounded.medicare;

    // Calculate deductions (only apply those created on or before this pay date)
    const { deductions, total: totalDeductions } = calculateDeductions(employee, grossPay, payDate);

    const netPay = grossPay - employeeTaxes - totalDeductions;

    // PTO Calculation (preserve existing PTO logic)
    const originalPtoUsed = period.hours.pto || 0;
    const originalPtoAccrued = period.ptoAccrued || 0;
    let ptoAccruedThisPeriod = 0;
    let currentPtoBalance = (employee.ptoBalance + originalPtoUsed) - originalPtoAccrued;
    const totalOriginalHours = Object.values(period.hours).reduce((a, b) => a + b, 0);

    if (totalOriginalHours === 0 && (hours.regular > 0 || hours.overtime > 0)) {
        const periodsInYear = (appData.payPeriods[employeeId] || []).length;
        if (periodsInYear > 0) ptoAccruedThisPeriod = employee.ptoAccrualRate / periodsInYear;
    } else {
        ptoAccruedThisPeriod = originalPtoAccrued;
    }
    appData.employees[employeeIndex].ptoBalance = parseFloat(((currentPtoBalance + ptoAccruedThisPeriod) - hours.pto).toFixed(2));

    // Update Period Data
    period.earnings = earnings;
    period.grossPay = grossPay;
    period.netPay = netPay;
    period.ptoAccrued = ptoAccruedThisPeriod;
    period.taxes = { ...rounded, total: employeeTaxes, unrounded };
    period.deductions = deductions;
    period.totalDeductions = totalDeductions;

    // Update Bank Register
    const totalPayrollCost = grossPay + rounded.suta + rounded.futa + rounded.fica + rounded.medicare;
    const transactionId = `payroll-${employee.id}-${period.period}-${appData.settings.taxYear}`;
    // Preserve reconciled status before removing
    const existingTransaction = appData.bankRegister.find(t => t.id === transactionId);
    const wasReconciled = existingTransaction ? existingTransaction.reconciled : false;
    appData.bankRegister = appData.bankRegister.filter(t => t.id !== transactionId);
    if (totalPayrollCost > 0) {
        addTransaction(period.payDate, `Payroll: ${employee.name} - P${period.period}`, 'debit', totalPayrollCost, transactionId, true, wasReconciled);
    }
}

/**
 * Updates the hour input fields based on the selected period's saved data.
 * @param {string} employeeId - The ID of the current employee.
 * @param {string} periodNum - The current pay period number.
 * @returns {boolean} - True if the hours were populated and a recalc is needed.
 */
export function updateHoursFromPeriod(employeeId, periodNum) {
    if (!employeeId || !periodNum) {
        document.getElementById('regularHours').value = '';
        document.getElementById('overtimeHours').value = '';
        document.getElementById('ptoHours').value = '';
        document.getElementById('holidayHours').value = '';
        return false;
    }
    const period = appData.payPeriods[employeeId]?.find(p => p.period == periodNum);
    if (!period) return false;

    document.getElementById('regularHours').value = period.hours.regular > 0 ? period.hours.regular : '';
    document.getElementById('overtimeHours').value = period.hours.overtime > 0 ? period.hours.overtime : '';
    document.getElementById('ptoHours').value = period.hours.pto > 0 ? period.hours.pto : '';
    document.getElementById('holidayHours').value = period.hours.holiday > 0 ? period.hours.holiday : '';

    return true; // Indicate that a recalculation should happen
}

/**
 * Calculates pay based on the hours in the UI and updates the appData object.
 * This function now uses a "running remainder" strategy for tax calculations.
 * If editing an earlier period, it will trigger sequential recalculation of all subsequent periods.
 */
export function calculatePay() {
    const employeeId = document.getElementById('currentEmployee').value;
    const periodNum = parseInt(document.getElementById('currentPeriod').value);

    if (!employeeId || !periodNum) return;

    const employeeIndex = appData.employees.findIndex(e => e.id === employeeId);
    if (employeeIndex === -1) return;

    const employee = appData.employees[employeeIndex];
    const period = appData.payPeriods[employeeId].find(p => p.period == periodNum);
    if (!period) return;

    // Detect if we're editing an earlier period with subsequent periods already calculated
    const allPeriods = appData.payPeriods[employeeId] || [];
    const hasLaterPeriodsWithData = allPeriods.some(p => {
        const laterPeriod = p.period > periodNum;
        const hasHours = p.hours && Object.values(p.hours).reduce((a, b) => a + b, 0) > 0;
        return laterPeriod && hasHours;
    });

    // Store the hours from UI into the period first
    period.hours = {
        regular: parseFloat(document.getElementById('regularHours').value) || 0,
        overtime: parseFloat(document.getElementById('overtimeHours').value) || 0,
        pto: parseFloat(document.getElementById('ptoHours').value) || 0,
        holiday: parseFloat(document.getElementById('holidayHours').value) || 0,
    };

    // If editing an earlier period, recalculate everything from Period 1 forward
    if (hasLaterPeriodsWithData) {
        recalculateAllPeriodsForEmployee(employeeId);
    } else {
        // Otherwise, just calculate this single period normally
        recalculateSinglePeriodFromUI(employeeId, periodNum);
    }
}

/**
 * Calculates a single pay period using data from the UI inputs.
 * This is the original calculation logic, now extracted into its own function.
 * Only use this when you're certain no sequential recalculation is needed.
 * @param {string} employeeId - The ID of the employee
 * @param {number} periodNum - The period number to calculate
 */
function recalculateSinglePeriodFromUI(employeeId, periodNum) {
    const employeeIndex = appData.employees.findIndex(e => e.id === employeeId);
    if (employeeIndex === -1) return;

    const employee = appData.employees[employeeIndex];
    const period = appData.payPeriods[employeeId].find(p => p.period == periodNum);
    if (!period) return;

    // Ensure taxRemainders object exists for backward compatibility
    if (!employee.taxRemainders) {
        employee.taxRemainders = { federal: 0, fica: 0, medicare: 0, state: 0, local: 0, suta: 0, futa: 0 };
    }

    const payDate = period.payDate; // Get pay date for deduction filtering

    const hours = {
        regular: parseFloat(document.getElementById('regularHours').value) || 0,
        overtime: parseFloat(document.getElementById('overtimeHours').value) || 0,
        pto: parseFloat(document.getElementById('ptoHours').value) || 0,
        holiday: parseFloat(document.getElementById('holidayHours').value) || 0,
    };

    const earnings = {
        regular: hours.regular * employee.rate,
        overtime: hours.overtime * employee.rate * employee.overtimeMultiplier,
        holiday: hours.holiday * employee.rate * employee.holidayMultiplier,
        pto: hours.pto * employee.rate
    };

    const grossPay = Object.values(earnings).reduce((sum, val) => sum + val, 0);
    const { socialSecurity, medicare, sutaRate, futaRate } = appData.settings;

    // --- NEW: Running Remainder Calculation Logic ---
    const unrounded = {};
    const rounded = {};
    const newRemainders = {};

    // Helper function to process each tax by carrying forward the remainder from the previous payroll
    // Uses proper currency rounding (round half up) instead of JavaScript's banker's rounding
    const calculateTaxWithRemainder = (taxName, calculation) => {
        const previousRemainder = employee.taxRemainders[taxName] || 0;
        unrounded[taxName] = calculation;
        const totalToConsider = unrounded[taxName] + previousRemainder;
        // Round half up for currency (not banker's rounding)
        rounded[taxName] = Math.round(totalToConsider * 100) / 100;
        newRemainders[taxName] = totalToConsider - rounded[taxName];
    };

    calculateTaxWithRemainder('federal', grossPay * (employee.fedTaxRate / 100));
    calculateTaxWithRemainder('state', grossPay * (employee.stateTaxRate / 100));
    calculateTaxWithRemainder('local', grossPay * (employee.localTaxRate / 100));
    calculateTaxWithRemainder('fica', grossPay * (socialSecurity / 100));
    calculateTaxWithRemainder('medicare', grossPay * (medicare / 100));
    calculateTaxWithRemainder('suta', grossPay * (sutaRate / 100));
    calculateTaxWithRemainder('futa', grossPay * (futaRate / 100));

    // Update the employee's stored remainders for the next pay run
    appData.employees[employeeIndex].taxRemainders = newRemainders;

    const employeeTaxes = rounded.federal + rounded.state + rounded.local + rounded.fica + rounded.medicare;

    // Calculate deductions (only apply those created on or before this pay date)
    const { deductions, total: totalDeductions } = calculateDeductions(employee, grossPay, payDate);

    const netPay = grossPay - employeeTaxes - totalDeductions;

    // --- PTO Calculation (remains the same) ---
    const originalPtoUsed = period.hours.pto || 0;
    const originalPtoAccrued = period.ptoAccrued || 0;
    let ptoAccruedThisPeriod = 0;
    let currentPtoBalance = (employee.ptoBalance + originalPtoUsed) - originalPtoAccrued;
    const totalOriginalHours = period.hours ? Object.values(period.hours).reduce((a, b) => a + b, 0) : 0;
    if (totalOriginalHours === 0 && (hours.regular > 0 || hours.overtime > 0)) {
         const periodsInYear = (appData.payPeriods[employeeId] || []).length;
         if (periodsInYear > 0) ptoAccruedThisPeriod = employee.ptoAccrualRate / periodsInYear;
    } else {
        ptoAccruedThisPeriod = originalPtoAccrued;
    }
	appData.employees[employeeIndex].ptoBalance = parseFloat(((currentPtoBalance + ptoAccruedThisPeriod) - hours.pto).toFixed(2));

    // --- Update Period Data in State ---
    period.hours = hours;
    period.earnings = earnings;
    period.grossPay = grossPay;
    period.netPay = netPay;
    period.ptoAccrued = ptoAccruedThisPeriod;
    period.taxes = { ...rounded, total: employeeTaxes, unrounded };
    period.deductions = deductions;
    period.totalDeductions = totalDeductions;

    // --- Update Bank Register ---
    const totalPayrollCost = grossPay + rounded.suta + rounded.futa + rounded.fica + rounded.medicare;
    const transactionId = `payroll-${employee.id}-${period.period}-${appData.settings.taxYear}`;
    // Preserve reconciled status before removing
    const existingTransaction = appData.bankRegister.find(t => t.id === transactionId);
    const wasReconciled = existingTransaction ? existingTransaction.reconciled : false;
    appData.bankRegister = appData.bankRegister.filter(t => t.id !== transactionId);
    if (totalPayrollCost > 0) {
         addTransaction(period.payDate, `Payroll: ${employee.name} - P${period.period}`, 'debit', totalPayrollCost, transactionId, true, wasReconciled);
    }
}

/**
 * Gathers all necessary data for rendering a pay stub.
 * @param {string} employeeId - The ID of the employee.
 * @param {string} periodNum - The pay period number.
 * @returns {object} - An object containing the employee, period, and YTD data.
 */
export function getPayStubData(employeeId, periodNum) {
    const employee = appData.employees.find(e => e.id === employeeId);
    if (!employee) return {};
    
    const employeePayPeriods = appData.payPeriods[employeeId];
    const period = employeePayPeriods.find(p => p.period == periodNum);
    if (!period) return {};
    
    let ytd = { gross: 0, federal: 0, fica: 0, medicare: 0, state: 0, local: 0, earnings: {} };
    for (let i = 0; i < period.period; i++) {
        const p = employeePayPeriods[i];
        if(p && p.grossPay > 0) {
            ytd.gross += p.grossPay;
            ytd.federal += p.taxes.federal; ytd.fica += p.taxes.fica; ytd.medicare += p.taxes.medicare;
            ytd.state += p.taxes.state; ytd.local += p.taxes.local;
            Object.keys(p.earnings).forEach(key => { ytd.earnings[key] = (ytd.earnings[key] || 0) + p.earnings[key]; });
        }
    }
    return { employee, period, ytd };
}

// --- EMPLOYEE MANAGEMENT ---

/**
 * Reads data from the employee form and saves it to the appData state.
 * Now includes logic to handle the taxRemainders object.
 */
export function saveEmployeeFromForm() {
    const employeeId = document.getElementById('employeeId').value;
    const employeeData = {
        id: employeeId || `emp_${new Date().getTime()}`,
        idNumber: document.getElementById('idNumber').value,
        name: document.getElementById('employeeName').value,
        address: document.getElementById('employeeAddress').value,
        rate: parseFloat(document.getElementById('hourlyRate').value) || 0,
        overtimeMultiplier: parseFloat(document.getElementById('overtimeRate').value) || 1.5,
        holidayMultiplier: parseFloat(document.getElementById('holidayRate').value) || 2.0,
        fedTaxRate: parseFloat(document.getElementById('federalTax').value) || 0,
        stateTaxRate: parseFloat(document.getElementById('stateTax').value) || 0,
        localTaxRate: parseFloat(document.getElementById('localTax').value) || 0,
        ptoAccrualRate: parseFloat(document.getElementById('ptoAccrualRate').value) || 0,
        ptoBalance: parseFloat(document.getElementById('ptoBalance').value) || 0,
    };

    if (employeeId) {
        const index = appData.employees.findIndex(e => e.id === employeeId);
        if (index > -1) {
            // When editing, preserve the existing remainders and deductions to not lose data
            const existingRemainders = appData.employees[index].taxRemainders || { federal: 0, fica: 0, medicare: 0, state: 0, local: 0, suta: 0, futa: 0 };
            const existingDeductions = appData.employees[index].deductions || [];
            appData.employees[index] = { ...employeeData, taxRemainders: existingRemainders, deductions: existingDeductions };
        }
    } else {
        // For a new employee, create a fresh taxRemainders object and empty deductions array
        const newEmployee = {
            ...employeeData,
            taxRemainders: { federal: 0, fica: 0, medicare: 0, state: 0, local: 0, suta: 0, futa: 0 },
            deductions: []
        };
        appData.employees.push(newEmployee);
        appData.payPeriods[newEmployee.id] = generateBasePayPeriods();
    }
}

/**
 * Deletes an employee from the appData state.
 */
export function deleteEmployee() {
    const employeeId = document.getElementById('employeeId').value;
    if (!employeeId) return;
    appData.employees = appData.employees.filter(e => e.id !== employeeId);
    delete appData.payPeriods[employeeId];
}

// --- DEDUCTION MANAGEMENT ---

/**
 * Adds a deduction to an employee.
 * @param {string} employeeId - The ID of the employee
 * @param {string} name - Name of the deduction (e.g., "401k", "Health Insurance")
 * @param {number} amount - Amount of the deduction (per pay period)
 * @param {string} type - Type: "fixed" for fixed amount or "percent" for percentage of gross
 */
export function addDeduction(employeeId, name, amount, type = 'fixed') {
    const employee = appData.employees.find(e => e.id === employeeId);
    if (!employee) return false;

    if (!employee.deductions) {
        employee.deductions = [];
    }

    const deduction = {
        id: `ded_${new Date().getTime()}`,
        name: name,
        amount: parseFloat(amount),
        type: type,
        createdDate: new Date().toISOString().split('T')[0] // YYYY-MM-DD format
    };

    employee.deductions.push(deduction);
    return true;
}

/**
 * Updates a deduction for an employee.
 * @param {string} employeeId - The ID of the employee
 * @param {string} deductionId - The ID of the deduction to update
 * @param {string} name - New name of the deduction
 * @param {number} amount - New amount of the deduction
 * @param {string} type - New type: "fixed" or "percent"
 */
export function updateDeduction(employeeId, deductionId, name, amount, type) {
    const employee = appData.employees.find(e => e.id === employeeId);
    if (!employee || !employee.deductions) return false;

    const deduction = employee.deductions.find(d => d.id === deductionId);
    if (!deduction) return false;

    deduction.name = name;
    deduction.amount = parseFloat(amount);
    deduction.type = type;
    return true;
}

/**
 * Deletes a deduction from an employee.
 * @param {string} employeeId - The ID of the employee
 * @param {string} deductionId - The ID of the deduction to delete
 */
export function deleteDeduction(employeeId, deductionId) {
    const employee = appData.employees.find(e => e.id === employeeId);
    if (!employee || !employee.deductions) return false;

    employee.deductions = employee.deductions.filter(d => d.id !== deductionId);
    return true;
}

/**
 * Calculates total deductions for an employee in a pay period.
 * Only applies deductions that were created on or before the pay period date.
 * @param {object} employee - The employee object
 * @param {number} grossPay - The gross pay for the period
 * @param {string} payDate - The pay date for the period (YYYY-MM-DD format)
 * @returns {object} - Object with deductions array and total
 */
export function calculateDeductions(employee, grossPay, payDate = null) {
    if (!employee.deductions || employee.deductions.length === 0) {
        return { deductions: [], total: 0 };
    }

    // Filter deductions to only those created on or before the pay period date
    let applicableDeductions = employee.deductions;
    if (payDate) {
        applicableDeductions = employee.deductions.filter(ded => {
            // If deduction doesn't have createdDate (old data), apply it to all periods
            if (!ded.createdDate) return true;
            // Convert both dates to Date objects for proper comparison
            // payDate is in M/D/YYYY format, createdDate is in YYYY-MM-DD format
            const payDateObj = new Date(payDate);
            const createdDateObj = new Date(ded.createdDate);
            // Only apply if deduction was created on or before the pay date
            return createdDateObj <= payDateObj;
        });
    }

    const calculatedDeductions = applicableDeductions.map(ded => {
        let amount = 0;
        if (ded.type === 'percent') {
            amount = (grossPay * ded.amount) / 100;
        } else {
            amount = ded.amount;
        }
        return {
            ...ded,
            calculatedAmount: amount
        };
    });

    const total = calculatedDeductions.reduce((sum, ded) => sum + ded.calculatedAmount, 0);

    return {
        deductions: calculatedDeductions,
        total: Math.round(total * 100) / 100
    };
}

// --- SETTINGS MANAGEMENT ---

/**
 * Updates the settings in the appData object from the UI form fields.
 */
export function updateSettingsFromUI() {
    appData.settings.companyName = document.getElementById('companyName').value;
    appData.settings.taxYear = parseInt(document.getElementById('taxYear').value);
    appData.settings.payFrequency = document.getElementById('payFrequency').value;
    appData.settings.firstPayPeriodStartDate = document.getElementById('firstPayPeriodStartDate').value;
    appData.settings.daysUntilPayday = parseInt(document.getElementById('daysUntilPayday').value);
    appData.settings.companyAddress = document.getElementById('companyAddress').value;
    appData.settings.companyPhone = document.getElementById('companyPhone').value;
    appData.settings.socialSecurity = parseFloat(document.getElementById('socialSecurity').value);
    appData.settings.medicare = parseFloat(document.getElementById('medicare').value);
    appData.settings.sutaRate = parseFloat(document.getElementById('sutaRate').value);
    appData.settings.futaRate = parseFloat(document.getElementById('futaRate').value);
    appData.settings.ssWageBase = parseFloat(document.getElementById('ssWageBase').value);
    appData.settings.futaWageBase = parseFloat(document.getElementById('futaWageBase').value);
    appData.settings.additionalMedicareThreshold = parseFloat(document.getElementById('additionalMedicareThreshold').value);
    appData.settings.additionalMedicareRate = parseFloat(document.getElementById('additionalMedicareRate').value);
    appData.settings.taxFrequencies.federal = document.getElementById('federalTaxFrequency').value;
    appData.settings.taxFrequencies.futa = document.getElementById('futaTaxFrequency').value;
    appData.settings.taxFrequencies.suta = document.getElementById('sutaTaxFrequency').value;
    appData.settings.taxFrequencies.state = document.getElementById('stateTaxFrequency').value;
    appData.settings.taxFrequencies.local = document.getElementById('localTaxFrequency').value;
}


// --- REPORTING LOGIC ---

export function generateTaxDepositReport() {
    const selectedFreq = document.getElementById('reportTaxFrequency').value;
    const allPayPeriods = [].concat.apply([], Object.values(appData.payPeriods)).filter(p => p.grossPay > 0);
    let periodsInDepositRange = [];
    let reportTitle = '';

    if (['weekly', 'bi-weekly'].includes(selectedFreq)) {
        const selectedPayDate = document.getElementById('reportPayPeriod').value;
        if (!selectedPayDate) return `<div class="alert alert-info">Please select a pay period.</div>`;
        periodsInDepositRange = allPayPeriods.filter(p => p.payDate === selectedPayDate);
        reportTitle = `Tax Deposit for Pay Date: ${selectedPayDate}`;
    } else {
        const periodInput = document.getElementById('reportPeriodText').value;
        if (!periodInput) return `<div class="alert alert-info">Please enter a period (e.g., June, Q2, 2025).</div>`;
        const { start, end, title } = parseDateInput(periodInput, selectedFreq);
        if (!start || !end) return `<div class="alert alert-info">Invalid period format. Use formats like "June 2025", "Q2 2025", or "08/25".</div>`;
        
        periodsInDepositRange = allPayPeriods.filter(p => {
            const payDate = new Date(p.payDate);
            return payDate >= start && payDate <= end;
        });
        reportTitle = `Tax Deposit for ${title}`;
    }

    if (periodsInDepositRange.length === 0) return `<div class="alert alert-info">No payroll data found for the selected period.</div><h4>${reportTitle}</h4>`;
    
    let liabilities = {};
    const freqs = appData.settings.taxFrequencies;
    const taxMap = {
        'Federal Payroll (941)': { freq: freqs.federal, type: 'federal'},
        'FUTA (940)': { freq: freqs.futa, type: 'futa'},
        'SUTA': { freq: freqs.suta, type: 'suta'},
        'State Income Tax': { freq: freqs.state, type: 'state'},
        'Local Tax': { freq: freqs.local, type: 'local'},
    };

    for (const [name, data] of Object.entries(taxMap)) {
        if (data.freq !== selectedFreq) continue;
        
        let totalLiability = 0;
        let federalBreakdown = { federal: 0, fica: 0, medicare: 0 };

        periodsInDepositRange.forEach(p => {
            switch (data.type) {
                case 'federal': 
                    const fedWH = p.taxes.federal;
                    const ficaTotal = p.taxes.fica * 2; // Employer + Employee
                    const medicareTotal = p.taxes.medicare * 2; // Employer + Employee
                    totalLiability += fedWH + ficaTotal + medicareTotal;
                    federalBreakdown.federal += fedWH;
                    federalBreakdown.fica += ficaTotal;
                    federalBreakdown.medicare += medicareTotal;
                    break;
                case 'futa': totalLiability += p.taxes.futa; break;
                case 'suta': totalLiability += p.taxes.suta; break;
                case 'state': totalLiability += p.taxes.state; break;
                case 'local': totalLiability += p.taxes.local; break;
            }
        });

        if (totalLiability > 0) {
             liabilities[name] = { amount: totalLiability, breakdown: data.type === 'federal' ? federalBreakdown : null };
        }
    }

    if (Object.keys(liabilities).length === 0) return `<div class="alert alert-info">No tax liabilities due for the selected period.</div><h4>${reportTitle}</h4>`;

    let tableRows = '', totalDeposit = 0;
    for (const [name, data] of Object.entries(liabilities)) {
        tableRows += `<tr class="sub-total-row"><td>${name}</td><td>$${data.amount.toFixed(2)}</td></tr>`;
        if (data.breakdown) {
            tableRows += `<tr><td style="padding-left: 30px;">Federal WH</td><td>$${data.breakdown.federal.toFixed(2)}</td></tr>`;
            tableRows += `<tr><td style="padding-left: 30px;">Social Security (FICA)</td><td>$${data.breakdown.fica.toFixed(2)}</td></tr>`;
            tableRows += `<tr><td style="padding-left: 30px;">Medicare</td><td>$${data.breakdown.medicare.toFixed(2)}</td></tr>`;
        }
        totalDeposit += data.amount;
    }

    return `<h4>${reportTitle}</h4><table class="report-table"><thead><tr><th>Tax Type</th><th>Amount Due</th></tr></thead><tbody>${tableRows}</tbody><tfoot><tr class="total-row"><td>Total Deposit Due</td><td>$${totalDeposit.toFixed(2)}</td></tr></tfoot></table>`;
}

export function generateW2Report(yearStr) {
    const year = parseInt(yearStr) || appData.settings.taxYear;
    const ssWageBase = appData.settings.ssWageBase || SS_WAGE_BASE;
    let reportHTML = `<h4>Annual W-2 Data - ${year}</h4>`;

    if (appData.employees.length === 0) return `<div class="alert alert-info">No employees found.</div>`;

    appData.employees.forEach(emp => {
        const periodsInYear = (appData.payPeriods[emp.id] || []).filter(p => new Date(p.payDate).getFullYear() === year && p.grossPay > 0);
        if (periodsInYear.length === 0) return;

        let totals = { gross: 0, federal: 0, fica: 0, medicare: 0, state: 0, local: 0 };
        let ssWages = 0;

        periodsInYear.forEach(p => {
            const grossBeforeThisPeriod = ssWages;
            if (grossBeforeThisPeriod < ssWageBase) {
                ssWages += Math.min(p.grossPay, ssWageBase - grossBeforeThisPeriod);
            }
            totals.gross += p.grossPay;
            totals.federal += p.taxes.federal; totals.fica += p.taxes.fica; totals.medicare += p.taxes.medicare;
            totals.state += p.taxes.state; totals.local += p.taxes.local;
        });

        reportHTML += `<div class="card" style="margin-top:20px;"><div class="card-header" style="background: #6c757d;">${emp.name} (ID: ${emp.idNumber})</div><div class="card-body"><table class="report-table"><thead><tr><th>W-2 Box</th><th>Description</th><th>Amount</th></tr></thead><tbody>
                            <tr><td>1</td><td>Wages, tips, other compensation</td><td>$${totals.gross.toFixed(2)}</td></tr>
                            <tr><td>2</td><td>Federal income tax withheld</td><td>$${totals.federal.toFixed(2)}</td></tr>
                            <tr><td>3</td><td>Social security wages</td><td>$${ssWages.toFixed(2)}</td></tr>
                            <tr><td>4</td><td>Social security tax withheld</td><td>$${totals.fica.toFixed(2)}</td></tr>
                            <tr><td>5</td><td>Medicare wages and tips</td><td>$${totals.gross.toFixed(2)}</td></tr>
                            <tr><td>6</td><td>Medicare tax withheld</td><td>$${totals.medicare.toFixed(2)}</td></tr>
                            <tr><td>16</td><td>State wages, tips, etc.</td><td>$${totals.gross.toFixed(2)}</td></tr>
                            <tr><td>17</td><td>State income tax</td><td>$${totals.state.toFixed(2)}</td></tr>
                            <tr><td>18</td><td>Local wages, tips, etc.</td><td>$${totals.gross.toFixed(2)}</td></tr>
                            <tr><td>19</td><td>Local income tax</td><td>$${totals.local.toFixed(2)}</td></tr>
                        </tbody></table></div></div>`;
    });
    return reportHTML;
}

export function generate941Report(periodStr) {
    const { start, end, title } = parseDateInput(periodStr, 'quarterly');
    if (!start) return `<div class="alert alert-info">Invalid period. Use format "Q1 2025".</div>`;

    const year = start.getFullYear();
    const ssWageBase = appData.settings.ssWageBase || SS_WAGE_BASE;
    const additionalMedicareThreshold = appData.settings.additionalMedicareThreshold || 200000;
    const additionalMedicareRate = (appData.settings.additionalMedicareRate || 0.9) / 100;
    const ficaTotalRate = (appData.settings.socialSecurity || 6.2) / 100 * 2; // Both employer and employee
    const medicareTotalRate = (appData.settings.medicare || 1.45) / 100 * 2; // Both employer and employee

    const allPayPeriodsInQuarter = [].concat.apply([], Object.values(appData.payPeriods))
        .filter(p => {
            const payDate = new Date(p.payDate);
            return payDate >= start && payDate <= end && p.grossPay > 0;
        });

    if (allPayPeriodsInQuarter.length === 0) return `<div class="alert alert-info">No payroll data for ${title}.</div>`;

    const employeeIdsInQuarter = [...new Set(allPayPeriodsInQuarter.map(p => {
        for (const id in appData.payPeriods) {
            if (appData.payPeriods[id].includes(p)) return id;
        }
    }))];

    let line1 = employeeIdsInQuarter.length;
    let line2 = 0, line3 = 0;
    let line5a_col1 = 0, line5c_col1 = 0, line5d_col1 = 0;
    let monthlyLiabilities = [0, 0, 0];
    const qMonths = [start.getMonth(), start.getMonth() + 1, start.getMonth() + 2];

    let totalDeposited941Taxes = 0;
    let totalUnrounded941Taxes = 0;

    appData.employees.forEach(emp => {
        let ytdSSWages = 0;
        let ytdGross = 0;
        const empPayPeriods = appData.payPeriods[emp.id] || [];

        empPayPeriods.forEach(p => {
            const payDate = new Date(p.payDate);
            if (payDate.getFullYear() === year && payDate < start && p.grossPay > 0) {
                ytdSSWages += p.grossPay;
                ytdGross += p.grossPay;
            }
        });

        const periodsInQuarter = empPayPeriods.filter(p => {
            const payDate = new Date(p.payDate);
            return payDate >= start && payDate <= end && p.grossPay > 0;
        });

        periodsInQuarter.forEach(p => {
            line2 += p.grossPay;
            line3 += p.taxes.federal;

            if (ytdSSWages < ssWageBase) {
                line5a_col1 += Math.min(p.grossPay, ssWageBase - ytdSSWages);
            }
            ytdSSWages += p.grossPay;

            line5c_col1 += p.grossPay;

            if (ytdGross < additionalMedicareThreshold && (ytdGross + p.grossPay) > additionalMedicareThreshold) {
                line5d_col1 += (ytdGross + p.grossPay) - additionalMedicareThreshold;
            } else if (ytdGross >= additionalMedicareThreshold) {
                line5d_col1 += p.grossPay;
            }
            ytdGross += p.grossPay;

            const rounded941TaxThisPeriod = p.taxes.federal + (p.taxes.fica * 2) + (p.taxes.medicare * 2);
            totalDeposited941Taxes += rounded941TaxThisPeriod;

            if(p.taxes.unrounded) {
                const unrounded941TaxThisPeriod = p.taxes.unrounded.federal + (p.taxes.unrounded.fica * 2) + (p.taxes.unrounded.medicare * 2);
                totalUnrounded941Taxes += unrounded941TaxThisPeriod;
            } else {
                totalUnrounded941Taxes += rounded941TaxThisPeriod;
            }

            const monthIndex = qMonths.indexOf(new Date(p.payDate).getMonth());
            if(monthIndex !== -1) {
                monthlyLiabilities[monthIndex] += rounded941TaxThisPeriod;
            }
        });
    });

    const line5a_col2 = line5a_col1 * ficaTotalRate;
    const line5c_col2 = line5c_col1 * medicareTotalRate;
    const line5d_col2 = line5d_col1 * additionalMedicareRate;
    const line5e = line5a_col2 + line5c_col2 + line5d_col2;
    const line6 = line3 + line5e;
    const line7 = totalDeposited941Taxes - parseFloat(totalUnrounded941Taxes.toFixed(2)) ;
    const line10 = line6 + line7;
    const line12 = line10;
    const line13 = totalDeposited941Taxes;
    const totalLiability = monthlyLiabilities.reduce((a, b) => a + b, 0);

    return `
        <h4>Quarterly Payroll Tax Report (Form 941) - ${title}</h4>
        <p class="alert alert-secondary" style="font-size: 0.9em;">This report provides data for Form 941 quarterly federal tax return. Assumes timely tax deposits per your Tax Deposit reports. Total deposits should equal total liability, resulting in \$0.00 balance due.</p>
        <h5>Quarterly Summary</h5>
        <table class="report-table">
            <thead><tr><th>Description</th><th style="text-align:right;">Amount</th></tr></thead>
            <tbody>
                <tr><td>Number of employees who received compensation</td><td style="text-align:right;">${line1}</td></tr>
                <tr><td>Total wages, tips, and other compensation</td><td style="text-align:right;">$${line2.toFixed(2)}</td></tr>
                <tr><td>Federal income tax withheld from compensation</td><td style="text-align:right;">$${line3.toFixed(2)}</td></tr>
                <tr><td colspan="2" style="background-color: #f8f9fa; font-weight: bold;">Taxable Social Security and Medicare Wages</td></tr>
                <tr><td>Taxable social security wages (subject to $${ssWageBase.toLocaleString()} limit)</td><td style="text-align:right;">$${line5a_col1.toFixed(2)}</td></tr>
                <tr><td style="padding-left: 40px;">Social security tax (${(ficaTotalRate * 100).toFixed(1)}% combined employer/employee)</td><td style="text-align:right;">$${line5a_col2.toFixed(2)}</td></tr>
                <tr><td>Taxable social security tips (not currently tracked)</td><td style="text-align:right;">$0.00</td></tr>
                 <tr><td style="padding-left: 40px;">Social security tax on tips</td><td style="text-align:right;">$0.00</td></tr>
                <tr><td>Taxable Medicare wages & tips (no wage limit)</td><td style="text-align:right;">$${line5c_col1.toFixed(2)}</td></tr>
                 <tr><td style="padding-left: 40px;">Medicare tax (${(medicareTotalRate * 100).toFixed(2)}% combined employer/employee)</td><td style="text-align:right;">$${line5c_col2.toFixed(2)}</td></tr>
                <tr><td>Wages subject to Additional Medicare Tax (over $${additionalMedicareThreshold.toLocaleString()})</td><td style="text-align:right;">$${line5d_col1.toFixed(2)}</td></tr>
                 <tr><td style="padding-left: 40px;">Additional Medicare Tax withholding (${(additionalMedicareRate * 100).toFixed(1)}%)</td><td style="text-align:right;">$${line5d_col2.toFixed(2)}</td></tr>
                <tr class="sub-total-row"><td>Total social security and Medicare taxes</td><td style="text-align:right;">$${line5e.toFixed(2)}</td></tr>
                <tr><td>Tax due on unreported tips (Section 3121(q))</td><td style="text-align:right;">$0.00</td></tr>
                <tr class="sub-total-row"><td>Total taxes before adjustments</td><td style="text-align:right;">$${line6.toFixed(2)}</td></tr>
                <tr><td>Adjustment for fractions of cents</td><td style="text-align:right;">$${line7.toFixed(2)}</td></tr>
                <tr><td>Adjustment for sick pay</td><td style="text-align:right;">$0.00</td></tr>
                <tr><td>Adjustments for tips and group-term life insurance</td><td style="text-align:right;">$0.00</td></tr>
                <tr class="sub-total-row"><td>Total taxes after adjustments</td><td style="text-align:right;">$${line10.toFixed(2)}</td></tr>
                <tr><td>Qualified small business payroll tax credit</td><td style="text-align:right;">$0.00</td></tr>
                <tr class="total-row"><td>Total taxes after credits</td><td style="text-align:right;">$${line12.toFixed(2)}</td></tr>
                <tr><td>Total deposits for this quarter</td><td style="text-align:right;">$${line13.toFixed(2)}</td></tr>
                <tr class="total-row"><td>Balance due (overpayment shown as negative)</td><td style="text-align:right;">$${(line12 - line13).toFixed(2)}</td></tr>
            </tbody>
        </table>
        <h5 style="margin-top: 20px;">Monthly Tax Liability Breakdown</h5>
         <table class="report-table">
            <thead><tr><th>Month</th><th>Tax Liability</th></tr></thead>
            <tbody>
                <tr><td>Month 1 of Quarter</td><td style="text-align:right;">$${monthlyLiabilities[0].toFixed(2)}</td></tr>
                <tr><td>Month 2 of Quarter</td><td style="text-align:right;">$${monthlyLiabilities[1].toFixed(2)}</td></tr>
                <tr><td>Month 3 of Quarter</td><td style="text-align:right;">$${monthlyLiabilities[2].toFixed(2)}</td></tr>
                <tr class="total-row"><td>Total quarterly liability</td><td style="text-align:right;">$${totalLiability.toFixed(2)}</td></tr>
            </tbody>
        </table>
    `;
}

export function generate940Report(yearStr) {
    const year = parseInt(yearStr) || appData.settings.taxYear;
    const futaWageBase = appData.settings.futaWageBase || FUTA_WAGE_BASE;
    const futaRate = appData.settings.futaRate / 100;

    const allPayPeriods = [].concat.apply([], Object.values(appData.payPeriods));
    const periodsInYear = allPayPeriods.filter(p => new Date(p.payDate).getFullYear() === year && p.grossPay > 0);
    if (periodsInYear.length === 0) return `<div class="alert alert-info">No payroll data for ${year}.</div>`;

    let line3 = 0, line4 = 0, line5 = 0;
    let quarterlyLiabilities = {q1: 0, q2: 0, q3: 0, q4: 0};

    appData.employees.forEach(emp => {
        let ytdFUTAWages = 0;
        const empPayPeriods = (appData.payPeriods[emp.id] || []).filter(p => new Date(p.payDate).getFullYear() === year).sort((a,b) => a.period - b.period);

        empPayPeriods.forEach(p => {
            if (p.grossPay <= 0) return;

            line3 += p.grossPay;

            const wagesThisPeriod = p.grossPay;
            let taxableFUTAWagesThisPeriod = 0;
            if (ytdFUTAWages < futaWageBase) {
                taxableFUTAWagesThisPeriod = Math.min(wagesThisPeriod, futaWageBase - ytdFUTAWages);
            }
            ytdFUTAWages += wagesThisPeriod;

            const payDate = new Date(p.payDate);
            const quarter = Math.floor(payDate.getMonth() / 3) + 1;
            quarterlyLiabilities[`q${quarter}`] += taxableFUTAWagesThisPeriod * futaRate;
        });

        if (ytdFUTAWages > futaWageBase) {
            line5 += ytdFUTAWages - futaWageBase;
        }
    });

    const line6 = line4 + line5;
    const line7 = line3 - line6;
    const line8 = line7 * futaRate;
    const line12 = line8; // No adjustments
    const line13 = line12; // Assuming deposits match liability
    const line17 = line12;

    let part5HTML = '';
    if (line12 > 500) {
        part5HTML = `
        <h5 style="margin-top: 20px;">Quarterly Tax Liability Breakdown</h5>
        <table class="report-table">
            <tbody>
                <tr><td>Quarter 1 (January 1 - March 31)</td><td style="text-align:right;">$${quarterlyLiabilities.q1.toFixed(2)}</td></tr>
                <tr><td>Quarter 2 (April 1 - June 30)</td><td style="text-align:right;">$${quarterlyLiabilities.q2.toFixed(2)}</td></tr>
                <tr><td>Quarter 3 (July 1 - September 30)</td><td style="text-align:right;">$${quarterlyLiabilities.q3.toFixed(2)}</td></tr>
                <tr><td>Quarter 4 (October 1 - December 31)</td><td style="text-align:right;">$${quarterlyLiabilities.q4.toFixed(2)}</td></tr>
                <tr class="total-row"><td>Total tax liability for the year</td><td style="text-align:right;">$${line17.toFixed(2)}</td></tr>
            </tbody>
        </table>`;
    }

    return `
        <h4>Annual Federal Unemployment (FUTA) Tax Report (Form 940) - ${year}</h4>
         <p class="alert alert-secondary" style="font-size: 0.9em;">This report provides data for Form 940 annual federal unemployment tax return. Assumes you are not in a credit reduction state and have made all tax deposits on time. Total deposits should equal total tax, resulting in \$0.00 balance due.</p>
        <h5>FUTA Tax Calculation</h5>
        <table class="report-table">
            <thead><tr><th>Description</th><th style="text-align:right;">Amount</th></tr></thead>
            <tbody>
                <tr><td>Total payments to all employees</td><td style="text-align:right;">$${line3.toFixed(2)}</td></tr>
                <tr><td>Payments exempt from FUTA tax</td><td style="text-align:right;">$${line4.toFixed(2)}</td></tr>
                <tr><td>Total payments exceeding $${futaWageBase.toLocaleString()} per employee</td><td style="text-align:right;">$${line5.toFixed(2)}</td></tr>
                <tr class="sub-total-row"><td>Total exempt and excess payments</td><td style="text-align:right;">$${line6.toFixed(2)}</td></tr>
                <tr class="sub-total-row"><td>Total taxable FUTA wages</td><td style="text-align:right;">$${line7.toFixed(2)}</td></tr>
                <tr class="total-row"><td>FUTA tax before adjustments (${(futaRate * 100).toFixed(1)}% of taxable wages)</td><td style="text-align:right;">$${line8.toFixed(2)}</td></tr>
            </tbody>
        </table>
         <h5 style="margin-top: 20px;">Adjustments and Final Tax</h5>
         <table class="report-table">
            <tbody>
                <tr><td>Adjustment for excluded wages</td><td style="text-align:right;">$0.00</td></tr>
                <tr><td>Adjustment for late payments</td><td style="text-align:right;">$0.00</td></tr>
                <tr><td>Credit reduction (for certain states)</td><td style="text-align:right;">$0.00</td></tr>
                <tr class="total-row"><td>Total FUTA tax after adjustments</td><td style="text-align:right;">$${line12.toFixed(2)}</td></tr>
                <tr><td>FUTA tax deposited for the year</td><td style="text-align:right;">$${line13.toFixed(2)}</td></tr>
                <tr class="total-row"><td>Balance due (overpayment shown as negative)</td><td style="text-align:right;">$0.00</td></tr>
            </tbody>
        </table>
        ${part5HTML}
    `;
}

// --- CSV EXPORT FUNCTIONS ---

/**
 * Exports W-2 report data to CSV
 * @param {string} yearStr - The year for the report
 * @returns {void} - Downloads CSV file
 */
export function exportW2ReportToCSV(yearStr) {
    const year = parseInt(yearStr) || appData.settings.taxYear;
    const ssWageBase = appData.settings.ssWageBase || SS_WAGE_BASE;

    let csvContent = "Employee Name,Employee ID,Wages,Federal Tax,FICA,Medicare,SS Wages,State Tax,Local Tax\n";

    appData.employees.forEach(emp => {
        const periodsInYear = (appData.payPeriods[emp.id] || []).filter(p => new Date(p.payDate).getFullYear() === year && p.grossPay > 0);
        if (periodsInYear.length === 0) return;

        let totals = { gross: 0, federal: 0, fica: 0, medicare: 0, state: 0, local: 0 };
        let ssWages = 0;

        periodsInYear.forEach(p => {
            const grossBeforeThisPeriod = ssWages;
            if (grossBeforeThisPeriod < ssWageBase) {
                ssWages += Math.min(p.grossPay, ssWageBase - grossBeforeThisPeriod);
            }
            totals.gross += p.grossPay;
            totals.federal += p.taxes.federal;
            totals.fica += p.taxes.fica;
            totals.medicare += p.taxes.medicare;
            totals.state += p.taxes.state;
            totals.local += p.taxes.local;
        });

        const row = [
            `"${emp.name}"`,
            `"${emp.idNumber}"`,
            totals.gross.toFixed(2),
            totals.federal.toFixed(2),
            totals.fica.toFixed(2),
            totals.medicare.toFixed(2),
            ssWages.toFixed(2),
            totals.state.toFixed(2),
            totals.local.toFixed(2)
        ].join(',');
        csvContent += row + "\n";
    });

    downloadCSV(csvContent, `PayTrax_W2_Report_${year}.csv`);
}

/**
 * Exports 941 report data to CSV
 * @param {string} periodStr - The quarter for the report (e.g., "Q1 2025")
 * @returns {void} - Downloads CSV file
 */
export function export941ReportToCSV(periodStr) {
    const { start, end, title } = parseDateInput(periodStr, 'quarterly');
    if (!start) {
        alert('Invalid period. Use format "Q1 2025".');
        return;
    }

    const allPayPeriodsInQuarter = [].concat.apply([], Object.values(appData.payPeriods))
        .filter(p => {
            const payDate = new Date(p.payDate);
            return payDate >= start && payDate <= end && p.grossPay > 0;
        });

    if (allPayPeriodsInQuarter.length === 0) {
        alert('No payroll data for this period.');
        return;
    }

    let csvContent = "Description,Amount\n";
    csvContent += `"Report Period","${title}"\n`;

    let totalWages = 0, totalFederal = 0, totalFICA = 0, totalMedicare = 0;

    allPayPeriodsInQuarter.forEach(p => {
        totalWages += p.grossPay;
        totalFederal += p.taxes.federal;
        totalFICA += p.taxes.fica * 2;
        totalMedicare += p.taxes.medicare * 2;
    });

    csvContent += `"Total Wages","${totalWages.toFixed(2)}"\n`;
    csvContent += `"Federal Income Tax Withheld","${totalFederal.toFixed(2)}"\n`;
    csvContent += `"Social Security Tax","${totalFICA.toFixed(2)}"\n`;
    csvContent += `"Medicare Tax","${totalMedicare.toFixed(2)}"\n`;
    csvContent += `"Total Tax Liability","${(totalFederal + totalFICA + totalMedicare).toFixed(2)}"\n`;

    downloadCSV(csvContent, `PayTrax_941_Report_${periodStr.replace(/\s+/g, '_')}.csv`);
}

/**
 * Exports 940 report data to CSV
 * @param {string} yearStr - The year for the report
 * @returns {void} - Downloads CSV file
 */
export function export940ReportToCSV(yearStr) {
    const year = parseInt(yearStr) || appData.settings.taxYear;
    const futaWageBase = appData.settings.futaWageBase || FUTA_WAGE_BASE;
    const futaRate = appData.settings.futaRate / 100;

    const allPayPeriods = [].concat.apply([], Object.values(appData.payPeriods));
    const periodsInYear = allPayPeriods.filter(p => new Date(p.payDate).getFullYear() === year && p.grossPay > 0);

    if (periodsInYear.length === 0) {
        alert('No payroll data for this year.');
        return;
    }

    let totalWages = 0, excessWages = 0, totalFUTA = 0;

    appData.employees.forEach(emp => {
        let ytdFUTAWages = 0;
        const empPayPeriods = (appData.payPeriods[emp.id] || []).filter(p => new Date(p.payDate).getFullYear() === year).sort((a,b) => a.period - b.period);

        empPayPeriods.forEach(p => {
            if (p.grossPay <= 0) return;

            totalWages += p.grossPay;

            const wagesThisPeriod = p.grossPay;
            let taxableFUTAWagesThisPeriod = 0;
            if (ytdFUTAWages < futaWageBase) {
                taxableFUTAWagesThisPeriod = Math.min(wagesThisPeriod, futaWageBase - ytdFUTAWages);
            }
            ytdFUTAWages += wagesThisPeriod;
            totalFUTA += taxableFUTAWagesThisPeriod * futaRate;
        });

        if (ytdFUTAWages > futaWageBase) {
            excessWages += ytdFUTAWages - futaWageBase;
        }
    });

    const taxableWages = totalWages - excessWages;

    let csvContent = "Description,Amount\n";
    csvContent += `"Tax Year","${year}"\n`;
    csvContent += `"Total Payments to Employees","${totalWages.toFixed(2)}"\n`;
    csvContent += `"Payments Exceeding FUTA Wage Base","${excessWages.toFixed(2)}"\n`;
    csvContent += `"Taxable FUTA Wages","${taxableWages.toFixed(2)}"\n`;
    csvContent += `"FUTA Tax","${totalFUTA.toFixed(2)}"\n`;

    downloadCSV(csvContent, `PayTrax_940_Report_${year}.csv`);
}

/**
 * Exports custom date range employee report to CSV
 * @param {string} startDateStr - Start date
 * @param {string} endDateStr - End date
 * @param {string} employeeId - Employee ID or "all"
 * @returns {void} - Downloads CSV file
 */
export function exportDateRangeEmployeeReportToCSV(startDateStr, endDateStr, employeeId) {
    const start = new Date(startDateStr + 'T00:00:00');
    const end = new Date(endDateStr + 'T23:59:59');

    const employeesToReport = employeeId === 'all'
        ? appData.employees
        : appData.employees.filter(e => e.id === employeeId);

    let csvContent = "Employee Name,Employee ID,Regular Hours,Overtime Hours,Holiday Hours,PTO Hours,Total Hours,Regular Pay,Overtime Pay,Holiday Pay,PTO Pay,Gross Pay,Federal Tax,FICA,Medicare,State Tax,Local Tax,Deductions,Net Pay\n";

    employeesToReport.forEach(emp => {
        const periods = (appData.payPeriods[emp.id] || []).filter(p => {
            const payDate = new Date(p.payDate);
            return payDate >= start && payDate <= end && p.grossPay > 0;
        });

        if (periods.length === 0) return;

        let totals = {
            regHours: 0, otHours: 0, holHours: 0, ptoHours: 0,
            regular: 0, overtime: 0, holiday: 0, pto: 0,
            gross: 0, federal: 0, fica: 0, medicare: 0, state: 0, local: 0,
            deductions: 0, net: 0
        };

        periods.forEach(p => {
            totals.regHours += p.hours.regular || 0;
            totals.otHours += p.hours.overtime || 0;
            totals.holHours += p.hours.holiday || 0;
            totals.ptoHours += p.hours.pto || 0;
            totals.regular += p.earnings.regular || 0;
            totals.overtime += p.earnings.overtime || 0;
            totals.holiday += p.earnings.holiday || 0;
            totals.pto += p.earnings.pto || 0;
            totals.gross += p.grossPay;
            totals.federal += p.taxes.federal;
            totals.fica += p.taxes.fica;
            totals.medicare += p.taxes.medicare;
            totals.state += p.taxes.state;
            totals.local += p.taxes.local;
            totals.deductions += p.totalDeductions || 0;
            totals.net += p.netPay;
        });

        const row = [
            `"${emp.name}"`,
            `"${emp.idNumber}"`,
            totals.regHours.toFixed(2),
            totals.otHours.toFixed(2),
            totals.holHours.toFixed(2),
            totals.ptoHours.toFixed(2),
            (totals.regHours + totals.otHours + totals.holHours + totals.ptoHours).toFixed(2),
            totals.regular.toFixed(2),
            totals.overtime.toFixed(2),
            totals.holiday.toFixed(2),
            totals.pto.toFixed(2),
            totals.gross.toFixed(2),
            totals.federal.toFixed(2),
            totals.fica.toFixed(2),
            totals.medicare.toFixed(2),
            totals.state.toFixed(2),
            totals.local.toFixed(2),
            totals.deductions.toFixed(2),
            totals.net.toFixed(2)
        ].join(',');
        csvContent += row + "\n";
    });

    downloadCSV(csvContent, `PayTrax_Employee_Wages_${startDateStr}_to_${endDateStr}.csv`);
}

/**
 * Exports the Date Range Employer Report to CSV
 * @param {string} startDateStr - Start date in YYYY-MM-DD format
 * @param {string} endDateStr - End date in YYYY-MM-DD format
 * @param {string} employeeId - Employee ID or 'all'
 */
export function exportDateRangeEmployerReportToCSV(startDateStr, endDateStr, employeeId) {
    const start = new Date(startDateStr + 'T00:00:00');
    const end = new Date(endDateStr + 'T23:59:59');

    const employeeIdsToReport = employeeId === 'all' ? appData.employees.map(e => e.id) : [employeeId];
    const allPayPeriods = [].concat.apply([], employeeIdsToReport.map(id => appData.payPeriods[id] || []));

    const periodsInRange = allPayPeriods.filter(p => {
        const payDate = new Date(p.payDate);
        return payDate >= start && payDate <= end && p.grossPay > 0;
    }).sort((a,b) => new Date(a.payDate) - new Date(b.payDate));

    let csvContent = "Pay Date,Hours,Gross Pay,Employer FICA,Employer Medicare,SUTA,FUTA,Total Cost\n";

    if (employeeId === 'all') {
        // Group by pay date for all employees
        const groupedByPayDate = periodsInRange.reduce((acc, p) => {
            if (!acc[p.payDate]) {
                acc[p.payDate] = { gross: 0, employerFica: 0, employerMedicare: 0, suta: 0, futa: 0, hours: 0 };
            }
            const group = acc[p.payDate];
            group.hours += Object.values(p.hours).reduce((a,b) => a + b, 0);
            group.gross += p.grossPay;
            group.employerFica += p.taxes.fica;
            group.employerMedicare += p.taxes.medicare;
            group.suta += p.taxes.suta;
            group.futa += p.taxes.futa;
            return acc;
        }, {});

        for (const [payDate, totals] of Object.entries(groupedByPayDate)) {
            const totalPeriodCost = totals.gross + totals.employerFica + totals.employerMedicare + totals.suta + totals.futa;
            const row = [
                payDate,
                totals.hours.toFixed(2),
                totals.gross.toFixed(2),
                totals.employerFica.toFixed(2),
                totals.employerMedicare.toFixed(2),
                totals.suta.toFixed(2),
                totals.futa.toFixed(2),
                totalPeriodCost.toFixed(2)
            ].join(',');
            csvContent += row + "\n";
        }
    } else {
        // Individual employee periods
        periodsInRange.forEach(period => {
            const totalHours = Object.values(period.hours).reduce((a,b) => a + b, 0);
            const employerFica = period.taxes.fica;
            const employerMedicare = period.taxes.medicare;
            const totalPeriodCost = period.grossPay + employerFica + employerMedicare + period.taxes.suta + period.taxes.futa;
            const row = [
                period.payDate,
                totalHours.toFixed(2),
                period.grossPay.toFixed(2),
                employerFica.toFixed(2),
                employerMedicare.toFixed(2),
                period.taxes.suta.toFixed(2),
                period.taxes.futa.toFixed(2),
                totalPeriodCost.toFixed(2)
            ].join(',');
            csvContent += row + "\n";
        });
    }

    const employeeName = employeeId === 'all' ? 'All_Employees' : appData.employees.find(e => e.id === employeeId).name.replace(/\s+/g, '_');
    downloadCSV(csvContent, `PayTrax_Employer_Costs_${employeeName}_${startDateStr}_to_${endDateStr}.csv`);
}

/**
 * Helper function to download CSV file
 * @param {string} csvContent - The CSV content
 * @param {string} filename - The filename for download
 */
function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export function generateDateRangeEmployeeReport(startDateStr, endDateStr, employeeId) {
    const start = new Date(startDateStr + 'T00:00:00');
    const end = new Date(endDateStr + 'T23:59:59');
    if (!startDateStr || !endDateStr) return `<div class="alert alert-info">Please select a start and end date.</div>`;
    
    const employeeIdsToReport = employeeId === 'all' ? appData.employees.map(e => e.id) : [employeeId];
    const allPayPeriods = [].concat.apply([], employeeIdsToReport.map(id => appData.payPeriods[id] || []));
    
    const periodsInRange = allPayPeriods.filter(p => {
        const payDate = new Date(p.payDate);
        return payDate >= start && payDate <= end && p.grossPay > 0;
    }).sort((a,b) => new Date(a.payDate) - new Date(b.payDate));

    if (periodsInRange.length === 0) return `<div class="alert alert-info">No data for date range.</div>`;
    
    let reportRows = '';
    let grandTotals = { gross: 0, federal: 0, fica: 0, medicare: 0, state: 0, local: 0, net: 0, hours: 0 };
    
    if (employeeId === 'all') {
        const groupedByPayDate = periodsInRange.reduce((acc, p) => {
            if (!acc[p.payDate]) {
                acc[p.payDate] = { gross: 0, federal: 0, fica: 0, medicare: 0, state: 0, local: 0, net: 0, hours: 0 };
            }
            const group = acc[p.payDate];
            group.hours += Object.values(p.hours).reduce((a,b) => a + b, 0);
            group.gross += p.grossPay; group.net += p.netPay;
            group.federal += p.taxes.federal; group.fica += p.taxes.fica; group.medicare += p.taxes.medicare;
            group.state += p.taxes.state; group.local += p.taxes.local;
            return acc;
        }, {});

        for (const [payDate, totals] of Object.entries(groupedByPayDate)) {
            reportRows += `<tr><td>${payDate}</td><td>${totals.hours.toFixed(2)}</td><td>$${totals.gross.toFixed(2)}</td><td>$${totals.federal.toFixed(2)}</td><td>$${totals.state.toFixed(2)}</td><td>$${totals.local.toFixed(2)}</td><td>$${totals.fica.toFixed(2)}</td><td>$${totals.medicare.toFixed(2)}</td><td>$${totals.net.toFixed(2)}</td></tr>`;
            grandTotals.hours += totals.hours; grandTotals.gross += totals.gross; grandTotals.net += totals.net;
            grandTotals.federal += totals.federal; grandTotals.fica += totals.fica; grandTotals.medicare += totals.medicare;
            grandTotals.state += totals.state; grandTotals.local += totals.local;
        }
    } else {
        periodsInRange.forEach(period => {
            const totalHours = Object.values(period.hours).reduce((a,b) => a + b, 0);
            grandTotals.gross += period.grossPay; grandTotals.net += period.netPay; grandTotals.hours += totalHours;
            grandTotals.federal += period.taxes.federal; grandTotals.fica += period.taxes.fica; grandTotals.medicare += period.taxes.medicare;
            grandTotals.state += period.taxes.state; grandTotals.local += period.taxes.local;
            reportRows += `<tr><td>${period.payDate}</td><td>${totalHours.toFixed(2)}</td><td>$${period.grossPay.toFixed(2)}</td><td>$${period.taxes.federal.toFixed(2)}</td><td>$${period.taxes.state.toFixed(2)}</td><td>$${period.taxes.local.toFixed(2)}</td><td>$${period.taxes.fica.toFixed(2)}</td><td>$${period.taxes.medicare.toFixed(2)}</td><td>$${period.netPay.toFixed(2)}</td></tr>`;
        });
    }

    const employeeName = employeeId === 'all' ? 'All Employees' : appData.employees.find(e => e.id === employeeId).name;

    return `<h4>Custom Employee Wage Report: ${startDateStr} to ${endDateStr}</h4><h5>For: ${employeeName}</h5>
        <table class="report-table">
            <thead><tr><th>Pay Date</th><th>Hours</th><th>Gross</th><th>Fed Tax</th><th>State</th><th>Local</th><th>FICA</th><th>Medicare</th><th>Net</th></tr></thead>
            <tbody>${reportRows}<tr class="total-row"><td>TOTALS</td><td>${grandTotals.hours.toFixed(2)}</td><td>$${grandTotals.gross.toFixed(2)}</td><td>$${grandTotals.federal.toFixed(2)}</td><td>$${grandTotals.state.toFixed(2)}</td><td>$${grandTotals.local.toFixed(2)}</td><td>$${grandTotals.fica.toFixed(2)}</td><td>$${grandTotals.medicare.toFixed(2)}</td><td>$${grandTotals.net.toFixed(2)}</td></tr></tbody>
        </table>`;
}

export function generateDateRangeEmployerReport(startDateStr, endDateStr, employeeId) {
    const start = new Date(startDateStr + 'T00:00:00');
    const end = new Date(endDateStr + 'T23:59:59');
    if (!startDateStr || !endDateStr) return `<div class="alert alert-info">Please select a start and end date.</div>`;

    const employeeIdsToReport = employeeId === 'all' ? appData.employees.map(e => e.id) : [employeeId];
    const allPayPeriods = [].concat.apply([], employeeIdsToReport.map(id => appData.payPeriods[id] || []));

    const periodsInRange = allPayPeriods.filter(p => {
        const payDate = new Date(p.payDate);
        return payDate >= start && payDate <= end && p.grossPay > 0;
    }).sort((a,b) => new Date(a.payDate) - new Date(b.payDate));

    if (periodsInRange.length === 0) return `<div class="alert alert-info">No data for date range.</div>`;
    
    let reportRows = '';
    let grandTotals = { gross: 0, employerFica: 0, employerMedicare: 0, suta: 0, futa: 0, totalCost: 0, hours: 0 };

    if (employeeId === 'all') {
        const groupedByPayDate = periodsInRange.reduce((acc, p) => {
            if (!acc[p.payDate]) {
                acc[p.payDate] = { gross: 0, employerFica: 0, employerMedicare: 0, suta: 0, futa: 0, hours: 0 };
            }
            const group = acc[p.payDate];
            group.hours += Object.values(p.hours).reduce((a,b) => a + b, 0);
            group.gross += p.grossPay;
            group.employerFica += p.taxes.fica;
            group.employerMedicare += p.taxes.medicare;
            group.suta += p.taxes.suta;
            group.futa += p.taxes.futa;
            return acc;
        }, {});

        for (const [payDate, totals] of Object.entries(groupedByPayDate)) {
            const totalPeriodCost = totals.gross + totals.employerFica + totals.employerMedicare + totals.suta + totals.futa;
            reportRows += `<tr><td>${payDate}</td><td>${totals.hours.toFixed(2)}</td><td>$${totals.gross.toFixed(2)}</td><td>$${totals.employerFica.toFixed(2)}</td><td>$${totals.employerMedicare.toFixed(2)}</td><td>$${totals.suta.toFixed(2)}</td><td>$${totals.futa.toFixed(2)}</td><td>$${totalPeriodCost.toFixed(2)}</td></tr>`;
            grandTotals.hours += totals.hours; grandTotals.gross += totals.gross; grandTotals.employerFica += totals.employerFica;
            grandTotals.employerMedicare += totals.employerMedicare; grandTotals.suta += totals.suta; grandTotals.futa += totals.futa;
            grandTotals.totalCost += totalPeriodCost;
        }
    } else {
         periodsInRange.forEach(period => {
            const totalHours = Object.values(period.hours).reduce((a,b) => a + b, 0);
            const employerFica = period.taxes.fica;
            const employerMedicare = period.taxes.medicare;
            const totalPeriodCost = period.grossPay + employerFica + employerMedicare + period.taxes.suta + period.taxes.futa;
            grandTotals.gross += period.grossPay; grandTotals.employerFica += employerFica; grandTotals.employerMedicare += employerMedicare;
            grandTotals.suta += period.taxes.suta; grandTotals.futa += period.taxes.futa; grandTotals.totalCost += totalPeriodCost; grandTotals.hours += totalHours;
            reportRows += `<tr><td>${period.payDate}</td><td>${totalHours.toFixed(2)}</td><td>$${period.grossPay.toFixed(2)}</td><td>$${employerFica.toFixed(2)}</td><td>$${employerMedicare.toFixed(2)}</td><td>$${period.taxes.suta.toFixed(2)}</td><td>$${period.taxes.futa.toFixed(2)}</td><td>$${totalPeriodCost.toFixed(2)}</td></tr>`;
        });
    }

    const employeeName = employeeId === 'all' ? 'All Employees' : appData.employees.find(e => e.id === employeeId).name;

    return `<h4>Custom Employer Expense Report: ${startDateStr} to ${endDateStr}</h4><h5>For: ${employeeName}</h5>
        <table class="report-table">
            <thead><tr><th>Pay Date</th><th>Hours</th><th>Gross</th><th>ER FICA</th><th>ER Medicare</th><th>SUTA</th><th>FUTA</th><th>Total Cost</th></tr></thead>
            <tbody>${reportRows}<tr class="total-row"><td>TOTALS</td><td>${grandTotals.hours.toFixed(2)}</td><td>$${grandTotals.gross.toFixed(2)}</td><td>$${grandTotals.employerFica.toFixed(2)}</td><td>$${grandTotals.employerMedicare.toFixed(2)}</td><td>$${grandTotals.suta.toFixed(2)}</td><td>$${grandTotals.futa.toFixed(2)}</td><td>$${grandTotals.totalCost.toFixed(2)}</td></tr></tbody>
        </table>`;
}