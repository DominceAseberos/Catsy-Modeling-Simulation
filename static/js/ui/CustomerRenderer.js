/**
 * CustomerRenderer.js
 * Handles drawing, animating, and updating moods of the customers.
 */
export class CustomerRenderer {
    constructor(floatingLayerId) {
        this.layerId = floatingLayerId;
        this.customers = new Map();
        this.frustrationMap = new Map();
    }

    clearAll() {
        const layer = document.getElementById(this.layerId);
        if (layer) layer.innerHTML = '';
        this.customers.clear();
        this.frustrationMap.clear();
    }

    /**
     * Calculates deterministic coordinates to prevent overlapping
     */
    getTargetCoords(elementId, offsetIndex = 0) {
        const el = document.getElementById(elementId);
        if (!el) return { x: 0, y: 0 };
        const rect = el.getBoundingClientRect();
        
        let x = rect.left + rect.width / 2 - 12.5;
        let y = rect.top + rect.height / 2 - 12.5;
        
        if (elementId === 'entrance' || elementId === 'waiting-area' || elementId === 'pickup-area') {
            const cellSize = 38;
            const availableWidth = Math.max(cellSize, rect.width - 10);
            
            let startYOffset = 10;
            if (elementId === 'waiting-area' || elementId === 'pickup-area') {
                startYOffset = 25;
            }
            const availableHeight = Math.max(cellSize, rect.height - startYOffset - 10);
            
            const maxCols = Math.max(1, Math.floor(availableWidth / cellSize));
            const maxRows = Math.max(1, Math.floor(availableHeight / cellSize));
            const maxSlots = maxCols * maxRows;
            
            const slot = offsetIndex % maxSlots;
            const col = slot % maxCols;
            const row = Math.floor(slot / maxCols);
            
            const baseX = rect.left + 5 + (col * cellSize) + (cellSize / 2);
            const baseY = rect.top + startYOffset + (row * cellSize) + (cellSize / 2);
            
            const jitterX = (Math.abs(Math.sin(offsetIndex * 12.9898) * 43758.5453) % 1) * 10 - 5;
            const jitterY = (Math.abs(Math.cos(offsetIndex * 78.233) * 43758.5453) % 1) * 10 - 5;
            
            x = baseX - 12.5 + jitterX;
            y = baseY - 12.5 + jitterY;
            return { x, y };
        }
        
        if (elementId.startsWith('cashier-queue-')) {
            let y = rect.top + 20; 
            if (offsetIndex < 0) {
                x = rect.right - 40; 
                y = rect.top + rect.height / 2 - 12.5; 
            } else {
                const availableWidth = rect.width - 70;
                const maxCols = Math.max(1, Math.floor(availableWidth / 30));
                const col = offsetIndex % maxCols;
                const row = Math.floor(offsetIndex / maxCols);
                x = rect.right - 70; 
                x -= (col * 30);
                y += (row * 30); 
            }
            return { x, y };
        } else {
            x += (offsetIndex * 30);
        }
        
        return { x, y };
    }

    /**
     * Spawns or moves a customer to a new DOM target
     */
    moveCustomer(id, targetId, offsetIndex = 0) {
        let el = this.customers.get(id);
        const target = this.getTargetCoords(targetId, offsetIndex);
        
        if (!el) {
            el = document.createElement('div');
            el.className = 'customer';
            el.innerHTML = `<span>${id.replace('Cust-', '')}</span><div class="customer__badge"></div>`;
            
            el.style.transition = 'none';
            el.style.transform = `translate(${target.x}px, ${target.y}px) scale(0)`;
            
            const fLayer = document.getElementById(this.layerId);
            if (fLayer) fLayer.appendChild(el);
            this.customers.set(id, el);
            
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const currentEl = this.customers.get(id);
                    if (currentEl) {
                        currentEl.style.transition = '';
                        currentEl.classList.add('customer--spawned');
                        currentEl.style.transform = `translate(${target.x}px, ${target.y}px) scale(1)`;
                    }
                });
            });
            return;
        }
        
        el.classList.add('customer--spawned');
        el.style.transform = `translate(${target.x}px, ${target.y}px) scale(1)`;
    }

    /**
     * Increments the frustration level of a customer.
     */
    incrementFrustration(id, maxLevel = 3) {
        let level = this.frustrationMap.get(id) || 0;
        level = Math.min(level + 1, maxLevel);
        this.frustrationMap.set(id, level);
        this.updateFrustrationVisuals(id);
    }

    /**
     * Forces the frustration level directly (e.g. for balking = 4, warning = 2).
     */
    setFrustration(id, level) {
        this.frustrationMap.set(id, level);
        this.updateFrustrationVisuals(id);
    }

    /**
     * Maps numeric frustration to CSS/Emojis
     */
    updateFrustrationVisuals(id) {
        const el = this.customers.get(id);
        if (!el) return;
        
        const level = this.frustrationMap.get(id) || 0;
        const badge = el.querySelector('.customer__badge');
        
        if (level === 0) {
            el.classList.remove('customer--frustrated');
            if (badge) {
                badge.innerText = '';
                badge.style.display = 'none';
            }
            return;
        }
        
        el.classList.add('customer--frustrated');
        if (badge) {
            badge.style.display = 'flex';
            if (level === 1) badge.innerText = '⌚';
            else if (level === 2) badge.innerText = '😠';
            else if (level === 3) badge.innerText = '😡';
            else if (level >= 4) badge.innerText = '🙅'; // Balking/Reneging
        }
    }

    /**
     * Animated departure off screen
     */
    removeCustomer(id) {
        const el = this.customers.get(id);
        if (el) {
            el.style.transform += ' translate(-200px, 50px)'; 
            el.style.opacity = '0';
            setTimeout(() => {
                if (el.parentNode) el.parentNode.removeChild(el);
                this.customers.delete(id);
                this.frustrationMap.delete(id);
            }, 1200);
        }
    }
}

export const customerRenderer = new CustomerRenderer('floating-layer');
