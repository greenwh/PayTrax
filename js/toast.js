/*
  PayTrax Payroll Management
  Copyright (c) 2025 greenwh

  Developed by greenwh with substantial assistance from AI coding tools (Claude, ChatGPT, Gemini).
  This file is original work based on documentation and prompts by greenwh.
  Licensed under the MIT License.
*/
// js/toast.js - Toast notification system

let _container = null;
let _toastId = 0;

/**
 * Lazily creates and returns the toast container element.
 * @returns {HTMLElement}
 */
function getContainer() {
    if (!_container || !_container.parentNode) {
        _container = document.createElement('div');
        _container.id = 'toast-container';
        document.body.appendChild(_container);
    }
    return _container;
}

/**
 * Shows a toast notification.
 * @param {string} message - The message to display
 * @param {'success'|'error'|'warning'|'info'} type - The toast type
 * @param {object} [options] - Additional options
 * @param {number} [options.duration=5000] - Auto-dismiss duration in ms
 * @param {{ label: string, callback: Function }} [options.action] - Optional action button
 * @param {boolean} [options.persistent=false] - If true, ignores duration (manual dismiss only)
 * @returns {{ id: number, dismiss: Function }}
 */
export function showToast(message, type = 'info', options = {}) {
    const { duration = 5000, action = null, persistent = false } = options;
    const container = getContainer();
    const id = ++_toastId;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.dataset.toastId = id;

    // Icon map
    const icons = { success: '\u2713', error: '\u2717', warning: '\u26A0', info: '\u2139' };

    // Build toast content
    const iconSpan = document.createElement('span');
    iconSpan.className = 'toast-icon';
    iconSpan.textContent = icons[type] || icons.info;

    const messageSpan = document.createElement('span');
    messageSpan.className = 'toast-message';
    messageSpan.textContent = message;

    const actionsDiv = document.createElement('span');
    actionsDiv.className = 'toast-actions';

    if (action) {
        const actionBtn = document.createElement('button');
        actionBtn.className = 'toast-action-btn';
        actionBtn.textContent = action.label;
        actionBtn.addEventListener('click', () => {
            action.callback();
            dismiss();
        });
        actionsDiv.appendChild(actionBtn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close-btn';
    closeBtn.textContent = '\u00D7';
    closeBtn.addEventListener('click', dismiss);
    actionsDiv.appendChild(closeBtn);

    toast.appendChild(iconSpan);
    toast.appendChild(messageSpan);
    toast.appendChild(actionsDiv);

    // Progress bar for auto-dismiss
    let timerId = null;
    if (!persistent && duration > 0) {
        const progress = document.createElement('div');
        progress.className = 'toast-progress';
        const progressBar = document.createElement('div');
        progressBar.className = 'toast-progress-bar';
        progressBar.style.animationDuration = `${duration}ms`;
        progress.appendChild(progressBar);
        toast.appendChild(progress);

        timerId = setTimeout(dismiss, duration);
    }

    // Insert at top (newest first)
    container.prepend(toast);

    // Trigger entrance animation
    requestAnimationFrame(() => {
        toast.classList.add('toast-visible');
    });

    function dismiss() {
        if (timerId) clearTimeout(timerId);
        toast.classList.remove('toast-visible');
        toast.classList.add('toast-exit');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
        // Fallback removal if animationend doesn't fire
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 400);
    }

    return { id, dismiss };
}

/**
 * Dismisses a toast by its ID.
 * @param {number} toastId
 */
export function dismissToast(toastId) {
    const container = getContainer();
    const toast = container.querySelector(`[data-toast-id="${toastId}"]`);
    if (toast) {
        const closeBtn = toast.querySelector('.toast-close-btn');
        if (closeBtn) closeBtn.click();
    }
}

/**
 * Dismisses all visible toasts.
 */
export function dismissAllToasts() {
    const container = getContainer();
    const toasts = container.querySelectorAll('.toast');
    toasts.forEach(toast => {
        const closeBtn = toast.querySelector('.toast-close-btn');
        if (closeBtn) closeBtn.click();
    });
}
