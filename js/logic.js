/*
  PayTrax Payroll Management
  Copyright (c) 2025 greenwh

  Developed by greenwh with substantial assistance from AI coding tools (Claude, ChatGPT, Gemini).
  This file is original work based on documentation and prompts by greenwh.
  Licensed under the MIT License.
*/
// js/logic.js - Core payroll calculations and pay period management
//
// Employee management and deductions are in employees.js
// Reports and CSV exports are in reports.js

import { appData } from './state.js';
import { formatDate, fromStorageDate, toDisplayDate, getQuarterForDate } from './utils.js';
import { addTransaction } from './banking.js';
import { calculateDeductions } from './employees.js';

// Re-export from sub-modules so existing `import * as logic` continues to work
export { saveEmployeeFromForm, deleteEmployee, addDeduction, updateDeduction, deleteDeduction, calculateDeductions } from './employees.js';
export { generateTaxDepositReportFromData, generateTaxDepositReport, generateW2Report, generate941Report, generate940Report, compute941Data, compute940Data, exportW2ReportToCSV, export941ReportToCSV, export940ReportToCSV, exportDateRangeEmployeeReportToCSV, exportDateRangeEmployerReportToCSV, generateDateRangeEmployeeReport, generateDateRangeEmployerReport } from './reports.js';

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
                    // Parse pay date year - stored in YYYY-MM-DD format
                    const payDateYear = fromStorageDate(p.payDate).getFullYear();
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

    // Derive PTO from scratch alongside the remainder reset (audit F1)
    let ptoBalance = employee.ptoStartingBalance || 0;
    const periodsInYear = sortedPeriods.length;

    // Recalculate each period in sequence
    sortedPeriods.forEach(period => {
        const totalHours = period.hours ? Object.values(period.hours).reduce((a, b) => a + b, 0) : 0;

        // Only recalculate periods that have hours entered
        if (totalHours > 0) {
            recalculatePeriod(employeeId, period.period);
            // Accrue only on periods with worked (regular/overtime) hours
            const worked = (period.hours.regular || 0) + (period.hours.overtime || 0) > 0;
            const accrued = worked && periodsInYear > 0
                ? employee.ptoAccrualRate / periodsInYear
                : 0;
            ptoBalance = ptoBalance + accrued - (period.hours.pto || 0);
            period.ptoAccrued = accrued;
            period.ptoBalanceAfter = Math.round(ptoBalance * 100) / 100;
        } else {
            period.ptoAccrued = 0;
            period.ptoBalanceAfter = Math.round(ptoBalance * 100) / 100;
        }
    });

    employee.ptoBalance = Math.round(ptoBalance * 100) / 100;
}

/**
 * Recalculates a single pay period using the hours already stored in that period.
 * This function does NOT read from UI - it uses stored period data.
 * Used by recalculateAllPeriodsForEmployee to process periods sequentially.
 * This is a pure function that can be tested directly.
 * @param {string} employeeId - The ID of the employee
 * @param {number} periodNum - The period number to recalculate
 * @returns {object|null} The recalculated period, or null if invalid
 */
export function recalculatePeriod(employeeId, periodNum) {
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

    // Compute YTD gross wages BEFORE this period for wage base cap enforcement
    const year = fromStorageDate(period.payDate).getFullYear();
    const allPeriodsForEmployee = appData.payPeriods[employeeId] || [];
    let ytdGrossBeforeThisPeriod = 0;

    allPeriodsForEmployee.forEach(p => {
        if (p.period < period.period
            && fromStorageDate(p.payDate).getFullYear() === year
            && p.grossPay > 0) {
            ytdGrossBeforeThisPeriod += p.grossPay;
        }
    });

    // Retrieve wage base settings
    const ssWageBase = appData.settings.ssWageBase;
    const futaWageBase = appData.settings.futaWageBase;
    const sutaWageBase = appData.settings.sutaWageBase;

    // Calculate taxable wages for each capped tax type
    // If YTD already exceeds the cap, taxable wages for this period = 0
    // If this period's gross crosses the cap, only the portion below the cap is taxable
    function getTaxableWages(ytdBefore, currentGross, wageBase) {
        if (ytdBefore >= wageBase) return 0;
        return Math.min(currentGross, wageBase - ytdBefore);
    }

    const ssTaxableWages = getTaxableWages(ytdGrossBeforeThisPeriod, grossPay, ssWageBase);
    const futaTaxableWages = getTaxableWages(ytdGrossBeforeThisPeriod, grossPay, futaWageBase);
    const sutaTaxableWages = getTaxableWages(ytdGrossBeforeThisPeriod, grossPay, sutaWageBase);

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

    calculateTaxWithRemainder('federal', grossPay * (employee.fedTaxRate / 100));         // NO cap
    calculateTaxWithRemainder('state', grossPay * (employee.stateTaxRate / 100));          // NO cap
    calculateTaxWithRemainder('local', grossPay * (employee.localTaxRate / 100));          // NO cap
    calculateTaxWithRemainder('fica', ssTaxableWages * (socialSecurity / 100));            // CAPPED by SS wage base
    calculateTaxWithRemainder('medicare', grossPay * (medicare / 100));                    // NO cap
    calculateTaxWithRemainder('suta', sutaTaxableWages * (sutaRate / 100));                // CAPPED by SUTA wage base
    calculateTaxWithRemainder('futa', futaTaxableWages * (futaRate / 100));                // CAPPED by FUTA wage base

    // Update the employee's stored remainders for the next pay run
    appData.employees[employeeIndex].taxRemainders = newRemainders;

    const employeeTaxes = rounded.federal + rounded.state + rounded.local + rounded.fica + rounded.medicare;

    // Calculate deductions (only apply those created on or before this pay date)
    const { deductions, total: totalDeductions } = calculateDeductions(employee, grossPay, payDate);

    const netPay = grossPay - employeeTaxes - totalDeductions;

    // Update Period Data
    // (PTO accrual/balance is owned by recalculateAllPeriodsForEmployee, which
    // derives it sequentially from ptoStartingBalance — see audit F1.)
    period.earnings = earnings;
    period.grossPay = grossPay;
    period.netPay = netPay;
    period.taxes = { ...rounded, total: employeeTaxes, unrounded };
    period.deductions = deductions;
    period.totalDeductions = totalDeductions;

    // Update Bank Register (only if autoSubtraction is enabled)
    if (appData.settings.autoSubtraction !== false) {
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

    return period;
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

    // Only request a recalculation when the period actually has hours —
    // merely browsing an empty period must not mutate data, save, or write
    // audit entries (audit F12)
    const totalHours = period.hours ? Object.values(period.hours).reduce((a, b) => a + b, 0) : 0;
    return totalHours > 0;
}

/**
 * Calculates pay from provided data without DOM dependency.
 * This is the pure function that can be tested directly.
 * @param {string} employeeId - The ID of the employee
 * @param {number} periodNum - The period number to calculate
 * @param {object} hours - Object containing { regular, overtime, pto, holiday } hours
 * @returns {object|null} The calculated period object, or null if invalid inputs
 */
export function calculatePayFromData(employeeId, periodNum, hours) {
    if (!employeeId || !periodNum) return null;

    const employeeIndex = appData.employees.findIndex(e => e.id === employeeId);
    if (employeeIndex === -1) return null;

    const periods = appData.payPeriods[employeeId];
    if (!periods) return null;

    const period = periods.find(p => p.period == periodNum);
    if (!period) return null;

    // Store the hours into the period
    period.hours = {
        regular: parseFloat(hours.regular) || 0,
        overtime: parseFloat(hours.overtime) || 0,
        pto: parseFloat(hours.pto) || 0,
        holiday: parseFloat(hours.holiday) || 0,
    };

    // Always recalculate from Period 1 so tax remainders and PTO are derived
    // from a clean state — a single-period recalc consumes its own previous
    // remainder output and drifts (audit F4).
    recalculateAllPeriodsForEmployee(employeeId);

    // Return the updated period for testing
    return appData.payPeriods[employeeId].find(p => p.period == periodNum);
}

/**
 * Calculates pay based on the hours in the UI and updates the appData object.
 * This function now uses a "running remainder" strategy for tax calculations.
 * If editing an earlier period, it will trigger sequential recalculation of all subsequent periods.
 * This is the UI wrapper that reads from DOM and calls the pure function.
 */
export function calculatePay() {
    const employeeId = document.getElementById('currentEmployee')?.value;
    const periodNum = parseInt(document.getElementById('currentPeriod')?.value);

    if (!employeeId || !periodNum) return;

    // Read hours from DOM
    const hours = {
        regular: parseFloat(document.getElementById('regularHours')?.value) || 0,
        overtime: parseFloat(document.getElementById('overtimeHours')?.value) || 0,
        pto: parseFloat(document.getElementById('ptoHours')?.value) || 0,
        holiday: parseFloat(document.getElementById('holidayHours')?.value) || 0,
    };

    // Call the pure function with DOM values
    return calculatePayFromData(employeeId, periodNum, hours);
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

// --- SETTINGS MANAGEMENT ---

/**
 * Updates the settings in the appData object from the UI form fields.
 */
export function updateSettingsFromUI() {
    // A transiently empty/invalid numeric field must never inject NaN into
    // saved settings — fall back to the current stored value (audit F5)
    const num = (v, fallback) => { const n = parseFloat(v); return isNaN(n) ? fallback : n; };
    const int = (v, fallback) => { const n = parseInt(v); return isNaN(n) ? fallback : n; };

    appData.settings.companyName = document.getElementById('companyName').value;
    appData.settings.taxYear = int(document.getElementById('taxYear').value, appData.settings.taxYear);
    appData.settings.payFrequency = document.getElementById('payFrequency').value;
    appData.settings.firstPayPeriodStartDate = document.getElementById('firstPayPeriodStartDate').value;
    appData.settings.daysUntilPayday = int(document.getElementById('daysUntilPayday').value, appData.settings.daysUntilPayday);
    appData.settings.companyAddress = document.getElementById('companyAddress').value;
    appData.settings.companyPhone = document.getElementById('companyPhone').value;
    appData.settings.socialSecurity = num(document.getElementById('socialSecurity').value, appData.settings.socialSecurity);
    appData.settings.medicare = num(document.getElementById('medicare').value, appData.settings.medicare);
    appData.settings.sutaRate = num(document.getElementById('sutaRate').value, appData.settings.sutaRate);
    appData.settings.futaRate = num(document.getElementById('futaRate').value, appData.settings.futaRate);
    appData.settings.ssWageBase = num(document.getElementById('ssWageBase').value, appData.settings.ssWageBase);
    appData.settings.futaWageBase = num(document.getElementById('futaWageBase').value, appData.settings.futaWageBase);
    appData.settings.sutaWageBase = num(document.getElementById('sutaWageBase').value, appData.settings.sutaWageBase);
    appData.settings.additionalMedicareThreshold = num(document.getElementById('additionalMedicareThreshold').value, appData.settings.additionalMedicareThreshold);
    appData.settings.additionalMedicareRate = num(document.getElementById('additionalMedicareRate').value, appData.settings.additionalMedicareRate);
    appData.settings.taxFrequencies.federal = document.getElementById('federalTaxFrequency').value;
    appData.settings.taxFrequencies.futa = document.getElementById('futaTaxFrequency').value;
    appData.settings.taxFrequencies.suta = document.getElementById('sutaTaxFrequency').value;
    appData.settings.taxFrequencies.state = document.getElementById('stateTaxFrequency').value;
    appData.settings.taxFrequencies.local = document.getElementById('localTaxFrequency').value;
    appData.settings.autoSubtraction = document.getElementById('autoSubtraction').checked;
    appData.settings.quarterlyEarningsTarget = parseFloat(document.getElementById('quarterlyEarningsTarget').value) || 0;
    appData.settings.minimumWeeklyHours = parseFloat(document.getElementById('minimumWeeklyHours').value) || 0;
}

// --- QUARTERLY EARNINGS TARGET ---

/**
 * Calculates quarterly earnings progress and recommended hours for an employee.
 * Uses today's date to determine the current quarter, then analyzes completed
 * and remaining pay periods to produce a recommended schedule.
 *
 * @param {string} employeeId - The employee ID
 * @param {Date} [today] - Override today's date (for testing)
 * @returns {object} Quarterly earnings status
 */
export function calculateQuarterlyEarningsStatus(employeeId, today) {
    if (!today) today = new Date();
    const employee = appData.employees.find(e => e.id === employeeId);
    const target = appData.settings.quarterlyEarningsTarget || 0;
    const minHours = appData.settings.minimumWeeklyHours || 0;

    // Get current quarter boundaries
    const qInfo = getQuarterForDate(today);
    const qStart = qInfo.start;
    const qEnd = qInfo.end;

    // Default empty response
    const emptyResult = {
        quarter: qInfo.quarter,
        quarterStart: qStart,
        quarterEnd: qEnd,
        target,
        completedPeriods: 0,
        totalPeriodsInQuarter: 0,
        remainingPeriods: 0,
        missedPeriods: 0,
        quarterGross: 0,
        quarterHours: 0,
        remaining: target,
        percentComplete: 0,
        targetMet: target === 0,
        targetReachable: target === 0,
        shortfall: target === 0 ? 0 : target,
        nextPeriodHours: 0,
        nextPeriodNumber: null,
        nextPeriodPayDate: '',
        schedule: [],
        projectedQuarterGross: 0,
        projectedQuarterHours: 0
    };

    if (!employee) return emptyResult;

    const rate = employee.rate || 0;
    const periods = appData.payPeriods[employeeId] || [];

    if (periods.length === 0) return emptyResult;

    // Target of 0 means feature is disabled
    if (target === 0) {
        return { ...emptyResult, targetMet: true, targetReachable: true, shortfall: 0 };
    }

    // Filter periods in this quarter by payDate
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const quarterPeriods = periods.filter(p => p.payDate >= qStart && p.payDate <= qEnd);

    if (quarterPeriods.length === 0) return emptyResult;

    // Sort by period number
    quarterPeriods.sort((a, b) => a.period - b.period);

    // Categorize periods
    const completed = [];
    const remaining = [];
    let missedCount = 0;

    for (const p of quarterPeriods) {
        const totalHours = p.hours ? Object.values(p.hours).reduce((a, b) => a + b, 0) : 0;
        if (p.grossPay > 0 || totalHours > 0) {
            completed.push(p);
        } else if (p.payDate >= todayStr) {
            remaining.push(p);
        } else {
            missedCount++;
        }
    }

    // Calculate progress
    let quarterGross = 0;
    let quarterHours = 0;
    for (const p of completed) {
        quarterGross += p.grossPay;
        if (p.hours) {
            quarterHours += Object.values(p.hours).reduce((a, b) => a + b, 0);
        }
    }

    const remainingDollars = Math.max(0, target - quarterGross);
    const percentComplete = target > 0 ? Math.round((quarterGross / target) * 1000) / 10 : 100;
    const targetMet = quarterGross >= target;

    // Build schedule for remaining periods
    const remainingCount = remaining.length;
    let schedule = [];
    let targetReachable = true;
    let shortfall = 0;

    if (targetMet) {
        // Target already met — schedule all remaining at minHours
        schedule = remaining.map(p => ({
            period: p.period,
            payDate: toDisplayDate(p.payDate),
            hours: minHours
        }));
    } else if (remainingCount === 0) {
        // No periods left
        targetReachable = false;
        shortfall = remainingDollars;
    } else if (rate === 0) {
        // Rate is 0 — can't earn anything
        targetReachable = false;
        shortfall = remainingDollars;
        schedule = remaining.map(p => ({
            period: p.period,
            payDate: toDisplayDate(p.payDate),
            hours: minHours
        }));
    } else {
        // Calculate hours needed
        const hoursNeeded = Math.ceil(remainingDollars / rate);
        const maxHoursPerPeriod = 40;
        const maxCapacity = remainingCount * maxHoursPerPeriod;

        if (hoursNeeded > maxCapacity) {
            targetReachable = false;
            shortfall = remainingDollars - (maxCapacity * rate);
            shortfall = Math.round(shortfall * 100) / 100;
            // Schedule all at max
            schedule = remaining.map(p => ({
                period: p.period,
                payDate: toDisplayDate(p.payDate),
                hours: maxHoursPerPeriod
            }));
        } else {
            // Front-loaded distribution
            // Start all at minHours, then distribute extras from front
            const hoursArr = new Array(remainingCount).fill(minHours);
            let extraHoursNeeded = hoursNeeded - (remainingCount * minHours);

            if (extraHoursNeeded > 0) {
                // Distribute +1 at a time from front, looping as needed
                let idx = 0;
                while (extraHoursNeeded > 0) {
                    if (hoursArr[idx] < maxHoursPerPeriod) {
                        hoursArr[idx]++;
                        extraHoursNeeded--;
                    }
                    idx++;
                    if (idx >= remainingCount) idx = 0;
                }
            }

            schedule = remaining.map((p, i) => ({
                period: p.period,
                payDate: toDisplayDate(p.payDate),
                hours: hoursArr[i]
            }));
        }
    }

    // Calculate projected totals
    const scheduledHours = schedule.reduce((sum, s) => sum + s.hours, 0);
    const projectedQuarterGross = Math.round((quarterGross + scheduledHours * rate) * 100) / 100;
    const projectedQuarterHours = quarterHours + scheduledHours;

    return {
        quarter: qInfo.quarter,
        quarterStart: qStart,
        quarterEnd: qEnd,
        target,
        completedPeriods: completed.length,
        totalPeriodsInQuarter: quarterPeriods.length,
        remainingPeriods: remainingCount,
        missedPeriods: missedCount,
        quarterGross: Math.round(quarterGross * 100) / 100,
        quarterHours,
        remaining: Math.round(remainingDollars * 100) / 100,
        percentComplete,
        targetMet,
        targetReachable,
        shortfall: Math.round(shortfall * 100) / 100,
        nextPeriodHours: schedule.length > 0 ? schedule[0].hours : 0,
        nextPeriodNumber: schedule.length > 0 ? schedule[0].period : null,
        nextPeriodPayDate: schedule.length > 0 ? schedule[0].payDate : '',
        schedule,
        projectedQuarterGross,
        projectedQuarterHours
    };
}
