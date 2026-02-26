import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { showToast, dismissToast, dismissAllToasts } from '../../js/toast.js';

describe('toast.js', () => {
  beforeEach(() => {
    // Clean up any existing toast containers
    const existing = document.getElementById('toast-container');
    if (existing) existing.remove();
  });

  afterEach(() => {
    dismissAllToasts();
    const existing = document.getElementById('toast-container');
    if (existing) existing.remove();
  });

  describe('showToast()', () => {
    it('should create the container on first call', () => {
      expect(document.getElementById('toast-container')).toBeNull();
      showToast('Test message', 'info');
      expect(document.getElementById('toast-container')).not.toBeNull();
    });

    it('should return an object with id and dismiss function', () => {
      const result = showToast('Test', 'success');
      expect(result).toHaveProperty('id');
      expect(typeof result.id).toBe('number');
      expect(typeof result.dismiss).toBe('function');
    });

    it('should show a success toast with correct class', () => {
      showToast('Success!', 'success');
      const container = document.getElementById('toast-container');
      const toast = container.querySelector('.toast-success');
      expect(toast).not.toBeNull();
    });

    it('should show an error toast with correct class', () => {
      showToast('Error!', 'error');
      const container = document.getElementById('toast-container');
      const toast = container.querySelector('.toast-error');
      expect(toast).not.toBeNull();
    });

    it('should show a warning toast with correct class', () => {
      showToast('Warning!', 'warning');
      const container = document.getElementById('toast-container');
      const toast = container.querySelector('.toast-warning');
      expect(toast).not.toBeNull();
    });

    it('should show an info toast with correct class', () => {
      showToast('Info!', 'info');
      const container = document.getElementById('toast-container');
      const toast = container.querySelector('.toast-info');
      expect(toast).not.toBeNull();
    });

    it('should display the message text', () => {
      showToast('Hello World', 'info');
      const container = document.getElementById('toast-container');
      const message = container.querySelector('.toast-message');
      expect(message.textContent).toBe('Hello World');
    });

    it('should auto-dismiss after duration', () => {
      vi.useFakeTimers();
      showToast('Auto dismiss', 'info', { duration: 3000 });

      const container = document.getElementById('toast-container');
      expect(container.querySelectorAll('.toast').length).toBe(1);

      vi.advanceTimersByTime(3500);

      // Toast should have exit class or be removed
      const toasts = container.querySelectorAll('.toast:not(.toast-exit)');
      expect(toasts.length).toBe(0);

      vi.useRealTimers();
    });

    it('should not auto-dismiss when persistent', () => {
      vi.useFakeTimers();
      showToast('Persistent', 'info', { persistent: true });

      const container = document.getElementById('toast-container');
      vi.advanceTimersByTime(10000);

      // Should still be there
      const toasts = container.querySelectorAll('.toast');
      expect(toasts.length).toBe(1);

      vi.useRealTimers();
    });

    it('should include a progress bar for non-persistent toasts', () => {
      showToast('With progress', 'info', { duration: 5000 });
      const container = document.getElementById('toast-container');
      const progress = container.querySelector('.toast-progress');
      expect(progress).not.toBeNull();
    });

    it('should not include a progress bar for persistent toasts', () => {
      showToast('No progress', 'info', { persistent: true });
      const container = document.getElementById('toast-container');
      const progress = container.querySelector('.toast-progress');
      expect(progress).toBeNull();
    });

    it('should manually dismiss via returned dismiss function', () => {
      vi.useFakeTimers();
      const { dismiss } = showToast('Manual dismiss', 'info', { persistent: true });
      const container = document.getElementById('toast-container');
      expect(container.querySelectorAll('.toast').length).toBe(1);

      dismiss();
      vi.advanceTimersByTime(500); // Wait for fallback timeout

      expect(container.querySelectorAll('.toast').length).toBe(0);
      vi.useRealTimers();
    });

    it('should show action button when action provided', () => {
      const callback = vi.fn();
      showToast('With action', 'info', {
        persistent: true,
        action: { label: 'Undo', callback }
      });

      const container = document.getElementById('toast-container');
      const actionBtn = container.querySelector('.toast-action-btn');
      expect(actionBtn).not.toBeNull();
      expect(actionBtn.textContent).toBe('Undo');
    });

    it('should fire action callback and dismiss when action button clicked', () => {
      vi.useFakeTimers();
      const callback = vi.fn();
      showToast('With action', 'info', {
        persistent: true,
        action: { label: 'Undo', callback }
      });

      const container = document.getElementById('toast-container');
      const actionBtn = container.querySelector('.toast-action-btn');
      actionBtn.click();

      expect(callback).toHaveBeenCalledOnce();

      vi.advanceTimersByTime(500);
      expect(container.querySelectorAll('.toast').length).toBe(0);
      vi.useRealTimers();
    });

    it('should stack multiple toasts (newest on top)', () => {
      showToast('First', 'info', { persistent: true });
      showToast('Second', 'success', { persistent: true });

      const container = document.getElementById('toast-container');
      const toasts = container.querySelectorAll('.toast');
      expect(toasts.length).toBe(2);
      // Newest (Second) should be first child
      expect(toasts[0].querySelector('.toast-message').textContent).toBe('Second');
      expect(toasts[1].querySelector('.toast-message').textContent).toBe('First');
    });
  });

  describe('dismissToast()', () => {
    it('should dismiss a specific toast by ID', () => {
      vi.useFakeTimers();
      const { id } = showToast('Dismiss me', 'info', { persistent: true });
      showToast('Keep me', 'success', { persistent: true });

      const container = document.getElementById('toast-container');
      expect(container.querySelectorAll('.toast').length).toBe(2);

      dismissToast(id);
      vi.advanceTimersByTime(500);

      expect(container.querySelectorAll('.toast').length).toBe(1);
      expect(container.querySelector('.toast-message').textContent).toBe('Keep me');
      vi.useRealTimers();
    });
  });

  describe('dismissAllToasts()', () => {
    it('should dismiss all toasts', () => {
      vi.useFakeTimers();
      showToast('One', 'info', { persistent: true });
      showToast('Two', 'success', { persistent: true });
      showToast('Three', 'warning', { persistent: true });

      const container = document.getElementById('toast-container');
      expect(container.querySelectorAll('.toast').length).toBe(3);

      dismissAllToasts();
      vi.advanceTimersByTime(500);

      expect(container.querySelectorAll('.toast').length).toBe(0);
      vi.useRealTimers();
    });
  });
});
