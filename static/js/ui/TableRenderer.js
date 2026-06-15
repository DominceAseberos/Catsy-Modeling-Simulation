/**
 * TableRenderer.js
 * Handles drawing and updating the dining tables in the DOM.
 */
export class TableRenderer {
    constructor(containerId) {
        this.containerId = containerId;
        this.availableTables = [];
        this.tableTimers = new Map(); // tableId -> { type: 'countup'|'countdown', startSimTime: 0, limit: 0 }
    }

    /**
     * Clears and redraws the tables based on the simulation config.
     */
    draw(tablesCount) {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.innerHTML = '';
        this.availableTables = [];
        this.tableTimers.clear();

        for (let i = 0; i < tablesCount; i++) {
            container.innerHTML += `
                <div class="table" id="table-${i}" data-tooltip="Table is available">
                    <div class="table__badge" id="badge-table-${i}" style="display: none;">[R]</div>
                    <div class="table__status" id="status-table-${i}"></div>
                </div>
            `;
            this.availableTables.push(`table-${i}`);
        }
    }

    /**
     * Updates the UI based on events
     */
    setReserved(tableId, simTime, limit) {
        const tableEl = document.getElementById(`table-${tableId}`);
        const badgeEl = document.getElementById(`badge-table-${tableId}`);
        if (tableEl && badgeEl) {
            tableEl.classList.add('table--reserved');
            badgeEl.style.display = 'block';
            this.tableTimers.set(tableId, { type: 'countdown', startSimTime: simTime, limit: limit });
            this._updateTimerDisplay(tableId, simTime);
        }
    }

    setUnreserved(tableId) {
        const tableEl = document.getElementById(`table-${tableId}`);
        const badgeEl = document.getElementById(`badge-table-${tableId}`);
        const statusEl = document.getElementById(`status-table-${tableId}`);
        if (tableEl && badgeEl && statusEl) {
            tableEl.classList.remove('table--reserved');
            badgeEl.style.display = 'none';
            statusEl.innerHTML = '';
            tableEl.setAttribute('data-tooltip', "Table is available");
            this.tableTimers.delete(tableId);
        }
    }

    setOccupied(tableId, simTime, isReservation, state='waiting') {
        const tableEl = document.getElementById(`table-${tableId}`);
        const badgeEl = document.getElementById(`badge-table-${tableId}`);
        if (tableEl) {
            if (!isReservation && badgeEl) badgeEl.style.display = 'none';
            tableEl.classList.add('table--occupied');
            this.tableTimers.set(tableId, { type: 'countup', startSimTime: simTime, state: state });
            this._updateTimerDisplay(tableId, simTime);
        }
    }

    setEmpty(tableId) {
        const tableEl = document.getElementById(`table-${tableId}`);
        const badgeEl = document.getElementById(`badge-table-${tableId}`);
        const statusEl = document.getElementById(`status-table-${tableId}`);
        if (tableEl && badgeEl && statusEl) {
            tableEl.classList.remove('table--occupied');
            tableEl.classList.remove('table--reserved');
            badgeEl.style.display = 'none';
            statusEl.innerHTML = '';
            tableEl.setAttribute('data-tooltip', "Table is available");
            this.tableTimers.delete(tableId);
        }
    }

    tickTimers(currentSimTime) {
        for (const [tableId, _] of this.tableTimers.entries()) {
            this._updateTimerDisplay(tableId, currentSimTime);
        }
    }

    _updateTimerDisplay(tableId, currentSimTime) {
        const timerData = this.tableTimers.get(tableId);
        if (!timerData) return;

        const statusEl = document.getElementById(`status-table-${tableId}`);
        const tableEl = document.getElementById(`table-${tableId}`);
        if (!statusEl || !tableEl) return;

        let elapsed = currentSimTime - timerData.startSimTime;
        if (elapsed < 0) elapsed = 0;

        if (timerData.type === 'countdown') {
            let remaining = timerData.limit - elapsed;
            if (remaining < 0) remaining = 0;
            const mins = Math.floor(remaining / 60);
            const secs = Math.floor(remaining % 60).toString().padStart(2, '0');
            tableEl.setAttribute('data-tooltip', "Reserved table waiting for customer");
            statusEl.innerHTML = `⏳ <span style="font-family: monospace; font-size: 0.8rem;">${mins}:${secs}</span>`;
            statusEl.style.color = '#f39c12';
        } else if (timerData.type === 'countup') {
            const mins = Math.floor(elapsed / 60);
            const secs = Math.floor(elapsed % 60).toString().padStart(2, '0');
            if (timerData.state === 'waiting') {
                tableEl.setAttribute('data-tooltip', "Customer waiting for order");
                statusEl.innerHTML = `⏳ <span style="font-family: monospace; font-size: 0.8rem;">${mins}:${secs}</span>`;
                statusEl.style.color = '#e94f37';
            } else {
                tableEl.setAttribute('data-tooltip', "Customer dining at table");
                statusEl.innerHTML = `☕ <span style="font-family: monospace; font-size: 0.8rem;">${mins}:${secs}</span>`;
                statusEl.style.color = '#4caf50';
            }
        }
    }
}

export const tableRenderer = new TableRenderer('tables');
