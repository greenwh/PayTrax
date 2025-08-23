// js/data-io.js

import { appData, saveData, replaceState } from './state.js';

/**
 * Handles the process of importing data from a user-selected JSON file.
 */
export function importData() {
    // Create a temporary file input element
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';

    // Listen for the file selection
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            return; // User cancelled the dialog
        }

        const reader = new FileReader();
        reader.onload = async (e) => { // Make the handler async
            try {
                const importedData = JSON.parse(e.target.result);

                // Basic validation to ensure it's a valid data file
                if (!importedData.settings || !importedData.employees || !importedData.payPeriods) {
                    throw new Error('Invalid or corrupted data file.');
                }

                // Replace the current application state with the imported data
                replaceState(importedData);
                await saveData(); // Await persisting the new state

                alert('Data imported successfully! The application will now reload.');
                window.location.reload(); // Reload to apply the new state everywhere

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

    // Programmatically click the input to open the file dialog
    fileInput.click();
}

/**
 * Exports the current application data to a JSON file and triggers a download.
 */
export function exportData() {
    try {
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