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
        
        this.confirmationDiv = document.getElementById('analytics-confirmation');
        this.configListDiv = document.getElementById('analytics-config-list');
        this.btnRunConfirm = document.getElementById('btn-run-analysis-confirm');
        this.title = document.getElementById('analytics-modal-title');
        
        this.loadingDiv = document.getElementById('analytics-loading');
        this.contentDiv = document.getElementById('analytics-content');
        this.subtitle = document.getElementById('analytics-subtitle');
        
        this.bindEvents();
    }

    bindEvents() {
        if (this.btnAnalyze && this.modal) {
            this.btnAnalyze.addEventListener('click', () => this.showConfirmation());
        }
        
        if (this.btnRunConfirm) {
            this.btnRunConfirm.addEventListener('click', () => this.runAnalysis());
        }

        if (this.btnCloseModal && this.modal) {
            this.btnCloseModal.addEventListener('click', () => {
                this.modal.classList.remove('scrim--active');
            });
        }
    }
    
    showConfirmation() {
        this.modal.classList.add('scrim--active');
        if (this.title) this.title.innerText = "Batch Analytics Setup";
        
        // Ensure state is fresh from DOM before reading
        configState.refreshFromDOM();
        const payload = configState.getConfig();
        
        const shiftHours = payload.shiftHours || 2;
        const reps = payload.replications || 10;
        
        if (this.subtitle) {
            this.subtitle.innerText = `Preparing to run ${reps} simulated days (${shiftHours} hours each).`;
        }
        
        if (this.configListDiv) {
            // Fix: Fallback to defaults if somehow still undefined, and use correct ConfigState keys
            const cashiers = payload.cashiers || 1;
            const baristas = payload.baristas || 2;
            const arrivalRate = payload.arrival || 45.0;
            const decideMin = payload.decideMin || 10.0;
            const decideMax = payload.decideMax || 60.0;
            const baristaMin = payload.prepMin || 60.0;
            const baristaMax = payload.prepMax || 180.0;
            const balkThresh = payload.balkThreshold || 8;

            const resProb = Math.round((payload.resProb || 0.2) * 100);
            const resMin = payload.resArrivalMin || 30.0;
            const resMax = payload.resArrivalMax || 180.0;
            const takeoutProb = Math.round((payload.takeoutProb || 0.5) * 100);
            const balkProb = Math.round((payload.balkProb || 0.5) * 100);
            const renegeProb = Math.round((payload.renegeProb || 0.3) * 100);
            const strikes = payload.maxStrikes || 3;
            const warmup = payload.warmupTime || 0;
            const payMin = payload.payMin || 2.0;
            const payMax = payload.payMax || 10.0;
            const dwellMin = payload.dwellMin || 900.0;
            const dwellMax = payload.dwellMax || 3600.0;

            this.configListDiv.innerHTML = `
                <div><strong>Cashiers:</strong> ${cashiers} | <strong>Baristas:</strong> ${baristas} | <strong>Tables:</strong> ${payload.tables || 5}</div>
                <div><strong>Arrival Rate:</strong> 1 every ${arrivalRate.toFixed(1)}s <span style="color:#888; font-size:11px;">(≈ ${Math.round(3600/arrivalRate)} / hr)</span></div>
                <div><strong>Cashier Service:</strong> Order: ${decideMin}s-${decideMax}s | Pay: ${payMin}s-${payMax}s</div>
                <div><strong>Barista Service:</strong> ${baristaMin}s - ${baristaMax}s</div>
                <div><strong>Dine-In Time:</strong> ${dwellMin}s - ${dwellMax}s</div>
                <div style="margin-top: 8px; font-weight: bold; color: var(--color-primary);">Logic & Reservations</div>
                <div><strong>Reservations:</strong> ${resProb}% (Arrival Window: ${resMin}s-${resMax}s)</div>
                <div><strong>Takeout:</strong> ${takeoutProb}%</div>
                <div><strong>Balking (Line too long):</strong> ${balkProb}% (Threshold: ${balkThresh})</div>
                <div><strong>Reneging (Tired of waiting):</strong> ${renegeProb}% (Strikes: ${strikes})</div>
                <div><strong>Warm-Up Time:</strong> ${warmup}s</div>
            `;
        }
        
        if (this.confirmationDiv) this.confirmationDiv.style.display = 'flex';
        if (this.loadingDiv) this.loadingDiv.style.display = 'none';
        if (this.contentDiv) this.contentDiv.style.display = 'none';
    }

    async runAnalysis() {
        if (this.title) this.title.innerText = "Statistical Batch Results";
        
        if (this.confirmationDiv) this.confirmationDiv.style.display = 'none';
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

        setText('res-wait', (data.avg_wait_time).toFixed(1) + 's (~' + (data.avg_wait_time / 60).toFixed(1) + ' mins)');
        setText('res-cycle', (data.avg_cycle_time).toFixed(1) + 's (~' + (data.avg_cycle_time / 60).toFixed(1) + ' mins)');
        setText('res-lost-customers', (data.avg_lost_customers || 0).toFixed(1) + ' customers');
        
        setText('res-reservations', (data.avg_reservations || 0).toFixed(1));
        
        const payload = configState.getConfig();
        const fallbackArrivals = Math.round(3600 / (parseFloat(payload.arrival) || 45.0));
        setText('res-arrivals', (data.target_arrivals_per_hour || fallbackArrivals).toFixed(0) + ' / hr');
        setText('res-throughput', data.throughput_per_hour.toFixed(0) + ' / hr');
        
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
