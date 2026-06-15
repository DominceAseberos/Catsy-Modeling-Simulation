/**
 * TableRenderer.js
 * Handles drawing and updating the dining tables in the DOM.
 */
export class TableRenderer {
    constructor(containerId) {
        this.containerId = containerId;
        this.availableTables = [];
        this.availableResTables = [];
    }

    /**
     * Clears and redraws the tables based on the simulation config.
     */
    draw(tablesCount, resTablesCount) {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.innerHTML = '';
        this.availableTables = [];
        this.availableResTables = [];

        for (let i = 1; i <= resTablesCount; i++) {
            container.innerHTML += `
                <div class="table table--reserved" id="res-table-${i}">
                    <div class="table__badge">[R]</div>
                    <div class="table__status" id="status-res-table-${i}">Reserved</div>
                </div>
            `;
            this.availableResTables.push(`res-table-${i}`);
        }
        for (let i = 1; i <= tablesCount; i++) {
            container.innerHTML += `
                <div class="table" id="table-${i}">
                    <div class="table__status" id="status-table-${i}"></div>
                </div>
            `;
            this.availableTables.push(`table-${i}`);
        }
    }

    /**
     * Updates the text and color of a table's status indicator.
     */
    updateStatus(tableId, status, type) {
        const statusEl = document.getElementById(`status-${tableId}`);
        if (statusEl) {
            statusEl.innerText = status;
            if (type === 'waiting') {
                statusEl.style.color = 'var(--color-error)';
            } else if (type === 'eating') {
                statusEl.style.color = 'var(--color-success)';
            } else {
                statusEl.style.color = 'var(--color-text-secondary)';
            }
        }
    }
}

export const tableRenderer = new TableRenderer('tables');
