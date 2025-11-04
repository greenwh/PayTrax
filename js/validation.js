/*
  PayTrax Payroll Management
  Copyright (c) 2025 greenwh

  Developed by greenwh with substantial assistance from AI coding tools (Claude, ChatGPT, Gemini).
  This file is original work based on documentation and prompts by greenwh.
  Licensed under the MIT License.
*/
// js/validation.js - Comprehensive validation module for PayTrax

/**
 * Validation error class for structured error handling
 */
export class ValidationError {
    constructor(field, message) {
        this.field = field;
        this.message = message;
    }
}

/**
 * Validates a numeric value within a range
 * @param {number} value - The value to validate
 * @param {string} fieldName - The name of the field being validated
 * @param {number} min - Minimum value (inclusive)
 * @param {number} max - Maximum value (inclusive)
 * @param {boolean} required - Whether the field is required
 * @returns {ValidationError|null} - ValidationError if invalid, null if valid
 */
export function validateNumber(value, fieldName, min = null, max = null, required = true) {
    if (required && (value === null || value === undefined || value === '')) {
        return new ValidationError(fieldName, `${fieldName} is required`);
    }

    if (value === '' || value === null || value === undefined) {
        return null; // Allow empty for non-required fields
    }

    const num = parseFloat(value);

    if (isNaN(num)) {
        return new ValidationError(fieldName, `${fieldName} must be a valid number`);
    }

    if (min !== null && num < min) {
        return new ValidationError(fieldName, `${fieldName} must be at least ${min}`);
    }

    if (max !== null && num > max) {
        return new ValidationError(fieldName, `${fieldName} must be at most ${max}`);
    }

    return null;
}

/**
 * Validates a string value
 * @param {string} value - The value to validate
 * @param {string} fieldName - The name of the field being validated
 * @param {number} minLength - Minimum length
 * @param {number} maxLength - Maximum length
 * @param {boolean} required - Whether the field is required
 * @returns {ValidationError|null} - ValidationError if invalid, null if valid
 */
export function validateString(value, fieldName, minLength = 0, maxLength = 255, required = true) {
    if (required && (!value || value.trim() === '')) {
        return new ValidationError(fieldName, `${fieldName} is required`);
    }

    if (!value) return null; // Allow empty for non-required fields

    const str = value.toString().trim();

    if (str.length < minLength) {
        return new ValidationError(fieldName, `${fieldName} must be at least ${minLength} characters`);
    }

    if (str.length > maxLength) {
        return new ValidationError(fieldName, `${fieldName} must be at most ${maxLength} characters`);
    }

    return null;
}

/**
 * Validates a date string
 * @param {string} value - The date string to validate (YYYY-MM-DD format)
 * @param {string} fieldName - The name of the field being validated
 * @param {boolean} required - Whether the field is required
 * @param {Date} minDate - Minimum date (optional)
 * @param {Date} maxDate - Maximum date (optional)
 * @returns {ValidationError|null} - ValidationError if invalid, null if valid
 */
export function validateDate(value, fieldName, required = true, minDate = null, maxDate = null) {
    if (required && (!value || value.trim() === '')) {
        return new ValidationError(fieldName, `${fieldName} is required`);
    }

    if (!value) return null; // Allow empty for non-required fields

    const date = new Date(value + 'T00:00:00');

    if (isNaN(date.getTime())) {
        return new ValidationError(fieldName, `${fieldName} must be a valid date`);
    }

    if (minDate && date < minDate) {
        return new ValidationError(fieldName, `${fieldName} must be on or after ${minDate.toLocaleDateString()}`);
    }

    if (maxDate && date > maxDate) {
        return new ValidationError(fieldName, `${fieldName} must be on or before ${maxDate.toLocaleDateString()}`);
    }

    return null;
}

/**
 * Validates employee data from form
 * @param {object} employeeData - The employee data to validate
 * @returns {ValidationError[]} - Array of validation errors (empty if valid)
 */
export function validateEmployee(employeeData) {
    const errors = [];

    // Name is required
    const nameError = validateString(employeeData.name, 'Employee Name', 1, 100, true);
    if (nameError) errors.push(nameError);

    // Hourly rate must be positive
    const rateError = validateNumber(employeeData.rate, 'Hourly Rate', 0.01, 10000, true);
    if (rateError) errors.push(rateError);

    // Overtime multiplier must be >= 1
    const otError = validateNumber(employeeData.overtimeMultiplier, 'Overtime Multiplier', 1, 10, true);
    if (otError) errors.push(otError);

    // Holiday multiplier must be >= 1
    const holidayError = validateNumber(employeeData.holidayMultiplier, 'Holiday Multiplier', 1, 10, true);
    if (holidayError) errors.push(holidayError);

    // Tax rates must be between 0 and reasonable maximums
    const fedTaxError = validateNumber(employeeData.fedTaxRate, 'Federal Tax Rate', 0, 50, false);
    if (fedTaxError) errors.push(fedTaxError);

    const stateTaxError = validateNumber(employeeData.stateTaxRate, 'State Tax Rate', 0, 15, false);
    if (stateTaxError) errors.push(stateTaxError);

    const localTaxError = validateNumber(employeeData.localTaxRate, 'Local Tax Rate', 0, 10, false);
    if (localTaxError) errors.push(localTaxError);

    // PTO values must be non-negative
    const ptoAccrualError = validateNumber(employeeData.ptoAccrualRate, 'PTO Accrual Rate', 0, 500, false);
    if (ptoAccrualError) errors.push(ptoAccrualError);

    const ptoBalanceError = validateNumber(employeeData.ptoBalance, 'PTO Balance', 0, 1000, false);
    if (ptoBalanceError) errors.push(ptoBalanceError);

    return errors;
}

/**
 * Validates hours input for a pay period
 * @param {object} hours - Object with regular, overtime, pto, holiday hours
 * @returns {ValidationError[]} - Array of validation errors (empty if valid)
 */
export function validateHours(hours) {
    const errors = [];

    const regularError = validateNumber(hours.regular, 'Regular Hours', 0, 168, false);
    if (regularError) errors.push(regularError);

    const overtimeError = validateNumber(hours.overtime, 'Overtime Hours', 0, 168, false);
    if (overtimeError) errors.push(overtimeError);

    const ptoError = validateNumber(hours.pto, 'PTO Hours', 0, 168, false);
    if (ptoError) errors.push(ptoError);

    const holidayError = validateNumber(hours.holiday, 'Holiday Hours', 0, 168, false);
    if (holidayError) errors.push(holidayError);

    // Total hours should not exceed 168 (hours in a week) for typical periods
    const totalHours = (hours.regular || 0) + (hours.overtime || 0) + (hours.pto || 0) + (hours.holiday || 0);
    if (totalHours > 168) {
        errors.push(new ValidationError('Total Hours', 'Total hours cannot exceed 168 per pay period (1 week). Please verify your entries.'));
    }

    return errors;
}

/**
 * Validates company settings data
 * @param {object} settings - The settings data to validate
 * @returns {ValidationError[]} - Array of validation errors (empty if valid)
 */
export function validateSettings(settings) {
    const errors = [];

    // Company name is required
    const nameError = validateString(settings.companyName, 'Company Name', 1, 100, true);
    if (nameError) errors.push(nameError);

    // Tax year must be reasonable
    const yearError = validateNumber(settings.taxYear, 'Tax Year', 2000, 2100, true);
    if (yearError) errors.push(yearError);

    // First pay period start date is required
    const dateError = validateDate(settings.firstPayPeriodStartDate, 'First Pay Period Start Date', true);
    if (dateError) errors.push(dateError);

    // Days until payday must be reasonable
    const daysError = validateNumber(settings.daysUntilPayday, 'Days Until Payday', 0, 30, true);
    if (daysError) errors.push(daysError);

    // Tax rates must be reasonable
    const ssError = validateNumber(settings.socialSecurity, 'Social Security Rate', 0, 10, true);
    if (ssError) errors.push(ssError);

    const medicareError = validateNumber(settings.medicare, 'Medicare Rate', 0, 5, true);
    if (medicareError) errors.push(medicareError);

    const sutaError = validateNumber(settings.sutaRate, 'SUTA Rate', 0, 15, true);
    if (sutaError) errors.push(sutaError);

    const futaError = validateNumber(settings.futaRate, 'FUTA Rate', 0, 5, true);
    if (futaError) errors.push(futaError);

    // Wage bases must be positive
    const ssWageBaseError = validateNumber(settings.ssWageBase, 'SS Wage Base', 1, 10000000, true);
    if (ssWageBaseError) errors.push(ssWageBaseError);

    const futaWageBaseError = validateNumber(settings.futaWageBase, 'FUTA Wage Base', 1, 100000, true);
    if (futaWageBaseError) errors.push(futaWageBaseError);

    const addMedicareThresholdError = validateNumber(settings.additionalMedicareThreshold, 'Additional Medicare Threshold', 1, 10000000, true);
    if (addMedicareThresholdError) errors.push(addMedicareThresholdError);

    const addMedicareRateError = validateNumber(settings.additionalMedicareRate, 'Additional Medicare Rate', 0, 5, true);
    if (addMedicareRateError) errors.push(addMedicareRateError);

    return errors;
}

/**
 * Validates a bank transaction
 * @param {object} transaction - The transaction data to validate
 * @returns {ValidationError[]} - Array of validation errors (empty if valid)
 */
export function validateTransaction(transaction) {
    const errors = [];

    // Date is required
    const dateError = validateDate(transaction.date, 'Transaction Date', true);
    if (dateError) errors.push(dateError);

    // Description is required
    const descError = validateString(transaction.description, 'Description', 1, 255, true);
    if (descError) errors.push(descError);

    // Amount must be positive
    const amountError = validateNumber(transaction.amount, 'Amount', 0.01, 10000000, true);
    if (amountError) errors.push(amountError);

    return errors;
}

/**
 * Validates a deduction
 * @param {object} deduction - The deduction data to validate
 * @returns {ValidationError[]} - Array of validation errors (empty if valid)
 */
export function validateDeduction(deduction) {
    const errors = [];

    // Name is required
    const nameError = validateString(deduction.name, 'Deduction Name', 1, 100, true);
    if (nameError) errors.push(nameError);

    // Amount must be positive
    const amountError = validateNumber(deduction.amount, 'Deduction Amount', 0.01, 100000, true);
    if (amountError) errors.push(amountError);

    // Type must be valid
    if (!deduction.type || (deduction.type !== 'fixed' && deduction.type !== 'percent')) {
        errors.push(new ValidationError('Deduction Type', 'Deduction type must be either "fixed" or "percent"'));
    }

    // If percent, amount should be <= 100
    if (deduction.type === 'percent') {
        const percentError = validateNumber(deduction.amount, 'Deduction Percentage', 0.01, 100, true);
        if (percentError) errors.push(percentError);
    }

    return errors;
}

/**
 * Displays validation errors to the user
 * @param {ValidationError[]} errors - Array of validation errors
 * @param {string} elementId - ID of element to display errors in (optional)
 * @returns {boolean} - True if there were errors, false otherwise
 */
export function displayValidationErrors(errors, elementId = null) {
    if (errors.length === 0) return false;

    const errorMessages = errors.map(e => `• ${e.message}`).join('\n');

    if (elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = `<div class="alert alert-danger"><strong>Validation Errors:</strong><br>${errorMessages.replace(/\n/g, '<br>')}</div>`;
            element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    } else {
        alert('Please correct the following errors:\n\n' + errorMessages);
    }

    return true;
}
