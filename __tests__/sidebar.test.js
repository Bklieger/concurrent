const Sidebar = require('../src/renderer/sidebar');

describe('Sidebar', () => {
    let callbacks;
    let sidebar;

    beforeEach(() => {
        document.body.innerHTML = `
      <aside>
        <ul id="terminal-list"></ul>
        <button id="new-terminal-btn"></button>
        <button id="create-first-btn"></button>
      </aside>
    `;

        callbacks = {
            onSelect: jest.fn(),
            onClose: jest.fn(),
            onCreate: jest.fn(),
            onRename: jest.fn(),
        };

        sidebar = new Sidebar(callbacks);
    });

    test('add creates entry with incremental name', () => {
        const name1 = sidebar.add('id-1');
        const name2 = sidebar.add('id-2');

        expect(name1).toBe('TTY-01');
        expect(name2).toBe('TTY-02');
        expect(sidebar.terminals.size).toBe(2);
        expect(document.querySelectorAll('.terminal-item').length).toBe(2);
    });

    test('setActive toggles active class', () => {
        sidebar.add('id-1');
        sidebar.add('id-2');

        sidebar.setActive('id-2');

        const activeEls = Array.from(document.querySelectorAll('.terminal-item.active'));
        expect(activeEls).toHaveLength(1);
        expect(activeEls[0].dataset.id).toBe('id-2');
    });

    test('setActivity updates status data attribute', () => {
        sidebar.add('id-1');
        sidebar.setActivity('id-1', true);
        const status = document.querySelector('.terminal-item-status').dataset.status;
        expect(status).toBe('active');
    });

    test('rename updates label and notifies callback by default', () => {
        sidebar.add('id-1');
        sidebar.rename('id-1', 'New Name');

        expect(document.querySelector('.terminal-item-name').textContent).toBe('New Name');
        expect(callbacks.onRename).toHaveBeenCalledWith('id-1', 'New Name');
    });

    test('rename can skip emitting callback', () => {
        sidebar.add('id-1');
        sidebar.rename('id-1', 'New Name', { emit: false });

        expect(document.querySelector('.terminal-item-name').textContent).toBe('New Name');
        expect(callbacks.onRename).not.toHaveBeenCalled();
    });

    test('remove deletes entry', () => {
        sidebar.add('id-1');
        sidebar.remove('id-1');

        expect(sidebar.terminals.size).toBe(0);
        expect(document.querySelectorAll('.terminal-item').length).toBe(0);
    });

    test('getNextId chooses next or previous id', () => {
        sidebar.add('id-1');
        sidebar.add('id-2');
        sidebar.add('id-3');

        expect(sidebar.getNextId('id-2')).toBe('id-3');
        expect(sidebar.getNextId('id-3')).toBe('id-2');
    });

    test('new/create buttons trigger onCreate', () => {
        document.getElementById('new-terminal-btn').click();
        document.getElementById('create-first-btn').click();

        expect(callbacks.onCreate).toHaveBeenCalledTimes(2);
    });

    test('clicking item triggers onSelect and close triggers onClose', () => {
        sidebar.add('id-1');
        const item = document.querySelector('.terminal-item');
        const closeBtn = item.querySelector('.terminal-item-close');

        item.click();
        expect(callbacks.onSelect).toHaveBeenCalledWith('id-1');

        closeBtn.click();
        expect(callbacks.onClose).toHaveBeenCalledWith('id-1');
    });

    test('double-click name enters edit mode and saves on blur', () => {
        jest.useFakeTimers();
        sidebar.add('id-1');

        const nameEl = document.querySelector('.terminal-item-name');
        nameEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

        const input = nameEl.querySelector('input');
        input.value = 'Edited';
        input.dispatchEvent(new Event('blur', { bubbles: true }));

        jest.runAllTimers();

        expect(callbacks.onRename).toHaveBeenCalledWith('id-1', 'Edited');
        expect(nameEl.textContent).toBe('Edited');
    });
});

