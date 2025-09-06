/*
  PayTrax Payroll Management
  Copyright (c) 2025 greenwh. All Rights Reserved.

  This software is the proprietary property of greenwh.
  You may not copy, modify, distribute, or sell this software without explicit
  written permission from the copyright holder.

  Developed by greenwh with substantial assistance from AI coding tools.
*/
// js/db.js

const DB_NAME = 'PayTraxDB';
const STORE_NAME = 'appDataStore';
const DB_VERSION = 1;
let db = null;

/**
 * Initializes the IndexedDB database. Creates the object store if needed.
 * @returns {Promise<IDBDatabase>} A promise that resolves with the database object or rejects on error.
 */
export function initDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            return resolve(db);
        }

        if (!('indexedDB' in window)) {
            console.warn('IndexedDB not supported by this browser.');
            return reject(new Error('IndexedDB not supported.'));
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('Database error:', event.target.error);
            reject(event.target.error);
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const tempDb = event.target.result;
            if (!tempDb.objectStoreNames.contains(STORE_NAME)) {
                tempDb.createObjectStore(STORE_NAME);
            }
        };
    });
}

/**
 * Saves the entire application state object to IndexedDB.
 * @param {object} data The application data object to save.
 * @returns {Promise<void>} A promise that resolves when the save is complete.
 */
export function saveDataToDB(data) {
    return new Promise((resolve, reject) => {
        if (!db) {
            return reject(new Error('Database is not initialized.'));
        }
        // Use a single, constant key to store the entire state as one object.
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(data, 'appState');

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = (event) => {
            console.error('Error saving data to IndexedDB:', event.target.error);
            reject(event.target.error);
        };
    });
}

/**
 * Loads the application state object from IndexedDB.
 * @returns {Promise<object|null>} A promise that resolves with the data object or null if not found.
 */
export function loadDataFromDB() {
    return new Promise((resolve, reject) => {
        if (!db) {
            return reject(new Error('Database is not initialized.'));
        }

        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get('appState');

        request.onsuccess = (event) => {
            resolve(event.target.result || null); // Return the data or null
        };

        request.onerror = (event) => {
            console.error('Error loading data from IndexedDB:', event.target.error);
            reject(event.target.error);
        };
    });
}