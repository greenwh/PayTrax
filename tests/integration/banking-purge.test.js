import { describe, it, expect, beforeEach } from 'vitest';
import { appData, defaultAppData } from '../../js/state.js';
import { getPurgePreview, purgeTransactions } from '../../js/banking.js';

/**
 * Bank register purge (audit F3).
 *
 * The opening-balance transaction must equal the net of the transactions
 * actually removed (reconciled, on or before the cutoff) so the register's
 * total balance is identical before and after the purge. Unreconciled
 * pre-cutoff transactions stay in the register and must not be double-counted.
 */
describe('Bank Register Purge', () => {
  const registerTotal = () =>
    appData.bankRegister.reduce((sum, t) => sum + t.credit - t.debit, 0);

  beforeEach(() => {
    Object.assign(appData, JSON.parse(JSON.stringify(defaultAppData)));
    appData.bankRegister = [
      { id: 't1', date: '2024-01-05', description: 'Deposit', debit: 0, credit: 1000, reconciled: true },
      { id: 't2', date: '2024-01-10', description: 'Payroll', debit: 200, credit: 0, reconciled: true },
      { id: 't3', date: '2024-01-15', description: 'Outstanding check', debit: 150, credit: 0, reconciled: false },
      { id: 't4', date: '2024-03-01', description: 'Later payroll', debit: 50, credit: 0, reconciled: true }
    ];
  });

  it('preserves the register total exactly when unreconciled transactions predate the cutoff', () => {
    const totalBefore = registerTotal();
    expect(totalBefore).toBe(600); // 1000 - 200 - 150 - 50

    const purged = purgeTransactions('2024-01-31');

    expect(purged).toBe(2); // t1 and t2 removed
    expect(registerTotal()).toBe(totalBefore); // fails on pre-fix code by exactly 150
  });

  it('keeps unreconciled pre-cutoff transactions in the register', () => {
    purgeTransactions('2024-01-31');
    expect(appData.bankRegister.find(t => t.id === 't3')).toBeDefined();
  });

  it('creates an opening balance equal to the net of only the purged transactions', () => {
    purgeTransactions('2024-01-31');
    const opening = appData.bankRegister.find(t => t.description === 'Opening Balance');
    expect(opening).toBeDefined();
    expect(opening.credit).toBe(800); // 1000 - 200, NOT 1000 - 200 - 150
    expect(opening.debit).toBe(0);
    expect(opening.date).toBe('2024-02-01'); // day after cutoff
  });

  it('getPurgePreview matches what purgeTransactions actually does', () => {
    const preview = getPurgePreview('2024-01-31');
    expect(preview.count).toBe(2);
    expect(preview.openingBalance).toBe(800);
  });

  it('purges nothing and creates no opening balance when no reconciled transactions predate the cutoff', () => {
    const purged = purgeTransactions('2024-01-01');
    expect(purged).toBe(0);
    expect(appData.bankRegister).toHaveLength(4);
    expect(appData.bankRegister.find(t => t.description === 'Opening Balance')).toBeUndefined();
  });

  it('creates a debit opening balance when the purged net is negative', () => {
    appData.bankRegister = [
      { id: 't1', date: '2024-01-05', description: 'Payroll', debit: 300, credit: 0, reconciled: true },
      { id: 't2', date: '2024-02-10', description: 'Deposit', debit: 0, credit: 500, reconciled: false }
    ];
    const totalBefore = registerTotal();

    purgeTransactions('2024-01-31');

    const opening = appData.bankRegister.find(t => t.description === 'Opening Balance');
    expect(opening.debit).toBe(300);
    expect(opening.credit).toBe(0);
    expect(registerTotal()).toBe(totalBefore);
  });
});
