import { configState } from './js/core/ConfigState.js';
import { SettingsModal } from './js/components/SettingsModal.js';
import { AreaPopovers } from './js/components/AreaPopovers.js';
import { dashboardStats } from './js/core/DashboardStats.js';
import { simulationClient } from './js/core/SimulationClient.js';
import { analyticsModal } from './js/ui/AnalyticsModal.js';
import { tableRenderer } from './js/ui/TableRenderer.js';
import { staffRenderer } from './js/ui/StaffRenderer.js';
import { customerRenderer } from './js/ui/CustomerRenderer.js';

// Initialize UI Components
const settingsModal = new SettingsModal();
const areaPopovers = new AreaPopovers();

// Listen to configuration updates to save state
configState.addEventListener('updated', (e) => {
    localStorage.setItem('catsySimConfig', JSON.stringify(e.detail));
    
    const toast = document.getElementById('toast');
    if (toast) {
        toast.style.opacity = '1';
        clearTimeout(toast.timeoutId);
        toast.timeoutId = setTimeout(() => {
            toast.style.opacity = '0';
        }, 3000);
    }
    
    // We intentionally do NOT auto-restart startSimulation() here.
    // The user must manually click 'Restart' to apply new settings,
    // to avoid wiping the active simulation UI abruptly when tweaking settings.
});

document.addEventListener('DOMContentLoaded', () => {
    loadConfigFromStorage();
});

function loadConfigFromStorage() {
    const saved = localStorage.getItem('catsySimConfig');
    if (!saved) return;
    try {
        const config = JSON.parse(saved);
        
        const directMap = {
            'cashiers': 'cfg-cashiers', 'baristas': 'cfg-baristas', 'tables': 'cfg-tables',
            'resArrivalMin': 'cfg-res-arrival-min', 'resArrivalMax': 'cfg-res-arrival-max',
            'arrival': 'cfg-arrival', 'duration': 'cfg-duration', 'warmupTime': 'cfg-warmup',
            'balkThreshold': 'cfg-balk-threshold', 'maxStrikes': 'cfg-max-strikes',
            'decideMin': 'cfg-decide-min', 'decideMax': 'cfg-decide-max',
            'payMin': 'cfg-pay-min', 'payMax': 'cfg-pay-max',
            'prepMin': 'cfg-prep-min', 'prepMax': 'cfg-prep-max',
            'dwellMin': 'cfg-dwell-min', 'dwellMax': 'cfg-dwell-max',
            'replications': 'cfg-replications', 'shiftHours': 'cfg-shift-hours'
        };
        
        const probMap = {
            'takeoutProb': 'cfg-takeout-prob', 'resProb': 'cfg-res-prob',
            'balkProb': 'cfg-balk-prob', 'renegeProb': 'cfg-renege-prob'
        };
        
        for (const [key, domId] of Object.entries(directMap)) {
            if (config[key] !== undefined) {
                const el = document.getElementById(domId);
                if (el) el.value = config[key];
            }
        }
        
        for (const [key, domId] of Object.entries(probMap)) {
            if (config[key] !== undefined) {
                const el = document.getElementById(domId);
                if (el) el.value = config[key] * 100; // Convert back to percentage
            }
        }
        
        // Also update the scenario select box if it matches an arrival value
        const scenarioSelect = document.getElementById('cfg-scenario');
        if (scenarioSelect && config.arrival) {
            let match = false;
            for (let option of scenarioSelect.options) {
                if (option.value == config.arrival && option.value !== 'custom') {
                    scenarioSelect.value = option.value;
                    match = true;
                    break;
                }
            }
            if (!match) scenarioSelect.value = 'custom';
        }
        
        // Update the span displays for quick controls
        const dispCashiers = document.getElementById('disp-cashiers');
        if (dispCashiers && config.cashiers) dispCashiers.innerText = config.cashiers;
        const dispBaristas = document.getElementById('disp-baristas');
        if (dispBaristas && config.baristas) dispBaristas.innerText = config.baristas;
        const dispTables = document.getElementById('disp-tables');
        if (dispTables && config.tables) dispTables.innerText = config.tables;
        
    } catch (e) {
        console.error('Failed to parse saved config', e);
    }
}
configState.refreshFromDOM();

const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnRestart = document.getElementById('btn-restart');
const statusDot = document.getElementById('connection-status');
const statusText = document.getElementById('status-text');
const floatingLayer = document.getElementById('floating-layer');

let customerTableMap = new Map(); // Maps customer ID to table element ID
let customerFrustrationMap = new Map(); // Maps customer ID to frustration level (0-3)

let cashierQueueLens = []; // Array of lengths per cashier
let waitingAreaLen = 0;
let pickupAreaLen = 0;
let totalCustomers = 0;
let servedCustomers = 0;
let lostCustomers = 0;
let totalDineIn = 0;
let totalTakeout = 0;
let totalReservations = 0;
let missedReservations = 0;
const cashierOffsets = new Map();
const customerCashierMap = new Map();
const waitingAreaOffsets = new Map();
const pickupAreaOffsets = new Map();
const customerBaristaMap = new Map();
let availableTables = [];
let availableResTables = [];
let cashierTimers = {};
let baristaTimers = {};

function enforceBounds() {
    const cashiersEl = document.getElementById('cfg-cashiers');
    if (cashiersEl) {
        let cVal = parseInt(cashiersEl.value);
        if (isNaN(cVal) || cVal < 1) cashiersEl.value = 1;
        else if (cVal > 10) cashiersEl.value = 10;
    }
    
    const baristasEl = document.getElementById('cfg-baristas');
    if (baristasEl) {
        let bVal = parseInt(baristasEl.value);
        if (isNaN(bVal) || bVal < 1) baristasEl.value = 1;
        else if (bVal > 15) baristasEl.value = 15;
    }
}

function startSimulation() {
    enforceBounds();
    
    // Ensure the backend isn't stuck in a paused state (e.g. if the user hit restart while the settings modal was open)
    fetch('/api/resume', { method: 'POST' }).catch(e => console.error(e));
    simulationClient.resume(); // also ensure frontend is unpaused
    
    simulationClient.connect();
}

window.addEventListener('sim:connected', () => {
    if (statusDot) statusDot.className = 'dot green';
    if (statusText) statusText.innerText = 'Connected';
    if (btnStart) {
        btnStart.disabled = false;
        btnStart.innerText = '⏸ Pause';
        btnStart.classList.add('playing');
    }
    if (btnStop) btnStop.disabled = false;
    if (btnRestart) btnRestart.disabled = false;
    
    const warmupTime = configState.getConfig().warmupTime || 0;
    const warmupIndicator = document.getElementById('warmup-indicator');
    if (warmupIndicator) {
        if (warmupTime > 0) {
            warmupIndicator.style.display = 'inline-block';
        } else {
            warmupIndicator.style.display = 'none';
        }
    }
    resetSimulation();
});

window.addEventListener('sim:disconnected', () => {
    if (statusDot) statusDot.className = 'status-indicator__dot status-indicator__dot--disconnected';
    if (statusText) statusText.innerText = 'Disconnected';
    if (btnStart) {
        btnStart.disabled = false;
        btnStart.innerText = '▶ Play';
        btnStart.classList.remove('playing');
    }
    if (btnStop) btnStop.disabled = true;
    if (btnRestart) btnRestart.disabled = true;
    
    // Stop all visual timers immediately
    for (const key in cashierTimers) {
        if (cashierTimers[key] && cashierTimers[key].interval) {
            clearInterval(cashierTimers[key].interval);
        }
    }
    for (const key in baristaTimers) {
        if (baristaTimers[key] && baristaTimers[key].interval) {
            clearInterval(baristaTimers[key].interval);
        }
    }
    staffRenderer.clearAllTimers();
});

window.addEventListener('sim:event', (e) => {
    handleEvent(e.detail);
});

btnStart.addEventListener('click', () => {
    // If not connected, start the simulation
    if (!simulationClient.socket || simulationClient.socket.readyState !== WebSocket.OPEN) {
        startSimulation();
        return;
    }
    
    // If already connected, toggle pause/resume
    if (simulationClient.isPaused) {
        // Resume
        simulationClient.resume();
        fetch('/api/resume', { method: 'POST' }).catch(e => console.error(e));
        btnStart.innerText = '⏸ Pause';
        btnStart.classList.add('playing');
    } else {
        // Pause
        simulationClient.pause();
        fetch('/api/pause', { method: 'POST' }).catch(e => console.error(e));
        btnStart.innerText = '▶ Resume';
        btnStart.classList.remove('playing');
    }
});

btnStop.addEventListener('click', () => {
    simulationClient.disconnect();
    btnStart.disabled = false;
    btnStop.disabled = true;
    if (btnRestart) btnRestart.disabled = true;
});

if (btnRestart) {
    btnRestart.addEventListener('click', () => {
        simulationClient.disconnect();
        // Slight delay to ensure the disconnect processes completely before reconnecting
        setTimeout(() => {
            startSimulation();
        }, 100);
    });
}



function resetSimulation() {
    floatingLayer.innerHTML = '';
    cashierOffsets.clear();
    customerCashierMap.clear();
    waitingAreaOffsets.clear();
    pickupAreaOffsets.clear();
    customerBaristaMap.clear();
    // Clear all manual intervals
    for (const key in cashierTimers) {
        if (cashierTimers[key] && cashierTimers[key].interval) {
            clearInterval(cashierTimers[key].interval);
        }
    }
    cashierTimers = {};
    
    for (const key in baristaTimers) {
        if (baristaTimers[key] && baristaTimers[key].interval) {
            clearInterval(baristaTimers[key].interval);
        }
    }
    baristaTimers = {};

    staffRenderer.clearAllTimers();
    customerRenderer.clearAll();
    customerTableMap.clear();
    customerFrustrationMap.clear();
    totalCustomers = 0;
    servedCustomers = 0;
    lostCustomers = 0;
    totalDineIn = 0;
    totalTakeout = 0;
    cashierQueueLens = [];
    waitingAreaLen = 0;
    pickupAreaLen = 0;
    
    // Reset Dashboard UI values
    const paceEl = document.getElementById('current-pace');
    if (paceEl) paceEl.innerText = 'Quiet 💤';
    
    document.getElementById('sim-time').innerText = '0.0s';
    document.getElementById('total-customers').innerText = '0';
    document.getElementById('served-customers').innerText = '0';
    document.getElementById('lost-customers').innerText = '0';
    document.getElementById('cashier-queue-len').innerText = '0';
    document.getElementById('waiting-area-len').innerText = '0';
    
    // Dynamically draw cashiers
    const cashiersCount = parseInt(document.getElementById('cfg-cashiers').value);
    staffRenderer.drawCashiers(cashiersCount);
    
    // Initialize queue lengths array
    cashierQueueLens = Array(cashiersCount).fill(0);

    // Dynamically draw baristas
    const baristasCount = parseInt(document.getElementById('cfg-baristas').value);
    staffRenderer.drawBaristas(baristasCount);
    
    // Dynamically draw tables
    const tablesCount = parseInt(document.getElementById('cfg-tables').value);
    tableRenderer.draw(tablesCount);
}




function updateStats(time) {
    document.getElementById('sim-time').innerText = time.toFixed(1) + 's';
    document.getElementById('total-customers').innerText = totalCustomers;
    document.getElementById('served-customers').innerText = servedCustomers;
    document.getElementById('lost-customers').innerText = lostCustomers;
    document.getElementById('total-dine-in').innerText = totalDineIn;
    document.getElementById('total-takeout').innerText = totalTakeout;
    
    // Sum all individual cashier queues
    const totalCashierQueue = cashierQueueLens.reduce((a, b) => a + b, 0);
    document.getElementById('cashier-queue-len').innerText = totalCashierQueue;
    
    document.getElementById('waiting-area-len').innerText = waitingAreaLen + pickupAreaLen;
}


function handleEvent(data) {
    if (tableRenderer && data.time) {
        tableRenderer.tickTimers(data.time);
    }
    if (data.event === 'warmup_complete') {
        document.getElementById('warmup-indicator').style.display = 'none';
        totalCustomers = 0;
        servedCustomers = 0;
        lostCustomers = 0;
        totalDineIn = 0;
        totalTakeout = 0;
        totalReservations = 0;
        missedReservations = 0;
        document.getElementById('total-customers').innerText = totalCustomers;
        document.getElementById('served-customers').innerText = servedCustomers;
        document.getElementById('lost-customers').innerText = lostCustomers;
        document.getElementById('total-dine-in').innerText = totalDineIn;
        document.getElementById('total-takeout').innerText = totalTakeout;
        const totalResEl = document.getElementById('total-reservations');
        if (totalResEl) totalResEl.innerText = totalReservations;
        const missedResEl = document.getElementById('missed-reservations');
        if (missedResEl) missedResEl.innerText = missedReservations;
        return;
    }
    if (data.event === 'pace_change') {
        const paceEl = document.getElementById('current-pace');
        if (paceEl) {
            const pace = data.pace;
            let color = '#3498db'; // Steady
            let text = 'Steady ☕';
            if (pace === 'Peak') {
                color = '#e74c3c';
                text = 'Peak 🔥';
            } else if (pace === 'Quiet') {
                color = '#9b59b6';
                text = 'Quiet 💤';
            }
            paceEl.style.color = color;
            paceEl.innerText = text;
        }
        return;
    }
    
    const id = data.customer_id;
    
    switch(data.event) {
        case 'arrive':
            totalCustomers++;
            document.getElementById('total-customers').innerText = totalCustomers;
            const numId = parseInt(id.replace('Cust-', '')) || 0;
            customerRenderer.moveCustomer(id, 'entrance', numId);
            break;
            
        case 'balking_start':
            const balkStartEl = customerRenderer.customers.get(id);
            if (balkStartEl) balkStartEl.classList.add('customer--walkout');
            customerRenderer.incrementFrustration(id, 4);
            break;
            
        case 'balk_leave':
            lostCustomers++;
            const balkEl = customerRenderer.customers.get(id);
            if (balkEl) {
                const badge = balkEl.querySelector('.customer__badge');
                if (badge) {
                    badge.innerText = '🙅';
                    badge.style.display = 'flex';
                }
                // Storm out from entrance
                balkEl.classList.add('customer--walkout');
                balkEl.style.transition = 'transform 3.5s ease-in, opacity 3.5s ease-in';
                balkEl.style.transform += ' translate(-80px, 200px)';
                balkEl.style.opacity = '0';
                setTimeout(() => {
                    customerRenderer.removeCustomer(id);
                }, 3500);
            } else {
                customerRenderer.removeCustomer(id);
            }
            break;
            
        case 'frustrated_waiting':
            customerRenderer.incrementFrustration(id, 1);
            break;
            
        case 'patience_warning':
            customerRenderer.incrementFrustration(id, 2);
            break;
            
        case 'prep_waiting_frustration':
            customerRenderer.incrementFrustration(id, 3);
            break;
            
        case 'renege_leave':
            lostCustomers++; // Count them as a lost walkout
            
            // Remove them from the queue tracking
            const cIdxToLeave = data.cashier_index;
            if (isNaN(cashierQueueLens[cIdxToLeave]) || cashierQueueLens[cIdxToLeave] === undefined) { cashierQueueLens[cIdxToLeave] = 0; }
            cashierQueueLens[cIdxToLeave] = Math.max(0, cashierQueueLens[cIdxToLeave] - 1);
            
            const leavingOffset = cashierOffsets.get(id);
            
            // Advance everyone behind them forward
            for (let [custId, cIdx] of customerCashierMap.entries()) {
                if (cIdx === cIdxToLeave && custId !== id) {
                    let currentOffset = cashierOffsets.get(custId);
                    if (currentOffset !== undefined && currentOffset > leavingOffset) {
                        let newOffset = currentOffset - 1;
                        cashierOffsets.set(custId, newOffset);
                        customerRenderer.moveCustomer(custId, `cashier-queue-${cIdxToLeave}`, newOffset);
                    }
                }
            }
            
            // Remove from maps
            cashierOffsets.delete(id);
            customerCashierMap.delete(id);
            
            // Animate them storming out in frustration
            const renegeEl = customerRenderer.customers.get(id);
            if (renegeEl) {
                renegeEl.classList.add('customer--walkout');
                const badge = renegeEl.querySelector('.customer__badge');
                if (badge) {
                    badge.innerText = '🏃';
                    badge.animate([
                        { transform: 'scale(1)' },
                        { transform: 'scale(1.5)' },
                        { transform: 'scale(1)' }
                    ], {
                        duration: 600,
                        iterations: Infinity,
                        easing: 'ease-in-out'
                    });
                }
                
                // Instantly step OUT of the queue so the person behind them doesn't walk through them
                renegeEl.style.transform += ' translate(0px, 40px)';
                
                // Wait for 2 seconds so the user can clearly see them get frustrated
                setTimeout(() => {
                    // Then they storm out completely
                    renegeEl.style.transition = 'transform 3.5s ease-in, opacity 3.5s ease-in';
                    renegeEl.style.transform += ' translate(-150px, 200px)';
                    renegeEl.style.opacity = '0';
                    setTimeout(() => {
                        if (renegeEl.parentNode) renegeEl.parentNode.removeChild(renegeEl);
                        customerRenderer.customers.delete(id);
                    }, 3500);
                }, 2000);
            }
            break;
            
        case 'vip_checkin':
            const vipCashierIdx = data.cashier_index !== undefined ? data.cashier_index : 0;
            customerRenderer.moveCustomer(id, `vip-checkin-${vipCashierIdx}`);
            customerRenderer.markAsVIP(id);
            // Small timeout to let the movement start before triggering the animation
            setTimeout(() => {
                customerRenderer.triggerVIPAnimation(id);
            }, 300);
            break;

        case 'queue_cashier':
            const cIdx = data.cashier_index;
            customerCashierMap.set(id, cIdx);
            
            if (isNaN(cashierQueueLens[cIdx]) || cashierQueueLens[cIdx] === undefined) { cashierQueueLens[cIdx] = 0; }
            cashierQueueLens[cIdx]++;
            cashierOffsets.set(id, cashierQueueLens[cIdx] - 1);
            customerRenderer.moveCustomer(id, `cashier-queue-${cIdx}`, cashierQueueLens[cIdx] - 1);
            break;
            
        case 'start_deciding':
            const decIdx = data.cashier_index;
            if (isNaN(cashierQueueLens[decIdx]) || cashierQueueLens[decIdx] === undefined) { cashierQueueLens[decIdx] = 0; }
            cashierQueueLens[decIdx] = Math.max(0, cashierQueueLens[decIdx] - 1);
            
            customerRenderer.moveCustomer(id, `cashier-queue-${decIdx}`, -1);
            
            const decEl = customerRenderer.customers.get(id);
            if (decEl) {
                const badge = decEl.querySelector('.customer__badge');
                if (badge) {
                    badge.innerText = '💭';
                    badge.style.display = 'flex';
                }
            }
            
            // Start the cashier countdown timer!
            if (data.duration) {
                if (cashierTimers[decIdx]) clearInterval(cashierTimers[decIdx].interval);
                
                let elapsed = 0;
                const totalDuration = data.duration;
                const speedFactor = 0.5; // Backend RealtimeEnvironment factor
                const realTickMs = 100;
                const simTickSec = (realTickMs / 1000) / speedFactor;
                
                const timerEl = document.getElementById(`timer-cashier-${decIdx}`);
                if (timerEl) {
                    timerEl.innerText = '0.0s';
                    timerEl.classList.remove('idle');
                }
                
                const interval = setInterval(() => {
                    if (simulationClient && simulationClient.isPaused) return;
                    
                    elapsed += simTickSec;
                    if (elapsed >= totalDuration) {
                        elapsed = totalDuration;
                        clearInterval(interval);
                        // Freeze on final time until customer walks away
                        if (timerEl) timerEl.innerText = elapsed.toFixed(1) + 's';
                    } else {
                        if (timerEl) timerEl.innerText = elapsed.toFixed(1) + 's';
                    }
                }, realTickMs);
                cashierTimers[decIdx] = { interval };
            }
            
            // Advance everyone else in this specific queue forward by 1 spot
            for (let [custId, cIdx] of customerCashierMap.entries()) {
                if (cIdx === decIdx && custId !== id) {
                    let currentOffset = cashierOffsets.get(custId);
                    if (currentOffset !== undefined && currentOffset > 0) {
                        let newOffset = currentOffset - 1;
                        cashierOffsets.set(custId, newOffset);
                        customerRenderer.moveCustomer(custId, `cashier-queue-${decIdx}`, newOffset);
                    }
                }
            }
            break;
            
        case 'start_paying':
            // Customer is paying, no physical move needed, just logical state
            const payingCIdx = customerCashierMap.get(id);
            if (payingCIdx !== undefined) {
                const cAnim = document.getElementById(`working-anim-cashier-${payingCIdx}`);
                if (cAnim) cAnim.style.display = 'block';
            }
            
            const payEl = customerRenderer.customers.get(id);
            if (payEl) {
                const badge = payEl.querySelector('.customer__badge');
                if (badge) {
                    badge.innerText = '💳';
                    badge.style.display = 'flex';
                }
            }
            break;
            
        case 'waiting_pickup':
            totalTakeout++;
            document.getElementById('total-takeout').innerText = totalTakeout;
            // Go to waiting/pickup area if tables are full, or if waiting for takeout
            pickupAreaLen++;
            pickupAreaOffsets.set(id, pickupAreaLen - 1);
            customerRenderer.moveCustomer(id, 'pickup-area', pickupAreaLen - 1);
            customerRenderer.updateFrustrationVisuals(id);
            
            // Customer left the cashier, reset the cashier timer
            const leftCIdxTakeout = customerCashierMap.get(id);
            if (leftCIdxTakeout !== undefined && cashierTimers[leftCIdxTakeout]) {
                clearInterval(cashierTimers[leftCIdxTakeout].interval);
                const timerEl = document.getElementById(`timer-cashier-${leftCIdxTakeout}`);
                if (timerEl) {
                    timerEl.innerText = 'Idle';
                    timerEl.classList.add('idle');
                }
                const cAnim = document.getElementById(`working-anim-cashier-${leftCIdxTakeout}`);
                if (cAnim) cAnim.style.display = 'none';
                showPopUpIcon(`cashier-staff-${leftCIdxTakeout}`, '💰');
            }
            break;
            
        case 'waiting_table':
            totalDineIn++;
            document.getElementById('total-dine-in').innerText = totalDineIn;
            // Go to waiting/pickup area if tables are full, or if waiting for takeout
            waitingAreaLen++;
            waitingAreaOffsets.set(id, waitingAreaLen - 1);
            customerRenderer.moveCustomer(id, 'waiting-area', waitingAreaLen - 1);
            customerRenderer.updateFrustrationVisuals(id);
            
            // Customer left the cashier, reset the cashier timer
            const leftCIdx = customerCashierMap.get(id);
            if (leftCIdx !== undefined && cashierTimers[leftCIdx]) {
                clearInterval(cashierTimers[leftCIdx].interval);
                const timerEl = document.getElementById(`timer-cashier-${leftCIdx}`);
                if (timerEl) {
                    timerEl.innerText = 'Idle';
                    timerEl.classList.add('idle');
                }
                const cAnim = document.getElementById(`working-anim-cashier-${leftCIdx}`);
                if (cAnim) cAnim.style.display = 'none';
                showPopUpIcon(`cashier-staff-${leftCIdx}`, '💰');
            }
            break;
            
        case 'table_reserved':
            totalReservations++;
            const totalResEl = document.getElementById('total-reservations');
            if (totalResEl) totalResEl.innerText = totalReservations;
            tableRenderer.setReserved(data.table_id, data.time, data.limit);
            break;
            
        case 'table_unreserved':
            tableRenderer.setUnreserved(data.table_id);
            break;
            
        case 'missed_reservation':
            missedReservations++;
            const missedResEl = document.getElementById('missed-reservations');
            if (missedResEl) missedResEl.innerText = missedReservations;
            break;
            
        case 'seated_waiting_order':
            waitingAreaLen = Math.max(0, waitingAreaLen - 1);
            
            const tableId = data.table_id;
            customerTableMap.set(id, tableId);
            customerRenderer.moveCustomer(id, `table-${tableId}`);
            
            tableRenderer.setOccupied(tableId, data.time, data.is_reservation, 'waiting');
            break;
            
        case 'start_prep':
            // Barista started making it. We don't move the customer, they are still at the table.
            const bIdx = data.barista_index;
            customerBaristaMap.set(id, bIdx);
            
            const bStatus = document.getElementById(`status-barista-${bIdx}`);
            if (bStatus) {
                bStatus.innerText = `Prep for #${id.replace('Cust-', '')}`;
                bStatus.style.color = '#e94f37';
            }
            
            const bAnim = document.getElementById(`working-anim-${bIdx}`);
            if (bAnim) bAnim.style.display = 'block';
            
            // Start the barista countdown timer
            if (data.duration) {
                if (baristaTimers[bIdx]) clearInterval(baristaTimers[bIdx].interval);
                
                let elapsed = 0;
                const totalDuration = data.duration;
                const speedFactor = 0.5; // Backend RealtimeEnvironment factor
                const realTickMs = 100;
                const simTickSec = (realTickMs / 1000) / speedFactor;
                
                const timerEl = document.getElementById(`timer-barista-${bIdx}`);
                if (timerEl) {
                    timerEl.innerText = '0.0s';
                    timerEl.classList.remove('idle');
                }
                
                const interval = setInterval(() => {
                    if (simulationClient && simulationClient.isPaused) return;
                    
                    elapsed += simTickSec;
                    if (elapsed >= totalDuration) {
                        elapsed = totalDuration;
                        clearInterval(interval);
                        if (timerEl) timerEl.innerText = elapsed.toFixed(1) + 's';
                    } else {
                        if (timerEl) timerEl.innerText = elapsed.toFixed(1) + 's';
                    }
                }, realTickMs);
                baristaTimers[bIdx] = { interval };
            }
            break;
            
        case 'served':
            customerRenderer.frustrationMap.set(id, 0);
            customerRenderer.updateFrustrationVisuals(id);
            // Order arrived! Time to eat.
            const tId = customerTableMap.get(id);
            if (tId) {
                // If it's a reserved customer, badge has already been hidden during setOccupied, but pass false to be safe
                tableRenderer.setOccupied(tId, data.time, false, 'eating');
            }
            
            const finishedBIdx = customerBaristaMap.get(id);
            if (finishedBIdx !== undefined) {
                if (baristaTimers[finishedBIdx]) clearInterval(baristaTimers[finishedBIdx].interval);
                const timerEl = document.getElementById(`timer-barista-${finishedBIdx}`);
                if (timerEl) {
                    timerEl.innerText = 'Idle';
                    timerEl.classList.add('idle');
                }
                const finishedBStatus = document.getElementById(`status-barista-${finishedBIdx}`);
                if (finishedBStatus) {
                    finishedBStatus.innerText = 'Idle';
                    finishedBStatus.style.color = '#aaa';
                }
                const bAnim = document.getElementById(`working-anim-${finishedBIdx}`);
                if (bAnim) bAnim.style.display = 'none';
                
                customerBaristaMap.delete(id);
                showPopUpIcon(`barista-staff-${finishedBIdx}`, '☕');
            }
            break;
            
        case 'leave':
            servedCustomers++;
            const el = customerRenderer.customers.get(id);
            if (el) {
                el.style.transform += ' translate(500px, 0)';
                el.style.opacity = '0';
                setTimeout(() => {
                    if (el.parentNode) el.parentNode.removeChild(el);
                    customerRenderer.customers.delete(id);
                }, 800);
            }
            
            // Check if they were in the waiting/pickup area (Takeout customers)
            if (waitingAreaOffsets.has(id)) {
                waitingAreaLen = Math.max(0, waitingAreaLen - 1);
                waitingAreaOffsets.delete(id);
            } else if (pickupAreaOffsets.has(id)) {
                pickupAreaLen = Math.max(0, pickupAreaLen - 1);
                pickupAreaOffsets.delete(id);
            }
            
            // Clear table status and mark table as available again (Dine-in customers)
            const leftTableId = customerTableMap.get(id);
            if (leftTableId) {
                tableRenderer.setEmpty(leftTableId);
                customerTableMap.delete(id);
            }
            break;
            
        case 'sim_end':
            statusDot.className = 'dot';
            statusDot.style.backgroundColor = '#4a90e2';
            statusText.innerText = 'Completed';
            break;
    }
    
    updateStats(data.time);
}
