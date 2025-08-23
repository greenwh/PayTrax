// js/state.js
import * as db from './db.js';

// --- CONFIGURATION & DEFAULT STATE ---

// Constants for tax calculations
export const SS_WAGE_BASE = 168600;
export const FUTA_WAGE_BASE = 7000;
let dbInitialized = false;

// Default structure for the application data
export const defaultAppData = {
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
        taxFrequencies: {
            federal: 'monthly',
            futa: 'quarterly',
            suta: 'quarterly',
            state: 'monthly',
            local: 'monthly'
        }
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
 * Saves the current appData object to the best available persistence layer.
 * It will try IndexedDB first, then fall back to localStorage.
 */
export async function saveData() {
    try {
        if (dbInitialized) {
            await db.saveDataToDB(appData);
        } else {
            localStorage.setItem('PayTraxData', JSON.stringify(appData));
        }
    } catch (error) {
        console.error("Failed to save data:", error);
        // Fallback to localStorage just in case DB save fails after initialization
        try {
            localStorage.setItem('PayTraxData', JSON.stringify(appData));
        } catch (lsError) {
            console.error("Failed to save data to localStorage as a fallback:", lsError);
        }
    }
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
    
    // Gracefully add new settings properties if importing older data structures
    if (!appData.settings.taxFrequencies) {
        appData.settings.taxFrequencies = defaultAppData.settings.taxFrequencies;
    }
    if (!appData.settings.firstPayPeriodStartDate) {
        appData.settings.firstPayPeriodStartDate = '';
    }
    if (appData.settings.daysUntilPayday === undefined) {
        appData.settings.daysUntilPayday = 5;
    }
}