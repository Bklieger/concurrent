/**
 * Window Manager - 8x8 grid-based window system
 * Manages draggable, snappable windows for terminals and overview
 * Windows cannot overlap - moving one pushes/shrinks others
 */
class WindowManager {
    constructor() {
        this.gridSize = 8;
        this.minWindowSize = 2; // Minimum 2x2 grid cells
        this.windows = new Map();
        this.windowIdCounter = 0;
        this.activeWindowId = null;
        this.dragState = null;
        this.resizeState = null;

        this.container = document.getElementById('window-grid-container');
        this.gridOverlay = document.getElementById('grid-overlay');

        this.setupEventListeners();
        this.createGridOverlay();
    }

    /**
     * Create the visual grid overlay (shown during drag)
     */
    createGridOverlay() {
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const cell = document.createElement('div');
                cell.className = 'grid-cell';
                cell.dataset.row = row;
                cell.dataset.col = col;
                this.gridOverlay.appendChild(cell);
            }
        }
    }

    /**
     * Setup global event listeners for drag and resize
     */
    setupEventListeners() {
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    }

    /**
     * Check if two rectangles overlap
     */
    rectsOverlap(a, b) {
        return !(a.x + a.w <= b.x || b.x + b.w <= a.x ||
            a.y + a.h <= b.y || b.y + b.h <= a.y);
    }

    /**
     * Find windows that conflict with a given rectangle
     */
    findConflicts(rect, excludeWindowId) {
        const conflicts = [];

        for (const [windowId, windowData] of this.windows) {
            if (windowId === excludeWindowId || windowData.minimized) continue;

            const windowRect = {
                x: windowData.gridX,
                y: windowData.gridY,
                w: windowData.gridW,
                h: windowData.gridH
            };

            if (this.rectsOverlap(rect, windowRect)) {
                conflicts.push(windowId);
            }
        }

        return conflicts;
    }

    /**
     * Find a free spot for a new window
     */
    findFreeSpot(width, height) {
        // Try to find a spot that fits without conflicts
        for (let y = 0; y <= this.gridSize - height; y++) {
            for (let x = 0; x <= this.gridSize - width; x++) {
                const rect = { x, y, w: width, h: height };
                if (this.findConflicts(rect, null).length === 0) {
                    return { x, y };
                }
            }
        }

        // No free spot, return top-left (will push others)
        return { x: 0, y: 0 };
    }

    /**
     * Resolve all overlaps by pushing and shrinking windows
     * The window with excludeWindowId has priority and won't be changed
     */
    resolveOverlaps(priorityWindowId) {
        const priorityData = this.windows.get(priorityWindowId);
        if (!priorityData) return;

        const priorityRect = {
            x: priorityData.gridX,
            y: priorityData.gridY,
            w: priorityData.gridW,
            h: priorityData.gridH
        };

        // Keep resolving until no conflicts remain
        let iterations = 0;
        const maxIterations = 50; // Prevent infinite loops

        while (iterations < maxIterations) {
            const conflicts = this.findConflicts(priorityRect, priorityWindowId);
            if (conflicts.length === 0) break;

            for (const conflictId of conflicts) {
                this.pushWindowAway(conflictId, priorityRect);
            }
            iterations++;
        }
    }

    /**
     * Push a window away from a priority rectangle
     * Will shrink the window if it hits grid boundaries
     */
    pushWindowAway(windowId, priorityRect) {
        const windowData = this.windows.get(windowId);
        if (!windowData) return;

        const windowRect = {
            x: windowData.gridX,
            y: windowData.gridY,
            w: windowData.gridW,
            h: windowData.gridH
        };

        // Calculate overlap amounts in each direction
        const overlapLeft = priorityRect.x + priorityRect.w - windowRect.x;
        const overlapRight = windowRect.x + windowRect.w - priorityRect.x;
        const overlapTop = priorityRect.y + priorityRect.h - windowRect.y;
        const overlapBottom = windowRect.y + windowRect.h - priorityRect.y;

        // Find the direction with minimum push needed
        const moves = [];

        // Push right
        if (overlapLeft > 0 && overlapLeft < windowRect.w + priorityRect.w) {
            const newX = priorityRect.x + priorityRect.w;
            const overflow = Math.max(0, newX + windowRect.w - this.gridSize);
            const newW = Math.max(this.minWindowSize, windowRect.w - overflow);
            if (newX + newW <= this.gridSize) {
                moves.push({
                    dir: 'right',
                    cost: overlapLeft + overflow,
                    x: newX,
                    y: windowRect.y,
                    w: newW,
                    h: windowRect.h
                });
            }
        }

        // Push left
        if (overlapRight > 0 && overlapRight < windowRect.w + priorityRect.w) {
            const pushAmount = overlapRight;
            let newX = windowRect.x - pushAmount;
            let newW = windowRect.w;

            if (newX < 0) {
                // Would go off left edge - shrink instead
                const shrinkAmount = -newX;
                newX = 0;
                newW = Math.max(this.minWindowSize, windowRect.w - shrinkAmount);
            }

            if (newX >= 0 && newX + newW <= priorityRect.x) {
                moves.push({
                    dir: 'left',
                    cost: pushAmount,
                    x: newX,
                    y: windowRect.y,
                    w: newW,
                    h: windowRect.h
                });
            }
        }

        // Push down
        if (overlapTop > 0 && overlapTop < windowRect.h + priorityRect.h) {
            const newY = priorityRect.y + priorityRect.h;
            const overflow = Math.max(0, newY + windowRect.h - this.gridSize);
            const newH = Math.max(this.minWindowSize, windowRect.h - overflow);
            if (newY + newH <= this.gridSize) {
                moves.push({
                    dir: 'down',
                    cost: overlapTop + overflow,
                    x: windowRect.x,
                    y: newY,
                    w: windowRect.w,
                    h: newH
                });
            }
        }

        // Push up
        if (overlapBottom > 0 && overlapBottom < windowRect.h + priorityRect.h) {
            const pushAmount = overlapBottom;
            let newY = windowRect.y - pushAmount;
            let newH = windowRect.h;

            if (newY < 0) {
                // Would go off top edge - shrink instead
                const shrinkAmount = -newY;
                newY = 0;
                newH = Math.max(this.minWindowSize, windowRect.h - shrinkAmount);
            }

            if (newY >= 0 && newY + newH <= priorityRect.y) {
                moves.push({
                    dir: 'up',
                    cost: pushAmount,
                    x: windowRect.x,
                    y: newY,
                    w: windowRect.w,
                    h: newH
                });
            }
        }

        if (moves.length === 0) {
            // No valid move found - force shrink in place
            // Try to fit beside the priority rect
            this.forceFit(windowId, priorityRect);
            return;
        }

        // Pick the move with lowest cost
        moves.sort((a, b) => a.cost - b.cost);
        const bestMove = moves[0];

        windowData.gridX = bestMove.x;
        windowData.gridY = bestMove.y;
        windowData.gridW = bestMove.w;
        windowData.gridH = bestMove.h;

        this.positionWindow(windowId);
        this.triggerContentResize(windowId);
    }

    /**
     * Force fit a window that can't be pushed away normally
     */
    forceFit(windowId, priorityRect) {
        const windowData = this.windows.get(windowId);
        if (!windowData) return;

        // Try to fit in available spaces around the priority rect
        const spaces = [
            // Right of priority
            { x: priorityRect.x + priorityRect.w, y: 0, maxW: this.gridSize - (priorityRect.x + priorityRect.w), maxH: this.gridSize },
            // Left of priority
            { x: 0, y: 0, maxW: priorityRect.x, maxH: this.gridSize },
            // Below priority
            { x: 0, y: priorityRect.y + priorityRect.h, maxW: this.gridSize, maxH: this.gridSize - (priorityRect.y + priorityRect.h) },
            // Above priority
            { x: 0, y: 0, maxW: this.gridSize, maxH: priorityRect.y },
        ];

        for (const space of spaces) {
            if (space.maxW >= this.minWindowSize && space.maxH >= this.minWindowSize) {
                windowData.gridX = space.x;
                windowData.gridY = space.y;
                windowData.gridW = Math.min(windowData.gridW, space.maxW);
                windowData.gridH = Math.min(windowData.gridH, space.maxH);
                windowData.gridW = Math.max(this.minWindowSize, windowData.gridW);
                windowData.gridH = Math.max(this.minWindowSize, windowData.gridH);

                this.positionWindow(windowId);
                this.triggerContentResize(windowId);
                return;
            }
        }
    }

    /**
     * Create a new window
     */
    createWindow(type, options = {}) {
        const id = `window-${++this.windowIdCounter}`;

        const width = options.gridW ?? 4;
        const height = options.gridH ?? 4;

        // Find a free spot if position not specified
        let gridX = options.gridX;
        let gridY = options.gridY;

        if (gridX === undefined || gridY === undefined) {
            const freeSpot = this.findFreeSpot(width, height);
            gridX = gridX ?? freeSpot.x;
            gridY = gridY ?? freeSpot.y;
        }

        const windowData = {
            id,
            type,
            title: options.title || (type === 'overview' ? 'WORKTREE COMMAND CENTER' : 'TERMINAL'),
            gridX,
            gridY,
            gridW: width,
            gridH: height,
            terminalId: options.terminalId || null,
            contentEl: options.contentEl || null,
            minimized: false,
        };

        // Create window element
        const windowEl = this.createWindowElement(windowData);
        this.container.appendChild(windowEl);

        windowData.element = windowEl;
        this.windows.set(id, windowData);

        // Resolve any overlaps (this window has priority)
        this.resolveOverlaps(id);

        // Position the window
        this.positionWindow(id);
        this.bringToFront(id);

        return id;
    }

    /**
     * Create the DOM element for a window
     */
    createWindowElement(windowData) {
        const el = document.createElement('div');
        el.className = `managed-window window-${windowData.type}`;
        el.id = windowData.id;
        el.innerHTML = `
      <div class="window-header" data-window-id="${windowData.id}">
        <span class="window-title">${windowData.title}</span>
        <div class="window-controls">
          <button class="window-btn window-minimize" title="Minimize">[_]</button>
          <button class="window-btn window-close" title="Close">[X]</button>
        </div>
      </div>
      <div class="window-content"></div>
      <div class="window-resize-handle resize-e" data-resize="e"></div>
      <div class="window-resize-handle resize-s" data-resize="s"></div>
      <div class="window-resize-handle resize-se" data-resize="se"></div>
      <div class="window-resize-handle resize-w" data-resize="w"></div>
      <div class="window-resize-handle resize-n" data-resize="n"></div>
      <div class="window-resize-handle resize-nw" data-resize="nw"></div>
      <div class="window-resize-handle resize-ne" data-resize="ne"></div>
      <div class="window-resize-handle resize-sw" data-resize="sw"></div>
    `;

        // Event listeners
        const header = el.querySelector('.window-header');
        header.addEventListener('mousedown', (e) => this.startDrag(e, windowData.id));

        el.querySelector('.window-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeWindow(windowData.id);
        });

        el.querySelector('.window-minimize').addEventListener('click', (e) => {
            e.stopPropagation();
            this.minimizeWindow(windowData.id);
        });

        // Resize handles
        el.querySelectorAll('.window-resize-handle').forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                this.startResize(e, windowData.id, handle.dataset.resize);
            });
        });

        // Click to focus
        el.addEventListener('mousedown', () => this.bringToFront(windowData.id));

        return el;
    }

    /**
     * Mount content into a window
     */
    mountContent(windowId, contentEl) {
        const windowData = this.windows.get(windowId);
        if (!windowData) return;

        const contentContainer = windowData.element.querySelector('.window-content');
        contentContainer.innerHTML = '';
        if (contentEl) {
            contentContainer.appendChild(contentEl);
            windowData.contentEl = contentEl;
        }
    }

    /**
     * Position a window based on its grid coordinates
     */
    positionWindow(windowId) {
        const windowData = this.windows.get(windowId);
        if (!windowData) return;

        const cellWidth = this.container.clientWidth / this.gridSize;
        const cellHeight = this.container.clientHeight / this.gridSize;

        const x = windowData.gridX * cellWidth;
        const y = windowData.gridY * cellHeight;
        const w = windowData.gridW * cellWidth;
        const h = windowData.gridH * cellHeight;

        windowData.element.style.left = `${x}px`;
        windowData.element.style.top = `${y}px`;
        windowData.element.style.width = `${w}px`;
        windowData.element.style.height = `${h}px`;
    }

    /**
     * Reposition all windows (call on container resize)
     */
    repositionAll() {
        for (const id of this.windows.keys()) {
            this.positionWindow(id);
        }
    }

    /**
     * Start dragging a window
     */
    startDrag(e, windowId) {
        if (e.target.closest('.window-controls')) return;

        const windowData = this.windows.get(windowId);
        if (!windowData) return;

        this.dragState = {
            windowId,
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            startGridX: windowData.gridX,
            startGridY: windowData.gridY,
        };

        windowData.element.classList.add('dragging');
        this.gridOverlay.classList.add('visible');
        this.bringToFront(windowId);
    }

    /**
     * Start resizing a window
     */
    startResize(e, windowId, direction) {
        const windowData = this.windows.get(windowId);
        if (!windowData) return;

        this.resizeState = {
            windowId,
            direction,
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            startGridX: windowData.gridX,
            startGridY: windowData.gridY,
            startGridW: windowData.gridW,
            startGridH: windowData.gridH,
        };

        windowData.element.classList.add('resizing');
        this.gridOverlay.classList.add('visible');
    }

    /**
     * Handle mouse move for drag/resize
     */
    handleMouseMove(e) {
        if (this.dragState) {
            this.handleDrag(e);
        } else if (this.resizeState) {
            this.handleResize(e);
        }
    }

    /**
     * Handle dragging
     */
    handleDrag(e) {
        const { windowId, startMouseX, startMouseY, startGridX, startGridY } = this.dragState;
        const windowData = this.windows.get(windowId);
        if (!windowData) return;

        const cellWidth = this.container.clientWidth / this.gridSize;
        const cellHeight = this.container.clientHeight / this.gridSize;

        const deltaX = e.clientX - startMouseX;
        const deltaY = e.clientY - startMouseY;

        const gridDeltaX = Math.round(deltaX / cellWidth);
        const gridDeltaY = Math.round(deltaY / cellHeight);

        let newGridX = startGridX + gridDeltaX;
        let newGridY = startGridY + gridDeltaY;

        // Clamp to grid bounds
        newGridX = Math.max(0, Math.min(this.gridSize - windowData.gridW, newGridX));
        newGridY = Math.max(0, Math.min(this.gridSize - windowData.gridH, newGridY));

        // Only update if position changed
        if (newGridX !== windowData.gridX || newGridY !== windowData.gridY) {
            windowData.gridX = newGridX;
            windowData.gridY = newGridY;

            // Resolve overlaps (this window has priority)
            this.resolveOverlaps(windowId);

            this.positionWindow(windowId);
        }

        // Highlight target cells
        this.highlightCells(newGridX, newGridY, windowData.gridW, windowData.gridH);
    }

    /**
     * Handle resizing
     */
    handleResize(e) {
        const { windowId, direction, startMouseX, startMouseY, startGridX, startGridY, startGridW, startGridH } = this.resizeState;
        const windowData = this.windows.get(windowId);
        if (!windowData) return;

        const cellWidth = this.container.clientWidth / this.gridSize;
        const cellHeight = this.container.clientHeight / this.gridSize;

        const deltaX = e.clientX - startMouseX;
        const deltaY = e.clientY - startMouseY;

        const gridDeltaX = Math.round(deltaX / cellWidth);
        const gridDeltaY = Math.round(deltaY / cellHeight);

        let newGridX = startGridX;
        let newGridY = startGridY;
        let newGridW = startGridW;
        let newGridH = startGridH;

        // Handle different resize directions
        if (direction.includes('e')) {
            newGridW = Math.max(this.minWindowSize, Math.min(this.gridSize - newGridX, startGridW + gridDeltaX));
        }
        if (direction.includes('w')) {
            const maxShrink = startGridW - this.minWindowSize;
            const maxExpand = startGridX;
            const clampedDeltaX = Math.max(-maxExpand, Math.min(maxShrink, gridDeltaX));
            newGridX = startGridX + clampedDeltaX;
            newGridW = startGridW - clampedDeltaX;
        }
        if (direction.includes('s')) {
            newGridH = Math.max(this.minWindowSize, Math.min(this.gridSize - newGridY, startGridH + gridDeltaY));
        }
        if (direction.includes('n')) {
            const maxShrink = startGridH - this.minWindowSize;
            const maxExpand = startGridY;
            const clampedDeltaY = Math.max(-maxExpand, Math.min(maxShrink, gridDeltaY));
            newGridY = startGridY + clampedDeltaY;
            newGridH = startGridH - clampedDeltaY;
        }

        // Only update if something changed
        if (newGridX !== windowData.gridX || newGridY !== windowData.gridY ||
            newGridW !== windowData.gridW || newGridH !== windowData.gridH) {
            windowData.gridX = newGridX;
            windowData.gridY = newGridY;
            windowData.gridW = newGridW;
            windowData.gridH = newGridH;

            // Resolve overlaps (this window has priority)
            this.resolveOverlaps(windowId);

            this.positionWindow(windowId);
        }

        // Highlight target cells
        this.highlightCells(windowData.gridX, windowData.gridY, windowData.gridW, windowData.gridH);
    }

    /**
     * Handle mouse up - end drag/resize
     */
    handleMouseUp(e) {
        if (this.dragState) {
            const windowData = this.windows.get(this.dragState.windowId);
            if (windowData) {
                windowData.element.classList.remove('dragging');
                this.triggerContentResize(this.dragState.windowId);
            }
            this.dragState = null;
        }

        if (this.resizeState) {
            const windowData = this.windows.get(this.resizeState.windowId);
            if (windowData) {
                windowData.element.classList.remove('resizing');
                this.triggerContentResize(this.resizeState.windowId);
            }
            this.resizeState = null;
        }

        this.gridOverlay.classList.remove('visible');
        this.clearHighlight();
    }

    /**
     * Highlight grid cells during drag/resize
     */
    highlightCells(gridX, gridY, gridW, gridH) {
        this.clearHighlight();
        const cells = this.gridOverlay.querySelectorAll('.grid-cell');
        cells.forEach(cell => {
            const row = parseInt(cell.dataset.row);
            const col = parseInt(cell.dataset.col);
            if (col >= gridX && col < gridX + gridW && row >= gridY && row < gridY + gridH) {
                cell.classList.add('highlight');
            }
        });
    }

    /**
     * Clear cell highlighting
     */
    clearHighlight() {
        this.gridOverlay.querySelectorAll('.grid-cell').forEach(cell => {
            cell.classList.remove('highlight');
        });
    }

    /**
     * Bring a window to the front
     */
    bringToFront(windowId) {
        const maxZ = Math.max(10, ...Array.from(this.windows.values()).map(w =>
            parseInt(w.element.style.zIndex || 10)
        ));

        const windowData = this.windows.get(windowId);
        if (windowData) {
            windowData.element.style.zIndex = maxZ + 1;
            this.activeWindowId = windowId;

            // Update active state
            this.windows.forEach((w, id) => {
                w.element.classList.toggle('active', id === windowId);
            });
        }
    }

    /**
     * Close a window
     */
    closeWindow(windowId) {
        const windowData = this.windows.get(windowId);
        if (!windowData) return;

        // Emit close event
        if (this.onWindowClose) {
            this.onWindowClose(windowId, windowData);
        }

        windowData.element.remove();
        this.windows.delete(windowId);
    }

    /**
     * Minimize a window (hide it)
     */
    minimizeWindow(windowId) {
        const windowData = this.windows.get(windowId);
        if (!windowData) return;

        windowData.minimized = true;
        windowData.element.classList.add('minimized');
    }

    /**
     * Restore a minimized window
     */
    restoreWindow(windowId) {
        const windowData = this.windows.get(windowId);
        if (!windowData) return;

        windowData.minimized = false;
        windowData.element.classList.remove('minimized');

        // Resolve overlaps when restoring
        this.resolveOverlaps(windowId);

        this.bringToFront(windowId);
    }

    /**
     * Trigger content resize (for terminals to refit)
     */
    triggerContentResize(windowId) {
        const windowData = this.windows.get(windowId);
        if (!windowData) return;

        window.dispatchEvent(new CustomEvent('window-resize', {
            detail: { windowId, windowData }
        }));
    }

    /**
     * Get window by terminal ID
     */
    getWindowByTerminalId(terminalId) {
        for (const [windowId, windowData] of this.windows) {
            if (windowData.terminalId === terminalId) {
                return { windowId, windowData };
            }
        }
        return null;
    }

    /**
     * Get overview window
     */
    getOverviewWindow() {
        for (const [windowId, windowData] of this.windows) {
            if (windowData.type === 'overview') {
                return { windowId, windowData };
            }
        }
        return null;
    }

    /**
     * Update window title
     */
    updateWindowTitle(windowId, title) {
        const windowData = this.windows.get(windowId);
        if (!windowData) return;

        windowData.title = title;
        const titleEl = windowData.element.querySelector('.window-title');
        if (titleEl) {
            titleEl.textContent = title;
        }
    }

    /**
     * Set close callback
     */
    setOnWindowClose(callback) {
        this.onWindowClose = callback;
    }
}

// Export for use in app.js
if (typeof window !== 'undefined') {
    window.WindowManager = WindowManager;
}
