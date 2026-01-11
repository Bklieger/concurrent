const path = require('path');
const { _electron: electron, test, expect } = require('@playwright/test');

const appDir = path.join(__dirname, '..');

test.describe('Concurrent app end-to-end', () => {
    test('renames session via /rename command and updates UI', async () => {
        const electronApp = await electron.launch({ args: ['.'], cwd: appDir });
        const window = await electronApp.firstWindow();

        await window.waitForSelector('#terminal-container');
        await window.waitForSelector('.terminal-item-name');
        await window.waitForSelector('.xterm-helper-textarea');

        // Focus the terminal input
        await window.click('.xterm-helper-textarea');

        await window.keyboard.type('/rename playwright-e2e');
        await window.keyboard.press('Enter');
        await window.keyboard.press('Enter');

        await expect(window.locator('.terminal-item-name')).toContainText('playwright-e2e', { timeout: 4000 });
        await expect(window.locator('.grid-terminal-name')).toContainText('playwright-e2e', { timeout: 4000 });

        await electronApp.close();
    });
});

