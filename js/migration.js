/*
  PayTrax Payroll Management
  Copyright (c) 2025 greenwh

  Developed by greenwh with substantial assistance from AI coding tools (Claude, ChatGPT, Gemini 2.5 Pro).
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
            migrateToV4(data); // New case for version 4 migration
            // Fall-through is intentional for future migrations
            break; 
        // case 4:
        //     migrateToV5(data); // Add future migrations here
        //     break; 
        // ...and so on.
    }

    // Final check to ensure it's at the current version
    if (data.version !== CURRENT_VERSION) {
        console.error(`Migration failed. Expected version ${CURRENT_VERSION}, but got ${data.version}.`);
    }

    return data;
}