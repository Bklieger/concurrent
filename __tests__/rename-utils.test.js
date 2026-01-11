const { getRenameAction, RENAME_REGEX } = require('../src/renderer/rename-utils');

describe('getRenameAction', () => {
    test('detects rename on enter and clears buffer', () => {
        const step1 = getRenameAction('/rename test', '\r', false);
        expect(step1.shouldRename).toBe(true);
        expect(step1.newName).toBe('test');
        expect(step1.nextBuffer).toBe('');
        expect(step1.nextHandled).toBe(true);
    });

    test('does not repeat rename on consecutive enters', () => {
        const first = getRenameAction('/rename again', '\r', false);
        const second = getRenameAction('', '\r', first.nextHandled);

        expect(first.shouldRename).toBe(true);
        expect(second.shouldRename).toBe(false);
        expect(second.nextBuffer).toBe('');
        expect(second.nextHandled).toBe(false);
    });

    test('resets when typing new characters after a rename', () => {
        const first = getRenameAction('/rename once', '\r', false);
        const typed = getRenameAction('', 'a', first.nextHandled);
        const enter = getRenameAction(typed.nextBuffer, '\r', typed.nextHandled);

        expect(first.shouldRename).toBe(true);
        expect(typed.shouldRename).toBe(false);
        expect(enter.shouldRename).toBe(false);
        expect(typed.nextBuffer).toBe('a');
    });

    test('ignores empty rename names', () => {
        const res = getRenameAction('/rename   ', '\r', false);
        expect(res.shouldRename).toBe(false);
        expect(res.nextHandled).toBe(false);
    });

    test('supports quoted names with spaces', () => {
        const res = getRenameAction('/rename "my session"', '\r', false);
        expect(res.shouldRename).toBe(true);
        expect(res.newName).toBe('my session');
    });

    test('backspace updates buffer and clears handled state', () => {
        const first = getRenameAction('/rename draft', '\r', false);
        const backspaced = getRenameAction('/rename draft', '\x7f', first.nextHandled);

        expect(first.shouldRename).toBe(true);
        expect(backspaced.shouldRename).toBe(false);
        expect(backspaced.nextBuffer).toBe('/rename draf');
        expect(backspaced.nextHandled).toBe(false);
    });

    test('control characters clear buffer and handled state', () => {
        const ctrlC = getRenameAction('abc', '\u0003', true);
        expect(ctrlC.nextBuffer).toBe('');
        expect(ctrlC.nextHandled).toBe(false);
        expect(ctrlC.shouldRename).toBe(false);
    });

    test('non-rename enter clears buffer without triggering rename', () => {
        const res = getRenameAction('just typing', '\r', false);
        expect(res.shouldRename).toBe(false);
        expect(res.nextBuffer).toBe('');
        expect(res.nextHandled).toBe(false);
    });

    test('regex matches minimal rename syntax', () => {
        expect(RENAME_REGEX.test('/rename a')).toBe(true);
        expect(RENAME_REGEX.test('/rename')).toBe(false);
    });
});

