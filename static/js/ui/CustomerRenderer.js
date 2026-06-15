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
        if (elementId.startsWith('vip-checkin-')) {
            const cashierIdx = elementId.split('-')[2];
            const deskId = `cashier-queue-${cashierIdx}`;
            const targetEl = document.getElementById(deskId);
            if (targetEl) {
                const rect = targetEl.getBoundingClientRect();
                const absoluteTop = rect.top + window.scrollY;
                const absoluteRight = rect.left + window.scrollX + rect.width;
                const x = absoluteRight - 40; 
                const y = absoluteTop + rect.height / 2 + 20; // Offset vertically from the person paying
                return { x, y };
            }
            return { x: 0, y: 0 };
        }

        const el = document.getElementById(elementId);
        if (!el) return { x: 0, y: 0 };
        const rect = el.getBoundingClientRect();
        
        const absoluteLeft = rect.left + window.scrollX;
        const absoluteTop = rect.top + window.scrollY;

        let x = absoluteLeft + rect.width / 2 - 12.5;
        let y = absoluteTop + rect.height / 2 - 12.5;
        
        const absoluteRight = absoluteLeft + rect.width;
        
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
            
            const baseX = absoluteLeft + 5 + (col * cellSize) + (cellSize / 2);
            const baseY = absoluteTop + startYOffset + (row * cellSize) + (cellSize / 2);
            
            const jitterX = (Math.abs(Math.sin(offsetIndex * 12.9898) * 43758.5453) % 1) * 10 - 5;
            const jitterY = (Math.abs(Math.cos(offsetIndex * 78.233) * 43758.5453) % 1) * 10 - 5;
            
            x = baseX - 12.5 + jitterX;
            y = baseY - 12.5 + jitterY;
            return { x, y };
        }
        

        
        if (elementId.startsWith('cashier-queue-')) {
            let y = absoluteTop + 20; 
            if (offsetIndex < 0) {
                x = absoluteRight - 40; 
                y = absoluteTop + rect.height / 2 - 12.5; 
            } else {
                const availableWidth = rect.width - 70;
                const maxCols = Math.max(1, Math.floor(availableWidth / 30));
                const col = offsetIndex % maxCols;
                const row = Math.floor(offsetIndex / maxCols);
                x = absoluteRight - 70; 
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

    markAsVIP(id) {
        const el = this.customers.get(id);
        if (el) {
            el.classList.add('customer--vip');
        }
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

    triggerVIPAnimation(id) {
        const el = this.customers.get(id);
        if (!el) return;
        
        const badge = el.querySelector('.customer__badge');
        if (badge) {
            badge.innerText = '🎫';
            badge.style.display = 'flex';
            badge.classList.add('vip-float-anim');
            
            setTimeout(() => {
                badge.classList.remove('vip-float-anim');
                // Only clear it if they aren't frustrated
                const level = this.frustrationMap.get(id) || 0;
                if (level === 0) {
                    badge.style.display = 'none';
                    badge.innerText = '';
                } else {
                    this.updateFrustrationVisuals(id); // Restore frustration badge if needed
                }
            }, 1500); // 1.5s animation
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
