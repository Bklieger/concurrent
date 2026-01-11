/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
    testDir: './tests',
    testMatch: '**/*.spec.js',
    testIgnore: ['**/__tests__/**'],
    reporter: 'list',
};

module.exports = config;

