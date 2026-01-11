// Utility helpers for detecting /rename commands from terminal input
const RENAME_REGEX = /^\/rename\s+["']?([^"']+)["']?\s*$/;

function getRenameAction(inputBuffer, data, renameHandled) {
    let nextBuffer = inputBuffer;
    let nextHandled = renameHandled;
    let shouldRename = false;
    let newName = '';

    if (data === '\r' || data === '\n') {
        const match = !renameHandled && inputBuffer.match(RENAME_REGEX);
        if (match) {
            const trimmed = match[1].trim();
            if (trimmed) {
                shouldRename = true;
                newName = trimmed;
                nextHandled = true;
            }
        }
        // Always clear buffer after Enter
        nextBuffer = '';
        if (!shouldRename) {
            nextHandled = false;
        }
        return { shouldRename, newName, nextBuffer, nextHandled };
    }

    if (data === '\x7f') {
        nextBuffer = inputBuffer.slice(0, -1);
        nextHandled = false;
        return { shouldRename, newName, nextBuffer, nextHandled };
    }

    if (typeof data === 'string' && data.length === 1 && data.charCodeAt(0) >= 32) {
        nextBuffer = inputBuffer + data;
        nextHandled = false;
        return { shouldRename, newName, nextBuffer, nextHandled };
    }

    // Any other control-like input clears tracking state
    if (typeof data === 'string' && data.length > 0 && data.charCodeAt(0) < 32) {
        nextBuffer = '';
        nextHandled = false;
    }

    return { shouldRename, newName, nextBuffer, nextHandled };
}

// UMD style export for both browser and Jest
if (typeof module !== 'undefined') {
    module.exports = { getRenameAction, RENAME_REGEX };
}

if (typeof window !== 'undefined') {
    window.RenameUtils = { getRenameAction, RENAME_REGEX };
}

