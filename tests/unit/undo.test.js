import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSnapshot, pushUndo } from '../../js/undo.js';
import { dismissAllToasts } from '../../js/toast.js';

describe('undo.js', () => {
  afterEach(() => {
    dismissAllToasts();
    const container = document.getElementById('toast-container');
    if (container) container.remove();
  });

  describe('createSnapshot()', () => {
    it('should produce a deep clone', () => {
      const original = { name: 'John', items: [1, 2, 3], nested: { a: 1 } };
      const snapshot = createSnapshot(original);

      expect(snapshot).toEqual(original);
      expect(snapshot).not.toBe(original);
      expect(snapshot.items).not.toBe(original.items);
      expect(snapshot.nested).not.toBe(original.nested);
    });

    it('should be mutation-independent from original', () => {
      const original = { name: 'John', values: [1, 2] };
      const snapshot = createSnapshot(original);

      original.name = 'Jane';
      original.values.push(3);

      expect(snapshot.name).toBe('John');
      expect(snapshot.values).toEqual([1, 2]);
    });
  });

  describe('pushUndo()', () => {
    it('should show a toast with Undo action', () => {
      pushUndo('Deleted item', { id: 1 }, () => {});

      const container = document.getElementById('toast-container');
      const actionBtn = container.querySelector('.toast-action-btn');
      expect(actionBtn).not.toBeNull();
      expect(actionBtn.textContent).toBe('Undo');
    });

    it('should call restoreCallback with snapshot when Undo is clicked', () => {
      vi.useFakeTimers();
      const snapshot = { employee: 'John', data: [1, 2, 3] };
      const restoreCallback = vi.fn();

      pushUndo('Deleted John', snapshot, restoreCallback);

      const container = document.getElementById('toast-container');
      const actionBtn = container.querySelector('.toast-action-btn');
      actionBtn.click();

      expect(restoreCallback).toHaveBeenCalledWith(snapshot);
      vi.useRealTimers();
    });

    it('should show a success toast after undo is performed', () => {
      vi.useFakeTimers();
      pushUndo('Deleted item', {}, () => {});

      const container = document.getElementById('toast-container');
      const actionBtn = container.querySelector('.toast-action-btn');
      actionBtn.click();

      // After undo, a success toast should appear
      const successToast = container.querySelector('.toast-success');
      expect(successToast).not.toBeNull();
      vi.useRealTimers();
    });
  });
});
