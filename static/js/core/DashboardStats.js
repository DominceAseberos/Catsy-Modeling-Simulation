/**
 * DashboardStats.js
 * Tracks numerical statistics for the simulation dashboard.
 * Designed to be simple, testable, and isolated from networking logic.
 */
export class DashboardStats {
    constructor() {
        this.stats = {
            totalCustomers: 0,
            servedCustomers: 0,
            lostCustomers: 0,
            totalDineIn: 0,
            totalTakeout: 0,
            cashierQueueLen: 0,
            waitingAreaLen: 0,
            pickupAreaLen: 0
        };
    }

    /**
     * Resets all statistical trackers back to zero.
     */
    reset() {
        for (let key in this.stats) {
            this.stats[key] = 0;
        }
        this.renderAll();
    }

    /**
     * Records a newly arrived customer.
     */
    recordArrival() {
        this.stats.totalCustomers++;
        this.render('total-customers', this.stats.totalCustomers);
    }

    /**
     * Records a customer who has successfully completed their journey.
     * @param {string} type - 'takeout' or 'dine-in'
     */
    recordServed(type) {
        this.stats.servedCustomers++;
        if (type === 'takeout') {
            this.stats.totalTakeout++;
            this.render('total-takeout', this.stats.totalTakeout);
        } else if (type === 'dine-in') {
            this.stats.totalDineIn++;
            this.render('total-dine-in', this.stats.totalDineIn);
        }
    }

    /**
     * Records a customer who left the store frustrated.
     */
    recordWalkout() {
        this.stats.lostCustomers++;
        this.render('lost-customers', this.stats.lostCustomers);
    }

    /**
     * Updates queue length metrics.
     * @param {string} queueType - 'cashier', 'waiting', or 'pickup'
     * @param {number} length - The new length of the queue
     */
    updateQueueLength(queueType, length) {
        if (queueType === 'cashier') {
            this.stats.cashierQueueLen = length;
            this.render('cashier-queue-len', length);
        } else if (queueType === 'waiting') {
            this.stats.waitingAreaLen = length;
            this.render('waiting-area-len', length);
        } else if (queueType === 'pickup') {
            this.stats.pickupAreaLen = length;
            // Often pickup and waiting use the same tracker in this UI
            this.render('pickup-area-len', length);
        }
    }

    /**
     * Internally handles safely pushing a number to the DOM if we are in a browser context.
     * @param {string} elementId - HTML ID of the stat element
     * @param {number} value - The value to render
     */
    render(elementId, value) {
        if (typeof document !== 'undefined') {
            const el = document.getElementById(elementId);
            if (el) el.innerText = value.toString();
        }
    }

    /**
     * Force re-renders all stats (usually after a reset).
     */
    renderAll() {
        this.render('total-customers', this.stats.totalCustomers);
        this.render('total-takeout', this.stats.totalTakeout);
        this.render('total-dine-in', this.stats.totalDineIn);
        this.render('lost-customers', this.stats.lostCustomers);
        this.render('cashier-queue-len', this.stats.cashierQueueLen);
        this.render('waiting-area-len', this.stats.waitingAreaLen);
        this.render('pickup-area-len', this.stats.pickupAreaLen);
    }
}

// Singleton instance
export const dashboardStats = new DashboardStats();
