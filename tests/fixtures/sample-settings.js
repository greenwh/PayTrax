/**
 * Test fixture factory functions for creating settings test data
 */

/**
 * Creates test settings with default values that can be overridden
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Settings object matching PayTrax schema
 */
export function createTestSettings(overrides = {}) {
  return {
    companyName: 'Test Company LLC',
    taxYear: 2024,
    payFrequency: 'bi-weekly',
    firstPayPeriodStartDate: '2024-01-01',
    daysUntilPayday: 5,
    companyAddress: '456 Business Ave, Commerce City, CC 67890',
    companyPhone: '(555) 123-4567',

    // Tax rates (%)
    socialSecurity: 6.2,
    medicare: 1.45,
    sutaRate: 2.7,
    futaRate: 0.6,

    // Wage bases and thresholds
    ssWageBase: 168600,
    futaWageBase: 7000,
    additionalMedicareThreshold: 200000,
    additionalMedicareRate: 0.9,

    // Tax deposit frequencies
    taxFrequencies: {
      federal: 'Quarterly',
      futa: 'Quarterly',
      suta: 'Quarterly',
      state: 'Quarterly',
      local: 'Quarterly'
    },

    // Auto bank subtraction (v7)
    autoSubtraction: true,

    ...overrides
  };
}

/**
 * Creates settings for weekly pay frequency
 * @param {Object} overrides - Properties to override
 * @returns {Object} Weekly settings object
 */
export function createWeeklySettings(overrides = {}) {
  return createTestSettings({
    payFrequency: 'Weekly',
    firstPayPeriodStartDate: '2024-01-01',
    ...overrides
  });
}

/**
 * Creates settings for semi-monthly pay frequency
 * @param {Object} overrides - Properties to override
 * @returns {Object} Semi-monthly settings object
 */
export function createSemiMonthlySettings(overrides = {}) {
  return createTestSettings({
    payFrequency: 'Semi-monthly',
    firstPayPeriodStartDate: '2024-01-01',
    ...overrides
  });
}

/**
 * Creates settings for monthly pay frequency
 * @param {Object} overrides - Properties to override
 * @returns {Object} Monthly settings object
 */
export function createMonthlySettings(overrides = {}) {
  return createTestSettings({
    payFrequency: 'Monthly',
    firstPayPeriodStartDate: '2024-01-01',
    ...overrides
  });
}

/**
 * Creates complete appData structure for testing
 * @param {Object} settingsOverrides - Settings overrides
 * @param {Array} employees - Array of employees
 * @returns {Object} Complete appData object
 */
export function createTestAppData(settingsOverrides = {}, employees = []) {
  return {
    version: 7,
    settings: createTestSettings(settingsOverrides),
    employees: employees,
    payPeriods: {},
    bankRegister: []
  };
}
