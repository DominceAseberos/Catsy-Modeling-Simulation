// static/js/core/ConfigState.js

class ConfigState extends EventTarget {
    constructor() {
        super();
        this.state = {};
    }

    /**
     * Re-reads all configuration values from the DOM.
     * This acts as the single source of truth parser.
     */
    refreshFromDOM() {
        const newState = {
            cashiers: parseInt(document.getElementById('cfg-cashiers')?.value || 1),
            baristas: parseInt(document.getElementById('cfg-baristas')?.value || 2),
            tables: parseInt(document.getElementById('cfg-tables')?.value || 5),
            resArrivalMin: parseFloat(document.getElementById('cfg-res-arrival-min')?.value || 30.0),
            resArrivalMax: parseFloat(document.getElementById('cfg-res-arrival-max')?.value || 180.0),
            
            arrival: parseFloat(document.getElementById('cfg-arrival')?.value || 45.0),
            duration: parseInt(document.getElementById('cfg-duration')?.value || 0),
            warmupTime: parseFloat(document.getElementById('cfg-warmup')?.value || 0),
            
            takeoutProb: (parseFloat(document.getElementById('cfg-takeout-prob')?.value || 50)) / 100.0,
            resProb: (parseFloat(document.getElementById('cfg-res-prob')?.value || 20)) / 100.0,
            balkProb: (parseFloat(document.getElementById('cfg-balk-prob')?.value || 50)) / 100.0,
            balkThreshold: parseInt(document.getElementById('cfg-balk-threshold')?.value || 8),
            renegeProb: (parseFloat(document.getElementById('cfg-renege-prob')?.value || 30)) / 100.0,
            maxStrikes: parseInt(document.getElementById('cfg-max-strikes')?.value || 3),
            
            decideMin: parseFloat(document.getElementById('cfg-decide-min')?.value || 10.0),
            decideMax: parseFloat(document.getElementById('cfg-decide-max')?.value || 60.0),
            payMin: parseFloat(document.getElementById('cfg-pay-min')?.value || 2.0),
            payMax: parseFloat(document.getElementById('cfg-pay-max')?.value || 10.0),
            prepMin: parseFloat(document.getElementById('cfg-prep-min')?.value || 60.0),
            prepMax: parseFloat(document.getElementById('cfg-prep-max')?.value || 180.0),
            dwellMin: parseFloat(document.getElementById('cfg-dwell-min')?.value || 900.0),
            dwellMax: parseFloat(document.getElementById('cfg-dwell-max')?.value || 3600.0),
            
            replications: parseInt(document.getElementById('cfg-replications')?.value || 10),
            shiftHours: parseFloat(document.getElementById('cfg-shift-hours')?.value || 2)
        };
        
        // Only emit if state actually changed
        if (JSON.stringify(this.state) !== JSON.stringify(newState)) {
            this.state = newState;
            this.dispatchEvent(new CustomEvent('updated', { detail: this.state }));
        }
    }

    /**
     * Get the current state as a query string for WebSockets
     */
    toQueryString() {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(this.state)) {
            params.append(key, value);
        }
        return params.toString();
    }

    /**
     * Get the raw config JSON
     */
    getConfig() {
        return { ...this.state };
    }
}

// Singleton instance
export const configState = new ConfigState();
