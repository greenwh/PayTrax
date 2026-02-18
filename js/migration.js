/*
  PayTrax Payroll Management
  Copyright (c) 2025 greenwh

  Developed by greenwh with substantial assistance from AI coding tools (Claude, ChatGPT, Gemini).
  This file is original work based on documentation and prompts by greenwh.
  Licensed under the MIT License.
*/
import { CURRENT_VERSION } from './state.js';

/**
 * Migrates a data object to a new version by adding a new setting with a default value.
 * This function demonstrates how to handle data structure changes.
 * @param {object} data - The application data object to migrate.
 */
function migrateToV2(data) {
    console.log("Running migration to v2...");
    // Example Change 1: Add a prefix for new employee IDs.
    if (data.settings.employeeIdPrefix === undefined) {
        data.settings.employeeIdPrefix = 'emp_';
    }
    // Example Change 2: Add a setting for PTO carry-over limits.
    if (data.settings.ptoCarryOverLimit === undefined) {
        data.settings.ptoCarryOverLimit = 40;
    }
    data.version = 2; // IMPORTANT: Stamp the data with its new version.
}

/**
 * Migrates data to v3 by adding the taxRemainders object to each employee.
 * This ensures that older backup files are compatible with the new fractional cent tracking system.
 * @param {object} data - The application data object to migrate.
 */
function migrateToV3(data) {
    console.log("Running migration to v3...");
    if (data.employees && Array.isArray(data.employees)) {
        data.employees.forEach(emp => {
            // Check if the property already exists to avoid overwriting it
            if (emp.taxRemainders === undefined) {
                emp.taxRemainders = { 
                    federal: 0, 
                    fica: 0, 
                    medicare: 0, 
                    state: 0, 
                    local: 0, 
                    suta: 0, 
                    futa: 0 
                };
            }
        });
    }
    data.version = 3; // IMPORTANT: Stamp the data with its new version.
}

/**
 * Migrates data to v4 by adding the 'reconciled' property to each bank transaction.
 * @param {object} data - The application data object to migrate.
 */
function migrateToV4(data) {
    console.log("Running migration to v4...");
    if (data.bankRegister && Array.isArray(data.bankRegister)) {
        data.bankRegister.forEach(t => {
            if (t.reconciled === undefined) {
                t.reconciled = false;
            }
        });
    }
    data.version = 4; // IMPORTANT: Stamp the data with its new version.
}

/**
 * Migrates data to v5 by adding deductions array to employees and configurable tax settings.
 * @param {object} data - The application data object to migrate.
 */
function migrateToV5(data) {
    console.log("Running migration to v5...");

    // Add deductions array to each employee
    if (data.employees && Array.isArray(data.employees)) {
        data.employees.forEach(emp => {
            if (emp.deductions === undefined) {
                emp.deductions = [];
            }
        });
    }

    // Add configurable tax settings
    if (data.settings) {
        if (data.settings.ssWageBase === undefined) {
            data.settings.ssWageBase = 168600;
        }
        if (data.settings.futaWageBase === undefined) {
            data.settings.futaWageBase = 7000;
        }
        if (data.settings.additionalMedicareThreshold === undefined) {
            data.settings.additionalMedicareThreshold = 200000;
        }
        if (data.settings.additionalMedicareRate === undefined) {
            data.settings.additionalMedicareRate = 0.9;
        }
    }

    data.version = 5; // IMPORTANT: Stamp the data with its new version.
}

/**
 * Migrates from version 5 to version 6.
 * - Adds createdDate to existing deductions (set to very old date for backward compatibility)
 * @param {object} data - The application data object to migrate.
 */
function migrateToV6(data) {
    // Add createdDate to all existing deductions
    if (data.employees && data.employees.length > 0) {
        data.employees.forEach(employee => {
            if (employee.deductions && employee.deductions.length > 0) {
                employee.deductions.forEach(deduction => {
                    // If deduction doesn't have createdDate, set to old date
                    // This ensures existing deductions apply to all past pay periods
                    if (!deduction.createdDate) {
                        deduction.createdDate = '2000-01-01'; // Very old date ensures it applies to all periods
                    }
                });
            }
        });
    }

    data.version = 6; // IMPORTANT: Stamp the data with its new version.
}

/**
 * Migrates from version 6 to version 7.
 * - Adds autoSubtraction setting (defaults to true for existing behavior)
 * @param {object} data - The application data object to migrate.
 */
function migrateToV7(data) {
    console.log("Running migration to v7...");

    // Add autoSubtraction setting
    if (data.settings && data.settings.autoSubtraction === undefined) {
        data.settings.autoSubtraction = true;
    }

    data.version = 7; // IMPORTANT: Stamp the data with its new version.
}

/**
 * Migrates from version 7 to version 8.
 * - Adds sutaWageBase setting (Oklahoma SUTA taxable wage base, default $25,000)
 * @param {object} data - The application data object to migrate.
 */
function migrateToV8(data) {
    console.log("Running migration to v8...");

    if (data.settings && data.settings.sutaWageBase === undefined) {
        data.settings.sutaWageBase = 25000;
    }

    data.version = 8; // IMPORTANT: Stamp the data with its new version.
}

/**
 * Migrates from version 8 to version 9.
 * - Converts all date strings from M/D/YYYY or MM/DD/YYYY to YYYY-MM-DD storage format
 * - Pay period dates: startDate, endDate, payDate
 * - Bank register dates: date
 * - Deduction createdDate: already YYYY-MM-DD, no change needed
 * @param {object} data - The application data object to migrate.
 */
function migrateToV9(data) {
    console.log("Running migration to v9...");

    /**
     * Converts a legacy M/D/YYYY or MM/DD/YYYY string to YYYY-MM-DD.
     * Returns the string as-is if already in YYYY-MM-DD format or unrecognized.
     */
    function convertDate(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return dateStr;
        // Already YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
        // M/D/YYYY or MM/DD/YYYY
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            const month = parts[0].padStart(2, '0');
            const day = parts[1].padStart(2, '0');
            const year = parts[2];
            return `${year}-${month}-${day}`;
        }
        return dateStr;
    }

    // Convert pay period dates
    if (data.payPeriods && typeof data.payPeriods === 'object') {
        for (const employeeId of Object.keys(data.payPeriods)) {
            const periods = data.payPeriods[employeeId];
            if (Array.isArray(periods)) {
                periods.forEach(period => {
                    if (period.startDate) period.startDate = convertDate(period.startDate);
                    if (period.endDate) period.endDate = convertDate(period.endDate);
                    if (period.payDate) period.payDate = convertDate(period.payDate);
                });
            }
        }
    }

    // Convert bank register dates
    if (data.bankRegister && Array.isArray(data.bankRegister)) {
        data.bankRegister.forEach(transaction => {
            if (transaction.date) transaction.date = convertDate(transaction.date);
        });
    }

    data.version = 9; // IMPORTANT: Stamp the data with its new version.
}

/**
 * Sequentially runs all necessary migration scripts on a data object.
 * @param {object} data - The application data object, potentially from an old version.
 * @returns {object} The fully migrated data object.
 */
export function migrateData(data) {
    const importVersion = data.version || 1; // Un-versioned data is considered version 1.

    // The switch statement allows for sequential migrations.
    // An old v1 file will pass through all subsequent cases.
    switch (importVersion) {
        case 1:
            migrateToV2(data);
            // Fall-through is intentional
        case 2:
            migrateToV3(data);
            // Fall-through is intentional
        case 3:
            migrateToV4(data);
            // Fall-through is intentional
        case 4:
            migrateToV5(data);
            // Fall-through is intentional
        case 5:
            migrateToV6(data);
            // Fall-through is intentional
        case 6:
            migrateToV7(data);
            // Fall-through is intentional
        case 7:
            migrateToV8(data);
            // Fall-through is intentional
        case 8:
            migrateToV9(data);
            // Fall-through is intentional for future migrations
            break;
    }

    // Final check to ensure it's at the current version
    if (data.version !== CURRENT_VERSION) {
        console.error(`Migration failed. Expected version ${CURRENT_VERSION}, but got ${data.version}.`);
    }

    return data;
}