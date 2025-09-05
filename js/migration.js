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
        // case 2:
        //     migrateToV3(data); // Add future migrations here
        //     break; 
        // ...and so on.
    }

    // Final check to ensure it's at the current version
    if (data.version !== CURRENT_VERSION) {
        console.error(`Migration failed. Expected version ${CURRENT_VERSION}, but got ${data.version}.`);
    }

    return data;
}