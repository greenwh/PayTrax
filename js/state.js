/*
  PayTrax Payroll Management
  Copyright (c) 2025 greenwh

  Developed by greenwh with substantial assistance from AI coding tools (Claude, ChatGPT, Gemini).
  This file is original work based on documentation and prompts by greenwh.
  Licensed under the MIT License.
*/
// js/state.js
import * as db from './db.js';

// --- CONFIGURATION & DEFAULT STATE ---

export const CURRENT_VERSION = 8; // Incremented from 7 to 8

// Constants used ONLY for defaultAppData initialization below.
// All runtime code should read from appData.settings (the single source of truth).
export const SS_WAGE_BASE = 184500;
export const FUTA_WAGE_BASE = 7000;
export const SUTA_WAGE_BASE = 25000;
let dbInitialized = false;
let _saveTimer = null;
let _dirty = false;

// Default structure for the application data
export const defaultAppData = {
    version: CURRENT_VERSION,
    settings: {
        companyName: 'Your Company LLC',
        taxYear: new Date().getFullYear(),
        payFrequency: 'weekly',
        firstPayPeriodStartDate: '',
        daysUntilPayday: 5,
        companyAddress: '',
        companyPhone: '',
        socialSecurity: 6.2,
        medicare: 1.45,
        sutaRate: 2.7,
        futaRate: 0.6,
        ssWageBase: 184500,
        futaWageBase: 7000,
        sutaWageBase: 25000,
        additionalMedicareThreshold: 200000,
        additionalMedicareRate: 0.9,
        taxFrequencies: {
            federal: 'monthly',
            futa: 'quarterly',
            suta: 'quarterly',
            state: 'monthly',
            local: 'monthly'
        },
        autoSubtraction: true
    },
    employees: [],
    payPeriods: {},
    bankRegister: []
};


// --- APPLICATION STATE ---

// The main, mutable state object for the entire application
export let appData = {};


// --- DATA PERSISTENCE ---

/**
 * Persists appData to the best available storage layer.
 * @returns {Promise<void>}
 */
async function _persistData() {
    try {
        if (dbInitialized) {
            await db.saveDataToDB(appData);
        } else {
            localStorage.setItem('PayTraxData', JSON.stringify(appData));
        }
        _dirty = false;
    } catch (error) {
        console.error("Failed to save data:", error);
        // Fallback to localStorage just in case DB save fails after initialization
        try {
            localStorage.setItem('PayTraxData', JSON.stringify(appData));
            _dirty = false;
        } catch (lsError) {
            console.error("Failed to save data to localStorage as a fallback:", lsError);
            _showSaveWarning();
        }
    }
}

/**
 * Shows a non-blocking save warning to the user.
 */
function _showSaveWarning() {
    let warning = document.getElementById('save-warning');
    if (!warning) {
        warning = document.createElement('div');
        warning.id = 'save-warning';
        warning.style.cssText = 'position:fixed;top:10px;right:10px;background:#dc3545;color:#fff;padding:12px 20px;border-radius:6px;z-index:10000;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
        warning.textContent = 'Warning: Data may not have saved. Please export a backup.';
        document.body.appendChild(warning);
        setTimeout(() => warning.remove(), 10000);
    }
}

/**
 * Debounced save — coalesces rapid save calls (e.g. hour input changes).
 * Use for non-critical operations where a 300ms delay is acceptable.
 */
export function saveData() {
    _dirty = true;
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
        _saveTimer = null;
        _persistData();
    }, 300);
}

/**
 * Immediate save — bypasses debounce and returns a Promise.
 * Use for critical operations: employee delete/add, settings changes, purge, import.
 * @returns {Promise<void>}
 */
export async function saveDataImmediate() {
    if (_saveTimer) {
        clearTimeout(_saveTimer);
        _saveTimer = null;
    }
    _dirty = true;
    await _persistData();
}

/**
 * Returns whether there are unsaved changes.
 * @returns {boolean}
 */
export function isDirty() {
    return _dirty;
}

/**
 * Loads data into the appData object from the best available persistence layer.
 * Prioritizes IndexedDB and falls back to localStorage.
 * Also handles migrating data from localStorage to IndexedDB if necessary.
 */
export async function loadData() {
    try {
        await db.initDB();
        dbInitialized = true;
        console.log("IndexedDB initialized successfully.");
    } catch (error) {
        dbInitialized = false;
        console.warn("Could not initialize IndexedDB. Falling back to localStorage.", error);
    }

    let loadedData = null;

    if (dbInitialized) {
        loadedData = await db.loadDataFromDB();
    }

    // If no data in IndexedDB, try to load from localStorage (fallback/migration)
    if (!loadedData) {
        const savedData = localStorage.getItem('PayTraxData');
        if (savedData) {
            console.log("Found data in localStorage. Attempting to migrate to IndexedDB.");
            loadedData = JSON.parse(savedData);
            // If DB is initialized, save the migrated data for future use.
            if (dbInitialized) {
                await db.saveDataToDB(loadedData);
            }
        }
    }

    if (loadedData) {
        // Validate structural integrity
        if (!loadedData.settings || typeof loadedData.settings !== 'object') {
            console.error('Loaded data has invalid settings structure. Using defaults.');
            loadedData.settings = JSON.parse(JSON.stringify(defaultAppData.settings));
        }
        if (!Array.isArray(loadedData.employees)) {
            console.error('Loaded data has invalid employees structure. Using empty array.');
            loadedData.employees = [];
        }
        if (!loadedData.payPeriods || typeof loadedData.payPeriods !== 'object') {
            console.error('Loaded data has invalid payPeriods structure. Using empty object.');
            loadedData.payPeriods = {};
        }
        if (!Array.isArray(loadedData.bankRegister)) {
            console.error('Loaded data has invalid bankRegister structure. Using empty array.');
            loadedData.bankRegister = [];
        }

        appData = loadedData;
        // Gracefully add new settings properties if loading older data structures
        if (!appData.settings.taxFrequencies) {
            appData.settings.taxFrequencies = defaultAppData.settings.taxFrequencies;
        }
        if (!appData.settings.firstPayPeriodStartDate) {
            appData.settings.firstPayPeriodStartDate = '';
        }
        if (appData.settings.daysUntilPayday === undefined) {
            appData.settings.daysUntilPayday = 5;
        }
        // Add v5 settings for backward compatibility
        if (appData.settings.ssWageBase === undefined) {
            appData.settings.ssWageBase = defaultAppData.settings.ssWageBase;
        }
        if (appData.settings.futaWageBase === undefined) {
            appData.settings.futaWageBase = defaultAppData.settings.futaWageBase;
        }
        if (appData.settings.sutaWageBase === undefined) {
            appData.settings.sutaWageBase = defaultAppData.settings.sutaWageBase;
        }
        if (appData.settings.additionalMedicareThreshold === undefined) {
            appData.settings.additionalMedicareThreshold = defaultAppData.settings.additionalMedicareThreshold;
        }
        if (appData.settings.additionalMedicareRate === undefined) {
            appData.settings.additionalMedicareRate = defaultAppData.settings.additionalMedicareRate;
        }
        // Gracefully handle the 'reconciled' property for data loaded from browser storage
        if (appData.bankRegister && Array.isArray(appData.bankRegister)) {
            appData.bankRegister.forEach(t => {
                if (t.reconciled === undefined) {
                    t.reconciled = false;
                }
            });
        }
        // Gracefully handle the 'deductions' property for employees
        if (appData.employees && Array.isArray(appData.employees)) {
            appData.employees.forEach(emp => {
                if (emp.deductions === undefined) {
                    emp.deductions = [];
                }
            });
        }
        // Add autoSubtraction setting for backward compatibility (v7)
        if (appData.settings.autoSubtraction === undefined) {
            appData.settings.autoSubtraction = true;
        }
    } else {
        // Use a deep copy of the default data if nothing is found anywhere
        appData = JSON.parse(JSON.stringify(defaultAppData));
    }
}

/**
 * Replaces the entire application state with new data, typically from an import.
 * Includes data migration logic to handle older data structures gracefully.
 * @param {object} newData - The new application data object to install.
 */
export function replaceState(newData) {
    appData = newData;
    
    // Ensure the version is set, defaulting to 1 for older data.
    if (!appData.version) {
        appData.version = 1;
    }
}