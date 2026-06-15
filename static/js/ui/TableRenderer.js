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
                    <div class="table__status" id="status-res-table-${i}"></div>
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
        const tableEl = document.getElementById(tableId);
        
        let icon = '';
        if (type === 'waiting') icon = '<i class="fa-solid fa-hourglass-half"></i>';
        else if (type === 'eating') icon = '<i class="fa-solid fa-mug-hot"></i>';

        if (statusEl) {
            statusEl.innerHTML = icon;
            statusEl.style.backgroundColor = 'transparent';
            if (type === 'waiting') {
                statusEl.style.color = '#e94f37'; // Customer red
            } else if (type === 'eating') {
                statusEl.style.color = '#4caf50'; // Success green
            } else {
                statusEl.style.color = 'transparent';
            }
        }
        
        if (tableEl) {
            if (type === 'waiting' || type === 'eating') {
                tableEl.classList.add('table--occupied');
            } else {
                tableEl.classList.remove('table--occupied');
            }
        }
    }
}

export const tableRenderer = new TableRenderer('tables');
