/*
  PayTrax Payroll Management
  Copyright (c) 2025 greenwh

  Developed by greenwh with substantial assistance from AI coding tools (Claude, ChatGPT, Gemini).
  This file is original work based on documentation and prompts by greenwh.
  Licensed under the MIT License.
*/
// js/undo.js - Undo support for destructive operations

import { showToast } from './toast.js';

/**
 * Creates a deep clone of the provided data for snapshotting.
 * @param {*} data - The data to snapshot
 * @returns {*} A deep clone of the data
 */
export function createSnapshot(data) {
    return JSON.parse(JSON.stringify(data));
}

/**
 * Pushes an undo opportunity: shows a persistent toast with an Undo action button.
 * If the user clicks Undo within 30 seconds, the restoreCallback is invoked with the snapshot.
 * @param {string} description - Human-readable description of what was done (e.g. "Deleted John Doe")
 * @param {*} snapshot - The data snapshot to restore
 * @param {Function} restoreCallback - Function called with (snapshot) to perform the undo
 */
export function pushUndo(description, snapshot, restoreCallback) {
    showToast(description, 'info', {
        duration: 30000,
        persistent: false,
        action: {
            label: 'Undo',
            callback: () => {
                restoreCallback(snapshot);
                showToast('Action undone successfully.', 'success');
            }
        }
    });
}
