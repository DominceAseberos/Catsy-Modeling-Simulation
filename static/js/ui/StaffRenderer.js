/**
 * StaffRenderer.js
 * Handles drawing and animating the Cashier and Barista staff members in the DOM.
 */
export class StaffRenderer {
    constructor() {
        this.cashierTimers = {};
        this.baristaTimers = {};
    }

    /**
     * Clears and redraws cashiers.
     */
    drawCashiers(count) {
        const container = document.getElementById('cashier-desk-container');
        if (!container) return;

        container.innerHTML = '';
        const showTimer = count <= 5;
        const staffSize = count > 6 ? 40 : 60;
        const fontSize = count > 6 ? 12 : 16;
        
        for (let i = 0; i < count; i++) {
            const timerHtml = showTimer ? `<div id="timer-cashier-${i}" class="modern-timer idle" style="position: absolute; top: -5px; right: 15px; z-index: 5;">Idle</div>` : `<div id="timer-cashier-${i}" style="display:none;"></div>`;
            
            container.innerHTML += `
                <div style="position: relative; display: flex; flex-direction: row; align-items: center; width: 100%; flex: 1; min-height: 0; justify-content: flex-end; gap: 5px;">
                    ${timerHtml}
                    <div id="cashier-queue-${i}" class="people-container" style="flex:1; height:100%; border: 1px dashed rgba(255,255,255,0.1);"></div>
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                        <div id="working-anim-cashier-${i}" class="working-anim">💵</div>
                        <div id="cashier-staff-${i}" class="staff cashier-staff" style="width: ${staffSize}px; height: ${staffSize}px; font-size: ${fontSize}px; min-height: ${staffSize}px; background-image: url('/static/cashier.png'); background-size: cover; background-position: center; background-color: transparent; border: none; color: transparent;">C${i+1}</div>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Clears and redraws baristas.
     */
    drawBaristas(count) {
        const container = document.getElementById('barista-staff-container');
        if (!container) return;

        container.innerHTML = '';
        for (let i = 0; i < count; i++) {
            container.innerHTML += `
                <div style="display: flex; flex-direction: column; align-items: center; gap: 5px;">
                    <div id="working-anim-${i}" class="working-anim">☕</div>
                    <div id="timer-barista-${i}" class="modern-timer idle" style="margin-bottom: 2px;">Idle</div>
                    <div id="barista-staff-${i}" class="staff barista-staff" style="background-image: url('/static/barista.png'); background-size: cover; background-position: center; background-color: transparent; border: none; color: transparent;">B${i+1}</div>
                    <div id="status-barista-${i}" style="font-size: 10px; color: #aaa; text-align: center; height: 12px; white-space: nowrap;">Idle</div>
                </div>
            `;
        }
    }

    /**
     * Briefly shows a working animation icon (like ☕ or 💵) above the staff member.
     */
    showWorkingIcon(staffElementId, iconStr) {
        const animEl = document.getElementById(staffElementId);
        if (animEl) {
            animEl.innerText = iconStr;
            animEl.style.opacity = '1';
            animEl.style.transform = 'translateY(-15px) scale(1.2)';
            setTimeout(() => {
                animEl.style.opacity = '0';
                animEl.style.transform = 'translateY(0) scale(1)';
            }, 600);
        }
    }

    /**
     * Starts the elapsed timer visual for a staff member.
     */
    startTimer(role, index, durationSecs) {
        const timerId = `timer-${role}-${index}`;
        const el = document.getElementById(timerId);
        if (!el) return;
        
        el.className = 'modern-timer active';
        el.innerText = '0.0s';
        
        let elapsed = 0;
        const totalDuration = durationSecs;
        const speedFactor = 0.5; // Sync with backend
        const realTickMs = 100;
        const simTickSec = (realTickMs / 1000) / speedFactor;
        
        if (role === 'cashier') {
            if (this.cashierTimers[index]) clearInterval(this.cashierTimers[index].interval);
        } else {
            if (this.baristaTimers[index]) clearInterval(this.baristaTimers[index].interval);
        }

        const interval = setInterval(() => {
            elapsed += simTickSec;
            if (elapsed >= totalDuration) {
                elapsed = totalDuration;
                if (el) el.innerText = elapsed.toFixed(1) + "s";
                clearInterval(interval);
            } else {
                if (el) el.innerText = elapsed.toFixed(1) + "s";
            }
        }, realTickMs);

        if (role === 'cashier') {
            this.cashierTimers[index] = { interval };
        } else {
            this.baristaTimers[index] = { interval };
            const statusEl = document.getElementById(`status-${role}-${index}`);
            if (statusEl) statusEl.innerText = "Brewing";
        }
    }

    /**
     * Resets a specific staff timer to idle.
     */
    resetTimer(role, index) {
        const timerEl = document.getElementById(`timer-${role}-${index}`);
        if (timerEl) {
            timerEl.innerText = 'Idle';
            timerEl.classList.add('idle');
            timerEl.classList.remove('active');
        }
    }

    /**
     * Cancels any active timers.
     */
    clearAllTimers() {
        for (let cIdx in this.cashierTimers) {
            clearInterval(this.cashierTimers[cIdx].interval);
        }
        this.cashierTimers = {};
        for (let bIdx in this.baristaTimers) {
            clearInterval(this.baristaTimers[bIdx].interval);
        }
        this.baristaTimers = {};
    }
}

export const staffRenderer = new StaffRenderer();
