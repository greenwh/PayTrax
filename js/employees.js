/*
  PayTrax Payroll Management
  Copyright (c) 2025 greenwh

  Developed by greenwh with substantial assistance from AI coding tools (Claude, ChatGPT, Gemini).
  This file is original work based on documentation and prompts by greenwh.
  Licensed under the MIT License.
*/
// js/employees.js - Employee management and deduction calculations

import { appData } from './state.js';
import { fromStorageDate } from './utils.js';
import { generateBasePayPeriods } from './logic.js';

// --- EMPLOYEE MANAGEMENT ---

/**
 * Reads data from the employee form and saves it to the appData state.
 * Now includes logic to handle the taxRemainders object.
 */
export function saveEmployeeFromForm() {
    const employeeId = document.getElementById('employeeId').value;
    const employeeData = {
        id: employeeId || (crypto.randomUUID?.() || 'emp_' + Date.now() + '_' + Math.random().toString(36).slice(2)),
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
        id: crypto.randomUUID?.() || 'ded_' + Date.now() + '_' + Math.random().toString(36).slice(2),
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
            const payDateObj = fromStorageDate(payDate);
            const createdDateObj = fromStorageDate(ded.createdDate);
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
