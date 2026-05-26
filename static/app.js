let socket = null;
let customers = new Map();
let customerTableMap = new Map(); // Maps customer ID to table element ID
let customerFrustrationMap = new Map(); // Maps customer ID to frustration level (0-3)

// Stats
let totalCustomers = 0;
let servedCustomers = 0;
let lostCustomers = 0;
let totalDineIn = 0;
let totalTakeout = 0;
let cashierQueueLen = 0;
let waitingAreaLen = 0;
let pickupAreaLen = 0;

// DOM Elements
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const statusDot = document.getElementById('connection-status');
const statusText = document.getElementById('status-text');
const floatingLayer = document.getElementById('floating-layer');
const scenarioSelect = document.getElementById('cfg-scenario');
const arrivalInput = document.getElementById('cfg-arrival');

// Settings Modal
const btnSettings = document.getElementById('btn-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const settingsScrim = document.getElementById('settings-scrim');

btnSettings.addEventListener('click', () => {
    settingsScrim.classList.add('scrim--active');
});

btnCloseSettings.addEventListener('click', () => {
    settingsScrim.classList.remove('scrim--active');
});

// Scenario logic
scenarioSelect.addEventListener('change', (e) => {
    if (e.target.value !== 'custom') {
        arrivalInput.value = e.target.value;
    }
});

arrivalInput.addEventListener('input', () => {
    scenarioSelect.value = 'custom';
});

let cashierQueueLens = []; // Array of lengths per cashier

// Position Maps (to offset people in queues)
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
    if (parseInt(cashiersEl.value) > 10) cashiersEl.value = 10;
    if (parseInt(cashiersEl.value) < 1) cashiersEl.value = 1;
    
    const baristasEl = document.getElementById('cfg-baristas');
    if (parseInt(baristasEl.value) > 15) baristasEl.value = 15;
    if (parseInt(baristasEl.value) < 1) baristasEl.value = 1;
}

btnStart.addEventListener('click', () => {
    if (socket) return;
    
    enforceBounds();
    // Get dynamic config
    const cashiers = document.getElementById('cfg-cashiers').value;
    const baristas = document.getElementById('cfg-baristas').value;
    const tables = document.getElementById('cfg-tables').value;
    const resTables = document.getElementById('cfg-res-tables').value;
    const arrival = document.getElementById('cfg-arrival').value;
    
    const decideMin = document.getElementById('cfg-decide-min').value;
    const decideMax = document.getElementById('cfg-decide-max').value;
    const payMin = document.getElementById('cfg-pay-min').value;
    const payMax = document.getElementById('cfg-pay-max').value;
    const prepMin = document.getElementById('cfg-prep-min').value;
    const prepMax = document.getElementById('cfg-prep-max').value;
    const dwellMin = document.getElementById('cfg-dwell-min').value;
    const dwellMax = document.getElementById('cfg-dwell-max').value;
    const duration = document.getElementById('cfg-duration').value;
    const balkProb = document.getElementById('cfg-balk-prob').value / 100.0;
    const renegeProb = document.getElementById('cfg-renege-prob').value / 100.0;
    const maxStrikes = document.getElementById('cfg-max-strikes').value;
    const takeoutProb = (document.getElementById('cfg-takeout-prob')?.value || 50) / 100.0;
    const resProb = (document.getElementById('cfg-res-prob')?.value || 20) / 100.0;
    const warmupTime = document.getElementById('cfg-warmup')?.value || 0;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const wsUrl = `${wsProtocol}${window.location.host}/ws?cashiers=${cashiers}&baristas=${baristas}&tables=${tables}&resTables=${resTables}&arrival=${arrival}&decideMin=${decideMin}&decideMax=${decideMax}&payMin=${payMin}&payMax=${payMax}&prepMin=${prepMin}&prepMax=${prepMax}&dwellMin=${dwellMin}&dwellMax=${dwellMax}&duration=${duration}&balkProb=${balkProb}&renegeProb=${renegeProb}&maxStrikes=${maxStrikes}&takeoutProb=${takeoutProb}&resProb=${resProb}&warmupTime=${warmupTime}`;
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        statusDot.className = 'dot green';
        statusText.innerText = 'Connected';
        
        const warmupIndicator = document.getElementById('warmup-indicator');
        if (warmupTime > 0) {
            warmupIndicator.style.display = 'inline-block';
        } else {
            warmupIndicator.style.display = 'none';
        }
        resetSimulation();
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleEvent(data);
    };

    socket.onclose = () => {
        statusDot.className = 'dot red';
        statusText.innerText = 'Disconnected';
        socket = null;
    };
});

btnStop.addEventListener('click', () => {
    if (socket) {
        socket.close();
    }
});

// Analytics Modal Logic
const btnAnalyze = document.getElementById('btn-analyze');
const modal = document.getElementById('analytics-modal');
const btnCloseModal = document.getElementById('btn-close-modal');

if (btnAnalyze) {
    btnAnalyze.addEventListener('click', async () => {
        enforceBounds();
        modal.style.display = 'flex';
        const loadingDiv = document.getElementById('analytics-loading');
        loadingDiv.style.display = 'block';
        loadingDiv.innerHTML = '<i id="analyzing-text" style="color:#f1c40f;">Analyzing.</i>';
        document.getElementById('analytics-content').style.display = 'none';
        
        // Animate the dots so user knows it's working
        let dotCount = 1;
        const animInterval = setInterval(() => {
            dotCount = (dotCount % 3) + 1;
            const dots = '.'.repeat(dotCount);
            const el = document.getElementById('analyzing-text');
            if (el) el.innerText = 'Analyzing' + dots;
        }, 500);
        
        const replicationsCount = parseInt(document.getElementById('cfg-replications')?.value || 10);
        const shiftHours = parseFloat(document.getElementById('cfg-shift-hours')?.value || 2);
        const durationSeconds = Math.floor(shiftHours * 3600);
        
        document.getElementById('analytics-subtitle').innerText = `Averaged over ${replicationsCount} independent simulated days (${shiftHours} hours each, minus warm-up).`;
        
        const payload = {
            cashiers: parseInt(document.getElementById('cfg-cashiers').value),
            baristas: parseInt(document.getElementById('cfg-baristas').value),
            tables: parseInt(document.getElementById('cfg-tables').value),
            resTables: parseInt(document.getElementById('cfg-res-tables').value),
            arrival: parseFloat(document.getElementById('cfg-arrival').value),
            decideMin: parseFloat(document.getElementById('cfg-decide-min').value),
            decideMax: parseFloat(document.getElementById('cfg-decide-max').value),
            payMin: parseFloat(document.getElementById('cfg-pay-min').value),
            payMax: parseFloat(document.getElementById('cfg-pay-max').value),
            prepMin: parseFloat(document.getElementById('cfg-prep-min').value),
            prepMax: parseFloat(document.getElementById('cfg-prep-max').value),
            dwellMin: parseFloat(document.getElementById('cfg-dwell-min').value),
            dwellMax: parseFloat(document.getElementById('cfg-dwell-max').value),
            balkProb: parseFloat(document.getElementById('cfg-balk-prob').value) / 100.0,
            renegeProb: parseFloat(document.getElementById('cfg-renege-prob').value) / 100.0,
            maxStrikes: parseInt(document.getElementById('cfg-max-strikes').value),
            takeoutProb: (parseFloat(document.getElementById('cfg-takeout-prob')?.value || 50)) / 100.0,
            resProb: (parseFloat(document.getElementById('cfg-res-prob')?.value || 20)) / 100.0,
            warmupTime: parseFloat(document.getElementById('cfg-warmup')?.value || 0),
            replications: replicationsCount,
            duration: durationSeconds
        };

        try {
            const res = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            clearInterval(animInterval);
            
            if (!res.ok) {
                throw new Error("Server returned " + res.status);
            }
            
            const data = await res.json();
            
            loadingDiv.style.display = 'none';
            document.getElementById('analytics-content').style.display = 'block';
            
            document.getElementById('res-wait').innerText = data.avg_wait_time.toFixed(1) + 's';
            document.getElementById('res-cycle').innerText = (data.avg_cycle_time / 60).toFixed(1) + ' mins';
            document.getElementById('res-throughput').innerText = data.throughput_per_hour.toFixed(0) + ' / hr';
        } catch (e) {
            clearInterval(animInterval);
            loadingDiv.innerHTML = '<span style="color:#e74c3c">Error: Analysis timed out or failed. Check configuration.</span>';
        }
    });
}

if (btnCloseModal) {
    btnCloseModal.addEventListener('click', () => {
        modal.style.display = 'none';
    });
}

function resetSimulation() {
    floatingLayer.innerHTML = '';
    cashierOffsets.clear();
    customerCashierMap.clear();
    waitingAreaOffsets.clear();
    pickupAreaOffsets.clear();
    customerBaristaMap.clear();
    for (let cIdx in cashierTimers) {
        clearInterval(cashierTimers[cIdx].interval);
    }
    cashierTimers = {};
    for (let bIdx in baristaTimers) {
        clearInterval(baristaTimers[bIdx].interval);
    }
    baristaTimers = {};
    customers.clear();
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
    
    // Dynamically draw cashiers
    const cashiersCount = parseInt(document.getElementById('cfg-cashiers').value);
    const cashierContainer = document.getElementById('cashier-desk-container');
    
    // Initialize queue lengths array
    cashierQueueLens = Array(cashiersCount).fill(0);
    
    if (cashierContainer) {
        cashierContainer.innerHTML = '';
        
        let staffSize = 40;
        let fontSize = 14;
        let showTimer = true;
        
        if (cashiersCount > 4) {
            staffSize = 24;
            fontSize = 9;
            showTimer = false;
        }
        
        for (let i = 0; i < cashiersCount; i++) {
            const timerHtml = showTimer ? `<div id="timer-cashier-${i}" style="font-size: 9px; color: #f39c12; font-family: monospace; line-height: 1; margin-bottom: 3px;">Idle</div>` : `<div id="timer-cashier-${i}" style="display:none;"></div>`;
            
            cashierContainer.innerHTML += `
                <div style="display: flex; flex-direction: row; align-items: center; width: 100%; flex: 1; min-height: 0; justify-content: flex-end; gap: 5px;">
                    <div id="cashier-queue-${i}" class="people-container" style="flex:1; height:100%; border: 1px dashed rgba(255,255,255,0.1);"></div>
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                        ${timerHtml}
                        <div id="cashier-staff-${i}" class="staff cashier-staff" style="width: ${staffSize}px; height: ${staffSize}px; font-size: ${fontSize}px; min-height: ${staffSize}px; background-image: url('/static/cashier.png'); background-size: cover; background-position: center; background-color: transparent; border: none; color: transparent;">C${i+1}</div>
                    </div>
                </div>
            `;
        }
    }

    // Dynamically draw baristas
    const baristasCount = parseInt(document.getElementById('cfg-baristas').value);
    const baristaContainer = document.getElementById('barista-staff-container');
    if (baristaContainer) {
        baristaContainer.innerHTML = '';
        for (let i = 0; i < baristasCount; i++) {
            baristaContainer.innerHTML += `
                <div style="display: flex; flex-direction: column; align-items: center; gap: 5px;">
                    <div id="timer-barista-${i}" style="font-size: 10px; color: #f39c12; font-family: monospace; height: 12px;">Idle</div>
                    <div id="barista-staff-${i}" class="staff barista-staff" style="background-image: url('/static/barista.png'); background-size: cover; background-position: center; background-color: transparent; border: none; color: transparent;">B${i+1}</div>
                    <div id="status-barista-${i}" style="font-size: 10px; color: #aaa; text-align: center; height: 12px; white-space: nowrap;">Idle</div>
                </div>
            `;
        }
    }
    
    // Dynamically draw tables and initialize available tables list
    const tablesCount = parseInt(document.getElementById('cfg-tables').value);
    const resTablesCount = parseInt(document.getElementById('cfg-res-tables').value);
    const tablesContainer = document.getElementById('tables');
    availableTables = [];
    availableResTables = [];
    if (tablesContainer) {
        tablesContainer.innerHTML = '';
        for (let i = 1; i <= resTablesCount; i++) {
            tablesContainer.innerHTML += `
                <div class="table table--reserved" id="res-table-${i}">
                    <div class="table__badge">[R]</div>
                    <div class="table__status" id="status-res-table-${i}">Reserved</div>
                </div>
            `;
            availableResTables.push(`res-table-${i}`);
        }
        for (let i = 1; i <= tablesCount; i++) {
            tablesContainer.innerHTML += `
                <div class="table" id="table-${i}">
                    <div class="table__status" id="status-table-${i}"></div>
                </div>
            `;
            availableTables.push(`table-${i}`);
        }
    }
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

// Coordinate calculation helpers
function getTargetCoords(elementId, offsetIndex = 0) {
    const el = document.getElementById(elementId);
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    
    // Base center point
    let x = rect.left + rect.width / 2 - 12.5;
    let y = rect.top + rect.height / 2 - 12.5;
    
    if (elementId === 'entrance') {
        // Use a "Jittered Grid" approach: assign them a unique grid cell to prevent overlap, 
        // but add a random offset within that cell so it looks messy and organic.
        const availableWidth = Math.max(30, rect.width - 20);
        const availableHeight = Math.max(30, rect.height - 20);
        
        const maxCols = Math.max(1, Math.floor(availableWidth / 30));
        const maxRows = Math.max(1, Math.floor(availableHeight / 30));
        const maxSlots = maxCols * maxRows;
        
        // Find their base cell
        const slot = offsetIndex % maxSlots;
        const col = slot % maxCols;
        const row = Math.floor(slot / maxCols);
        
        const baseX = rect.left + 10 + (col * 30);
        const baseY = rect.top + 10 + (row * 30);
        
        // Add a deterministic jitter (-10px to +10px) inside their cell
        const jitterX = (Math.abs(Math.sin(offsetIndex * 12.9898) * 43758.5453) % 1) * 20 - 10;
        const jitterY = (Math.abs(Math.cos(offsetIndex * 78.233) * 43758.5453) % 1) * 20 - 10;
        
        x = baseX + jitterX;
        y = baseY + jitterY;
        return { x, y };
    }
    
    // If it's the cashier queue, start at the far RIGHT edge (next to cashier) and offset left. Wrap if too long.
    if (elementId.startsWith('cashier-queue-')) {
        let y = rect.top + 20; // Start near the top of the container to allow wrapping downwards
        
        if (offsetIndex < 0) {
            // Customer is actively ordering/paying
            x = rect.right - 10;
            y = rect.top + rect.height / 2 - 12.5; // vertically center the active person
        } else {
            // Calculate how many people fit in this specific container dynamically
            const availableWidth = rect.width - 70;
            const maxCols = Math.max(1, Math.floor(availableWidth / 30));
            
            const col = offsetIndex % maxCols; // Wrap after hitting the left edge
            const row = Math.floor(offsetIndex / maxCols);
            
            // Add extra padding (70px) so there's a visible gap behind the person ordering
            x = rect.right - 70; 
            x -= (col * 30);
            y += (row * 30); // Wrap downwards
        }
        return { x, y };
    }
    // If it's the waiting area, wrap around using dynamic grid logic
    else if (elementId === 'waiting-area') {
        const maxCols = Math.max(1, Math.floor((rect.width - 20) / 30));
        const row = Math.floor(offsetIndex / maxCols);
        const col = offsetIndex % maxCols;
        x = rect.left + 10 + (col * 30);
        y = rect.top + 10 + (row * 30);
        return { x, y };
    }
    // Otherwise standard positive offset
    else {
        x += (offsetIndex * 30);
    }
    
    return { x, y };
}

function moveCustomer(id, targetId, offsetIndex = 0) {
    if (!customers.has(id)) {
        const el = document.createElement('div');
        el.className = 'customer';
        el.innerHTML = `<span>${id.replace('Cust-', '')}</span><div class="customer__badge"></div>`;
        
        // Spawn directly at their target destination so they never appear outside the box
        const initialTarget = getTargetCoords(targetId, offsetIndex);
        
        // Set the transform inline to position it exactly at entrance BEFORE appending
        el.style.transition = 'none';
        el.style.transform = `translate(${initialTarget.x}px, ${initialTarget.y}px) scale(0)`;
        
        floatingLayer.appendChild(el);
        customers.set(id, el);
        
        // Wait for browser to paint the initial state, then enable transitions and scale up
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const currentEl = customers.get(id);
                if (currentEl) {
                    currentEl.style.transition = '';
                    currentEl.classList.add('customer--spawned');
                    currentEl.style.transform = `translate(${initialTarget.x}px, ${initialTarget.y}px) scale(1)`;
                }
            });
        });
        
        return; // Return early, as the rest is handled in requestAnimationFrame
    }
    
    // For existing customers moving between areas
    const el = customers.get(id);
    el.classList.add('customer--spawned');
    
    const target = getTargetCoords(targetId, offsetIndex);
    el.style.transform = `translate(${target.x}px, ${target.y}px) scale(1)`;
}

function updateTableStatus(tableId, status, type) {
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

function showPopUpIcon(staffElementId, iconStr) {
    const staffEl = document.getElementById(staffElementId);
    if (!staffEl) return;
    
    const popup = document.createElement('div');
    popup.innerText = iconStr;
    popup.style.position = 'absolute';
    popup.style.fontSize = '20px';
    popup.style.pointerEvents = 'none';
    popup.style.zIndex = '1000';
    
    const rect = staffEl.getBoundingClientRect();
    const fLayer = document.getElementById('floating-layer');
    if (!fLayer) return;
    
    fLayer.appendChild(popup);
    
    // Center above the staff member
    popup.style.left = (rect.left + rect.width / 2 - 10) + 'px';
    popup.style.top = (rect.top - 15) + 'px';
    
    popup.animate([
        { transform: 'translateY(0px)', opacity: 1 },
        { transform: 'translateY(-40px)', opacity: 0 }
    ], {
        duration: 1000,
        easing: 'ease-out'
    });
    
    setTimeout(() => {
        if (popup.parentNode) popup.parentNode.removeChild(popup);
    }, 1000);
}

function updateFrustrationVisuals(id) {
    const el = customers.get(id);
    if (!el) return;
    
    let level = customerFrustrationMap.get(id) || 0;
    
    if (level === 0) {
        el.classList.remove('customer--frustrated');
        const badge = el.querySelector('.customer__badge');
        if (badge) badge.innerText = '';
        return;
    }
    
    el.classList.add('customer--frustrated');
    
    const badge = el.querySelector('.customer__badge');
    if (badge) {
        if (level === 1) {
            badge.innerText = '💧';
        } else if (level === 2) {
            badge.innerText = '😤';
        } else {
            badge.innerText = '💢';
        }
    }
}

function handleEvent(data) {
    if (data.event === 'warmup_complete') {
        document.getElementById('warmup-indicator').style.display = 'none';
        totalCustomers = 0;
        servedCustomers = 0;
        lostCustomers = 0;
        totalDineIn = 0;
        totalTakeout = 0;
        document.getElementById('total-customers').innerText = totalCustomers;
        document.getElementById('served-customers').innerText = servedCustomers;
        document.getElementById('lost-customers').innerText = lostCustomers;
        document.getElementById('total-dine-in').innerText = totalDineIn;
        document.getElementById('total-takeout').innerText = totalTakeout;
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
            moveCustomer(id, 'entrance', numId);
            break;
            
        case 'balking_start':
            const bStartEl = customers.get(id);
            if (bStartEl) {
                bStartEl.classList.add('customer--frustrated');
                const badge = bStartEl.querySelector('.customer__badge');
                if (badge) badge.innerText = '🛑';
            }
            break;
            
        case 'balk_leave':
            lostCustomers++;
            const balkEl = customers.get(id);
            if (balkEl) {
                // They waited a while at the entrance, now they walk back out slowly
                balkEl.style.transform += ' translate(-200px, 50px)'; 
                balkEl.style.opacity = '0';
                setTimeout(() => {
                    if (balkEl.parentNode) balkEl.parentNode.removeChild(balkEl);
                    customers.delete(id);
                }, 1200);
            }
            break;
            
        case 'frustrated_waiting':
            let fLevel = customerFrustrationMap.get(id) || 0;
            if (fLevel < 1) fLevel = 1;
            customerFrustrationMap.set(id, fLevel);
            updateFrustrationVisuals(id);
            break;
            
        case 'patience_warning':
            let pLevel = customerFrustrationMap.get(id) || 0;
            if (pLevel < 2) pLevel = 2; // Warning is level 2
            customerFrustrationMap.set(id, pLevel);
            updateFrustrationVisuals(id);
            break;
            
        case 'prep_waiting_frustration':
            let prepLevel = customerFrustrationMap.get(id) || 0;
            prepLevel++;
            if (prepLevel > 3) prepLevel = 3; // Max out at level 3
            customerFrustrationMap.set(id, prepLevel);
            updateFrustrationVisuals(id);
            break;
            
        case 'renege_leave':
            lostCustomers++; // Count them as a lost walkout
            
            // Remove them from the queue tracking
            const cIdxToLeave = data.cashier_index;
            cashierQueueLens[cIdxToLeave] = Math.max(0, cashierQueueLens[cIdxToLeave] - 1);
            
            const leavingOffset = cashierOffsets.get(id);
            
            // Advance everyone behind them forward
            for (let [custId, cIdx] of customerCashierMap.entries()) {
                if (cIdx === cIdxToLeave && custId !== id) {
                    let currentOffset = cashierOffsets.get(custId);
                    if (currentOffset !== undefined && currentOffset > leavingOffset) {
                        let newOffset = currentOffset - 1;
                        cashierOffsets.set(custId, newOffset);
                        moveCustomer(custId, `cashier-queue-${cIdxToLeave}`, newOffset);
                    }
                }
            }
            
            // Remove from maps
            cashierOffsets.delete(id);
            customerCashierMap.delete(id);
            
            // Animate them storming out in frustration
            const renegeEl = customers.get(id);
            if (renegeEl) {
                renegeEl.classList.add('customer--frustrated');
                const badge = renegeEl.querySelector('.customer__badge');
                if (badge) {
                    badge.innerText = '💢';
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
                    renegeEl.style.transform += ' translate(-150px, 200px)';
                    renegeEl.style.opacity = '0';
                    setTimeout(() => {
                        if (renegeEl.parentNode) renegeEl.parentNode.removeChild(renegeEl);
                        customers.delete(id);
                    }, 1200);
                }, 2000);
            }
            break;
            
        case 'queue_cashier':
            const cIdx = data.cashier_index;
            customerCashierMap.set(id, cIdx);
            
            cashierQueueLens[cIdx]++;
            cashierOffsets.set(id, cashierQueueLens[cIdx] - 1);
            moveCustomer(id, `cashier-queue-${cIdx}`, cashierQueueLens[cIdx] - 1);
            break;
            
        case 'start_deciding':
            const decIdx = data.cashier_index;
            cashierQueueLens[decIdx] = Math.max(0, cashierQueueLens[decIdx] - 1);
            
            moveCustomer(id, `cashier-queue-${decIdx}`, -1);
            
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
                    timerEl.style.color = '#e94f37';
                }
                
                const interval = setInterval(() => {
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
                        moveCustomer(custId, `cashier-queue-${decIdx}`, newOffset);
                    }
                }
            }
            break;
            
        case 'start_paying':
            // Customer is paying, no physical move needed, just logical state
            break;
            
        case 'waiting_pickup':
            totalTakeout++;
            document.getElementById('total-takeout').innerText = totalTakeout;
            // Go to waiting/pickup area if tables are full, or if waiting for takeout
            pickupAreaLen++;
            pickupAreaOffsets.set(id, pickupAreaLen - 1);
            moveCustomer(id, 'pickup-area', pickupAreaLen - 1);
            
            // Customer left the cashier, reset the cashier timer
            const leftCIdxTakeout = customerCashierMap.get(id);
            if (leftCIdxTakeout !== undefined && cashierTimers[leftCIdxTakeout]) {
                clearInterval(cashierTimers[leftCIdxTakeout].interval);
                const timerEl = document.getElementById(`timer-cashier-${leftCIdxTakeout}`);
                if (timerEl) {
                    timerEl.innerText = 'Idle';
                    timerEl.style.color = '#f39c12';
                }
                showPopUpIcon(`cashier-staff-${leftCIdxTakeout}`, '💰');
            }
            break;
            
        case 'waiting_table':
            totalDineIn++;
            document.getElementById('total-dine-in').innerText = totalDineIn;
            // Go to waiting/pickup area if tables are full, or if waiting for takeout
            waitingAreaLen++;
            waitingAreaOffsets.set(id, waitingAreaLen - 1);
            moveCustomer(id, 'waiting-area', waitingAreaLen - 1);
            
            // Customer left the cashier, reset the cashier timer
            const leftCIdx = customerCashierMap.get(id);
            if (leftCIdx !== undefined && cashierTimers[leftCIdx]) {
                clearInterval(cashierTimers[leftCIdx].interval);
                const timerEl = document.getElementById(`timer-cashier-${leftCIdx}`);
                if (timerEl) {
                    timerEl.innerText = 'Idle';
                    timerEl.style.color = '#f39c12';
                }
                showPopUpIcon(`cashier-staff-${leftCIdx}`, '💰');
            }
            break;
            
        case 'seated_waiting_order':
            waitingAreaLen = Math.max(0, waitingAreaLen - 1);
            
            let tableId;
            if (data.is_reservation) {
                const currentResTablesCount = parseInt(document.getElementById('cfg-res-tables').value);
                tableId = `res-table-${Math.floor(Math.random() * currentResTablesCount) + 1}`; // fallback
                if (availableResTables.length > 0) {
                    tableId = availableResTables.shift();
                }
            } else {
                const currentTablesCount = parseInt(document.getElementById('cfg-tables').value);
                tableId = `table-${Math.floor(Math.random() * currentTablesCount) + 1}`; // fallback
                if (availableTables.length > 0) {
                    tableId = availableTables.shift();
                }
            }
            
            customerTableMap.set(id, tableId);
            
            moveCustomer(id, tableId);
            updateTableStatus(tableId, "Waiting for Order...", "waiting");
            // clear inline styles if it's a reservation table, to avoid sticking to 'Reserved' color when text is updated
            if (data.is_reservation) {
                document.getElementById(`status-${tableId}`).style.color = '';
                document.getElementById(`status-${tableId}`).style.fontWeight = '';
            }
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
                    timerEl.style.color = '#e94f37';
                }
                
                const interval = setInterval(() => {
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
            customerFrustrationMap.set(id, 0);
            updateFrustrationVisuals(id);
            // Order arrived! Time to eat.
            const tId = customerTableMap.get(id);
            if (tId) {
                updateTableStatus(tId, "Eating/Drinking", "eating");
            }
            
            const finishedBIdx = customerBaristaMap.get(id);
            if (finishedBIdx !== undefined) {
                if (baristaTimers[finishedBIdx]) clearInterval(baristaTimers[finishedBIdx].interval);
                const timerEl = document.getElementById(`timer-barista-${finishedBIdx}`);
                if (timerEl) {
                    timerEl.innerText = 'Idle';
                    timerEl.style.color = '#f39c12';
                }
                const finishedBStatus = document.getElementById(`status-barista-${finishedBIdx}`);
                if (finishedBStatus) {
                    finishedBStatus.innerText = 'Idle';
                    finishedBStatus.style.color = '#aaa';
                }
                customerBaristaMap.delete(id);
                showPopUpIcon(`barista-staff-${finishedBIdx}`, '☕');
            }
            break;
            
        case 'leave':
            servedCustomers++;
            const el = customers.get(id);
            if (el) {
                el.style.transform += ' translate(500px, 0)';
                el.style.opacity = '0';
                setTimeout(() => {
                    if (el.parentNode) el.parentNode.removeChild(el);
                    customers.delete(id);
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
                if (leftTableId.startsWith('res-table-')) {
                    updateTableStatus(leftTableId, "Reserved", "");
                    document.getElementById(`status-${leftTableId}`).style.color = '#f39c12';
                    document.getElementById(`status-${leftTableId}`).style.fontWeight = 'bold';
                    availableResTables.push(leftTableId);
                } else {
                    updateTableStatus(leftTableId, "", "");
                    availableTables.push(leftTableId);
                }
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
