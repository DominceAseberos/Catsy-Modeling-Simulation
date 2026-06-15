/**
 * AnalyticsModal.js
 * Handles the display and POST fetch logic for the batch analysis feature.
 */
import { configState } from '../core/ConfigState.js';

export class AnalyticsModal {
    constructor() {
        this.btnAnalyze = document.getElementById('btn-analyze');
        this.modal = document.getElementById('analytics-modal');
        this.btnCloseModal = document.getElementById('btn-close-modal');
        
        this.loadingDiv = document.getElementById('analytics-loading');
        this.contentDiv = document.getElementById('analytics-content');
        this.subtitle = document.getElementById('analytics-subtitle');
        
        this.bindEvents();
    }

    bindEvents() {
        if (this.btnAnalyze && this.modal) {
            this.btnAnalyze.addEventListener('click', () => this.runAnalysis());
        }

        if (this.btnCloseModal && this.modal) {
            this.btnCloseModal.addEventListener('click', () => {
                this.modal.classList.remove('scrim--active');
            });
        }
    }

    async runAnalysis() {
        this.modal.classList.add('scrim--active');
        
        if (this.loadingDiv && this.contentDiv) {
            this.loadingDiv.style.display = 'block';
            this.loadingDiv.innerHTML = '<i id="analyzing-text" style="color:#f1c40f;">Analyzing.</i><div id="analyzing-timer" style="margin-top: 15px; font-size: 13px; color: #aaa; font-family: monospace;">Time elapsed: 0.0s</div>';
            this.contentDiv.style.display = 'none';
        }

        // Start local timer for UI
        const startTime = Date.now();
        let animDots = 0;
        
        const animInterval = setInterval(() => {
            animDots = (animDots + 1) % 4;
            const textEl = document.getElementById('analyzing-text');
            if (textEl) {
                textEl.innerText = 'Analyzing' + '.'.repeat(animDots);
            }
        }, 500);
        
        const timerInterval = setInterval(() => {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const timerEl = document.getElementById('analyzing-timer');
            if (timerEl) {
                timerEl.innerText = `Time elapsed: ${elapsed}s`;
            }
        }, 100);

        try {
            // Fetch configuration payload from central state
            const payload = configState.getConfig();
            
            // Format standard properties expected by analytics engine
            const shiftHours = payload.shiftHours || 2;
            const replicationsCount = payload.replications || 10;
            payload.duration = Math.floor(shiftHours * 3600);
            
            if (this.subtitle) {
                this.subtitle.innerText = `Averaged over ${replicationsCount} independent simulated days (${shiftHours} hours each, minus warm-up).`;
            }
            
            // Send to FastAPI Backend
            const res = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            clearInterval(animInterval);
            clearInterval(timerInterval);
            
            if (!res.ok) {
                throw new Error("Server returned " + res.status);
            }
            
            const data = await res.json();
            this.displayResults(data);

        } catch (e) {
            clearInterval(animInterval);
            clearInterval(timerInterval);
            if (this.loadingDiv) {
                this.loadingDiv.innerHTML = `<span style="color:red">Failed to run analysis: ${e.message}</span>`;
            }
        }
    }

    displayResults(data) {
        if (this.loadingDiv) this.loadingDiv.style.display = 'none';
        if (this.contentDiv) this.contentDiv.style.display = 'block';
        
        const setText = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        };

        setText('res-wait', data.avg_wait_time.toFixed(1) + 's');
        setText('res-cycle', (data.avg_cycle_time / 60).toFixed(1) + ' mins');
        setText('res-lost-customers', (data.avg_lost_customers || 0).toFixed(1));
        setText('res-throughput', data.throughput_per_hour.toFixed(0) + ' / hr');
        setText('res-revenue', '₱' + (data.revenue_generated || 0).toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
        setText('res-revenue-lost', '₱' + (data.revenue_lost || 0).toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
        
        // Breakdown logic
        if (data.wait_breakdown && data.total_customers) {
            const q_zero = ((data.wait_breakdown["0-2min"] / data.total_customers) * 100).toFixed(1);
            const q_short = ((data.wait_breakdown["2-5min"] / data.total_customers) * 100).toFixed(1);
            const q_med = ((data.wait_breakdown["5-10min"] / data.total_customers) * 100).toFixed(1);
            const q_long = ((data.wait_breakdown[">10min"] / data.total_customers) * 100).toFixed(1);
            
            const qHtml = `
                <div style="margin-bottom: 5px;">0-2 mins: <strong style="color:var(--color-success)">${q_zero}%</strong></div>
                <div style="margin-bottom: 5px;">2-5 mins: <strong style="color:var(--color-warning)">${q_short}%</strong></div>
                <div style="margin-bottom: 5px;">5-10 mins: <strong style="color:var(--color-alert)">${q_med}%</strong></div>
                <div>>10 mins: <strong style="color:var(--color-error)">${q_long}%</strong></div>
            `;
            
            const brEl = document.getElementById('res-breakdown');
            if (brEl) brEl.innerHTML = qHtml;
        }
    }
}

export const analyticsModal = new AnalyticsModal();
