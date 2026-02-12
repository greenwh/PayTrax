/**
 * Test fixture factory functions for creating employee test data
 */

/**
 * Creates a test employee with default values that can be overridden
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Employee object matching PayTrax schema
 */
export function createTestEmployee(overrides = {}) {
  const id = overrides.id || crypto.randomUUID();

  return {
    id,
    name: 'Test Employee',
    idNumber: '123-45-6789',
    address: '123 Test St, Test City, TS 12345',
    rate: 20.00,
    overtimeMultiplier: 1.5,
    holidayMultiplier: 2.0,
    fedTaxRate: 12,
    stateTaxRate: 5,
    localTaxRate: 2,
    ptoAccrualRate: 0.0385, // ~1 hour per pay period for bi-weekly
    ptoBalance: 0,
    taxRemainders: {
      federal: 0,
      fica: 0,
      medicare: 0,
      state: 0,
      local: 0,
      suta: 0,
      futa: 0
    },
    deductions: [],
    ...overrides
  };
}

/**
 * Creates a high-earning employee for testing wage base limits
 * @param {Object} overrides - Properties to override
 * @returns {Object} High earner employee object
 */
export function createHighEarnerEmployee(overrides = {}) {
  return createTestEmployee({
    name: 'High Earner',
    rate: 100.00, // $100/hr = ~$200k/year bi-weekly
    fedTaxRate: 24,
    stateTaxRate: 8,
    localTaxRate: 3,
    ...overrides
  });
}

/**
 * Creates an employee with deductions
 * @param {Object} overrides - Properties to override
 * @returns {Object} Employee with deductions
 */
export function createEmployeeWithDeductions(overrides = {}) {
  return createTestEmployee({
    name: 'Employee With Deductions',
    deductions: [
      {
        id: crypto.randomUUID(),
        name: '401(k)',
        amount: 100,
        type: 'fixed',
        createdDate: '2024-01-01'
      },
      {
        id: crypto.randomUUID(),
        name: 'Health Insurance',
        amount: 5,
        type: 'percentage',
        createdDate: '2024-01-01'
      }
    ],
    ...overrides
  });
}

/**
 * Creates multiple test employees
 * @param {number} count - Number of employees to create
 * @returns {Array} Array of employee objects
 */
export function createTestEmployees(count = 3) {
  return Array.from({ length: count }, (_, i) =>
    createTestEmployee({
      name: `Test Employee ${i + 1}`,
      rate: 15 + (i * 5) // $15, $20, $25, etc.
    })
  );
}
