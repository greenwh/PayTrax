/*
  PayTrax Payroll Management
  Copyright (c) 2025 greenwh

  Developed by greenwh with substantial assistance from AI coding tools (Claude, ChatGPT, Gemini).
  This file is original work based on documentation and prompts by greenwh.
  Licensed under the MIT License.
*/
// js/data-io.js

import { appData, saveData, replaceState, CURRENT_VERSION } from './state.js';
import { migrateData } from './migration.js';

/**
 * Handles the process of importing data from a user-selected JSON file.
 * Now includes version checking and data migration.
 */
export function importData() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                let importedData = JSON.parse(e.target.result);

                if (!importedData.settings || !importedData.employees) {
                    throw new Error('Invalid or corrupted data file.');
                }

                const importVersion = importedData.version || 1; // Default to 1 if no version exists

                if (importVersion > CURRENT_VERSION) {
                    throw new Error(`Import failed. The data file is from a newer version (v${importVersion}) of PayTrax. Please update this application.`);
                }

                let message = 'Data imported successfully!';
                if (importVersion < CURRENT_VERSION) {
                    console.log(`Old data format (v${importVersion}) detected. Migrating to v${CURRENT_VERSION}...`);
                    importedData = migrateData(importedData);
                    message = 'Backup from a previous version was successfully updated and imported!';
                }

                replaceState(importedData);
                await saveData(); 

                alert(message + ' The application will now reload.');
                window.location.reload();

            } catch (error) {
                console.error("Failed to import data:", error);
                alert(`Error importing data: ${error.message}`);
            }
        };
        
        reader.onerror = () => {
             alert('Error reading the selected file.');
        };

        reader.readAsText(file);
    });

    fileInput.click();
}

/**
 * Exports the current application data to a JSON file and triggers a download.
 */
export function exportData() {
    try {
        appData.version = CURRENT_VERSION;
        // Create a formatted JSON string from the application data
        const dataStr = JSON.stringify(appData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);

        // Create a temporary link to trigger the download
        const link = document.createElement('a');
        link.href = url;
        const date = new Date().toISOString().slice(0, 10);
        link.download = `PayTrax_Backup_${date}.json`;

        // Append to body, click, and remove
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up the object URL
        URL.revokeObjectURL(url);

    } catch (error) {
        console.error("Failed to export data:", error);
        alert('An error occurred while exporting your data.');
    }
}